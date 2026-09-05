import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
import { Image } from "expo-image";
import { signedUrlsFor } from "@/lib/upload";
import { readTrailDetail, writeTrailDetail, cacheAgeLabel } from "@/lib/offlineCache";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import {
  DistanceUnit,
  formatDistance,
  formatElevation,
  openMeteoUnitParams,
  temperatureUnitLabel,
  windSpeedUnitLabel,
} from "@/lib/units";
import { getDiffStyle } from "@/lib/format";
import { fetchRatingStats, formatRatingDisplay, TrailRatingStats } from "@/lib/ratings";
import TrailMap from "@/components/TrailMap";
import { showActionSheet } from "@/lib/actionSheet";
import { shareEntity, sharingAvailable } from "@/lib/share";
import { buildTrailTips } from "@/lib/trailTips";
import { summariseConditions, CONDITION_SUMMARY_CAVEAT, type SummarisedCondition } from "@/lib/conditionSummary";


type Trail = {
  id: string; name: string; location: string; region: string;
  distance_mi: number; elevation_ft: number; difficulty: string;
  rating: number; tags: string[]; description: string;
  lat: number | null; lng: number | null;
  attribution: string | null; license: string | null; source_url: string | null;
};

type Weather = {
  temp: number; feelsLike: number; condition: string;
  windSpeed: number; humidity: number; icon: string;
};


function getWeatherIcon(wmo: number): string {
  if (wmo === 0) return "☀️";
  if (wmo <= 3) return "🌤️";
  if (wmo <= 48) return "☁️";
  if (wmo <= 67) return "🌧️";
  if (wmo <= 77) return "❄️";
  if (wmo <= 82) return "🌦️";
  return "⛈️";
}

function getWeatherDesc(wmo: number): string {
  if (wmo === 0) return "Clear sky";
  if (wmo <= 3) return "Partly cloudy";
  if (wmo <= 48) return "Overcast / Fog";
  if (wmo <= 67) return "Rain";
  if (wmo <= 77) return "Snow";
  if (wmo <= 82) return "Rain showers";
  return "Thunderstorm";
}

export default function TrailDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session, profile } = useAuth();
  const distanceUnit = profile?.distance_unit ?? "imperial";

  const [trail, setTrail] = useState<Trail | null>(null);
  const [loading, setLoading] = useState(true);
  const [wantToHike, setWantToHike] = useState(false);
  const [logCount, setLogCount] = useState(0);
  const [actionLoading, setActionLoading] = useState(false);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [ratingStats, setRatingStats] = useState<TrailRatingStats | undefined>(undefined);
  const [ratingStatsFailed, setRatingStatsFailed] = useState(false);
  const [conditionSummary, setConditionSummary] = useState<SummarisedCondition[]>([]);
  const [highlights, setHighlights] = useState<string[]>([]);
  // Non-null means the screen is showing REMEMBERED data, not live. Drives the
  // banner -- cached content is never presented as current.
  const [cachedAt, setCachedAt] = useState<number | null>(null);

  /**
   * Photos from this trail's hikes, best first.
   *
   * "Best" has no direct signal to read: hike_photos is only
   * (id, hike_id, user_id, storage_path, created_at) -- no likes, no views,
   * nothing about the photo itself. So the ranking is a PROXY: the parent
   * hike's overall_score, then recency. It ranks the experience, not the
   * photograph, and that limitation is real rather than hidden.
   *
   * Ordering is done client-side. PostgREST cannot ORDER BY an embedded
   * parent's column, and the alternative -- a view or RPC -- is a migration
   * for a list this short.
   *
   * Photos live in a PRIVATE bucket, so paths must be signed before render;
   * hike_photos SELECT is gated by can_view_user_content, so a private
   * account's photos are filtered out by RLS before they ever arrive. Both
   * are why this cannot just interpolate a public URL.
   */
  const fetchHighlights = async (trailId: string) => {
    const { data, error } = await supabase
      .from("hike_photos")
      .select("storage_path, created_at, hikes!inner(trail_id, overall_score)")
      .eq("hikes.trail_id", trailId)
      .limit(30);
    if (error) {
      // Silent by design: a trail with no readable photos is the normal case,
      // and an error banner over a decorative carousel would be noise.
      console.warn("trail-detail: highlights fetch failed", error.message);
      return;
    }
    type Row = { storage_path: string; created_at: string | null; hikes: { overall_score: number | null } | null };
    const rows = (data ?? []) as unknown as Row[];
    const ranked = rows
      .filter(r => !!r.storage_path)
      .sort((a, b) => {
        // Unrated sorts last, and `0` COUNTS AS UNRATED -- this schema uses 0
        // as "no rating given", not as a rating of zero. leaderboard_totals
        // makes the same distinction with `FILTER (WHERE overall_score > 0)`,
        // and the one photo in the database today sits on a 0-score hike, so
        // reading it as a real score would rank it below every future 1-star.
        const score = (v: number | null | undefined) => (v == null || v <= 0 ? -1 : v);
        const av = score(a.hikes?.overall_score);
        const bv = score(b.hikes?.overall_score);
        if (bv !== av) return bv - av;
        return (b.created_at ?? "").localeCompare(a.created_at ?? "");
      })
      .slice(0, 10);
    if (ranked.length === 0) return;
    const signed = await signedUrlsFor(ranked.map(r => r.storage_path));
    // Drop anything that failed to sign rather than rendering a broken tile.
    setHighlights(ranked.map(r => signed[r.storage_path]).filter(Boolean));
  };

  useEffect(() => {
    const fetchTrail = async () => {
      // The error was previously discarded, which is why losing signal produced
      // "Trail not found" -- a query that never reached the server rendered
      // identically to a trail that does not exist.
      const { data, error } = await supabase.from("trails").select("*").eq("id", id).single();

      if (!data) {
        // PGRST116 is PostgREST's "no rows returned" for .single(). That is a
        // real answer from a server we reached: this trail does not exist, and
        // showing a remembered copy of it would keep a deleted trail alive on
        // the device forever, its age label just counting upwards.
        //
        // Every other failure -- transport error, 5xx, expired auth -- means we
        // got no answer at all. There the device's own copy beats a dead end,
        // which is what "Trail not found" used to be for anyone who lost signal.
        const trailIsGone = error?.code === "PGRST116";
        const cached = trailIsGone ? null : await readTrailDetail<typeof data>(String(id));
        if (cached) {
          setTrail(cached.trail as never);
          setLogCount(cached.logCount);
          setConditionSummary(cached.conditionSummary as never);
          setCachedAt(cached.cachedAt);
          // The live aggregate could not be fetched, so say so rather than
          // asserting a fact we do not have. formatRatingDisplay's failed
          // branch falls back to the catalogue `rating`, which IS cached --
          // without this the screen rendered "No ratings yet" for a trail
          // rated 4.6, which is not a missing value, it is a wrong one.
          setRatingStatsFailed(true);
          const c = cached.trail as { lat?: number; lng?: number } | null;
          // Coordinates are restored so the map still has a centre, but weather
          // is NOT fetched from cache -- see lib/offlineCache.ts. A remembered
          // "right now" reading would be a false claim.
          if (c?.lat && c?.lng) setCoords({ lat: c.lat, lng: c.lng });
        } else if (error) {
          console.warn("trail-detail: load failed and nothing cached", error.message);
        }
        setLoading(false);
        return;
      }

      if (data) {
        setCachedAt(null);
        setTrail(data);
        const { count } = await supabase.from("hikes").select("*", { count: "exact", head: true }).eq("trail_id", data.id);
        setLogCount(count || 0);
        void fetchHighlights(data.id);
        if (data.lat && data.lng) setCoords({ lat: data.lat, lng: data.lng });
        // Tolerant of the view being absent: trail-conditions-summary.sql
        // has not been applied yet, so this 404s until it is. A missing
        // aggregate is not an error worth showing anybody — the section
        // simply does not render.
        const { data: condRows } = await supabase
          .from("trail_conditions_summary")
          .select("tag, prevalence")
          .eq("trail_id", data.id);
        // Summarised once and reused: the screen and the cache must not be able
        // to disagree about what the conditions were.
        const conditions = summariseConditions(condRows ?? []);
        setConditionSummary(conditions);
        const { map, failed } = await fetchRatingStats([data.id]);
        setRatingStats(map.get(data.id));
        setRatingStatsFailed(failed);

        // Written AFTER a fully successful load, so a partial fetch cannot
        // poison the cache with a half-populated trail. Fire-and-forget and
        // non-throwing: the user is already looking at a working screen.
        void writeTrailDetail(String(id), {
          trail: data,
          logCount: count || 0,
          conditionSummary: conditions as never,
        });
      }
      if (session) {
        const { data: wth } = await supabase.from("want_to_hike").select("trail_id").eq("user_id", session.user.id).eq("trail_id", id).single();
        setWantToHike(!!wth);
      }
      setLoading(false);
    };
    fetchTrail();
  }, [id]);

  // Open-Meteo converts server-side, so the request carries the viewer's unit
  // preference rather than the response being converted here. This used to be
  // pinned to fahrenheit/mph, so a metric user saw km everywhere else in the
  // app and Fahrenheit here.
  useEffect(() => {
    if (coords) fetchWeather(coords.lat, coords.lng, distanceUnit);
  }, [coords, distanceUnit]);

  const fetchWeather = async (lat: number, lng: number, unit: DistanceUnit) => {
    setWeatherLoading(true);
    try {
      const units = openMeteoUnitParams(unit);
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&temperature_unit=${units.temperature}&wind_speed_unit=${units.windSpeed}`);
      const data = await res.json();
      const c = data.current;
      setWeather({
        temp: Math.round(c.temperature_2m),
        feelsLike: Math.round(c.apparent_temperature),
        condition: getWeatherDesc(c.weather_code),
        windSpeed: Math.round(c.wind_speed_10m),
        humidity: c.relative_humidity_2m,
        icon: getWeatherIcon(c.weather_code),
      });
    } catch (_) {}
    setWeatherLoading(false);
  };

  const toggleWantToHike = async () => {
    if (!session || !trail) return;
    setActionLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (wantToHike) {
      await supabase.from("want_to_hike").delete().eq("user_id", session.user.id).eq("trail_id", trail.id);
      setWantToHike(false);
    } else {
      await supabase.from("want_to_hike").insert({ user_id: session.user.id, trail_id: trail.id });
      setWantToHike(true);
    }
    setActionLoading(false);
  };

  const handleLogIt = () => {
    if (!trail) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
    setTimeout(() => router.push({ pathname: "/(tabs)/log", params: { prefillName: trail.name, prefillLocation: trail.location } }), 350);
  };

  if (loading) return <View style={[styles.container, styles.center]}><ActivityIndicator color={Colors.accent} size="large" /></View>;
  if (!trail) return <View style={[styles.container, styles.center]}><Text style={styles.emptyText}>Trail not found</Text></View>;

  const ds = getDiffStyle(trail.difficulty);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}>
          <Feather name="chevron-left" size={28} color={Colors.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>Trail Details</Text>
        {/* This screen had no overflow menu. The spacer stays when sharing is
            unavailable so the title keeps its centred position either way. */}
        {sharingAvailable && trail ? (
          <Pressable
            onPress={() =>
              showActionSheet(trail.name || "Trail", [
                {
                  label: "Share trail",
                  onPress: () => { shareEntity("trail", trail.id, `${trail.name || "A trail"} on Summit`); },
                },
              ])
            }
            style={({ pressed }) => [{ width: 36, alignItems: "center" }, { opacity: pressed ? 0.6 : 1 }]}
          >
            <Feather name="more-vertical" size={20} color={Colors.text3} />
          </Pressable>
        ) : (
          <View style={{ width: 36 }} />
        )}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* Cached data is LABELLED, never passed off as live. The age is shown
            rather than a bare "offline" because how stale matters: a trail
            remembered ten minutes ago is worth trusting on distance and water
            notes, one from last month is worth a second thought. Photos and
            weather are absent here by design, not by failure -- signed photo
            URLs expire in an hour and a remembered forecast would be a false
            claim about now. */}
        {cachedAt !== null && (
          <View style={styles.offlineBanner}>
            <Feather name="wifi-off" size={13} color={Colors.amber2} />
            <Text style={styles.offlineBannerText}>
              Showing saved details from {cacheAgeLabel(cachedAt)} — live weather and photos need a connection.
            </Text>
          </View>
        )}
        <View style={styles.hero}>
          {/* Omitted rather than rendered neutral: an unlabelled difficulty pill
              says less than no pill, and this used to claim "easy". */}
          {ds && (
            <View style={[styles.diffBadgeLarge, { backgroundColor: ds.bg, borderColor: ds.border }]}>
              <Text style={[styles.diffTextLarge, { color: ds.color }]}>{trail.difficulty}</Text>
            </View>
          )}
          <Text style={styles.trailName}>{trail.name}</Text>
          <View style={styles.locationRow}>
            <Feather name="map-pin" size={14} color={Colors.text3} />
            <Text style={styles.location}>{trail.location}</Text>
          </View>
          <View style={styles.ratingRow}>
            <Feather name="star" size={16} color={Colors.amber2} />
            <Text style={styles.ratingText}>
              {formatRatingDisplay(ratingStats, trail.rating, ratingStatsFailed)}
            </Text>
            <Text style={styles.logCountText}>· {logCount} log{logCount !== 1 ? "s" : ""} on Summit</Text>
          </View>
        </View>

        {/* Stats */}
        <View style={styles.statsGrid}>
          {/* "Length" here and on the Discover card, matching each other: a
              trail has both a length and a distance from the viewer, and the
              label has to say which. Hike screens keep "Distance", where it
              means distance covered and nothing competes with it. */}
          <View style={styles.statBox}><Feather name="navigation" size={18} color={Colors.accent} /><Text style={styles.statVal}>{formatDistance(trail.distance_mi, distanceUnit)}</Text><Text style={styles.statLbl}>Length</Text></View>
          <View style={[styles.statBox, styles.statBoxBorder]}><Feather name="trending-up" size={18} color={Colors.accent} /><Text style={styles.statVal}>{formatElevation(trail.elevation_ft, distanceUnit)}</Text><Text style={styles.statLbl}>Elevation</Text></View>
          <View style={styles.statBox}><Feather name="activity" size={18} color={ds?.color ?? Colors.text3} /><Text style={[styles.statVal, { color: ds?.color ?? Colors.text3 }]}>{trail.difficulty || "Unknown"}</Text><Text style={styles.statLbl}>Difficulty</Text></View>
        </View>

        {/* Weather */}
        {/* Renders only when there is something to show. An empty "Photos"
            heading on a trail nobody has photographed is a worse answer than
            no section at all -- and with one photo in the whole database, the
            empty case is the overwhelmingly common one. */}
        {highlights.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Photos from this trail</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.highlightRow}>
              {highlights.map(uri => (
                <Image key={uri} source={{ uri }} style={styles.highlightPhoto} contentFit="cover" transition={150} />
              ))}
            </ScrollView>
          </View>
        )}

        {(weather || weatherLoading) && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Current conditions</Text>
            {weatherLoading ? (
              <View style={styles.weatherLoading}><ActivityIndicator color={Colors.accent} size="small" /></View>
            ) : weather && (
              <View style={styles.weatherCard}>
                <Text style={styles.weatherIcon}>{weather.icon}</Text>
                <View style={styles.weatherInfo}>
                  <Text style={styles.weatherTemp}>{weather.temp}{temperatureUnitLabel(distanceUnit)}</Text>
                  <Text style={styles.weatherCondition}>{weather.condition}</Text>
                  <Text style={styles.weatherSub}>Feels like {weather.feelsLike}{temperatureUnitLabel(distanceUnit)}</Text>
                </View>
                <View style={styles.weatherStats}>
                  <View style={styles.weatherStat}><Feather name="wind" size={13} color={Colors.text3} /><Text style={styles.weatherStatText}>{weather.windSpeed} {windSpeedUnitLabel(distanceUnit)}</Text></View>
                  <View style={styles.weatherStat}><Feather name="droplet" size={13} color={Colors.text3} /><Text style={styles.weatherStatText}>{weather.humidity}%</Text></View>
                </View>
              </View>
            )}
            {/* REQUIRED ATTRIBUTION, not decoration. Open-Meteo serves this data
                under CC BY 4.0, whose licence page states: "You must include a
                link next to any location Open-Meteo data are displayed", with
                the example markup
                <a href="https://open-meteo.com/">Weather data by Open-Meteo.com</a>.
                https://open-meteo.com/en/licence
                Two consequences for where this sits:
                  - It is a LINK, not plain text. The requirement is explicit
                    about that, so a styled label alone would not satisfy it.
                  - It renders NEXT TO the data, inside this card's section --
                    not in Settings or an About screen. "Next to any location
                    the data are displayed" is the wording, and trail-detail is
                    the only place weather is displayed in this app.
                Gated on `weather` rather than the section, so it never appears
                beside a spinner that is not yet showing anyone's data.

                THERE ARE TWO OPEN-METEO DISPLAY SITES ON THIS SCREEN, and
                EACH CARRIES ITS OWN CREDIT. The second is the weather line in
                "Good to know", which renders its own link keyed off
                TrailTip.source === "open-meteo".

                An earlier revision argued one credit covered both, on the
                grounds that both are gated on the same `weather` being
                non-null, so the data could never appear without a credit
                somewhere on the page. That reasoning was wrong. The licence
                asks for a link "next to any location Open-Meteo data are
                displayed" -- that is visual adjacency at each location, not a
                guarantee that a credit exists somewhere in the same scroll
                view. Someone reading the tip 800px below this card has no
                credit near their eyes. Shared gating proves the credit EXISTS;
                it does not make it ADJACENT.

                If the WeatherKit migration lands and Open-Meteo is removed,
                this goes with it -- and Apple's own attribution replaces it.
                Removing Open-Meteo means removing BOTH display sites. */}
            {weather && (
              <Pressable
                onPress={() => Linking.openURL("https://open-meteo.com/")}
                hitSlop={8}
                accessibilityRole="link"
                accessibilityLabel="Weather data by Open-Meteo.com. Opens open-meteo.com"
              >
                <Text style={styles.weatherCredit}>Weather data by Open-Meteo.com</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Map */}
        {trail.lat && trail.lng && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Trail location</Text>
            <TrailMap lat={trail.lat} lng={trail.lng} name={trail.name} style={{ marginHorizontal: 16, marginBottom: 4 }} />
          </View>
        )}

        {trail.description && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>About this trail</Text>
            <Text style={styles.description}>{trail.description}</Text>
          </View>
        )}

        {/* Source credit for catalogue data that carries an attribution
            requirement (e.g. the USGS-ingested trails). */}
        {(trail.attribution || trail.license) && (
          <View style={styles.section}>
            <Text style={styles.sourceCredit}>
              {trail.attribution || "Trail data"}
              {trail.license ? ` · ${trail.license}` : ""}
            </Text>
            {trail.source_url ? (
              <Pressable onPress={() => Linking.openURL(trail.source_url!)}>
                <Text style={styles.sourceLink}>View source</Text>
              </Pressable>
            ) : null}
          </View>
        )}

        {trail.tags && trail.tags.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Features</Text>
            <View style={styles.tagsWrap}>
              {trail.tags.map(tag => <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>)}
            </View>
          </View>
        )}

        {conditionSummary.length > 0 && (
          <View style={styles.section}>
            {/* Above "Good to know" deliberately: those tips are derived
                from the trail's own numbers, these are what people actually
                found when they went. Observation outranks inference. */}
            <Text style={styles.sectionTitle}>Recent conditions</Text>
            {conditionSummary.map(c => (
              <View key={c.key} style={styles.tipRow}>
                <Feather
                  name={c.reassuring ? "check-circle" : "alert-triangle"}
                  size={15}
                  color={c.reassuring ? Colors.green : Colors.amber}
                />
                <Text style={styles.tipText}>{c.text}</Text>
              </View>
            ))}
            <Text style={styles.conditionCaveat}>{CONDITION_SUMMARY_CAVEAT}</Text>
          </View>
        )}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Good to know</Text>
          {/* Derived per trail from distance, elevation, tags and the live
              weather above. These were three identical literals on all 225
              trails before. */}
          {buildTrailTips(trail, distanceUnit, weather ? { temp: weather.temp, condition: weather.condition } : null).map(tip => (
            <View key={tip.text}>
              <View style={styles.tipRow}>
                <Feather name={tip.icon} size={15} color={Colors.text3} />
                <Text style={styles.tipText}>{tip.text}</Text>
              </View>
              {/* Second attribution site. The weather tip above IS Open-Meteo
                  data, and the licence asks for a link "next to any location
                  Open-Meteo data are displayed" -- adjacency at each location,
                  which the credit under the weather card 800px up does not
                  provide for someone reading this line. Keyed off tip.source
                  rather than the tip's index, so MAX_TIPS truncation or a
                  reorder cannot detach the credit from the data. */}
              {tip.source === "open-meteo" && (
                <Pressable
                  onPress={() => Linking.openURL("https://open-meteo.com/")}
                  hitSlop={8}
                  accessibilityRole="link"
                  accessibilityLabel="Weather data by Open-Meteo.com. Opens open-meteo.com"
                >
                  <Text style={styles.tipCredit}>Weather data by Open-Meteo.com</Text>
                </Pressable>
              )}
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable onPress={toggleWantToHike} disabled={actionLoading} style={({ pressed }) => [styles.wantBtn, wantToHike && styles.wantBtnActive, { opacity: pressed || actionLoading ? 0.7 : 1 }]}>
          <View style={[styles.bookmarkIcon, wantToHike && styles.bookmarkIconActive]}>
            <Feather name="bookmark" size={15} color={wantToHike ? "#fff" : Colors.text3} />
          </View>
          <Text style={[styles.wantBtnText, wantToHike && styles.wantBtnTextActive]}>{wantToHike ? "Saved" : "Want to hike"}</Text>
        </Pressable>
        <Pressable onPress={handleLogIt} style={({ pressed }) => [styles.logBtn, { opacity: pressed ? 0.85 : 1 }]}>
          <Feather name="check-circle" size={18} color="#fff" />
          <Text style={styles.logBtnText}>I've hiked this</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  center: { alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  backBtn: { padding: 2, marginLeft: -6 },
  sourceCredit: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.text3, lineHeight: 16 },
  // Deliberately quieter than weatherCredit: this one sits inline under a tip
  // rather than closing out a section, and only has to satisfy "next to".
  tipCredit: { fontFamily: "Inter_400Regular", fontSize: 10.5, color: Colors.accent, marginLeft: 23, marginTop: 3, marginBottom: 10 },
  offlineBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    marginHorizontal: 16, marginTop: 12, padding: 12,
    borderRadius: 12, backgroundColor: Colors.bg3,
    borderWidth: 1, borderColor: Colors.border,
  },
  offlineBannerText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12.5, color: Colors.text2, lineHeight: 18 },
  weatherCredit: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.accent, marginTop: 8, marginLeft: 4 },
  sourceLink: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.accent, marginTop: 4 },
  headerTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text, flex: 1, textAlign: "center" },
  hero: { marginHorizontal: 16, marginBottom: 4, backgroundColor: Colors.bg3, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, padding: 20 },
  diffBadgeLarge: { alignSelf: "flex-start", paddingVertical: 5, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1.5, marginBottom: 12 },
  diffTextLarge: { fontSize: 13, fontFamily: "Inter_600SemiBold", letterSpacing: 0.3 },
  trailName: { fontFamily: "Inter_700Bold", fontSize: 24, color: Colors.text, letterSpacing: -0.5, marginBottom: 8, lineHeight: 30 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 8 },
  location: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text3 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  ratingText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.amber2 },
  logCountText: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text3 },
  statsGrid: { flexDirection: "row", marginHorizontal: 16, marginVertical: 12, backgroundColor: Colors.bg3, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, overflow: "hidden" },
  statBox: { flex: 1, alignItems: "center", paddingVertical: 16, gap: 6 },
  statBoxBorder: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: Colors.border },
  statVal: { fontFamily: "Inter_700Bold", fontSize: 15, color: Colors.text },
  statLbl: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.text3, textTransform: "uppercase", letterSpacing: 0.5 },
  highlightRow: { gap: 10, paddingRight: 20 },
  highlightPhoto: { width: 190, height: 140, borderRadius: 12, backgroundColor: Colors.bg3 },
  section: { paddingHorizontal: 16, marginBottom: 20 },
  sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text, marginBottom: 10 },
  weatherLoading: { padding: 20, alignItems: "center" },
  weatherCard: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.bg3, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, padding: 16, gap: 12 },
  weatherIcon: { fontSize: 36 },
  weatherInfo: { flex: 1 },
  weatherTemp: { fontFamily: "Inter_700Bold", fontSize: 28, color: Colors.text },
  weatherCondition: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.text2 },
  weatherSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text3, marginTop: 2 },
  weatherStats: { gap: 8 },
  weatherStat: { flexDirection: "row", alignItems: "center", gap: 5 },
  weatherStatText: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text3 },
  description: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text2, lineHeight: 22 },
  tagsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { paddingVertical: 6, paddingHorizontal: 14, borderRadius: 20, backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2 },
  tagText: { fontSize: 13, color: Colors.text2, fontFamily: "Inter_500Medium" },
  tipRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
  tipText: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text2, flex: 1 },
  conditionCaveat: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.text3, marginTop: 6, lineHeight: 15 },
  actionBar: { position: "absolute", bottom: 0, left: 0, right: 0, flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: Colors.bg2, borderTopWidth: 1, borderTopColor: Colors.border },
  wantBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border2, backgroundColor: Colors.bg3 },
  wantBtnActive: { borderColor: Colors.accent, backgroundColor: "rgba(141,207,122,0.1)" },
  bookmarkIcon: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: Colors.surface },
  bookmarkIconActive: { backgroundColor: Colors.accent },
  wantBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text3 },
  wantBtnTextActive: { color: Colors.accent },
  logBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: Colors.green2 },
  logBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  emptyText: { fontFamily: "Inter_500Medium", fontSize: 15, color: Colors.text3 },
});

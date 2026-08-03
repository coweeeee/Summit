import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Haptics from "expo-haptics";
import React, { useEffect, useState } from "react";
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
import { fetchRatingStats, formatRatingDisplay, TrailRatingStats } from "@/lib/ratings";
import TrailMap from "@/components/TrailMap";
import { showActionSheet } from "@/lib/actionSheet";
import { shareEntity, sharingAvailable } from "@/lib/share";
import { buildTrailTips } from "@/lib/trailTips";


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

function getDiffStyle(diff: string) {
  switch (diff?.toLowerCase()) {
    case "easy":   return { bg: "rgba(109,184,122,0.2)", color: Colors.green,  border: "rgba(109,184,122,0.5)" };
    case "moderate": return { bg: "rgba(212,148,58,0.2)", color: Colors.amber,  border: "rgba(212,148,58,0.5)" };
    case "hard":   return { bg: "rgba(196,96,96,0.2)",   color: Colors.red,    border: "rgba(196,96,96,0.5)" };
    case "expert": return { bg: "rgba(160,80,200,0.2)",  color: "#a855d4",     border: "rgba(160,80,200,0.5)" };
    default:       return { bg: "rgba(109,184,122,0.2)", color: Colors.green,  border: "rgba(109,184,122,0.5)" };
  }
}

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

  useEffect(() => {
    const fetchTrail = async () => {
      const { data } = await supabase.from("trails").select("*").eq("id", id).single();
      if (data) {
        setTrail(data);
        const { count } = await supabase.from("hikes").select("*", { count: "exact", head: true }).eq("trail_id", data.id);
        setLogCount(count || 0);
        if (data.lat && data.lng) setCoords({ lat: data.lat, lng: data.lng });
        const { map, failed } = await fetchRatingStats([data.id]);
        setRatingStats(map.get(data.id));
        setRatingStatsFailed(failed);
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
        <View style={styles.hero}>
          <View style={[styles.diffBadgeLarge, { backgroundColor: ds.bg, borderColor: ds.border }]}>
            <Text style={[styles.diffTextLarge, { color: ds.color }]}>{trail.difficulty}</Text>
          </View>
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
          <View style={styles.statBox}><Feather name="navigation" size={18} color={Colors.accent} /><Text style={styles.statVal}>{formatDistance(trail.distance_mi, distanceUnit)}</Text><Text style={styles.statLbl}>Distance</Text></View>
          <View style={[styles.statBox, styles.statBoxBorder]}><Feather name="trending-up" size={18} color={Colors.accent} /><Text style={styles.statVal}>{formatElevation(trail.elevation_ft, distanceUnit)}</Text><Text style={styles.statLbl}>Elevation</Text></View>
          <View style={styles.statBox}><Feather name="activity" size={18} color={ds.color} /><Text style={[styles.statVal, { color: ds.color }]}>{trail.difficulty}</Text><Text style={styles.statLbl}>Difficulty</Text></View>
        </View>

        {/* Weather */}
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Good to know</Text>
          {/* Derived per trail from distance, elevation, tags and the live
              weather above. These were three identical literals on all 225
              trails before. */}
          {buildTrailTips(trail, distanceUnit, weather ? { temp: weather.temp, condition: weather.condition } : null).map(tip => (
            <View key={tip.text} style={styles.tipRow}>
              <Feather name={tip.icon} size={15} color={Colors.text3} />
              <Text style={styles.tipText}>{tip.text}</Text>
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

import { Feather } from "@expo/vector-icons";
  import { Image } from "expo-image";
  import { useRouter } from "expo-router";
  import React, { useCallback, useEffect, useRef, useState } from "react";
  import {
    ActivityIndicator,
    FlatList,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
  } from "react-native";
  import { useSafeAreaInsets } from "react-native-safe-area-context";
  import Colors from "@/constants/colors";
  import { supabase } from "@/lib/supabase";
  import { useAuth } from "@/context/AuthContext";
  import { sendPushNotification } from "@/lib/notifications";
  import { formatDistance, formatElevation } from "@/lib/units";
  import { ANONYMOUS_LABEL, displayName, getDiffColor, getInitials, timeAgo } from "@/lib/format";
  import ReportModal, { ReportTarget } from "@/components/ReportModal";
  import { showActionSheet } from "@/lib/actionSheet";
  import { shareEntity, sharingAvailable } from "@/lib/share";

  const PAGE_SIZE = 20;
  type FeedHike = {
    id: string; trail_name: string; location: string; distance_mi: number;
    elevation_ft: number; duration_hr: number | null; difficulty: string;
    overall_score: number; notes: string; date: string; user_id: string;
    trail_id: string | null; dim_ratings: { name: string; score: number }[];
    userName?: string; photos?: string[]; commentCount?: number;
  };

  const AVATAR_COLORS = ["#2a3d2a", "#2d2a3d", "#3d2a2a", "#2a3340", "#3d3020"];

  export default function FeedScreen() {
    const { session, profile } = useAuth();
    const distanceUnit = profile?.distance_unit ?? "imperial";
    const insets = useSafeAreaInsets();
    const topPad = Platform.OS === "web" ? 67 : insets.top;
    const router = useRouter();

    const [hikes, setHikes] = useState<FeedHike[]>([]);
    const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
    const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
    const [trailBookmarkIds, setTrailBookmarkIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const offsetRef = useRef(0);

    const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
    const [toast, setToast] = useState("");

    const showToast = (msg: string) => {
      setToast(msg);
      setTimeout(() => setToast(""), 3500);
    };

    const fetchPage = async (offset: number): Promise<FeedHike[]> => {
      // The feed is other people's hikes. Your own are on your profile, and
      // seeing them here just crowded out the social content. RLS already
      // limits this to hikes you're allowed to see; this narrows it further.
      let query = supabase
        .from("hikes").select("*, dim_ratings(*)");
      if (session?.user.id) query = query.neq("user_id", session.user.id);

      const { data: hikesData, error } = await query
        .order("date", { ascending: false })
        // Tiebreaker: two hikes sharing a date have no stable relative order,
        // so without this the same row can appear on consecutive pages.
        .order("id", { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error || !hikesData || hikesData.length === 0) { setHasMore(false); return []; }
      const userIds = [...new Set(hikesData.map((h: any) => h.user_id))];
      const hikeIds = hikesData.map((h: any) => h.id);
      const [profilesRes, photosRes, commentsRes, likesRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, username").in("id", userIds),
        supabase.from("hike_photos").select("hike_id, photo_url").in("hike_id", hikeIds),
        supabase.from("comments").select("hike_id").in("hike_id", hikeIds),
        supabase.from("likes").select("hike_id").in("hike_id", hikeIds),
      ]);
      const profileMap: Record<string, string> = {};
      if (profilesRes.data) profilesRes.data.forEach((p: any) => { profileMap[p.id] = displayName(p); });
      const photoMap: Record<string, string[]> = {};
      if (photosRes.data) photosRes.data.forEach((p: any) => {
        if (!photoMap[p.hike_id]) photoMap[p.hike_id] = [];
        photoMap[p.hike_id].push(p.photo_url);
      });
      const commentMap: Record<string, number> = {};
      if (commentsRes.data) commentsRes.data.forEach((c: any) => { commentMap[c.hike_id] = (commentMap[c.hike_id] || 0) + 1; });
      const counts: Record<string, number> = {};
      if (likesRes.data) likesRes.data.forEach((l: any) => { counts[l.hike_id] = (counts[l.hike_id] || 0) + 1; });
      setLikeCounts(prev => ({ ...prev, ...counts }));
      setHasMore(hikesData.length === PAGE_SIZE);
      return hikesData.map((h: any) => ({
        ...h, userName: profileMap[h.user_id] || ANONYMOUS_LABEL,
        photos: photoMap[h.id] || [], commentCount: commentMap[h.id] || 0,
      }));
    };

    const fetchLikes = async () => {
      if (!session) return;
      const { data } = await supabase.from("likes").select("hike_id").eq("user_id", session.user.id);
      if (data) setLikedIds(new Set(data.map((l: any) => l.hike_id)));
    };

    const fetchTrailBookmarks = async () => {
      if (!session) return;
      const { data } = await supabase.from("want_to_hike").select("trail_id").eq("user_id", session.user.id);
      if (data) setTrailBookmarkIds(new Set(data.map((d: any) => d.trail_id)));
    };

    const load = async () => {
      setLoading(true);
      offsetRef.current = 0;
      const [page] = await Promise.all([fetchPage(0), fetchLikes(), fetchTrailBookmarks()]);
      setHikes(page);
      offsetRef.current = page.length;
      setLoading(false);
    };

    const loadMore = async () => {
      if (loadingMore || !hasMore) return;
      setLoadingMore(true);
      const page = await fetchPage(offsetRef.current);
      if (page.length > 0) {
        // Same guard as Discover: a hike logged between page fetches shifts the
        // offsets and can re-serve a row the list already holds.
        setHikes(prev => {
          const seen = new Set(prev.map(h => h.id));
          return [...prev, ...page.filter(h => !seen.has(h.id))];
        });
        offsetRef.current += page.length;
      }
      setLoadingMore(false);
    };

    const onRefresh = useCallback(async () => {
      setRefreshing(true);
      offsetRef.current = 0;
      setHasMore(true);
      const [page] = await Promise.all([fetchPage(0), fetchLikes(), fetchTrailBookmarks()]);
      setHikes(page);
      offsetRef.current = page.length;
      setRefreshing(false);
    }, [session]);

    // Keyed on the user id, not just mount. The feed excludes your own hikes,
    // and on a cold start this effect ran before the session was restored from
    // storage -- so the filter was skipped and the feed showed everyone's
    // hikes, yours included, until something else happened to refetch.
    //
    // Depends on session?.user.id rather than session: Supabase returns a new
    // session object on every token refresh, which would otherwise reload the
    // feed roughly every hour for no reason.
    useEffect(() => { load(); }, [session?.user.id]);

    const toggleLike = async (e: any, hikeId: string) => {
      e.stopPropagation?.();
      if (!session) return;
      const isLiked = likedIds.has(hikeId);
      if (isLiked) {
        await supabase.from("likes").delete().eq("user_id", session.user.id).eq("hike_id", hikeId);
        setLikedIds(prev => { const n = new Set(prev); n.delete(hikeId); return n; });
        setLikeCounts(prev => ({ ...prev, [hikeId]: Math.max((prev[hikeId] || 1) - 1, 0) }));
      } else {
        await supabase.from("likes").insert({ user_id: session.user.id, hike_id: hikeId });
        setLikedIds(prev => new Set([...prev, hikeId]));
        setLikeCounts(prev => ({ ...prev, [hikeId]: (prev[hikeId] || 0) + 1 }));
        const hike = hikes.find(h => h.id === hikeId);
        if (hike && hike.user_id !== session.user.id) {
          sendPushNotification({
            targetUserId: hike.user_id,
            type: "like",
            title: "New like",
            body: `${displayName(profile)} liked your hike on ${hike.trail_name || "a trail"}`,
            data: { hikeId },
            hikeId,
          });
        }
      }
    };

    const toggleTrailBookmark = async (e: any, trailId: string) => {
      e.stopPropagation?.();
      if (!session) return;
      const isBookmarked = trailBookmarkIds.has(trailId);
      if (isBookmarked) {
        await supabase.from("want_to_hike").delete().eq("user_id", session.user.id).eq("trail_id", trailId);
        setTrailBookmarkIds(prev => { const n = new Set(prev); n.delete(trailId); return n; });
      } else {
        await supabase.from("want_to_hike").insert({ user_id: session.user.id, trail_id: trailId });
        setTrailBookmarkIds(prev => new Set([...prev, trailId]));
      }
    };

    // Blocks are enforced by RLS via can_view_user_content, so a blocked user's
    // hikes never reach the client. Filtering here as well only made pages
    // render short, since it ran after pagination.
    const visibleHikes = hikes;

    const renderCard = ({ item: hike, index: idx }: { item: FeedHike; index: number }) => {
      const diffColor = getDiffColor(hike.difficulty);
      const isLiked = likedIds.has(hike.id);
      const likeCount = likeCounts[hike.id] || 0;
      const isTrailBookmarked = hike.trail_id ? trailBookmarkIds.has(hike.trail_id) : false;
      const initials = getInitials(hike.userName || "");
      const avatarBg = AVATAR_COLORS[idx % AVATAR_COLORS.length];
      const isOwnHike = hike.user_id === session?.user.id;

      return (
        <Pressable
          style={({ pressed }) => [styles.card, { opacity: pressed ? 0.93 : 1 }]}
          onPress={() => router.push({ pathname: "/hike-detail", params: { id: hike.id } })}
        >
          <View style={[styles.diffStrip, { backgroundColor: diffColor + "22" }]}>
            <View style={[styles.diffBadge, { backgroundColor: diffColor + "20", borderColor: diffColor + "55" }]}>
              <View style={[styles.diffDot, { backgroundColor: diffColor }]} />
              <Text style={[styles.diffText, { color: diffColor }]}>{hike.difficulty || "—"}</Text>
            </View>
            <View style={styles.diffRight}>
              {isOwnHike && <View style={styles.ownBadge}><Text style={styles.ownBadgeText}>You</Text></View>}
              {hike.trail_id && <View style={styles.viewTrailBadge}><Feather name="map-pin" size={10} color={Colors.text3} /><Text style={styles.viewTrailText}>Trail</Text></View>}
            </View>
          </View>

          {hike.photos && hike.photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosScroll} contentContainerStyle={styles.photosContent}>
              {hike.photos.map(url => (
                <Image key={url} source={url} style={styles.photoThumb} contentFit="cover" cachePolicy="memory-disk" />
              ))}
            </ScrollView>
          )}

          <View style={styles.cardBody}>
            <View style={styles.titleRow}>
              <Text style={styles.trailName} numberOfLines={1}>{hike.trail_name}</Text>
              {hike.overall_score > 0 && (
                <View style={styles.ratingRow}>
                  <Feather name="star" size={12} color={Colors.amber2} />
                  <Text style={styles.ratingText}>{hike.overall_score.toFixed(1)}</Text>
                </View>
              )}
            </View>
            {hike.location ? <Text style={styles.location}>{hike.location}</Text> : null}
            <View style={styles.statsRow}>
              {hike.distance_mi > 0 && <View style={styles.stat}><Text style={styles.statVal}>{formatDistance(hike.distance_mi, distanceUnit)}</Text><Text style={styles.statLbl}>Distance</Text></View>}
              {hike.elevation_ft > 0 && <View style={styles.stat}><Text style={styles.statVal}>{formatElevation(hike.elevation_ft, distanceUnit)}</Text><Text style={styles.statLbl}>Elevation</Text></View>}
              {hike.duration_hr != null && hike.duration_hr > 0 && <View style={styles.stat}><Text style={styles.statVal}>{hike.duration_hr.toFixed(1)} hr</Text><Text style={styles.statLbl}>Duration</Text></View>}
            </View>
            {hike.dim_ratings && hike.dim_ratings.length > 0 && (
              <View style={styles.dimRow}>
                {hike.dim_ratings.slice(0, 3).map(d => (
                  <View key={d.name} style={styles.dimPill}>
                    <View style={styles.dimDot} />
                    <Text style={styles.dimText}>{d.name} {d.score}</Text>
                  </View>
                ))}
              </View>
            )}
            {hike.notes ? <Text style={styles.notes} numberOfLines={2}>"{hike.notes}"</Text> : null}
          </View>

          <View style={styles.cardFooter}>
            <Pressable onPress={() => router.push({ pathname: "/user-profile", params: { id: hike.user_id } })} style={styles.userChip}>
              <View style={[styles.avatar, { backgroundColor: avatarBg }]}>
                <Text style={styles.avatarText}>{initials}</Text>
              </View>
              <View>
                <Text style={styles.userName}>{hike.userName}</Text>
                <Text style={styles.userTime}>{timeAgo(hike.date)}</Text>
              </View>
            </Pressable>
            <View style={styles.actions}>
              <Pressable onPress={() => router.push({ pathname: "/hike-detail", params: { id: hike.id } })} style={styles.actionBtn}>
                <Feather name="message-circle" size={15} color={Colors.text3} />
                {(hike.commentCount || 0) > 0 && <Text style={styles.actionCount}>{hike.commentCount}</Text>}
              </Pressable>
              <Pressable onPress={(e) => toggleLike(e, hike.id)} style={styles.actionBtn}>
                <Feather name="heart" size={15} color={isLiked ? Colors.red : Colors.text3} />
                {likeCount > 0 && <Text style={[styles.actionCount, isLiked && { color: Colors.red }]}>{likeCount}</Text>}
              </Pressable>
              {/* Both slots always render. They used to be conditional, so the
                  action row changed length card to card -- a hike with no
                  catalog trail lost its bookmark. The bookmark saves the
                  linked *trail*, so it is inert when a hike has none. The
                  overflow menu is always present and always the same size. */}
              <Pressable
                onPress={(e) => hike.trail_id && toggleTrailBookmark(e, hike.trail_id)}
                disabled={!hike.trail_id}
                style={[styles.actionBtn, !hike.trail_id && styles.actionBtnDisabled]}
              >
                <Feather name="bookmark" size={15} color={isTrailBookmarked ? Colors.accent : Colors.text3} />
              </Pressable>
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  showActionSheet(hike.trail_name || "Hike", [
                    // Omitted entirely until the landing site exists, rather
                    // than handing someone a link to nowhere.
                    ...(sharingAvailable
                      ? [{
                          label: "Share hike",
                          onPress: () => { shareEntity("hike", hike.id, `${hike.trail_name || "A hike"} on Summit`); },
                        }]
                      : []),
                    {
                      label: "Report post",
                      destructive: true,
                      onPress: () => setReportTarget({ hikeId: hike.id, reportedUserId: hike.user_id, label: "Report post" }),
                    },
                  ]);
                }}
                style={styles.actionBtn}
              >
                <Feather name="more-horizontal" size={16} color={Colors.text3} />
              </Pressable>
            </View>
          </View>
        </Pressable>
      );
    };

    return (
      <View style={[styles.container, { backgroundColor: Colors.bg }]}>
        <View style={[styles.header, { paddingTop: topPad + 8 }]}>
          <View>
            <Text style={styles.logo}>Summit</Text>
            <Text style={styles.logoSub}>your trail journal</Text>
          </View>
          <Pressable onPress={() => router.push("/notifications")} style={({ pressed }) => [styles.iconBtn, { opacity: pressed ? 0.6 : 1 }]}>
            <Feather name="bell" size={20} color={Colors.text3} />
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.center}><ActivityIndicator color={Colors.accent} size="large" /></View>
        ) : (
          <FlatList
            data={visibleHikes}
            keyExtractor={item => item.id}
            renderItem={renderCard}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 84 : 100 }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
            onEndReached={loadMore}
            onEndReachedThreshold={0.4}
            ListHeaderComponent={
              <Text style={styles.sectionLabel}>
                {visibleHikes.length > 0 ? `${visibleHikes.length} hike${visibleHikes.length !== 1 ? "s" : ""} loaded` : "Recent Activity"}
              </Text>
            }
            ListEmptyComponent={
              <View style={styles.empty}>
                <Feather name="map" size={40} color={Colors.text3} />
                <Text style={styles.emptyText}>No hikes yet</Text>
                <Text style={styles.emptySubtext}>Be the first to log a hike!</Text>
              </View>
            }
            ListFooterComponent={loadingMore ? <View style={styles.loadingMore}><ActivityIndicator color={Colors.accent} size="small" /></View> : null}
          />
        )}

        <ReportModal
          target={reportTarget}
          reporterId={session?.user.id}
          onClose={() => setReportTarget(null)}
          onSubmitted={() => showToast("Report submitted — our team will review it")}
        />

        {/* Toast */}
        {!!toast && (
          <View style={styles.toast} pointerEvents="none">
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}
      </View>
    );
  }

  const styles = StyleSheet.create({
    container: { flex: 1 },
    header: { paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    logo: { fontFamily: "Inter_700Bold", fontSize: 26, color: Colors.accent, letterSpacing: -0.5 },
    logoSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text3, marginTop: -2, fontStyle: "italic" },
    iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border2 },
    sectionLabel: { fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: Colors.text3, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, fontFamily: "Inter_500Medium" },
    center: { flex: 1, alignItems: "center", justifyContent: "center" },
    empty: { alignItems: "center", paddingTop: 80, gap: 12 },
    emptyText: { fontFamily: "Inter_600SemiBold", fontSize: 18, color: Colors.text2 },
    emptySubtext: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text3 },
    loadingMore: { paddingVertical: 20, alignItems: "center" },
    card: { marginHorizontal: 16, marginBottom: 12, backgroundColor: Colors.bg3, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, overflow: "hidden" },
    diffStrip: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 9 },
    diffBadge: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1 },
    diffDot: { width: 7, height: 7, borderRadius: 4 },
    diffText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
    diffRight: { flexDirection: "row", alignItems: "center", gap: 6 },
    ownBadge: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: 20, backgroundColor: "rgba(141,207,122,0.15)", borderWidth: 1, borderColor: "rgba(141,207,122,0.3)" },
    ownBadgeText: { fontSize: 11, fontFamily: "Inter_500Medium", color: Colors.accent },
    viewTrailBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border2 },
    viewTrailText: { fontSize: 10, color: Colors.text3, fontFamily: "Inter_400Regular" },
    photosScroll: { maxHeight: 140 },
    photosContent: { paddingHorizontal: 14, paddingBottom: 10, gap: 8, flexDirection: "row" },
    photoThumb: { width: 120, height: 120, borderRadius: 10, backgroundColor: Colors.surface },
    cardBody: { padding: 14, paddingTop: 10 },
    titleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 3 },
    trailName: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text, flex: 1, marginRight: 8 },
    ratingRow: { flexDirection: "row", alignItems: "center", gap: 3 },
    ratingText: { fontSize: 13, color: Colors.amber2, fontFamily: "Inter_500Medium" },
    location: { fontSize: 12, color: Colors.text3, fontFamily: "Inter_400Regular", marginBottom: 10 },
    statsRow: { flexDirection: "row", gap: 16, marginBottom: 10 },
    stat: { gap: 2 },
    statVal: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.text },
    statLbl: { fontSize: 10, color: Colors.text3, textTransform: "uppercase", letterSpacing: 0.5 },
    dimRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
    dimPill: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 3, paddingHorizontal: 8, backgroundColor: Colors.surface, borderRadius: 20 },
    dimDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.green },
    dimText: { fontSize: 11, color: Colors.text2, fontFamily: "Inter_400Regular" },
    notes: { fontSize: 13, color: Colors.text3, fontFamily: "Inter_400Regular", fontStyle: "italic", lineHeight: 18, marginTop: 4 },
    cardFooter: { padding: 12, borderTopWidth: 1, borderTopColor: Colors.border, flexDirection: "row", alignItems: "center" },
    userChip: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
    avatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    avatarText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.accent },
    userName: { fontSize: 13, color: Colors.text2, fontFamily: "Inter_500Medium" },
    userTime: { fontSize: 11, color: Colors.text3 },
    actions: { flexDirection: "row", alignItems: "center", gap: 4 },
    actionBtn: { flexDirection: "row", alignItems: "center", gap: 4, padding: 6 },
    // Dimmed but present: a hike with no catalog trail has nothing to save.
    actionBtnDisabled: { opacity: 0.25 },
    actionCount: { fontSize: 13, color: Colors.text3, fontFamily: "Inter_500Medium" },
    toast: { position: "absolute", bottom: 100, left: 20, right: 20, backgroundColor: "rgba(30,40,30,0.95)", borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1, borderColor: Colors.border },
    toastText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.accent, textAlign: "center" },
  });
  
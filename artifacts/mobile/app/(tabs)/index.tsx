import { Feather } from "@expo/vector-icons";
  import { Image } from "expo-image";
  import { useRouter } from "expo-router";
  import React, { useCallback, useEffect, useRef, useState } from "react";
  import {
    ActivityIndicator,
    FlatList,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
  } from "react-native";
  import { useSafeAreaInsets } from "react-native-safe-area-context";
  import Colors from "@/constants/colors";
  import { supabase } from "@/lib/supabase";
  import { useAuth } from "@/context/AuthContext";
  import { sendPushNotification } from "@/lib/notifications";
  import { formatDistance, formatElevation } from "@/lib/units";

  const PAGE_SIZE = 20;
  const REPORT_REASONS = ["Spam", "Harassment or bullying", "Inappropriate content", "Other"];

  type FeedHike = {
    id: string; trail_name: string; location: string; distance_mi: number;
    elevation_ft: number; duration_hr: number | null; difficulty: string;
    overall_score: number; notes: string; date: string; user_id: string;
    trail_id: string | null; dim_ratings: { name: string; score: number }[];
    userName?: string; photos?: string[]; commentCount?: number;
  };

  function getDiffColor(diff: string) {
    switch (diff?.toLowerCase()) {
      case "easy": return Colors.green;
      case "moderate": return Colors.amber;
      case "hard": return Colors.red;
      case "expert": return "#a855d4";
      default: return Colors.text3;
    }
  }

  function timeAgo(dateStr: string) {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function getInitials(name: string) {
    if (!name) return "?";
    return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  }

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
    const [blockedSet, setBlockedSet] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const offsetRef = useRef(0);

    const [reportModal, setReportModal] = useState<{ hikeId: string; reportedUserId: string } | null>(null);
    const [reportReason, setReportReason] = useState("");
    const [reportDetails, setReportDetails] = useState("");
    const [reportSubmitting, setReportSubmitting] = useState(false);
    const [toast, setToast] = useState("");

    const showToast = (msg: string) => {
      setToast(msg);
      setTimeout(() => setToast(""), 3500);
    };

    const fetchPage = async (offset: number): Promise<FeedHike[]> => {
      const { data: hikesData, error } = await supabase
        .from("hikes").select("*, dim_ratings(*)")
        .order("date", { ascending: false })
        .range(offset, offset + PAGE_SIZE - 1);
      if (error || !hikesData || hikesData.length === 0) { setHasMore(false); return []; }
      const userIds = [...new Set(hikesData.map((h: any) => h.user_id))];
      const hikeIds = hikesData.map((h: any) => h.id);
      const [profilesRes, photosRes, commentsRes, likesRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name").in("id", userIds),
        supabase.from("hike_photos").select("hike_id, photo_url").in("hike_id", hikeIds),
        supabase.from("comments").select("hike_id").in("hike_id", hikeIds),
        supabase.from("likes").select("hike_id").in("hike_id", hikeIds),
      ]);
      const profileMap: Record<string, string> = {};
      if (profilesRes.data) profilesRes.data.forEach((p: any) => { profileMap[p.id] = p.full_name || "Anonymous"; });
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
        ...h, userName: profileMap[h.user_id] || "Anonymous",
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

    const fetchBlocked = async () => {
      if (!session) return;
      const [{ data: iBlock }, { data: blockMe }] = await Promise.all([
        supabase.from("blocks").select("blocked_id").eq("blocker_id", session.user.id),
        supabase.from("blocks").select("blocker_id").eq("blocked_id", session.user.id),
      ]);
      const ids = new Set<string>([
        ...((iBlock || []).map((r: any) => r.blocked_id)),
        ...((blockMe || []).map((r: any) => r.blocker_id)),
      ]);
      setBlockedSet(ids);
    };

    const load = async () => {
      setLoading(true);
      offsetRef.current = 0;
      const [page] = await Promise.all([fetchPage(0), fetchLikes(), fetchTrailBookmarks(), fetchBlocked()]);
      setHikes(page);
      offsetRef.current = page.length;
      setLoading(false);
    };

    const loadMore = async () => {
      if (loadingMore || !hasMore) return;
      setLoadingMore(true);
      const page = await fetchPage(offsetRef.current);
      if (page.length > 0) { setHikes(prev => [...prev, ...page]); offsetRef.current += page.length; }
      setLoadingMore(false);
    };

    const onRefresh = useCallback(async () => {
      setRefreshing(true);
      offsetRef.current = 0;
      setHasMore(true);
      const [page] = await Promise.all([fetchPage(0), fetchLikes(), fetchTrailBookmarks(), fetchBlocked()]);
      setHikes(page);
      offsetRef.current = page.length;
      setRefreshing(false);
    }, [session]);

    useEffect(() => { load(); }, []);

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
            body: `${profile?.full_name || "Someone"} liked your hike on ${hike.trail_name || "a trail"}`,
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

    const submitReport = async () => {
      if (!session || !reportModal || !reportReason) return;
      setReportSubmitting(true);
      await supabase.from("reports").insert({
        reporter_id: session.user.id,
        reported_user_id: reportModal.reportedUserId,
        hike_id: reportModal.hikeId,
        reason: reportReason,
        details: reportDetails.trim() || null,
      });
      setReportSubmitting(false);
      setReportModal(null);
      setReportReason("");
      setReportDetails("");
      showToast("Report submitted — our team will review it");
    };

    const visibleHikes = hikes.filter(h => !blockedSet.has(h.user_id));

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
              {hike.photos.map((url, i) => (
                <Image key={i} source={url} style={styles.photoThumb} contentFit="cover" cachePolicy="memory-disk" />
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
              {hike.trail_id && (
                <Pressable onPress={(e) => toggleTrailBookmark(e, hike.trail_id!)} style={styles.actionBtn}>
                  <Feather name="bookmark" size={15} color={isTrailBookmarked ? Colors.accent : Colors.text3} />
                </Pressable>
              )}
              {!isOwnHike && (
                <Pressable
                  onPress={(e) => { e.stopPropagation?.(); setReportModal({ hikeId: hike.id, reportedUserId: hike.user_id }); }}
                  style={styles.actionBtn}
                >
                  <Feather name="flag" size={14} color={Colors.text3} />
                </Pressable>
              )}
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

        {/* Report modal */}
        <Modal visible={!!reportModal} transparent animationType="fade">
          <Pressable style={styles.modalOverlay} onPress={() => { setReportModal(null); setReportReason(""); setReportDetails(""); }}>
            <Pressable style={styles.reportSheet} onPress={() => {}}>
              <Text style={styles.reportTitle}>Report post</Text>
              <Text style={styles.reportSub}>Why are you reporting this?</Text>
              {REPORT_REASONS.map(r => (
                <Pressable key={r} onPress={() => setReportReason(r)} style={[styles.reasonRow, reportReason === r && styles.reasonRowActive]}>
                  <Text style={[styles.reasonText, reportReason === r && styles.reasonTextActive]}>{r}</Text>
                  {reportReason === r && <Feather name="check" size={15} color={Colors.accent} />}
                </Pressable>
              ))}
              <TextInput
                style={styles.reportDetailsInput}
                placeholder="Additional details (optional)"
                placeholderTextColor={Colors.text3}
                value={reportDetails}
                onChangeText={setReportDetails}
                multiline
                maxLength={300}
              />
              <Pressable
                onPress={submitReport}
                disabled={!reportReason || reportSubmitting}
                style={[styles.submitReportBtn, (!reportReason || reportSubmitting) && { opacity: 0.5 }]}
              >
                <Text style={styles.submitReportText}>{reportSubmitting ? "Submitting…" : "Submit Report"}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

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
    actionCount: { fontSize: 13, color: Colors.text3, fontFamily: "Inter_500Medium" },
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end" },
    reportSheet: { backgroundColor: Colors.bg2, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 40, gap: 4 },
    reportTitle: { fontFamily: "Inter_700Bold", fontSize: 17, color: Colors.text, marginBottom: 2 },
    reportSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text3, marginBottom: 12 },
    reasonRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, marginBottom: 6, backgroundColor: Colors.bg3 },
    reasonRowActive: { borderColor: Colors.accent, backgroundColor: "rgba(141,207,122,0.08)" },
    reasonText: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.text2 },
    reasonTextActive: { color: Colors.accent, fontFamily: "Inter_600SemiBold" },
    reportDetailsInput: { marginTop: 8, backgroundColor: Colors.bg3, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text, minHeight: 70, textAlignVertical: "top" },
    submitReportBtn: { marginTop: 14, backgroundColor: Colors.red, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
    submitReportText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff" },
    toast: { position: "absolute", bottom: 100, left: 20, right: 20, backgroundColor: "rgba(30,40,30,0.95)", borderRadius: 12, padding: 14, alignItems: "center", borderWidth: 1, borderColor: Colors.border },
    toastText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.accent, textAlign: "center" },
  });
  
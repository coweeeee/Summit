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
  import { displayName, getDiffColor, timeAgo } from "@/lib/format";
  import Avatar, { type AvatarProfile } from "@/components/Avatar";
  import EmptyState from "@/components/EmptyState";
  import ReportModal, { ReportTarget } from "@/components/ReportModal";
  import { showActionSheet } from "@/lib/actionSheet";
  import { shareEntity, sharingAvailable } from "@/lib/share";
  import { signedUrlsFor } from "@/lib/upload";

  const PAGE_SIZE = 20;
  type FeedHike = {
    id: string; trail_name: string; location: string; distance_mi: number;
    elevation_ft: number | null; duration_hr: number | null; difficulty: string;
    overall_score: number; notes: string; date: string; user_id: string;
    trail_id: string | null; dim_ratings: { name: string; score: number }[];
    userName?: string; photos?: string[]; commentCount?: number;
    author?: AvatarProfile;
  };

  export default function FeedScreen() {
    const { session, profile, loading: authLoading } = useAuth();
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

    // Ticket for whole-list fetches. Every call that replaces `hikes` takes the
    // next number, and commits its result only if it still holds the newest —
    // see replaceFeed. Every fetch that writes state re-checks it after each
    // await, not just at the point of commit.
    const loadSeqRef = useRef(0);
    // True while a full reload is in flight, so pagination can decline to fetch
    // a page that would be appended to a list about to be thrown away. A ref
    // rather than the `loading`/`refreshing` state because onEndReached reads it
    // from a closure that would see a state change a frame late.
    const reloadingRef = useRef(false);

    const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
    const [toast, setToast] = useState("");

    const showToast = (msg: string) => {
      setToast(msg);
      setTimeout(() => setToast(""), 3500);
    };

    /**
     * Returns null when a newer request superseded this one mid-flight, in
     * which case the caller must commit nothing at all.
     *
     * The guards sit inside rather than only at the call site because this
     * function writes state of its own — `hasMore` and `likeCounts` — before it
     * ever returns. Checking only the returned page would let a stale response
     * still move the pagination cursor for a list it knows nothing about.
     */
    const fetchPage = async (offset: number, seq: number): Promise<FeedHike[] | null> => {
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
      // Bail before touching hasMore: a superseded request knows nothing about
      // the list the newer one is building.
      if (seq !== loadSeqRef.current) return null;
      // An error is not the end of the list. Collapsing the two meant a failed
      // page looked exactly like exhaustion, so pagination died silently
      // mid-scroll and never recovered until a manual refresh.
      if (error) { setHasMore(true); return []; }
      if (!hikesData || hikesData.length === 0) { setHasMore(false); return []; }
      const userIds = [...new Set(hikesData.map((h: any) => h.user_id))];
      const hikeIds = hikesData.map((h: any) => h.id);
      const [profilesRes, photosRes, commentsRes, likesRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, username, avatar_url, avatar_preset").in("id", userIds),
        supabase.from("hike_photos").select("hike_id, storage_path").in("hike_id", hikeIds),
        supabase.from("comments").select("hike_id").in("hike_id", hikeIds),
        supabase.from("likes").select("hike_id").in("hike_id", hikeIds),
      ]);
      // Re-checked: the secondary queries are a second suspension point, and
      // setLikeCounts below is another write that must not outlive its request.
      if (seq !== loadSeqRef.current) return null;
      // The whole row, not just a formatted name — the card renders an avatar
      // from it too, and displayName() already handles a missing entry.
      const profileMap: Record<string, AvatarProfile> = {};
      if (profilesRes.data) profilesRes.data.forEach((p: any) => { profileMap[p.id] = p; });
      // hike-photos is a private bucket, so the stored value is a path and has
      // to be signed before it can be rendered. One batched call for the whole
      // page rather than one per photo. A path this viewer may not read comes
      // back as a per-entry error and is dropped here, so an unreadable photo
      // hides itself without taking its hike down with it.
      const allPaths = (photosRes.data ?? []).map((p: any) => p.storage_path).filter(Boolean);
      const signed = await signedUrlsFor(allPaths);
      // Signing is another suspension point, so re-check the sequence guard.
      if (seq !== loadSeqRef.current) return null;
      const photoMap: Record<string, string[]> = {};
      if (photosRes.data) photosRes.data.forEach((p: any) => {
        const signedUrl = signed[p.storage_path];
        if (!signedUrl) return;
        if (!photoMap[p.hike_id]) photoMap[p.hike_id] = [];
        photoMap[p.hike_id].push(signedUrl);
      });
      const commentMap: Record<string, number> = {};
      if (commentsRes.data) commentsRes.data.forEach((c: any) => { commentMap[c.hike_id] = (commentMap[c.hike_id] || 0) + 1; });
      const counts: Record<string, number> = {};
      if (likesRes.data) likesRes.data.forEach((l: any) => { counts[l.hike_id] = (counts[l.hike_id] || 0) + 1; });
      setLikeCounts(prev => ({ ...prev, ...counts }));
      setHasMore(hikesData.length === PAGE_SIZE);
      return hikesData.map((h: any) => ({
        ...h, userName: displayName(profileMap[h.user_id]), author: profileMap[h.user_id],
        photos: photoMap[h.id] || [], commentCount: commentMap[h.id] || 0,
      }));
    };

    // These two take the request id for the same reason fetchPage does: they
    // commit state directly rather than returning it, so a response that lands
    // after a newer reload started would otherwise overwrite what that reload
    // just wrote.
    const fetchLikes = async (seq: number) => {
      if (!session) return;
      const { data } = await supabase.from("likes").select("hike_id").eq("user_id", session.user.id);
      if (seq !== loadSeqRef.current) return;
      if (data) setLikedIds(new Set(data.map((l: any) => l.hike_id)));
    };

    const fetchTrailBookmarks = async (seq: number) => {
      if (!session) return;
      const { data } = await supabase.from("want_to_hike").select("trail_id").eq("user_id", session.user.id);
      if (seq !== loadSeqRef.current) return;
      if (data) setTrailBookmarkIds(new Set(data.map((d: any) => d.trail_id)));
    };

    /**
     * Fetch page zero and replace the list — but only if nothing newer started
     * meanwhile.
     *
     * Both callers below reset the list, so two of them in flight at once used
     * to be decided by which network response happened to land last. That is
     * how your own hikes reached the feed: a fetch issued before the session
     * was known skips the `neq` filter, and if it finished second it overwrote
     * the correctly filtered result. `await` does not cancel anything, so
     * dropping the stale response is the only way to make the outcome
     * independent of timing.
     *
     * The flags are cleared only by whichever call is still current, so a
     * superseded one cannot hide a spinner the live request still needs.
     */
    const replaceFeed = async (seq: number) => {
      try {
        const [page] = await Promise.all([fetchPage(0, seq), fetchLikes(seq), fetchTrailBookmarks(seq)]);
        if (page === null || seq !== loadSeqRef.current) return;
        setHikes(page);
        offsetRef.current = page.length;
      } finally {
        if (seq === loadSeqRef.current) {
          // Cleared here rather than only on success, so a reload that errors
          // cannot wedge pagination off permanently.
          reloadingRef.current = false;
          setLoading(false);
          setRefreshing(false);
        }
      }
    };

    const load = async () => {
      const seq = ++loadSeqRef.current;
      reloadingRef.current = true;
      setLoading(true);
      offsetRef.current = 0;
      // Reset alongside the cursor, exactly as onRefresh does. Without it a
      // reload after you had already paged to the end inherited hasMore=false
      // and pagination stayed switched off against a freshly rebuilt list.
      setHasMore(true);
      await replaceFeed(seq);
    };

    const loadMore = async () => {
      // A reload in flight is about to replace the list wholesale, so this page
      // could only ever be appended to a list already on its way out. Checking
      // the ref rather than `loading`/`refreshing` because onEndReached fires
      // from a closure that sees a state change a frame late.
      if (loadingMore || !hasMore || reloadingRef.current) return;
      // Reads the ticket without taking one: appending is not a reset. If the
      // list is replaced while this page is in flight, its rows belong to a
      // list that no longer exists and appending them would interleave two
      // different result sets.
      const seq = loadSeqRef.current;
      setLoadingMore(true);
      try {
        const page = await fetchPage(offsetRef.current, seq);
        if (page === null || seq !== loadSeqRef.current) return;
        if (page.length > 0) {
          // Same guard as Discover: a hike logged between page fetches shifts the
          // offsets and can re-serve a row the list already holds.
          setHikes(prev => {
            const seen = new Set(prev.map(h => h.id));
            return [...prev, ...page.filter(h => !seen.has(h.id))];
          });
          offsetRef.current += page.length;
        }
      } finally {
        setLoadingMore(false);
      }
    };

    const onRefresh = useCallback(async () => {
      const seq = ++loadSeqRef.current;
      reloadingRef.current = true;
      setRefreshing(true);
      offsetRef.current = 0;
      setHasMore(true);
      await replaceFeed(seq);
    }, [session]);

    // Waits for auth to settle before fetching at all. `AuthGate` returns null
    // while loading rather than blocking the tree, so the tab navigator mounts
    // and this screen runs before `getSession()` resolves. supabase-js has
    // already read the token from storage by then and attaches it, so the
    // request succeeds and returns rows -- it is only `session` in React state
    // that is still null, which is exactly what skips the own-hike filter. So
    // the symptom was not an empty feed but a feed containing your own hikes.
    //
    // replaceFeed's ticket makes a late response harmless on its own; this
    // makes it not happen, and saves an unfiltered round trip that could only
    // ever be discarded.
    //
    // Depends on session?.user.id rather than session: Supabase returns a new
    // session object on every token refresh, which would otherwise reload the
    // feed roughly every hour for no reason.
    useEffect(() => {
      if (authLoading) return;
      load();
    }, [session?.user.id, authLoading]);

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

    const renderCard = ({ item: hike }: { item: FeedHike }) => {
      const diffColor = getDiffColor(hike.difficulty);
      const isLiked = likedIds.has(hike.id);
      const likeCount = likeCounts[hike.id] || 0;
      const isTrailBookmarked = hike.trail_id ? trailBookmarkIds.has(hike.trail_id) : false;
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
              {hike.elevation_ft != null && <View style={styles.stat}><Text style={styles.statVal}>{formatElevation(hike.elevation_ft, distanceUnit)}</Text><Text style={styles.statLbl}>Elevation</Text></View>}
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
              <Avatar profile={hike.author ?? { id: hike.user_id }} size={28} />
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
              // Gated on `loading`: this list starts empty on every cold start,
              // so without the guard the first frame asserts there are no hikes.
              loading ? null : (
                <EmptyState
                  icon="map"
                  title="No hikes yet"
                  message="Be the first to log one."
                  actionLabel="Log a Hike"
                  onAction={() => router.push("/(tabs)/log")}
                />
              )
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
  
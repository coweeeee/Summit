import { Feather } from "@expo/vector-icons";
  import { useLocalSearchParams, useRouter } from "expo-router";
  import React, { useEffect, useRef, useState } from "react";
  import {
    ActivityIndicator,
    Alert,
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
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

  type HikeDetail = {
    id: string; trail_name: string; location: string; distance_mi: number;
    elevation_ft: number; duration_hr: number | null; difficulty: string;
    overall_score: number; notes: string; date: string; user_id: string;
    trail_id: string | null; dim_ratings: { name: string; score: number }[];
  };

  type Comment = { id: string; content: string; created_at: string; user_id: string; userName: string; };

  const REPORT_REASONS = ["Spam", "Harassment or bullying", "Inappropriate content", "Other"];

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
    return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function getInitials(name: string) {
    if (!name) return "?";
    return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  }

  export default function HikeDetailScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { session, profile } = useAuth();
    const distanceUnit = profile?.distance_unit ?? "imperial";

    const [hike, setHike] = useState<HikeDetail | null>(null);
    const [photos, setPhotos] = useState<string[]>([]);
    const [comments, setComments] = useState<Comment[]>([]);
    const [likeCount, setLikeCount] = useState(0);
    const [isLiked, setIsLiked] = useState(false);
    const [loading, setLoading] = useState(true);
    const [commentText, setCommentText] = useState("");
    const [posting, setPosting] = useState(false);
    const [hikerName, setHikerName] = useState("Anonymous");
    const [blockedSet, setBlockedSet] = useState<Set<string>>(new Set());
    const scrollRef = useRef<ScrollView>(null);

    const [reportModal, setReportModal] = useState<{ hikeId?: string; commentId?: string; reportedUserId: string; label: string } | null>(null);
    const [reportReason, setReportReason] = useState("");
    const [reportDetails, setReportDetails] = useState("");
    const [reportSubmitting, setReportSubmitting] = useState(false);
    const [toast, setToast] = useState("");

    const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

    const closeReport = () => { setReportModal(null); setReportReason(""); setReportDetails(""); };

    useEffect(() => {
      const load = async () => {
        const [hikeRes, photosRes, commentsRes, likesRes] = await Promise.all([
          supabase.from("hikes").select("*, dim_ratings(*)").eq("id", id).single(),
          supabase.from("hike_photos").select("photo_url").eq("hike_id", id),
          supabase.from("comments").select("*").eq("hike_id", id).order("created_at", { ascending: true }),
          supabase.from("likes").select("user_id").eq("hike_id", id),
        ]);

        if (hikeRes.data) {
          setHike(hikeRes.data);
          const { data: profile } = await supabase.from("profiles").select("full_name").eq("id", hikeRes.data.user_id).single();
          if (profile) setHikerName(profile.full_name || "Anonymous");
        }

        if (photosRes.data) setPhotos(photosRes.data.map((p: any) => p.photo_url));
        setLikeCount(likesRes.data?.length || 0);
        if (session) setIsLiked(likesRes.data?.some((l: any) => l.user_id === session.user.id) || false);

        if (commentsRes.data && commentsRes.data.length > 0) {
          const userIds = [...new Set(commentsRes.data.map((c: any) => c.user_id))];
          const { data: profiles } = await supabase.from("profiles").select("id, full_name").in("id", userIds);
          const pMap: Record<string, string> = {};
          if (profiles) profiles.forEach((p: any) => { pMap[p.id] = p.full_name || "Anonymous"; });
          setComments(commentsRes.data.map((c: any) => ({ ...c, userName: pMap[c.user_id] || "Anonymous" })));
        }

        if (session) {
          const [{ data: iBlock }, { data: blockMe }] = await Promise.all([
            supabase.from("blocks").select("blocked_id").eq("blocker_id", session.user.id),
            supabase.from("blocks").select("blocker_id").eq("blocked_id", session.user.id),
          ]);
          setBlockedSet(new Set([
            ...((iBlock || []).map((r: any) => r.blocked_id)),
            ...((blockMe || []).map((r: any) => r.blocker_id)),
          ]));
        }

        setLoading(false);
      };
      load();
    }, [id]);

    const toggleLike = async () => {
      if (!session) return;
      if (isLiked) {
        await supabase.from("likes").delete().eq("user_id", session.user.id).eq("hike_id", id);
        setIsLiked(false); setLikeCount(c => Math.max(c - 1, 0));
      } else {
        await supabase.from("likes").insert({ user_id: session.user.id, hike_id: id });
        setIsLiked(true); setLikeCount(c => c + 1);
        if (hike && hike.user_id !== session.user.id) {
          sendPushNotification({
            targetUserId: hike.user_id,
            type: "like",
            title: "New like",
            body: `${profile?.full_name || "Someone"} liked your hike on ${hike.trail_name || "a trail"}`,
            data: { hikeId: id },
            hikeId: id,
          });
        }
      }
    };

    const postComment = async () => {
      if (!session || !commentText.trim()) return;
      setPosting(true);
      const { data, error } = await supabase.from("comments").insert({
        hike_id: id, user_id: session.user.id, content: commentText.trim(),
      }).select().single();
      setPosting(false);
      if (error || !data) return;
      const { data: commenterProfile } = await supabase.from("profiles").select("full_name").eq("id", session.user.id).single();
      setComments(prev => [...prev, { ...data, userName: commenterProfile?.full_name || "Anonymous" }]);
      setCommentText("");
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 200);
      if (hike && hike.user_id !== session.user.id) {
        sendPushNotification({
          targetUserId: hike.user_id,
          type: "comment",
          title: "New comment",
          body: `${commenterProfile?.full_name || profile?.full_name || "Someone"} commented on your hike on ${hike.trail_name || "a trail"}`,
          data: { hikeId: id },
          hikeId: id,
        });
      }
    };

    const deleteComment = async (commentId: string) => {
      await supabase.from("comments").delete().eq("id", commentId);
      setComments(prev => prev.filter(c => c.id !== commentId));
    };

    const submitReport = async () => {
      if (!session || !reportModal || !reportReason) return;
      setReportSubmitting(true);
      await supabase.from("reports").insert({
        reporter_id: session.user.id,
        reported_user_id: reportModal.reportedUserId,
        hike_id: reportModal.hikeId || null,
        comment_id: reportModal.commentId || null,
        reason: reportReason,
        details: reportDetails.trim() || null,
      });
      setReportSubmitting(false);
      closeReport();
      showToast("Report submitted — our team will review it");
    };

    const visibleComments = comments.filter(c => !blockedSet.has(c.user_id));

    if (loading) return <View style={[styles.container, styles.center]}><ActivityIndicator color={Colors.accent} size="large" /></View>;
    if (!hike) return <View style={[styles.container, styles.center]}><Text style={styles.emptyText}>Hike not found</Text></View>;

    const dc = getDiffColor(hike.difficulty);
    const isOwnHike = session?.user.id === hike.user_id;

    return (
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}>
            <Feather name="chevron-left" size={28} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>{hike.trail_name}</Text>
          {!isOwnHike ? (
            <Pressable
              onPress={() => setReportModal({ hikeId: id, reportedUserId: hike.user_id, label: "Report post" })}
              style={({ pressed }) => [styles.headerAction, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Feather name="flag" size={18} color={Colors.text3} />
            </Pressable>
          ) : <View style={{ width: 36 }} />}
        </View>

        <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
          {photos.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosScroll} contentContainerStyle={styles.photosContent}>
              {photos.map((url, i) => <Image key={i} source={{ uri: url }} style={styles.photo} />)}
            </ScrollView>
          )}

          <View style={styles.hero}>
            <View style={[styles.diffBadge, { backgroundColor: dc + "20", borderColor: dc + "55" }]}>
              <View style={[styles.diffDot, { backgroundColor: dc }]} />
              <Text style={[styles.diffText, { color: dc }]}>{hike.difficulty}</Text>
            </View>
            <Text style={styles.trailName}>{hike.trail_name}</Text>
            {hike.location ? (
              <View style={styles.locationRow}>
                <Feather name="map-pin" size={13} color={Colors.text3} />
                <Text style={styles.location}>{hike.location}</Text>
              </View>
            ) : null}
            <View style={styles.metaRow}>
              <Pressable onPress={() => router.push({ pathname: "/user-profile", params: { id: hike.user_id } })} style={styles.hikerChip}>
                <View style={styles.hikerAvatar}><Text style={styles.hikerInitials}>{getInitials(hikerName)}</Text></View>
                <Text style={styles.hikerName}>{hikerName}</Text>
              </Pressable>
              <Text style={styles.metaDate}>{new Date(hike.date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</Text>
            </View>
          </View>

          <View style={styles.statsGrid}>
            {hike.distance_mi > 0 && <View style={styles.statBox}><Feather name="navigation" size={16} color={Colors.accent} /><Text style={styles.statVal}>{formatDistance(hike.distance_mi, distanceUnit)}</Text><Text style={styles.statLbl}>Distance</Text></View>}
            {hike.elevation_ft > 0 && <View style={[styles.statBox, styles.statBorder]}><Feather name="trending-up" size={16} color={Colors.accent} /><Text style={styles.statVal}>{formatElevation(hike.elevation_ft, distanceUnit)}</Text><Text style={styles.statLbl}>Elevation</Text></View>}
            {hike.duration_hr != null && <View style={[styles.statBox, styles.statBorder]}><Feather name="clock" size={16} color={Colors.accent} /><Text style={styles.statVal}>{hike.duration_hr.toFixed(1)} hr</Text><Text style={styles.statLbl}>Duration</Text></View>}
            {hike.overall_score > 0 && <View style={[styles.statBox, hike.duration_hr ? styles.statBorder : {}]}><Feather name="star" size={16} color={Colors.amber2} /><Text style={[styles.statVal, { color: Colors.amber2 }]}>{hike.overall_score.toFixed(1)}</Text><Text style={styles.statLbl}>Score</Text></View>}
          </View>

          {hike.dim_ratings && hike.dim_ratings.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Ratings</Text>
              {hike.dim_ratings.map(d => (
                <View key={d.name} style={styles.ratingRow}>
                  <Text style={styles.ratingName}>{d.name}</Text>
                  <View style={styles.stars}>
                    {[1,2,3,4,5].map(s => <Feather key={s} name="star" size={14} color={s <= d.score ? Colors.amber2 : Colors.surface2} />)}
                  </View>
                  <Text style={styles.ratingScore}>{d.score}</Text>
                </View>
              ))}
            </View>
          )}

          {hike.notes ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Notes</Text>
              <Text style={styles.notesText}>{hike.notes}</Text>
            </View>
          ) : null}

          {hike.trail_id && (
            <Pressable onPress={() => router.push({ pathname: "/trail-detail", params: { id: hike.trail_id! } })} style={({ pressed }) => [styles.trailLink, { opacity: pressed ? 0.7 : 1 }]}>
              <Feather name="map" size={16} color={Colors.accent} />
              <Text style={styles.trailLinkText}>View full trail details</Text>
              <Feather name="chevron-right" size={16} color={Colors.accent} />
            </Pressable>
          )}

          <View style={styles.likeRow}>
            <Pressable onPress={toggleLike} style={({ pressed }) => [styles.likeBtn, isLiked && styles.likeBtnActive, { opacity: pressed ? 0.7 : 1 }]}>
              <Feather name="heart" size={18} color={isLiked ? "#fff" : Colors.text3} />
              <Text style={[styles.likeBtnText, isLiked && { color: "#fff" }]}>{likeCount > 0 ? `${likeCount} Like${likeCount !== 1 ? "s" : ""}` : "Like"}</Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Comments ({visibleComments.length})</Text>
            {visibleComments.length === 0 && <Text style={styles.noComments}>No comments yet — be the first!</Text>}
            {visibleComments.map(c => {
              const isOwn = session?.user.id === c.user_id;
              return (
                <View key={c.id} style={styles.comment}>
                  <View style={styles.commentAvatar}><Text style={styles.commentInitials}>{getInitials(c.userName)}</Text></View>
                  <View style={styles.commentBody}>
                    <View style={styles.commentHeader}>
                      <Text style={styles.commentName}>{c.userName}</Text>
                      <Text style={styles.commentTime}>{timeAgo(c.created_at)}</Text>
                      {isOwn ? (
                        <Pressable onPress={() => Alert.alert("Delete comment?", "", [{ text: "Cancel" }, { text: "Delete", style: "destructive", onPress: () => deleteComment(c.id) }])}>
                          <Feather name="trash-2" size={13} color={Colors.text3} />
                        </Pressable>
                      ) : (
                        <Pressable onPress={() => setReportModal({ commentId: c.id, reportedUserId: c.user_id, label: "Report comment" })}>
                          <Feather name="flag" size={13} color={Colors.text3} />
                        </Pressable>
                      )}
                    </View>
                    <Text style={styles.commentText}>{c.content}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>

        <View style={[styles.commentInput, { paddingBottom: insets.bottom + 8 }]}>
          <TextInput
            style={styles.commentField}
            placeholder="Add a comment..."
            placeholderTextColor={Colors.text3}
            value={commentText}
            onChangeText={setCommentText}
            multiline
            maxLength={300}
          />
          <Pressable onPress={postComment} disabled={!commentText.trim() || posting} style={({ pressed }) => [styles.postBtn, { opacity: pressed || !commentText.trim() ? 0.5 : 1 }]}>
            {posting ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="send" size={16} color="#fff" />}
          </Pressable>
        </View>

        {/* Report modal */}
        <Modal visible={!!reportModal} transparent animationType="fade">
          <Pressable style={styles.modalOverlay} onPress={closeReport}>
            <Pressable style={styles.reportSheet} onPress={() => {}}>
              <Text style={styles.reportTitle}>{reportModal?.label || "Report"}</Text>
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

        {!!toast && (
          <View style={styles.toast} pointerEvents="none">
            <Text style={styles.toastText}>{toast}</Text>
          </View>
        )}
      </KeyboardAvoidingView>
    );
  }

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    center: { alignItems: "center", justifyContent: "center" },
    header: { paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    backBtn: { padding: 2, marginLeft: -6 },
    headerTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text, flex: 1, textAlign: "center" },
    headerAction: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
    photosScroll: { maxHeight: 200 },
    photosContent: { paddingHorizontal: 16, gap: 8, paddingBottom: 4 },
    photo: { width: 180, height: 180, borderRadius: 12, backgroundColor: Colors.surface },
    hero: { padding: 20 },
    diffBadge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 4, paddingHorizontal: 10, borderRadius: 20, borderWidth: 1, marginBottom: 10 },
    diffDot: { width: 7, height: 7, borderRadius: 4 },
    diffText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
    trailName: { fontFamily: "Inter_700Bold", fontSize: 22, color: Colors.text, letterSpacing: -0.5, marginBottom: 6 },
    locationRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 12 },
    location: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text3 },
    metaRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    hikerChip: { flexDirection: "row", alignItems: "center", gap: 8 },
    hikerAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: Colors.surface2, alignItems: "center", justifyContent: "center" },
    hikerInitials: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: Colors.accent },
    hikerName: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text2 },
    metaDate: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text3 },
    statsGrid: { flexDirection: "row", marginHorizontal: 16, marginBottom: 4, backgroundColor: Colors.bg3, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, overflow: "hidden" },
    statBox: { flex: 1, alignItems: "center", paddingVertical: 14, gap: 4 },
    statBorder: { borderLeftWidth: 1, borderLeftColor: Colors.border },
    statVal: { fontFamily: "Inter_700Bold", fontSize: 14, color: Colors.text },
    statLbl: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.text3, textTransform: "uppercase", letterSpacing: 0.5 },
    section: { paddingHorizontal: 20, marginTop: 16 },
    sectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text, marginBottom: 10 },
    ratingRow: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
    ratingName: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text2, width: 100 },
    stars: { flexDirection: "row", gap: 3, flex: 1 },
    ratingScore: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.amber2, width: 24, textAlign: "right" },
    notesText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text2, lineHeight: 22 },
    trailLink: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 20, marginTop: 16, padding: 14, backgroundColor: "rgba(141,207,122,0.08)", borderRadius: 12, borderWidth: 1, borderColor: "rgba(141,207,122,0.25)" },
    trailLinkText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.accent },
    likeRow: { paddingHorizontal: 20, marginTop: 16 },
    likeBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border2, backgroundColor: Colors.bg3 },
    likeBtnActive: { backgroundColor: Colors.red, borderColor: Colors.red },
    likeBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text3 },
    noComments: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text3, fontStyle: "italic" },
    comment: { flexDirection: "row", gap: 10, marginBottom: 14 },
    commentAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: Colors.surface2, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    commentInitials: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: Colors.accent },
    commentBody: { flex: 1, backgroundColor: Colors.bg3, borderRadius: 12, padding: 10 },
    commentHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
    commentName: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: Colors.text, flex: 1 },
    commentTime: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.text3 },
    commentText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text2, lineHeight: 20 },
    commentInput: { borderTopWidth: 1, borderTopColor: Colors.border, backgroundColor: Colors.bg2, paddingHorizontal: 16, paddingTop: 10, flexDirection: "row", alignItems: "flex-end", gap: 10 },
    commentField: { flex: 1, backgroundColor: Colors.bg3, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text, maxHeight: 80 },
    postBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: Colors.green2, alignItems: "center", justifyContent: "center" },
    emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text3 },
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
  
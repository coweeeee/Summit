import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { findBadgeDefinition } from "@/lib/badges";
import { displayName, timeAgo } from "@/lib/format";
import Avatar from "@/components/Avatar";

type Notif = {
  id: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  color: string;
  text: string;
  time: string;
  /** ISO timestamp backing the ordering; `time` is only its display form. */
  sortAt: string;
};

type FollowRequest = {
  follower_id: string;
  created_at: string;
  full_name: string | null;
  // Selected by the query but previously dropped in the mapping, so a request
  // from someone with only a handle rendered as "Anonymous Hiker".
  username: string | null;
  avatar_url: string | null;
  avatar_preset: string | null;
};

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const router = useRouter();
  const { session, profile } = useAuth();
  const distanceUnit = profile?.distance_unit ?? "imperial";

  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [followRequests, setFollowRequests] = useState<FollowRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const acceptRequest = async (followerId: string) => {
    await supabase.from("follows")
      .update({ status: "accepted" })
      .eq("follower_id", followerId)
      .eq("following_id", session!.user.id);
    setFollowRequests(prev => prev.filter(r => r.follower_id !== followerId));
  };

  const declineRequest = async (followerId: string) => {
    await supabase.from("follows")
      .delete()
      .eq("follower_id", followerId)
      .eq("following_id", session!.user.id);
    setFollowRequests(prev => prev.filter(r => r.follower_id !== followerId));
  };

  const fetchNotifs = async () => {
    if (!session) { setLoading(false); return; }

    const results: Notif[] = [];

    // Fetch the latest notification preferences directly so toggles made in
    // Settings are respected immediately, even if the cached profile in
    // AuthContext hasn't been refreshed yet.
    const { data: prefs } = await supabase
      .from("profiles")
      .select("notif_likes, notif_follows, notif_milestones, notif_comments")
      .eq("id", session.user.id)
      .single();

    const notifLikes = prefs?.notif_likes ?? profile?.notif_likes ?? true;
    const notifFollows = prefs?.notif_follows ?? profile?.notif_follows ?? true;
    const notifMilestones = prefs?.notif_milestones ?? profile?.notif_milestones ?? true;
    const notifComments = prefs?.notif_comments ?? profile?.notif_comments ?? true;

    // 1. Likes on my hikes
    const { data: myHikes } = await supabase
      .from("hikes")
      .select("id, trail_name")
      .eq("user_id", session.user.id);

    if (notifLikes && myHikes && myHikes.length > 0) {
      const hikeIds = myHikes.map((h: any) => h.id);
      const { data: likes } = await supabase
        .from("likes")
        // user_id is selected so the key can use the row's real primary key
        // (user_id, hike_id) rather than a timestamp that two rows could share.
        .select("user_id, hike_id, created_at, profiles(full_name, username)")
        .in("hike_id", hikeIds)
        .neq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (likes) {
        likes.forEach((l: any) => {
          const hike = myHikes.find((h: any) => h.id === l.hike_id);
          const name = displayName(l.profiles);
          results.push({
            id: `like-${l.user_id}-${l.hike_id}`,
            icon: "heart",
            color: "#c46060",
            text: `${name} liked your hike on ${hike?.trail_name || "a trail"}`,
            time: timeAgo(l.created_at),
            sortAt: l.created_at,
          });
        });
      }
    }

    // 2. New followers (accepted only)
    const { data: followers } = await supabase
      .from("follows")
      .select("follower_id, created_at, profiles(full_name, username)")
      .eq("following_id", session.user.id)
      .eq("status", "accepted")
      .order("created_at", { ascending: false })
      .limit(10);

    if (notifFollows && followers) {
      followers.forEach((f: any) => {
        const name = displayName(f.profiles);
        results.push({
          id: `follow-${f.follower_id}`,
          icon: "user-plus",
          color: "#7ab8c8",
          text: `${name} started following you`,
          time: timeAgo(f.created_at),
          sortAt: f.created_at,
        });
      });
    }

    // Fetch pending follow requests (always, regardless of notif prefs)
    const { data: requests } = await supabase
      .from("follows")
      .select("follower_id, created_at, profiles(full_name, username, avatar_url, avatar_preset)")
      .eq("following_id", session.user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (requests) {
      setFollowRequests(requests.map((r: any) => ({
        follower_id: r.follower_id,
        created_at: r.created_at,
        full_name: r.profiles?.full_name ?? null,
        username: r.profiles?.username ?? null,
        avatar_url: r.profiles?.avatar_url ?? null,
        avatar_preset: r.profiles?.avatar_preset ?? null,
      })));
    }

    // 3. Comments on my hikes
    if (notifComments && myHikes && myHikes.length > 0) {
      const hikeIds = myHikes.map((h: any) => h.id);
      const { data: comments } = await supabase
        .from("comments")
        // `id` is the comment's primary key — a stabler key than hike + timestamp.
        .select("id, hike_id, created_at, profiles(full_name, username)")
        .in("hike_id", hikeIds)
        .neq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (comments) {
        comments.forEach((c: any) => {
          const hike = myHikes.find((h: any) => h.id === c.hike_id);
          const name = displayName(c.profiles);
          results.push({
            id: `comment-${c.id}`,
            icon: "message-circle",
            color: "#8a7ec8",
            text: `${name} commented on your hike on ${hike?.trail_name || "a trail"}`,
            time: timeAgo(c.created_at),
            sortAt: c.created_at,
          });
        });
      }
    }

    // 4. Badges actually awarded. Read from `user_badges` — the server record —
    // rather than recomputed from hike count, so this list can't disagree with
    // the profile grid, and every badge is covered instead of just two.
    if (notifMilestones) {
      const { data: badges } = await supabase
        .from("user_badges")
        .select("badge_key, awarded_at")
        .eq("user_id", session.user.id);

      (badges || []).forEach((b: any) => {
        const def = findBadgeDefinition(b.badge_key);
        if (!def) return;
        results.push({
          id: `badge-${b.badge_key}`,
          icon: "award",
          color: "#d4943a",
          text: `You earned the ${def.announce(distanceUnit)}`,
          time: timeAgo(b.awarded_at),
          sortAt: b.awarded_at,
        });
      });
    }

    // Every entry now carries a real timestamp, so this is a genuine
    // most-recent-first ordering rather than fetch order.
    results.sort((a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime());

    setNotifs(results);
    setLoading(false);
    setRefreshing(false);
  };

  // Keyed on the user id, not the session object: Supabase hands back a new
  // session on every token refresh, which re-ran this whole fetch each time.
  useEffect(() => { fetchNotifs(); }, [session?.user.id]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Feather name="chevron-left" size={28} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.accent} size="large" /></View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchNotifs(); }} tintColor={Colors.accent} />}
        >
          {/* Follow Requests section */}
          {followRequests.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>Follow Requests ({followRequests.length})</Text>
              {followRequests.map(req => (
                <View key={req.follower_id} style={styles.requestItem}>
                  <Avatar profile={{ ...req, id: req.follower_id }} size={40} />
                  <Text style={styles.requestName} numberOfLines={1}>{displayName(req)}</Text>
                  <View style={styles.requestActions}>
                    <Pressable
                      onPress={() => acceptRequest(req.follower_id)}
                      style={({ pressed }) => [styles.acceptBtn, { opacity: pressed ? 0.7 : 1 }]}
                    >
                      <Text style={styles.acceptBtnText}>Accept</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => declineRequest(req.follower_id)}
                      style={({ pressed }) => [styles.declineBtn, { opacity: pressed ? 0.7 : 1 }]}
                    >
                      <Text style={styles.declineBtnText}>Decline</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
              {notifs.length > 0 && <Text style={styles.sectionLabel}>Recent Activity</Text>}
            </>
          )}

          {notifs.length === 0 && followRequests.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="bell" size={40} color={Colors.text3} />
              <Text style={styles.emptyTitle}>No notifications yet</Text>
              <Text style={styles.emptySubtext}>When someone likes your hike or follows you, it'll show up here</Text>
            </View>
          ) : (
            notifs.map((n) => (
              <View key={n.id} style={styles.item}>
                <View style={[styles.iconWrap, { backgroundColor: n.color + "22", borderColor: n.color + "44" }]}>
                  <Feather name={n.icon} size={18} color={n.color} />
                </View>
                <View style={styles.textWrap}>
                  <Text style={styles.notifText}>{n.text}</Text>
                  <Text style={styles.notifTime}>{n.time}</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 4 },
  backBtn: { marginLeft: -6, marginRight: 4, padding: 2 },
  title: { fontFamily: "Inter_700Bold", fontSize: 26, color: Colors.text, letterSpacing: -0.5 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { paddingVertical: 8, paddingBottom: 40 },
  empty: { alignItems: "center", paddingTop: 80, paddingHorizontal: 32, gap: 12 },
  emptyTitle: { fontFamily: "Inter_600SemiBold", fontSize: 18, color: Colors.text2 },
  emptySubtext: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text3, textAlign: "center", lineHeight: 20 },
  item: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingVertical: 14, paddingHorizontal: 20,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  iconWrap: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", borderWidth: 1, flexShrink: 0 },
  textWrap: { flex: 1, gap: 3 },
  notifText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text, lineHeight: 20 },
  notifTime: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text3 },
  sectionLabel: { fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: Colors.text3, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8, fontFamily: "Inter_500Medium" },
  requestItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
  requestName: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.text },
  requestActions: { flexDirection: "row", gap: 8 },
  acceptBtn: { paddingVertical: 7, paddingHorizontal: 16, borderRadius: 16, backgroundColor: Colors.green2 },
  acceptBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#fff" },
  declineBtn: { paddingVertical: 7, paddingHorizontal: 16, borderRadius: 16, borderWidth: 1, borderColor: Colors.border2 },
  declineBtnText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text3 },
});

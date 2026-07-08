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

type Notif = {
  id: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  color: string;
  text: string;
  time: string;
};

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

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const router = useRouter();
  const { session, profile } = useAuth();

  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
        .select("hike_id, created_at, profiles(full_name)")
        .in("hike_id", hikeIds)
        .neq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (likes) {
        likes.forEach((l: any) => {
          const hike = myHikes.find((h: any) => h.id === l.hike_id);
          const name = l.profiles?.full_name || "Someone";
          results.push({
            id: `like-${l.hike_id}-${l.created_at}`,
            icon: "heart",
            color: "#c46060",
            text: `${name} liked your hike on ${hike?.trail_name || "a trail"}`,
            time: timeAgo(l.created_at),
          });
        });
      }
    }

    // 2. New followers
    const { data: followers } = await supabase
      .from("follows")
      .select("follower_id, created_at, profiles(full_name)")
      .eq("following_id", session.user.id)
      .order("created_at", { ascending: false })
      .limit(10);

    if (notifFollows && followers) {
      followers.forEach((f: any) => {
        const name = f.profiles?.full_name || "Someone";
        results.push({
          id: `follow-${f.follower_id}`,
          icon: "user-plus",
          color: "#7ab8c8",
          text: `${name} started following you`,
          time: timeAgo(f.created_at),
        });
      });
    }

    // 3. Comments on my hikes
    if (notifComments && myHikes && myHikes.length > 0) {
      const hikeIds = myHikes.map((h: any) => h.id);
      const { data: comments } = await supabase
        .from("comments")
        .select("hike_id, created_at, profiles(full_name)")
        .in("hike_id", hikeIds)
        .neq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(10);

      if (comments) {
        comments.forEach((c: any) => {
          const hike = myHikes.find((h: any) => h.id === c.hike_id);
          const name = c.profiles?.full_name || "Someone";
          results.push({
            id: `comment-${c.hike_id}-${c.created_at}`,
            icon: "message-circle",
            color: "#8a7ec8",
            text: `${name} commented on your hike on ${hike?.trail_name || "a trail"}`,
            time: timeAgo(c.created_at),
          });
        });
      }
    }

    // 4. Badge milestones based on hike count
    if (notifMilestones && myHikes) {
      if (myHikes.length >= 10) {
        results.push({
          id: "badge-summit",
          icon: "award",
          color: "#d4943a",
          text: "You earned the Summit badge — 10 hikes logged!",
          time: "earned",
        });
      } else if (myHikes.length >= 5) {
        results.push({
          id: "badge-explorer",
          icon: "award",
          color: "#7ab8c8",
          text: "You earned the Explorer badge — 5 hikes logged!",
          time: "earned",
        });
      }
    }

    // Sort by most recent first (badge notifications go to end)
    results.sort((a, b) => {
      if (a.time === "earned") return 1;
      if (b.time === "earned") return -1;
      return 0;
    });

    setNotifs(results);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { fetchNotifs(); }, [session]);

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
          {notifs.length === 0 ? (
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
});

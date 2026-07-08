import { Feather } from "@expo/vector-icons";
  import { useLocalSearchParams, useRouter } from "expo-router";
  import React, { useEffect, useState } from "react";
  import {
    ActivityIndicator,
    Alert,
    Image,
    Platform,
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
  import { sendPushNotification } from "@/lib/notifications";
  import { formatDistance, formatElevation } from "@/lib/units";

  type Profile = { id: string; full_name: string | null; bio: string | null; avatar_url: string | null; };
  type Hike = { id: string; trail_name: string; location: string; distance_mi: number; elevation_ft: number; overall_score: number; difficulty: string; date: string; };

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function getInitials(name: string | null) {
    if (!name) return "?";
    return name.split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
  }

  function getDiffColor(diff: string) {
    switch (diff?.toLowerCase()) {
      case "easy": return Colors.green;
      case "moderate": return Colors.amber;
      case "hard": return Colors.red;
      default: return Colors.text3;
    }
  }

  export default function UserProfileScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const { session, profile: myProfile } = useAuth();
    const distanceUnit = myProfile?.distance_unit ?? "imperial";

    const [profile, setProfile] = useState<Profile | null>(null);
    const [hikes, setHikes] = useState<Hike[]>([]);
    const [isFollowing, setIsFollowing] = useState(false);
    const [followerCount, setFollowerCount] = useState(0);
    const [followingCount, setFollowingCount] = useState(0);
    const [loading, setLoading] = useState(true);
    const [followLoading, setFollowLoading] = useState(false);
    const [isBlocked, setIsBlocked] = useState(false);
    const [blockLoading, setBlockLoading] = useState(false);

    useEffect(() => {
      const load = async () => {
        const [{ data: p }, { data: h }] = await Promise.all([
          supabase.from("profiles").select("*").eq("id", id).single(),
          supabase.from("hikes").select("*").eq("user_id", id).order("date", { ascending: false }).limit(20),
        ]);
        if (p) setProfile(p);
        if (h) setHikes(h);

        const [{ count: followers }, { count: following }] = await Promise.all([
          supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", id),
          supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", id),
        ]);
        setFollowerCount(followers || 0);
        setFollowingCount(following || 0);

        if (session) {
          const [{ data: f }, { data: b }] = await Promise.all([
            supabase.from("follows").select("follower_id").eq("follower_id", session.user.id).eq("following_id", id).single(),
            supabase.from("blocks").select("id").eq("blocker_id", session.user.id).eq("blocked_id", id).single(),
          ]);
          setIsFollowing(!!f);
          setIsBlocked(!!b);
        }
        setLoading(false);
      };
      load();
    }, [id]);

    const toggleFollow = async () => {
      if (!session) return;
      setFollowLoading(true);
      if (isFollowing) {
        await supabase.from("follows").delete().eq("follower_id", session.user.id).eq("following_id", id);
        setIsFollowing(false);
        setFollowerCount(c => Math.max(c - 1, 0));
      } else {
        await supabase.from("follows").insert({ follower_id: session.user.id, following_id: id });
        setIsFollowing(true);
        setFollowerCount(c => c + 1);
        sendPushNotification({
          targetUserId: id,
          type: "follow",
          title: "New follower",
          body: `${myProfile?.full_name || "Someone"} started following you`,
          data: { userId: session.user.id },
        });
      }
      setFollowLoading(false);
    };

    const handleBlock = () => {
      if (!session) return;
      const name = profile?.full_name || "this user";
      if (isBlocked) {
        Alert.alert("Unblock " + name + "?", "They will be able to see your posts again.", [
          { text: "Cancel", style: "cancel" },
          { text: "Unblock", onPress: async () => {
            setBlockLoading(true);
            await supabase.from("blocks").delete().eq("blocker_id", session.user.id).eq("blocked_id", id);
            setIsBlocked(false);
            setBlockLoading(false);
          }},
        ]);
      } else {
        Alert.alert(
          "Block " + name + "?",
          "They won't be able to see your posts and you won't see theirs.",
          [
            { text: "Cancel", style: "cancel" },
            { text: "Block", style: "destructive", onPress: async () => {
              setBlockLoading(true);
              await supabase.from("blocks").insert({ blocker_id: session.user.id, blocked_id: id });
              setIsBlocked(true);
              setBlockLoading(false);
            }},
          ]
        );
      }
    };

    if (loading) return <View style={[styles.container, styles.center]}><ActivityIndicator color={Colors.accent} size="large" /></View>;
    if (!profile) return <View style={[styles.container, styles.center]}><Text style={styles.emptyText}>User not found</Text></View>;

    const isOwnProfile = session?.user.id === id;
    const totalMiles = hikes.reduce((s, h) => s + (h.distance_mi || 0), 0);
    const totalElev = hikes.reduce((s, h) => s + (h.elevation_ft || 0), 0);

    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => router.back()} style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}>
            <Feather name="chevron-left" size={28} color={Colors.text} />
          </Pressable>
          <Text style={styles.headerTitle} numberOfLines={1}>{profile.full_name || "Profile"}</Text>
          {!isOwnProfile ? (
            <Pressable
              onPress={handleBlock}
              disabled={blockLoading}
              style={({ pressed }) => [styles.moreBtn, { opacity: pressed || blockLoading ? 0.6 : 1 }]}
            >
              <Feather name={isBlocked ? "user-x" : "more-vertical"} size={20} color={isBlocked ? Colors.red : Colors.text3} />
            </Pressable>
          ) : (
            <View style={{ width: 36 }} />
          )}
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
          <View style={styles.profileTop}>
            <View style={styles.avatarWrap}>
              {profile.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatarImg} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarText}>{getInitials(profile.full_name)}</Text>
                </View>
              )}
            </View>
            <Text style={styles.name}>{profile.full_name || "Anonymous Hiker"}</Text>
            {profile.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

            <View style={styles.statsRow}>
              <View style={styles.statCell}><Text style={styles.statVal}>{hikes.length}</Text><Text style={styles.statLbl}>Hikes</Text></View>
              <View style={styles.statCell}><Text style={styles.statVal}>{totalMiles.toFixed(0)}</Text><Text style={styles.statLbl}>Miles</Text></View>
              <View style={styles.statCell}><Text style={styles.statVal}>{totalElev >= 1000 ? `${(totalElev / 1000).toFixed(1)}k` : totalElev}</Text><Text style={styles.statLbl}>Elev. ft</Text></View>
              <View style={styles.statCell}><Text style={styles.statVal}>{followerCount}</Text><Text style={styles.statLbl}>Followers</Text></View>
              <View style={styles.statCell}><Text style={styles.statVal}>{followingCount}</Text><Text style={styles.statLbl}>Following</Text></View>
            </View>

            {!isOwnProfile && (
              <View style={styles.actionRow}>
                <Pressable
                  onPress={toggleFollow}
                  disabled={followLoading}
                  style={({ pressed }) => [styles.followBtn, isFollowing && styles.followingBtn, { opacity: pressed || followLoading ? 0.7 : 1 }]}
                >
                  <Feather name={isFollowing ? "user-check" : "user-plus"} size={15} color={isFollowing ? Colors.text3 : "#fff"} />
                  <Text style={[styles.followBtnText, isFollowing && styles.followingBtnText]}>
                    {isFollowing ? "Following" : "Follow"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleBlock}
                  disabled={blockLoading}
                  style={({ pressed }) => [styles.blockBtn, isBlocked && styles.blockedBtn, { opacity: pressed || blockLoading ? 0.7 : 1 }]}
                >
                  <Feather name={isBlocked ? "user-x" : "slash"} size={14} color={isBlocked ? Colors.red : Colors.text3} />
                  <Text style={[styles.blockBtnText, isBlocked && styles.blockedBtnText]}>
                    {isBlocked ? "Blocked" : "Block"}
                  </Text>
                </Pressable>
              </View>
            )}

            {isBlocked && (
              <View style={styles.blockedBanner}>
                <Feather name="alert-circle" size={14} color={Colors.red} />
                <Text style={styles.blockedBannerText}>You have blocked this user. Their content is hidden from your feed.</Text>
              </View>
            )}
          </View>

          <Text style={styles.sectionLabel}>Hikes ({hikes.length})</Text>

          {hikes.length === 0 ? (
            <View style={styles.empty}>
              <Feather name="map" size={32} color={Colors.text3} />
              <Text style={styles.emptyText}>No hikes logged yet</Text>
            </View>
          ) : (
            hikes.map(hike => {
              const dc = getDiffColor(hike.difficulty);
              return (
                <View key={hike.id} style={styles.hikeItem}>
                  <View style={styles.hikeIcon}><Feather name="trending-up" size={16} color={Colors.green} /></View>
                  <View style={styles.hikeInfo}>
                    <Text style={styles.hikeName} numberOfLines={1}>{hike.trail_name}</Text>
                    <Text style={styles.hikeMeta}>{formatDistance(hike.distance_mi, distanceUnit)} · {formatElevation(hike.elevation_ft, distanceUnit)} · {formatDate(hike.date)}</Text>
                  </View>
                  <View style={styles.hikeRight}>
                    {hike.overall_score > 0 && (
                      <View style={styles.hikeRating}>
                        <Feather name="star" size={11} color={Colors.amber2} />
                        <Text style={styles.hikeRatingText}>{hike.overall_score.toFixed(1)}</Text>
                      </View>
                    )}
                    <View style={[styles.diffDot, { backgroundColor: dc }]} />
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      </View>
    );
  }

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    center: { alignItems: "center", justifyContent: "center" },
    header: { paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    backBtn: { padding: 2, marginLeft: -6 },
    headerTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text, flex: 1, textAlign: "center" },
    moreBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
    profileTop: { alignItems: "center", paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 },
    avatarWrap: { marginBottom: 12 },
    avatarImg: { width: 74, height: 74, borderRadius: 37, borderWidth: 2.5, borderColor: Colors.green },
    avatarFallback: { width: 74, height: 74, borderRadius: 37, backgroundColor: Colors.surface2, borderWidth: 2.5, borderColor: Colors.green, alignItems: "center", justifyContent: "center" },
    avatarText: { fontFamily: "Inter_700Bold", fontSize: 28, color: Colors.accent },
    name: { fontFamily: "Inter_700Bold", fontSize: 22, color: Colors.text, marginBottom: 4 },
    bio: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text3, textAlign: "center", marginBottom: 16, paddingHorizontal: 20 },
    statsRow: { flexDirection: "row", width: "100%", borderRadius: 12, overflow: "hidden", gap: 1, backgroundColor: Colors.border, marginBottom: 16 },
    statCell: { flex: 1, backgroundColor: Colors.bg3, paddingVertical: 12, alignItems: "center" },
    statVal: { fontFamily: "Inter_700Bold", fontSize: 16, color: Colors.accent },
    statLbl: { fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.text3, textTransform: "uppercase", letterSpacing: 0.3, marginTop: 2 },
    actionRow: { flexDirection: "row", gap: 10, alignItems: "center" },
    followBtn: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 20, backgroundColor: Colors.green2 },
    followingBtn: { backgroundColor: "transparent", borderWidth: 1, borderColor: Colors.border2 },
    followBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
    followingBtnText: { color: Colors.text3 },
    blockBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: Colors.border2, backgroundColor: Colors.bg3 },
    blockedBtn: { borderColor: Colors.red, backgroundColor: "rgba(196,96,96,0.08)" },
    blockBtnText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text3 },
    blockedBtnText: { color: Colors.red },
    blockedBanner: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 14, padding: 12, backgroundColor: "rgba(196,96,96,0.08)", borderRadius: 10, borderWidth: 1, borderColor: "rgba(196,96,96,0.3)" },
    blockedBannerText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.red, lineHeight: 18 },
    sectionLabel: { fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: Colors.text3, paddingHorizontal: 20, paddingBottom: 10, paddingTop: 4, fontFamily: "Inter_500Medium" },
    empty: { alignItems: "center", paddingTop: 40, gap: 10 },
    emptyText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text3 },
    hikeItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
    hikeIcon: { width: 36, height: 36, borderRadius: 9, backgroundColor: Colors.surface, alignItems: "center", justifyContent: "center" },
    hikeInfo: { flex: 1 },
    hikeName: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.text, marginBottom: 2 },
    hikeMeta: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text3 },
    hikeRight: { flexDirection: "row", alignItems: "center", gap: 8 },
    hikeRating: { flexDirection: "row", alignItems: "center", gap: 3 },
    hikeRatingText: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.amber2 },
    diffDot: { width: 8, height: 8, borderRadius: 4 },
  });
  
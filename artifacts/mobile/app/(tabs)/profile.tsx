import { Feather } from "@expo/vector-icons";
  import { useRouter } from "expo-router";
  import React, { useEffect, useState } from "react";
  import {
    ActivityIndicator,
    Alert,
    Modal,
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
  import { useAuth } from "@/context/AuthContext";
  import { useHikes } from "@/context/HikesContext";
  import { supabase } from "@/lib/supabase";
  import { BADGE_DEFINITIONS, badgeProgress, isEarlyBirdStart, nextBadgeGoal } from "@/lib/badges";
  import { displayName, formatShortDate, getDiffColor } from "@/lib/format";
  import Avatar from "@/components/Avatar";
  import EmptyState from "@/components/EmptyState";
  import HikeRowIcon from "@/components/HikeRowIcon";
  import {
    distanceFromMiles,
    elevationFromFeet,
    elevationUnitLabel,
    formatDistance,
    formatElevation,
  } from "@/lib/units";

  type SavedTrail = { id: string; name: string; location: string; difficulty: string; rating: number; distance_mi: number; elevation_ft: number; };
  type FollowUser = { id: string; full_name: string | null; username: string | null; avatar_url: string | null; avatar_preset: string | null; };

  // Icon and colour are the only presentation-specific parts of a badge; the
  // name, the copy and the earning rule all come from lib/badges so this screen
  // can't drift from the notifications list or the award logic.
  const BADGE_VISUALS: Record<string, { icon: React.ComponentProps<typeof Feather>["name"]; color: string }> = {
    climber:     { icon: "trending-up", color: Colors.green },
    explorer:    { icon: "map",         color: Colors.sky },
    summit:      { icon: "award",       color: Colors.amber },
    trailblazer: { icon: "zap",         color: "#a89fd4" },
    earlybird:   { icon: "sun",         color: Colors.amber2 },
  };

  const BADGES = BADGE_DEFINITIONS.map(def => ({
    ...def,
    ...(BADGE_VISUALS[def.key] ?? { icon: "award" as const, color: Colors.text3 }),
  }));

  function StatCell({ value, label, onPress }: { value: string; label: string; onPress?: () => void }) {
    return (
      <Pressable style={styles.statCell} onPress={onPress} disabled={!onPress}>
        <Text style={styles.statCellVal}>{value}</Text>
        <Text style={styles.statCellLbl}>{label}</Text>
      </Pressable>
    );
  }

  export default function ProfileScreen() {
    const { profile, signOut } = useAuth();
    const distanceUnit = profile?.distance_unit ?? "imperial";
    const { hikes, awardedBadgeKeys, refresh, loading: hikesLoading } = useHikes();
    const insets = useSafeAreaInsets();
    const topPad = Platform.OS === "web" ? 67 : insets.top;
    const router = useRouter();

    const [activeTab, setActiveTab] = useState<"hikes" | "saved">("hikes");
    const [followingCount, setFollowingCount] = useState(0);
    const [followerCount, setFollowerCount] = useState(0);
    const [savedTrails, setSavedTrails] = useState<SavedTrail[]>([]);
    const [savedLoading, setSavedLoading] = useState(false);
    const [selectedBadge, setSelectedBadge] = useState<typeof BADGES[0] | null>(null);
    const [showFollowModal, setShowFollowModal] = useState<"followers" | "following" | null>(null);
    const [followUsers, setFollowUsers] = useState<FollowUser[]>([]);
    const [followModalLoading, setFollowModalLoading] = useState(false);
    const [pendingCount, setPendingCount] = useState(0);

    const totalMiles = hikes.reduce((s, h) => s + h.distanceMi, 0);
    const totalElev  = hikes.reduce((s, h) => s + (h.elevationFt ?? 0), 0);
    const hasEarlyHike = hikes.some(h => isEarlyBirdStart(h.date));

    const fetchCounts = async () => {
      if (!profile) return;
      const [{ count: following }, { count: followers }] = await Promise.all([
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("follower_id", profile.id).eq("status", "accepted"),
        supabase.from("follows").select("*", { count: "exact", head: true }).eq("following_id", profile.id).eq("status", "accepted"),
      ]);
      setFollowingCount(following || 0);
      setFollowerCount(followers || 0);
    };

    const fetchSaved = async () => {
      if (!profile) return;
      setSavedLoading(true);
      const { data: trailsData } = await supabase.from("want_to_hike").select("trail_id, trails(*)").eq("user_id", profile.id).order("created_at", { ascending: false });
      if (trailsData) setSavedTrails(trailsData.map((d: any) => d.trails).filter(Boolean));
      setSavedLoading(false);
    };

    const openFollowModal = async (type: "followers" | "following") => {
      if (!profile) return;
      setShowFollowModal(type);
      setFollowModalLoading(true);
      let userIds: string[] = [];
      if (type === "followers") {
        const { data } = await supabase.from("follows").select("follower_id").eq("following_id", profile.id).eq("status", "accepted");
        userIds = (data || []).map((f: any) => f.follower_id);
        // Pending requests are a different thing from followers and are counted
        // separately — but the modal used to filter them out entirely and then
        // say "No followers yet", which denies that anyone had asked. A private
        // account with five waiting requests was told nobody was there.
        const { count } = await supabase
          .from("follows")
          .select("*", { count: "exact", head: true })
          .eq("following_id", profile.id)
          .eq("status", "pending");
        setPendingCount(count || 0);
      } else {
        const { data } = await supabase.from("follows").select("following_id").eq("follower_id", profile.id).eq("status", "accepted");
        userIds = (data || []).map((f: any) => f.following_id);
      }
      if (userIds.length > 0) {
        const { data: users } = await supabase.from("profiles").select("id, full_name, username, avatar_url, avatar_preset").in("id", userIds);
        setFollowUsers(users || []);
      } else {
        setFollowUsers([]);
      }
      setFollowModalLoading(false);
    };

    useEffect(() => { fetchCounts(); fetchSaved(); }, [profile?.id]);

    const onRefresh = async () => { await Promise.all([refresh(), fetchCounts(), fetchSaved()]); };

    const unsaveTrail = async (trailId: string) => {
      if (!profile) return;
      await supabase.from("want_to_hike").delete().eq("user_id", profile.id).eq("trail_id", trailId);
      setSavedTrails(prev => prev.filter(t => t.id !== trailId));
    };

    const elevLabel = `Elev. ${elevationUnitLabel(distanceUnit)}`;

    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: topPad + 8 }]}>
          <Text style={styles.title}>Profile</Text>
          <Pressable onPress={() => router.push("/settings")} style={({ pressed }) => [styles.settingsBtn, { opacity: pressed ? 0.6 : 1 }]}>
            <Feather name="settings" size={20} color={Colors.text3} />
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 84 : 100 }}
          refreshControl={<RefreshControl refreshing={hikesLoading} onRefresh={onRefresh} tintColor={Colors.accent} />}
        >
          <View style={styles.profileHeader}>
            <Pressable onPress={() => router.push("/settings")} style={styles.avatarWrap}>
              <Avatar profile={profile} size={74} ringWidth={2.5} />
              <View style={styles.avatarEditDot}>
                <Feather name="camera" size={10} color="#fff" />
              </View>
            </Pressable>
            <Text style={styles.name}>{displayName(profile)}</Text>
            <Text style={styles.bio}>{profile?.bio || "Exploring trails one step at a time"}</Text>

            <View style={styles.statsRow}>
              <StatCell value={hikes.length.toString()} label="Hikes" />
              <StatCell value={distanceFromMiles(totalMiles, distanceUnit).toFixed(1)} label={distanceUnit === "metric" ? "Km" : "Miles"} />
              <StatCell value={Math.round(elevationFromFeet(totalElev, distanceUnit)).toLocaleString()} label={elevLabel} />
              <StatCell value={followingCount.toString()} label="Following" onPress={() => openFollowModal("following")} />
              <StatCell value={followerCount.toString()} label="Followers" onPress={() => openFollowModal("followers")} />
            </View>
            {profile?.is_private && (
              <Pressable
                onPress={() => router.push("/notifications")}
                style={({ pressed }) => [styles.requestsLink, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Feather name="users" size={14} color={Colors.accent} />
                <Text style={styles.requestsLinkText}>Manage Follow Requests</Text>
                <Feather name="chevron-right" size={14} color={Colors.accent} />
              </Pressable>
            )}
          </View>

          {/* Badges */}
          <View style={styles.badgesSection}>
            <Text style={styles.sectionLabel}>Badges</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badgesRow}>
              {BADGES.map(b => {
                // Server record wins: once awarded, a badge stays earned even
                // if the hikes behind it are later deleted. The local check is
                // only a fallback for an award still in flight.
                const unlocked = awardedBadgeKeys.has(b.key) || b.check(hikes.length, totalElev, hasEarlyHike);
                return (
                  <Pressable key={b.key} style={[styles.badge, !unlocked && styles.badgeLocked]} onPress={() => setSelectedBadge(b)}>
                    <View style={[styles.badgeIcon, { borderColor: unlocked ? b.color : Colors.border }]}>
                      <Feather name={b.icon} size={22} color={unlocked ? b.color : Colors.text3} />
                    </View>
                    <Text style={[styles.badgeLabel, !unlocked && { color: Colors.text3 }]}>{b.name}</Text>
                    {unlocked && <View style={styles.badgeCheck}><Feather name="check" size={8} color="#fff" /></View>}
                  </Pressable>
                );
              })}
            </ScrollView>
            {/* The nudge, without requiring a tap. badgeProgress() has always
                existed but only rendered inside the badge modal, so the one
                screen element that tells you how close you are was reachable
                only by tapping a badge you had no reason to tap. Renders
                nothing once every badge is earned -- an empty "nothing left"
                row would be a worse reward than silence. */}
            {(() => {
              const goal = nextBadgeGoal(hikes.length, totalElev, hasEarlyHike, awardedBadgeKeys, distanceUnit);
              if (!goal) return null;
              return (
                <View style={styles.badgeGoal}>
                  <Feather name="target" size={12} color={Colors.text3} />
                  <Text style={styles.badgeGoalText}>{goal.message}</Text>
                </View>
              );
            })()}
          </View>

          {/* Tab switcher */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabSwitcherContent} style={styles.tabSwitcherWrap}>
            <Pressable onPress={() => setActiveTab("hikes")} style={[styles.tabBtn, activeTab === "hikes" && styles.tabBtnActive]}>
              <Feather name="trending-up" size={14} color={activeTab === "hikes" ? "#fff" : Colors.text3} />
              <Text style={[styles.tabBtnText, activeTab === "hikes" && styles.tabBtnTextActive]}>Hikes ({hikes.length})</Text>
            </Pressable>
            <Pressable onPress={() => setActiveTab("saved")} style={[styles.tabBtn, activeTab === "saved" && styles.tabBtnActive]}>
              <Feather name="bookmark" size={14} color={activeTab === "saved" ? "#fff" : Colors.text3} />
              <Text style={[styles.tabBtnText, activeTab === "saved" && styles.tabBtnTextActive]}>Saved ({savedTrails.length})</Text>
            </Pressable>
          </ScrollView>

          {/* Hikes tab */}
          {activeTab === "hikes" && (
            hikes.length === 0 ? (
              // Gated on hikesLoading. This was wired only to the RefreshControl,
              // so a cold start asserted "No hikes yet" to someone who has hikes
              // — and a Log a Hike button on that lie would be worse than the
              // silence it replaces.
              hikesLoading ? (
                <View style={styles.empty}><ActivityIndicator color={Colors.accent} /></View>
              ) : (
                <EmptyState
                  icon="map"
                  iconSize={36}
                  title="No hikes yet"
                  message="Log your first hike to get started."
                  actionLabel="Log a Hike"
                  onAction={() => router.push("/(tabs)/log")}
                />
              )
            ) : (
              hikes.map(hike => (
                <Pressable
                  key={hike.id}
                  onPress={() => router.push({ pathname: "/hike-detail", params: { id: hike.id } })}
                  style={({ pressed }) => [styles.hikeItem, { opacity: pressed ? 0.6 : 1 }]}
                >
                  <HikeRowIcon tags={hike.trailTags} size={40} />
                  <View style={styles.hikeInfo}>
                    <Text style={styles.hikeName} numberOfLines={1}>{hike.trailName}</Text>
                    <Text style={styles.hikeMeta}>{formatDistance(hike.distanceMi, distanceUnit)} · {hike.elevationFt != null ? formatElevation(hike.elevationFt, distanceUnit) : "—"} · {formatShortDate(hike.date)}</Text>
                  </View>
                  {hike.overallScore > 0 && (
                    <View style={styles.hikeRating}>
                      <Feather name="star" size={12} color={Colors.amber2} />
                      <Text style={styles.hikeRatingText}>{hike.overallScore.toFixed(1)}</Text>
                    </View>
                  )}
                </Pressable>
              ))
            )
          )}

          {/* Saved tab */}
          {activeTab === "saved" && (
            savedLoading ? (
              <View style={styles.empty}><ActivityIndicator color={Colors.accent} /></View>
            ) : savedTrails.length === 0 ? (
              <EmptyState
                icon="bookmark"
                iconSize={36}
                title="Nothing saved yet"
                message="Bookmark trails from Discover to save them here."
                actionLabel="Browse trails"
                onAction={() => router.push("/(tabs)/discover")}
              />
            ) : (
              <>
                <Text style={styles.savedSectionLabel}>Saved Trails</Text>
                {savedTrails.map(trail => {
                  const dc = getDiffColor(trail.difficulty);
                  return (
                    <Pressable key={trail.id} style={({ pressed }) => [styles.savedCard, { opacity: pressed ? 0.9 : 1 }]} onPress={() => router.push({ pathname: "/trail-detail", params: { id: trail.id } })}>
                      <View style={styles.savedCardLeft}>
                        <View style={styles.savedCardHeader}>
                          <Text style={styles.savedTrailName} numberOfLines={1}>{trail.name}</Text>
                          <Pressable onPress={() => unsaveTrail(trail.id)} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
                            <Feather name="bookmark" size={16} color={Colors.accent} />
                          </Pressable>
                        </View>
                        <Text style={styles.savedTrailLocation}>{trail.location}</Text>
                        <View style={styles.savedTrailStats}>
                          <View style={[styles.savedDiffBadge, { borderColor: dc + "55", backgroundColor: dc + "18" }]}>
                            <Text style={[styles.savedDiffText, { color: dc }]}>{trail.difficulty}</Text>
                          </View>
                          <Text style={styles.savedStatText}>{formatDistance(trail.distance_mi, distanceUnit)}</Text>
                          <Text style={styles.savedStatText}>{formatElevation(trail.elevation_ft, distanceUnit)}</Text>
                        </View>
                      </View>
                      <Feather name="chevron-right" size={16} color={Colors.text3} />
                    </Pressable>
                  );
                })}
              </>
            )
          )}

          <Pressable onPress={signOut} style={({ pressed }) => [styles.signOutBtn, { opacity: pressed ? 0.7 : 1 }]}>
            <Text style={styles.signOutText}>Sign Out</Text>
          </Pressable>
        </ScrollView>

        {/* Badge info modal */}
        <Modal visible={!!selectedBadge} transparent animationType="fade">
          <Pressable style={styles.modalOverlay} onPress={() => setSelectedBadge(null)}>
            <View style={styles.badgeModal}>
              {selectedBadge && (() => {
                // Matches the grid above: the server record wins, so a badge
                // can't read as earned in one place and unearned in the other.
                const unlocked =
                  awardedBadgeKeys.has(selectedBadge.key) ||
                  selectedBadge.check(hikes.length, totalElev, hasEarlyHike);
                return (
                  <>
                    <View style={[styles.badgeModalIcon, { borderColor: unlocked ? selectedBadge.color : Colors.border, opacity: unlocked ? 1 : 0.5 }]}>
                      <Feather name={selectedBadge.icon} size={32} color={unlocked ? selectedBadge.color : Colors.text3} />
                    </View>
                    <Text style={styles.badgeModalName}>{selectedBadge.name}</Text>
                    <Text style={styles.badgeModalDesc}>{selectedBadge.describe(distanceUnit)}</Text>
                    {unlocked ? (
                      <View style={styles.badgeModalUnlocked}>
                        <Feather name="check-circle" size={14} color={Colors.green} />
                        <Text style={styles.badgeModalUnlockedText}>Unlocked!</Text>
                      </View>
                    ) : (
                      <View style={styles.badgeModalLocked}>
                        <Feather name="lock" size={14} color={Colors.text3} />
                        <Text style={styles.badgeModalLockedText}>Keep hiking to earn this</Text>
                      </View>
                    )}
                    {!unlocked && (() => {
                      const progress = badgeProgress(selectedBadge.key, hikes.length, totalElev, distanceUnit);
                      return progress ? <Text style={styles.badgeProgress}>{progress}</Text> : null;
                    })()}
                    {!unlocked && (
                      // Dismiss first: the modal sits above the tab navigator,
                      // so pushing without closing leaves it covering the
                      // destination. The overlay Pressable wraps this card, so
                      // the press must not also reach its dismiss handler —
                      // closing here makes that harmless either way.
                      <Pressable
                        onPress={() => { setSelectedBadge(null); router.push("/(tabs)/log"); }}
                        style={({ pressed }) => [styles.badgeModalAction, { opacity: pressed ? 0.7 : 1 }]}
                      >
                        <Text style={styles.badgeModalActionText}>Log a Hike</Text>
                      </Pressable>
                    )}
                  </>
                );
              })()}
            </View>
          </Pressable>
        </Modal>

        {/* Followers/Following modal */}
        <Modal visible={!!showFollowModal} animationType="slide" presentationStyle="pageSheet">
          <View style={[styles.followModalContainer, { paddingTop: insets.top + 16 }]}>
            <View style={styles.followModalHeader}>
              <Text style={styles.followModalTitle}>{showFollowModal === "followers" ? "Followers" : "Following"}</Text>
              <Pressable onPress={() => setShowFollowModal(null)}>
                <Feather name="x" size={22} color={Colors.text} />
              </Pressable>
            </View>
            {followModalLoading ? (
              <View style={styles.center}><ActivityIndicator color={Colors.accent} /></View>
            ) : followUsers.length === 0 ? (
              showFollowModal === "followers" && pendingCount > 0 ? (
                // Not "no followers": someone has asked and is waiting. Claiming
                // nobody is there is the part that was actually wrong.
                <View style={styles.center}>
                  <Text style={styles.emptyText}>
                    {pendingCount} pending request{pendingCount === 1 ? "" : "s"}
                  </Text>
                  <Pressable
                    onPress={() => { setShowFollowModal(null); router.push("/notifications"); }}
                    style={({ pressed }) => [styles.pendingBtn, { opacity: pressed ? 0.7 : 1 }]}
                  >
                    <Text style={styles.pendingBtnText}>Review requests</Text>
                  </Pressable>
                </View>
              ) : (
                <View style={styles.center}>
                  <Text style={styles.emptyText}>{showFollowModal === "followers" ? "No followers yet" : "Not following anyone yet"}</Text>
                </View>
              )
            ) : (
              <ScrollView>
                {followUsers.map(u => (
                  <Pressable key={u.id} style={styles.followUserRow} onPress={() => { setShowFollowModal(null); router.push({ pathname: "/user-profile", params: { id: u.id } }); }}>
                    <Avatar profile={u} size={42} />
                    <Text style={styles.followUserName}>{displayName(u)}</Text>
                    <Feather name="chevron-right" size={16} color={Colors.text3} />
                  </Pressable>
                ))}
              </ScrollView>
            )}
          </View>
        </Modal>
      </View>
    );
  }

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    header: { paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { fontFamily: "Inter_700Bold", fontSize: 26, color: Colors.text, letterSpacing: -0.5 },
    settingsBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: Colors.surface2, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: Colors.border2 },
    profileHeader: { alignItems: "center", paddingTop: 8, paddingBottom: 20, paddingHorizontal: 20 },
    avatarWrap: { position: "relative", marginBottom: 12 },
    avatarEditDot: { position: "absolute", bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: Colors.green2, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: Colors.bg },
    name: { fontFamily: "Inter_700Bold", fontSize: 22, color: Colors.text, marginBottom: 4 },
    bio: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text3, marginBottom: 20, textAlign: "center" },
    requestsLink: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 16, borderWidth: 1, borderColor: Colors.border2, backgroundColor: Colors.bg3 },
    requestsLinkText: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.accent },
    statsRow: { flexDirection: "row", width: "100%", borderRadius: 12, overflow: "hidden", gap: 1, backgroundColor: Colors.border },
    statCell: { flex: 1, backgroundColor: Colors.bg3, paddingVertical: 12, alignItems: "center" },
    statCellVal: { fontFamily: "Inter_700Bold", fontSize: 17, color: Colors.accent },
    statCellLbl: { fontFamily: "Inter_400Regular", fontSize: 9, color: Colors.text3, textTransform: "uppercase", letterSpacing: 0.3, marginTop: 2 },
    badgesSection: { marginBottom: 4 },
    badgeGoal: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, marginTop: 10 },
    badgeGoalText: { fontFamily: "Inter_500Medium", fontSize: 12.5, color: Colors.text3 },
    badgesRow: { paddingHorizontal: 20, gap: 16, paddingBottom: 4 },
    badge: { alignItems: "center", gap: 6, position: "relative" },
    badgeLocked: { opacity: 0.45 },
    badgeIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: Colors.bg3, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
    badgeLabel: { fontFamily: "Inter_500Medium", fontSize: 11, color: Colors.text3 },
    badgeCheck: { position: "absolute", top: 0, right: 0, width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.green, alignItems: "center", justifyContent: "center" },
    sectionLabel: { fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: Colors.text3, paddingHorizontal: 20, paddingBottom: 10, paddingTop: 16, fontFamily: "Inter_500Medium" },
    savedSectionLabel: { fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: Colors.text3, paddingHorizontal: 20, paddingBottom: 8, paddingTop: 16, fontFamily: "Inter_500Medium" },
    tabSwitcherWrap: { marginHorizontal: 16, marginTop: 16, marginBottom: 4 },
    tabSwitcherContent: { backgroundColor: Colors.bg3, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 3, gap: 3 },
    tabBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 8 },
    tabBtnActive: { backgroundColor: Colors.green2 },
    tabBtnText: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.text3 },
    tabBtnTextActive: { color: "#fff" },
    empty: { alignItems: "center", paddingTop: 48, paddingBottom: 24, gap: 10 },
    emptyText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text2 },
    emptySubtext: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text3, textAlign: "center", paddingHorizontal: 32 },
    discoverBtn: { marginTop: 8, paddingVertical: 10, paddingHorizontal: 24, borderRadius: 20, backgroundColor: Colors.green2 },
    discoverBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#fff" },
    hikeItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
    hikeInfo: { flex: 1 },
    hikeName: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.text, marginBottom: 2 },
    hikeMeta: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text3 },
    hikeRating: { flexDirection: "row", alignItems: "center", gap: 3 },
    hikeRatingText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.amber2 },
    savedCard: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 10, backgroundColor: Colors.bg3, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14 },
    savedCardLeft: { flex: 1 },
    savedCardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 3 },
    savedTrailName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text, flex: 1, marginRight: 8 },
    savedTrailLocation: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text3, marginBottom: 8 },
    savedTrailStats: { flexDirection: "row", alignItems: "center", gap: 8 },
    savedDiffBadge: { paddingVertical: 3, paddingHorizontal: 8, borderRadius: 20, borderWidth: 1 },
    savedDiffText: { fontSize: 11, fontFamily: "Inter_500Medium" },
    savedStatText: { fontSize: 12, color: Colors.text2, fontFamily: "Inter_400Regular" },
    signOutBtn: { marginHorizontal: 20, marginTop: 32, marginBottom: 12, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.red, alignItems: "center" },
    signOutText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.red },
    modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center", padding: 32 },
    badgeModal: { backgroundColor: Colors.bg2, borderRadius: 20, padding: 28, alignItems: "center", width: "100%", borderWidth: 1, borderColor: Colors.border },
    badgeModalIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: Colors.bg3, borderWidth: 2, alignItems: "center", justifyContent: "center", marginBottom: 14 },
    badgeModalName: { fontFamily: "Inter_700Bold", fontSize: 20, color: Colors.text, marginBottom: 6 },
    badgeModalDesc: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text3, textAlign: "center", marginBottom: 16 },
    badgeModalUnlocked: { flexDirection: "row", alignItems: "center", gap: 6 },
    badgeModalUnlockedText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.green },
    badgeModalLocked: { flexDirection: "row", alignItems: "center", gap: 6 },
    badgeModalLockedText: { fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text3 },
    badgeModalAction: {
    marginTop: 16, paddingVertical: 11, paddingHorizontal: 22,
    borderRadius: 12, backgroundColor: Colors.green2,
  },
  badgeModalActionText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  badgeProgress: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text2, marginTop: 8 },
    followModalContainer: { flex: 1, backgroundColor: Colors.bg },
    followModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
    followModalTitle: { fontFamily: "Inter_600SemiBold", fontSize: 18, color: Colors.text },
    center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 },
    followUserRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
    pendingBtn: { marginTop: 14, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 12, backgroundColor: Colors.green2 },
    pendingBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
    followUserName: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 15, color: Colors.text },
  });
  
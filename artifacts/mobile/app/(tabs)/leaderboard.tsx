import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import { formatDistance, formatElevation } from "@/lib/units";
import { getInitials } from "@/lib/format";

type LeaderEntry = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  value: number;
  rank: number;
};

type Category = {
  key: string;
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  unit: string;
  color: string;
};

const CATEGORIES: Category[] = [
  { key: "hikes", label: "Most Hikes", icon: "trending-up", unit: "hikes", color: Colors.green },
  { key: "miles", label: "Most Miles", icon: "navigation", unit: "mi", color: Colors.sky },
  { key: "elevation", label: "Most Elevation", icon: "activity", unit: "ft", color: Colors.amber },
  { key: "score", label: "Top Rated", icon: "star", unit: "avg", color: "#a855d4" },
];

function RankMedal({ rank }: { rank: number }) {
  if (rank === 1) return <Text style={styles.medal}>🥇</Text>;
  if (rank === 2) return <Text style={styles.medal}>🥈</Text>;
  if (rank === 3) return <Text style={styles.medal}>🥉</Text>;
  return <Text style={styles.rankNum}>#{rank}</Text>;
}

export default function LeaderboardScreen() {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const router = useRouter();
  const { session, profile } = useAuth();
  const distanceUnit = profile?.distance_unit ?? "imperial";

  const [activeCategory, setActiveCategory] = useState("hikes");
  const [timePeriod, setTimePeriod] = useState<"alltime" | "week">("alltime");
  const [leaders, setLeaders] = useState<LeaderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [myRank, setMyRank] = useState<LeaderEntry | null>(null);

  const fetchLeaders = async () => {
    setLoading(true);

    let query = supabase.from("hikes").select("user_id, distance_mi, elevation_ft, overall_score");
    if (timePeriod === "week") {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      query = query.gte("date", weekAgo);
    }

    const { data: hikesData } = await query;
    if (!hikesData) { setLoading(false); return; }

    // Aggregate by user
    const userMap: Record<string, { hikes: number; miles: number; elevation: number; scores: number[]; }> = {};
    hikesData.forEach((h: any) => {
      if (!userMap[h.user_id]) userMap[h.user_id] = { hikes: 0, miles: 0, elevation: 0, scores: [] };
      userMap[h.user_id].hikes += 1;
      userMap[h.user_id].miles += h.distance_mi || 0;
      userMap[h.user_id].elevation += h.elevation_ft || 0;
      if (h.overall_score > 0) userMap[h.user_id].scores.push(h.overall_score);
    });

    const userIds = Object.keys(userMap);
    if (userIds.length === 0) { setLeaders([]); setLoading(false); return; }

    const { data: profiles } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", userIds);
    const profileMap: Record<string, any> = {};
    if (profiles) profiles.forEach((p: any) => { profileMap[p.id] = p; });

    const getValue = (uid: string) => {
      const u = userMap[uid];
      switch (activeCategory) {
        case "hikes": return u.hikes;
        case "miles": return Math.round(u.miles * 10) / 10;
        case "elevation": return u.elevation;
        case "score": return u.scores.length > 0 ? Math.round((u.scores.reduce((a, b) => a + b, 0) / u.scores.length) * 10) / 10 : 0;
        default: return 0;
      }
    };

    const sorted = userIds
      .map(uid => ({ id: uid, value: getValue(uid), ...profileMap[uid] }))
      .filter(u => u.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 20)
      .map((u, i) => ({ ...u, rank: i + 1 }));

    setLeaders(sorted);

    if (session) {
      const mine = sorted.find(u => u.id === session.user.id);
      setMyRank(mine || null);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => { fetchLeaders(); }, [activeCategory, timePeriod]);

  const cat = CATEGORIES.find(c => c.key === activeCategory)!;

  const formatValue = (v: number) => {
    if (activeCategory === "miles") return formatDistance(v, distanceUnit);
    if (activeCategory === "elevation") return formatElevation(v, distanceUnit);
    if (activeCategory === "score") return v.toFixed(1);
    return v.toString();
  };

  const showUnitSuffix = activeCategory !== "miles" && activeCategory !== "elevation";

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Text style={styles.title}>Leaderboard</Text>
        <View style={styles.periodSwitch}>
          <Pressable onPress={() => setTimePeriod("week")} style={[styles.periodBtn, timePeriod === "week" && styles.periodBtnActive]}>
            <Text style={[styles.periodText, timePeriod === "week" && styles.periodTextActive]}>This Week</Text>
          </Pressable>
          <Pressable onPress={() => setTimePeriod("alltime")} style={[styles.periodBtn, timePeriod === "alltime" && styles.periodBtnActive]}>
            <Text style={[styles.periodText, timePeriod === "alltime" && styles.periodTextActive]}>All Time</Text>
          </Pressable>
        </View>
      </View>

      {/* Category tabs */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.catScroll} contentContainerStyle={styles.catRow}>
        {CATEGORIES.map(c => (
          <Pressable key={c.key} onPress={() => setActiveCategory(c.key)} style={[styles.catChip, activeCategory === c.key && { backgroundColor: c.color + "22", borderColor: c.color }]}>
            <Feather name={c.icon} size={14} color={activeCategory === c.key ? c.color : Colors.text3} />
            <Text style={[styles.catChipText, activeCategory === c.key && { color: c.color, fontFamily: "Inter_600SemiBold" }]}>{c.label}</Text>
          </Pressable>
        ))}
        <View style={{ width: 16 }} />
      </ScrollView>

      {/* My rank banner */}
      {myRank && (
        <View style={[styles.myRankBanner, { borderColor: cat.color + "44" }]}>
          <Text style={styles.myRankLabel}>Your rank</Text>
          <Text style={[styles.myRankValue, { color: cat.color }]}>#{myRank.rank}</Text>
          <Text style={styles.myRankStat}>{formatValue(myRank.value)}{showUnitSuffix ? ` ${cat.unit}` : ""}</Text>
        </View>
      )}

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={Colors.accent} size="large" /></View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 100, paddingTop: 8 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchLeaders(); }} tintColor={Colors.accent} />}
        >
          {leaders.length === 0 ? (
            <View style={styles.center}>
              <Feather name="award" size={40} color={Colors.text3} />
              <Text style={styles.emptyText}>No data yet</Text>
              <Text style={styles.emptySubtext}>Log some hikes to appear here!</Text>
            </View>
          ) : leaders.map((entry) => {
            const isMe = entry.id === session?.user.id;
            return (
              <Pressable
                key={entry.id}
                style={({ pressed }) => [styles.row, isMe && styles.rowMe, { opacity: pressed ? 0.8 : 1 }]}
                onPress={() => router.push({ pathname: "/user-profile", params: { id: entry.id } })}
              >
                <View style={styles.rankWrap}>
                  <RankMedal rank={entry.rank} />
                </View>
                <View style={styles.avatarWrap}>
                  {entry.avatar_url ? (
                    <Image source={{ uri: entry.avatar_url }} style={styles.avatarImg} />
                  ) : (
                    <View style={[styles.avatarFallback, isMe && { borderColor: Colors.accent }]}>
                      <Text style={styles.avatarText}>{getInitials(entry.full_name)}</Text>
                    </View>
                  )}
                </View>
                <View style={styles.entryInfo}>
                  <Text style={[styles.entryName, isMe && { color: Colors.accent }]}>{entry.full_name || "Anonymous"}{isMe ? " (you)" : ""}</Text>
                </View>
                <View style={[styles.valueWrap, { backgroundColor: cat.color + "18" }]}>
                  <Text style={[styles.valueText, { color: cat.color }]}>{formatValue(entry.value)}</Text>
                  {showUnitSuffix && <Text style={[styles.unitText, { color: cat.color + "99" }]}>{cat.unit}</Text>}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontFamily: "Inter_700Bold", fontSize: 26, color: Colors.text, letterSpacing: -0.5 },
  periodSwitch: { flexDirection: "row", backgroundColor: Colors.bg3, borderRadius: 20, borderWidth: 1, borderColor: Colors.border, overflow: "hidden" },
  periodBtn: { paddingVertical: 6, paddingHorizontal: 12 },
  periodBtnActive: { backgroundColor: Colors.green2 },
  periodText: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.text3 },
  periodTextActive: { color: "#fff" },
  catScroll: { flexGrow: 0 },
  catRow: { paddingLeft: 16, gap: 8, paddingBottom: 12, flexDirection: "row", alignItems: "center" },
  catChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, borderColor: Colors.border2, backgroundColor: Colors.bg3 },
  catChipText: { fontSize: 12, fontFamily: "Inter_500Medium", color: Colors.text3 },
  myRankBanner: { marginHorizontal: 16, marginBottom: 8, padding: 12, backgroundColor: Colors.bg3, borderRadius: 12, borderWidth: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  myRankLabel: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text3, flex: 1 },
  myRankValue: { fontFamily: "Inter_700Bold", fontSize: 20 },
  myRankStat: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text3 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text2 },
  emptySubtext: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text3 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
  rowMe: { backgroundColor: "rgba(141,207,122,0.06)" },
  rankWrap: { width: 36, alignItems: "center" },
  medal: { fontSize: 22 },
  rankNum: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text3 },
  avatarWrap: { flexShrink: 0 },
  avatarImg: { width: 40, height: 40, borderRadius: 20 },
  avatarFallback: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.surface2, alignItems: "center", justifyContent: "center", borderWidth: 1.5, borderColor: Colors.border },
  avatarText: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: Colors.accent },
  entryInfo: { flex: 1 },
  entryName: { fontFamily: "Inter_500Medium", fontSize: 14, color: Colors.text },
  valueWrap: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 10, alignItems: "center" },
  valueText: { fontFamily: "Inter_700Bold", fontSize: 16 },
  unitText: { fontFamily: "Inter_400Regular", fontSize: 10, textTransform: "uppercase", letterSpacing: 0.5 },
});

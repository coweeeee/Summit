import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useHikes } from "@/context/HikesContext";

function StatCell({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statCellVal}>{value}</Text>
      <Text style={styles.statCellLbl}>{label}</Text>
    </View>
  );
}

function formatDateShort(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function ProfileScreen() {
  const { hikes } = useHikes();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const totalMiles = hikes.reduce((s, h) => s + h.distanceMi, 0);
  const totalElev = hikes.reduce((s, h) => s + h.elevationFt, 0);

  const formatElev = (ft: number) => {
    if (ft >= 1000) return `${(ft / 1000).toFixed(1)}k`;
    return ft.toString();
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Text style={styles.title}>Profile</Text>
        <View style={styles.settingsBtn}>
          <Feather name="settings" size={20} color={Colors.text3} />
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 84 : 100 }}
      >
        <View style={styles.profileHeader}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>A</Text>
          </View>
          <Text style={styles.name}>Alex L.</Text>
          <Text style={styles.bio}>Exploring trails one step at a time</Text>

          <View style={styles.statsRow}>
            <StatCell value={hikes.length.toString()} label="Hikes" />
            <StatCell value={totalMiles.toFixed(0)} label="Miles" />
            <StatCell value={formatElev(totalElev)} label="Elev. ft" />
            <StatCell value="18" label="Following" />
          </View>
        </View>

        <View style={styles.badgesSection}>
          <Text style={styles.sectionLabel}>Badges</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.badgesRow}>
            {[
              { icon: "mountain" as const, label: "Summit", color: Colors.amber },
              { icon: "map" as const, label: "Explorer", color: Colors.sky },
              { icon: "trending-up" as const, label: "Climber", color: Colors.green },
              { icon: "sun" as const, label: "Early Bird", color: Colors.amber2 },
            ].map((b) => (
              <View key={b.label} style={styles.badge}>
                <View style={[styles.badgeIcon, { borderColor: b.color }]}>
                  <Feather name={b.icon} size={22} color={b.color} />
                </View>
                <Text style={styles.badgeLabel}>{b.label}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        <Text style={styles.sectionLabel}>Recent Hikes</Text>

        {hikes.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="map" size={36} color={Colors.text3} />
            <Text style={styles.emptyText}>No hikes yet</Text>
            <Text style={styles.emptySubtext}>Log your first hike to get started</Text>
          </View>
        ) : (
          hikes.map((hike) => (
            <View key={hike.id} style={styles.hikeItem}>
              <View style={styles.hikeIcon}>
                <Feather name="trending-up" size={18} color={Colors.green} />
              </View>
              <View style={styles.hikeInfo}>
                <Text style={styles.hikeName} numberOfLines={1}>{hike.trailName}</Text>
                <Text style={styles.hikeMeta}>
                  {hike.distanceMi.toFixed(1)} mi · {hike.elevationFt.toLocaleString()} ft · {formatDateShort(hike.date)}
                </Text>
              </View>
              <View style={styles.hikeRating}>
                <Feather name="star" size={12} color={Colors.amber2} />
                <Text style={styles.hikeRatingText}>{hike.overallScore.toFixed(1)}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  settingsBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border2,
  },
  profileHeader: {
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  avatar: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: Colors.surface2,
    borderWidth: 2.5,
    borderColor: Colors.green,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarText: {
    fontFamily: "Inter_700Bold",
    fontSize: 30,
    color: Colors.accent,
  },
  name: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: Colors.text,
    marginBottom: 4,
  },
  bio: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text3,
    marginBottom: 20,
    textAlign: "center",
  },
  statsRow: {
    flexDirection: "row",
    width: "100%",
    borderRadius: 12,
    overflow: "hidden",
    gap: 1,
    backgroundColor: Colors.border,
  },
  statCell: {
    flex: 1,
    backgroundColor: Colors.bg3,
    paddingVertical: 14,
    alignItems: "center",
  },
  statCellVal: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
    color: Colors.accent,
  },
  statCellLbl: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: Colors.text3,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  badgesSection: {
    marginBottom: 4,
  },
  badgesRow: {
    paddingHorizontal: 20,
    gap: 16,
    paddingBottom: 4,
  },
  badge: {
    alignItems: "center",
    gap: 6,
  },
  badgeIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.bg3,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: Colors.text3,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Colors.text3,
    paddingHorizontal: 20,
    paddingBottom: 10,
    paddingTop: 16,
    fontFamily: "Inter_500Medium",
  },
  empty: {
    alignItems: "center",
    paddingTop: 60,
    gap: 10,
  },
  emptyText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.text2,
  },
  emptySubtext: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: Colors.text3,
  },
  hikeItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  hikeIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  hikeInfo: {
    flex: 1,
  },
  hikeName: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: Colors.text,
    marginBottom: 2,
  },
  hikeMeta: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.text3,
  },
  hikeRating: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  hikeRatingText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: Colors.amber2,
  },
});

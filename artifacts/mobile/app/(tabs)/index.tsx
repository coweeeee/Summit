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
import { TrailCard } from "@/components/TrailCard";
import { useHikes } from "@/context/HikesContext";

const USER_COLORS = ["#8dcf7a", "#a89fd4", "#d49090", "#7ab8c8", "#e8b060"];
const USER_INITIALS = ["SC", "MK", "JL", "AL", "RM"];

export default function FeedScreen() {
  const { hikes, likedIds, toggleLike } = useHikes();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  return (
    <View style={[styles.container, { backgroundColor: Colors.bg }]}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View>
          <Text style={styles.logo}>Summit</Text>
          <Text style={styles.logoSub}>your trail journal</Text>
        </View>
        <View style={styles.avatarContainer}>
          <Feather name="bell" size={20} color={Colors.text3} />
        </View>
      </View>

      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 84 : 100 }}
      >
        <Text style={styles.sectionLabel}>Recent Activity</Text>

        {hikes.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="map" size={40} color={Colors.text3} />
            <Text style={styles.emptyText}>No hikes logged yet</Text>
            <Text style={styles.emptySubtext}>Tap Log to add your first hike</Text>
          </View>
        ) : (
          hikes.map((hike, idx) => (
            <TrailCard
              key={hike.id}
              hike={hike}
              liked={likedIds.has(hike.id)}
              onLike={() => toggleLike(hike.id)}
              userInitials={USER_INITIALS[idx % USER_INITIALS.length]}
              userColor={USER_COLORS[idx % USER_COLORS.length]}
            />
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
  logo: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    color: Colors.accent,
    letterSpacing: -0.5,
  },
  logoSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: Colors.text3,
    marginTop: -2,
    fontStyle: "italic",
  },
  avatarContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.surface2,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: Colors.border2,
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Colors.text3,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    fontFamily: "Inter_500Medium",
  },
  empty: {
    alignItems: "center",
    paddingTop: 80,
    gap: 12,
  },
  emptyText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: Colors.text2,
  },
  emptySubtext: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text3,
  },
});

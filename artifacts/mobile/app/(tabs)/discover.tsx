import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import {
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

const DISCOVER_TRAILS = [
  {
    id: "d1",
    name: "Enchantments Core Zone",
    location: "Alpine Lakes Wilderness, WA",
    distanceMi: 18.7,
    elevationFt: 5300,
    difficulty: "Hard",
    rating: 4.9,
    tags: ["Summit", "Dog-friendly"],
  },
  {
    id: "d2",
    name: "Appalachian Trail — Approach",
    location: "Springer Mtn, Georgia",
    distanceMi: 8.5,
    elevationFt: 2100,
    difficulty: "Moderate",
    rating: 4.6,
    tags: ["Dog-friendly"],
  },
  {
    id: "d3",
    name: "Mirror Lake Loop",
    location: "Yosemite NP, California",
    distanceMi: 4.6,
    elevationFt: 140,
    difficulty: "Easy",
    rating: 4.3,
    tags: ["Dog-friendly", "Waterfall"],
  },
  {
    id: "d4",
    name: "Multnomah Falls Trail",
    location: "Columbia River Gorge, Oregon",
    distanceMi: 2.4,
    elevationFt: 620,
    difficulty: "Moderate",
    rating: 4.7,
    tags: ["Waterfall", "Near me"],
  },
  {
    id: "d5",
    name: "Lake Serene",
    location: "Mt. Baker-Snoqualmie NF, WA",
    distanceMi: 8.0,
    elevationFt: 2521,
    difficulty: "Hard",
    rating: 4.8,
    tags: ["Summit"],
  },
  {
    id: "d6",
    name: "Lost Lake Loop",
    location: "Mt. Hood, Oregon",
    distanceMi: 3.3,
    elevationFt: 100,
    difficulty: "Easy",
    rating: 4.5,
    tags: ["Dog-friendly", "Near me"],
  },
];

const FILTERS = ["All", "Easy", "Moderate", "Hard", "Near me", "Dog-friendly", "Waterfall", "Summit"];

function getDiffStyle(diff: string) {
  switch (diff.toLowerCase()) {
    case "easy":
      return { bg: "rgba(109,184,122,0.15)", color: Colors.green, border: "rgba(109,184,122,0.3)" };
    case "moderate":
      return { bg: "rgba(212,148,58,0.15)", color: Colors.amber, border: "rgba(212,148,58,0.3)" };
    case "hard":
      return { bg: "rgba(196,96,96,0.15)", color: Colors.red, border: "rgba(196,96,96,0.3)" };
    default:
      return { bg: "rgba(109,184,122,0.15)", color: Colors.green, border: "rgba(109,184,122,0.3)" };
  }
}

export default function DiscoverScreen() {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const filtered = DISCOVER_TRAILS.filter((t) => {
    const matchSearch =
      search === "" ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.location.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      activeFilter === "All" ||
      t.difficulty === activeFilter ||
      t.tags.includes(activeFilter);
    return matchSearch && matchFilter;
  });

  return (
    <View style={[styles.container]}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Text style={styles.title}>Discover</Text>
      </View>

      <View style={styles.searchBar}>
        <Feather name="search" size={18} color={Colors.text3} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search trails, parks, locations..."
          placeholderTextColor={Colors.text3}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <Feather name="x" size={18} color={Colors.text3} />
          </Pressable>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filterRow}>
        {FILTERS.map((f) => (
          <Pressable
            key={f}
            onPress={() => setActiveFilter(f)}
            style={[styles.filterChip, activeFilter === f && styles.filterChipActive]}
          >
            <Text style={[styles.filterChipText, activeFilter === f && styles.filterChipTextActive]}>
              {f}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 84 : 100, paddingTop: 8 }}
      >
        <Text style={styles.sectionLabel}>Top Rated This Season</Text>

        {filtered.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="search" size={36} color={Colors.text3} />
            <Text style={styles.emptyText}>No trails found</Text>
          </View>
        ) : (
          filtered.map((trail) => {
            const diffStyle = getDiffStyle(trail.difficulty);
            return (
              <View key={trail.id} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.cardTitleRow}>
                    <Text style={styles.cardName} numberOfLines={1}>{trail.name}</Text>
                    <View style={styles.ratingRow}>
                      <Feather name="star" size={12} color={Colors.amber2} />
                      <Text style={styles.ratingText}>{trail.rating}</Text>
                    </View>
                  </View>
                  <Text style={styles.cardLocation}>{trail.location}</Text>
                  <View style={styles.cardStats}>
                    <View style={styles.stat}>
                      <Text style={styles.statVal}>{trail.distanceMi} mi</Text>
                      <Text style={styles.statLbl}>Distance</Text>
                    </View>
                    <View style={styles.stat}>
                      <Text style={styles.statVal}>{trail.elevationFt.toLocaleString()} ft</Text>
                      <Text style={styles.statLbl}>Elevation</Text>
                    </View>
                    <View style={styles.stat}>
                      <View style={[styles.diffBadge, { backgroundColor: diffStyle.bg, borderColor: diffStyle.border }]}>
                        <Text style={[styles.diffText, { color: diffStyle.color }]}>{trail.difficulty}</Text>
                      </View>
                      <Text style={styles.statLbl}>Difficulty</Text>
                    </View>
                  </View>
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
  container: {
    flex: 1,
    backgroundColor: Colors.bg,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 26,
    color: Colors.text,
    letterSpacing: -0.5,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: Colors.bg3,
    borderWidth: 1,
    borderColor: Colors.border2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  searchIcon: {
    marginRight: 2,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
  },
  filterScroll: {
    flexGrow: 0,
  },
  filterRow: {
    paddingHorizontal: 16,
    paddingBottom: 12,
    gap: 8,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border2,
    backgroundColor: Colors.bg3,
  },
  filterChipActive: {
    backgroundColor: Colors.green2,
    borderColor: Colors.green2,
  },
  filterChipText: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    color: Colors.text2,
  },
  filterChipTextActive: {
    color: "#fff",
  },
  sectionLabel: {
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
    color: Colors.text3,
    paddingHorizontal: 20,
    paddingBottom: 10,
    fontFamily: "Inter_500Medium",
  },
  card: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: Colors.bg3,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: "hidden",
  },
  cardTop: {
    padding: 16,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  cardName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: Colors.text,
    flex: 1,
    marginRight: 8,
  },
  ratingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
  },
  ratingText: {
    fontSize: 13,
    color: Colors.amber2,
    fontFamily: "Inter_500Medium",
  },
  cardLocation: {
    fontSize: 12,
    color: Colors.text3,
    fontFamily: "Inter_400Regular",
    marginBottom: 12,
  },
  cardStats: {
    flexDirection: "row",
    gap: 16,
    alignItems: "flex-start",
  },
  stat: {
    gap: 4,
  },
  statVal: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.text,
  },
  statLbl: {
    fontSize: 10,
    color: Colors.text3,
    fontFamily: "Inter_400Regular",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  diffBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  diffText: {
    fontSize: 10,
    fontFamily: "Inter_500Medium",
  },
  empty: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyText: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    color: Colors.text3,
  },
});

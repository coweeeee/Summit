import { Feather } from "@expo/vector-icons";
  import Constants from "expo-constants";
  import { useRouter } from "expo-router";
  import React, { useCallback, useEffect, useRef, useState } from "react";
  import {
    ActivityIndicator,
    FlatList,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
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
  import RNMapView, { Marker as RNMarker, Callout as RNCallout } from "@/lib/maps";

  const PAGE_SIZE = 20;
  const MAP_FETCH_LIMIT = 300;
  const isExpoGo = Constants.appOwnership === "expo";

  const MapView: any = isExpoGo ? null : RNMapView;
  const Marker: any = isExpoGo ? null : RNMarker;
  const Callout: any = isExpoGo ? null : RNCallout;

  type Trail = {
    id: string; name: string; location: string; region: string;
    distance_mi: number; elevation_ft: number; difficulty: string;
    rating: number; tags: string[]; description: string;
    lat: number | null; lng: number | null;
  };

  type UserProfile = {
    id: string; full_name: string | null; username: string | null; bio: string | null;
  };

  const DIFFICULTY_FILTERS = ["All", "Easy", "Moderate", "Hard", "Expert"];
  const CATEGORY_FILTERS = [
    "Waterfall", "Dog-friendly", "Alpine", "Summit", "Permit",
    "Coastal", "Desert", "Lake", "Historic", "Wildlife",
    "Scramble", "Glacier", "Volcanic", "Forest", "Arctic",
    "Wildflowers", "Sunrise", "Remote", "Backcountry",
  ];
  const SORT_OPTIONS = ["Top Rated", "Shortest", "Longest", "Most Elevation", "Least Elevation"];
  const AVATAR_COLORS = ["#2a3d2a", "#2d2a3d", "#3d2a2a", "#2a3340", "#3d3020"];

  const US_REGION = { latitude: 39.5, longitude: -98.35, latitudeDelta: 30, longitudeDelta: 40 };

  function getDiffStyle(diff: string) {
    switch (diff?.toLowerCase()) {
      case "easy":    return { bg: "rgba(109,184,122,0.2)", color: "#6db87a", border: "#6db87a" };
      case "moderate":return { bg: "rgba(212,148,58,0.2)",  color: "#d4943a", border: "#d4943a" };
      case "hard":    return { bg: "rgba(196,96,96,0.2)",   color: "#c46060", border: "#c46060" };
      case "expert":  return { bg: "rgba(160,80,200,0.2)",  color: "#a855d4", border: "#a855d4" };
      default:        return { bg: "rgba(109,184,122,0.2)", color: "#6db87a", border: "#6db87a" };
    }
  }

  function getInitials(name: string | null) {
    if (!name) return "?";
    return name.split(" ").map((w: string) => w[0]).join("").toUpperCase().slice(0, 2);
  }

  function PeopleTab() {
    const { session } = useAuth();
    const router = useRouter();
    const [search, setSearch] = useState("");
    const [users, setUsers] = useState<UserProfile[]>([]);
    const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(false);

    const fetchUsers = async (query: string) => {
      setLoading(true);
      let req = supabase.from("profiles").select("*").neq("id", session?.user.id || "").limit(20);
      if (query.trim()) req = req.ilike("full_name", `%${query}%`);
      const { data } = await req;
      if (data) setUsers(data);
      setLoading(false);
    };

    const fetchFollowing = async () => {
      if (!session) return;
      const { data } = await supabase.from("follows").select("following_id").eq("follower_id", session.user.id);
      if (data) setFollowingIds(new Set(data.map((f: any) => f.following_id)));
    };

    useEffect(() => { fetchUsers(""); fetchFollowing(); }, []);
    useEffect(() => {
      const t = setTimeout(() => fetchUsers(search), 300);
      return () => clearTimeout(t);
    }, [search]);

    const toggleFollow = async (userId: string) => {
      if (!session) return;
      const isFollowing = followingIds.has(userId);
      if (isFollowing) {
        await supabase.from("follows").delete().eq("follower_id", session.user.id).eq("following_id", userId);
        setFollowingIds(prev => { const n = new Set(prev); n.delete(userId); return n; });
      } else {
        await supabase.from("follows").insert({ follower_id: session.user.id, following_id: userId });
        setFollowingIds(prev => new Set([...prev, userId]));
      }
    };

    return (
      <View style={{ flex: 1 }}>
        <View style={styles.searchBar}>
          <Feather name="search" size={18} color={Colors.text3} />
          <TextInput style={styles.searchInput} placeholder="Search people..." placeholderTextColor={Colors.text3} value={search} onChangeText={setSearch} />
          {search.length > 0 && <Pressable onPress={() => setSearch("")}><Feather name="x" size={18} color={Colors.text3} /></Pressable>}
        </View>
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={Colors.accent} /></View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
            <Text style={styles.sectionLabel}>{search ? "Search results" : "Hikers on Summit"}</Text>
            {users.length === 0 ? (
              <View style={styles.center}><Text style={styles.emptyText}>No users found</Text></View>
            ) : users.map((user, idx) => {
              const isFollowing = followingIds.has(user.id);
              return (
                <Pressable key={user.id} style={({ pressed }) => [styles.personRow, { opacity: pressed ? 0.8 : 1 }]} onPress={() => router.push({ pathname: "/user-profile", params: { id: user.id } })}>
                  <View style={[styles.personAvatar, { backgroundColor: AVATAR_COLORS[idx % AVATAR_COLORS.length] }]}>
                    <Text style={styles.personAvatarText}>{getInitials(user.full_name)}</Text>
                  </View>
                  <View style={styles.personInfo}>
                    <Text style={styles.personName}>{user.full_name || "Anonymous Hiker"}</Text>
                    {user.bio ? <Text style={styles.personBio} numberOfLines={1}>{user.bio}</Text> : null}
                  </View>
                  <Pressable onPress={(e) => { e.stopPropagation?.(); toggleFollow(user.id); }} style={({ pressed }) => [styles.followBtn, isFollowing && styles.followingBtn, { opacity: pressed ? 0.7 : 1 }]}>
                    <Text style={[styles.followBtnText, isFollowing && styles.followingBtnText]}>{isFollowing ? "Following" : "Follow"}</Text>
                  </Pressable>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>
    );
  }

  export default function DiscoverScreen() {
    const insets = useSafeAreaInsets();
    const topPad = Platform.OS === "web" ? 67 : insets.top;
    const router = useRouter();
    const { session } = useAuth();

    const [activeTab, setActiveTab] = useState<"trails" | "people">("trails");
    const [viewMode, setViewMode] = useState<"list" | "map">("list");

    const [search, setSearch] = useState("");
    const [debouncedSearch, setDebouncedSearch] = useState("");
    const [diffFilter, setDiffFilter] = useState("All");
    const [regionFilter, setRegionFilter] = useState("All Regions");
    const [activeCategories, setActiveCategories] = useState<string[]>([]);
    const [sortBy, setSortBy] = useState("Top Rated");

    const [showFilterModal, setShowFilterModal] = useState(false);
    const [showRegionModal, setShowRegionModal] = useState(false);
    const [regions, setRegions] = useState<string[]>([]);

    const [trails, setTrails] = useState<Trail[]>([]);
    const [mapTrails, setMapTrails] = useState<Trail[]>([]);
    const [loading, setLoading] = useState(false);
    const [mapLoading, setMapLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [totalCount, setTotalCount] = useState(0);
    const offsetRef = useRef(0);
    const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

    useEffect(() => {
      const t = setTimeout(() => setDebouncedSearch(search), 300);
      return () => clearTimeout(t);
    }, [search]);

    const fetchRegions = async () => {
      const { data } = await supabase.from("trails").select("region").order("region");
      if (data) {
        const unique = Array.from(new Set(data.map((r: any) => r.region).filter(Boolean))).sort() as string[];
        setRegions(unique);
      }
    };

    useEffect(() => { fetchRegions(); }, []);

    const applyBaseFilters = (q: any) => {
      if (diffFilter !== "All") q = q.eq("difficulty", diffFilter);
      if (regionFilter !== "All Regions") q = q.eq("region", regionFilter);
      if (activeCategories.length > 0) q = q.contains("tags", activeCategories);
      if (debouncedSearch.trim()) q = q.or(`name.ilike.%${debouncedSearch}%,location.ilike.%${debouncedSearch}%`);
      return q;
    };

    const buildListQuery = (offset: number) => {
      let q = applyBaseFilters(supabase.from("trails").select("*", { count: "exact" }));
      switch (sortBy) {
        case "Top Rated":       q = q.order("rating",       { ascending: false }); break;
        case "Shortest":        q = q.order("distance_mi",  { ascending: true  }); break;
        case "Longest":         q = q.order("distance_mi",  { ascending: false }); break;
        case "Most Elevation":  q = q.order("elevation_ft", { ascending: false }); break;
        case "Least Elevation": q = q.order("elevation_ft", { ascending: true  }); break;
      }
      return q.range(offset, offset + PAGE_SIZE - 1);
    };

    const buildMapQuery = () => {
      let q = applyBaseFilters(supabase.from("trails").select("id,name,rating,lat,lng,region,difficulty,location"));
      return q.not("lat", "is", null).not("lng", "is", null).range(0, MAP_FETCH_LIMIT - 1);
    };

    const fetchPage = async (offset: number): Promise<Trail[]> => {
      const { data, count } = await buildListQuery(offset);
      if (count !== null) setTotalCount(count);
      if (!data || data.length === 0) { setHasMore(false); return []; }
      setHasMore(data.length === PAGE_SIZE);
      return data;
    };

    const fetchMapData = async () => {
      setMapLoading(true);
      const { data } = await buildMapQuery();
      setMapTrails(data || []);
      setMapLoading(false);
    };

    const fetchSaved = async () => {
      if (!session) return;
      const { data } = await supabase.from("want_to_hike").select("trail_id").eq("user_id", session.user.id);
      if (data) setSavedIds(new Set(data.map((d: any) => d.trail_id)));
    };

    const load = async () => {
      setLoading(true);
      offsetRef.current = 0;
      setHasMore(true);
      const [page] = await Promise.all([fetchPage(0), fetchSaved()]);
      setTrails(page);
      offsetRef.current = page.length;
      setLoading(false);
    };

    const loadMore = async () => {
      if (loadingMore || !hasMore) return;
      setLoadingMore(true);
      const page = await fetchPage(offsetRef.current);
      if (page.length > 0) {
        setTrails(prev => [...prev, ...page]);
        offsetRef.current += page.length;
      }
      setLoadingMore(false);
    };

    const onRefresh = useCallback(async () => {
      setRefreshing(true);
      offsetRef.current = 0;
      setHasMore(true);
      const [page] = await Promise.all([fetchPage(0), fetchSaved()]);
      setTrails(page);
      offsetRef.current = page.length;
      setRefreshing(false);
    }, [diffFilter, regionFilter, activeCategories, sortBy, debouncedSearch, session]);

    useEffect(() => {
      if (viewMode === "list") load();
    }, [diffFilter, regionFilter, activeCategories, sortBy, debouncedSearch, viewMode]);

    useEffect(() => {
      if (viewMode === "map") fetchMapData();
    }, [diffFilter, regionFilter, activeCategories, debouncedSearch, viewMode]);

    const toggleSave = async (trail: Trail) => {
      if (!session) return;
      const isSaved = savedIds.has(trail.id);
      if (isSaved) {
        await supabase.from("want_to_hike").delete().eq("user_id", session.user.id).eq("trail_id", trail.id);
        setSavedIds(prev => { const n = new Set(prev); n.delete(trail.id); return n; });
      } else {
        await supabase.from("want_to_hike").insert({ user_id: session.user.id, trail_id: trail.id });
        setSavedIds(prev => new Set([...prev, trail.id]));
      }
    };

    const toggleCategory = (cat: string) => {
      setActiveCategories(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
    };

    const clearFilters = () => {
      setDiffFilter("All");
      setRegionFilter("All Regions");
      setActiveCategories([]);
      setSortBy("Top Rated");
    };

    const activeFilterCount =
      (diffFilter !== "All" ? 1 : 0) +
      (regionFilter !== "All Regions" ? 1 : 0) +
      activeCategories.length +
      (sortBy !== "Top Rated" ? 1 : 0);

    const renderTrailCard = ({ item: trail }: { item: Trail }) => {
      const ds = getDiffStyle(trail.difficulty);
      const isSaved = savedIds.has(trail.id);
      return (
        <Pressable
          style={({ pressed }) => [styles.card, { opacity: pressed ? 0.92 : 1 }]}
          onPress={() => router.push({ pathname: "/trail-detail", params: { id: trail.id } })}
        >
          <View style={[styles.diffBar, { backgroundColor: ds.color + "18" }]}>
            <View style={[styles.diffBadge, { backgroundColor: ds.bg, borderColor: ds.color + "80" }]}>
              <View style={[styles.diffDot, { backgroundColor: ds.color }]} />
              <Text style={[styles.diffLabel, { color: ds.color }]}>{trail.difficulty}</Text>
            </View>
            <Pressable onPress={() => toggleSave(trail)} hitSlop={10} style={({ pressed }) => [styles.bookmarkBtn, isSaved && styles.bookmarkBtnSaved, { opacity: pressed ? 0.7 : 1 }]}>
              <Feather name="bookmark" size={14} color={isSaved ? "#fff" : Colors.text3} />
            </Pressable>
          </View>
          <View style={styles.cardBody}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardName} numberOfLines={1}>{trail.name}</Text>
              <View style={styles.ratingRow}>
                <Feather name="star" size={12} color={Colors.amber2} />
                <Text style={styles.ratingText}>{trail.rating?.toFixed(1)}</Text>
              </View>
            </View>
            <Text style={styles.cardLocation}>{trail.location}</Text>
            {trail.description ? <Text style={styles.cardDesc} numberOfLines={2}>{trail.description}</Text> : null}
            <View style={styles.cardStats}>
              <View style={styles.stat}><Text style={styles.statVal}>{trail.distance_mi} mi</Text><Text style={styles.statLbl}>Distance</Text></View>
              <View style={styles.stat}><Text style={styles.statVal}>{trail.elevation_ft?.toLocaleString()} ft</Text><Text style={styles.statLbl}>Elevation</Text></View>
            </View>
            {trail.tags && trail.tags.length > 0 && (
              <View style={styles.tagsRow}>
                {trail.tags.slice(0, 3).map((tag: string) => <View key={tag} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>)}
                {trail.tags.length > 3 && <View style={styles.tag}><Text style={styles.tagText}>+{trail.tags.length - 3}</Text></View>}
              </View>
            )}
            <View style={styles.cardFooter}>
              <Text style={styles.tapHint}>Tap for details</Text>
              <Feather name="chevron-right" size={13} color={Colors.text3} />
            </View>
          </View>
        </Pressable>
      );
    };

    const renderMapView = () => {
      if (isExpoGo || !MapView) {
        return (
          <View style={styles.center}>
            <Feather name="map" size={36} color={Colors.text3} />
            <Text style={styles.emptyText}>Map view unavailable in Expo Go</Text>
            <Text style={[styles.emptyText, { fontSize: 12, marginTop: 4 }]}>Use a development build to enable maps</Text>
          </View>
        );
      }
      if (mapLoading) return <View style={styles.center}><ActivityIndicator color={Colors.accent} size="large" /></View>;
      return (
        <MapView
          style={{ flex: 1 }}
          initialRegion={US_REGION}
          userInterfaceStyle="dark"
        >
          {mapTrails.map((trail) => {
            if (trail.lat == null || trail.lng == null) return null;
            const ds = getDiffStyle(trail.difficulty);
            return (
              <Marker
                key={trail.id}
                coordinate={{ latitude: trail.lat, longitude: trail.lng }}
                pinColor={ds.color}
              >
                <Callout onPress={() => router.push({ pathname: "/trail-detail", params: { id: trail.id } })}>
                  <View style={styles.callout}>
                    <Text style={styles.calloutName} numberOfLines={2}>{trail.name}</Text>
                    <View style={styles.calloutMeta}>
                      <Feather name="star" size={11} color={Colors.amber2} />
                      <Text style={styles.calloutRating}>{trail.rating?.toFixed(1)}</Text>
                      <Text style={styles.calloutRegion}>{trail.region}</Text>
                    </View>
                    <Text style={styles.calloutTap}>Tap to view trail</Text>
                  </View>
                </Callout>
              </Marker>
            );
          })}
        </MapView>
      );
    };

    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: topPad + 8 }]}>
          <Text style={styles.title}>Discover</Text>
          {activeTab === "trails" && (
            <View style={styles.viewToggle}>
              <Pressable
                onPress={() => setViewMode("list")}
                style={[styles.viewToggleBtn, viewMode === "list" && styles.viewToggleBtnActive]}
              >
                <Feather name="list" size={16} color={viewMode === "list" ? "#fff" : Colors.text3} />
              </Pressable>
              <Pressable
                onPress={() => setViewMode("map")}
                style={[styles.viewToggleBtn, viewMode === "map" && styles.viewToggleBtnActive]}
              >
                <Feather name="map" size={16} color={viewMode === "map" ? "#fff" : Colors.text3} />
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.tabSwitcher}>
          <Pressable onPress={() => setActiveTab("trails")} style={[styles.tabBtn, activeTab === "trails" && styles.tabBtnActive]}>
            <Text style={[styles.tabBtnText, activeTab === "trails" && styles.tabBtnTextActive]}>Trails</Text>
          </Pressable>
          <Pressable onPress={() => setActiveTab("people")} style={[styles.tabBtn, activeTab === "people" && styles.tabBtnActive]}>
            <Text style={[styles.tabBtnText, activeTab === "people" && styles.tabBtnTextActive]}>People</Text>
          </Pressable>
        </View>

        {activeTab === "people" ? <PeopleTab /> : (
          <>
            <View style={styles.searchRow}>
              <View style={styles.searchBar}>
                <Feather name="search" size={18} color={Colors.text3} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Search trails, parks, states..."
                  placeholderTextColor={Colors.text3}
                  value={search}
                  onChangeText={setSearch}
                />
                {search.length > 0 && <Pressable onPress={() => setSearch("")}><Feather name="x" size={18} color={Colors.text3} /></Pressable>}
              </View>
              <Pressable
                onPress={() => setShowRegionModal(true)}
                style={[styles.filterBtn, regionFilter !== "All Regions" && styles.filterBtnActive]}
              >
                <Feather name="globe" size={16} color={regionFilter !== "All Regions" ? "#fff" : Colors.text2} />
              </Pressable>
              <Pressable
                onPress={() => setShowFilterModal(true)}
                style={({ pressed }) => [styles.filterBtn, activeFilterCount > (regionFilter !== "All Regions" ? 1 : 0) && styles.filterBtnActive, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Feather name="sliders" size={16} color={(activeFilterCount - (regionFilter !== "All Regions" ? 1 : 0)) > 0 ? "#fff" : Colors.text2} />
                {activeFilterCount > 0 && (
                  <View style={styles.filterBadge}>
                    <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                  </View>
                )}
              </Pressable>
            </View>

            <View style={styles.chipsContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipsContent}>
                {DIFFICULTY_FILTERS.map(f => {
                  const active = diffFilter === f;
                  const ds = f !== "All" ? getDiffStyle(f) : null;
                  return (
                    <Pressable key={f} onPress={() => setDiffFilter(f)} style={[styles.chip, active && !ds && styles.chipActiveGreen, active && ds ? { backgroundColor: ds.bg, borderColor: ds.color } : {}]}>
                      {ds && <View style={[styles.chipDot, { backgroundColor: ds.color }]} />}
                      <Text style={[styles.chipText, active && !ds && styles.chipTextActive, active && ds ? { color: ds.color, fontFamily: "Inter_600SemiBold" } : {}]}>{f}</Text>
                    </Pressable>
                  );
                })}
                {regionFilter !== "All Regions" && (
                  <Pressable onPress={() => setRegionFilter("All Regions")} style={[styles.chip, styles.chipActiveGreen]}>
                    <Feather name="map-pin" size={11} color="#fff" />
                    <Text style={[styles.chipText, styles.chipTextActive]} numberOfLines={1}>{regionFilter}</Text>
                    <Feather name="x" size={11} color="#fff" />
                  </Pressable>
                )}
                <View style={{ width: 16 }} />
              </ScrollView>
            </View>

            {viewMode === "map" ? renderMapView() : (
              loading ? (
                <View style={styles.center}><ActivityIndicator color={Colors.accent} size="large" /></View>
              ) : (
                <FlatList
                  data={trails}
                  keyExtractor={item => item.id}
                  renderItem={renderTrailCard}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 100, paddingTop: 4 }}
                  refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.accent} />}
                  onEndReached={loadMore}
                  onEndReachedThreshold={0.4}
                  ListHeaderComponent={
                    <Text style={styles.sectionLabel}>
                      {totalCount} trail{totalCount !== 1 ? "s" : ""}
                      {regionFilter !== "All Regions" ? ` · ${regionFilter}` : ""}
                      {activeCategories.length > 0 ? ` · ${activeCategories.slice(0, 2).join(", ")}${activeCategories.length > 2 ? "…" : ""}` : ""}
                    </Text>
                  }
                  ListEmptyComponent={
                    <View style={styles.center}>
                      <Feather name="search" size={36} color={Colors.text3} />
                      <Text style={styles.emptyText}>No trails found</Text>
                      <Pressable onPress={clearFilters} style={styles.clearBtn}>
                        <Text style={styles.clearBtnText}>Clear filters</Text>
                      </Pressable>
                    </View>
                  }
                  ListFooterComponent={loadingMore ? <View style={styles.loadingMore}><ActivityIndicator color={Colors.accent} size="small" /></View> : null}
                />
              )
            )}
          </>
        )}

        {/* Filter & Sort modal */}
        <Modal visible={showFilterModal} animationType="slide" presentationStyle="pageSheet">
          <View style={[styles.modalContainer, { paddingTop: insets.top + 16 }]}>
            <View style={styles.modalHeader}>
              <Pressable onPress={clearFilters}><Text style={styles.modalClear}>Clear all</Text></Pressable>
              <Text style={styles.modalTitle}>Filter & Sort</Text>
              <Pressable onPress={() => setShowFilterModal(false)}><Text style={styles.modalDone}>Done</Text></Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.modalSectionTitle}>Sort by</Text>
              <View style={styles.modalChipsWrap}>
                {SORT_OPTIONS.map(s => (
                  <Pressable key={s} onPress={() => setSortBy(s)} style={[styles.modalChip, sortBy === s && styles.modalChipActive]}>
                    <Text style={[styles.modalChipText, sortBy === s && styles.modalChipTextActive]}>{s}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={styles.modalSectionTitle}>Features</Text>
              <View style={styles.modalChipsWrap}>
                {CATEGORY_FILTERS.map(cat => {
                  const active = activeCategories.includes(cat);
                  return (
                    <Pressable key={cat} onPress={() => toggleCategory(cat)} style={[styles.modalChip, active && styles.modalChipActive]}>
                      <Text style={[styles.modalChipText, active && styles.modalChipTextActive]}>{cat}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </Modal>

        {/* Region picker modal */}
        <Modal visible={showRegionModal} animationType="slide" presentationStyle="pageSheet">
          <View style={[styles.modalContainer, { paddingTop: insets.top + 16 }]}>
            <View style={styles.modalHeader}>
              <Pressable onPress={() => { setRegionFilter("All Regions"); setShowRegionModal(false); }}>
                <Text style={styles.modalClear}>Clear</Text>
              </Pressable>
              <Text style={styles.modalTitle}>Region</Text>
              <Pressable onPress={() => setShowRegionModal(false)}><Text style={styles.modalDone}>Done</Text></Pressable>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 60 }}>
              <Pressable
                onPress={() => { setRegionFilter("All Regions"); setShowRegionModal(false); }}
                style={[styles.regionRow, regionFilter === "All Regions" && styles.regionRowActive]}
              >
                <Text style={[styles.regionRowText, regionFilter === "All Regions" && styles.regionRowTextActive]}>All Regions</Text>
                {regionFilter === "All Regions" && <Feather name="check" size={16} color={Colors.accent} />}
              </Pressable>
              {regions.map(r => (
                <Pressable
                  key={r}
                  onPress={() => { setRegionFilter(r); setShowRegionModal(false); }}
                  style={[styles.regionRow, regionFilter === r && styles.regionRowActive]}
                >
                  <Text style={[styles.regionRowText, regionFilter === r && styles.regionRowTextActive]}>{r}</Text>
                  {regionFilter === r && <Feather name="check" size={16} color={Colors.accent} />}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Modal>
      </View>
    );
  }

  const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: Colors.bg },
    header: { paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
    title: { fontFamily: "Inter_700Bold", fontSize: 26, color: Colors.text, letterSpacing: -0.5 },
    viewToggle: { flexDirection: "row", backgroundColor: Colors.bg3, borderRadius: 8, borderWidth: 1, borderColor: Colors.border, padding: 2, gap: 2 },
    viewToggleBtn: { width: 34, height: 30, borderRadius: 6, alignItems: "center", justifyContent: "center" },
    viewToggleBtnActive: { backgroundColor: Colors.green2 },
    tabSwitcher: { flexDirection: "row", marginHorizontal: 16, marginBottom: 12, backgroundColor: Colors.bg3, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, padding: 3 },
    tabBtn: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 8 },
    tabBtnActive: { backgroundColor: Colors.green2 },
    tabBtnText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text3 },
    tabBtnTextActive: { color: "#fff" },
    searchRow: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 10 },
    searchBar: { flex: 1, flexDirection: "row", alignItems: "center", backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
    searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text },
    filterBtn: { width: 42, height: 42, borderRadius: 10, backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2, alignItems: "center", justifyContent: "center" },
    filterBtnActive: { backgroundColor: Colors.green2, borderColor: Colors.green2 },
    filterBadge: { position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: Colors.red, alignItems: "center", justifyContent: "center" },
    filterBadgeText: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#fff" },
    chipsContainer: { height: 48, marginBottom: 4 },
    chipsContent: { paddingLeft: 16, paddingRight: 16, alignItems: "center", gap: 8, flexDirection: "row" },
    chip: { height: 34, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, borderRadius: 17, borderWidth: 1, borderColor: Colors.border2, backgroundColor: Colors.bg3 },
    chipDot: { width: 7, height: 7, borderRadius: 4 },
    chipText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.text2 },
    chipActiveGreen: { backgroundColor: Colors.green2, borderColor: Colors.green2 },
    chipTextActive: { color: "#fff", fontFamily: "Inter_600SemiBold" },
    sectionLabel: { fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: Colors.text3, paddingHorizontal: 20, paddingBottom: 10, fontFamily: "Inter_500Medium" },
    loadingMore: { paddingVertical: 20, alignItems: "center" },
    card: { marginHorizontal: 16, marginBottom: 12, backgroundColor: Colors.bg3, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, overflow: "hidden" },
    diffBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 14, paddingVertical: 10 },
    diffBadge: { flexDirection: "row", alignItems: "center", gap: 7, paddingVertical: 5, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1.5 },
    diffDot: { width: 8, height: 8, borderRadius: 4 },
    diffLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
    bookmarkBtn: { width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: Colors.surface },
    bookmarkBtnSaved: { backgroundColor: Colors.accent },
    cardBody: { padding: 14, paddingTop: 10 },
    cardTitleRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 3 },
    cardName: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text, flex: 1, marginRight: 8 },
    ratingRow: { flexDirection: "row", alignItems: "center", gap: 3 },
    ratingText: { fontSize: 13, color: Colors.amber2, fontFamily: "Inter_500Medium" },
    cardLocation: { fontSize: 12, color: Colors.text3, fontFamily: "Inter_400Regular", marginBottom: 6 },
    cardDesc: { fontSize: 13, color: Colors.text2, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 10 },
    cardStats: { flexDirection: "row", gap: 20, marginBottom: 10 },
    stat: { gap: 2 },
    statVal: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.text },
    statLbl: { fontSize: 10, color: Colors.text3, textTransform: "uppercase", letterSpacing: 0.5 },
    tagsRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
    tag: { paddingVertical: 3, paddingHorizontal: 10, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border },
    tagText: { fontSize: 11, color: Colors.text2, fontFamily: "Inter_400Regular" },
    cardFooter: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 3 },
    tapHint: { fontSize: 11, color: Colors.text3, fontFamily: "Inter_400Regular" },
    center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
    emptyText: { fontFamily: "Inter_500Medium", fontSize: 15, color: Colors.text3 },
    clearBtn: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border2 },
    clearBtnText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text2 },
    callout: { width: 200, padding: 10 },
    calloutName: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#111", marginBottom: 4 },
    calloutMeta: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 4 },
    calloutRating: { fontSize: 12, color: "#333", fontFamily: "Inter_500Medium" },
    calloutRegion: { fontSize: 11, color: "#666", fontFamily: "Inter_400Regular" },
    calloutTap: { fontSize: 11, color: "#4a90d9", fontFamily: "Inter_500Medium" },
    personRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
    personAvatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    personAvatarText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: Colors.accent },
    personInfo: { flex: 1 },
    personName: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text },
    personBio: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text3, marginTop: 2 },
    followBtn: { paddingVertical: 7, paddingHorizontal: 16, borderRadius: 20, backgroundColor: Colors.green2 },
    followingBtn: { backgroundColor: "transparent", borderWidth: 1, borderColor: Colors.border2 },
    followBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" },
    followingBtnText: { color: Colors.text3 },
    modalContainer: { flex: 1, backgroundColor: Colors.bg },
    modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
    modalClear: { fontFamily: "Inter_500Medium", fontSize: 15, color: Colors.red },
    modalTitle: { fontFamily: "Inter_600SemiBold", fontSize: 17, color: Colors.text },
    modalDone: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.accent },
    modalContent: { padding: 20, gap: 12, paddingBottom: 60 },
    modalSectionTitle: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: Colors.text, marginTop: 8, marginBottom: 4 },
    modalChipsWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    modalChip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: Colors.border2, backgroundColor: Colors.bg3 },
    modalChipActive: { backgroundColor: Colors.green2, borderColor: Colors.green2 },
    modalChipText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.text2 },
    modalChipTextActive: { color: "#fff", fontFamily: "Inter_600SemiBold" },
    regionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
    regionRowActive: { backgroundColor: Colors.bg3 },
    regionRowText: { fontFamily: "Inter_500Medium", fontSize: 15, color: Colors.text2 },
    regionRowTextActive: { color: Colors.accent, fontFamily: "Inter_600SemiBold" },
  });
  
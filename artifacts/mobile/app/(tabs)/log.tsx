import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useHikes, DimRating } from "@/context/HikesContext";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/context/AuthContext";
import { formatDistance, formatElevation } from "@/lib/units";

const DIFFICULTIES = ["Easy", "Moderate", "Hard", "Expert"];
const DIMENSIONS = ["Scenery", "Views", "Trail Cond.", "Crowds", "Accessibility"];

type Trail = { id: string; name: string; location: string; distance_mi: number; elevation_ft: number; difficulty: string; rating: number; };

function filterDecimal(val: string): string {
  const cleaned = val.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  return parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : cleaned;
}
function filterInteger(val: string): string { return val.replace(/[^0-9]/g, ""); }

function getDiffColor(diff: string) {
  switch (diff?.toLowerCase()) {
    case "easy": return Colors.green;
    case "moderate": return Colors.amber;
    case "hard": return Colors.red;
    case "expert": return "#a855d4";
    default: return Colors.text3;
  }
}

function StarRating({ dim, value, onChange }: { dim: string; value: number; onChange: (v: number) => void }) {
  return (
    <View style={styles.dimRow}>
      <Text style={styles.dimName}>{dim}</Text>
      <View style={styles.starRow}>
        {[1,2,3,4,5].map(s => (
          <Pressable key={s} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onChange(s); }} style={styles.star}>
            <Feather name="star" size={20} color={s <= value ? Colors.amber2 : Colors.surface2} />
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
function SubmitButton({ onPress, disabled }: { onPress: () => void; disabled: boolean }) {
  const scale = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <AnimatedPressable style={[styles.submitBtn, disabled && styles.submitBtnDisabled, style]} onPressIn={() => { scale.value = withSpring(0.97); }} onPressOut={() => { scale.value = withSpring(1); }} onPress={onPress} disabled={disabled}>
      <Feather name="check" size={18} color="#fff" />
      <Text style={styles.submitBtnText}>Log This Hike</Text>
    </AnimatedPressable>
  );
}

function formatDate(d: Date): string { return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); }
function formatDateTime(d: Date): string { return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`; }

export default function LogScreen() {
  const { addHike } = useHikes();
  const { session, profile } = useAuth();
  const distanceUnit = profile?.distance_unit ?? "imperial";
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const params = useLocalSearchParams<{ prefillName?: string; prefillLocation?: string }>();

  const [showTrailSearch, setShowTrailSearch] = useState(false);
  const [trailQuery, setTrailQuery] = useState("");
  const [trailResults, setTrailResults] = useState<Trail[]>([]);
  const [trailSearchLoading, setTrailSearchLoading] = useState(false);
  const [selectedTrail, setSelectedTrail] = useState<Trail | null>(null);

  const [distanceStr, setDistanceStr] = useState("");
  const [elevationStr, setElevationStr] = useState("");
  const [durationStr, setDurationStr] = useState("");
  const [skipDuration, setSkipDuration] = useState(false);
  const [difficulty, setDifficulty] = useState("");
  const [notes, setNotes] = useState("");
  const [dimRatings, setDimRatings] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [hikeDate, setHikeDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // Photo upload state
  const [photos, setPhotos] = useState<{ uri: string; uploading: boolean }[]>([]);

  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (params.prefillName) searchAndSelectTrail(params.prefillName);
  }, [params.prefillName]);

  const searchAndSelectTrail = async (name: string) => {
    const { data } = await supabase.from("trails").select("*").ilike("name", `%${name}%`).limit(1);
    if (data && data[0]) selectTrail(data[0]);
  };

  const searchTrails = async (query: string) => {
    if (!query.trim()) { setTrailResults([]); return; }
    setTrailSearchLoading(true);
    const { data } = await supabase.from("trails").select("id,name,location,distance_mi,elevation_ft,difficulty,rating").or(`name.ilike.%${query}%,location.ilike.%${query}%,region.ilike.%${query}%`).limit(15);
    if (data) setTrailResults(data);
    setTrailSearchLoading(false);
  };

  useEffect(() => {
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => searchTrails(trailQuery), 300);
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current); };
  }, [trailQuery]);

  const selectTrail = (trail: Trail) => {
    setSelectedTrail(trail);
    setDistanceStr(trail.distance_mi > 0 ? trail.distance_mi.toString() : "");
    setElevationStr(trail.elevation_ft > 0 ? trail.elevation_ft.toString() : "");
    setDifficulty(trail.difficulty || "");
    setShowTrailSearch(false);
    setTrailQuery(""); setTrailResults([]);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const pickPhoto = async () => {
    try {
      const ImagePicker = await import("expo-image-picker");
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") { Alert.alert("Permission needed", "Allow photo access to add photos."); return; }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [4, 3] as [number, number],
        quality: 0.7,
      });
      if (result.canceled || !result.assets[0]) return;
      const uri = result.assets[0].uri;
      setPhotos(prev => [...prev, { uri, uploading: false }]);
    } catch (_) {}
  };

  const removePhoto = (idx: number) => {
    setPhotos(prev => prev.filter((_, i) => i !== idx));
  };

  const reset = () => {
    setSelectedTrail(null); setDistanceStr(""); setElevationStr(""); setDurationStr(""); setSkipDuration(false);
    setDifficulty(""); setNotes(""); setDimRatings({}); setHikeDate(new Date()); setPhotos([]);
  };

  const overallScore = Object.values(dimRatings).length > 0
    ? parseFloat((Object.values(dimRatings).reduce((a, b) => a + b, 0) / Object.values(dimRatings).length).toFixed(1))
    : 0;

  const canSubmit = !!selectedTrail && difficulty !== "" && !loading;

  // Duration is optional: skipped explicitly, or simply left blank. Anything
  // that isn't a positive number is stored as null rather than 0, so "no time
  // recorded" stays distinguishable from a genuine 0.0 hr entry.
  const durationHr = (() => {
    if (skipDuration) return undefined;
    const parsed = parseFloat(durationStr);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  })();

  const toggleSkipDuration = () => {
    Haptics.selectionAsync();
    const next = !skipDuration;
    setSkipDuration(next);
    if (next) setDurationStr("");
  };

  const uploadPhotos = async (hikeId: string) => {
    if (!session || photos.length === 0) return;
    for (let i = 0; i < photos.length; i++) {
      const photo = photos[i];
      try {
        const ext = photo.uri.split(".").pop() || "jpg";
        const fileName = `${session.user.id}/${hikeId}_${i}.${ext}`;
        const response = await fetch(photo.uri);
        const blob = await response.blob();
        const arrayBuffer = await blob.arrayBuffer();
        const { error } = await supabase.storage.from("hike-photos").upload(fileName, arrayBuffer, { contentType: `image/${ext}`, upsert: true });
        if (!error) {
          const { data: urlData } = supabase.storage.from("hike-photos").getPublicUrl(fileName);
          await supabase.from("hike_photos").insert({ hike_id: hikeId, user_id: session.user.id, photo_url: urlData.publicUrl });
        }
      } catch (_) {}
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit || !selectedTrail) return;
    setLoading(true);
    const ratings: DimRating[] = DIMENSIONS.filter(d => dimRatings[d] !== undefined).map(d => ({ name: d, score: dimRatings[d] }));
    const result = await addHike({
      trailName: selectedTrail.name,
      location: selectedTrail.location,
      distanceMi: parseFloat(distanceStr) || 0,
      elevationFt: parseInt(elevationStr) || 0,
      durationHr,
      difficulty,
      overallScore: overallScore || 0,
      dimRatings: ratings,
      notes: notes.trim(),
      date: hikeDate.toISOString(),
      trailId: selectedTrail.id,
    });

    if ("error" in result) {
      setLoading(false);
      Alert.alert("Couldn't save hike", result.error);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Upload photos after hike is created
    if (photos.length > 0) {
      await uploadPhotos(result.id);
    }

    setLoading(false);
    reset();
    Alert.alert("Hike Logged!", `Saved${photos.length > 0 ? ` with ${photos.length} photo${photos.length > 1 ? "s" : ""}` : ""}.`);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Text style={styles.title}>Log a Hike</Text>
        {selectedTrail && <Pressable onPress={reset} style={styles.clearBtn}><Text style={styles.clearBtnText}>Clear</Text></Pressable>}
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.scroll, { paddingBottom: Platform.OS === "web" ? 84 : 100 }]} keyboardShouldPersistTaps="handled">

        <Text style={styles.fieldLabel}>Trail</Text>
        {selectedTrail ? (
          <Pressable onPress={() => setShowTrailSearch(true)} style={styles.selectedTrailCard}>
            <View style={styles.selectedTrailInfo}>
              <Text style={styles.selectedTrailName}>{selectedTrail.name}</Text>
              <Text style={styles.selectedTrailLocation}>{selectedTrail.location}</Text>
              <View style={styles.selectedTrailStats}>
                {selectedTrail.distance_mi > 0 && <Text style={styles.selectedTrailStat}>{formatDistance(selectedTrail.distance_mi, distanceUnit)}</Text>}
                {selectedTrail.elevation_ft > 0 && <Text style={styles.selectedTrailStat}>{formatElevation(selectedTrail.elevation_ft, distanceUnit)}</Text>}
                <View style={[styles.diffChipSmall, { borderColor: getDiffColor(selectedTrail.difficulty) + "55", backgroundColor: getDiffColor(selectedTrail.difficulty) + "18" }]}>
                  <Text style={[styles.diffChipSmallText, { color: getDiffColor(selectedTrail.difficulty) }]}>{selectedTrail.difficulty}</Text>
                </View>
              </View>
            </View>
            <View style={styles.changeTrailBtn}><Text style={styles.changeTrailText}>Change</Text></View>
          </Pressable>
        ) : (
          <Pressable onPress={() => setShowTrailSearch(true)} style={styles.trailSearchBtn}>
            <Feather name="search" size={18} color={Colors.text3} />
            <Text style={styles.trailSearchBtnText}>Search for a trail...</Text>
            <Feather name="chevron-right" size={16} color={Colors.text3} />
          </Pressable>
        )}

        {!selectedTrail && (
          <View style={styles.trailHint}>
            <Feather name="info" size={13} color={Colors.text3} />
            <Text style={styles.trailHintText}>Search and select a trail to connect your hike to the database</Text>
          </View>
        )}

        {selectedTrail && (
          <>
            <Text style={styles.fieldLabel}>Date & Start Time</Text>
            <Pressable onPress={() => setShowDatePicker(true)} style={styles.datePicker}>
              <Feather name="calendar" size={16} color={Colors.text3} />
              <Text style={styles.dateText}>{formatDateTime(hikeDate)}</Text>
              <Feather name="chevron-down" size={16} color={Colors.text3} />
            </Pressable>

            {showDatePicker && Platform.OS === "ios" && (
              <Modal transparent animationType="slide">
                <View style={styles.dateModalOverlay}>
                  <View style={styles.dateModalSheet}>
                    <View style={styles.dateModalHeader}>
                      <Text style={styles.dateModalTitle}>Select date</Text>
                      <Pressable onPress={() => setShowDatePicker(false)} style={styles.dateModalDone}><Text style={styles.dateModalDoneText}>Done</Text></Pressable>
                    </View>
                    <DateTimePicker value={hikeDate} mode="datetime" display="spinner" maximumDate={new Date()} onChange={(_, d) => { if (d) setHikeDate(d); }} textColor={Colors.text} themeVariant="dark" />
                  </View>
                </View>
              </Modal>
            )}
            {showDatePicker && Platform.OS === "android" && (
              <DateTimePicker value={hikeDate} mode="datetime" display="default" maximumDate={new Date()} onChange={(_, d) => { setShowDatePicker(false); if (d) setHikeDate(d); }} />
            )}

            <View style={styles.row3}>
              <View style={styles.col}><Text style={styles.fieldLabel}>Distance (mi)</Text><TextInput style={styles.input} placeholder="0.0" placeholderTextColor={Colors.text3} value={distanceStr} onChangeText={v => setDistanceStr(filterDecimal(v))} keyboardType="decimal-pad" maxLength={6} /></View>
              <View style={styles.col}><Text style={styles.fieldLabel}>Elevation (ft)</Text><TextInput style={styles.input} placeholder="0" placeholderTextColor={Colors.text3} value={elevationStr} onChangeText={v => setElevationStr(filterInteger(v))} keyboardType="number-pad" maxLength={6} /></View>
              <View style={styles.col}><Text style={styles.fieldLabel}>Duration (hr)</Text><TextInput style={[styles.input, skipDuration && styles.inputSkipped]} placeholder={skipDuration ? "—" : "0.0"} placeholderTextColor={Colors.text3} value={durationStr} onChangeText={v => setDurationStr(filterDecimal(v))} keyboardType="decimal-pad" maxLength={5} editable={!skipDuration} /></View>
            </View>

            <Pressable onPress={toggleSkipDuration} style={styles.skipRow} accessibilityRole="checkbox" accessibilityState={{ checked: skipDuration }}>
              <View style={[styles.skipBox, skipDuration && styles.skipBoxActive]}>
                {skipDuration && <Feather name="check" size={11} color="#fff" />}
              </View>
              <Text style={[styles.skipText, skipDuration && styles.skipTextActive]}>I didn&apos;t track my time</Text>
            </Pressable>

            <Text style={styles.fieldLabel}>Difficulty</Text>
            <View style={styles.diffRow}>
              {DIFFICULTIES.map(d => (
                <Pressable key={d} onPress={() => { Haptics.selectionAsync(); setDifficulty(d); }} style={[styles.diffChip, difficulty === d && styles.diffChipActive]}>
                  <Text style={[styles.diffChipText, difficulty === d && styles.diffChipTextActive]}>{d}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.fieldLabel}>Rate Your Experience</Text>
            <View style={styles.dimContainer}>
              {DIMENSIONS.map(dim => <StarRating key={dim} dim={dim} value={dimRatings[dim] ?? 0} onChange={v => setDimRatings(prev => ({ ...prev, [dim]: v }))} />)}
            </View>

            {overallScore > 0 && (
              <View style={styles.scoreDisplay}>
                <Text style={styles.bigScore}>{overallScore.toFixed(1)}</Text>
                <Text style={styles.bigScoreLbl}>Overall Score</Text>
              </View>
            )}

            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput style={[styles.input, styles.textarea]} placeholder="Conditions, tips, highlights..." placeholderTextColor={Colors.text3} value={notes} onChangeText={setNotes} multiline numberOfLines={3} />

            {/* Photos */}
            <Text style={styles.fieldLabel}>Photos</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoScroll} contentContainerStyle={styles.photoRow}>
              {photos.map((p, i) => (
                <View key={i} style={styles.photoWrap}>
                  <Image source={{ uri: p.uri }} style={styles.photoPreview} />
                  <Pressable onPress={() => removePhoto(i)} style={styles.removePhoto}>
                    <Feather name="x" size={12} color="#fff" />
                  </Pressable>
                </View>
              ))}
              {photos.length < 5 && (
                <Pressable onPress={pickPhoto} style={styles.addPhotoBtn}>
                  <Feather name="camera" size={22} color={Colors.text3} />
                  <Text style={styles.addPhotoText}>Add photo</Text>
                </Pressable>
              )}
            </ScrollView>

            <SubmitButton onPress={handleSubmit} disabled={!canSubmit} />
          </>
        )}
      </ScrollView>

      {/* Trail Search Modal */}
      <Modal visible={showTrailSearch} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.searchModal, { paddingTop: insets.top + 16 }]}>
          <View style={styles.searchModalHeader}>
            <Text style={styles.searchModalTitle}>Find a Trail</Text>
            <Pressable onPress={() => { setShowTrailSearch(false); setTrailQuery(""); setTrailResults([]); }}>
              <Feather name="x" size={22} color={Colors.text} />
            </Pressable>
          </View>
          <View style={styles.searchModalBar}>
            <Feather name="search" size={18} color={Colors.text3} />
            <TextInput style={styles.searchModalInput} placeholder="Search by name, park, or state..." placeholderTextColor={Colors.text3} value={trailQuery} onChangeText={setTrailQuery} autoFocus />
            {trailQuery.length > 0 && <Pressable onPress={() => { setTrailQuery(""); setTrailResults([]); }}><Feather name="x" size={18} color={Colors.text3} /></Pressable>}
          </View>
          {trailSearchLoading ? (
            <View style={styles.center}><ActivityIndicator color={Colors.accent} /></View>
          ) : trailResults.length === 0 ? (
            <View style={styles.center}>
              <Feather name={trailQuery ? "map" : "search"} size={32} color={Colors.text3} />
              <Text style={styles.emptyText}>{trailQuery ? "No trails found" : "Search for a trail"}</Text>
              <Text style={styles.emptySubtext}>{trailQuery ? "Try a different search" : "Type a trail name, park, or state"}</Text>
            </View>
          ) : (
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 60 }}>
              <Text style={styles.resultsLabel}>{trailResults.length} result{trailResults.length !== 1 ? "s" : ""}</Text>
              {trailResults.map(trail => {
                const dc = getDiffColor(trail.difficulty);
                return (
                  <Pressable key={trail.id} style={({ pressed }) => [styles.resultRow, { opacity: pressed ? 0.8 : 1 }]} onPress={() => selectTrail(trail)}>
                    <View style={styles.resultInfo}>
                      <Text style={styles.resultName}>{trail.name}</Text>
                      <Text style={styles.resultLocation}>{trail.location}</Text>
                      <View style={styles.resultStats}>
                        {trail.distance_mi > 0 && <Text style={styles.resultStat}>{formatDistance(trail.distance_mi, distanceUnit)}</Text>}
                        {trail.elevation_ft > 0 && <Text style={styles.resultStat}>{formatElevation(trail.elevation_ft, distanceUnit)}</Text>}
                        <View style={[styles.resultDiff, { borderColor: dc + "55", backgroundColor: dc + "18" }]}>
                          <Text style={[styles.resultDiffText, { color: dc }]}>{trail.difficulty}</Text>
                        </View>
                      </View>
                    </View>
                    <Feather name="plus-circle" size={22} color={Colors.accent} />
                  </Pressable>
                );
              })}
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
  clearBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border2 },
  clearBtnText: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.text3 },
  scroll: { paddingHorizontal: 16 },
  fieldLabel: { fontSize: 11, letterSpacing: 1, textTransform: "uppercase", color: Colors.text3, marginBottom: 8, marginTop: 4, fontFamily: "Inter_500Medium" },
  trailSearchBtn: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14, marginBottom: 8 },
  trailSearchBtnText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text3 },
  trailHint: { flexDirection: "row", alignItems: "flex-start", gap: 8, backgroundColor: "rgba(109,184,122,0.08)", borderRadius: 10, borderWidth: 1, borderColor: "rgba(109,184,122,0.2)", paddingHorizontal: 12, paddingVertical: 10, marginBottom: 16 },
  trailHintText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text3, lineHeight: 18 },
  selectedTrailCard: { flexDirection: "row", alignItems: "center", backgroundColor: Colors.bg3, borderWidth: 1.5, borderColor: Colors.green, borderRadius: 12, padding: 14, marginBottom: 16, gap: 10 },
  selectedTrailInfo: { flex: 1 },
  selectedTrailName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text, marginBottom: 2 },
  selectedTrailLocation: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text3, marginBottom: 6 },
  selectedTrailStats: { flexDirection: "row", alignItems: "center", gap: 8 },
  selectedTrailStat: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text2 },
  diffChipSmall: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 20, borderWidth: 1 },
  diffChipSmallText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  changeTrailBtn: { paddingVertical: 6, paddingHorizontal: 12, borderRadius: 20, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border2 },
  changeTrailText: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.text3 },
  datePicker: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 13, marginBottom: 16 },
  dateText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text },
  dateModalOverlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  dateModalSheet: { backgroundColor: Colors.bg2, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 32 },
  dateModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16 },
  dateModalTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  dateModalDone: { paddingVertical: 6, paddingHorizontal: 14, backgroundColor: Colors.green2, borderRadius: 20 },
  dateModalDoneText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  input: { backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontFamily: "Inter_400Regular", fontSize: 14, color: Colors.text, marginBottom: 16 },
  textarea: { minHeight: 80, textAlignVertical: "top" },
  row3: { flexDirection: "row", gap: 10 },
  col: { flex: 1 },
  inputSkipped: { opacity: 0.45 },
  skipRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: -8, marginBottom: 16 },
  skipBox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1, borderColor: Colors.border2, backgroundColor: Colors.bg3, alignItems: "center", justifyContent: "center" },
  skipBoxActive: { backgroundColor: Colors.green2, borderColor: Colors.green2 },
  skipText: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text3 },
  skipTextActive: { color: Colors.text2 },
  diffRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  diffChip: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, borderWidth: 1, borderColor: Colors.border2, backgroundColor: Colors.bg3 },
  diffChipActive: { backgroundColor: Colors.green2, borderColor: Colors.green2 },
  diffChipText: { fontSize: 13, fontFamily: "Inter_500Medium", color: Colors.text2 },
  diffChipTextActive: { color: "#fff" },
  dimContainer: { backgroundColor: Colors.bg3, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, padding: 14, marginBottom: 16 },
  dimRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  dimName: { fontSize: 13, color: Colors.text2, fontFamily: "Inter_500Medium", width: 110 },
  starRow: { flexDirection: "row", gap: 4 },
  star: { padding: 2 },
  scoreDisplay: { alignItems: "center", backgroundColor: Colors.bg3, borderRadius: 12, paddingVertical: 16, marginBottom: 20, borderWidth: 1, borderColor: Colors.border },
  bigScore: { fontFamily: "Inter_700Bold", fontSize: 48, color: Colors.amber2, lineHeight: 56 },
  bigScoreLbl: { fontSize: 11, color: Colors.text3, textTransform: "uppercase", letterSpacing: 0.8, fontFamily: "Inter_500Medium" },
  photoScroll: { flexGrow: 0, marginBottom: 16 },
  photoRow: { gap: 10, paddingVertical: 4 },
  photoWrap: { position: "relative" },
  photoPreview: { width: 90, height: 90, borderRadius: 10, backgroundColor: Colors.surface },
  removePhoto: { position: "absolute", top: 4, right: 4, width: 20, height: 20, borderRadius: 10, backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center" },
  addPhotoBtn: { width: 90, height: 90, borderRadius: 10, borderWidth: 1.5, borderColor: Colors.border2, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 4, backgroundColor: Colors.bg3 },
  addPhotoText: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.text3 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: Colors.green2, borderRadius: 12, paddingVertical: 16, marginTop: 4, marginBottom: 20 },
  submitBtnDisabled: { opacity: 0.4 },
  submitBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff", letterSpacing: 0.2 },
  searchModal: { flex: 1, backgroundColor: Colors.bg },
  searchModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: Colors.border },
  searchModalTitle: { fontFamily: "Inter_600SemiBold", fontSize: 18, color: Colors.text },
  searchModalBar: { flexDirection: "row", alignItems: "center", gap: 10, margin: 16, backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 12 },
  searchModalInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.text },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 10 },
  emptyText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text2 },
  emptySubtext: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text3, textAlign: "center" },
  resultsLabel: { fontSize: 11, letterSpacing: 1.2, textTransform: "uppercase", color: Colors.text3, paddingHorizontal: 20, paddingVertical: 12, fontFamily: "Inter_500Medium" },
  resultRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: Colors.border },
  resultInfo: { flex: 1 },
  resultName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text, marginBottom: 2 },
  resultLocation: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text3, marginBottom: 6 },
  resultStats: { flexDirection: "row", alignItems: "center", gap: 8 },
  resultStat: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text2 },
  resultDiff: { paddingVertical: 2, paddingHorizontal: 8, borderRadius: 20, borderWidth: 1 },
  resultDiffText: { fontSize: 11, fontFamily: "Inter_500Medium" },
});

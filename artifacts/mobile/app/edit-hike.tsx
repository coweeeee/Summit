import { Feather } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
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
import { useAuth } from "@/context/AuthContext";
import { useHikes } from "@/context/HikesContext";
import { formatDateTime } from "@/lib/format";
import { DIFFICULTIES, YEAR_OPTIONS, filterDecimal, filterInteger, withYear } from "@/lib/hikeForm";
import {
  distanceFromMiles,
  distanceToMiles,
  distanceUnitLabel,
  elevationFromFeet,
  elevationToFeet,
  elevationUnitLabel,
} from "@/lib/units";

// Fix the facts of a hike you already logged.
//
// Deliberately not the log form in an edit mode. log.tsx is 745 lines and also
// owns trail search, the trail-request flow, photo upload and ratings; adding a
// mode flag to it would put the more important create path at risk to save
// duplicating a handful of inputs. This screen edits only what can be plainly
// wrong — distance, elevation, duration, difficulty, notes, date — and leaves
// trail, photos and ratings to the log form.
//
// Ratings are excluded for a concrete reason, not just scope: `dim_ratings` has
// INSERT and UPDATE policies but no DELETE, so un-rating a dimension would fail
// silently. Offering it would need a migration first.

export default function EditHikeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const { hikes, updateHike } = useHikes();
  const distanceUnit = profile?.distance_unit ?? "imperial";

  // Read from the context rather than refetching: this screen is only reachable
  // from your own hike, and the context already holds every one of them.
  const hike = hikes.find(h => h.id === id);

  const [distanceStr, setDistanceStr] = useState("");
  const [elevationStr, setElevationStr] = useState("");
  const [durationStr, setDurationStr] = useState("");
  const [skipDuration, setSkipDuration] = useState(false);
  const [difficulty, setDifficulty] = useState("");
  const [notes, setNotes] = useState("");
  const [hikeDate, setHikeDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);

  // Seeded once the hike is available. `hikes` can still be loading on a cold
  // start, and re-seeding on every change would overwrite what is being typed.
  useEffect(() => {
    if (!hike || ready) return;
    // Stored in miles/feet, shown in the user's units — the same conversion the
    // log form does, in reverse.
    setDistanceStr(hike.distanceMi ? String(Number(distanceFromMiles(hike.distanceMi, distanceUnit).toFixed(2))) : "");
    setElevationStr(hike.elevationFt ? String(Math.round(elevationFromFeet(hike.elevationFt, distanceUnit))) : "");
    // null duration is the deliberate "I didn't track my time" case, not zero.
    setSkipDuration(hike.durationHr == null);
    setDurationStr(hike.durationHr != null ? String(hike.durationHr) : "");
    setDifficulty(hike.difficulty || "");
    setNotes(hike.notes || "");
    if (hike.date) setHikeDate(new Date(hike.date));
    setReady(true);
  }, [hike, ready, distanceUnit]);

  const toggleSkipDuration = () => {
    const next = !skipDuration;
    setSkipDuration(next);
    if (next) setDurationStr("");
  };

  const handleSave = async () => {
    if (!hike) return;
    if (!difficulty) {
      Alert.alert("Pick a difficulty", "Choose how hard the hike was before saving.");
      return;
    }
    setSaving(true);
    const result = await updateHike(hike.id, {
      distanceMi: distanceToMiles(parseFloat(distanceStr) || 0, distanceUnit),
      elevationFt: Math.round(elevationToFeet(parseInt(elevationStr) || 0, distanceUnit)),
      durationHr: skipDuration ? undefined : parseFloat(durationStr) || undefined,
      difficulty,
      notes: notes.trim(),
      date: hikeDate.toISOString(),
    });
    setSaving(false);

    if ("error" in result) {
      Alert.alert("Couldn't save changes", result.error);
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  if (!hike) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="chevron-left" size={28} color={Colors.text} />
          </Pressable>
          <Text style={styles.title}>Edit hike</Text>
        </View>
        <View style={styles.missing}>
          <ActivityIndicator color={Colors.accent} />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} disabled={saving}>
          <Feather name="chevron-left" size={28} color={Colors.text} />
        </Pressable>
        <Text style={styles.title}>Edit hike</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* The trail is shown but not editable: changing which trail a hike
            belongs to is a different operation from correcting its numbers. */}
        <View style={styles.trailCard}>
          <Feather name="map-pin" size={14} color={Colors.text3} />
          <View style={{ flex: 1 }}>
            <Text style={styles.trailName} numberOfLines={1}>{hike.trailName}</Text>
            {hike.location ? <Text style={styles.trailLocation} numberOfLines={1}>{hike.location}</Text> : null}
          </View>
        </View>

        <Text style={styles.fieldLabel}>Date &amp; Start Time</Text>
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
                  <Pressable onPress={() => setShowDatePicker(false)} style={styles.dateModalDone}>
                    <Text style={styles.dateModalDoneText}>Done</Text>
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.yearRow}>
                  {YEAR_OPTIONS.map(y => {
                    const active = hikeDate.getFullYear() === y;
                    return (
                      <Pressable key={y} onPress={() => setHikeDate(withYear(hikeDate, y))} style={[styles.yearChip, active && styles.yearChipActive]}>
                        <Text style={[styles.yearChipText, active && styles.yearChipTextActive]}>{y}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
                <DateTimePicker value={hikeDate} mode="datetime" display="spinner" maximumDate={new Date()} onChange={(_, d) => { if (d) setHikeDate(d); }} textColor={Colors.text} themeVariant="dark" />
              </View>
            </View>
          </Modal>
        )}
        {showDatePicker && Platform.OS === "android" && (
          <DateTimePicker value={hikeDate} mode="datetime" display="spinner" maximumDate={new Date()} onChange={(_, d) => { setShowDatePicker(false); if (d) setHikeDate(d); }} />
        )}

        <View style={styles.row3}>
          <View style={styles.col}>
            <Text style={styles.fieldLabel}>Distance ({distanceUnitLabel(distanceUnit)})</Text>
            <TextInput style={styles.input} placeholder="0.0" placeholderTextColor={Colors.text3} value={distanceStr} onChangeText={v => setDistanceStr(filterDecimal(v))} keyboardType="decimal-pad" maxLength={6} />
          </View>
          <View style={styles.col}>
            <Text style={styles.fieldLabel}>Elevation ({elevationUnitLabel(distanceUnit)})</Text>
            <TextInput style={styles.input} placeholder="0" placeholderTextColor={Colors.text3} value={elevationStr} onChangeText={v => setElevationStr(filterInteger(v))} keyboardType="number-pad" maxLength={6} />
          </View>
          <View style={styles.col}>
            <Text style={styles.fieldLabel}>Duration (hr)</Text>
            <TextInput style={[styles.input, skipDuration && styles.inputSkipped]} placeholder={skipDuration ? "—" : "0.0"} placeholderTextColor={Colors.text3} value={durationStr} onChangeText={v => setDurationStr(filterDecimal(v))} keyboardType="decimal-pad" maxLength={5} editable={!skipDuration} />
          </View>
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

        <Text style={styles.fieldLabel}>Notes</Text>
        <TextInput
          style={[styles.input, styles.notesInput]}
          placeholder="How was it?"
          placeholderTextColor={Colors.text3}
          value={notes}
          onChangeText={setNotes}
          multiline
          maxLength={500}
        />

        <Text style={styles.footnote}>
          Photos and ratings are set when you log a hike and can&apos;t be changed here yet.
        </Text>

        <Pressable
          onPress={handleSave}
          disabled={saving}
          style={({ pressed }) => [styles.saveBtn, { opacity: pressed || saving ? 0.7 : 1 }]}
        >
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save changes</Text>}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.bg },
  header: { paddingHorizontal: 20, paddingBottom: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  backBtn: { marginLeft: -6, padding: 2 },
  title: { fontFamily: "Inter_700Bold", fontSize: 22, color: Colors.text, letterSpacing: -0.4 },
  content: { paddingHorizontal: 20, paddingBottom: 60 },
  missing: { flex: 1, alignItems: "center", justifyContent: "center" },

  trailCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: Colors.bg2, borderRadius: 12, padding: 14,
    borderWidth: 1, borderColor: Colors.border, marginBottom: 20,
  },
  trailName: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.text },
  trailLocation: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text3, marginTop: 1 },

  fieldLabel: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text2, marginBottom: 8, marginTop: 12 },
  input: {
    backgroundColor: Colors.bg2, borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 11,
    fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.text,
  },
  inputSkipped: { color: Colors.text3, backgroundColor: Colors.bg3 },
  notesInput: { minHeight: 90, textAlignVertical: "top" },

  datePicker: {
    flexDirection: "row", alignItems: "center", gap: 10,
    backgroundColor: Colors.bg2, borderRadius: 10, borderWidth: 1, borderColor: Colors.border,
    paddingHorizontal: 12, paddingVertical: 12,
  },
  dateText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 15, color: Colors.text },
  dateModalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  dateModalSheet: { backgroundColor: Colors.bg2, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 28 },
  dateModalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14 },
  dateModalTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: Colors.text },
  dateModalDone: { paddingHorizontal: 8, paddingVertical: 4 },
  dateModalDoneText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: Colors.accent },
  yearRow: { paddingHorizontal: 20, gap: 8, paddingBottom: 8 },
  yearChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, backgroundColor: Colors.bg3, borderWidth: 1, borderColor: Colors.border },
  yearChipActive: { backgroundColor: Colors.green2, borderColor: Colors.green },
  yearChipText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text2 },
  yearChipTextActive: { color: "#fff" },

  row3: { flexDirection: "row", gap: 10 },
  col: { flex: 1 },

  skipRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  skipBox: {
    width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: Colors.border2,
    alignItems: "center", justifyContent: "center",
  },
  skipBoxActive: { backgroundColor: Colors.green2, borderColor: Colors.green },
  skipText: { fontFamily: "Inter_400Regular", fontSize: 13, color: Colors.text3 },
  skipTextActive: { color: Colors.text2 },

  diffRow: { flexDirection: "row", gap: 8 },
  diffChip: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: Colors.bg2, borderWidth: 1, borderColor: Colors.border },
  diffChipActive: { backgroundColor: Colors.green2, borderColor: Colors.green },
  diffChipText: { fontFamily: "Inter_500Medium", fontSize: 13, color: Colors.text2 },
  diffChipTextActive: { color: "#fff" },

  footnote: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text3, marginTop: 20, lineHeight: 17 },

  saveBtn: { backgroundColor: Colors.green2, borderRadius: 12, paddingVertical: 15, alignItems: "center", marginTop: 20 },
  saveBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: "#fff" },
});

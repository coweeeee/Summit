import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Colors from "@/constants/colors";
import { useHikes, DimRating } from "@/context/HikesContext";

const DIFFICULTIES = ["Easy", "Moderate", "Hard", "Expert"];
const DIMENSIONS = ["Scenery", "Views", "Trail Cond.", "Crowds", "Accessibility"];

function StarRating({
  dim,
  value,
  onChange,
}: {
  dim: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.dimRow}>
      <Text style={styles.dimName}>{dim}</Text>
      <View style={styles.starRow}>
        {[1, 2, 3, 4, 5].map((s) => (
          <Pressable
            key={s}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onChange(s);
            }}
            style={styles.star}
          >
            <Feather
              name="star"
              size={20}
              color={s <= value ? Colors.amber2 : Colors.surface2}
            />
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
    <AnimatedPressable
      style={[styles.submitBtn, disabled && styles.submitBtnDisabled, style]}
      onPressIn={() => { scale.value = withSpring(0.97); }}
      onPressOut={() => { scale.value = withSpring(1); }}
      onPress={onPress}
      disabled={disabled}
    >
      <Feather name="check" size={18} color="#fff" />
      <Text style={styles.submitBtnText}>Log This Hike</Text>
    </AnimatedPressable>
  );
}

export default function LogScreen() {
  const { addHike } = useHikes();
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [trailName, setTrailName] = useState("");
  const [location, setLocation] = useState("");
  const [distanceStr, setDistanceStr] = useState("");
  const [elevationStr, setElevationStr] = useState("");
  const [durationStr, setDurationStr] = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [notes, setNotes] = useState("");
  const [dimRatings, setDimRatings] = useState<Record<string, number>>({});

  const overallScore =
    Object.values(dimRatings).length > 0
      ? parseFloat(
          (
            Object.values(dimRatings).reduce((a, b) => a + b, 0) /
            Object.values(dimRatings).length
          ).toFixed(1)
        )
      : 0;

  const canSubmit = trailName.trim().length > 0 && difficulty !== "";

  const reset = () => {
    setTrailName("");
    setLocation("");
    setDistanceStr("");
    setElevationStr("");
    setDurationStr("");
    setDifficulty("");
    setNotes("");
    setDimRatings({});
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const ratings: DimRating[] = DIMENSIONS.filter(
      (d) => dimRatings[d] !== undefined
    ).map((d) => ({ name: d, score: dimRatings[d] }));

    await addHike({
      trailName: trailName.trim(),
      location: location.trim(),
      distanceMi: parseFloat(distanceStr) || 0,
      elevationFt: parseInt(elevationStr) || 0,
      durationHr: parseFloat(durationStr) || undefined,
      difficulty,
      overallScore: overallScore || 0,
      dimRatings: ratings,
      notes: notes.trim(),
    });
    reset();
    Alert.alert("Hike Logged!", "Your hike has been added to your journal.");
  };

  return (
    <View style={[styles.container]}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Text style={styles.title}>Log a Hike</Text>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: Platform.OS === "web" ? 84 : 100 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.fieldLabel}>Trail Name</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Half Dome via John Muir"
          placeholderTextColor={Colors.text3}
          value={trailName}
          onChangeText={setTrailName}
        />

        <Text style={styles.fieldLabel}>Location</Text>
        <TextInput
          style={styles.input}
          placeholder="Park or region"
          placeholderTextColor={Colors.text3}
          value={location}
          onChangeText={setLocation}
        />

        <View style={styles.row3}>
          <View style={styles.col}>
            <Text style={styles.fieldLabel}>Distance (mi)</Text>
            <TextInput
              style={styles.input}
              placeholder="0.0"
              placeholderTextColor={Colors.text3}
              value={distanceStr}
              onChangeText={setDistanceStr}
              keyboardType="decimal-pad"
            />
          </View>
          <View style={styles.col}>
            <Text style={styles.fieldLabel}>Elevation (ft)</Text>
            <TextInput
              style={styles.input}
              placeholder="0"
              placeholderTextColor={Colors.text3}
              value={elevationStr}
              onChangeText={setElevationStr}
              keyboardType="number-pad"
            />
          </View>
          <View style={styles.col}>
            <Text style={styles.fieldLabel}>Duration (hr)</Text>
            <TextInput
              style={styles.input}
              placeholder="0.0"
              placeholderTextColor={Colors.text3}
              value={durationStr}
              onChangeText={setDurationStr}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        <Text style={styles.fieldLabel}>Difficulty</Text>
        <View style={styles.diffRow}>
          {DIFFICULTIES.map((d) => (
            <Pressable
              key={d}
              onPress={() => {
                Haptics.selectionAsync();
                setDifficulty(d);
              }}
              style={[styles.diffChip, difficulty === d && styles.diffChipActive]}
            >
              <Text style={[styles.diffChipText, difficulty === d && styles.diffChipTextActive]}>
                {d}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.fieldLabel}>Rate Your Experience</Text>
        <View style={styles.dimContainer}>
          {DIMENSIONS.map((dim) => (
            <StarRating
              key={dim}
              dim={dim}
              value={dimRatings[dim] ?? 0}
              onChange={(v) => setDimRatings((prev) => ({ ...prev, [dim]: v }))}
            />
          ))}
        </View>

        {overallScore > 0 && (
          <View style={styles.scoreDisplay}>
            <Text style={styles.bigScore}>{overallScore.toFixed(1)}</Text>
            <Text style={styles.bigScoreLbl}>Overall Score</Text>
          </View>
        )}

        <Text style={styles.fieldLabel}>Notes</Text>
        <TextInput
          style={[styles.input, styles.textarea]}
          placeholder="Conditions, tips, highlights..."
          placeholderTextColor={Colors.text3}
          value={notes}
          onChangeText={setNotes}
          multiline
          numberOfLines={3}
        />

        <SubmitButton onPress={handleSubmit} disabled={!canSubmit} />
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
  scroll: {
    paddingHorizontal: 16,
  },
  fieldLabel: {
    fontSize: 11,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: Colors.text3,
    marginBottom: 8,
    marginTop: 4,
    fontFamily: "Inter_500Medium",
  },
  input: {
    backgroundColor: Colors.bg3,
    borderWidth: 1,
    borderColor: Colors.border2,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: Colors.text,
    marginBottom: 16,
  },
  textarea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  row3: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 0,
  },
  col: {
    flex: 1,
  },
  diffRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 20,
  },
  diffChip: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border2,
    backgroundColor: Colors.bg3,
  },
  diffChipActive: {
    backgroundColor: Colors.green2,
    borderColor: Colors.green2,
  },
  diffChipText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    color: Colors.text2,
  },
  diffChipTextActive: {
    color: "#fff",
  },
  dimContainer: {
    backgroundColor: Colors.bg3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 16,
  },
  dimRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  dimName: {
    fontSize: 13,
    color: Colors.text2,
    fontFamily: "Inter_500Medium",
    width: 110,
  },
  starRow: {
    flexDirection: "row",
    gap: 4,
  },
  star: {
    padding: 2,
  },
  scoreDisplay: {
    alignItems: "center",
    backgroundColor: Colors.bg3,
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  bigScore: {
    fontFamily: "Inter_700Bold",
    fontSize: 48,
    color: Colors.amber2,
    lineHeight: 56,
  },
  bigScoreLbl: {
    fontSize: 11,
    color: Colors.text3,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    fontFamily: "Inter_500Medium",
  },
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.green2,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 4,
    marginBottom: 20,
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
    letterSpacing: 0.2,
  },
});

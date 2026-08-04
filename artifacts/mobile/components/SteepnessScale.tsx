import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";
import { STEEPNESS_BANDS, steepnessBand, steepnessScalePosition, type Grade } from "@/lib/elevation";

// Where a hike's average grade sits on a steepness scale.
//
// This is deliberately NOT an elevation profile, and it is worth being blunt
// about why in the place someone will read it. A profile is a curve of height
// against distance; the database holds one integer of total gain per hike and
// no route geometry anywhere, so that curve cannot be drawn from this data.
// Drawing a plausible-looking one from a single total would be inventing the
// shape — the reader could not tell, which is exactly what makes it wrong.
//
// What two real numbers do support is a ratio, and a ratio is worth showing:
// 1,000 feet over 3.6 miles and 1,000 feet over 12 miles are very different
// days out, and nothing in the app currently distinguishes them.
//
// Percentage rather than feet-per-mile as the headline figure because it needs
// no unit conversion — it reads the same for a metric and an imperial user, and
// it is how trail signage expresses grade.

export default function SteepnessScale({ grade, roundTrip }: { grade: Grade; roundTrip?: boolean }) {
  const band = steepnessBand(grade.ftPerMile);
  const position = steepnessScalePosition(grade.ftPerMile);

  return (
    <View style={styles.wrap}>
      <View style={styles.headline}>
        <Text style={styles.bandLabel}>{band.label}</Text>
        <Text style={styles.gradeValue}>{grade.percent.toFixed(1)}% average grade</Text>
      </View>

      <View style={styles.track} accessibilityRole="image" accessibilityLabel={`${band.label}, ${grade.percent.toFixed(1)} percent average grade`}>
        {STEEPNESS_BANDS.map(b => (
          <View
            key={b.key}
            style={[styles.segment, b.key === band.key && styles.segmentActive]}
          />
        ))}
        {/* Positioned by the same function the tests pin, so the marker and the
            label can never disagree about which band this is. */}
        <View style={[styles.marker, { left: `${position * 100}%` }]} />
      </View>

      <View style={styles.axis}>
        <Text style={styles.axisLabel}>{STEEPNESS_BANDS[0].label}</Text>
        <Text style={styles.axisLabel}>{STEEPNESS_BANDS[STEEPNESS_BANDS.length - 1].label}</Text>
      </View>

      {/* Said rather than hidden. `elevation_ft` is total gain and `distance_mi`
          is normally the round trip, so this averages the climb over ground
          that includes coming back down — it understates the ascent itself. */}
      <Text style={styles.caveat}>
        {roundTrip
          ? "Averaged over the full distance, including the descent."
          : "Averaged over the full logged distance."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: 16, marginTop: 4, marginBottom: 8, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.bg3, gap: 8 },
  headline: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8 },
  bandLabel: { fontFamily: "Inter_700Bold", fontSize: 15, color: Colors.text },
  gradeValue: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text3 },
  track: { flexDirection: "row", gap: 3, height: 8, position: "relative" },
  segment: { flex: 1, borderRadius: 3, backgroundColor: Colors.border2 },
  segmentActive: { backgroundColor: Colors.accent },
  // marginLeft offsets half the marker's own width so it centres on its
  // position rather than starting there.
  marker: { position: "absolute", top: -3, width: 2, height: 14, marginLeft: -1, borderRadius: 1, backgroundColor: Colors.text },
  axis: { flexDirection: "row", justifyContent: "space-between" },
  axisLabel: { fontFamily: "Inter_400Regular", fontSize: 10, color: Colors.text3, textTransform: "uppercase", letterSpacing: 0.5 },
  caveat: { fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.text3, lineHeight: 15 },
});

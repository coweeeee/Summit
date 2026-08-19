import React, { useMemo, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import Colors from "@/constants/colors";
import { buildActivityHeatmap, intensityBand, type HeatmapDay } from "@/lib/activityHeatmap";

const CELL = 11;
const GAP = 3;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Five steps from the accent, rather than five hand-picked hex values, so the
// ramp stays in step if the palette changes. Colors.accent is #8dcf7a.
const BAND_COLORS = [
  Colors.bg3,
  "rgba(141,207,122,0.22)",
  "rgba(141,207,122,0.42)",
  "rgba(141,207,122,0.68)",
  Colors.accent,
];

/**
 * A year of hiking days, GitHub-contributions style.
 *
 * Calendar only. `hikes` stores no GPS of any kind, so there is nothing
 * geographic this could show -- see lib/activityHeatmap.ts.
 *
 * Scrolls horizontally and starts at the right: 53 columns do not fit on a
 * phone, and the interesting end is the recent one. `contentOffset` rather than
 * a scrollToEnd() in an effect, so the first painted frame is already correct
 * instead of visibly jumping after mount.
 */
export default function ActivityHeatmap({ dates }: { dates: readonly (string | null | undefined)[] }) {
  // `today` is captured once per render pass rather than read inside the
  // builder, so every cell in one grid agrees on which day is today.
  const today = useRef(new Date()).current;
  const { weeks, maxCount, activeDays, totalHikes } = useMemo(
    () => buildActivityHeatmap(dates, today),
    [dates, today]
  );

  const monthLabels = useMemo(() => {
    const out: { index: number; label: string }[] = [];
    let lastMonth = -1;
    weeks.forEach((col, i) => {
      const [y, m] = col[0].key.split("-").map(Number);
      if (m - 1 !== lastMonth) {
        lastMonth = m - 1;
        // Skip a label that would collide with the previous one.
        if (!out.length || i - out[out.length - 1].index >= 3) out.push({ index: i, label: MONTHS[m - 1] });
      }
      void y;
    });
    return out;
  }, [weeks]);

  const gridWidth = weeks.length * (CELL + GAP);

  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentOffset={{ x: Math.max(0, gridWidth - 330), y: 0 }}
        contentContainerStyle={styles.scroll}
      >
        <View>
          <View style={[styles.monthRow, { width: gridWidth }]}>
            {monthLabels.map(m => (
              <Text key={`${m.label}-${m.index}`} style={[styles.monthText, { left: m.index * (CELL + GAP) }]}>
                {m.label}
              </Text>
            ))}
          </View>
          <View style={styles.grid}>
            {weeks.map((col, i) => (
              <View key={i} style={{ marginRight: GAP }}>
                {col.map((day: HeatmapDay) => (
                  <View
                    key={day.key}
                    style={[
                      styles.cell,
                      // Future days are holes, not empty days. Rendering them
                      // as level-0 would claim the user did not hike on days
                      // that have not happened.
                      day.future
                        ? styles.cellFuture
                        : { backgroundColor: BAND_COLORS[intensityBand(day.count, maxCount)] },
                    ]}
                  />
                ))}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>

      <Text style={styles.caption}>
        {activeDays === 0
          ? "No hikes logged in the past year"
          : `${totalHikes} ${totalHikes === 1 ? "hike" : "hikes"} on ${activeDays} ${activeDays === 1 ? "day" : "days"} in the past year`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4 },
  scroll: { paddingHorizontal: 20 },
  monthRow: { height: 14, marginBottom: 4 },
  monthText: { position: "absolute", fontFamily: "Inter_500Medium", fontSize: 9.5, color: Colors.text3 },
  grid: { flexDirection: "row" },
  cell: { width: CELL, height: CELL, borderRadius: 2.5, marginBottom: GAP },
  cellFuture: { backgroundColor: "transparent" },
  caption: { fontFamily: "Inter_400Regular", fontSize: 12, color: Colors.text3, paddingHorizontal: 20, marginTop: 8 },
});

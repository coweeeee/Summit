// Calendar heatmap of hiking days, GitHub-contributions style.
//
// Keyed on `hikes.date` ONLY. There are no GPS points anywhere in this schema
// -- `hikes` carries totals and a date, nothing per-point -- so this is a
// calendar, not a map, and cannot become one without new data.
//
// BUCKETED BY LOCAL DAY, NOT UTC, and that is not a detail. `hikes.date` is a
// timestamptz: the Mist Trail row is stored 2025-11-15T03:11Z and the hike list
// renders it "Nov 14", because the device is UTC-8. Bucketing on the UTC date
// would put that hike in a different column from the row describing it on the
// same screen. Every key here therefore comes from the local getFullYear/
// getMonth/getDate triple, never from toISOString().

export type HeatmapDay = {
  /** Local calendar day, YYYY-MM-DD. Stable key and the bucket identity. */
  key: string;
  count: number;
  /** True for days after today, which pad the final column. */
  future: boolean;
};

export type ActivityHeatmap = {
  /** Columns of 7, Sunday first, oldest column first. */
  weeks: HeatmapDay[][];
  maxCount: number;
  totalHikes: number;
  activeDays: number;
};

/** Local-day key. Deliberately not toISOString(), which would shift the day. */
export function localDayKey(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/**
 * @param dates  Raw `hikes.date` values. Nulls and unparseable strings are
 *               dropped rather than coerced -- `date` is nullable, and a hike
 *               with no date is an unknown day, not today. Silently bucketing
 *               those into "now" would invent activity that never happened.
 * @param today  Injected rather than read from the clock, so the grid is
 *               testable and so a single render cannot straddle midnight.
 * @param weeks  Number of columns. 53 covers a full year plus the partial
 *               current week, which is what makes the leftmost column line up
 *               with the same weekday a year ago.
 */
export function buildActivityHeatmap(
  dates: readonly (string | null | undefined)[],
  today: Date,
  weeks = 53
): ActivityHeatmap {
  const counts = new Map<string, number>();
  let totalHikes = 0;

  for (const raw of dates) {
    if (!raw) continue;
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) continue;
    const key = localDayKey(d);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    totalHikes += 1;
  }

  // Anchor on the Saturday ending this week so the final column is the current
  // week and the grid reads left-to-right as oldest-to-newest.
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  end.setDate(end.getDate() + (6 - end.getDay()));

  const start = new Date(end);
  start.setDate(start.getDate() - (weeks * 7 - 1));

  const todayKey = localDayKey(today);
  const grid: HeatmapDay[][] = [];
  const cursor = new Date(start);

  for (let w = 0; w < weeks; w++) {
    const column: HeatmapDay[] = [];
    for (let d = 0; d < 7; d++) {
      const key = localDayKey(cursor);
      column.push({ key, count: counts.get(key) ?? 0, future: key > todayKey });
      cursor.setDate(cursor.getDate() + 1);
    }
    grid.push(column);
  }

  // Counted from the rendered grid, not from `counts`, so the number under the
  // grid can never claim days the grid does not show.
  let maxCount = 0;
  let activeDays = 0;
  for (const col of grid) {
    for (const day of col) {
      if (day.future) continue;
      if (day.count > 0) activeDays += 1;
      if (day.count > maxCount) maxCount = day.count;
    }
  }

  return { weeks: grid, maxCount, totalHikes, activeDays };
}

/**
 * Intensity band 0-4 for a day, matching the five-step palette.
 *
 * Banded against maxCount rather than a fixed scale: this app's busiest user
 * has three hikes total, so a fixed "4+ hikes is darkest" scale would render
 * every real profile as one flat shade.
 */
export function intensityBand(count: number, maxCount: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (maxCount <= 1) return 4;
  const ratio = count / maxCount;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

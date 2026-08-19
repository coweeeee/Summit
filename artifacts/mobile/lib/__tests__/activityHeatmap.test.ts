import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { buildActivityHeatmap, intensityBand, localDayKey } from "../activityHeatmap.ts";

// Run with `npm test`. Unit-tested rather than eyeballed because the database
// holds three hikes across two accounts, so a Simulator pass shows two marks on
// a 371-cell grid and proves nothing about bucketing, null handling or the
// week alignment.

// A fixed local noon, so no assertion here can straddle a midnight or a DST
// boundary the way `new Date()` would.
const TODAY = new Date(2026, 7, 15, 12, 0, 0); // 2026-08-15, local

describe("localDayKey", () => {
  test("uses the LOCAL calendar day, not the UTC one", () => {
    // The real Mist Trail row: stored 2025-11-15T03:11Z, shown as "Nov 14" by
    // the hike list on the same screen. Both must agree.
    const d = new Date("2025-11-15T03:11:00Z");
    const expected = `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, "0")}-${`${d.getDate()}`.padStart(2, "0")}`;
    assert.equal(localDayKey(d), expected);
    // And it must not simply be the ISO prefix, which is the tempting shortcut.
    if (d.getTimezoneOffset() !== 0) {
      assert.notEqual(localDayKey(d), d.toISOString().slice(0, 10));
    }
  });
});

describe("buildActivityHeatmap — shape", () => {
  test("53 columns of 7, oldest first", () => {
    const h = buildActivityHeatmap([], TODAY);
    assert.equal(h.weeks.length, 53);
    for (const col of h.weeks) assert.equal(col.length, 7);
  });

  test("every column starts on a Sunday", () => {
    const h = buildActivityHeatmap([], TODAY);
    for (const col of h.weeks) {
      const [y, m, d] = col[0].key.split("-").map(Number);
      assert.equal(new Date(y, m - 1, d).getDay(), 0);
    }
  });

  test("today appears in the final column, and later days are marked future", () => {
    const h = buildActivityHeatmap([], TODAY);
    const last = h.weeks[h.weeks.length - 1];
    assert.ok(last.some(d => d.key === localDayKey(TODAY)));
    const after = last.filter(d => d.key > localDayKey(TODAY));
    assert.ok(after.every(d => d.future));
  });
});

describe("buildActivityHeatmap — counting", () => {
  test("two hikes on one local day stack into one cell", () => {
    const day = new Date(2026, 6, 26, 9, 0, 0);
    const h = buildActivityHeatmap([day.toISOString(), day.toISOString()], TODAY);
    const cell = h.weeks.flat().find(c => c.key === localDayKey(day));
    assert.equal(cell?.count, 2);
    assert.equal(h.activeDays, 1);
    assert.equal(h.totalHikes, 2);
    assert.equal(h.maxCount, 2);
  });

  test("nulls and unparseable dates are dropped, never bucketed into today", () => {
    // `hikes.date` is nullable. A hike with no date is an unknown day, and
    // folding it into today would draw activity that never happened.
    const h = buildActivityHeatmap([null, undefined, "not-a-date"], TODAY);
    assert.equal(h.totalHikes, 0);
    assert.equal(h.activeDays, 0);
    const todayCell = h.weeks.flat().find(c => c.key === localDayKey(TODAY));
    assert.equal(todayCell?.count, 0);
  });

  test("a hike older than the window is excluded from the grid counts", () => {
    const ancient = new Date(2020, 0, 1, 12, 0, 0);
    const h = buildActivityHeatmap([ancient.toISOString()], TODAY);
    // It still counts as a hike the user logged...
    assert.equal(h.totalHikes, 1);
    // ...but activeDays is read off the rendered grid, so the caption cannot
    // claim a day the grid does not show.
    assert.equal(h.activeDays, 0);
  });
});

describe("intensityBand", () => {
  test("zero is always the empty band", () => {
    assert.equal(intensityBand(0, 5), 0);
  });

  test("a single hike on a one-hike-max profile reads as full, not faint", () => {
    // Banded against maxCount on purpose: the busiest real account here has
    // three hikes total, so a fixed scale would render every profile flat.
    assert.equal(intensityBand(1, 1), 4);
  });

  test("bands rise monotonically with count", () => {
    const bands = [1, 2, 3, 4].map(c => intensityBand(c, 4));
    for (let i = 1; i < bands.length; i++) assert.ok(bands[i] >= bands[i - 1]);
    assert.equal(bands[3], 4);
  });
});

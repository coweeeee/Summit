import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  averageGrade,
  steepnessBand,
  steepnessScalePosition,
  STEEPNESS_BANDS,
} from "../elevation.ts";

// Run with `npm test`.
//
// The distinction these exist to protect is zero-versus-unknown, and it is not
// hypothetical: the catalogue contains three genuinely flat trails whose 0 feet
// of gain is the correct answer (Anhinga Trail, Shark Valley Tram Road, Fort
// Jefferson Moat Walk — all Florida boardwalk and road routes), and one row,
// Frigid Crags in Alaska, whose 0 distance and 0 elevation is a real data gap.
// Collapsing those two cases would either hide a true fact or assert a false one.

const near = (actual: number, expected: number, tolerance: number) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ~${expected} (±${tolerance}), got ${actual}`,
  );

describe("averageGrade", () => {
  test("computes feet per mile and the equivalent percentage", () => {
    // Mist Trail to Vernal Fall, as actually logged: 1000 ft over 3.6 mi.
    const g = averageGrade(1000, 3.6)!;
    near(g.ftPerMile, 277.8, 0.1);
    near(g.percent, 5.26, 0.01);
  });

  test("a flat trail has a grade of zero, not an absent one", () => {
    // Anhinga Trail: 0 ft over 0.8 mi. Flat is a fact about this trail.
    const g = averageGrade(0, 0.8);
    assert.notEqual(g, null);
    assert.equal(g!.ftPerMile, 0);
    assert.equal(g!.percent, 0);
  });

  test("returns null when the distance cannot support a ratio", () => {
    // Frigid Crags: distance 0 and elevation 0. Unknown, not flat.
    assert.equal(averageGrade(0, 0), null);
    assert.equal(averageGrade(1000, 0), null);
    assert.equal(averageGrade(1000, null), null);
    assert.equal(averageGrade(1000, undefined), null);
    assert.equal(averageGrade(1000, -3), null);
  });

  test("returns null for unusable elevation", () => {
    assert.equal(averageGrade(null, 3), null);
    assert.equal(averageGrade(undefined, 3), null);
    assert.equal(averageGrade(NaN, 3), null);
    assert.equal(averageGrade(-100, 3), null);
  });

  test("holds up for the catalogue's genuine extremes", () => {
    // These are real multi-day treks, not data errors — their grades are sane,
    // which is how we know the 39,000 ft maximum is a true value.
    near(averageGrade(39000, 112)!.ftPerMile, 348.2, 0.5);   // GR20
    near(averageGrade(15700, 37)!.ftPerMile, 424.3, 0.5);    // Kilimanjaro Machame
    near(averageGrade(100, 1.6)!.ftPerMile, 62.5, 0.1);      // Grand Prismatic Overlook
  });
});

describe("steepnessBand", () => {
  test("names each band from its own table", () => {
    assert.equal(steepnessBand(0).key, "flat");
    assert.equal(steepnessBand(62.5).key, "flat");
    assert.equal(steepnessBand(150).key, "gentle");
    assert.equal(steepnessBand(277.8).key, "moderate");
    assert.equal(steepnessBand(600).key, "steep");
    assert.equal(steepnessBand(1000).key, "very-steep");
  });

  test("boundaries are exclusive upper bounds", () => {
    assert.equal(steepnessBand(99.9).key, "flat");
    assert.equal(steepnessBand(100).key, "gentle");
    assert.equal(steepnessBand(249.9).key, "gentle");
    assert.equal(steepnessBand(250).key, "moderate");
    assert.equal(steepnessBand(800).key, "very-steep");
  });

  test("never falls off the end", () => {
    assert.equal(steepnessBand(1_000_000).key, "very-steep");
    assert.ok(steepnessBand(0).label);
  });
});

describe("steepnessScalePosition", () => {
  test("stays within the track", () => {
    for (const v of [0, 50, 100, 300, 800, 1200, 5000, 1e6]) {
      const p = steepnessScalePosition(v);
      assert.ok(p >= 0 && p <= 1, `position for ${v} was ${p}`);
    }
  });

  test("increases with steepness", () => {
    const samples = [0, 50, 120, 300, 600, 900, 1200];
    for (let i = 1; i < samples.length; i++) {
      assert.ok(
        steepnessScalePosition(samples[i]) >= steepnessScalePosition(samples[i - 1]),
        `not monotonic between ${samples[i - 1]} and ${samples[i]}`,
      );
    }
  });

  test("each band occupies an equal share of the width", () => {
    // Equal shares on purpose: the underlying values are wildly non-linear and
    // a linear axis would crush every ordinary hike into the left tenth.
    const share = 1 / STEEPNESS_BANDS.length;
    near(steepnessScalePosition(0), 0, 0.001);
    near(steepnessScalePosition(100), share, 0.001);
    near(steepnessScalePosition(250), share * 2, 0.001);
    near(steepnessScalePosition(500), share * 3, 0.001);
    near(steepnessScalePosition(800), share * 4, 0.001);
  });

  test("an extreme grade still lands on the track rather than past it", () => {
    assert.equal(steepnessScalePosition(1e6), 1);
  });
});

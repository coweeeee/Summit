import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { distanceMiTo, haversineMiles, isValidCoords, sortByDistance } from "../geo.ts";

// Run with `npm test` (node:test + native type stripping, no test framework).
//
// These carry more weight than usual for this repo: the nearby feature cannot
// be exercised end-to-end yet, because the device-location half is not wired
// (see lib/location.ts). The arithmetic and the ordering rules are the part
// that can be proved now, so they are — including the two decisions most
// likely to be "simplified" later by someone who reads null as zero.

const NYC = { lat: 40.7128, lng: -74.006 };
const LA = { lat: 34.0522, lng: -118.2437 };
const LONDON = { lat: 51.5074, lng: -0.1278 };
const PARIS = { lat: 48.8566, lng: 2.3522 };

const near = (actual: number, expected: number, tolerance: number) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ~${expected} (±${tolerance}), got ${actual}`,
  );

describe("haversineMiles", () => {
  test("is zero for a point and itself", () => {
    assert.equal(haversineMiles(NYC, NYC), 0);
  });

  test("matches known great-circle distances", () => {
    near(haversineMiles(NYC, LA), 2445, 5);
    near(haversineMiles(LONDON, PARIS), 213, 3);
  });

  test("one degree of latitude is about 69 miles anywhere", () => {
    near(haversineMiles({ lat: 0, lng: 0 }, { lat: 1, lng: 0 }), 69.09, 0.1);
    near(haversineMiles({ lat: 60, lng: 25 }, { lat: 61, lng: 25 }), 69.09, 0.1);
  });

  test("converging meridians: a degree of longitude shrinks with latitude", () => {
    const atEquator = haversineMiles({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });
    const atSixty = haversineMiles({ lat: 60, lng: 0 }, { lat: 60, lng: 1 });
    // cos(60°) = 0.5, so the high-latitude degree is half as wide.
    near(atSixty, atEquator / 2, 0.1);
  });

  test("is symmetric", () => {
    assert.equal(haversineMiles(NYC, LA), haversineMiles(LA, NYC));
  });
});

describe("isValidCoords", () => {
  test("accepts in-range pairs, including null island", () => {
    assert.equal(isValidCoords(NYC), true);
    // (0,0) is a real place. Rejecting it would be guessing that the caller's
    // data is bad rather than measuring it.
    assert.equal(isValidCoords({ lat: 0, lng: 0 }), true);
    assert.equal(isValidCoords({ lat: -90, lng: 180 }), true);
  });

  test("rejects missing, non-finite and out-of-range values", () => {
    assert.equal(isValidCoords(null), false);
    assert.equal(isValidCoords(undefined), false);
    assert.equal(isValidCoords({ lat: null, lng: null }), false);
    assert.equal(isValidCoords({ lat: 40, lng: null }), false);
    assert.equal(isValidCoords({ lat: NaN, lng: 0 }), false);
    assert.equal(isValidCoords({ lat: Infinity, lng: 0 }), false);
    // Out of range would still produce a confident-looking number from
    // haversine, which is the reason this check exists at all.
    assert.equal(isValidCoords({ lat: 91, lng: 0 }), false);
    assert.equal(isValidCoords({ lat: 0, lng: 900 }), false);
  });
});

describe("distanceMiTo", () => {
  test("returns null rather than a number when the target has no position", () => {
    assert.equal(distanceMiTo(NYC, { lat: null, lng: null }), null);
    assert.equal(distanceMiTo(NYC, { lat: 40.7, lng: null }), null);
  });

  test("returns null when the origin itself is unusable", () => {
    assert.equal(distanceMiTo({ lat: 999, lng: 0 }, LA), null);
  });

  test("null is not zero", () => {
    // The distinction the UI depends on: an unlocatable trail must not render
    // as "0.0 mi away", which reads as being underfoot.
    assert.notEqual(distanceMiTo(NYC, { lat: null, lng: null }), 0);
  });
});

describe("sortByDistance", () => {
  const trails = [
    { id: "la", lat: LA.lat, lng: LA.lng },
    { id: "nowhere", lat: null, lng: null },
    { id: "paris", lat: PARIS.lat, lng: PARIS.lng },
    { id: "london", lat: LONDON.lat, lng: LONDON.lng },
  ];

  test("orders nearest first", () => {
    const sorted = sortByDistance(trails, NYC);
    assert.deepEqual(sorted.map(t => t.id), ["la", "london", "paris", "nowhere"]);
  });

  test("annotates each item with its distance", () => {
    const sorted = sortByDistance(trails, NYC);
    near(sorted[0].distanceMi as number, 2445, 5);
  });

  test("keeps unlocatable items, at the end, marked null", () => {
    const sorted = sortByDistance(trails, NYC);
    // Kept, not dropped: this is a sort, and silently shortening the list would
    // look like a filter the user did not apply.
    assert.equal(sorted.length, trails.length);
    assert.equal(sorted[sorted.length - 1].id, "nowhere");
    assert.equal(sorted[sorted.length - 1].distanceMi, null);
  });

  test("puts every unlocatable item last, not just one", () => {
    const many = [
      { id: "a", lat: null, lng: null },
      { id: "b", lat: LA.lat, lng: LA.lng },
      { id: "c", lat: null, lng: null },
    ];
    const sorted = sortByDistance(many, NYC);
    assert.deepEqual(sorted.map(t => t.id), ["b", "a", "c"]);
  });

  test("is stable within a tie, so paging over the result cannot duplicate a row", () => {
    const tied = [
      { id: "first", lat: LA.lat, lng: LA.lng },
      { id: "second", lat: LA.lat, lng: LA.lng },
      { id: "third", lat: LA.lat, lng: LA.lng },
    ];
    assert.deepEqual(sortByDistance(tied, NYC).map(t => t.id), ["first", "second", "third"]);
  });

  test("does not mutate or alias its input", () => {
    const input = [...trails];
    const sorted = sortByDistance(input, NYC);
    assert.deepEqual(input.map(t => t.id), trails.map(t => t.id));
    assert.notEqual(sorted[0], input[0]);
  });

  test("marks everything null when the origin is unusable", () => {
    const sorted = sortByDistance(trails, { lat: NaN, lng: 0 });
    assert.ok(sorted.every(t => t.distanceMi === null));
    assert.equal(sorted.length, trails.length);
  });
});

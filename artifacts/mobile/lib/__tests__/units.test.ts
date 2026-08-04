import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { formatDistanceAway } from "../units.ts";

// Run with `npm test`.
//
// The metric path is the reason this file exists. Both profiles in the database
// are imperial, so there is no metric user to eyeball this against and a
// conversion bug would ship invisibly. Same argument as the trailIcons tests:
// what cannot be seen in the app has to be proved here.

describe("formatDistanceAway — imperial", () => {
  test("one decimal below 100", () => {
    assert.equal(formatDistanceAway(3.24, "imperial"), "3.2 mi");
    assert.equal(formatDistanceAway(0, "imperial"), "0.0 mi");
    assert.equal(formatDistanceAway(99.94, "imperial"), "99.9 mi");
  });

  test("whole units at and above 100", () => {
    assert.equal(formatDistanceAway(100, "imperial"), "100 mi");
    assert.equal(formatDistanceAway(327.4, "imperial"), "327 mi");
  });

  test("suppressed past the useful range", () => {
    assert.equal(formatDistanceAway(500, "imperial"), "500 mi");
    assert.equal(formatDistanceAway(500.1, "imperial"), null);
    // The real case that motivated this: the nearest trail to Singapore.
    assert.equal(formatDistanceAway(2155.9, "imperial"), null);
  });
});

describe("formatDistanceAway — metric", () => {
  test("converts before formatting, not after", () => {
    // 3.24 mi = 5.21 km. A missing conversion would leave "3.2 km".
    assert.equal(formatDistanceAway(3.24, "metric"), "5.2 km");
    assert.equal(formatDistanceAway(0, "metric"), "0.0 km");
  });

  test("the decimal threshold applies to the number shown, not to miles", () => {
    // 80 mi = 128.7 km. Over 100 in the unit the reader sees, so it loses the
    // decimal — "128.7 km" is the kind of false precision this avoids.
    assert.equal(formatDistanceAway(80, "metric"), "129 km");
    // 60 mi = 96.6 km, still under 100, so it keeps one decimal.
    assert.equal(formatDistanceAway(60, "metric"), "96.6 km");
  });

  test("suppression is physical, so both unit systems lose the label together", () => {
    // The point of testing miles rather than the converted value: an imperial
    // and a metric reader standing in the same place must both see a label, or
    // both not. 490 mi is 788 km — well past any metric threshold, but the same
    // real distance, so it still shows.
    assert.equal(formatDistanceAway(490, "metric"), "789 km");
    assert.equal(formatDistanceAway(501, "metric"), null);
    assert.equal(formatDistanceAway(501, "imperial"), null);
  });
});

describe("formatDistanceAway — bad input", () => {
  test("returns null rather than a formatted lie", () => {
    assert.equal(formatDistanceAway(NaN, "imperial"), null);
    assert.equal(formatDistanceAway(Infinity, "imperial"), null);
    assert.equal(formatDistanceAway(-1, "imperial"), null);
  });
});

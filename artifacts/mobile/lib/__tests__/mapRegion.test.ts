import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { regionForCoords } from "../mapRegion.ts";

// Run with `npm test`.
//
// Every interesting case here is live in the current catalogue and effectively
// impossible to check by hand: 12 of the 41 region filters match exactly one
// trail, 81 of 164 region×difficulty combinations match none, and the data
// spans the antimeridian from Kauai to New Zealand. Getting any of the three
// wrong produces a map that looks plausible and is pointed at the wrong ocean.

const near = (actual: number, expected: number, tolerance: number) =>
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ~${expected} (±${tolerance}), got ${actual}`,
  );

describe("regionForCoords — nothing to fit", () => {
  test("returns null for an empty set", () => {
    // Null rather than a default viewport: any default would be another
    // hardcoded region, which is the bug this exists to remove. Android's
    // fitToCoordinates also has no empty-array guard.
    assert.equal(regionForCoords([]), null);
  });

  test("returns null when every point is unusable", () => {
    assert.equal(regionForCoords([null, undefined]), null);
    assert.equal(regionForCoords([{ lat: NaN, lng: 0 }]), null);
    assert.equal(regionForCoords([{ lat: 91, lng: 0 }, { lat: 0, lng: 999 }]), null);
  });
});

describe("regionForCoords — one point", () => {
  const sf = { lat: 37.7749, lng: -122.4194 };

  test("centres on it and opens to the minimum span", () => {
    const r = regionForCoords([sf])!;
    assert.notEqual(r, null);
    near(r.latitude, sf.lat, 0.0001);
    near(r.longitude, sf.lng, 0.0001);
    // Not zero: a zero-extent fit slams the camera to maximum street zoom on a
    // pin with no surrounding context.
    assert.ok(r.latitudeDelta >= 0.05, `latitudeDelta was ${r.latitudeDelta}`);
    assert.ok(r.longitudeDelta >= 0.05, `longitudeDelta was ${r.longitudeDelta}`);
  });

  test("duplicate points behave like one point", () => {
    const r = regionForCoords([sf, { ...sf }])!;
    near(r.latitude, sf.lat, 0.0001);
    near(r.longitude, sf.lng, 0.0001);
    assert.ok(r.longitudeDelta >= 0.05);
  });
});

describe("regionForCoords — ordinary spreads", () => {
  test("centres between two points and pads the span", () => {
    const r = regionForCoords([{ lat: 40, lng: -74 }, { lat: 34, lng: -118 }])!;
    near(r.latitude, 37, 0.001);
    near(r.longitude, -96, 0.001);
    // 6 degrees of latitude and 44 of longitude, each padded.
    near(r.latitudeDelta, 6 * 1.35, 0.001);
    near(r.longitudeDelta, 44 * 1.35, 0.001);
  });

  test("ignores unusable points but still fits the rest", () => {
    const r = regionForCoords([
      { lat: 40, lng: -74 },
      null,
      { lat: 0, lng: 400 },
      { lat: 34, lng: -118 },
    ])!;
    near(r.latitude, 37, 0.001);
    near(r.longitude, -96, 0.001);
  });
});

describe("regionForCoords — the antimeridian", () => {
  // Both are real rows: Kauai in Hawaii and a New Zealand trail.
  const KAUAI = { lat: 22.07, lng: -159.66 };
  const NZ = { lat: -45.03, lng: 175.67 };

  test("fits the short way round, not across the whole globe", () => {
    const r = regionForCoords([KAUAI, NZ])!;
    // The naive bounding box is 335 degrees centred on the Gulf of Guinea —
    // the emptiest possible framing of two points that are neighbours across
    // the dateline. The gap between them the short way is 24.67 degrees.
    near(r.longitudeDelta, 24.67 * 1.35, 0.05);
    assert.ok(r.longitudeDelta < 60, `expected a narrow span, got ${r.longitudeDelta}`);
    // Centred in the Pacific between them, not on the far side of the planet.
    near(r.longitude, -171.995, 0.05);
  });

  test("the centre stays a legal longitude", () => {
    const r = regionForCoords([KAUAI, NZ])!;
    assert.ok(r.longitude >= -180 && r.longitude < 180, `got ${r.longitude}`);
  });

  test("excludes the widest gap even when it is not the dateline one", () => {
    // Points either side of the dateline, plus a 160-degree void over the
    // Pacific and the Americas. The camera must cover -10 → 170 and wrap on to
    // -170, excluding the void — not the other way round.
    const r = regionForCoords([
      { lat: 0, lng: -170 },
      { lat: 0, lng: -10 },
      { lat: 0, lng: 10 },
      { lat: 0, lng: 170 },
    ])!;
    near(r.longitude, 90, 0.001);
    near(r.longitudeDelta, 200 * 1.35, 0.001);
  });
});

describe("regionForCoords — bounds", () => {
  test("never exceeds the size of the planet", () => {
    const r = regionForCoords([
      { lat: -85, lng: -179 },
      { lat: 85, lng: 0 },
      { lat: 0, lng: 179 },
    ])!;
    assert.ok(r.latitudeDelta <= 180, `latitudeDelta was ${r.latitudeDelta}`);
    assert.ok(r.longitudeDelta <= 360, `longitudeDelta was ${r.longitudeDelta}`);
  });

  test("does not mutate the caller's array", () => {
    // The screen passes its rendered marker list straight in; sorting that in
    // place would reorder what React is holding.
    const points = [{ lat: 0, lng: 10 }, { lat: 0, lng: -10 }, { lat: 0, lng: 5 }];
    const before = points.map(p => p.lng);
    regionForCoords(points);
    assert.deepEqual(points.map(p => p.lng), before);
  });
});

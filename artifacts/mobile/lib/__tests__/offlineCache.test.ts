import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  readTrailDetail, writeTrailDetail, cacheAgeLabel, cacheKey, setCacheStorage,
  type CacheStorage,
} from "../offlineCache.ts";

// A fake AsyncStorage. The real one cannot load under node:test, which is why
// the module takes an injectable backend rather than importing it at top level.
function fakeStorage(): CacheStorage & { map: Map<string, string>; failWrites?: boolean } {
  const map = new Map<string, string>();
  const s: any = {
    map,
    failWrites: false,
    getItem: async (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: async (k: string, v: string) => {
      if (s.failWrites) throw new Error("QuotaExceededError");
      map.set(k, v);
    },
    removeItem: async (k: string) => { map.delete(k); },
  };
  return s;
}

let store: ReturnType<typeof fakeStorage>;
beforeEach(() => { store = fakeStorage(); setCacheStorage(store); });

const TRAIL = { id: "t1", name: "Muir Woods Main Trail", distance_mi: 2, elevation_ft: 200 };

describe("round trip", () => {
  test("what goes in comes back out", async () => {
    await writeTrailDetail("t1", { trail: TRAIL, logCount: 3, conditionSummary: [{ key: "muddy" }] }, 1_000_000);
    const got = await readTrailDetail<typeof TRAIL>("t1");
    assert.equal(got?.trail.name, "Muir Woods Main Trail");
    assert.equal(got?.logCount, 3);
    assert.equal(got?.conditionSummary.length, 1);
    assert.equal(got?.cachedAt, 1_000_000);
  });

  test("a trail never cached is a miss, not an error", async () => {
    assert.equal(await readTrailDetail("nope"), null);
  });
});

describe("the cache must degrade, never half-render", () => {
  test("malformed JSON reads as a miss", async () => {
    store.map.set(cacheKey("t1"), "{not json");
    assert.equal(await readTrailDetail("t1"), null);
  });

  test("a payload missing `trail` reads as a miss", async () => {
    // Storage survives app upgrades and can hold partially-written entries.
    // A half-populated object would render a screen full of undefined, which
    // looks like a data bug rather than a cache bug.
    store.map.set(cacheKey("t1"), JSON.stringify({ logCount: 2, cachedAt: 1 }));
    assert.equal(await readTrailDetail("t1"), null);
  });

  test("a payload missing cachedAt reads as a miss — age must never be faked", async () => {
    store.map.set(cacheKey("t1"), JSON.stringify({ trail: TRAIL }));
    assert.equal(await readTrailDetail("t1"), null);
  });

  test("a non-array conditionSummary is coerced, not propagated", async () => {
    store.map.set(cacheKey("t1"), JSON.stringify({ trail: TRAIL, cachedAt: 5, conditionSummary: "muddy" }));
    const got = await readTrailDetail("t1");
    assert.deepEqual(got?.conditionSummary, []);
  });
});

describe("a failed write must not break the screen", () => {
  test("a quota error returns false instead of throwing", async () => {
    // The fetch has already succeeded by the time this runs — the user is
    // looking at a working screen and a full disk must not take it down.
    store.failWrites = true;
    assert.equal(await writeTrailDetail("t1", { trail: TRAIL, logCount: 0, conditionSummary: [] }), false);
  });

  test("a successful write reports true", async () => {
    assert.equal(await writeTrailDetail("t1", { trail: TRAIL, logCount: 0, conditionSummary: [] }), true);
  });
});

describe("key versioning", () => {
  test("the version lives in the key so a shape change MISSES rather than mis-parses", () => {
    assert.match(cacheKey("t1"), /^summit\.trailDetail\.v1\.t1$/);
  });

  test("different trails do not collide", () => {
    assert.notEqual(cacheKey("a"), cacheKey("b"));
  });
});

describe("cacheAgeLabel", () => {
  const T = 1_000_000_000_000;
  test("always says something — cached data is never presented as live", () => {
    assert.equal(cacheAgeLabel(T, T), "just now");
  });

  test("rounds DOWN so freshness is never overstated", () => {
    // 2h59m must read "2 hours", not "3 hours" — err toward looking older.
    assert.equal(cacheAgeLabel(T, T + (179 * 60_000)), "2 hours ago");
  });

  test("singular and plural", () => {
    assert.equal(cacheAgeLabel(T, T + 60_000), "1 minute ago");
    assert.equal(cacheAgeLabel(T, T + 120_000), "2 minutes ago");
    assert.equal(cacheAgeLabel(T, T + 3_600_000), "1 hour ago");
    assert.equal(cacheAgeLabel(T, T + 86_400_000), "1 day ago");
    assert.equal(cacheAgeLabel(T, T + 2 * 86_400_000), "2 days ago");
  });
});

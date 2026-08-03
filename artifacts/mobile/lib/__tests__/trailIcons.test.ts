import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { trailIconKey, TRAIL_TAG_ICONS, TRAIL_ICON_DEFAULT } from "../trailIcons.ts";

// Run with `npm test` (node:test + native type stripping, no test framework).
//
// These exist because the thing they check cannot practically be seen in the
// app: the database holds three hikes across two trails, so a Simulator pass
// would exercise two or three icons out of twenty and prove almost nothing
// about the mapping. Priority order in particular is invisible until a trail
// carries two mappable tags at once, which none of the current three do.

describe("trailIconKey", () => {
  test("maps a scenery tag to its icon", () => {
    assert.equal(trailIconKey(["Waterfall"]), "waves");
    assert.equal(trailIconKey(["Desert"]), "cactus");
    assert.equal(trailIconKey(["Forest"]), "pine-tree");
    assert.equal(trailIconKey(["Wildlife"]), "paw");
    assert.equal(trailIconKey(["Glacier"]), "snowflake");
  });

  test("respects priority order when several tags are mappable", () => {
    // Waterfall outranks Lake regardless of which way round they are stored,
    // which is the point: the answer must not depend on array order.
    assert.equal(trailIconKey(["Lake", "Waterfall"]), "waves");
    assert.equal(trailIconKey(["Waterfall", "Lake"]), "waves");

    // Glacier outranks Alpine — both are real mappings, so this fails if the
    // function iterates the caller's tags instead of the priority list.
    assert.equal(trailIconKey(["Alpine", "Glacier"]), "snowflake");
    assert.equal(trailIconKey(["Glacier", "Alpine"]), "snowflake");

    // Views is the most common tag in the catalogue and deliberately ranks low,
    // so anything more specific beats it.
    assert.equal(trailIconKey(["Views", "Desert"]), "cactus");
    assert.equal(trailIconKey(["Views", "Waterfall"]), "waves");
  });

  test("skips unmappable tags to reach a mappable one", () => {
    // The real shape of the data: character tags mixed in with scenery tags.
    assert.equal(trailIconKey(["Iconic", "Waterfall"]), "waves");
    assert.equal(trailIconKey(["Permit", "Strenuous", "Forest"]), "pine-tree");
    assert.equal(trailIconKey(["Unique", "Loop", "Day-hike", "Coastal"]), "island");
  });

  test("falls back to the default when nothing maps", () => {
    assert.equal(trailIconKey(["Iconic"]), TRAIL_ICON_DEFAULT);
    assert.equal(trailIconKey(["Unique", "Permit", "Short", "Loop"]), TRAIL_ICON_DEFAULT);
  });

  test("falls back for empty, null and undefined tag lists", () => {
    // Not hypothetical: hikes.trail_id is nullable, and 6 trails carry no tags.
    assert.equal(trailIconKey([]), TRAIL_ICON_DEFAULT);
    assert.equal(trailIconKey(null), TRAIL_ICON_DEFAULT);
    assert.equal(trailIconKey(undefined), TRAIL_ICON_DEFAULT);
  });

  test("ignores casing and surrounding whitespace", () => {
    // Tags come from three ingestion sources, so casing is not worth betting on.
    assert.equal(trailIconKey(["waterfall"]), "waves");
    assert.equal(trailIconKey(["WATERFALL"]), "waves");
    assert.equal(trailIconKey(["  Desert  "]), "cactus");
  });

  test("tolerates null and non-string entries inside the array", () => {
    assert.equal(trailIconKey([null, undefined, "Forest"]), "pine-tree");
    assert.equal(trailIconKey([null, undefined]), TRAIL_ICON_DEFAULT);
  });

  test("is deterministic — the same tags always give the same icon", () => {
    const tags = ["Views", "Alpine", "Summit"];
    const first = trailIconKey(tags);
    for (let i = 0; i < 20; i++) assert.equal(trailIconKey(tags), first);
  });
});

describe("TRAIL_TAG_ICONS table", () => {
  test("has no duplicate tags, which would make later rows unreachable", () => {
    const seen = new Set<string>();
    for (const [tag] of TRAIL_TAG_ICONS) {
      const k = tag.toLowerCase();
      assert.ok(!seen.has(k), `duplicate tag in priority list: ${tag}`);
      seen.add(k);
    }
  });

  test("every entry resolves through the public function", () => {
    // Guards against a row that exists in the table but can never be reached,
    // e.g. if the lookup and the list ever fall out of step.
    for (const [tag, key] of TRAIL_TAG_ICONS) {
      assert.equal(trailIconKey([tag]), key, `${tag} did not resolve to ${key}`);
    }
  });
});

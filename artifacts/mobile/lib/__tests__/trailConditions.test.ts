import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  CONDITION_TAGS,
  GOOD_CONDITIONS_KEY,
  conditionLabels,
  isConditionKey,
  reportedAnyIssue,
  reportedGoodConditions,
  toggleConditionTag,
} from "../trailConditions.ts";

// Run with `npm test`.
//
// The mutual-exclusion rule is the part worth pinning. It is invisible in the
// UI until somebody taps two specific chips in a specific order, and getting it
// wrong does not look like a bug — it looks like a hike that reported good
// conditions and downed trees at the same time, which quietly ruins the
// denominator the affirmative tag exists to provide.

describe("vocabulary", () => {
  test("keys are unique, so no row can be ambiguous", () => {
    const keys = CONDITION_TAGS.map(t => t.key);
    assert.equal(new Set(keys).size, keys.length);
  });

  test("labels are unique, so no two chips read the same", () => {
    const labels = CONDITION_TAGS.map(t => t.label);
    assert.equal(new Set(labels).size, labels.length);
  });

  test("the affirmative tag is in the vocabulary and leads it", () => {
    assert.equal(CONDITION_TAGS[0].key, GOOD_CONDITIONS_KEY);
    assert.ok(isConditionKey(GOOD_CONDITIONS_KEY));
  });

  test("keys are storage-safe", () => {
    // Stored in a text[] and never reworded; anything exotic here would have to
    // survive a migration later.
    for (const t of CONDITION_TAGS) {
      assert.match(t.key, /^[a-z_]+$/, `${t.key} is not a plain lowercase key`);
    }
  });
});

describe("toggleConditionTag", () => {
  test("adds and removes", () => {
    assert.deepEqual(toggleConditionTag([], "muddy"), ["muddy"]);
    assert.deepEqual(toggleConditionTag(["muddy"], "muddy"), []);
  });

  test("selecting Good conditions clears every hazard", () => {
    const before = ["muddy", "downed_trees", "bugs"];
    assert.deepEqual(toggleConditionTag(before, GOOD_CONDITIONS_KEY), [GOOD_CONDITIONS_KEY]);
  });

  test("selecting a hazard clears Good conditions", () => {
    assert.deepEqual(toggleConditionTag([GOOD_CONDITIONS_KEY], "muddy"), ["muddy"]);
  });

  test("de-selecting Good conditions leaves nothing selected, not a hazard", () => {
    assert.deepEqual(toggleConditionTag([GOOD_CONDITIONS_KEY], GOOD_CONDITIONS_KEY), []);
  });

  test("hazards coexist freely with each other", () => {
    let held = toggleConditionTag([], "muddy");
    held = toggleConditionTag(held, "snow_ice");
    held = toggleConditionTag(held, "bugs");
    assert.equal(held.length, 3);
    assert.ok(!held.includes(GOOD_CONDITIONS_KEY));
  });

  test("always returns vocabulary order, whatever order they were tapped", () => {
    const a = toggleConditionTag(toggleConditionTag([], "bugs"), "muddy");
    const b = toggleConditionTag(toggleConditionTag([], "muddy"), "bugs");
    assert.deepEqual(a, b);
    // muddy precedes bugs in the vocabulary, so both orders agree on that.
    assert.deepEqual(a, ["muddy", "bugs"]);
  });

  test("ignores keys that are not in the vocabulary", () => {
    assert.deepEqual(toggleConditionTag(["muddy"], "not_a_tag"), ["muddy"]);
  });

  test("does not mutate the array it was given", () => {
    const before = ["muddy"];
    toggleConditionTag(before, "bugs");
    assert.deepEqual(before, ["muddy"]);
  });

  test("drops unknown keys already stored on the row", () => {
    // A retired tag, or a row written by a newer client.
    assert.deepEqual(toggleConditionTag(["muddy", "retired_tag"], "bugs"), ["muddy", "bugs"]);
  });
});

describe("conditionLabels", () => {
  test("maps keys to labels in vocabulary order", () => {
    assert.deepEqual(conditionLabels(["bugs", "muddy"]), ["Muddy", "Very buggy"]);
  });

  test("is empty for nothing recorded", () => {
    assert.deepEqual(conditionLabels([]), []);
    assert.deepEqual(conditionLabels(null), []);
    assert.deepEqual(conditionLabels(undefined), []);
  });

  test("drops unknown keys rather than showing them raw", () => {
    assert.deepEqual(conditionLabels(["muddy", "washed_out_2"]), ["Muddy"]);
  });
});

describe("reportedGoodConditions / reportedAnyIssue", () => {
  test("distinguishes said-it-was-fine from said-nothing", () => {
    // The whole point of the affirmative tag: these two must not look alike.
    assert.equal(reportedGoodConditions([GOOD_CONDITIONS_KEY]), true);
    assert.equal(reportedGoodConditions([]), false);
    assert.equal(reportedGoodConditions(null), false);
  });

  test("an issue is any hazard, and Good conditions is not one", () => {
    assert.equal(reportedAnyIssue(["muddy"]), true);
    assert.equal(reportedAnyIssue([GOOD_CONDITIONS_KEY]), false);
    assert.equal(reportedAnyIssue([]), false);
    assert.equal(reportedAnyIssue(["not_a_tag"]), false);
  });
});

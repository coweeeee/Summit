import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { summariseConditions, CONDITION_SUMMARY_CAVEAT } from "../conditionSummary.ts";

// Run with `npm test`.
//
// The privacy rules are enforced in the view, not here — but this module is the
// last thing between the view and a reader, so it is worth proving it cannot
// add a claim the view did not make, and that it never renders a raw key.

describe("summariseConditions", () => {
  test("is empty when there is nothing to say", () => {
    assert.deepEqual(summariseConditions([]), []);
    assert.deepEqual(summariseConditions(null), []);
    assert.deepEqual(summariseConditions(undefined), []);
  });

  test("phrases a band without ever inventing a number", () => {
    const [only] = summariseConditions([{ tag: "muddy", prevalence: "most" }]);
    assert.equal(only.text, "Most recent hikers reported muddy");
    // Nothing numeric may appear: the view deliberately hands over no counts,
    // so any digit here would be fabricated.
    assert.ok(!/\d/.test(only.text), `text contained a figure: ${only.text}`);
  });

  test("the affirmative tag reads as reassurance, not a hazard", () => {
    const [good] = summariseConditions([{ tag: "good", prevalence: "most" }]);
    assert.equal(good.reassuring, true);
    assert.equal(good.text, "Most recent hikers said conditions were good");
  });

  test("hazards lead, the affirmative tag goes last", () => {
    const out = summariseConditions([
      { tag: "good", prevalence: "most" },
      { tag: "muddy", prevalence: "some" },
    ]);
    assert.deepEqual(out.map(o => o.key), ["muddy", "good"]);
  });

  test("good and a hazard can coexist, because exclusivity is per hike not per trail", () => {
    const out = summariseConditions([
      { tag: "good", prevalence: "most" },
      { tag: "snow_ice", prevalence: "some" },
    ]);
    assert.equal(out.length, 2);
  });

  test("stronger bands sort above weaker ones within a group", () => {
    const out = summariseConditions([
      { tag: "muddy", prevalence: "some" },
      { tag: "snow_ice", prevalence: "most" },
    ]);
    assert.deepEqual(out.map(o => o.prevalence), ["most", "some"]);
  });

  test("drops keys that are not in the vocabulary rather than showing them raw", () => {
    const out = summariseConditions([
      { tag: "washed_out_2", prevalence: "most" },
      { tag: "muddy", prevalence: "most" },
    ]);
    assert.deepEqual(out.map(o => o.key), ["muddy"]);
  });

  test("drops bands the view should never emit", () => {
    // Defensive: an unexpected prevalence must not fall through into copy.
    const out = summariseConditions([{ tag: "muddy", prevalence: "all" }]);
    assert.deepEqual(out, []);
  });

  test("never emits the same tag twice", () => {
    const out = summariseConditions([
      { tag: "muddy", prevalence: "most" },
      { tag: "muddy", prevalence: "some" },
    ]);
    assert.equal(out.length, 1);
  });
});

describe("the caveat", () => {
  test("scopes the claim to a window and to what people said", () => {
    // Presenting this as "the conditions" rather than "what hikers logged"
    // would overclaim — it is a 90-day window over whoever happened to log,
    // and it is viewer-dependent besides.
    assert.match(CONDITION_SUMMARY_CAVEAT, /90 days/);
    assert.match(CONDITION_SUMMARY_CAVEAT, /logged/i);
  });
});

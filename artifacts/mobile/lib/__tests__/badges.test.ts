import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  nextBadgeGoal,
  CLIMBER_ELEVATION_FT,
  EXPLORER_HIKE_COUNT,
  SUMMIT_HIKE_COUNT,
  TRAILBLAZER_HIKE_COUNT,
} from "../badges.ts";

// Run with `npm test` (node:test + native type stripping, no test framework).
//
// Unit-tested rather than eyeballed for the same reason trailIcons is: the
// database holds three hikes on one account, so the Simulator can only ever
// show one point on this curve. Ranking, the earned-set precedence and the
// Early Bird fallback are all invisible at that sample size.

const NONE: ReadonlySet<string> = new Set();

describe("nextBadgeGoal — ranking", () => {
  test("picks the smallest REMAINING FRACTION, not the smallest raw remainder", () => {
    // 1 hike short of Explorer (1/5 = 0.2 left) vs 1000 ft short of Climber
    // (1000/5000 = 0.2 left) -- but at 2000 ft the climber fraction is 0.6,
    // so Explorer must win despite 3 being a smaller raw number than 3000.
    const goal = nextBadgeGoal(4, 2000, false, NONE, "imperial");
    assert.equal(goal?.key, "explorer");
    assert.equal(goal?.message, "1 more hike to unlock Explorer");
  });

  test("elevation can win when it is proportionally closer", () => {
    // 100 ft short of Climber (0.02) beats 4 hikes short of Explorer (0.8).
    const goal = nextBadgeGoal(1, CLIMBER_ELEVATION_FT - 100, false, NONE, "imperial");
    assert.equal(goal?.key, "climber");
  });

  test("singular vs plural on the remaining hike count", () => {
    assert.match(nextBadgeGoal(4, 0, false, NONE, "imperial")!.message, /1 more hike to/);
    assert.match(nextBadgeGoal(3, 0, false, NONE, "imperial")!.message, /2 more hikes to/);
  });
});

describe("nextBadgeGoal — what counts as earned", () => {
  test("a badge already met by the live counts is skipped", () => {
    // 5 hikes clears Explorer, so the next goal is Summit, not Explorer.
    const goal = nextBadgeGoal(EXPLORER_HIKE_COUNT, 0, false, NONE, "imperial");
    assert.equal(goal?.key, "summit");
  });

  test("the server's awarded set wins even when the live count no longer would", () => {
    // Badges are never revoked, so a badge awarded before a hike was deleted
    // must not come back as a goal.
    const earned = new Set(["explorer"]);
    const goal = nextBadgeGoal(0, 0, false, earned, "imperial");
    assert.notEqual(goal?.key, "explorer");
  });
});

describe("nextBadgeGoal — Early Bird and exhaustion", () => {
  test("Early Bird is never ranked against countable badges", () => {
    // With everything countable outstanding, the answer must be a countable
    // one -- Early Bird has no partial progress to compare.
    const goal = nextBadgeGoal(0, 0, false, NONE, "imperial");
    assert.notEqual(goal?.key, "earlybird");
  });

  test("Early Bird surfaces once it is the only thing left", () => {
    const goal = nextBadgeGoal(TRAILBLAZER_HIKE_COUNT, CLIMBER_ELEVATION_FT, false, NONE, "imperial");
    assert.equal(goal?.key, "earlybird");
  });

  test("null once every badge is earned — nothing to nudge toward", () => {
    const goal = nextBadgeGoal(TRAILBLAZER_HIKE_COUNT, CLIMBER_ELEVATION_FT, true, NONE, "imperial");
    assert.equal(goal, null);
  });
});

describe("nextBadgeGoal — units", () => {
  test("elevation copy follows the user's unit preference", () => {
    const imperial = nextBadgeGoal(SUMMIT_HIKE_COUNT, CLIMBER_ELEVATION_FT - 1000, false, NONE, "imperial");
    const metric = nextBadgeGoal(SUMMIT_HIKE_COUNT, CLIMBER_ELEVATION_FT - 1000, false, NONE, "metric");
    assert.match(imperial!.message, /ft/);
    assert.match(metric!.message, /m/);
    assert.notEqual(imperial!.message, metric!.message);
  });
});

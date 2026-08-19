import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { buildTrailTips } from "../trailTips.ts";

// Run with `npm test`.
//
// These are safety claims about water, exposure, tides and wildlife shown on
// 225 trails, and the module's own header makes the promise that every line is
// traceable to a field. That promise is only worth something if the selection
// logic is pinned — a mis-ordered array silently drops the tip that mattered,
// because only the first few survive MAX_TIPS.

const textOf = (tips: { text: string }[]) => tips.map(t => t.text);
const mentions = (tips: { text: string }[], fragment: string) =>
  tips.some(t => t.text.toLowerCase().includes(fragment.toLowerCase()));

describe("buildTrailTips — always says something", () => {
  test("falls back rather than rendering an empty section", () => {
    const tips = buildTrailTips({}, "imperial");
    assert.ok(tips.length > 0);
  });

  test("names the difficulty in the fallback when that is all there is", () => {
    const tips = buildTrailTips({ difficulty: "Hard" }, "imperial");
    assert.ok(mentions(tips, "hard"));
  });

  test("never exceeds the cap, however many tags a trail carries", () => {
    const tips = buildTrailTips(
      {
        distance_mi: 12,
        elevation_ft: 4000,
        difficulty: "Hard",
        tags: ["Permit", "Remote", "Coastal", "Scramble", "Alpine", "Desert", "Wildlife", "Forest", "Family"],
      },
      "imperial",
      { temp: 50, condition: "Rain" },
    );
    assert.ok(tips.length <= 4, `got ${tips.length} tips`);
  });
});

describe("buildTrailTips — ordering is a safety judgement", () => {
  test("weather leads, because it is the only line that changes between visits", () => {
    const tips = buildTrailTips(
      { distance_mi: 4, elevation_ft: 1200, tags: ["Forest"] },
      "imperial",
      { temp: 38, condition: "Snow" },
    );
    assert.match(tips[0].text, /38/);
  });

  test("a permit outranks scenery when both apply", () => {
    const tips = buildTrailTips({ distance_mi: 6, elevation_ft: 2000, tags: ["Family", "Permit"] }, "imperial");
    const order = textOf(tips);
    const permit = order.findIndex(t => /permit/i.test(t));
    const family = order.findIndex(t => /children/i.test(t));
    assert.ok(permit !== -1, "permit tip missing");
    assert.ok(family === -1 || permit < family, "permit should outrank the family tip");
  });

  test("remote is surfaced, not buried — it was previously absent entirely", () => {
    const tips = buildTrailTips({ distance_mi: 9, elevation_ft: 3000, tags: ["Views", "Remote"] }, "imperial");
    assert.ok(mentions(tips, "cell signal"));
  });
});

describe("buildTrailTips — tags that had no coverage before", () => {
  const cases: [string, string][] = [
    ["Coastal", "tide"],
    ["Wildlife", "store food"],
    ["Volcanic", "volcanic rock"],
    ["Forest", "bugs"],
    ["Iconic", "car park"],
    ["Family", "children"],
  ];

  for (const [tag, fragment] of cases) {
    test(`${tag} produces a tip`, () => {
      const tips = buildTrailTips({ distance_mi: 3, elevation_ft: 500, tags: [tag] }, "imperial");
      assert.ok(mentions(tips, fragment), `expected a ${tag} tip mentioning "${fragment}", got ${JSON.stringify(textOf(tips))}`);
    });
  }

  test("matching is case-insensitive, since tags are stored capitalised", () => {
    const upper = buildTrailTips({ distance_mi: 3, tags: ["REMOTE"] }, "imperial");
    const lower = buildTrailTips({ distance_mi: 3, tags: ["remote"] }, "imperial");
    assert.ok(mentions(upper, "cell signal"));
    assert.ok(mentions(lower, "cell signal"));
  });
});

describe("buildTrailTips — steepness agrees with the app's own scale", () => {
  test("a flat trail is described as flat rather than skipped", () => {
    // Anhinga Trail: 0 ft over 0.8 mi, and genuinely flat. The old guard read
    // 0 as absent and produced no line at all.
    const tips = buildTrailTips({ distance_mi: 0.8, elevation_ft: 0 }, "imperial");
    assert.ok(mentions(tips, "almost no climbing"));
  });

  test("a very steep trail says so", () => {
    // 1,000 ft in half a mile is 2,000 ft/mile.
    const tips = buildTrailTips({ distance_mi: 0.5, elevation_ft: 1000 }, "imperial");
    assert.ok(mentions(tips, "relentlessly steep"));
  });

  test("uses the same boundaries as the steepness scale", () => {
    // 300 ft/mile is "moderate" on the shared scale; the old thresholds in this
    // file called anything under 400 a gentle grade.
    const tips = buildTrailTips({ distance_mi: 10, elevation_ft: 3000 }, "imperial");
    assert.ok(mentions(tips, "steady climb"));
  });

  test("says nothing when the ratio is unknowable", () => {
    // Frigid Crags: distance 0 and elevation 0. Not flat — unknown.
    const tips = buildTrailTips({ distance_mi: 0, elevation_ft: 0 }, "imperial");
    assert.ok(!mentions(tips, "climbing"));
    assert.ok(!mentions(tips, "gentle grade"));
  });
});

describe("buildTrailTips — units", () => {
  test("distances follow the reader's preference", () => {
    const imperial = buildTrailTips({ distance_mi: 10, elevation_ft: 2000 }, "imperial");
    const metric = buildTrailTips({ distance_mi: 10, elevation_ft: 2000 }, "metric");
    assert.ok(mentions(imperial, "mi"));
    assert.ok(mentions(metric, "km"));
  });
});

describe("attribution provenance", () => {
  // The weather tip is Open-Meteo data rendered as prose, which makes it an
  // attribution site under their CC BY 4.0 licence ("a link next to any
  // location Open-Meteo data are displayed"). trail-detail renders the credit
  // by matching tip.source, so losing this marker would silently drop a
  // licence-required credit from the screen with nothing else failing.
  test("the weather tip declares Open-Meteo as its source", () => {
    const tips = buildTrailTips({ distance_mi: 4, elevation_ft: 500, tags: [], difficulty: "Moderate" }, "imperial", {
      temp: 60,
      condition: "Partly cloudy",
    });
    const weatherTip = tips.find(t => t.source === "open-meteo");
    assert.ok(weatherTip, "expected a tip marked source: 'open-meteo'");
    assert.match(weatherTip!.text, /60/);
  });

  test("no tip claims an Open-Meteo source when there is no weather", () => {
    const tips = buildTrailTips({ distance_mi: 4, elevation_ft: 500, tags: [], difficulty: "Moderate" }, "imperial", null);
    assert.equal(tips.some(t => t.source === "open-meteo"), false);
  });
});

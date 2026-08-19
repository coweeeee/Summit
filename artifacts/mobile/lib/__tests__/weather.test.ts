import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  conditionFromCode,
  currentFromWeatherKit,
  dailyFromWeatherKit,
  celsiusToFahrenheit,
  kmhToMph,
  KNOWN_CONDITION_CODES,
} from "../weather.ts";

// Apple's WeatherCondition enum, transcribed from
// https://developer.apple.com/tutorials/data/documentation/weatherkit/weathercondition.json
// Kept here verbatim so a future Apple addition fails this test loudly rather
// than falling through to a default that quietly claims fair weather.
const APPLE_CASES = [
  "blowingDust", "clear", "cloudy", "foggy", "haze", "mostlyClear", "mostlyCloudy",
  "partlyCloudy", "smoky", "breezy", "windy", "drizzle", "heavyRain",
  "isolatedThunderstorms", "rain", "sunShowers", "scatteredThunderstorms",
  "strongStorms", "thunderstorms", "frigid", "hail", "hot", "flurries", "sleet",
  "snow", "sunFlurries", "wintryMix", "blizzard", "blowingSnow", "freezingDrizzle",
  "freezingRain", "heavySnow", "hurricane", "tropicalStorm",
];

describe("conditionFromCode — coverage", () => {
  test("every one of Apple's 34 cases is mapped", () => {
    assert.equal(APPLE_CASES.length, 34);
    const missing = APPLE_CASES.filter(c => !KNOWN_CONDITION_CODES.includes(c));
    assert.deepEqual(missing, [], `unmapped WeatherKit codes: ${missing.join(", ")}`);
  });

  test("no code is mapped that Apple does not define", () => {
    const extra = KNOWN_CONDITION_CODES.filter(c => !APPLE_CASES.includes(c));
    assert.deepEqual(extra, [], `invented codes: ${extra.join(", ")}`);
  });

  test("every mapped condition has a non-empty icon and label", () => {
    for (const c of APPLE_CASES) {
      const info = conditionFromCode(c);
      assert.ok(info.icon.length > 0, `${c} has no icon`);
      assert.ok(info.label.length > 0, `${c} has no label`);
    }
  });
});

describe("conditionFromCode — the safety-critical wet classification", () => {
  // These are the exact cases that a regex over the English description gets
  // WRONG. lib/trailTips.ts matches /rain|snow|shower|thunder|drizzle/i, which
  // misses all of these -- so "expect slick footing" would disappear during
  // hail and sleet. That is why `wet` is carried as data rather than re-derived.
  test("hail, sleet, wintryMix, hurricane and tropicalStorm are WET", () => {
    for (const c of ["hail", "sleet", "wintryMix", "hurricane", "tropicalStorm"]) {
      assert.equal(conditionFromCode(c).wet, true, `${c} must be classed wet`);
    }
  });

  test("reduced visibility is not the same as wet ground", () => {
    // Dry underfoot despite poor visibility.
    for (const c of ["smoky", "blowingDust", "haze"]) {
      assert.equal(conditionFromCode(c).wet, false, `${c} should not be wet`);
    }
    // Fog does wet the ground and surfaces.
    assert.equal(conditionFromCode("foggy").wet, true);
  });

  test("clear and cloudy conditions are dry", () => {
    for (const c of ["clear", "mostlyClear", "partlyCloudy", "mostlyCloudy", "cloudy", "hot", "frigid"]) {
      assert.equal(conditionFromCode(c).wet, false, `${c} should not be wet`);
    }
  });

  test("an UNKNOWN code fails safe: wet, with an honest label", () => {
    // Apple can add cases. Warning about footing on a dry day is an annoyance;
    // silence during an unrecognised storm is the failure to avoid.
    const info = conditionFromCode("meteorShower");
    assert.equal(info.wet, true);
    assert.equal(info.label, "Meteor Shower");
    assert.notEqual(info.label, "Clear");
  });
});

describe("unit conversion", () => {
  test("celsius to fahrenheit", () => {
    assert.equal(celsiusToFahrenheit(0), 32);
    assert.equal(celsiusToFahrenheit(100), 212);
    assert.equal(Math.round(celsiusToFahrenheit(15.6)), 60);
  });

  test("km/h to mph", () => {
    assert.equal(Math.round(kmhToMph(100)), 62);
  });
});

describe("currentFromWeatherKit", () => {
  const raw = { temperature: 15.6, temperatureApparent: 14.4, conditionCode: "partlyCloudy", windSpeed: 9.7, humidity: 0.67 };

  test("imperial converts temperature and wind", () => {
    const w = currentFromWeatherKit(raw, "imperial");
    assert.equal(w.temp, 60);
    assert.equal(w.feelsLike, 58);
    assert.equal(w.windSpeed, 6);
    assert.equal(w.condition, "Partly cloudy");
  });

  test("metric passes SI through untouched", () => {
    const w = currentFromWeatherKit(raw, "metric");
    assert.equal(w.temp, 16);
    assert.equal(w.windSpeed, 10);
  });

  test("humidity is a 0-1 FRACTION and becomes a percentage", () => {
    // The card renders `{humidity}%`. Passing 0.67 through would print "0.67%".
    assert.equal(currentFromWeatherKit(raw, "imperial").humidity, 67);
    assert.equal(currentFromWeatherKit({ ...raw, humidity: 1 }, "metric").humidity, 100);
  });

  test("a missing conditionCode does not claim clear skies", () => {
    const w = currentFromWeatherKit({ temperature: 10 }, "metric");
    assert.equal(w.wet, true);
    assert.notEqual(w.condition, "Clear");
  });
});

describe("dailyFromWeatherKit", () => {
  const day = (n: number) => ({
    forecastStart: `2026-08-${String(n).padStart(2, "0")}T07:00:00Z`,
    temperatureMax: 20,
    temperatureMin: 10,
    conditionCode: "rain",
  });

  test("caps at 7 days — Apple returns 10 when the range is omitted", () => {
    const out = dailyFromWeatherKit(Array.from({ length: 10 }, (_, i) => day(i + 1)), "metric");
    assert.equal(out.length, 7);
  });

  test("keeps Apple's date portion rather than re-deriving a local day", () => {
    // The request carries the trail's timezone, so Apple has already rolled the
    // day up correctly for the trail; re-timezoning it on the device would move it.
    const [first] = dailyFromWeatherKit([day(3)], "metric");
    assert.equal(first.date, "2026-08-03");
  });

  test("converts highs and lows for imperial", () => {
    const [first] = dailyFromWeatherKit([day(1)], "imperial");
    assert.equal(first.high, 68);
    assert.equal(first.low, 50);
    assert.equal(first.wet, true);
  });

  test("an empty or absent forecast yields an empty strip, not a crash", () => {
    assert.deepEqual(dailyFromWeatherKit([], "metric"), []);
    assert.deepEqual(dailyFromWeatherKit(undefined as never, "metric"), []);
  });
});

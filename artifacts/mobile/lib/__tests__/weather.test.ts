import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  conditionFromCode,
  currentFromWeatherKit,
  dailyFromWeatherKit,
  celsiusToFahrenheit,
  kmhToMph,
  KNOWN_CONDITION_CODES,
  conditionFromWmo,
  currentFromOpenMeteo,
  dailyFromOpenMeteo,
  weekdayLabel,
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


describe("Open-Meteo fallback — WMO mapping", () => {
  test("clear and cloud codes are dry; precipitation codes are wet", () => {
    for (const c of [0, 1, 2, 3]) assert.equal(conditionFromWmo(c).wet, false, `wmo ${c}`);
    for (const c of [51, 61, 71, 80, 85, 95, 99]) assert.equal(conditionFromWmo(c).wet, true, `wmo ${c}`);
  });

  test("fog wets surfaces even though it is not precipitation", () => {
    assert.equal(conditionFromWmo(45).wet, true);
    assert.equal(conditionFromWmo(48).wet, true);
  });

  test("an unrecognised code fails safe rather than reporting fair weather", () => {
    // Same asymmetry as the WeatherKit table: a spurious footing warning is an
    // annoyance, a missing one is not.
    const info = conditionFromWmo(-1);
    assert.equal(info.wet, true);
    assert.notEqual(info.label, "Clear");
  });
});

describe("currentFromOpenMeteo", () => {
  test("passes values through — Open-Meteo already converted them server-side", () => {
    const w = currentFromOpenMeteo({
      temperature_2m: 60.4, apparent_temperature: 58.2,
      relative_humidity_2m: 67, wind_speed_10m: 6.1, weather_code: 2,
    });
    assert.equal(w.temp, 60);
    assert.equal(w.feelsLike, 58);
    // Already a percentage here, unlike WeatherKit's 0-1 fraction.
    assert.equal(w.humidity, 67);
    assert.equal(w.condition, "Partly cloudy");
    assert.equal(w.wet, false);
  });
});

describe("dailyFromOpenMeteo — parallel arrays", () => {
  const daily = {
    time: ["2026-09-05", "2026-09-06", "2026-09-07"],
    weather_code: [0, 61, 71],
    temperature_2m_max: [70, 65, 30],
    temperature_2m_min: [50, 45, 20],
  };

  test("reads the arrays positionally", () => {
    const out = dailyFromOpenMeteo(daily);
    assert.equal(out.length, 3);
    assert.equal(out[1].date, "2026-09-06");
    assert.equal(out[1].high, 65);
    assert.equal(out[1].wet, true);
    assert.equal(out[2].condition, "Snow");
  });

  test("caps at 7", () => {
    const many = { ...daily, time: Array.from({ length: 10 }, (_, i) => `2026-09-${String(i + 1).padStart(2, "0")}`) };
    assert.equal(dailyFromOpenMeteo(many).length, 7);
  });

  test("a ragged or empty response degrades instead of throwing", () => {
    // This is the FALLBACK path — it has to bend rather than break.
    assert.deepEqual(dailyFromOpenMeteo({}), []);
    const ragged = dailyFromOpenMeteo({ time: ["2026-09-05"] });
    assert.equal(ragged.length, 1);
    // Null, NOT 0. A ragged array means the provider did not send a high for
    // this day; rendering "0°" would state a freezing forecast it never made.
    assert.equal(ragged[0].high, null);
    assert.equal(ragged[0].low, null);
  });
});

describe("weekdayLabel", () => {
  test("names the weekday from LOCAL parts, not a UTC-parsed string", () => {
    // `new Date("2026-09-05")` is parsed as UTC, so west of Greenwich it reports
    // the previous weekday — which would mislabel every column in the strip.
    const today = new Date(2026, 8, 5, 12, 0, 0); // Sat 5 Sep 2026, local
    assert.equal(weekdayLabel("2026-09-05", today), "Today");
    assert.equal(weekdayLabel("2026-09-06", today), "Sun");
    assert.equal(weekdayLabel("2026-09-07", today), "Mon");
  });

  test("a malformed key yields an empty label rather than 'Invalid Date'", () => {
    assert.equal(weekdayLabel("", new Date()), "");
  });
});

// ---------------------------------------------------------------------------
// A missing reading must stay missing.
//
// Every one of these fields used to default to 0, which renders as "0°" / "0%"
// — indistinguishable on the card from a genuine freezing, bone-dry reading.
// That is the 0-vs-null trap CLAUDE.md records for hikes.elevation_ft, and the
// invented-specific that lib/trailTips.ts exists to forbid. These tests pin the
// absence, one per conversion function, so a future `?? 0` fails here loudly.

describe("missing readings propagate as null, never as a fabricated 0", () => {
  test("currentFromWeatherKit — an empty payload yields nulls, not zeroes", () => {
    const w = currentFromWeatherKit({ conditionCode: "clear" }, "imperial");
    assert.equal(w.temp, null);
    assert.equal(w.feelsLike, null);
    assert.equal(w.windSpeed, null);
    assert.equal(w.humidity, null);
    // The non-numeric half still resolves — a missing temperature must not cost
    // the reader the condition or the wet flag.
    assert.equal(w.condition, "Clear");
    assert.equal(w.wet, false);
  });

  test("currentFromWeatherKit — a real 0°C survives and is NOT treated as missing", () => {
    // The whole point of the distinction: freezing is a reading, not an absence.
    const metric = currentFromWeatherKit({ conditionCode: "clear", temperature: 0, humidity: 0 }, "metric");
    assert.equal(metric.temp, 0);
    assert.equal(metric.humidity, 0);
    const imperial = currentFromWeatherKit({ conditionCode: "clear", temperature: 0 }, "imperial");
    assert.equal(imperial.temp, 32);
  });

  test("currentFromWeatherKit — feelsLike falls back to temperature, which is a real equivalence", () => {
    const w = currentFromWeatherKit({ conditionCode: "clear", temperature: 10 }, "metric");
    assert.equal(w.feelsLike, 10);
  });

  test("dailyFromWeatherKit — a day missing its high/low reports null for both", () => {
    const days = dailyFromWeatherKit([{ forecastStart: "2026-09-05T00:00:00Z", conditionCode: "rain" }], "imperial");
    assert.equal(days[0].high, null);
    assert.equal(days[0].low, null);
    assert.equal(days[0].condition, "Rain");
    assert.equal(days[0].wet, true);
  });

  test("currentFromOpenMeteo — an empty payload yields nulls, not zeroes", () => {
    const w = currentFromOpenMeteo({});
    assert.equal(w.temp, null);
    assert.equal(w.feelsLike, null);
    assert.equal(w.windSpeed, null);
    assert.equal(w.humidity, null);
  });

  test("currentFromOpenMeteo — a real 0 survives", () => {
    const w = currentFromOpenMeteo({ temperature_2m: 0, relative_humidity_2m: 0, wind_speed_10m: 0 });
    assert.equal(w.temp, 0);
    assert.equal(w.humidity, 0);
    assert.equal(w.windSpeed, 0);
  });

  test("dailyFromOpenMeteo — a day whose arrays are short reports null highs and lows", () => {
    const days = dailyFromOpenMeteo({ time: ["2026-09-05", "2026-09-06"], temperature_2m_max: [70] });
    assert.equal(days[0].high, 70);
    assert.equal(days[1].high, null);
    assert.equal(days[1].low, null);
  });

  test("a non-finite reading is treated as missing, not rendered as NaN", () => {
    // JSON cannot carry NaN, but a provider can send a value that arrives as one
    // after arithmetic; "NaN°" on the card would be worse than a gap.
    const w = currentFromWeatherKit({ conditionCode: "clear", temperature: Number.NaN }, "metric");
    assert.equal(w.temp, null);
  });
});

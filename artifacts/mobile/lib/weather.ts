// Weather provider mapping — WeatherKit and Open-Meteo normalised to one shape.
//
// This exists because the migration is not a URL swap. The two providers differ
// on every axis the UI touches:
//
//   condition : Open-Meteo returns a NUMERIC WMO code; WeatherKit returns a
//               STRING enum of 34 named cases. A threshold cascade
//               (`if (wmo <= 48)`) has no meaning against a string, so the
//               mapping is a lookup, not a comparison.
//   units     : Open-Meteo converts server-side from request parameters;
//               WeatherKit is metric SI ONLY, so conversion moves here.
//   humidity  : Open-Meteo gives a percentage; WeatherKit gives a FRACTION
//               (0..1). The card renders `{humidity}%`, so passing WeatherKit's
//               value straight through would print "0.67%".
//
// Verified against Apple's DocC JSON:
//   https://developer.apple.com/tutorials/data/documentation/weatherkit/weathercondition.json

import type { DistanceUnit } from "./units.ts";

/** The shape the UI consumes, whichever provider produced it. */
export type Weather = {
  temp: number;
  feelsLike: number;
  condition: string;
  windSpeed: number;
  /** Percentage, 0-100 — already normalised, ready to render with a '%'. */
  humidity: number;
  icon: string;
  /**
   * Whether footing/visibility is affected. Carried explicitly rather than
   * re-derived by regex over `condition`.
   *
   * lib/trailTips.ts classifies wet weather with /rain|snow|shower|thunder|drizzle/i
   * over the English description. Run that against WeatherKit's raw codes and
   * hail, sleet, wintryMix, hurricane and tropicalStorm all read as DRY — the
   * "expect slick footing" warning would disappear in precisely the conditions
   * that most warrant it. That is a safety claim, and CLAUDE.md's rule for
   * lib/trailTips.ts is that these must derive from data rather than be
   * inferred from prose.
   */
  wet: boolean;
};

/** One day of the 7-day outlook. */
export type DailyForecast = {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  high: number;
  low: number;
  condition: string;
  icon: string;
  wet: boolean;
};

type ConditionInfo = { icon: string; label: string; wet: boolean };

/**
 * All 34 WeatherKit condition cases.
 *
 * Exhaustive on purpose: an unmapped code would otherwise fall to a default and
 * silently claim fair weather. `wet` is set from what the condition does to the
 * ground, not from whether the word looks rainy — hail, sleet and wintryMix are
 * wet; blowingDust and smoky are not, despite both reducing visibility.
 */
const CONDITIONS: Record<string, ConditionInfo> = {
  // Clear / cloud
  clear:        { icon: "☀️", label: "Clear",          wet: false },
  mostlyClear:  { icon: "🌤️", label: "Mostly clear",   wet: false },
  partlyCloudy: { icon: "⛅️", label: "Partly cloudy",  wet: false },
  mostlyCloudy: { icon: "🌥️", label: "Mostly cloudy",  wet: false },
  cloudy:       { icon: "☁️", label: "Cloudy",         wet: false },
  // Visibility, but dry underfoot
  foggy:        { icon: "🌫️", label: "Foggy",          wet: true  },
  haze:         { icon: "🌫️", label: "Haze",           wet: false },
  smoky:        { icon: "🌫️", label: "Smoky",          wet: false },
  blowingDust:  { icon: "🌬️", label: "Blowing dust",   wet: false },
  // Wind
  breezy:       { icon: "🍃", label: "Breezy",         wet: false },
  windy:        { icon: "🌬️", label: "Windy",          wet: false },
  // Temperature extremes
  hot:          { icon: "🥵", label: "Hot",            wet: false },
  frigid:       { icon: "🥶", label: "Frigid",         wet: false },
  // Rain
  drizzle:      { icon: "🌦️", label: "Drizzle",        wet: true  },
  rain:         { icon: "🌧️", label: "Rain",           wet: true  },
  heavyRain:    { icon: "🌧️", label: "Heavy rain",     wet: true  },
  sunShowers:   { icon: "🌦️", label: "Sun showers",    wet: true  },
  freezingDrizzle: { icon: "🌧️", label: "Freezing drizzle", wet: true },
  freezingRain: { icon: "🌧️", label: "Freezing rain",  wet: true  },
  // Thunder
  isolatedThunderstorms:  { icon: "⛈️", label: "Isolated thunderstorms",  wet: true },
  scatteredThunderstorms: { icon: "⛈️", label: "Scattered thunderstorms", wet: true },
  thunderstorms:          { icon: "⛈️", label: "Thunderstorms",           wet: true },
  strongStorms:           { icon: "⛈️", label: "Strong storms",           wet: true },
  // Frozen
  hail:         { icon: "🌨️", label: "Hail",           wet: true  },
  sleet:        { icon: "🌨️", label: "Sleet",          wet: true  },
  flurries:     { icon: "🌨️", label: "Flurries",       wet: true  },
  sunFlurries:  { icon: "🌨️", label: "Sun flurries",   wet: true  },
  snow:         { icon: "❄️", label: "Snow",           wet: true  },
  heavySnow:    { icon: "❄️", label: "Heavy snow",     wet: true  },
  blowingSnow:  { icon: "❄️", label: "Blowing snow",   wet: true  },
  blizzard:     { icon: "❄️", label: "Blizzard",       wet: true  },
  wintryMix:    { icon: "🌨️", label: "Wintry mix",     wet: true  },
  // Severe
  hurricane:     { icon: "🌀", label: "Hurricane",      wet: true },
  tropicalStorm: { icon: "🌀", label: "Tropical storm", wet: true },
};

/**
 * Look up a WeatherKit conditionCode.
 *
 * An unknown code is treated as WET. Apple can add cases, and the failure modes
 * are not symmetric: warning about footing on a dry day is a mild annoyance,
 * while staying silent during an unrecognised storm is the failure this app
 * should never choose. The label falls back to the raw code de-camel-cased,
 * which is ugly but honest — better than printing "Clear".
 */
export function conditionFromCode(code: string): ConditionInfo {
  const known = CONDITIONS[code];
  if (known) return known;
  const label = code.replace(/([A-Z])/g, " $1").replace(/^./, c => c.toUpperCase()).trim();
  return { icon: "🌧️", label: label || "Unknown", wet: true };
}

export const celsiusToFahrenheit = (c: number): number => (c * 9) / 5 + 32;
export const kmhToMph = (kmh: number): number => kmh / 1.609344;

type WeatherKitCurrent = {
  temperature?: number;
  temperatureApparent?: number;
  conditionCode?: string;
  windSpeed?: number;
  humidity?: number;
};

/**
 * WeatherKit currentWeather -> the UI's Weather.
 *
 * WeatherKit is metric SI regardless of caller, so imperial viewers are
 * converted here. Open-Meteo did this server-side via request parameters, which
 * is why openMeteoUnitParams exists and why it becomes dead once Open-Meteo goes.
 */
export function currentFromWeatherKit(raw: WeatherKitCurrent, unit: DistanceUnit): Weather {
  const info = conditionFromCode(raw.conditionCode ?? "");
  const imperial = unit === "imperial";
  const tempC = raw.temperature ?? 0;
  const feelsC = raw.temperatureApparent ?? tempC;
  const windKmh = raw.windSpeed ?? 0;
  return {
    temp: Math.round(imperial ? celsiusToFahrenheit(tempC) : tempC),
    feelsLike: Math.round(imperial ? celsiusToFahrenheit(feelsC) : feelsC),
    condition: info.label,
    icon: info.icon,
    wet: info.wet,
    windSpeed: Math.round(imperial ? kmhToMph(windKmh) : windKmh),
    // 0..1 -> 0..100. The card renders `{humidity}%`, so the raw fraction would
    // print "0.67%".
    humidity: Math.round((raw.humidity ?? 0) * 100),
  };
}

type WeatherKitDay = {
  forecastStart?: string;
  temperatureMax?: number;
  temperatureMin?: number;
  conditionCode?: string;
};

/**
 * WeatherKit forecastDaily -> the 7-day strip.
 *
 * Sliced to 7 rather than assuming the response length: Apple returns 10 days
 * when dailyStart/dailyEnd are omitted, so a UI built for 7 would otherwise
 * silently grow.
 *
 * The date key is taken from forecastStart's DATE PORTION as sent. The request
 * carries the trail's timezone, so Apple has already rolled these up against
 * that zone -- re-deriving a local day on the device would re-timezone a value
 * that is already correct for the trail.
 */
export function dailyFromWeatherKit(days: WeatherKitDay[], unit: DistanceUnit): DailyForecast[] {
  const imperial = unit === "imperial";
  return (days ?? []).slice(0, 7).map(d => {
    const info = conditionFromCode(d.conditionCode ?? "");
    const hi = d.temperatureMax ?? 0;
    const lo = d.temperatureMin ?? 0;
    return {
      date: (d.forecastStart ?? "").slice(0, 10),
      high: Math.round(imperial ? celsiusToFahrenheit(hi) : hi),
      low: Math.round(imperial ? celsiusToFahrenheit(lo) : lo),
      condition: info.label,
      icon: info.icon,
      wet: info.wet,
    };
  });
}

/** Every code this app knows about — exported so tests can assert exhaustiveness. */
export const KNOWN_CONDITION_CODES = Object.keys(CONDITIONS);


// ---------------------------------------------------------------------------
// Open-Meteo — kept alive as the fallback until WeatherKit has made a real call.
//
// The WMO mapping lives here rather than in trail-detail.tsx so that BOTH
// providers answer the same question in one place. It previously existed as two
// threshold cascades inside the screen, which is how the `wet` classification
// came to be re-derived by regex over English prose downstream.
// ---------------------------------------------------------------------------

/**
 * WMO code -> the same ConditionInfo shape WeatherKit produces.
 *
 * `wet` follows the same rule as the WeatherKit table: what the sky does to the
 * ground, not what the word looks like. Fog (45/48) wets surfaces; the clear and
 * cloud codes do not.
 */
export function conditionFromWmo(code: number): ConditionInfo {
  // Guard FIRST. Without this, a negative or non-finite code slips into the
  // `code <= 2` branch below and is reported as "Partly cloudy", dry -- the
  // exact silent fair-weather claim this function exists to avoid. It is
  // reachable in practice: currentFromOpenMeteo passes -1 whenever
  // `weather_code` is missing from the response. Caught by its own test.
  if (!Number.isFinite(code) || code < 0) {
    return { icon: "🌧️", label: "Unsettled", wet: true };
  }
  if (code === 0) return { icon: "☀️", label: "Clear", wet: false };
  if (code <= 2) return { icon: "🌤️", label: "Partly cloudy", wet: false };
  if (code === 3) return { icon: "☁️", label: "Overcast", wet: false };
  if (code === 45 || code === 48) return { icon: "🌫️", label: "Fog", wet: true };
  if (code >= 51 && code <= 57) return { icon: "🌦️", label: "Drizzle", wet: true };
  if (code >= 61 && code <= 67) return { icon: "🌧️", label: "Rain", wet: true };
  if (code >= 71 && code <= 77) return { icon: "❄️", label: "Snow", wet: true };
  if (code >= 80 && code <= 82) return { icon: "🌦️", label: "Rain showers", wet: true };
  if (code >= 85 && code <= 86) return { icon: "🌨️", label: "Snow showers", wet: true };
  if (code >= 95) return { icon: "⛈️", label: "Thunderstorm", wet: true };
  // Same fail-safe as the WeatherKit path: an unrecognised code is treated as
  // wet rather than quietly reported as fair.
  return { icon: "🌧️", label: "Unsettled", wet: true };
}

type OpenMeteoCurrent = {
  temperature_2m?: number;
  apparent_temperature?: number;
  relative_humidity_2m?: number;
  wind_speed_10m?: number;
  weather_code?: number;
};

/**
 * Open-Meteo current -> Weather.
 *
 * No unit conversion: Open-Meteo converts server-side from the request
 * parameters, and humidity already arrives as a percentage. That asymmetry with
 * WeatherKit is exactly what makes this a migration rather than a URL swap.
 */
export function currentFromOpenMeteo(c: OpenMeteoCurrent): Weather {
  const info = conditionFromWmo(c.weather_code ?? -1);
  return {
    temp: Math.round(c.temperature_2m ?? 0),
    feelsLike: Math.round(c.apparent_temperature ?? c.temperature_2m ?? 0),
    condition: info.label,
    icon: info.icon,
    wet: info.wet,
    windSpeed: Math.round(c.wind_speed_10m ?? 0),
    humidity: Math.round(c.relative_humidity_2m ?? 0),
  };
}

type OpenMeteoDaily = {
  time?: string[];
  weather_code?: number[];
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
};

/**
 * Open-Meteo daily -> the 7-day strip.
 *
 * Open-Meteo returns PARALLEL ARRAYS rather than objects, so the length is
 * driven by `time` and every other array is read positionally. A short or
 * ragged array yields a day with missing numbers rather than throwing, which
 * matters because this is the fallback path -- it must degrade, not crash.
 */
export function dailyFromOpenMeteo(d: OpenMeteoDaily): DailyForecast[] {
  const days = d?.time ?? [];
  return days.slice(0, 7).map((date, i) => {
    const info = conditionFromWmo(d.weather_code?.[i] ?? -1);
    return {
      date,
      high: Math.round(d.temperature_2m_max?.[i] ?? 0),
      low: Math.round(d.temperature_2m_min?.[i] ?? 0),
      condition: info.label,
      icon: info.icon,
      wet: info.wet,
    };
  });
}

/**
 * "Today" or a short weekday, from a YYYY-MM-DD key.
 *
 * Parsed from PARTS, never `new Date(key)`. A bare date string is parsed as UTC
 * by spec, so west of Greenwich `new Date("2026-09-05").getDay()` returns the
 * previous weekday — the same class of bug the activity heatmap had to avoid,
 * and it would silently mislabel every column in the strip.
 */
export function weekdayLabel(dateKey: string, today: Date): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (!y || !m || !d) return "";
  const local = new Date(y, m - 1, d);
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  if (dateKey === todayKey) return "Today";
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][local.getDay()];
}

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

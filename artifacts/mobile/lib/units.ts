export type DistanceUnit = "imperial" | "metric";

const KM_PER_MILE = 1.60934;
const METERS_PER_FOOT = 0.3048;

export function formatDistance(miles: number, unit: DistanceUnit): string {
  if (unit === "metric") {
    const km = miles * KM_PER_MILE;
    return `${km.toFixed(1)} km`;
  }
  return `${miles.toFixed(1)} mi`;
}

/**
 * How far away something is, or null when the number has stopped meaning
 * anything. Deliberately separate from formatDistance: that one formats trail
 * *length*, where every real value is 1–40 and `.toFixed(1)` with no separator
 * is exactly right. Distance-from-you spans three orders of magnitude — the
 * catalogue's nearest trail to Singapore is 2,155.9 miles — and reusing the
 * length formatter there produces "2155.9 mi away", which reads as a bug.
 *
 * Two thresholds, deliberately measured against different things:
 *
 *   - Suppression is physical, so it is tested in MILES. Past ~500 miles the
 *     figure tells you nothing either system of units could rescue, and both an
 *     imperial and a metric reader should lose it at the same actual distance.
 *     Callers fall back to the trail's `location` string, which is more useful
 *     at that range anyway ("Mount Rainier National Park, WA").
 *   - The decimal is about legibility, so it is tested against the number the
 *     reader actually sees. "3.2 mi" and "64.4 km" both read well; "644.0 km"
 *     does not.
 */
export function formatDistanceAway(miles: number, unit: DistanceUnit): string | null {
  if (!Number.isFinite(miles) || miles < 0) return null;
  if (miles > AWAY_SUPPRESS_ABOVE_MI) return null;

  const value = distanceFromMiles(miles, unit);
  const label = distanceUnitLabel(unit);
  if (value < 100) return `${value.toFixed(1)} ${label}`;
  // toLocaleString to match formatElevation, which already separates thousands.
  return `${Math.round(value).toLocaleString()} ${label}`;
}

const AWAY_SUPPRESS_ABOVE_MI = 500;

export function formatElevation(feet: number, unit: DistanceUnit): string {
  if (unit === "metric") {
    const meters = feet * METERS_PER_FOOT;
    return `${Math.round(meters).toLocaleString()} m`;
  }
  return `${Math.round(feet).toLocaleString()} ft`;
}

// Short unit names, for input labels and stat captions where the value is
// rendered separately from its unit.
export function distanceUnitLabel(unit: DistanceUnit): string {
  return unit === "metric" ? "km" : "mi";
}

export function elevationUnitLabel(unit: DistanceUnit): string {
  return unit === "metric" ? "m" : "ft";
}

// Weather is fetched already converted rather than converted here: Open-Meteo
// takes the unit as a request parameter, so there is no round trip through a
// canonical storage unit the way distance and elevation have.
export function temperatureUnitLabel(unit: DistanceUnit): string {
  return unit === "metric" ? "°C" : "°F";
}

/**
 * Spoken form of temperatureUnitLabel, for accessibility labels.
 *
 * "°F" is read aloud inconsistently -- depending on the screen reader and the
 * surrounding text it can come out as "degrees F", "F", or the degree sign
 * skipped entirely. A label a blind user relies on should not depend on that.
 *
 * Lives next to temperatureUnitLabel so the two cannot drift onto different
 * units: any change here must be made there and vice versa.
 */
export function temperatureUnitSpoken(unit: DistanceUnit): string {
  return unit === "metric" ? "degrees Celsius" : "degrees Fahrenheit";
}

export function windSpeedUnitLabel(unit: DistanceUnit): string {
  return unit === "metric" ? "km/h" : "mph";
}

/** Open-Meteo's own parameter spellings for the viewer's preference. */
export function openMeteoUnitParams(unit: DistanceUnit): { temperature: string; windSpeed: string } {
  return unit === "metric"
    ? { temperature: "celsius", windSpeed: "kmh" }
    : { temperature: "fahrenheit", windSpeed: "mph" };
}

// Distance and elevation are always stored in miles/feet. These convert
// between storage and whatever the user is currently typing or reading, so a
// metric user's "10" means 10 km on the way in and reads back as 10 km.
export function distanceToMiles(value: number, unit: DistanceUnit): number {
  return unit === "metric" ? value / KM_PER_MILE : value;
}

export function distanceFromMiles(miles: number, unit: DistanceUnit): number {
  return unit === "metric" ? miles * KM_PER_MILE : miles;
}

export function elevationToFeet(value: number, unit: DistanceUnit): number {
  return unit === "metric" ? value / METERS_PER_FOOT : value;
}

export function elevationFromFeet(feet: number, unit: DistanceUnit): number {
  return unit === "metric" ? feet * METERS_PER_FOOT : feet;
}

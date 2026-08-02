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

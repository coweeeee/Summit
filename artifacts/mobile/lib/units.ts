export type DistanceUnit = "imperial" | "metric";

export function formatDistance(miles: number, unit: DistanceUnit): string {
  if (unit === "metric") {
    const km = miles * 1.60934;
    return `${km.toFixed(1)} km`;
  }
  return `${miles.toFixed(1)} mi`;
}

export function formatElevation(feet: number, unit: DistanceUnit): string {
  if (unit === "metric") {
    const meters = feet * 0.3048;
    return `${Math.round(meters).toLocaleString()} m`;
  }
  return `${Math.round(feet).toLocaleString()} ft`;
}

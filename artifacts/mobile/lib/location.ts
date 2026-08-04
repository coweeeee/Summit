// The seam where device location will plug in.
//
// ─────────────────────────────────────────────────────────────────────────────
// NOT WIRED YET. `expo-location` is not a dependency, and app.json carries no
// location permission strings. Both are native-config changes, which this
// project's conventions require the owner to approve before they are committed.
// Until that happens `deviceLocation` is the unsupported provider below.
//
// It reports "unsupported" and its getCurrentPosition() THROWS. It does not
// return a placeholder position, and it must never be changed to: a hardcoded
// fix would make the whole nearby feature look like it worked, quietly ranking
// every trail against a city the user is not in. A feature that is visibly
// unavailable is recoverable; one that silently lies is not.
//
// To wire it up, see nativeLocationProvider() at the bottom of this file — the
// swap is one exported constant.
// ─────────────────────────────────────────────────────────────────────────────

import type { Coords } from "./geo";

/**
 * Every distinct state the UI has to render, not just the ones expo-location
 * names. Kept as one union because the screen's job is to pick a message, and
 * a boolean `granted` collapses three different fixes into one dead end.
 */
export type LocationPermission =
  /** No location on this build or platform at all — web, or the module absent. */
  | "unsupported"
  /** Never asked. The only state where prompting the user is appropriate. */
  | "undetermined"
  | "granted"
  /** Declined, but askable again. */
  | "denied"
  /** Declined permanently or restricted by policy — only Settings can undo it. */
  | "blocked"
  /** Permission is fine; the OS location service itself is switched off. */
  | "services-off";

/** A position, with when it was taken — a fix from an hour ago is still useful for ranking. */
export type LocationFix = { coords: Coords; capturedAt: number };

export interface LocationProvider {
  /** Current permission without prompting. Safe to call on mount. */
  getPermission(): Promise<LocationPermission>;
  /** Prompts if and only if the state is "undetermined". */
  requestPermission(): Promise<LocationPermission>;
  /** Throws if permission is not granted, or if no fix can be obtained. */
  getCurrentPosition(): Promise<LocationFix>;
}

export class LocationUnavailableError extends Error {
  readonly permission: LocationPermission;
  constructor(permission: LocationPermission, message: string) {
    super(message);
    this.name = "LocationUnavailableError";
    this.permission = permission;
  }
}

/**
 * What ships today. Every call resolves to "unsupported"; asking it for a
 * position is a programming error, so it throws rather than resolving to
 * something a caller might render.
 */
export const unsupportedLocationProvider: LocationProvider = {
  async getPermission() {
    return "unsupported";
  },
  async requestPermission() {
    return "unsupported";
  },
  async getCurrentPosition(): Promise<LocationFix> {
    throw new LocationUnavailableError(
      "unsupported",
      "Device location is not available in this build: expo-location is not installed.",
    );
  },
};

/**
 * The single swap point.
 *
 * Once expo-location is approved and installed, replace the right-hand side
 * with the real provider. Nothing else in the app imports expo-location, so
 * this line is the entire integration surface. A sketch of the implementation,
 * left as a comment rather than dead code so it cannot be imported half-built:
 *
 *   import * as Location from "expo-location";
 *
 *   const map = (s: Location.PermissionStatus, canAskAgain: boolean): LocationPermission =>
 *     s === "granted" ? "granted"
 *       : s === "undetermined" ? "undetermined"
 *       : canAskAgain ? "denied" : "blocked";
 *
 *   export const deviceLocation: LocationProvider = {
 *     async getPermission() {
 *       if (!(await Location.hasServicesEnabledAsync())) return "services-off";
 *       const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
 *       return map(status, canAskAgain);
 *     },
 *     async requestPermission() {
 *       const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
 *       return map(status, canAskAgain);
 *     },
 *     async getCurrentPosition() {
 *       // Balanced, not BestForNavigation: ranking a trail list needs a
 *       // neighbourhood, not a doorstep, and high accuracy costs seconds of
 *       // GPS lock. getLastKnownPositionAsync first for the same reason —
 *       // an instant stale fix beats a spinner.
 *       const last = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60 * 1000 });
 *       const pos = last ?? await Location.getCurrentPositionAsync({
 *         accuracy: Location.Accuracy.Balanced,
 *       });
 *       return {
 *         coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
 *         capturedAt: pos.timestamp,
 *       };
 *     },
 *   };
 */
export const deviceLocation: LocationProvider = unsupportedLocationProvider;

/** True when asking again can plausibly succeed, i.e. a prompt is worth offering. */
export function canPrompt(permission: LocationPermission): boolean {
  return permission === "undetermined" || permission === "denied";
}

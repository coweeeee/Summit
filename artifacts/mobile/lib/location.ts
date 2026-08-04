// Device location: permission state, and getting a fix.
//
// The one rule this file exists to enforce: there is no fallback coordinate.
// Every failure path reports why it failed and returns nothing. A hardcoded
// position would make the nearby feature look like it worked while ranking
// every trail against a city the user is not in — and note that discover.tsx
// already holds US_REGION (39.5, -98.35) as a map viewport, which is exactly
// the tempting wrong answer sitting one import away.
//
// expo-location is imported dynamically, matching settings.tsx's handling of
// expo-image-picker, so nothing native is touched until someone actually sorts
// by distance. On web the module falls back to navigator.geolocation and its
// getPermissionsAsync *throws* rather than resolving denied when
// navigator.permissions.query is absent, so web short-circuits to unsupported
// before the import — the same place lib/maps.web.ts dead-ends the map tab.

import { Platform } from "react-native";
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
 * How long to wait for a fix before giving up.
 *
 * Mandatory, not defensive. Neither platform implements one: iOS passes only
 * {accuracy, distanceInterval} to a bare requestLocation(), and Android never
 * calls setDurationMillis. With the Simulator's location set to "None",
 * getCurrentPositionAsync does not reject — it simply never resolves, and
 * without this the screen would spin for the rest of the session.
 */
const POSITION_TIMEOUT_MS = 12_000;

/** A fix this recent is good enough to rank a trail list, and arrives instantly. */
const LAST_KNOWN_MAX_AGE_MS = 10 * 60 * 1000;

type ExpoLocationModule = typeof import("expo-location");

/**
 * Whether a device position can exist here at all — known synchronously, so the
 * UI can decline to offer the sort rather than offering it and then explaining.
 *
 * Web resolves location through navigator.geolocation, whose getPermissionsAsync
 * *throws* rather than resolving denied when navigator.permissions.query is
 * absent. lib/maps.web.ts dead-ends the map tab for the same class of reason.
 */
export const LOCATION_SUPPORTED = Platform.OS === "ios" || Platform.OS === "android";
const isSupportedPlatform = LOCATION_SUPPORTED;

async function loadModule(): Promise<ExpoLocationModule> {
  // Dynamic, like settings.tsx does for expo-image-picker: nothing native is
  // touched until someone actually sorts by distance.
  return await import("expo-location");
}

function mapStatus(status: string, canAskAgain: boolean): LocationPermission {
  if (status === "granted") return "granted";
  if (status === "undetermined") return "undetermined";
  // iOS reports `restricted` (parental controls, MDM) as denied with no way to
  // ask again — indistinguishable from a permanent refusal at this layer, which
  // is why the blocked copy has to be true for someone who *cannot* grant it,
  // not just someone who won't.
  return canAskAgain ? "denied" : "blocked";
}

async function readPermission(Location: ExpoLocationModule): Promise<LocationPermission> {
  // Services first: "location is off for the whole device" and "you said no to
  // Summit" need different instructions, and the OS-level switch outranks.
  if (!(await Location.hasServicesEnabledAsync())) return "services-off";
  const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
  return mapStatus(status, canAskAgain);
}

export const deviceLocation: LocationProvider = {
  async getPermission() {
    if (!isSupportedPlatform) return "unsupported";
    try {
      return await readPermission(await loadModule());
    } catch {
      return "unsupported";
    }
  },

  async requestPermission() {
    if (!isSupportedPlatform) return "unsupported";
    let Location: ExpoLocationModule;
    try {
      Location = await loadModule();
    } catch {
      return "unsupported";
    }

    if (!(await Location.hasServicesEnabledAsync())) return "services-off";

    // Ask only when asking can do something. After a refusal iOS resolves this
    // immediately with no dialog, so calling it regardless would look to the
    // caller like the user declined again a moment ago.
    const current = await Location.getForegroundPermissionsAsync();
    if (current.status !== "undetermined") {
      return mapStatus(current.status, current.canAskAgain);
    }

    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
    return mapStatus(status, canAskAgain);
  },

  async getCurrentPosition(): Promise<LocationFix> {
    if (!isSupportedPlatform) {
      throw new LocationUnavailableError("unsupported", "Device location isn't available on this platform.");
    }
    const Location = await loadModule();

    const permission = await readPermission(Location);
    if (permission !== "granted") {
      throw new LocationUnavailableError(permission, "Location permission is not granted.");
    }

    // A recent cached fix is exactly as useful for ranking a list as a fresh
    // one, and returns immediately instead of holding a GPS lock.
    const cached = await Location.getLastKnownPositionAsync({ maxAge: LAST_KNOWN_MAX_AGE_MS });
    if (cached) {
      return { coords: { lat: cached.coords.latitude, lng: cached.coords.longitude }, capturedAt: cached.timestamp };
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const fresh = await Promise.race([
        // Balanced, not BestForNavigation: this ranks a list by neighbourhood,
        // and the highest accuracy tier costs seconds of GPS lock to sharpen a
        // number that gets rounded to one decimal place.
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new LocationUnavailableError("granted", "Timed out waiting for a location fix.")),
            POSITION_TIMEOUT_MS,
          );
        }),
      ]);
      return { coords: { lat: fresh.coords.latitude, lng: fresh.coords.longitude }, capturedAt: fresh.timestamp };
    } finally {
      if (timer) clearTimeout(timer);
    }
  },
};

/** True when asking again can plausibly succeed, i.e. a prompt is worth offering. */
export function canPrompt(permission: LocationPermission): boolean {
  return permission === "undetermined" || permission === "denied";
}

/**
 * True when no amount of tapping in-app will produce a position, so the screen
 * should stop offering the sort rather than keep explaining itself.
 *
 * "Allow Once" is deliberately not modelled anywhere: it reads as `granted` for
 * the life of the process and silently reverts to `undetermined` on the next
 * cold launch. Nothing may cache a "they already agreed" flag — every launch
 * re-reads the real state.
 */
export function isPermanentlyUnavailable(permission: LocationPermission): boolean {
  return permission === "unsupported";
}

// Device position for the screen that asks for it, with the guards this
// codebase has learned to need.
//
// Two deliberate choices:
//
//   - Nothing happens until `enabled` is true. A user who never touches the
//     Nearest sort should never see a permission dialog, and the app should not
//     be waking the GPS for a list ordered by rating.
//   - Mounting never prompts. `getPermission()` only reads state; the prompt is
//     behind an explicit user action, so the OS dialog arrives attached to a tap
//     the user just made rather than as a cold-start ambush. iOS only ever
//     shows it once, and spending it unprompted is unrecoverable.
//
// The sequence guard is the same ticket pattern as the feed (app/(tabs)/index.tsx,
// loadSeqRef). A position fetch is async and resolves after first paint, which
// is precisely the shape that produced the feed's cold-start races: without it,
// a fix requested under one set of filters can land after the user has changed
// them and reorder a list it knows nothing about.

import { useCallback, useEffect, useRef, useState } from "react";
import {
  canPrompt,
  deviceLocation,
  LocationUnavailableError,
  type LocationFix,
  type LocationPermission,
} from "./location";

export type DeviceLocationState = {
  permission: LocationPermission;
  fix: LocationFix | null;
  /** True while a permission check or position fetch is in flight. */
  loading: boolean;
  /** Set only when a fetch failed for a reason the permission state does not explain. */
  error: string | null;
  /** Whether offering a "turn this on" action makes sense in the current state. */
  canPrompt: boolean;
  /** User-initiated: prompts if allowed, then fetches. Safe to call repeatedly. */
  request: () => Promise<void>;
  /** Re-fetch a position with permission already granted. */
  refresh: () => Promise<void>;
};

export function useDeviceLocation(enabled: boolean): DeviceLocationState {
  const [permission, setPermission] = useState<LocationPermission>("undetermined");
  const [fix, setFix] = useState<LocationFix | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ticket for location work. Every path that writes state takes the next
  // number and re-checks it after each await, committing only if it still holds
  // the newest — a superseded request must not move the map under a newer one.
  const seqRef = useRef(0);

  const fetchFix = useCallback(async (seq: number) => {
    try {
      const next = await deviceLocation.getCurrentPosition();
      if (seq !== seqRef.current) return;
      setFix(next);
      setError(null);
    } catch (e) {
      if (seq !== seqRef.current) return;
      setFix(null);
      // A LocationUnavailableError carries the real permission state, which is
      // more accurate than whatever we last read — adopt it rather than
      // reporting a generic failure over the top of a specific cause.
      //
      // But `granted` is not a cause. It means the permission was fine and the
      // *fetch* failed — in practice the 12s timeout, which is the documented
      // primary failure path here. Clearing `error` for that case swallowed the
      // only signal: nothing downstream renders for `granted`, so the chip
      // stayed lit, no banner appeared, and the list quietly served Top Rated
      // under a "Nearest" selection. Keeping the message routes it to
      // NearbyNotice's error branch, which already offers Try again.
      if (e instanceof LocationUnavailableError) {
        setPermission(e.permission);
        setError(e.permission === "granted" ? e.message : null);
      } else {
        setError(e instanceof Error ? e.message : "Couldn't get your location.");
      }
    }
  }, []);

  // Read permission when the feature is switched on. Never prompts.
  useEffect(() => {
    if (!enabled) return;
    const seq = ++seqRef.current;
    setLoading(true);
    (async () => {
      const current = await deviceLocation.getPermission();
      if (seq !== seqRef.current) return;
      setPermission(current);
      if (current === "granted") await fetchFix(seq);
      if (seq !== seqRef.current) return;
      setLoading(false);
    })();
  }, [enabled, fetchFix]);

  const request = useCallback(async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    setError(null);
    const granted = await deviceLocation.requestPermission();
    if (seq !== seqRef.current) return;
    setPermission(granted);
    if (granted === "granted") await fetchFix(seq);
    if (seq !== seqRef.current) return;
    setLoading(false);
  }, [fetchFix]);

  const refresh = useCallback(async () => {
    const seq = ++seqRef.current;
    setLoading(true);
    await fetchFix(seq);
    if (seq !== seqRef.current) return;
    setLoading(false);
  }, [fetchFix]);

  return {
    permission,
    fix,
    loading,
    error,
    canPrompt: canPrompt(permission),
    request,
    refresh,
  };
}

// Great-circle distance, and ordering a list of trails by it.
//
// Pure and dependency-free on purpose: this is the half of "nearby trails" that
// needs no native module, so it is testable with `npm test` and reviewable
// without a device. Nothing here knows where the user is — it takes an origin
// and does arithmetic.
//
// Distances are miles because that is the app's storage unit everywhere else
// (`trails.distance_mi`, `hikes.distance_mi`), and lib/units.ts already converts
// miles to whatever the viewer reads. Introducing a second canonical unit here
// would mean two conversion paths for one number.

export type Coords = { lat: number; lng: number };

/** Anything carrying optional coordinates — `trails` has both columns nullable. */
export type Locatable = { lat: number | null; lng: number | null };

/** Mean Earth radius. Haversine assumes a sphere, which is worth ~0.3% at worst. */
const EARTH_RADIUS_MI = 3958.7613;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/**
 * True for a usable coordinate pair.
 *
 * Rejects out-of-range values rather than letting them through: haversine is
 * happy to return a confident-looking number for a longitude of 900, and a
 * wrong distance is worse than a missing one because nothing downstream can
 * tell it is wrong. `null` island (0,0) is deliberately *not* rejected — it is
 * a real point in the Gulf of Guinea, and treating it as invalid would be
 * guessing at the caller's data quality rather than measuring it.
 */
export function isValidCoords(value: Locatable | Coords | null | undefined): value is Coords {
  if (!value) return false;
  const { lat, lng } = value as Locatable;
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/** Great-circle distance in miles between two valid coordinate pairs. */
export function haversineMiles(a: Coords, b: Coords): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  // atan2 rather than asin: asin loses precision as h approaches 1, i.e. for
  // near-antipodal pairs. Irrelevant for a trail list, free to get right.
  return 2 * EARTH_RADIUS_MI * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Distance from `origin` to `target`, or null when it cannot be known.
 *
 * Null means exactly one thing: this trail has no usable position. It does not
 * mean zero and it does not mean far. Callers must render it as unknown rather
 * than substituting a number — a trail labelled "0.0 mi away" because its
 * coordinates are missing is a lie the user cannot detect.
 */
export function distanceMiTo(origin: Coords, target: Locatable): number | null {
  if (!isValidCoords(origin) || !isValidCoords(target)) return null;
  return haversineMiles(origin, target);
}

export type WithDistance<T> = T & { distanceMi: number | null };

/**
 * Annotate each item with its distance from `origin` and order nearest first.
 *
 * Items with no usable coordinates keep `distanceMi: null` and sort to the end
 * as a block — they are unranked, not infinitely far, and dropping them would
 * silently shorten a list the user is filtering, not searching.
 *
 * Relative order within a tie (and within the unlocatable block) is the input
 * order, since Array.prototype.sort is stable. Callers that page over the
 * result should therefore hand in a list that already has a deterministic
 * order — discover.tsx's queries end with `.order("id")` for that reason.
 */
export function sortByDistance<T extends Locatable>(items: T[], origin: Coords): WithDistance<T>[] {
  const annotated: WithDistance<T>[] = items.map(item => ({
    ...item,
    distanceMi: distanceMiTo(origin, item),
  }));

  return annotated.sort((a, b) => {
    if (a.distanceMi === null && b.distanceMi === null) return 0;
    if (a.distanceMi === null) return 1;
    if (b.distanceMi === null) return -1;
    return a.distanceMi - b.distanceMi;
  });
}

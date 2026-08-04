// Turning a set of trail coordinates into a camera region.
//
// Pure and dependency-free, isolated from the screen for the same reason
// lib/geo.ts is: the interesting cases here — one point, no points, and a set
// that straddles the antimeridian — are all but impossible to exercise by hand
// in the Simulator, and all three are live in the current catalogue.
//
// The rule this implements: the camera always fits whatever is in the current
// result set. No filters means all of them; a region filter means that subset.
// One rule, no special case for "filtered" versus "unfiltered", and nothing is
// ever locked to a hardcoded viewport that the data has outgrown.

export type LatLng = { lat: number; lng: number };

/**
 * What callers actually hold. `trails.lat` and `trails.lng` are both nullable
 * columns, so the screen's rows arrive with `number | null` — accepting that
 * here keeps the narrowing in one tested place instead of pushing a cast to
 * every call site.
 */
export type MaybeLatLng = { lat: number | null; lng: number | null } | null | undefined;

export type MapRegion = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

/**
 * Floor on either span. A single trail has zero extent, and fitting exactly
 * that slams the camera to maximum street zoom on a point with no context —
 * 12 of the 41 region filters match exactly one trail, so this is routine.
 * ~0.05° is a few miles across.
 */
const MIN_DELTA = 0.05;

/** Breathing room so the outermost pins aren't flush against the bezel. */
const PADDING = 1.35;

/** Fold any longitude into [-180, 180). */
function normalizeLng(lng: number): number {
  return (((lng + 180) % 360) + 360) % 360 - 180;
}

function isUsable(p: MaybeLatLng): p is LatLng {
  if (!p) return false;
  const { lat, lng } = p;
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

/**
 * The region enclosing `points`, or null when there is nothing to enclose.
 *
 * Null rather than a default viewport, deliberately: the caller must decide
 * what an empty result means, and every "sensible default" here would be
 * another hardcoded region — which is the bug this replaces. react-native-maps'
 * Android `fitToCoordinates` also builds its LatLngBounds with no empty-array
 * guard, so handing it nothing is not safe either.
 *
 * Longitude is fitted the short way round. The naive min/max is wrong for this
 * catalogue: it spans Kauai (-159.66) to New Zealand (175.67), and a raw
 * bounding box on those reads as 335 degrees centred on the Gulf of Guinea —
 * the emptiest possible framing of a set of trails that are actually neighbours
 * across the dateline. Instead the widest gap between adjacent longitudes is
 * found and the camera covers everything *except* that gap, which is the same
 * answer for ordinary sets and the correct one for wrapping sets.
 */
export function regionForCoords(points: MaybeLatLng[]): MapRegion | null {
  const usable = points.filter(isUsable);
  if (usable.length === 0) return null;

  // ── Latitude: no wraparound to worry about, so plain extremes. ──
  const lats = usable.map(p => p.lat);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const latitude = (minLat + maxLat) / 2;
  const latitudeDelta = Math.min(Math.max((maxLat - minLat) * PADDING, MIN_DELTA), 180);

  // ── Longitude: cover everything but the widest gap. ──
  const lngs = usable.map(p => p.lng).sort((a, b) => a - b);
  const last = lngs[lngs.length - 1];

  // Seed with the gap that wraps across the antimeridian, from the easternmost
  // point round to the westernmost. For a single point this is the full 360,
  // which correctly yields a zero-width arc that MIN_DELTA then opens up.
  let widestGap = lngs[0] + 360 - last;
  let arcStart = lngs[0];

  for (let i = 1; i < lngs.length; i++) {
    const gap = lngs[i] - lngs[i - 1];
    if (gap > widestGap) {
      widestGap = gap;
      // The arc resumes at the point on the far side of the gap and runs east.
      arcStart = lngs[i];
    }
  }

  const arcSpan = 360 - widestGap;
  const longitude = normalizeLng(arcStart + arcSpan / 2);
  const longitudeDelta = Math.min(Math.max(arcSpan * PADDING, MIN_DELTA), 360);

  return { latitude, longitude, latitudeDelta, longitudeDelta };
}

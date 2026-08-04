// What can honestly be said about a hike's elevation, given one number.
//
// ─────────────────────────────────────────────────────────────────────────────
// THERE IS NO ELEVATION PROFILE DATA, AND THERE CANNOT BE ONE FROM THIS SCHEMA.
//
// The wishlist item asked for "a simple line chart over elevation data already
// being logged". Checked against the live database: the only elevation columns
// that exist anywhere are `hikes.elevation_ft` and `trails.elevation_ft`, both
// a single integer of total gain. There is no track, no segment geometry, no
// waypoint table — 16 tables, none of them holding a path. `trails.lat/lng` is
// one point per trail, not a route, so even an external elevation API has
// nothing to sample along.
//
// A point-by-point profile therefore cannot be drawn, and drawing a plausible
// *shape* from a single total would be inventing the data — the exact failure
// this codebase refuses elsewhere. So this module does the honest thing
// instead: it derives what the two real numbers actually support, which is an
// average grade, and says nothing it cannot support.
// ─────────────────────────────────────────────────────────────────────────────

const FEET_PER_MILE = 5280;

export type Grade = {
  /** Feet of gain per mile travelled. */
  ftPerMile: number;
  /** The same figure as a percentage grade, which is how trail signs express it. */
  percent: number;
};

/**
 * Average grade over the whole logged distance, or null when it is unknowable.
 *
 * Null means the distance is missing or zero, so the ratio is undefined. It
 * does NOT mean flat — `Frigid Crags` in the catalogue carries distance 0 and
 * elevation 0, and calling that trail flat would be a guess dressed as a fact.
 *
 * Zero, by contrast, is a real answer. Anhinga Trail, Shark Valley and Fort
 * Jefferson Moat Walk all have 0 feet of gain over a real distance because they
 * are genuinely flat boardwalk and road routes. Callers must not treat 0 as
 * missing — the existing hike-detail stat does exactly that (`elevation_ft > 0`)
 * and hides the elevation row entirely for a flat hike.
 *
 * A caveat worth keeping in view rather than hiding: `elevation_ft` is total
 * gain and `distance_mi` is usually the round trip, so this averages the climb
 * across ground that includes the descent. It understates how steep the
 * climbing sections actually were. It is an honest summary of the two numbers
 * available, not a measurement of the steepest part.
 */
export function averageGrade(
  elevationFt: number | null | undefined,
  distanceMi: number | null | undefined,
): Grade | null {
  if (typeof elevationFt !== "number" || !Number.isFinite(elevationFt) || elevationFt < 0) return null;
  if (typeof distanceMi !== "number" || !Number.isFinite(distanceMi) || distanceMi <= 0) return null;

  const ftPerMile = elevationFt / distanceMi;
  return { ftPerMile, percent: (ftPerMile / FEET_PER_MILE) * 100 };
}

export type SteepnessKey = "flat" | "gentle" | "moderate" | "steep" | "very-steep";

export type SteepnessBand = {
  key: SteepnessKey;
  label: string;
  /** Exclusive upper bound in ft/mile. Infinity for the last band. */
  maxFtPerMile: number;
};

/**
 * Ordered bands, in feet per mile.
 *
 * The boundaries are the usual grade conventions rounded to memorable figures:
 * 100 ft/mi is about 2%, 250 about 5%, 500 about 9.5%, 800 about 15%. Exported
 * so the scale on screen and the label always come from the same table rather
 * than drifting apart, which is what happened to getDiffStyle's two copies.
 */
export const STEEPNESS_BANDS: readonly SteepnessBand[] = [
  { key: "flat",       label: "Flat",       maxFtPerMile: 100 },
  { key: "gentle",     label: "Gentle",     maxFtPerMile: 250 },
  { key: "moderate",   label: "Moderate",   maxFtPerMile: 500 },
  { key: "steep",      label: "Steep",      maxFtPerMile: 800 },
  { key: "very-steep", label: "Very steep", maxFtPerMile: Infinity },
] as const;

export function steepnessBand(ftPerMile: number): SteepnessBand {
  return STEEPNESS_BANDS.find(b => ftPerMile < b.maxFtPerMile) ?? STEEPNESS_BANDS[STEEPNESS_BANDS.length - 1];
}

/**
 * Where a grade sits along the band scale, as 0..1, for positioning a marker.
 *
 * Each band occupies an equal share of the width — the underlying ft/mile
 * values are wildly non-linear (the last band is unbounded) and a linear axis
 * would squash every ordinary hike into the left tenth. The open-ended band is
 * given a display ceiling so the marker stays on screen for a Kilimanjaro.
 */
const DISPLAY_CEILING_FT_PER_MILE = 1200;

export function steepnessScalePosition(ftPerMile: number): number {
  const bands = STEEPNESS_BANDS;
  const width = 1 / bands.length;

  let lower = 0;
  for (let i = 0; i < bands.length; i++) {
    const upper = Number.isFinite(bands[i].maxFtPerMile) ? bands[i].maxFtPerMile : DISPLAY_CEILING_FT_PER_MILE;
    if (ftPerMile < bands[i].maxFtPerMile) {
      const within = upper > lower ? (ftPerMile - lower) / (upper - lower) : 0;
      return Math.min(Math.max((i + within) * width, 0), 1);
    }
    lower = upper;
  }
  return 1;
}

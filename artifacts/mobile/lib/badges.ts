import { formatElevation, type DistanceUnit } from "./units.ts";

// Single source of truth for badges: the thresholds, the checks, and the copy
// that describes them. Three screens used to keep their own copies of this —
// the profile grid, the badge modal, and the notifications list — which drifted
// apart on both wording and which badges existed at all.

export const CLIMBER_ELEVATION_FT = 5000;
export const EXPLORER_HIKE_COUNT = 5;
export const SUMMIT_HIKE_COUNT = 10;
export const TRAILBLAZER_HIKE_COUNT = 25;
export const EARLY_BIRD_HOUR_CUTOFF = 7;

export type BadgeCheck = (hikeCount: number, totalElevationFt: number, hasEarlyHike?: boolean) => boolean;

export type BadgeDefinition = {
  key: string;
  /** Short display name, e.g. "Climber". */
  name: string;
  check: BadgeCheck;
  /** How to earn it, for the badge detail modal. */
  describe: (unit: DistanceUnit) => string;
  /** Past-tense announcement, for push notifications and the activity list. */
  announce: (unit: DistanceUnit) => string;
};

export function isEarlyBirdStart(dateStr: string): boolean {
  return new Date(dateStr).getHours() < EARLY_BIRD_HOUR_CUTOFF;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  {
    key: "climber",
    name: "Climber",
    check: (_h, elev) => elev >= CLIMBER_ELEVATION_FT,
    describe: u => `Gain ${formatElevation(CLIMBER_ELEVATION_FT, u)}+ elevation total`,
    announce: u => `Climber badge — ${formatElevation(CLIMBER_ELEVATION_FT, u)}+ elevation gained!`,
  },
  {
    key: "explorer",
    name: "Explorer",
    check: h => h >= EXPLORER_HIKE_COUNT,
    describe: () => `Log ${EXPLORER_HIKE_COUNT} hikes`,
    announce: () => `Explorer badge — ${EXPLORER_HIKE_COUNT} hikes logged!`,
  },
  {
    key: "summit",
    name: "Summit",
    check: h => h >= SUMMIT_HIKE_COUNT,
    describe: () => `Log ${SUMMIT_HIKE_COUNT} hikes`,
    announce: () => `Summit badge — ${SUMMIT_HIKE_COUNT} hikes logged!`,
  },
  {
    key: "trailblazer",
    name: "Trailblazer",
    check: h => h >= TRAILBLAZER_HIKE_COUNT,
    describe: () => `Log ${TRAILBLAZER_HIKE_COUNT} hikes`,
    announce: () => `Trailblazer badge — ${TRAILBLAZER_HIKE_COUNT} hikes logged!`,
  },
  {
    key: "earlybird",
    name: "Early Bird",
    check: (_h, _e, hasEarlyHike) => !!hasEarlyHike,
    describe: () => `Start a hike before ${EARLY_BIRD_HOUR_CUTOFF} AM`,
    announce: () => `Early Bird badge — started a hike before ${EARLY_BIRD_HOUR_CUTOFF} AM!`,
  },
];

export function findBadgeDefinition(key: string): BadgeDefinition | undefined {
  return BADGE_DEFINITIONS.find(b => b.key === key);
}

// Progress copy for a badge that hasn't been earned yet. Returns null for
// badges with nothing meaningful to count toward.
export function badgeProgress(
  key: string,
  hikeCount: number,
  totalElevationFt: number,
  unit: DistanceUnit
): string | null {
  switch (key) {
    case "climber":
      return `${formatElevation(totalElevationFt, unit)} / ${formatElevation(CLIMBER_ELEVATION_FT, unit)} elevation`;
    case "explorer":
      return `${hikeCount} / ${EXPLORER_HIKE_COUNT} hikes`;
    case "summit":
      return `${hikeCount} / ${SUMMIT_HIKE_COUNT} hikes`;
    case "trailblazer":
      return `${hikeCount} / ${TRAILBLAZER_HIKE_COUNT} hikes`;
    case "earlybird":
      return `Log a hike that started before ${EARLY_BIRD_HOUR_CUTOFF} AM`;
    default:
      return null;
  }
}

/**
 * The unearned badge the user is closest to, and how much is left.
 *
 * Exists because badgeProgress() only ever appeared inside the badge modal, so
 * the nudge it provides was reachable only by tapping a badge you had no
 * particular reason to tap. This is the same numbers, surfaced without a tap.
 *
 * "Closest" is measured as the REMAINING FRACTION of each threshold, not the
 * raw remainder, because the thresholds are in different units -- 4,000 ft of
 * elevation and 3 hikes cannot be compared as numbers. Fractions can.
 *
 * Early Bird is deliberately excluded from the ranking rather than given a
 * synthetic fraction. It is a single yes/no act with no partial progress, so
 * any fraction assigned to it would be invented, and it would then either
 * always win (0/1 = furthest) or always lose. It is returned only when it is
 * the sole thing left, where "log an early start" is genuinely the next goal.
 *
 * `earnedKeys` is the server's awarded set and wins over the local check, the
 * same precedence the profile grid uses: badges are never revoked, so a badge
 * awarded before a hike was deleted must not reappear as a goal.
 */
export function nextBadgeGoal(
  hikeCount: number,
  totalElevationFt: number,
  hasEarlyHike: boolean,
  earnedKeys: ReadonlySet<string>,
  unit: DistanceUnit
): { key: string; name: string; message: string } | null {
  const isEarned = (b: BadgeDefinition) =>
    earnedKeys.has(b.key) || b.check(hikeCount, totalElevationFt, hasEarlyHike);

  const remainingFor = (key: string): { left: number; threshold: number; noun: string } | null => {
    switch (key) {
      case "climber":
        return { left: CLIMBER_ELEVATION_FT - totalElevationFt, threshold: CLIMBER_ELEVATION_FT, noun: "elevation" };
      case "explorer":
        return { left: EXPLORER_HIKE_COUNT - hikeCount, threshold: EXPLORER_HIKE_COUNT, noun: "hikes" };
      case "summit":
        return { left: SUMMIT_HIKE_COUNT - hikeCount, threshold: SUMMIT_HIKE_COUNT, noun: "hikes" };
      case "trailblazer":
        return { left: TRAILBLAZER_HIKE_COUNT - hikeCount, threshold: TRAILBLAZER_HIKE_COUNT, noun: "hikes" };
      default:
        return null;
    }
  };

  let best: { def: BadgeDefinition; left: number; noun: string; fraction: number } | null = null;
  for (const def of BADGE_DEFINITIONS) {
    if (isEarned(def)) continue;
    const r = remainingFor(def.key);
    if (!r || r.left <= 0) continue;
    const fraction = r.left / r.threshold;
    if (!best || fraction < best.fraction) best = { def, left: r.left, noun: r.noun, fraction };
  }

  if (best) {
    const amount =
      best.noun === "elevation"
        ? formatElevation(best.left, unit)
        : `${best.left} more ${best.left === 1 ? "hike" : "hikes"}`;
    const phrase = best.noun === "elevation" ? `${amount} more elevation` : amount;
    return { key: best.def.key, name: best.def.name, message: `${phrase} to unlock ${best.def.name}` };
  }

  // Nothing countable left. Early Bird is the only badge that can still be
  // outstanding here, and only when it has genuinely not been earned.
  const earlyBird = BADGE_DEFINITIONS.find(b => b.key === "earlybird");
  if (earlyBird && !isEarned(earlyBird)) {
    return {
      key: earlyBird.key,
      name: earlyBird.name,
      message: `Start a hike before ${EARLY_BIRD_HOUR_CUTOFF} AM to unlock ${earlyBird.name}`,
    };
  }
  return null;
}

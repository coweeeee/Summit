import { formatElevation, type DistanceUnit } from "./units";

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

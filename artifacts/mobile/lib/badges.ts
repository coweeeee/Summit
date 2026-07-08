export type BadgeCheck = (hikeCount: number, totalElevationFt: number, hasEarlyHike?: boolean) => boolean;

export type BadgeDefinition = {
  key: string;
  label: string;
  check: BadgeCheck;
};

export const EARLY_BIRD_HOUR_CUTOFF = 7;

export function isEarlyBirdStart(dateStr: string): boolean {
  return new Date(dateStr).getHours() < EARLY_BIRD_HOUR_CUTOFF;
}

export const BADGE_DEFINITIONS: BadgeDefinition[] = [
  { key: "climber", label: "Climber badge — 5,000+ ft elevation gained!", check: (_h, elev) => elev >= 5000 },
  { key: "explorer", label: "Explorer badge — 5 hikes logged!", check: (h) => h >= 5 },
  { key: "summit", label: "Summit badge — 10 hikes logged!", check: (h) => h >= 10 },
  { key: "trailblazer", label: "Trailblazer badge — 25 hikes logged!", check: (h) => h >= 25 },
  { key: "earlybird", label: "Early Bird badge — started a hike before 7 AM!", check: (_h, _e, hasEarlyHike) => !!hasEarlyHike },
];

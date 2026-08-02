import { Feather } from "@expo/vector-icons";
import { DistanceUnit, formatDistance, formatElevation } from "@/lib/units";

// "Good to know" tips, derived from what the database already holds.
//
// This section used to be three string literals, identical on all 225 trails.
// The alternative to deriving them was writing or generating 225 sets of real
// tips -- but these are safety claims about water, permits, exposure and
// crossings, and invented specifics are genuinely dangerous. Every line below
// is traceable to a field, so a tip can be wrong only if the data is wrong.
//
// Coverage across the current catalogue: difficulty and coordinates on all 225,
// distance on 221, tags on 219, elevation on 215.

export type TrailTip = {
  icon: React.ComponentProps<typeof Feather>["name"];
  text: string;
};

export type TipTrail = {
  distance_mi?: number | null;
  elevation_ft?: number | null;
  difficulty?: string | null;
  tags?: string[] | null;
};

export type TipWeather = {
  temp: number;
  condition: string;
} | null;

const MAX_TIPS = 4;

/** Feet of gain per mile — the number that separates a stroll from a slog. */
function steepnessTip(trail: TipTrail, unit: DistanceUnit): TrailTip | null {
  const { distance_mi: miles, elevation_ft: feet } = trail;
  if (!miles || !feet || miles <= 0 || feet <= 0) return null;

  const gainPerMile = feet / miles;
  const gain = formatElevation(feet, unit);
  const dist = formatDistance(miles, unit);

  if (gainPerMile >= 800) {
    return { icon: "trending-up", text: `Steep and sustained — ${gain} of gain packed into ${dist}. Pace yourself early.` };
  }
  if (gainPerMile >= 400) {
    return { icon: "trending-up", text: `A real climb: ${gain} of gain over ${dist}.` };
  }
  return { icon: "trending-up", text: `Gentle grade — ${gain} of gain across ${dist}.` };
}

function waterTip(trail: TipTrail, unit: DistanceUnit): TrailTip | null {
  const miles = trail.distance_mi;
  if (!miles || miles <= 0) return null;

  if (miles >= 10) {
    return { icon: "droplet", text: `A full day at ${formatDistance(miles, unit)} — carry at least 3L and start early.` };
  }
  if (miles >= 5) {
    return { icon: "droplet", text: `Half-day outing; 2L of water is a sensible minimum.` };
  }
  return { icon: "droplet", text: `Short enough that a single bottle will usually do.` };
}

// Tag-driven tips, most consequential first. Tags are capitalised in the
// database after the normalisation pass, so matching is case-folded anyway.
const TAG_TIPS: { tags: string[]; tip: TrailTip }[] = [
  { tags: ["permit"], tip: { icon: "file-text", text: "A permit is required — check availability before you travel." } },
  { tags: ["multi-day", "backpacking"], tip: { icon: "moon", text: "Planned as an overnight. Sort camp spots and permits ahead." } },
  { tags: ["desert"], tip: { icon: "sun", text: "Little to no shade. Carry extra water and start at first light." } },
  { tags: ["alpine", "summit", "glacier"], tip: { icon: "wind", text: "Exposed above the treeline, where weather turns fast." } },
  { tags: ["scramble"], tip: { icon: "alert-triangle", text: "Involves scrambling — you'll want both hands free." } },
  { tags: ["waterfall", "lake"], tip: { icon: "droplet", text: "Expect wet rock, and check crossings after rain." } },
  { tags: ["dog-friendly"], tip: { icon: "heart", text: "Dogs are welcome — bring water for them too." } },
];

function tagTips(trail: TipTrail): TrailTip[] {
  const tags = (trail.tags ?? []).map(t => t.toLowerCase());
  if (tags.length === 0) return [];
  return TAG_TIPS.filter(entry => entry.tags.some(t => tags.includes(t))).map(e => e.tip);
}

function weatherTip(weather: TipWeather, unit: DistanceUnit): TrailTip | null {
  if (!weather) return null;
  const degrees = `${weather.temp}${unit === "metric" ? "°C" : "°F"}`;
  const wet = /rain|snow|shower|thunder|drizzle/i.test(weather.condition);
  return {
    icon: "cloud",
    text: wet
      ? `${degrees} and ${weather.condition.toLowerCase()} right now — pack layers and expect slick footing.`
      : `${degrees} and ${weather.condition.toLowerCase()} at the trailhead right now.`,
  };
}

/**
 * Ordered most-actionable first, then truncated. Weather leads because it is
 * the only line that changes between one visit and the next.
 */
export function buildTrailTips(
  trail: TipTrail,
  unit: DistanceUnit,
  weather: TipWeather = null
): TrailTip[] {
  const tips = [
    weatherTip(weather, unit),
    ...tagTips(trail),
    steepnessTip(trail, unit),
    waterTip(trail, unit),
  ].filter((t): t is TrailTip => t !== null);

  // Everything above can be absent for a sparse row, so there is always a
  // floor rather than an empty section.
  if (tips.length === 0) {
    const difficulty = trail.difficulty?.toLowerCase();
    tips.push({
      icon: "sun",
      text: difficulty
        ? `Rated ${difficulty}. Check conditions and tell someone your plan before heading out.`
        : "Check conditions and tell someone your plan before heading out.",
    });
  }

  return tips.slice(0, MAX_TIPS);
}

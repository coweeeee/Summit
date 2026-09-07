import type { Feather } from "@expo/vector-icons";
// Relative, and type-only above, so this module can be exercised by
// `node --test` — the alias and the icon package are both unresolvable there,
// and everything worth testing here is pure string selection.
// Explicit .ts extensions because node's ESM resolver will not infer them, and
// `allowImportingTsExtensions` is already on. Metro resolves them either way.
import type { DistanceUnit } from "./units.ts";
import { formatDistance, formatElevation, temperatureUnitLabel } from "./units.ts";
import { averageGrade, steepnessBand } from "./elevation.ts";

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
  /**
   * Where the tip's DATA came from, when that carries an attribution
   * obligation. Only the weather tip sets it today.
   *
   * Exists so the renderer can put a credit next to THIS tip without knowing
   * which index it landed at. Open-Meteo's licence requires a link "next to
   * any location Open-Meteo data are displayed", and this tip is one of those
   * locations -- so the tip declares its own provenance rather than the screen
   * inferring it from ordering, which would break the moment the list is
   * reordered or truncated by MAX_TIPS.
   *
   * This used to be hardcoded to "open-meteo" no matter who answered, which
   * made the field a claim the tip could not back up. It now reports the
   * provider that actually produced the reading, so a credit keyed off it is
   * correct by construction rather than by the screen re-checking.
   */
  source?: WeatherSource;
};

export type TipTrail = {
  distance_mi?: number | null;
  elevation_ft?: number | null;
  difficulty?: string | null;
  tags?: string[] | null;
};

/**
 * Which provider produced a reading. Mirrors the union trail-detail already
 * keeps in `weatherSource`; attribution follows the DATA, so it cannot be
 * inferred from configuration — a WeatherKit outage that falls back to
 * Open-Meteo must still credit Open-Meteo.
 */
export type WeatherSource = "weatherkit" | "open-meteo";

export type TipWeather = {
  /** Null when the provider did not report one — the tip then omits the degrees. */
  temp: number | null;
  condition: string;
  /**
   * Supplied by the caller, never re-derived here.
   *
   * This used to be `/rain|snow|shower|thunder|drizzle/i.test(condition)`, run
   * over the English label. Against WeatherKit's vocabulary that reads hail,
   * sleet, wintryMix, hurricane and tropicalStorm as DRY — the "expect slick
   * footing" line vanished in exactly the conditions that most warrant it.
   * lib/weather.ts computes this per condition code instead; see its comment.
   */
  wet: boolean;
  /**
   * Which provider produced this reading. Supplied by the caller for the same
   * reason `wet` is: the tip cannot know, and guessing gets the credit wrong.
   */
  source: WeatherSource;
  /**
   * The unit `temp` is ALREADY IN, captured when the reading was fetched.
   *
   * Not the same as buildTrailTips' `unit` parameter, which describes the
   * viewer's current preference and correctly drives the distance and
   * elevation tips (those read from `trail`, which is not refetched). Weather
   * is converted at fetch time, so between a preference change and the refetch
   * landing the two genuinely differ -- and this section has no loading gate,
   * so it renders the old reading throughout that window. Labelling a
   * Fahrenheit number "°C" is the bug this prevents.
   */
  unit: DistanceUnit;
} | null;

const MAX_TIPS = 4;

/**
 * How much climbing, in the app's own vocabulary.
 *
 * Uses lib/elevation.ts rather than thresholds of its own. It previously cut at
 * 800 and 400 ft/mile while the steepness scale on hike detail cuts at 100, 250,
 * 500 and 800 — so a trail could read "Moderate" on one screen and "Gentle
 * grade" on the other, from the same two numbers. That is the drift that got
 * getDiffStyle consolidated, arriving by a different route.
 *
 * The guard change matters too. This used to bail on `!feet`, which treats 0 as
 * absent — so the genuinely flat trails (Anhinga Trail, Shark Valley Tram Road,
 * Fort Jefferson Moat Walk) got no line at all, when "it is flat" is exactly
 * what someone wants to know. averageGrade returns null only when the ratio is
 * unknowable, which is the honest test.
 */
function steepnessTip(trail: TipTrail, unit: DistanceUnit): TrailTip | null {
  const { distance_mi: miles, elevation_ft: feet } = trail;
  const grade = averageGrade(feet, miles);
  if (!grade || !miles) return null;

  const gain = formatElevation(feet ?? 0, unit);
  const dist = formatDistance(miles, unit);

  switch (steepnessBand(grade.ftPerMile).key) {
    case "very-steep":
      return { icon: "trending-up", text: `Relentlessly steep — ${gain} of gain packed into ${dist}. Pace yourself early.` };
    case "steep":
      return { icon: "trending-up", text: `Steep and sustained: ${gain} of gain over ${dist}.` };
    case "moderate":
      return { icon: "trending-up", text: `A steady climb — ${gain} of gain across ${dist}.` };
    case "gentle":
      return { icon: "trending-up", text: `Gentle grade — ${gain} of gain across ${dist}.` };
    case "flat":
      return { icon: "trending-up", text: `Almost no climbing across ${dist}.` };
  }
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
// Ordered most consequential first, because only the first few survive
// MAX_TIPS. The ordering is therefore a safety judgement, not a layout one:
// anything that could get somebody into trouble outranks anything that merely
// sets expectations.
//
// Coverage is measured, not guessed. Counts are trails carrying that tag out of
// 225: permit 19, multi-day 18, backpacking 17, coastal 17, remote 14,
// alpine 43, summit 43, glacier 8, desert 28, volcanic 8, wildlife 20,
// waterfall 23, lake 21, forest 25, iconic 15, family 41. The previous list
// covered seven tags and left the four most safety-relevant of these — remote,
// coastal, wildlife and volcanic — with nothing at all.
const TAG_TIPS: { tags: string[]; tip: TrailTip }[] = [
  { tags: ["permit"], tip: { icon: "file-text", text: "A permit is required — check availability before you travel." } },
  { tags: ["remote"], tip: { icon: "alert-triangle", text: "Remote, with no cell signal likely. Tell someone your route and a turnaround time." } },
  { tags: ["multi-day", "backpacking"], tip: { icon: "moon", text: "Planned as an overnight. Sort camp spots and permits ahead." } },
  { tags: ["coastal"], tip: { icon: "droplet", text: "Coastal route — check the tide table, as some sections close at high water." } },
  { tags: ["scramble"], tip: { icon: "alert-triangle", text: "Involves scrambling — you'll want both hands free." } },
  { tags: ["alpine", "summit", "glacier"], tip: { icon: "wind", text: "Exposed above the treeline, where weather turns fast." } },
  { tags: ["desert"], tip: { icon: "sun", text: "Little to no shade. Carry extra water and start at first light." } },
  { tags: ["volcanic"], tip: { icon: "alert-triangle", text: "Loose volcanic rock underfoot, and usually no water on route." } },
  { tags: ["wildlife"], tip: { icon: "eye", text: "Wildlife is regularly seen here — store food properly and keep your distance." } },
  { tags: ["waterfall", "lake"], tip: { icon: "droplet", text: "Expect wet rock, and check crossings after rain." } },
  { tags: ["forest"], tip: { icon: "feather", text: "Shaded for most of its length, which also means bugs in the warmer months." } },
  { tags: ["iconic"], tip: { icon: "users", text: "A well-known trail — the trailhead car park fills early on good days." } },
  { tags: ["family"], tip: { icon: "smile", text: "Manageable with children, though check the distance against their legs." } },
  { tags: ["dog-friendly"], tip: { icon: "heart", text: "Dogs are welcome — bring water for them too." } },
];

function tagTips(trail: TipTrail): TrailTip[] {
  const tags = (trail.tags ?? []).map(t => t.toLowerCase());
  if (tags.length === 0) return [];
  return TAG_TIPS.filter(entry => entry.tags.some(t => tags.includes(t))).map(e => e.tip);
}

// Takes no `unit` parameter on purpose: it labels a WEATHER reading, so it uses
// weather.unit -- the unit that reading was converted into -- not the viewer's
// current preference. The other tips read from `trail`, which is not refetched,
// so they correctly keep using buildTrailTips' `unit`.
function weatherTip(weather: TipWeather): TrailTip | null {
  if (!weather) return null;
  const condition = weather.condition.toLowerCase();
  // A missing temperature drops the degrees rather than printing a fabricated
  // one. The condition on its own is still worth saying, so the tip survives.
  const lead =
    weather.temp === null
      ? condition.charAt(0).toUpperCase() + condition.slice(1)
      : `${weather.temp}${temperatureUnitLabel(weather.unit)} and ${condition}`;
  return {
    icon: "cloud",
    text: weather.wet
      ? `${lead} right now — pack layers and expect slick footing.`
      : `${lead} at the trailhead right now.`,
    // This line IS weather data, so it is an attribution site in its own right,
    // and it now names the provider that actually answered rather than assuming
    // Open-Meteo. Covered by tests in both directions, because getting this
    // wrong either drops a licence-required credit or prints a false one.
    source: weather.source,
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
    weatherTip(weather),
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

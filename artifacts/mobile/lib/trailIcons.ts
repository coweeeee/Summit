import type { AvatarPresetKey } from "@/lib/avatars";

// Picks the icon shown beside a hike in a list, from that trail's tags.
//
// Hike rows used to carry the same trending-up glyph on every single row, which
// said nothing beyond "this is a hike" — and repeated the icon already used by
// the Climber badge and the "Hikes (N)" pill directly above them. That glyph
// stays where it means something (elevation gain on trail/hike detail, and
// aggregate markers like the badge and the pill); rows get something that
// varies instead, so the list is scannable.
//
// Reuses the avatar preset glyphs rather than introducing a second icon
// vocabulary. The import above is type-only, deliberately: this module stays
// free of runtime imports so it can be unit-tested under plain node without a
// bundler, and `AvatarPresetKey` makes a mistyped key a compile error rather
// than a blank square nobody notices.

/**
 * Used when a trail has no tags, no mappable tag, or no trail at all.
 *
 * Not an edge case: `hikes.trail_id` is nullable and a third of current rows
 * have no trail linked, so this is a state that has to look deliberate rather
 * than like something failed to load. A walking figure reads as "a hike" and is
 * visually distinct from the trending-up glyph it replaces.
 */
export const TRAIL_ICON_DEFAULT: AvatarPresetKey = "hiking";

/**
 * Tag → icon, in priority order. **Order is the whole design.**
 *
 * The tag vocabulary mixes two incompatible kinds. Some describe scenery and
 * map onto a glyph cleanly (Waterfall, Desert, Forest); others describe
 * character or logistics and have no sensible icon at all (Iconic, Permit,
 * Strenuous, Loop, Short, Day-hike). Trails routinely carry both.
 *
 * So this is scanned in order and the first *mappable* tag wins, rather than
 * reading whichever tag happens to sit first on the row. A trail tagged
 * ["Iconic", "Waterfall"] resolves to waves; picking tags[0] would have thrown
 * that away and fallen through to the default.
 *
 * Ordering runs most-specific first. Waterfall beats Lake because both are
 * water but a waterfall is the more distinctive thing to have seen; Glacier
 * beats Alpine for the same reason. Views is deliberately near the bottom
 * despite being by far the most common tag (87 of 225 trails) — leading with it
 * would give a third of the catalogue the same binoculars and rebuild exactly
 * the uniformity this is meant to fix.
 */
export const TRAIL_TAG_ICONS: ReadonlyArray<readonly [string, AvatarPresetKey]> = [
  ["Waterfall", "waves"],
  ["Glacier", "snowflake"],
  ["Arctic", "snowflake"],
  ["Volcanic", "campfire"],
  ["Desert", "cactus"],
  ["Cactus", "cactus"],
  ["Coastal", "island"],
  ["Beach", "island"],
  ["Lake", "waves"],
  ["River", "waves"],
  ["Hot-springs", "waves"],
  ["Forest", "pine-tree"],
  ["Old-growth", "pine-tree"],
  ["Wildflowers", "flower"],
  ["Prairie", "flower"],
  ["Meadow", "flower"],
  ["Wildlife", "paw"],
  ["Dog-friendly", "paw"],
  ["Birding", "owl"],
  ["Fungi", "mushroom"],
  ["Sunrise", "weather-sunset"],
  ["Sunset", "weather-sunset"],
  ["Backpacking", "bag-personal"],
  ["Multi-day", "tent"],
  ["Camping", "tent"],
  ["Remote", "compass"],
  ["Wilderness", "compass"],
  ["Summit", "terrain"],
  ["Alpine", "terrain"],
  ["High-altitude", "terrain"],
  ["Ridge-walk", "terrain"],
  ["Scramble", "terrain"],
  ["Canyon", "terrain"],
  ["Views", "binoculars"],
  ["Historic", "map"],
];

// Lower-cased once at module load. Tags are written by hand across three
// ingestion sources (manual seed, OpenStreetMap, USGS), so casing is not
// something to bet on.
const BY_TAG = new Map<string, AvatarPresetKey>(
  TRAIL_TAG_ICONS.map(([tag, key]) => [tag.toLowerCase(), key]),
);

/**
 * Resolve a trail's tags to a preset key. Never throws, always returns a key
 * that exists in AVATAR_PRESETS, so callers do not need a fallback branch.
 */
export function trailIconKey(tags: readonly (string | null | undefined)[] | null | undefined): AvatarPresetKey {
  if (!tags || tags.length === 0) return TRAIL_ICON_DEFAULT;

  // Iterating the priority list rather than the tags: the answer must depend on
  // which tag is most worth showing, not on the order they happen to be stored.
  for (const [tag, key] of TRAIL_TAG_ICONS) {
    const wanted = tag.toLowerCase();
    for (const candidate of tags) {
      if (typeof candidate === "string" && candidate.trim().toLowerCase() === wanted) {
        return key;
      }
    }
  }
  return TRAIL_ICON_DEFAULT;
}

/** Exported for the test that asserts the lookup and the list agree. */
export const _BY_TAG = BY_TAG;

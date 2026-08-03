import type { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import Colors from "@/constants/colors";

// Preset profile icons, for people who want a picture without uploading one.
//
// Stored in `profiles.avatar_preset` as the bare key ("pine-tree"), not as a
// rendered glyph or a colour — the key is the only stable part. Anything about
// how a preset *looks* is defined here and can be restyled later without a
// migration or a backfill.
//
// Presets and uploaded photos are mutually exclusive: setting one clears the
// other, so a row never says two contradictory things about what to render.
// `<Avatar>` still prefers avatar_url if both are somehow set, since an
// uploaded photo is the more specific claim about a person.

type IconName = ComponentProps<typeof MaterialCommunityIcons>["name"];

export type AvatarPreset = {
  key: string;
  icon: IconName;
  label: string;
  /** Drives both the glyph colour and, at low alpha, the disc behind it. */
  color: string;
};

/**
 * The picker grid, in display order. Twenty fills the grid's five columns
 * evenly; sixteen left one icon stranded on a row of its own.
 *
 * Every `icon` here is verified against the MaterialCommunityIcons glyphmap
 * shipped with @expo/vector-icons — a name that does not exist renders as a
 * blank box rather than throwing, so a typo is silent. `backpack` is the
 * obvious one to reach for and does *not* exist; MDI calls it `bag-personal`.
 */
export const AVATAR_PRESETS = [
  { key: "terrain",        icon: "terrain",        label: "Summit",    color: Colors.sky },
  { key: "pine-tree",      icon: "pine-tree",      label: "Pine",      color: Colors.green },
  { key: "tent",           icon: "tent",           label: "Camp",      color: Colors.amber },
  { key: "campfire",       icon: "campfire",       label: "Campfire",  color: Colors.red },
  { key: "hiking",         icon: "hiking",         label: "Hiker",     color: Colors.accent },
  { key: "bag-personal",   icon: "bag-personal",   label: "Pack",      color: Colors.amber2 },
  { key: "compass",        icon: "compass",        label: "Compass",   color: Colors.sky },
  { key: "binoculars",     icon: "binoculars",     label: "Lookout",   color: Colors.green2 },
  { key: "map",            icon: "map",            label: "Map",       color: Colors.amber },
  { key: "leaf",           icon: "leaf",           label: "Leaf",      color: Colors.green },
  { key: "mushroom",       icon: "mushroom",       label: "Mushroom",  color: Colors.red },
  { key: "paw",            icon: "paw",            label: "Paw",       color: Colors.amber2 },
  { key: "bird",           icon: "bird",           label: "Bird",      color: Colors.sky },
  { key: "waves",          icon: "waves",          label: "Water",     color: Colors.sky },
  { key: "snowflake",      icon: "snowflake",      label: "Snow",      color: Colors.text2 },
  { key: "weather-sunset", icon: "weather-sunset", label: "Sunset",    color: Colors.amber2 },
  { key: "cactus",         icon: "cactus",         label: "Cactus",    color: Colors.green2 },
  { key: "flower",         icon: "flower",         label: "Flower",    color: Colors.red },
  { key: "owl",            icon: "owl",            label: "Owl",       color: Colors.amber },
  { key: "island",         icon: "island",         label: "Island",    color: Colors.green },
] as const satisfies readonly AvatarPreset[];

/**
 * Union of the keys above, rather than plain `string`.
 *
 * This is what lets anything mapping *to* a preset — `lib/trailIcons.ts` — be
 * checked at compile time instead of failing silently at render. A mistyped
 * key stops being a blank icon nobody notices and becomes a type error.
 */
export type AvatarPresetKey = (typeof AVATAR_PRESETS)[number]["key"];

// Explicitly keyed by `string`, not by AvatarPresetKey. getAvatarPreset takes
// whatever the database holds, which may be a key this build has never heard
// of — that lookup returning undefined is the documented behaviour below, not
// something to type away.
const PRESETS_BY_KEY = new Map<string, AvatarPreset>(AVATAR_PRESETS.map(p => [p.key, p]));

/**
 * Resolve a stored key, or undefined if it is unknown.
 *
 * Undefined is a real case rather than a defensive flourish: a client that
 * predates a newly added preset will read a key it has never heard of, and
 * every caller falls back to initials instead of rendering nothing. So presets
 * can be added without shipping an app update first.
 */
export function getAvatarPreset(key: string | null | undefined): AvatarPreset | undefined {
  if (!key) return undefined;
  return PRESETS_BY_KEY.get(key);
}

/**
 * Background disc colours for the initials fallback.
 *
 * These are the five that the feed and Discover already used; the change is
 * only in how one gets picked.
 */
const INITIALS_COLORS = ["#2a3d2a", "#2d2a3d", "#3d2a2a", "#2a3340", "#3d3020"];

/**
 * Pick a stable colour for a user.
 *
 * Previously both call sites indexed this palette by the row's position in the
 * list (`AVATAR_COLORS[idx % len]`), which meant the colour described where
 * someone happened to appear rather than who they were: the same person was
 * one colour in the feed and another in Discover, and changed colour whenever
 * a list paginated or re-sorted. Hashing the id instead makes the colour a
 * property of the person, so it is consistent everywhere and across sessions.
 *
 * djb2. Not for anything but choosing between five colours.
 */
export function initialsColor(seed: string | null | undefined): string {
  if (!seed) return INITIALS_COLORS[0];
  let hash = 5381;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0;
  }
  return INITIALS_COLORS[Math.abs(hash) % INITIALS_COLORS.length];
}

/** Alpha suffix for the disc behind a preset glyph, matching the difficulty pills. */
export const PRESET_DISC_ALPHA = "26";

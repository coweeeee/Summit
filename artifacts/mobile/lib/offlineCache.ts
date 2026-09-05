// Offline cache for trail DETAIL data.
//
// Scope is deliberately half of the "offline packs" idea: trail data only, no
// map tiles. Tiles are a licensing decision (Apple and Google both restrict
// persisting their tiles) and a basemap migration; trail rows are ours, carry no
// third-party terms, and the whole 225-trail catalogue serialises to ~175 KB.
// See docs/feature-backlog-design-notes.md item 2.
//
// WHAT IS DELIBERATELY NOT CACHED, because caching it would be worse than the
// gap it fills:
//
//   PHOTOS. hike-photos is a private bucket served through signed URLs with a
//   1-hour TTL. A cached URL is not merely stale, it is GUARANTEED BROKEN by the
//   time offline use matters. Caching the bytes instead is possible but is a
//   different feature with a real storage budget; a hiker without signal needs
//   the distance and the water note, not the gallery.
//
//   WEATHER. "60F right now" read from cache is a false statement, and this
//   project has an explicit rule about that class of claim (lib/trailTips.ts:
//   "invented specifics are dangerous"). Weather is live-or-absent.
//
// NO EVICTION, and that is a considered choice rather than an omission. The
// corpus is bounded: a real entry measured on device is 798 bytes, so 225
// trails is ~175 KB even if a user visits every one. An LRU would be more code
// than the thing it guards, and would itself be a source of bugs. Re-measure
// this if the trails row grows, since it is the whole basis for not evicting.

export type CachedTrailDetail<T = unknown> = {
  trail: T;
  logCount: number;
  conditionSummary: unknown[];
  /** Epoch ms at write time. Drives the age label — never rendered as "live". */
  cachedAt: number;
};

/**
 * Version is IN THE KEY, not in the payload.
 *
 * A shape change must MISS rather than deserialize into the wrong type. Reading
 * a v1 payload as v2 gives a screen full of undefined, which looks like a data
 * bug rather than a cache bug and is far harder to trace than a cache miss.
 * Bump this whenever CachedTrailDetail changes.
 */
const KEY_PREFIX = "summit.trailDetail.v1.";

export const cacheKey = (trailId: string): string => `${KEY_PREFIX}${trailId}`;

/** Minimal surface, so tests can inject a fake without pulling in React Native. */
export type CacheStorage = {
  getItem: (k: string) => Promise<string | null>;
  setItem: (k: string, v: string) => Promise<void>;
  removeItem: (k: string) => Promise<void>;
};

let injected: CacheStorage | null = null;

/** Test seam. Production passes nothing and gets AsyncStorage. */
export function setCacheStorage(s: CacheStorage | null): void {
  injected = s;
}

function storage(): CacheStorage {
  if (injected) return injected;
  // Required lazily on purpose: a top-level import of AsyncStorage would make
  // this module unloadable under `node --test`, which is where its logic is
  // actually verified.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const AsyncStorage = require("@react-native-async-storage/async-storage").default;
  return AsyncStorage as CacheStorage;
}

/**
 * Read a cached trail. Returns null for a miss, malformed JSON, or a payload
 * that does not carry the fields the screen needs.
 *
 * Validates rather than trusting: storage is shared mutable state that survives
 * app upgrades, so a partially-written or hand-edited entry is a real
 * possibility and must degrade to a miss, never to a half-rendered screen.
 */
export async function readTrailDetail<T = unknown>(trailId: string): Promise<CachedTrailDetail<T> | null> {
  try {
    const raw = await storage().getItem(cacheKey(trailId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    if (!parsed.trail || typeof parsed.cachedAt !== "number") return null;
    return {
      trail: parsed.trail as T,
      logCount: typeof parsed.logCount === "number" ? parsed.logCount : 0,
      conditionSummary: Array.isArray(parsed.conditionSummary) ? parsed.conditionSummary : [],
      cachedAt: parsed.cachedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Write a trail to the cache. Never throws.
 *
 * A failed write — full disk, quota, storage disabled — must not take down the
 * screen the user is currently looking at successfully online. The cache is an
 * enhancement; the fetch already succeeded by the time this runs.
 */
export async function writeTrailDetail<T = unknown>(
  trailId: string,
  payload: Omit<CachedTrailDetail<T>, "cachedAt">,
  now: number = Date.now(),
): Promise<boolean> {
  try {
    await storage().setItem(
      cacheKey(trailId),
      JSON.stringify({ ...payload, cachedAt: now }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Human age for the offline banner.
 *
 * Always says SOMETHING, including for a just-written entry, because the point
 * is to mark the data as remembered rather than live. Rounds DOWN so the label
 * never overstates freshness — "2 hours ago" for something 2h59m old is the
 * safe direction to be wrong in.
 */
export function cacheAgeLabel(cachedAt: number, now: number = Date.now()): string {
  const mins = Math.floor((now - cachedAt) / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 minute ago";
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.floor(mins / 60);
  if (hours === 1) return "1 hour ago";
  if (hours < 24) return `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

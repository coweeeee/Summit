// What the trail was actually like, captured at log time.
//
// Useful with one hike in the database, unlike everything aggregate, which
// needs hundreds — which is why this was pulled out of the "Good to know"
// overhaul as its own smaller win.
//
// ── Stored as stable keys, not labels ────────────────────────────────────────
//
// `trails.tags` stores capitalised display strings ("Waterfall"), and this
// deliberately does not follow that precedent. Those tags arrived from external
// ingestion already worded; these are ours, and wording we choose is wording we
// will want to reword. Storing "snow_ice" means "Snow or ice" can become
// "Snow / ice underfoot" in a text edit, whereas storing the label would make
// every rewording a data migration over live rows. The mapping lives here so
// the two can never drift.

export type ConditionTag = {
  /** Stored in `hikes.conditions`. Never change these once rows exist. */
  key: string;
  label: string;
};

/**
 * The affirmative tag, and the reason it exists.
 *
 * Without it an empty array cannot distinguish "the trail was fine" from "this
 * person ignored the selector", which leaves any future aggregate with a
 * numerator and no denominator. It is cheap now and unrecoverable later — you
 * cannot retroactively decide what silence meant.
 */
export const GOOD_CONDITIONS_KEY = "good";

export const CONDITION_TAGS: readonly ConditionTag[] = [
  { key: GOOD_CONDITIONS_KEY, label: "Good conditions" },
  { key: "muddy",          label: "Muddy" },
  { key: "snow_ice",       label: "Snow or ice" },
  { key: "water_crossing", label: "Water crossing" },
  { key: "overgrown",      label: "Overgrown" },
  { key: "downed_trees",   label: "Downed trees" },
  { key: "washed_out",     label: "Washed out" },
  { key: "poorly_marked",  label: "Poorly marked" },
  { key: "bugs",           label: "Very buggy" },
  { key: "closed_section", label: "Closed section" },
] as const;

const BY_KEY = new Map(CONDITION_TAGS.map(t => [t.key, t]));

export function isConditionKey(key: string): boolean {
  return BY_KEY.has(key);
}

/**
 * Toggle one tag, keeping "Good conditions" mutually exclusive with the rest.
 *
 * Selecting "good" clears every hazard, and selecting any hazard clears "good".
 * Not cosmetic: "the trail was fine, also there were downed trees across it" is
 * not a state anyone means to record, and allowing it would poison exactly the
 * denominator the affirmative tag exists to provide.
 *
 * Returns a new array in vocabulary order, so two hikes tagged the same way
 * store the same array and nothing downstream has to sort before comparing.
 */
export function toggleConditionTag(current: readonly string[], key: string): string[] {
  if (!isConditionKey(key)) return [...current];

  const held = new Set(current.filter(isConditionKey));

  if (held.has(key)) {
    held.delete(key);
  } else if (key === GOOD_CONDITIONS_KEY) {
    held.clear();
    held.add(GOOD_CONDITIONS_KEY);
  } else {
    held.delete(GOOD_CONDITIONS_KEY);
    held.add(key);
  }

  return CONDITION_TAGS.filter(t => held.has(t.key)).map(t => t.key);
}

/**
 * Display labels for stored keys, in vocabulary order.
 *
 * Unknown keys are dropped rather than shown raw. A key that is not in the
 * vocabulary is either from a newer client or a retired tag; rendering
 * "washed_out_2" at somebody would be worse than rendering nothing.
 */
export function conditionLabels(keys: readonly string[] | null | undefined): string[] {
  if (!keys || keys.length === 0) return [];
  const held = new Set(keys);
  return CONDITION_TAGS.filter(t => held.has(t.key)).map(t => t.label);
}

/** True when the hiker said the trail was fine, as opposed to saying nothing. */
export function reportedGoodConditions(keys: readonly string[] | null | undefined): boolean {
  return !!keys && keys.includes(GOOD_CONDITIONS_KEY);
}

/** True when the hiker recorded at least one real hazard. */
export function reportedAnyIssue(keys: readonly string[] | null | undefined): boolean {
  return !!keys && keys.some(k => k !== GOOD_CONDITIONS_KEY && isConditionKey(k));
}

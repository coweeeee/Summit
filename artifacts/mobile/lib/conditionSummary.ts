// Turning the aggregate condition view into something readable.
//
// The privacy rules live in supabase/trail-conditions-summary.sql, not here —
// a client-side guard is one anyone can query around. This module only decides
// wording, and it is built so that it *cannot* say more than the view gave it:
// there are no counts in the input, so there are none to leak.

import { CONDITION_TAGS, GOOD_CONDITIONS_KEY } from "./trailConditions.ts";

/** A row of public.trail_conditions_summary. Deliberately has no counts and no user. */
export type ConditionSummaryRow = {
  tag: string;
  prevalence: string;
};

export type SummarisedCondition = {
  key: string;
  label: string;
  /** "most" reads stronger than "some"; both are bands, never figures. */
  prevalence: "most" | "some";
  /** Phrasing for display, already band-aware. */
  text: string;
  /** True for the affirmative tag, which is reassurance rather than warning. */
  reassuring: boolean;
};

const LABELS = new Map(CONDITION_TAGS.map(t => [t.key, t.label]));

function phrase(label: string, prevalence: "most" | "some", reassuring: boolean): string {
  if (reassuring) {
    return prevalence === "most"
      ? "Most recent hikers said conditions were good"
      : "Some recent hikers said conditions were good";
  }
  // Lower-cased because the label leads a sentence fragment here rather than
  // standing alone as a chip.
  const subject = label.toLowerCase();
  return prevalence === "most"
    ? `Most recent hikers reported ${subject}`
    : `Some recent hikers reported ${subject}`;
}

/**
 * Order and phrase the view's rows.
 *
 * Unknown tags are dropped rather than shown raw — a key not in the vocabulary
 * is a retired tag or one from a newer client, and rendering "washed_out_2" at
 * somebody is worse than rendering nothing.
 *
 * Hazards lead and the affirmative tag goes last. A trail can legitimately show
 * both: the tags are mutually exclusive *per hike*, not across hikers, so "most
 * said conditions were good" and "some reported mud" is a coherent and useful
 * pair rather than a contradiction.
 */
export function summariseConditions(rows: ConditionSummaryRow[] | null | undefined): SummarisedCondition[] {
  if (!rows || rows.length === 0) return [];

  const seen = new Set<string>();
  const out: SummarisedCondition[] = [];

  for (const tag of CONDITION_TAGS) {
    const row = rows.find(r => r.tag === tag.key);
    if (!row || seen.has(tag.key)) continue;
    if (row.prevalence !== "most" && row.prevalence !== "some") continue;
    seen.add(tag.key);

    const reassuring = tag.key === GOOD_CONDITIONS_KEY;
    out.push({
      key: tag.key,
      label: LABELS.get(tag.key) ?? tag.label,
      prevalence: row.prevalence,
      text: phrase(tag.label, row.prevalence, reassuring),
      reassuring,
    });
  }

  // Hazards first, affirmative last, and "most" above "some" within each group.
  return out.sort((a, b) => {
    if (a.reassuring !== b.reassuring) return a.reassuring ? 1 : -1;
    if (a.prevalence !== b.prevalence) return a.prevalence === "most" ? -1 : 1;
    return 0;
  });
}

/**
 * The one-line caveat that has to accompany any of this on screen.
 *
 * Not decoration. The summary is a 90-day window over whoever happened to log,
 * and it is viewer-dependent because the underlying view runs under the
 * reader's own row-level permissions. Presenting it as "the conditions" rather
 * than "what recent hikers said" would overclaim in both directions.
 */
export const CONDITION_SUMMARY_CAVEAT = "From hikes logged here in the last 90 days.";

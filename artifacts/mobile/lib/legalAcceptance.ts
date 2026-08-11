import { LEGAL_TERMS_VERSION } from "../constants/legal.ts";

// Whether a signed-in user still needs to accept the current legal documents.
//
// Where acceptance actually lives: signUp passes terms_version and
// terms_accepted_at through `options.data`, which Supabase writes into
// auth.users.raw_user_meta_data -- NOT into profiles. profiles has no terms
// column at all. So the only record of what anyone agreed to is auth metadata,
// readable client-side as session.user.user_metadata.
//
// That has a consequence worth stating plainly: user metadata is writable by
// the user it belongs to, so this is a re-prompt gate, not a tamper-proof
// audit trail. An append-only server-side table would be needed for the
// latter, and this deliberately does not pretend to be one.

/**
 * The legal version this user last accepted, or null if none is recorded.
 *
 * Defensive about shape because the value comes from a JSON blob rather than a
 * typed column: anything that is not a non-empty string reads as "no record".
 */
export function acceptedVersionFrom(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object") return null;
  const value = (metadata as Record<string, unknown>).terms_version;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * True when the user must accept before continuing.
 *
 * A missing version counts as "not accepted" rather than being waved through.
 * Those are the only two states that matter here, and treating an absent
 * record as acceptance is exactly how an account that never agreed to anything
 * would slip past silently.
 */
export function needsReacceptance(
  accepted: string | null,
  current: string = LEGAL_TERMS_VERSION
): boolean {
  return accepted !== current;
}

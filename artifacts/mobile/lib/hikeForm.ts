// Input helpers shared by the log and edit hike forms.
//
// Extracted from log.tsx when the edit screen appeared rather than copied into
// it: these enforce what a hike field is allowed to contain, and two versions
// of that rule drifting apart is how the same value ends up valid on one screen
// and rejected on the other.

export const DIFFICULTIES = ["Easy", "Moderate", "Hard", "Expert"];

/** Ten years back, for the year shortcuts above the iOS date spinner. */
export const YEAR_OPTIONS = Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i);

/**
 * Move a date to another year, keeping month, day and time.
 *
 * Clamps the day first, so 29 Feb into a non-leap year lands on 28 Feb rather
 * than silently rolling over into March. Never returns a future date — a hike
 * you have not been on yet is not a thing.
 */
export function withYear(date: Date, year: number): Date {
  const next = new Date(date);
  const daysInTargetMonth = new Date(year, next.getMonth() + 1, 0).getDate();
  next.setDate(Math.min(next.getDate(), daysInTargetMonth));
  next.setFullYear(year);
  return next > new Date() ? new Date() : next;
}

/** Digits and at most one decimal point. Extra points are folded in, not dropped. */
export function filterDecimal(val: string): string {
  const cleaned = val.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");
  return parts.length > 2 ? parts[0] + "." + parts.slice(1).join("") : cleaned;
}

/** Digits only. */
export function filterInteger(val: string): string {
  return val.replace(/[^0-9]/g, "");
}

/**
 * A whole-number field the user is allowed to leave empty. Null for blank.
 *
 * Blank returning null is the entire point. Both forms previously did
 * `parseInt(elevationStr) || 0`, so an empty elevation stored 0 — and 0 is a
 * real elevation. That collapsed "I didn't record this" and "this trail is
 * flat" into one value the schema can never tell apart again, which is why
 * hike detail has to hide its elevation stat entirely rather than risk
 * describing an unfilled hike as flat.
 *
 * `|| 0` also swallowed genuine nonsense — a field containing "abc" became 0
 * rather than being treated as absent. NaN returns null here too: unknown, not
 * zero.
 */
export function parseOptionalInt(val: string): number | null {
  const trimmed = val.trim();
  if (trimmed === "") return null;
  const parsed = parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

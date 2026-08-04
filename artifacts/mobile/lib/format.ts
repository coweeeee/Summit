import Colors from "@/constants/colors";

// Presentation helpers that were previously copy-pasted per screen. The copies
// had already drifted — `getDiffColor` was missing the "expert" case on the two
// profile screens, and `timeAgo` was missing the days branch in hike-detail, so
// a three-day-old comment there read "72h ago". These are the superset versions.

export function getInitials(name: string | null | undefined): string {
  // Several screens resolve a name to a string before rendering, so what
  // arrives here may already be a handle ("@lena") or the anonymous label. The
  // sigil is not an initial, and "AH" would read as somebody's real initials.
  if (!name || name === ANONYMOUS_LABEL) return "?";
  const initials = name
    .replace(/^@/, "")
    .split(" ")
    .map(w => w[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return initials || "?";
}

/** Anything with a name and/or handle. Screens select different column sets. */
export type NameableProfile = {
  full_name?: string | null;
  username?: string | null;
} | null | undefined;

/**
 * How another user is labelled anywhere in the app: real name, else their
 * handle, else a last resort.
 *
 * Signup has required a username since the current flow shipped, so the final
 * fallback only ever applies to accounts provisioned outside the app. Before
 * this existed, six different strings covered this one case — "Anonymous
 * Hiker", "Anonymous", "Someone", "this user", "Profile" and "Your Name" —
 * and screens that never selected `username` showed "Anonymous Hiker" even
 * for users who had a perfectly good handle.
 */
export const ANONYMOUS_LABEL = "Anonymous Hiker";

export function displayName(profile: NameableProfile): string {
  const name = profile?.full_name?.trim();
  if (name) return name;
  const handle = profile?.username?.trim();
  if (handle) return `@${handle}`;
  return ANONYMOUS_LABEL;
}

/**
 * Avatar initials matching `displayName`. Deliberately returns "?" rather than
 * "AH" when there is nothing to work with — fake initials read as a real
 * person's, whereas "?" reads as missing.
 */
export function profileInitials(profile: NameableProfile): string {
  const name = profile?.full_name?.trim();
  if (name) return getInitials(name);
  const handle = profile?.username?.trim();
  if (handle) return getInitials(handle);
  return "?";
}

export function getDiffColor(diff: string | null | undefined): string {
  switch (diff?.toLowerCase()) {
    case "easy": return Colors.green;
    case "moderate": return Colors.amber;
    case "hard": return Colors.red;
    case "expert": return "#a855d4";
    default: return Colors.text3;
  }
}

/**
 * Badge styling for a difficulty — background, text and border.
 *
 * Lives here beside getDiffColor because two private copies of this existed
 * (trail-detail.tsx and discover.tsx) and both had drifted: their `default:`
 * returned the *easy* palette, so a trail with a missing or unrecognised
 * difficulty rendered as an easy trail. On the one field that is a safety
 * signal, guessing "easy" is the wrong way to be wrong. The default is now
 * neutral, matching getDiffColor.
 *
 * Returns null when there is no difficulty to show, so callers can omit the
 * badge rather than render an empty pill.
 */
export function getDiffStyle(diff: string | null | undefined): { bg: string; color: string; border: string } | null {
  switch (diff?.toLowerCase()) {
    case "easy":     return { bg: "rgba(109,184,122,0.2)", color: Colors.green, border: "rgba(109,184,122,0.5)" };
    case "moderate": return { bg: "rgba(212,148,58,0.2)",  color: Colors.amber, border: "rgba(212,148,58,0.5)" };
    case "hard":     return { bg: "rgba(196,96,96,0.2)",   color: Colors.red,   border: "rgba(196,96,96,0.5)" };
    case "expert":   return { bg: "rgba(160,80,200,0.2)",  color: "#a855d4",    border: "rgba(160,80,200,0.5)" };
    default:         return null;
  }
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatShortDate(dateStr);
}

/** "Jul 26" — for dense list rows. */
export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** "Jul 26, 2026" — for detail views where the year matters. */
export function formatFullDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** "Jul 26, 2026 · 6:30 AM" — for the hike start-time picker. */
export function formatDateTime(date: Date): string {
  const time = date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${formatFullDate(date)} · ${time}`;
}

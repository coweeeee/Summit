import Colors from "@/constants/colors";

// Presentation helpers that were previously copy-pasted per screen. The copies
// had already drifted — `getDiffColor` was missing the "expert" case on the two
// profile screens, and `timeAgo` was missing the days branch in hike-detail, so
// a three-day-old comment there read "72h ago". These are the superset versions.

export function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const initials = name
    .split(" ")
    .map(w => w[0])
    .filter(Boolean)
    .join("")
    .toUpperCase()
    .slice(0, 2);
  return initials || "?";
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

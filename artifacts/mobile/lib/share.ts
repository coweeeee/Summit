import Constants from "expo-constants";
import { Share } from "react-native";

// Sharing, via the OS share sheet.
//
// The link is an https:// URL to the landing site rather than a summit://
// deep link, because the entire point is reaching people who do not have the
// app. A custom scheme does nothing on a device without Summit installed,
// which is exactly the audience profile sharing exists for.
//
// Share.share is React Native's built-in -- no dependency needed.

/**
 * The deployed landing site, from `extra.shareBaseUrl` in app.json.
 *
 * Config rather than a .env entry, because .env is gitignored: as an
 * EXPO_PUBLIC_ variable this worked on one machine and silently left every
 * fresh clone and EAS build with no share buttons at all. It is a public
 * landing page URL, so there is nothing to keep out of the repo.
 *
 * Empty means sharing is hidden rather than degraded -- a share button that
 * hands someone a link to nowhere is worse than no share button.
 */
export const SHARE_BASE_URL = String(
  (Constants.expoConfig?.extra as { shareBaseUrl?: string } | undefined)?.shareBaseUrl ?? ""
).replace(/\/$/, "");

export const sharingAvailable = SHARE_BASE_URL.length > 0;

export type ShareKind = "profile" | "hike" | "trail";

const ROUTE_PREFIX: Record<ShareKind, string> = {
  profile: "u",
  hike: "h",
  trail: "t",
};

export function shareUrlFor(kind: ShareKind, id: string): string | null {
  if (!sharingAvailable) return null;
  return `${SHARE_BASE_URL}/${ROUTE_PREFIX[kind]}/${encodeURIComponent(id)}`;
}

/**
 * Returns false when there is nothing to share -- no configured base URL, or a
 * missing id. Callers use that to decide whether to offer the action at all.
 *
 * The message deliberately omits the URL: iOS puts `url` in its own field and
 * repeating it there produces the link twice in Messages.
 */
export async function shareEntity(kind: ShareKind, id: string | null | undefined, message: string): Promise<boolean> {
  if (!id) return false;
  const url = shareUrlFor(kind, id);
  if (!url) return false;

  try {
    await Share.share({ message, url, title: message });
    return true;
  } catch {
    // Dismissing the sheet rejects on some platforms; that is not a failure
    // worth surfacing to the user.
    return false;
  }
}

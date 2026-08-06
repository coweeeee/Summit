import Constants from "expo-constants";

// Rating the app, via a link to the App Store review form.
//
// A plain https:// link rather than expo-store-review, for two reasons.
//
// Apple's own guidance for a settings row is a persistent product-page link
// with ?action=write-review, and explicitly says not to call requestReview()
// from a button tap -- it may show nothing at all, and is capped at three
// prompts per year per device. A Settings row that usually does nothing is
// worse than no row. requestReview() is for contextual moments (say, a user's
// tenth logged hike), not a menu item.
//
// The other reason is that expo-store-review is a native module. Adding it
// forces a pod install and a full native rebuild, and would buy nothing today:
// in a development build Apple always displays the dialog, so the row would
// look like it works while the rating went nowhere.
//
// Linking is React Native's built-in -- no dependency needed.

/**
 * Summit's numeric App Store ID, from `extra.appStoreId` in app.json.
 *
 * Empty until the app has a record in App Store Connect, which is where Apple
 * mints this id. Nothing in the repo can supply it early, so this is blocked
 * on Apple rather than on us -- but the code can be written now and left
 * correctly inert. The day the id exists it is a one-line app.json edit, read
 * at runtime through Constants, with no code change and no rebuild.
 *
 * Config rather than a .env entry, for the same reason as shareBaseUrl: .env
 * is gitignored, so an EXPO_PUBLIC_ variable would work on one machine and
 * leave every fresh clone and EAS build without the feature. An App Store id
 * is public anyway -- it is in the store URL.
 *
 * Empty means the row is hidden rather than degraded. A "Rate Summit" row that
 * dead-taps, or apologises for not being ready, is worse than no row.
 */
export const APP_STORE_ID = String(
  (Constants.expoConfig?.extra as { appStoreId?: string } | undefined)?.appStoreId ?? ""
).trim();

export const ratingAvailable = APP_STORE_ID.length > 0;

/**
 * Deep link to the App Store review composer for Summit.
 *
 * Returns null when there is no configured id, so callers decide whether to
 * offer the action at all rather than opening a link to nowhere.
 */
export function reviewUrl(): string | null {
  if (!ratingAvailable) return null;
  return `https://apps.apple.com/app/id${encodeURIComponent(APP_STORE_ID)}?action=write-review`;
}

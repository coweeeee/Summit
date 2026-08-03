# Summit — project context for Claude Code

Summit is a social hiking-log app (think Strava/AllTrails/Letterboxd hybrid) built with React Native/Expo, backed by Supabase. This file is a handoff from a long planning/build session done through a different tool — read it fully before making changes, since a lot of non-obvious backend work already exists that the app code depends on.

## Stack

- React Native / Expo (SDK 54), Expo Router
- Supabase: Postgres, Auth, Storage, Edge Functions
- Supabase project: `summit`, ref `sigupaldsyuaomgllyvw`, region `us-east-1`, **free tier** (auto-pauses after ~1 week of inactivity — if API calls start failing mysteriously, check whether the project went `INACTIVE` in the Supabase dashboard and restore it before debugging code)
- A second, currently-empty Supabase project `summit-dev` (ref differs) exists as a placeholder for an eventual dev/prod split — nothing is wired to it yet, ignore it unless asked to set that up

## Database shape

Core tables: `profiles`, `trails`, `hikes`, `comments`, `likes`, `follows`, `hike_photos`, `want_to_hike`, `push_tokens`, `dim_ratings`, `blocks`, `reports`, `user_badges`, `trail_requests`.

`saved_hikes` was **dropped** — it had zero rows and zero client references, a leftover of the removed save-a-hike-log feature. Don't re-add it.

`profiles.avatar_preset` (text, nullable) holds a preset-icon key (`pine-tree`, `terrain`, …) defined in `lib/avatars.ts`. It is **mutually exclusive with `avatar_url`**: the Settings picker clears whichever one you didn't just choose, so a row never carries both. Read it only through `<Avatar>` — see the shared modules section.

Views: `trail_rating_stats` (avg_rating/rating_count computed from `hikes.overall_score`, not the old static `trails.rating`), `trails_with_ratings` (all of `trails` plus `effective_rating`/`rating_count` — Discover's "Top Rated" sort uses this).

Database functions:
- `is_username_available(check_username text) returns boolean` — `SECURITY DEFINER`; used at signup. Compares `lower(username)`, matching the `profiles_username_lower_key` unique index.
- `get_email_for_username(lookup_username text) returns text` — `SECURITY DEFINER`, **`service_role` only. Do not re-grant this to `anon` or `authenticated`.** It used to be anon-callable, which — combined with the anon-callable `is_username_available` for enumerating usernames, and an anon key that is public by design and ships inside the app bundle — let anyone turn a username into that account's email address. EXECUTE is revoked from `PUBLIC`, `anon` and `authenticated`; the only caller is the `login-with-username` edge function, which resolves the email server-side and returns nothing but a session.
- `is_blocked_by(other_user_id uuid) returns boolean` — `SECURITY DEFINER`; true when `other_user_id` has blocked the caller. Exists because RLS on `blocks` is `auth.uid() = blocker_id`, so a plain select can only ever answer "have *I* blocked them" — without this RPC a profile that blocked you is indistinguishable from an empty one. Used by `user-profile.tsx`. **`hike-detail.tsx` does not use it yet**, so its comment filter still only hides comments from people the viewer blocked, not the reverse.
- `can_view_user_content(content_owner_id uuid) returns boolean` — **`SECURITY INVOKER`**, not definer. The single visibility gate used inside RLS policies; see the security model section below.
- `find_similar_trails(search_name text)` — `SECURITY INVOKER`; trigram fuzzy match backing the "can't find your trail" duplicate check

Edge functions (Deno, deployed):
- `delete-account` — verify_jwt true; deletes the caller's storage files then calls `auth.admin.deleteUser`, which cascades through every table via FK constraints back to `auth.users`
- `send-notification` — verify_jwt true; takes `{ targetUserId, type: 'like'|'follow'|'comment'|'milestone', title, body, data, badgeKey?, hikeId? }`. Verifies the underlying action actually happened (a real like/follow row, or self-reporting your own milestone) before sending, checks the target's `notif_*` preference, fetches their `push_tokens`, sends via Expo's push API. Call it client-side right after the relevant insert succeeds — there is no DB trigger doing this automatically.
- `login-with-username` — **verify_jwt false**, because callers are by definition not signed in. Takes `{ username, password }`, resolves the email with the service role, signs in through a plain anon client so GoTrue's own rate limiting still applies, and returns only a session. An unknown username and a wrong password return an identical response, so it is not a username-enumeration oracle. Email login stays client-side — there is no email to protect, and routing it here would take all logins down whenever the function is down.
- `report-alert` — **verify_jwt false**; called by a Database Webhook on `reports` INSERT and forwards a summary to a Slack/Discord incoming webhook (`REPORT_ALERT_WEBHOOK_URL` secret). verify_jwt would be useless here since any signed-in user's JWT satisfies it; instead it exact-matches a shared secret. Note the runtime's `SUPABASE_SERVICE_ROLE_KEY` is the **new-format `sb_secret_...` key**, while a dashboard-created webhook stores the **legacy service-role JWT** — different credentials, which is why it 401'd until a dedicated `REPORT_ALERT_SECRET` was used instead.
- `share-preview` — **verify_jwt false**; backs the public share pages. Reads with the service role and returns an explicitly whitelisted set of fields for `?type=profile|hike|trail`. Private accounts are excluded, and missing/private/owned-by-private all return an identical `{ok:false}`.

Storage buckets: `avatars`, `hike-photos`, both public, path convention `${userId}/filename` (or `${userId}/${hikeId}_${index}.ext` for hike photos). Public bucket listing policies were deliberately removed — direct URL reads still work fine. INSERT, UPDATE and DELETE policies all key on `(auth.uid())::text = (storage.foldername(name))[1]`.

**Uploading: use `lib/upload.ts`, never `fetch(uri).blob().arrayBuffer()`.** React Native's Blob implements only `size`, `type` and `slice()` — there is no `arrayBuffer()`. Both upload paths did this originally, threw a TypeError, swallowed it into a generic alert, and neither bucket had ever received a single object. The helper asks ImagePicker for base64 and decodes it with a lookup table.

## Security model — read this before touching RLS

`anon` (unauthenticated) has **zero** standing privileges on any public table — not SELECT, not INSERT, nothing. This was a deliberate "require sign-in for everything" decision made mid-project; twice during the session it turned out a revoke had been incomplete (first only SELECT was revoked, then a later audit found INSERT/UPDATE/DELETE/TRUNCATE were still granted) — if you ever add a new table, explicitly `REVOKE ALL ... FROM anon` or just don't grant anything to anon in the first place, and grant scoped access to `authenticated` via RLS policies instead. The one remaining pre-login RPC is `is_username_available`, which leaks nothing beyond a boolean. `get_email_for_username` **used to be the second one and no longer is** — see the note on it above. Anything else that needs to work pre-auth should be an edge function with `verify_jwt: false` doing its own narrow check, which is the pattern `login-with-username` and `share-preview` follow, rather than a new anon grant.

Private accounts: `profiles.is_private` (default false). `follows.status` is `'pending'` or `'accepted'` (default accepted, for backward compatibility with pre-existing rows). Following a public account inserts `status: 'accepted'` directly; following a private account must insert `status: 'pending'` — **the database enforces this itself** via the `Send follow or follow request matching target privacy` RLS WITH CHECK policy, so don't try to bypass it client-side. Note the column default is `'accepted'`, so any insert that omits `status` will be **rejected** when the target is private — always set it explicitly.

`can_view_user_content()` is the single visibility gate. It returns false when the viewer and the owner have blocked each other **in either direction**, and false for a private owner the viewer doesn't have an accepted follow with. It gates SELECT on `hikes`, `comments`, `likes`, `hike_photos`, `dim_ratings` and `want_to_hike`. Blocking and privacy are therefore enforced server-side everywhere — **do not add per-screen client-side block filtering**; it's redundant and, when applied after pagination, makes pages render short.

One deliberate consequence: the leaderboard is **viewer-dependent**. A private account's hikes only count toward their totals for people who follow them, so two users can see different rankings. That is correct behavior — don't "fix" it.

`profiles` SELECT is still `using (true)` for `authenticated` (needed by the Blocked Accounts list and people search), so a blocked user's name/avatar/bio remain visible even though their content is not.

## What's built (roughly chronological)

- Expo Go stability: env-var Supabase config, auth session timeout+retry, `isExpoGo` guards around `expo-notifications`/`react-native-webview`/`react-native-maps`
- Feed: FlatList + server-side pagination (`PAGE_SIZE = 20`), `expo-image`
- Discover: FlatList + server-side filtering/search/pagination, region filter, map view, difficulty filter + tag filter. Tag chips are derived from real distinct `tags` values (`fetchCategoryFilters` in `discover.tsx`) — confirmed landed.
- Leaderboard tab (`app/(tabs)/leaderboard.tsx`): Most Hikes / Most Miles / Most Elevation, all-time or last 7 days. Aggregation happens in the `leaderboard_totals(since timestamptz)` RPC, **which must stay `SECURITY INVOKER`** — that is what keeps RLS evaluating as the viewer and preserves the intended viewer-dependent behaviour. Making it `SECURITY DEFINER` would leak private users' hikes into everyone's rankings. A "Top Rated" category was removed: it ranked people by the average score they gave their own hikes, which is self-reported and, at one or two hikes each, dominated by a single 5-star entry.
- Trail catalog: 225 trails (manually seeded + OpenStreetMap via Overpass API + USGS National Map ingestion scripts — see `ingest_osm_trails.js` / `ingest_usgs_trails.js` if present in the repo, they're standalone Node scripts, not deployed anywhere). Deduped multiple times (FK-safely repointed `hikes.trail_id`/`want_to_hike.trail_id` before deleting losers). Difficulty/description backfilled for the 6 USGS trails that came in without them.
- Trail bookmarking (`want_to_hike`) is the *only* "saved" concept — an earlier "save this hike log" feature was explicitly removed per product direction; if you see any lingering save-a-specific-hike-log UI, that's a regression, remove it
- Account deletion: Settings → Danger Zone → type-DELETE-to-confirm modal → calls `delete-account`
- Content moderation: report (posts/comments) + block (users). Mutual hiding of *content* is enforced in `can_view_user_content` (see security model). `hike-detail.tsx` still filters comment authors client-side, and that is **not** redundant: the `comments` SELECT policy gates on the hike's owner, not on the commenter. Blocked Accounts list lives in **Settings → Privacy**, not as a public profile tab (Instagram pattern, not a Twitter/X-style visible block list)
- Settings are now actually functional (they weren't, originally — a full audit found the units toggle and all notification toggles were local-state-only and did nothing):
  - `profiles.distance_unit` ('imperial'|'metric') persisted. `lib/units.ts` is the single source of truth: `formatDistance`/`formatElevation` for display, `distanceToMiles`/`elevationToFeet` and their inverses for input, `distanceUnitLabel`/`elevationUnitLabel` for captions. DB values always stay in miles/feet — the log form converts on the way in and out, so a metric user types km and gets miles stored. Never hardcode a unit string.
  - `profiles.notif_likes` / `notif_follows` / `notif_milestones` / `notif_comments` persisted, wired to `send-notification`
  - Settings reseeds its controls from `profile` via `useEffect`, since `profile` can arrive after the screen mounts
- Badges: Climber, Explorer (5 hikes), Summit (10 hikes), Trailblazer (25 hikes), Early Bird (hike started before 7 AM local — required adding a real start-time picker to `log.tsx`, since it previously only captured a date). Server-recorded in `user_badges`, idempotent, notification sent on first award. **`lib/badges.ts` is the single source of truth** for thresholds, checks, and copy (`name`, `describe(unit)`, `announce(unit)`, `badgeProgress()`); `profile.tsx` supplies only icon/colour. The notifications list reads awarded badges from `user_badges`, not from a recomputed hike count.
- Notification taps deep-link to the relevant hike or profile screen
- Signup: single screen, username required upfront (checked live via `is_username_available`), email, password. Note signup has **no full-name field** — it passes the username as `full_name` too, so new accounts display their username as their name.
- Login: accepts email or username
- Usernames: `lib/username.ts` holds the rules (regex, normalization). **`AuthContext.claimUsername` is the only supported write path** — it normalizes to lowercase, validates, and checks availability before writing. Settings and signup both go through it; don't write `profiles.username` directly. Uniqueness is enforced case-insensitively by `profiles_username_lower_key` (a unique index on `lower(username)`), matching how `is_username_available` and `get_email_for_username` compare.
- Ratings: `trail_rating_stats`/`trails_with_ratings` wired into Discover cards, map callouts, and trail-detail — shows real "4.6 (23 ratings)" instead of a static number
- Private accounts: backend and app-side are both done — Settings toggle, Follow/Requested/Following button state, follow-requests inbox with Accept/Decline in `notifications.tsx`, and the gated private-profile wall in `user-profile.tsx`
- Duration-optional hike logging (`skipDuration` in `log.tsx`, stored as null rather than 0) and the `trail_requests` "can't find your trail" flow with `find_similar_trails` duplicate detection — both confirmed landed

## Build and test loop

**Expo Go is no longer the test loop — there is a local dev client.** Built with `npx expo prebuild -p ios` then `npx expo run:ios`, needing Xcode and CocoaPods. `ios/` and `android/` are gitignored, so prebuild output is never committed and `app.json` stays the source of truth; regenerate with `--clean` rather than hand-editing native files.

This matters because Expo Go silently disabled real features: `react-native-maps` was null so Discover's map tab was dead, and `expo-notifications` cannot register a push token there at all.

Two `app.json` values are baked into the binary and painful to change later — `scheme`/`slug` are `summit` (they were the generic `mobile`), and `ios.bundleIdentifier`/`android.package` are `com.coweeeee.summit`. Set them before any first build, not after.

`pnpm-workspace.yaml` used to exclude every non-`linux-x64` platform binary under a `# replit uses linux-x64 only` comment. On Apple Silicon that excluded exactly the binary needed — `lightningcss` had no `darwin-arm64` build, so Expo web could not bundle CSS at all. All five `darwin-arm64` exclusions are removed; don't reinstate them.

## Sharing (Phase 1)

`web/` is a standalone Vercel project — **deliberately outside the pnpm workspace** (the globs are `artifacts/*`, `lib/*`, `scripts`), so it installs independently with npm and cannot disturb the mobile dependency graph. It has its own `tsconfig.json`, needed because `@vercel/og` uses JSX and no config above it applies.

Deployed at `https://summit-api-server.vercel.app`, serving `/u/:username`, `/h/:id` and `/t/:id`. Each page is server-rendered so its Open Graph tags can be per-record — that is the whole mechanism by which iMessage and friends show a preview card. All data comes from `share-preview`; the web project holds no keys. Everything interpolated into the HTML is escaped, since display names and bios are free text rendered to strangers.

The share base URL lives in `app.json` under `extra.shareBaseUrl`, **not** in `.env` — as an `EXPO_PUBLIC_` variable it worked on one machine and left every fresh clone with no share buttons and no explanation. `lib/share.ts` hides sharing entirely when it is unset.

Phase 2 (Universal Links / App Links, so links open the app directly) is **blocked on a paid Apple Developer account** — the associated-domains entitlement requires one. Phase 3 (in-app image cards) matters only for Instagram Stories, which ignores Open Graph.

## Shared modules — use these rather than re-implementing

- `lib/units.ts` — distance/elevation formatting and conversion. Storage is always miles/feet.
- `lib/format.ts` — `displayName()`, `profileInitials()`, `timeAgo()`, date formatting.
- `lib/avatars.ts` + `components/Avatar.tsx` — **every avatar in the app.** `<Avatar profile={p} size={n} />`, optionally `ringWidth`/`ringColor`. Precedence is photo, then preset, then initials. Do not hand-roll `avatar_url ? <Image> : <initials>` again: seven screens did, and two of them (the feed and Discover People) never rendered `avatar_url` at all, so uploading a picture appeared to do nothing on the two screens where people are seen most. The initials disc colour is hashed from the user id — it used to be indexed by list position, which made the same person a different colour per screen. Any query feeding an avatar must select `avatar_url, avatar_preset` *and* `id`.
- `lib/badges.ts` — thresholds, checks and copy.
- `lib/username.ts` — regex and normalization; write usernames only via `AuthContext.claimUsername`.
- `lib/upload.ts` — image upload; see the Blob note under Storage.
- `lib/actionSheet.ts` — the "..." overflow menu. `ActionSheetIOS` on iOS, `Alert` on Android. Every card, profile, comment and hike detail uses it; there is no flag icon anywhere any more.
- `lib/trailTips.ts` — the "Good to know" tips, derived from elevation-per-mile, distance, tags and live weather. These were three identical hardcoded strings on all 225 trails. **Derive, don't generate:** they are safety claims about water, permits and exposure, and invented specifics are dangerous — every line traces to a database field.
- `lib/share.ts` — share sheet and link building.
- `components/ReportModal.tsx`, `components/TrailMap.tsx` — shared UI; the report sheet was previously copy-pasted across screens.

## Offline behaviour

`getSession()` resolves with `{ session: null }` both when the user is genuinely signed out **and** when it could not reach the server to refresh — it swallows the network error. Treating those as the same thing bounced offline users with a valid session to a login form they could not use. `AuthContext` now reads the persisted refresh token straight from AsyncStorage to tell them apart, and raises the retry gate instead. That gate is absolutely positioned: it and `<Stack>` are sibling flex children, so a `flex: 1` gate would split the screen with the navigator rather than cover it.

## Things to verify first (uncertain completion state)

1. Run `pnpm install` if `react-native-maps` or any other native dependency errors on start — this came up early and may need re-running after all the changes since
2. ~~`discover.tsx` `PeopleTab.toggleFollow` missing `status`~~ — **fixed.** It now sets `status` explicitly and `fetchFollowing` selects it. The underlying gotcha still applies to any new follow-insert: the column default is `'accepted'`, so an insert that omits `status` is rejected outright for a private target.

## Explicitly not done yet (don't assume these exist)

- Sentry + PostHog integration — needs the user's own API keys/DSN first
- Leaked-password-protection toggle in Supabase Auth settings — no API for this, manual dashboard toggle only
- Real push notification delivery — the sending infrastructure (`send-notification`, token storage) is real, and a **local** dev client now exists, but delivery is still blocked on two things: `app.json` has no `extra.eas.projectId` (needs `npx eas-cli init`, which needs the owner's Expo login), and a Simulator can never register an APNs token, so it needs physical hardware. `push_tokens` being empty is expected, not a bug — `registerForPushNotifications` correctly returns early on `!Device.isDevice`.
- Privacy Policy / Terms of Service (`/privacy-policy`, `/terms-of-service` routes exist and are linked from Settings + signup): the bracket placeholders have been filled in and the contact address now points at a real mailbox (it previously pointed at `summitapp.com`, a domain this project does not own, so privacy and deletion requests went to a stranger). The documents still need an actual lawyer's review before public launch — especially the assumption-of-risk/liability language, given this is a physical-outdoor-activity app
- Password reset / "forgot password" — `login.tsx` has no such flow at all
- Display names: seven inert `@example.com` test accounts were deleted, leaving two profiles. One still has `full_name = null` **and** `username = null`, so it renders as "Anonymous Hiker". That is expected until it sets a username in Settings, not a bug. All name fallbacks now go through `displayName()` / `profileInitials()` in `lib/format.ts` — before that, seven different strings ("Anonymous Hiker", "Anonymous", "Someone", "this user", "Profile", "Hiker", "Your Name") covered the same case, and screens that never selected `username` showed "Anonymous Hiker" even for users who had a perfectly good handle.
- Admin/moderation surface: `reports` and `trail_requests` can be written by users and read back only by their author, and nothing in the app or DB lets anyone triage either queue. **`reports` at least now announces itself** — a Database Webhook on INSERT calls `report-alert`, which posts to a Slack/Discord channel; triage still happens in the Supabase dashboard. `trail_requests` has no equivalent and still goes nowhere.

## Working conventions to keep

- Never grant `anon` write or read access on a new table without a specific reason — default to authenticated-only + RLS
- Distance/elevation always stored in miles/feet; convert only at the display layer
- Any new user-facing action that should notify someone (comment, like, follow, achievement) should call `send-notification` client-side after the underlying insert succeeds, following the existing pattern in the codebase rather than adding new server-side triggers
- Badge/achievement state is server-authoritative via `user_badges`, not just computed client-side for display

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
- `send-notification` — verify_jwt true. **Its source is not in this repo** — `supabase/functions/` holds only `login-with-username`, `report-alert` and `share-preview`, so the only copy of this function is the deployed one. Read it with `get_edge_function` before changing anything, and add the source here if you touch it.
  **Historic gap, now fixed:** v5 accepted only `'like' | 'follow' | 'milestone'` while `hike-detail.tsx:156` was already sending `'comment'`, so every comment notification 400'd and `sendPushNotification` discarded the result, making it silent. v6 accepts `'comment'`, verified the same way `'like'` is, and reads `notif_comments`. `sendPushNotification` now logs failures and `skipped` reasons — keep its `NotificationType` and the function's validated list in step, since nothing enforces that across the boundary.
  Takes `{ targetUserId, type, title, body, data, badgeKey?, hikeId? }`. Verifies the underlying action actually happened (a real like/follow row, or self-reporting your own milestone) before sending, checks the target's `notif_*` preference, fetches their `push_tokens`, sends via Expo's push API. Call it client-side right after the relevant insert succeeds — there is no DB trigger doing this automatically.
- `login-with-username` — **verify_jwt false**, because callers are by definition not signed in. Takes `{ username, password }`, resolves the email with the service role, signs in through a plain anon client so GoTrue's own rate limiting still applies, and returns only a session. An unknown username and a wrong password return an identical response, so it is not a username-enumeration oracle. Email login stays client-side — there is no email to protect, and routing it here would take all logins down whenever the function is down.
- `report-alert` — **verify_jwt false**; called by a Database Webhook on INSERT and forwards a summary to a Slack/Discord incoming webhook (`REPORT_ALERT_WEBHOOK_URL` secret). Despite the name it serves **both `reports` and `trail_requests`**, dispatching on the payload's `table` field — the name stayed because the reports webhook already points at that path and renaming would mean a window with abuse reports unannounced. `TRAIL_REQUEST_WEBHOOK_URL` optionally routes trail requests to a separate channel, falling back to the reports one. All user-written text passes through `sanitizeForChat()` first: a trail named `@everyone` would otherwise mass-ping the channel on submission. Trigger definitions are recorded in `supabase/webhooks.sql`, since a dashboard-created webhook leaves no trace in the repo. verify_jwt would be useless here since any signed-in user's JWT satisfies it; instead it exact-matches a shared secret. Note the runtime's `SUPABASE_SERVICE_ROLE_KEY` is the **new-format `sb_secret_...` key**, while a dashboard-created webhook stores the **legacy service-role JWT** — different credentials, which is why it 401'd until a dedicated `REPORT_ALERT_SECRET` was used instead.
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
  - `profiles.notif_likes` / `notif_follows` / `notif_milestones` / `notif_comments` persisted. Each gates **two** things, which is worth knowing before anyone assumes one is dead: the push notification server-side (`send-notification` reads the target's column and no-ops with `skipped: "preference_disabled"`), and the in-app Notifications list client-side (`notifications.tsx:133` and neighbours filter each category out). The in-app effect is the observable one today, since `push_tokens` is empty and cannot be filled yet. Follow *requests* are deliberately exempt and always shown regardless of preference. Caveat: `notif_comments` has no server-side half — see the `send-notification` note above.
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
- Admin/moderation surface: `reports` and `trail_requests` can be written by users and read back only by their author, and there is still no in-app queue for either. Both now **announce themselves** — a Database Webhook on INSERT calls `report-alert`, which posts to a Slack/Discord channel; triage happens in the Supabase dashboard. Seeing a request is not the same as resolving one: `trail_requests.status` is `CHECK (status IN ('pending','added','declined'))` but **nothing anywhere writes `added` or `declined`**, there is no path from an approved request to an actual `trails` row, and the requester is never told what happened. Closing that loop needs a real admin surface and is not built.

## Wishlist — specified but not built

### Trail "Good to know" overhaul

Layers on top of what already shipped. `lib/trailTips.ts` replaced three identical hardcoded strings on all 225 trails with per-trail tips derived from elevation-per-mile, distance, tags and live weather. That stands; this proposal is the more ambitious version built over it. **Do not start the derived-stats half without the two decisions at the bottom.**

Split into two categories, which differ in where the data comes from and therefore in how they should be stored.

**1. Trail facts** — parking situation, cell signal dead zones, water sources/refill points, dog policy, restroom at trailhead.

These barely change and are not derivable from hike logs. Add fields directly to the `trails` table, or a separate `trail_facts` table if versioning/edit history matters. Populated once per trail — either by the user directly, or eventually a crowdsourced "suggest an edit" flow with light moderation.

Explicitly **not** derived from aggregating logs. Treating these as log-derived means new trails show nothing until dozens of people have logged there, with inconsistent noise in the meantime.

**2. Derived stats** — typical start time pattern ("most hikers start before 7am here"), recent condition reports (mud, snow, closures from hike notes/photos in the last N days), difficulty vs. similar-elevation trails nearby, common reported hazards (exposure, scrambles, stream crossings).

Needs real log volume, but the data mostly already exists:

- **Start time**: already timestamped on every hike log. No new column — just `group by trail_id` over existing data.
- **Conditions/hazards**: the one real gap. Needs structured multi-select tags added at log time (muddy, icy, closed section, bugs bad, etc.) rather than trying to parse free-text notes with NLP.
- **Compute as a view**, following the pattern already in this schema (`trail_rating_stats`, `trails_with_ratings`) — e.g. a `trail_conditions_summary` view filtered to the last 90 days, self-updating as new hikes are logged, not a manually maintained table.

**Two decisions needed before building the derived-stats half.** The trail-facts half has no such gate and can be scoped and started on its own timeline without waiting on these.

1. **Minimum sample size before a derived stat is shown at all.** Don't show "most people start before 7am" off two logged hikes. Needs a cold-start threshold decided.
2. **Aggregates only, never traceable to an individual user.** Same privacy consideration as the earlier "Early Bird" badge discussion — a badge or stat that reveals someone's individual hiking-time pattern is a real safety concern, not just a preference.

Follow the standing convention when picking this up: **propose a recommendation for both open decisions rather than guessing**, same as every other product-tradeoff item.

### Repeated trending-up icon in hike lists

**Investigated and scoped, not built — decision pending.** The same trending-up glyph appears on the Climber badge, the "Hikes (N)" filter pill, and then identically on every hike row beneath it. Repetitive, and on the rows it conveys nothing beyond "this is a hike".

`trending-up` is used in three distinct roles. Only the third is the problem:

1. **Elevation marker** — `trail-detail.tsx:218`, `hike-detail.tsx:278`, three tips in `lib/trailTips.ts`. Here it means "elevation gain". Leave alone.
2. **Aggregate/badge marker** — Climber badge (`profile.tsx:39`), "Hikes (N)" pill (`profile.tsx:201`), "Most Hikes" leaderboard chip (`leaderboard.tsx:55`). Meaningful as an activity marker. Leave alone.
3. **Per-row hike icon** — `profile.tsx:225` **and `user-profile.tsx:337`**. Two call sites, not one: other people's profiles carry the identical row icon, so any fix must touch both. The feed does not use it (its cards lead with a difficulty pill and photos), so the pattern is confined to those two screens.

**Direction:** reserve trending-up for roles 1 and 2; give each hike row an icon that varies, keyed off the trail's dominant tag, reusing the preset set in `lib/avatars.ts` rather than introducing a second icon vocabulary.

**Tag data (checked, not assumed):** 225 trails, 116 distinct tags, 6 trails with no tags at all. Steep distribution — Views 87, Alpine/Summit 43, Family 41, Unique 37, Desert 28, Forest 25, Waterfall 23, Lake 21, Wildlife 20, then a long tail under 20.

The vocabulary is **two kinds of tag mixed together**, which is the crux:

- *Scenery/terrain* tags map cleanly onto existing presets — Desert→cactus, Forest→pine-tree, Waterfall/Lake→waves, Wildlife/Dog-friendly→paw, Glacier/Arctic→snowflake, Alpine/Summit/Scramble/Ridge-walk→terrain, Backpacking→bag-personal, Multi-day→tent, Coastal→island, Remote→compass, Sunrise→weather-sunset, Views→binoculars.
- *Character/logistics* tags have no sensible glyph — Unique, Iconic, Historic, Permit, Day-hike, Strenuous, Short, Loop.

So this wants a **priority-ordered lookup over a curated subset**, not a 1:1 table for all 116: take the first tag that has a mapping, so `["Iconic","Waterfall"]` still resolves to waves rather than falling through to the default. No new icon infrastructure needed — `lib/avatars.ts` already holds the glyphs and colours.

**A default is required, not optional.** `hikes.trail_id` is nullable and **1 of the 3 current hikes has no trail at all**, so those rows have no tags to key off — plus the 6 untagged trails and the unmappable tags above. Suggested default `hiking`, which reads as "a hike" and is visually distinct from `trending-up`.

**Plumbing:** neither call site has tags today. `HikesContext` uses `select('*, dim_ratings(*)')` and `user-profile.tsx:70` uses `select("*")`. Both need `trails(tags)` added to the embed — the `hikes.trail_id → trails.id` FK makes that a one-line change each with no extra round trip — plus tags carried on the `Hike` type.

**Effort:**
- *Tag-based icon* — small, roughly one focused session: a ~40-line mapping module, two one-line query changes, two render swaps. Four files, no migration, no backend.
- *Drop the row icon entirely* (the fallback) — trivial, ~15 minutes: delete the icon `View` and its style from both rows, check the layout doesn't shift.

**Caveat on verifying the tag version:** with 3 hikes across 2 trails, a simulator pass would exercise at most two or three distinct icons. The mapping's variety cannot be seen until there is more data, so it should be unit-tested directly rather than eyeballed.

### Onboarding and empty states

Not investigated yet. Sharing is live and about to bring cold visitors in, and Feed/Discover/Leaderboard likely read as broken or dead to a brand-new account rather than inviting. Audit the current empty-state copy and CTAs across those three screens and propose improvements. Separately, consider whether a short post-signup walkthrough (log a hike / discover / follow) is worth adding.

### Hike editing screen — partially built

`app/edit-hike.tsx` edits the **factual fields only**: distance, elevation, duration (including the "didn't track my time" case), difficulty, notes, and date/time. Reached from the owner's three-dot menu on hike detail. `HikesContext.updateHike` writes it and ends in the same `syncBadges(fetchHikes())` as `addHike`, which is what lets an edited start time newly earn Early Bird.

Still not editable, and each for a reason rather than by omission:
- **Ratings.** `dim_ratings` has INSERT and UPDATE policies but **no DELETE**, so un-rating a dimension would fail silently. Needs a migration before an edit screen can honestly offer it.
- **Photos.** Needs reconciling `hike_photos` rows against storage objects on both add and remove. `deleteHike` in `hike-detail.tsx` is the pattern to copy.
- **Which trail the hike belongs to.** A different operation from correcting numbers; the trail is shown read-only.

Deliberately a separate screen, not `log.tsx` in an edit mode — that file is ~745 lines and also owns trail search, the trail-request flow, photo upload and ratings, so a mode flag would put the more important create path at risk. Shared input rules live in `lib/hikeForm.ts` so the two forms cannot drift.

Note `hike-detail.tsx` keeps its own copy of the hike rather than reading `HikesContext`, so it refetches on regaining focus — without that, an edit saves correctly and you land back on stale numbers.

### Nearby trails using device location

Not built. Every `trails` row already has `lat`/`lng`, so sorting or filtering Discover by distance from the user's current position is real discovery value that does not exist today. Scope the effort and, specifically, what location-permission handling it needs.

### Trail condition tags at log time

Pulled out of the "Good to know" overhaul above as its own smaller, faster win. That item identifies structured condition tags (muddy, icy, closed section, bugs bad, …) as *the one real data gap*; capturing them at log time is useful on its own — a recent-conditions signal for other hikers — well before any derived-stats aggregation is built on top. Independent of the two decisions gating the larger feature.

### Basic moderation follow-through

`reports` and `trail_requests` both alert to Discord now, but there is still no way to **act** on a report — suspend a user, remove content — short of the Supabase dashboard by hand. Fine at the current user count; worth a real plan before sharing brings more people in. Propose options, as with the original moderation-triage discussion.

### Elevation profile chart on hike detail

Not built. A simple line chart over elevation data already being logged. Scoping should start with what charting library is available — check the dependency tree before adding one, since this would be the app's first charting need.

## Working conventions to keep

- Never grant `anon` write or read access on a new table without a specific reason — default to authenticated-only + RLS
- Distance/elevation always stored in miles/feet; convert only at the display layer
- Any new user-facing action that should notify someone (comment, like, follow, achievement) should call `send-notification` client-side after the underlying insert succeeds, following the existing pattern in the codebase rather than adding new server-side triggers
- Badge/achievement state is server-authoritative via `user_badges`, not just computed client-side for display
- **Badges are awarded but never revoked**, and that is deliberate. `syncBadges` re-derives from the current hikes and inserts what is newly earned; nothing deletes. Editing a hike so it no longer qualifies therefore keeps the badge. This used to be unreachable — hikes were immutable — so if you ever add revocation, note it needs a DELETE policy on `user_badges` and means a user can lose a badge by fixing a typo

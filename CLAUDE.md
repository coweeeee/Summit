# Summit — project context for Claude Code

Summit is a social hiking-log app (think Strava/AllTrails/Letterboxd hybrid) built with React Native/Expo, backed by Supabase. This file is a handoff from a long planning/build session done through a different tool — read it fully before making changes, since a lot of non-obvious backend work already exists that the app code depends on.

## Stack

- React Native / Expo (SDK 54), Expo Router
- Supabase: Postgres, Auth, Storage, Edge Functions
- Supabase project: `summit`, ref `sigupaldsyuaomgllyvw`, region `us-east-1`, **free tier** (auto-pauses after ~1 week of inactivity — if API calls start failing mysteriously, check whether the project went `INACTIVE` in the Supabase dashboard and restore it before debugging code)
- A second, currently-empty Supabase project `summit-dev` (ref differs) exists as a placeholder for an eventual dev/prod split — nothing is wired to it yet, ignore it unless asked to set that up

## Database shape

Core tables: `profiles`, `trails`, `hikes`, `comments`, `likes`, `follows`, `hike_photos`, `saved_hikes`, `want_to_hike`, `push_tokens`, `dim_ratings`, `blocks`, `reports`, `user_badges`, `trail_requests`.

Views: `trail_rating_stats` (avg_rating/rating_count computed from `hikes.overall_score`, not the old static `trails.rating`), `trails_with_ratings` (all of `trails` plus `effective_rating`/`rating_count` — Discover's "Top Rated" sort uses this).

RPC functions (all `SECURITY DEFINER`, narrowly scoped, callable by `anon`+`authenticated`):
- `is_username_available(check_username text) returns boolean` — used at signup
- `get_email_for_username(lookup_username text) returns text` — lets login accept a username instead of just email (resolve to email client-side, then call `signInWithPassword` normally)
- `can_view_user_content(content_owner_id uuid) returns boolean` — the private-account visibility check, used inside RLS policies on hikes/comments/likes/hike_photos/dim_ratings

Edge functions (Deno, deployed):
- `delete-account` — verify_jwt true; deletes the caller's storage files then calls `auth.admin.deleteUser`, which cascades through every table via FK constraints back to `auth.users`
- `send-notification` — verify_jwt true; takes `{ targetUserId, type: 'like'|'follow'|'comment'|'milestone', title, body, data, badgeKey?, hikeId? }`. Verifies the underlying action actually happened (a real like/follow row, or self-reporting your own milestone) before sending, checks the target's `notif_*` preference, fetches their `push_tokens`, sends via Expo's push API. Call it client-side right after the relevant insert succeeds — there is no DB trigger doing this automatically.

Storage buckets: `avatars`, `hike-photos`, both public, path convention `${userId}/filename` (or `${userId}/${hikeId}_${index}.ext` for hike photos). Public bucket listing policies were deliberately removed — direct URL reads still work fine.

## Security model — read this before touching RLS

`anon` (unauthenticated) has **zero** standing privileges on any public table — not SELECT, not INSERT, nothing. This was a deliberate "require sign-in for everything" decision made mid-project; twice during the session it turned out a revoke had been incomplete (first only SELECT was revoked, then a later audit found INSERT/UPDATE/DELETE/TRUNCATE were still granted) — if you ever add a new table, explicitly `REVOKE ALL ... FROM anon` or just don't grant anything to anon in the first place, and grant scoped access to `authenticated` via RLS policies instead. The two exceptions are the `is_username_available` and `get_email_for_username` RPCs, which are intentionally callable pre-login (narrow, can't leak more than a boolean/email lookup) — same pattern should be followed for any future pre-auth need.

Private accounts: `profiles.is_private` (default false). `follows.status` is `'pending'` or `'accepted'` (default accepted, for backward compatibility with pre-existing rows). Following a public account inserts `status: 'accepted'` directly; following a private account must insert `status: 'pending'` — **the database enforces this itself** via a CHECK against the target's `is_private`, so don't try to bypass it client-side. `can_view_user_content()` gates SELECT on hikes/comments/likes/hike_photos/dim_ratings — if `is_private` is true and the viewer doesn't have an accepted follow, those rows are simply invisible via the API, no client-side filtering needed.

## What's built (roughly chronological)

- Expo Go stability: env-var Supabase config, auth session timeout+retry, `isExpoGo` guards around `expo-notifications`/`react-native-webview`/`react-native-maps`
- Feed: FlatList + server-side pagination (`PAGE_SIZE = 20`), `expo-image`
- Discover: FlatList + server-side filtering/search/pagination, region filter, map view, difficulty filter + tag filter (tag filter chips were supposed to be made dynamic from real `tags` data instead of a hardcoded list — **verify this actually landed**, it was requested near the end of the session and not confirmed)
- Trail catalog: 225 trails (manually seeded + OpenStreetMap via Overpass API + USGS National Map ingestion scripts — see `ingest_osm_trails.js` / `ingest_usgs_trails.js` if present in the repo, they're standalone Node scripts, not deployed anywhere). Deduped multiple times (FK-safely repointed `hikes.trail_id`/`want_to_hike.trail_id` before deleting losers). Difficulty/description backfilled for the 6 USGS trails that came in without them.
- Trail bookmarking (`want_to_hike`) is the *only* "saved" concept — an earlier "save this hike log" feature was explicitly removed per product direction; if you see any lingering save-a-specific-hike-log UI, that's a regression, remove it
- Account deletion: Settings → Danger Zone → type-DELETE-to-confirm modal → calls `delete-account`
- Content moderation: report (posts/comments) + block (users), mutual-hide filtering, Blocked Accounts list lives in **Settings → Privacy**, not as a public profile tab (Instagram pattern, not a Twitter/X-style visible block list)
- Settings are now actually functional (they weren't, originally — a full audit found the units toggle and all notification toggles were local-state-only and did nothing):
  - `profiles.distance_unit` ('imperial'|'metric') persisted, real conversion via `lib/units.ts` (`formatDistance`/`formatElevation`) applied across every screen that shows distance/elevation — DB values always stay in miles/feet, only display formatting changes
  - `profiles.notif_likes` / `notif_follows` / `notif_milestones` / `notif_comments` persisted, wired to `send-notification`
- Badges: Climber, Explorer (5 hikes), Summit (10 hikes), Trailblazer, Early Bird (hike started before 7 AM local — required adding a real start-time picker to `log.tsx`, since it previously only captured a date). Server-recorded in `user_badges`, idempotent, notification sent on first award via `lib/badges.ts`.
- Notification taps deep-link to the relevant hike or profile screen
- Signup: single screen, username required upfront (checked live via `is_username_available`), email, password
- Login: accepts email or username
- Ratings: `trail_rating_stats`/`trails_with_ratings` wired into Discover cards, map callouts, and trail-detail — shows real "4.6 (23 ratings)" instead of a static number
- Private accounts (**most recent work — likely incomplete, verify carefully**): backend (see above) is done; app-side Settings toggle, Follow-vs-Request button state, incoming follow-requests inbox, and the gated private-profile view (username/avatar/bio only for non-followers) were requested but not confirmed finished

## Things to verify first (uncertain completion state)

1. Private accounts app-side UI — likely partially done, check `settings.tsx`, `user-profile.tsx`, wherever the Follow button lives
2. Duration-optional hike logging (a "skip" option for time/duration in `log.tsx`) + the `trail_requests` "can't find your trail, request it" flow — requested, completion not confirmed
3. Discover filter chips derived from real distinct tag values instead of a hardcoded list — requested, completion not confirmed
4. Run `pnpm install` if `react-native-maps` or any other native dependency errors on start — this came up early and may need re-running after all the changes since

## Explicitly not done yet (don't assume these exist)

- Sentry + PostHog integration — needs the user's own API keys/DSN first
- Leaked-password-protection toggle in Supabase Auth settings — no API for this, manual dashboard toggle only
- EAS build / real push notification delivery to devices — the sending infrastructure (`send-notification`, token storage) is real, but Expo Go can't do real push delivery; a dev client build via EAS is still needed for actual on-device notifications
- Privacy Policy / Terms of Service (`/privacy-policy`, `/terms-of-service` routes exist and are linked from Settings + signup) still have bracket placeholders (`[Your Name / Company Name]`, `[support email]`, `[Your State/Country]`, `[DATE]`) and need real values plus an actual lawyer's review before public launch — especially the assumption-of-risk/liability language, given this is a physical-outdoor-activity app
- 7 of 8 existing profiles have `username = null` (signed up before the username-at-signup requirement existed) — cosmetic "Anonymous Hiker" issue in Discover People, not a bug, just stale test accounts; ask before deleting them

## Working conventions to keep

- Never grant `anon` write or read access on a new table without a specific reason — default to authenticated-only + RLS
- Distance/elevation always stored in miles/feet; convert only at the display layer
- Any new user-facing action that should notify someone (comment, like, follow, achievement) should call `send-notification` client-side after the underlying insert succeeds, following the existing pattern in the codebase rather than adding new server-side triggers
- Badge/achievement state is server-authoritative via `user_badges`, not just computed client-side for display

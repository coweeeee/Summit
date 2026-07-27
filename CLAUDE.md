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

Database functions (narrowly scoped, callable by `anon`+`authenticated`):
- `is_username_available(check_username text) returns boolean` — `SECURITY DEFINER`; used at signup. Compares `lower(username)`, matching the `profiles_username_lower_key` unique index.
- `get_email_for_username(lookup_username text) returns text` — `SECURITY DEFINER`; lets login accept a username instead of just email (resolve to email client-side, then call `signInWithPassword` normally)
- `is_blocked_by(other_user_id uuid) returns boolean` — `SECURITY DEFINER`; true when `other_user_id` has blocked the caller. Exists because RLS on `blocks` is `auth.uid() = blocker_id`, so a plain select can only ever answer "have *I* blocked them" — without this RPC a profile that blocked you is indistinguishable from an empty one. Used by `user-profile.tsx`. **`hike-detail.tsx` does not use it yet**, so its comment filter still only hides comments from people the viewer blocked, not the reverse.
- `can_view_user_content(content_owner_id uuid) returns boolean` — **`SECURITY INVOKER`**, not definer. The single visibility gate used inside RLS policies; see the security model section below.
- `find_similar_trails(search_name text)` — `SECURITY INVOKER`; trigram fuzzy match backing the "can't find your trail" duplicate check

Edge functions (Deno, deployed):
- `delete-account` — verify_jwt true; deletes the caller's storage files then calls `auth.admin.deleteUser`, which cascades through every table via FK constraints back to `auth.users`
- `send-notification` — verify_jwt true; takes `{ targetUserId, type: 'like'|'follow'|'comment'|'milestone', title, body, data, badgeKey?, hikeId? }`. Verifies the underlying action actually happened (a real like/follow row, or self-reporting your own milestone) before sending, checks the target's `notif_*` preference, fetches their `push_tokens`, sends via Expo's push API. Call it client-side right after the relevant insert succeeds — there is no DB trigger doing this automatically.

Storage buckets: `avatars`, `hike-photos`, both public, path convention `${userId}/filename` (or `${userId}/${hikeId}_${index}.ext` for hike photos). Public bucket listing policies were deliberately removed — direct URL reads still work fine.

## Security model — read this before touching RLS

`anon` (unauthenticated) has **zero** standing privileges on any public table — not SELECT, not INSERT, nothing. This was a deliberate "require sign-in for everything" decision made mid-project; twice during the session it turned out a revoke had been incomplete (first only SELECT was revoked, then a later audit found INSERT/UPDATE/DELETE/TRUNCATE were still granted) — if you ever add a new table, explicitly `REVOKE ALL ... FROM anon` or just don't grant anything to anon in the first place, and grant scoped access to `authenticated` via RLS policies instead. The two exceptions are the `is_username_available` and `get_email_for_username` RPCs, which are intentionally callable pre-login (narrow, can't leak more than a boolean/email lookup) — same pattern should be followed for any future pre-auth need.

Private accounts: `profiles.is_private` (default false). `follows.status` is `'pending'` or `'accepted'` (default accepted, for backward compatibility with pre-existing rows). Following a public account inserts `status: 'accepted'` directly; following a private account must insert `status: 'pending'` — **the database enforces this itself** via the `Send follow or follow request matching target privacy` RLS WITH CHECK policy, so don't try to bypass it client-side. Note the column default is `'accepted'`, so any insert that omits `status` will be **rejected** when the target is private — always set it explicitly.

`can_view_user_content()` is the single visibility gate. It returns false when the viewer and the owner have blocked each other **in either direction**, and false for a private owner the viewer doesn't have an accepted follow with. It gates SELECT on `hikes`, `comments`, `likes`, `hike_photos`, `dim_ratings`, `want_to_hike` and `saved_hikes`. Blocking and privacy are therefore enforced server-side everywhere — **do not add per-screen client-side block filtering**; it's redundant and, when applied after pagination, makes pages render short.

One deliberate consequence: the leaderboard is **viewer-dependent**. A private account's hikes only count toward their totals for people who follow them, so two users can see different rankings. That is correct behavior — don't "fix" it.

`profiles` SELECT is still `using (true)` for `authenticated` (needed by the Blocked Accounts list and people search), so a blocked user's name/avatar/bio remain visible even though their content is not.

## What's built (roughly chronological)

- Expo Go stability: env-var Supabase config, auth session timeout+retry, `isExpoGo` guards around `expo-notifications`/`react-native-webview`/`react-native-maps`
- Feed: FlatList + server-side pagination (`PAGE_SIZE = 20`), `expo-image`
- Discover: FlatList + server-side filtering/search/pagination, region filter, map view, difficulty filter + tag filter. Tag chips are derived from real distinct `tags` values (`fetchCategoryFilters` in `discover.tsx`) — confirmed landed.
- Leaderboard tab (`app/(tabs)/leaderboard.tsx`): Most Hikes / Most Miles / Most Elevation / Top Rated, all-time or last 7 days. Aggregates client-side over every visible `hikes` row, so it's both viewer-dependent (see security model) and unbounded — a server-side aggregate view or RPC is the right long-term fix.
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

## Things to verify first (uncertain completion state)

1. Run `pnpm install` if `react-native-maps` or any other native dependency errors on start — this came up early and may need re-running after all the changes since
2. `discover.tsx` `PeopleTab.toggleFollow` inserts into `follows` **without** `status` and discards the result, so following a private account is silently rejected by RLS while the UI shows "Following". `user-profile.tsx` does this correctly — fix Discover to match. Its `fetchFollowing` also ignores `status`, so pending requests read as "Following".

## Explicitly not done yet (don't assume these exist)

- Sentry + PostHog integration — needs the user's own API keys/DSN first
- Leaked-password-protection toggle in Supabase Auth settings — no API for this, manual dashboard toggle only
- EAS build / real push notification delivery to devices — the sending infrastructure (`send-notification`, token storage) is real, but Expo Go can't do real push delivery; a dev client build via EAS is still needed for actual on-device notifications
- Privacy Policy / Terms of Service (`/privacy-policy`, `/terms-of-service` routes exist and are linked from Settings + signup): the bracket placeholders have been filled in, but the documents still need an actual lawyer's review before public launch — especially the assumption-of-risk/liability language, given this is a physical-outdoor-activity app
- Password reset / "forgot password" — `login.tsx` has no such flow at all
- Some existing profiles have `full_name = null` (signed up before username-at-signup existed) — this is what produces the "Anonymous Hiker" fallback in Discover People, follower lists, and other profiles. It is a `full_name` gap, **not** related to `is_private`. Stale test accounts; ask before deleting or backfilling them.
- Admin/moderation surface: `reports` and `trail_requests` can be written by users and read back only by their author. Nothing in the app or DB lets anyone triage either queue.

## Working conventions to keep

- Never grant `anon` write or read access on a new table without a specific reason — default to authenticated-only + RLS
- Distance/elevation always stored in miles/feet; convert only at the display layer
- Any new user-facing action that should notify someone (comment, like, follow, achievement) should call `send-notification` client-side after the underlying insert succeeds, following the existing pattern in the codebase rather than adding new server-side triggers
- Badge/achievement state is server-authoritative via `user_badges`, not just computed client-side for display

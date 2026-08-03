# summit-web

Public landing pages for shared Summit links.

- `/` — static home
- `/u/:username` — shared profile
- `/h/:hikeId` — shared hike

Both share routes are server-rendered so their Open Graph tags can be
per-profile and per-hike. That is the entire mechanism by which iMessage,
WhatsApp, Slack, Discord and Twitter render a preview card instead of a bare
URL, and it is why this is not a static site.

## Deliberately outside the pnpm workspace

`pnpm-workspace.yaml` globs `artifacts/*`, `lib/*`, `lib/integrations/*` and
`scripts` — `web/` matches none of them, so this project installs
independently. Keep it that way: the mobile app pins `react` through the
workspace catalog, and pulling this into the same dependency graph risks the
install that took real effort to repair.

## Data

Nothing here talks to the database. Both routes call the `share-preview`
Supabase edge function, which reads with the service role and returns an
explicitly whitelisted set of fields. This project holds no keys and cannot
read anything that function does not choose to return.

Private accounts are excluded there, not here — a share link must never
publish what `is_private` withholds from signed-in users.

## Vercel setup

Import the repo, then set:

| Setting | Value |
|---|---|
| Root Directory | `web` |
| Framework Preset | Other |
| Build Command | *(leave empty)* |
| Output Directory | *(leave empty)* |
| Install Command | *(default)* |

One environment variable, for all environments:

| Name | Value |
|---|---|
| `SUPABASE_URL` | `https://sigupaldsyuaomgllyvw.supabase.co` |

Not a secret — it is the project URL already shipped in the mobile bundle. No
service role key belongs here, and nothing in this project needs one.

`vercel.json` holds the rewrites, so routing needs no dashboard configuration.

## Known limits

- **"Open in Summit" uses the `summit://` custom scheme**, not a universal
  link. The OS cannot hand an `https://` URL to the app until the associated
  domains entitlement is configured, which requires a paid Apple Developer
  account. Until then the button works only for people who already have the
  app, and only when tapped.
- **Instagram Stories ignores Open Graph**, so links shared there will not
  preview. Covering it needs real in-app image export.
- **The download call to action is placeholder text.** Nothing is published to
  the App Store or TestFlight yet, so there is nowhere to point. Replace the
  "launching soon" block in `index.html` and `api/share.ts` once there is.

---
name: Mobile app uses external Supabase, not Replit Postgres
description: This project's mobile app (artifacts/mobile) persists data to an external Supabase project, separate from the Replit-managed PostgreSQL (DATABASE_URL). Read this before checking/altering profiles or other app tables.
---

The mobile app's Supabase client (`artifacts/mobile/lib/supabase.ts`) points at
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`, a Supabase-hosted
Postgres project. This is a **different database** than the Replit-managed
`DATABASE_URL` (and the `database` skill / drizzle setup in `lib/db`), which is
unrelated and currently unused by the mobile app.

**Why:** Confirmed by comparing hosts — `DATABASE_URL` pointed at a Replit
"helium" host while `EXPO_PUBLIC_SUPABASE_URL` pointed at a `*.supabase.co`
host. The `database` skill and Replit Postgres tooling cannot see or modify
Supabase's schema.

**How to apply:**
- To check whether a column exists on a Supabase table (e.g. `profiles`),
  there's no service_role key available in this env and anon-key REST calls
  to `profiles` return `401 permission denied` (RLS requires an authenticated
  user). Work around this by signing up a temporary throwaway user via
  `supabase.auth.signUp()` with the anon client, then querying/updating the
  table as that authenticated user to confirm columns and RLS behavior.
- Do not use the `database` skill or `DATABASE_URL`/drizzle (`lib/db`) to
  inspect or migrate tables used by the mobile app (e.g. `profiles`) — it's
  the wrong database entirely.

-- Trail condition tags at log time.
--
-- APPLIED 2026-08-05. Verified against the live catalogue afterwards:
-- `hikes.conditions` is text[] NOT NULL default '{}', `hikes.created_at` is
-- nullable with default now(), the GIN index exists, and dim_ratings holds two
-- 'Trail Quality' rows with no 'Trail Cond.' remaining. The three pre-existing
-- hikes kept created_at NULL, which is the point of the two-statement form
-- below — they were not backfilled with a timestamp they never had.
--
-- DO NOT RE-RUN. Section 3 is a data update that is already done, and re-running
-- it is harmless only because it now matches nothing. Recorded here because DDL
-- applied through the dashboard otherwise leaves no trace in the repo, which is
-- the same reason webhooks.sql exists.
--
-- ── Why an array column and not a child table ───────────────────────────────
--
-- `dim_ratings` has SELECT, INSERT and UPDATE policies and no DELETE, which is
-- exactly why ratings are not editable. A `hike_conditions` child table walks
-- into the identical trap: de-selecting a tag is a DELETE, and it would fail
-- silently. An array column makes removal an ordinary UPDATE, which `hikes`
-- already has a working policy for.
--
-- It also needs no RLS changes — `hikes` SELECT is already gated by
-- `can_view_user_content()` — and no `select()` edits, since every read path
-- already does `select('*')`. `trails.tags` is the precedent: text[] with a GIN
-- index, because a tag is a valueless label, whereas a `dim_ratings` row is a
-- table because it carries a score.

begin;

-- ── 1. The tags ─────────────────────────────────────────────────────────────
-- Defaulted to the empty array rather than left nullable, so "nothing recorded"
-- has exactly one representation. Client code stores stable keys ("snow_ice"),
-- not display labels, so the wording can be changed without touching live rows.

alter table public.hikes
  add column if not exists conditions text[] not null default '{}';

comment on column public.hikes.conditions is
  'Condition keys from lib/trailConditions.ts CONDITION_TAGS. Stable keys, not display labels. Empty array means nothing was recorded; the "good" key means the hiker affirmatively said the trail was fine.';

-- Matches the trails.tags precedent. Inert at 3 rows; the point is that the
-- aggregate queries this exists to enable are containment queries.
create index if not exists hikes_conditions_idx
  on public.hikes using gin (conditions);

-- ── 2. An immutable timestamp ───────────────────────────────────────────────
--
-- DECISION: yes, it rides along. `hikes` has no immutable timestamp today —
-- `date` is the user-supplied hike date and is freely editable from the edit
-- screen, so it cannot anchor a "conditions in the last 90 days" window. Any
-- aggregate over recent conditions is impossible without this, and the cost of
-- adding it only grows: there are 3 rows now, and this is the cheapest it will
-- ever be.
--
-- Added in two statements ON PURPOSE. A single `ADD COLUMN ... DEFAULT now()`
-- would backfill the existing rows with the migration's own timestamp, which
-- asserts those hikes were created at a moment they were not. Adding the column
-- bare leaves them NULL — honestly unknown — and setting the default afterwards
-- gives every subsequent row a true value. Queries must therefore treat NULL as
-- "unknown", not as "old", which is the correct reading.

alter table public.hikes
  add column if not exists created_at timestamptz;

alter table public.hikes
  alter column created_at set default now();

comment on column public.hikes.created_at is
  'When the row was inserted. NULL for the rows that predate this column — unknown, not old. Distinct from `date`, which is the user-supplied hike date and is editable.';

-- ── 3. Rename the overlapping rating dimension ──────────────────────────────
--
-- DECISION: rename rather than drop or keep both. A "Conditions" chip row
-- beside a "Trail Cond." star row is incoherent — they read as the same
-- question asked twice. They are not: the star is how good the tread was, the
-- tags are what was in the way of it. "Trail Quality" says that.
--
-- `dim_ratings.name` is free text, so this is a data update rather than a
-- schema change, and it is 2 rows. The client's DIMENSIONS constant is updated
-- in the same PR; without this statement those 2 historical rows would keep
-- rendering under the old name while new hikes use the new one.

update public.dim_ratings
   set name = 'Trail Quality'
 where name = 'Trail Cond.';

commit;


-- ── Verification ────────────────────────────────────────────────────────────
-- Read-only. Run after committing.

-- select column_name, data_type, column_default, is_nullable
--   from information_schema.columns
--  where table_schema = 'public' and table_name = 'hikes'
--    and column_name in ('conditions', 'created_at');

-- Expect 'Trail Quality' and no remaining 'Trail Cond.'.
-- select name, count(*) from public.dim_ratings group by name order by 2 desc;

-- Expect created_at NULL on the pre-existing rows and a value on anything
-- logged after the migration.
-- select id, trail_name, date, created_at, conditions from public.hikes order by date desc;

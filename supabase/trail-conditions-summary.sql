-- Aggregate condition reports per trail.
--
-- NOT YET APPLIED, and it depends on supabase/trail-conditions.sql having run
-- first — it reads `hikes.conditions` and `hikes.created_at`, neither of which
-- exists until that migration lands.
--
-- ── Why a view ──────────────────────────────────────────────────────────────
--
-- Following trail_rating_stats and trails_with_ratings, which are the existing
-- aggregates in this schema. A view recomputes itself as hikes are logged; a
-- maintained table would need a job nobody has written and would be wrong
-- between runs.
--
-- security_invoker = true, matching both existing views. That means RLS applies
-- as the querying user, so a viewer aggregates only the hikes they are allowed
-- to see. The consequence is that this is VIEWER-DEPENDENT: two people can see
-- different summaries for the same trail, because private accounts they do not
-- follow are excluded from their view of it. That is the same property the
-- leaderboard has, and CLAUDE.md records it there as deliberate rather than a
-- bug. Switching to a definer view would make the numbers consistent at the
-- cost of aggregating hikes the viewer has no right to see, which is the
-- opposite of the constraint this is built under.
--
-- ── The privacy shape ───────────────────────────────────────────────────────
--
-- Three rules, all enforced here rather than in the client, because a client
-- guard is a guard anyone can query around.
--
-- 1. THRESHOLD: at least 3 distinct reporters, not 3 reports.
--
--    The approved threshold was "3 reports within 90 days". This implements 3
--    distinct *reporters*, which is stricter, and the difference matters: three
--    reports from one hiker is one hiker's opinion, and attributing it to "the
--    trail" would be exactly the individually-traceable statistic the rule
--    exists to prevent. Counting reports rather than people would let a single
--    person unlock a public claim about a trail by logging it three times.
--
-- 2. NO user_id, ever. It is not selected, so it cannot leak through a client
--    that forgets to omit it.
--
-- 3. NO COUNTS. Only a qualitative band. "3 of 4 reported mud" identifies
--    people in a small group as effectively as naming them; "most" does not.
--    The floor of 0.34 means that at the minimum threshold of 3 reporters, a
--    single dissenting report cannot surface a claim — only a majority can.

-- Run AFTER supabase/trail-conditions.sql.

create or replace view public.trail_conditions_summary
with (security_invoker = true) as
with recent as (
  select h.trail_id,
         h.user_id,
         h.conditions
    from public.hikes h
   where h.trail_id is not null
     -- created_at is NULL for rows predating that column. NULL is unknown, not
     -- old, so those rows are excluded rather than assumed recent.
     and h.created_at is not null
     and h.created_at >= now() - interval '90 days'
     and cardinality(h.conditions) > 0
),
per_trail as (
  select trail_id,
         count(distinct user_id) as reporters
    from recent
   group by trail_id
  having count(distinct user_id) >= 3
),
per_tag as (
  -- distinct user_id again, so one person logging the same trail repeatedly
  -- counts once toward a tag rather than carrying it alone.
  select r.trail_id,
         t.tag,
         count(distinct r.user_id) as tag_reporters
    from recent r
    cross join lateral unnest(r.conditions) as t(tag)
   group by r.trail_id, t.tag
)
select p.trail_id,
       g.tag,
       case
         when g.tag_reporters::numeric / p.reporters >= 0.6 then 'most'
         else 'some'
       end as prevalence
  from per_trail p
  join per_tag g on g.trail_id = p.trail_id
 where g.tag_reporters::numeric / p.reporters >= 0.34;

comment on view public.trail_conditions_summary is
  'Condition tags reported for a trail in the last 90 days. Suppressed entirely below 3 distinct reporters. Exposes no user_id and no counts — only a "most"/"some" band — so no row can be attributed to an individual.';

grant select on public.trail_conditions_summary to authenticated;


-- ── Verification ────────────────────────────────────────────────────────────
-- Read-only. Expect zero rows today: the threshold is 3 distinct reporters and
-- there are 2 accounts in total, so this correctly stays silent until the app
-- has real users. That is the cold-start behaviour, not a bug.

-- select * from public.trail_conditions_summary order by trail_id, tag;

-- Confirms the view exists and is an invoker view like its two neighbours.
-- select c.relname, c.reloptions
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--  where n.nspname = 'public' and c.relkind = 'v';

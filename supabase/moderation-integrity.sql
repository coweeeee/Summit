-- Reports must outlive the things they are about.
--
-- APPLIED 2026-08-04 to the `summit` project. Verified against the live
-- catalog afterwards: all four foreign keys read ON DELETE SET NULL,
-- reports_target_present is re-pointed at the snapshot columns, target_kind
-- is NOT NULL, reporter_id is nullable, and reports_capture_snapshot_trg is
-- present, enabled and SECURITY DEFINER. The deployed copy of the trigger
-- function has its comments stripped; the logic is statement-for-statement
-- identical to what is below.
--
-- DO NOT RE-RUN. This is not idempotent — the constraint drops in sections 4
-- and 5 fail on a second pass. It is recorded here because DDL applied
-- through the dashboard otherwise leaves no trace in the repo, which is the
-- same reason webhooks.sql exists.
--
-- ── The problem this fixed ─────────────────────────────────────────────────
--
-- All four foreign keys on `reports` were ON DELETE CASCADE, and the tables
-- they point at cascade from `auth.users` in turn:
--
--     auth.users ─┬─> profiles ─┬─> reports.reported_user_id  (CASCADE)
--                 │             ├─> reports.reporter_id       (CASCADE)
--                 │             └─> hikes ─┬─> reports.hike_id (CASCADE)
--                 │                        └─> comments ─> reports.comment_id
--                 └─> comments ─> reports.comment_id          (CASCADE)
--
-- So a report was destroyed by any of:
--
--   1. The reported user deleting their own hike. Settings has no part in it —
--      it is the ordinary delete button on hike-detail.tsx:192.
--   2. The reported user deleting their account. `delete-account` calls
--      auth.admin.deleteUser, which cascades the whole graph. This is a
--      shipped button (settings.tsx:471), not a theoretical path.
--   3. The *reporter* deleting their account — so pressuring someone into
--      leaving also erases what they filed.
--   4. A third party: the owner of a hike deleting it takes every comment on
--      it, and therefore every report filed about those comments, even though
--      the reports concern other people's words.
--
-- In each case the report row went with no tombstone. Nobody was notified,
-- nothing was logged, and the Slack/Discord alert that report-alert had
-- already sent was left as the only surviving evidence — an unstructured chat
-- message naming a uuid that no longer resolved to anything.
--
-- ── The fix ────────────────────────────────────────────────────────────────
--
-- Keep the live foreign keys, so a report still joins to its target while the
-- target exists, but make deletion sever the link instead of destroying the
-- report, and capture enough at insert time that the report is still
-- judgeable after the target is gone. A dangling uuid is not evidence.
--
-- Snapshots are written by a BEFORE INSERT trigger, not by the client. The
-- INSERT policy only constrains reporter_id, so a client that supplied its
-- own snapshot values could otherwise describe someone else's content
-- however it liked. The trigger overwrites them unconditionally for that
-- reason — it is SECURITY DEFINER because the reporter usually cannot read
-- the row being reported.
--
-- ── Not included, deliberately ─────────────────────────────────────────────
--
-- No UPDATE policy on `reports`, and no moderator role. `status` has a CHECK
-- allowing pending/reviewed/actioned/dismissed but the table has only INSERT
-- and SELECT policies, so status cannot be moved through the API — which is
-- correct for how triage actually works today. `service_role` and `postgres`
-- both carry rolbypassrls, so the dashboard already updates status fine, and
-- that is where report-alert's own comment says triage happens. Adding an
-- UPDATE policy without a moderator concept to gate it would mean writing a
-- policy whose USING clause has nothing to test. That becomes real work the
-- day triage moves in-app; it is not a bug today.

begin;

-- ── 1. Snapshot columns ────────────────────────────────────────────────────
-- Plain columns, no foreign keys: these must survive the rows they describe.

alter table public.reports
  add column if not exists target_kind                text,
  add column if not exists reporter_id_snapshot       uuid,
  add column if not exists reported_user_id_snapshot  uuid,
  add column if not exists reported_username_snapshot text,
  add column if not exists hike_id_snapshot           uuid,
  add column if not exists comment_id_snapshot        uuid,
  add column if not exists reported_content_snapshot  text;

comment on column public.reports.reported_content_snapshot is
  'The reported text as it read when the report was filed. Truncated to 2000 chars. Written by trigger, never by the client.';
comment on column public.reports.target_kind is
  'Which of the three target columns was set at insert time: user, hike, or comment.';

-- ── 2. Capture the snapshot at insert ──────────────────────────────────────

create or replace function public.reports_capture_snapshot()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Assigned, not coalesced. A client-supplied value here would be a forgery.
  new.reporter_id_snapshot      := new.reporter_id;
  new.reported_user_id_snapshot := new.reported_user_id;
  new.hike_id_snapshot          := new.hike_id;
  new.comment_id_snapshot       := new.comment_id;

  -- Same precedence as describeTarget() in the report-alert function, so a
  -- row and the alert it generated always agree on what was reported.
  if new.comment_id is not null then
    new.target_kind := 'comment';
    select left(c.content, 2000)
      into new.reported_content_snapshot
      from public.comments c
     where c.id = new.comment_id;

  elsif new.hike_id is not null then
    new.target_kind := 'hike';
    select left(concat_ws(E'\n', h.trail_name, h.location, h.notes), 2000)
      into new.reported_content_snapshot
      from public.hikes h
     where h.id = new.hike_id;

  else
    -- An account report. The profile text is the reportable content.
    new.target_kind := 'user';
    select left(concat_ws(E'\n', p.full_name, p.bio), 2000)
      into new.reported_content_snapshot
      from public.profiles p
     where p.id = new.reported_user_id;
  end if;

  if new.reported_user_id is not null then
    select p.username
      into new.reported_username_snapshot
      from public.profiles p
     where p.id = new.reported_user_id;
  end if;

  return new;
end;
$$;

drop trigger if exists reports_capture_snapshot_trg on public.reports;
create trigger reports_capture_snapshot_trg
  before insert on public.reports
  for each row execute function public.reports_capture_snapshot();

-- ── 3. Backfill ────────────────────────────────────────────────────────────
-- A no-op at the time of writing (reports is empty). Written to be correct
-- anyway, since rows may exist by the time this is applied. Content and
-- username cannot be recovered for rows filed before the trigger existed —
-- those stay null rather than being guessed at.

update public.reports set
  reporter_id_snapshot      = coalesce(reporter_id_snapshot, reporter_id),
  reported_user_id_snapshot = coalesce(reported_user_id_snapshot, reported_user_id),
  hike_id_snapshot          = coalesce(hike_id_snapshot, hike_id),
  comment_id_snapshot       = coalesce(comment_id_snapshot, comment_id),
  target_kind               = coalesce(target_kind,
                                case when comment_id is not null then 'comment'
                                     when hike_id    is not null then 'hike'
                                     else 'user' end)
where target_kind is null;

alter table public.reports
  alter column target_kind set not null;

alter table public.reports
  add constraint reports_target_kind_check
  check (target_kind in ('user', 'hike', 'comment'));

-- ── 4. Sever on delete instead of destroying ───────────────────────────────
-- reporter_id loses its NOT NULL: a report has to survive its reporter's
-- account deletion, and reporter_id_snapshot keeps the id for correlating
-- repeat reporters. Both RLS policies on the table key off reporter_id, so a
-- nulled row stops being visible to anyone through the API — which is the
-- intended outcome, since the only account it was ever visible to is gone.

alter table public.reports drop constraint reports_reporter_id_fkey;
alter table public.reports alter column reporter_id drop not null;
alter table public.reports add constraint reports_reporter_id_fkey
  foreign key (reporter_id) references public.profiles(id) on delete set null;

alter table public.reports drop constraint reports_reported_user_id_fkey;
alter table public.reports add constraint reports_reported_user_id_fkey
  foreign key (reported_user_id) references public.profiles(id) on delete set null;

alter table public.reports drop constraint reports_hike_id_fkey;
alter table public.reports add constraint reports_hike_id_fkey
  foreign key (hike_id) references public.hikes(id) on delete set null;

alter table public.reports drop constraint reports_comment_id_fkey;
alter table public.reports add constraint reports_comment_id_fkey
  foreign key (comment_id) references public.comments(id) on delete set null;

-- ── 5. Re-point the "some target" constraint at the snapshots ──────────────
--
-- This step is why the fix is not a one-liner. reports_target_present asserts
-- that at least one of the three target columns is set. Switching the FKs to
-- SET NULL without touching it converts the cascade bug into a worse one: a
-- report whose only target was a hike would, on deletion of that hike, have
-- all three columns nulled at once and fail the CHECK — so Postgres would
-- abort the DELETE and the user could no longer delete their own hike at all.
--
-- The snapshot columns are never nulled, so the same assertion holds there
-- permanently. Constraints are evaluated after BEFORE triggers, so the
-- snapshot is already populated by the time this is tested on insert.

alter table public.reports drop constraint reports_target_present;
alter table public.reports add constraint reports_target_present
  check (reported_user_id_snapshot is not null
      or hike_id_snapshot          is not null
      or comment_id_snapshot       is not null);

-- ── 6. Triage index ────────────────────────────────────────────────────────
-- Optional. The open queue is "pending, oldest first"; this keeps that cheap.

create index if not exists reports_status_created_at_idx
  on public.reports (status, created_at desc);

commit;


-- ── Verification ───────────────────────────────────────────────────────────
-- Read-only. Run after committing; every row of the first query should read
-- SET NULL ('n'), and the second should show the snapshot populated.

-- select con.conname, pg_get_constraintdef(con.oid)
--   from pg_constraint con
--   join pg_class c on c.oid = con.conrelid
--   join pg_namespace n on n.oid = c.relnamespace
--  where n.nspname = 'public' and c.relname = 'reports' and con.contype = 'f'
--  order by con.conname;

-- End-to-end, in a transaction that is rolled back. Substitute a real hike id
-- and its author. Expect: 1 row before, 1 row after, hike_id null, and
-- hike_id_snapshot plus reported_content_snapshot still populated.
--
-- begin;
--   insert into public.reports (reporter_id, reported_user_id, hike_id, reason)
--   values ('<reporter-uuid>', '<hike-author-uuid>', '<hike-uuid>', 'Spam');
--
--   select count(*) as before_delete from public.reports;
--   delete from public.hikes where id = '<hike-uuid>';
--   select count(*) as after_delete, hike_id, hike_id_snapshot,
--          target_kind, reported_content_snapshot
--     from public.reports group by 2,3,4,5;
-- rollback;

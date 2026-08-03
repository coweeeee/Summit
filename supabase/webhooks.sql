-- Database Webhooks that announce rows nobody can read.
--
-- `reports` and `trail_requests` are write-only from the app's point of view:
-- RLS lets the author read their own row back and there is no admin read path.
-- Without these triggers a submission arrives and sits there with nobody aware
-- of it. Both call the same `report-alert` edge function, which dispatches on
-- the `table` field in the payload.
--
-- These are not migrations and are not applied automatically. They are recorded
-- here because a Database Webhook created through the dashboard leaves no trace
-- in the repo, so the only way to know one exists is to go looking for a trigger.
--
-- THE SECRET: replace <ALERT_SECRET> with the same value the `report-alert`
-- function accepts — either REPORT_ALERT_SECRET (preferred) or the edge
-- runtime's SUPABASE_SERVICE_ROLE_KEY, which is the new-format `sb_secret_...`
-- key. It is NOT the legacy service-role JWT (`eyJ...`); those are two different
-- credentials and mixing them up is what made every delivery 401 the first time
-- round. The reports trigger below already holds a working value — copy it from
-- there rather than guessing:
--
--   select pg_get_triggerdef(oid) from pg_trigger where tgname = 'report-alert';

-- Already applied. Listed for reference only; do not re-run.
--
-- create trigger "report-alert"
--   after insert on public.reports
--   for each row
--   execute function supabase_functions.http_request(
--     'https://sigupaldsyuaomgllyvw.supabase.co/functions/v1/report-alert',
--     'POST',
--     '{"Content-type":"application/json","Authorization":"Bearer <ALERT_SECRET>"}',
--     '{}',
--     '5000'
--   );

-- Not yet applied. Run this (or create the equivalent Database Webhook in the
-- dashboard: Database -> Webhooks -> new, table public.trail_requests, event
-- INSERT, type HTTP Request, POST to the URL below, with the Authorization
-- header set).
create trigger "trail-request-alert"
  after insert on public.trail_requests
  for each row
  execute function supabase_functions.http_request(
    'https://sigupaldsyuaomgllyvw.supabase.co/functions/v1/report-alert',
    'POST',
    '{"Content-type":"application/json","Authorization":"Bearer <ALERT_SECRET>"}',
    '{}',
    '5000'
  );

-- Verify after applying, by inserting a request from the app's "can't find your
-- trail" flow and checking the channel. To confirm delivery from SQL instead:
--
--   select id, status_code, created
--   from net._http_response
--   order by created desc
--   limit 5;
--
-- pg_net does not retry, so a non-2xx here means that one alert was lost.

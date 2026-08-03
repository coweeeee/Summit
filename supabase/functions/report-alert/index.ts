// Alerts on rows that land in a table nobody can read.
//
// `reports` and `trail_requests` are both write-only from the app's point of
// view: RLS lets the author read their own row back and there is no admin read
// path, so a submission used to arrive and sit there with nobody aware of it.
// A Database Webhook on INSERT calls this function, which forwards a short
// summary to an outbound webhook (Slack or Discord) so somebody actually sees
// it. Triage still happens in the Supabase dashboard.
//
// The function is still called `report-alert` because the reports webhook
// already points at that path; renaming would mean reconfiguring a working
// alert and accepting a window where abuse reports go unannounced. It handles
// both tables, dispatching on the `table` field the webhook sends.
//
// Deploy with verify_jwt = false: the caller is Postgres, not a signed-in user.
// verify_jwt = true would not be sufficient anyway, since any signed-in user's
// JWT satisfies it. Authorization is an exact match against a project secret.
//
// WHICH secret matters, because this project runs Supabase's dual API-key
// system. `SUPABASE_SERVICE_ROLE_KEY` in the edge runtime is the new-format
// `sb_secret_...` key (41 chars), while a Database Webhook created from the
// dashboard stored the *legacy* service-role JWT (219 chars, `eyJ...`) in its
// trigger definition. Those are two different credentials, not two encodings of
// one, so that webhook could never match the env var and every delivery 401'd.
//
// Fix it from either end: re-enter the webhook's Authorization header with the
// new secret key, or set REPORT_ALERT_SECRET and send that instead. Prefer the
// second — it is scoped to this one function, survives key rotation, and avoids
// parking a full service-role credential in a trigger definition that anyone
// with database access can read.
//
// Secrets: REPORT_ALERT_WEBHOOK_URL (required, a Slack or Discord incoming
// webhook), REPORT_ALERT_SECRET (optional, a dedicated shared secret), and
// TRAIL_REQUEST_WEBHOOK_URL (optional — send trail requests to a different
// channel from abuse reports, since one is product feedback and the other is
// safety. Falls back to REPORT_ALERT_WEBHOOK_URL when unset).

const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const ALERT_SECRET = Deno.env.get('REPORT_ALERT_SECRET')
const ALERT_WEBHOOK_URL = Deno.env.get('REPORT_ALERT_WEBHOOK_URL')
const TRAIL_REQUEST_WEBHOOK_URL = Deno.env.get('TRAIL_REQUEST_WEBHOOK_URL')

const DETAILS_MAX = 500
const FIELD_MAX = 200

// Compares in time independent of how far the two strings agree, so a near miss
// can't be walked forward by timing it. Both operands are project secrets.
function secretEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Accepts only an exact match against a secret this project holds. A user's
// JWT — anon, authenticated, or otherwise — matches neither and is rejected.
function isAuthorized(req: Request): boolean {
  const presented = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!presented) return false
  if (SERVICE_ROLE_KEY && secretEquals(presented, SERVICE_ROLE_KEY)) return true
  if (ALERT_SECRET && secretEquals(presented, ALERT_SECRET)) return true
  return false
}

/**
 * Defang user-written text before it is posted into a chat channel.
 *
 * Everything passed through here is free text typed by a user and rendered to
 * a room full of people, so it is data that must not become instructions to
 * whatever renders it. Slack and Discord both turn `@everyone`/`@here` into a
 * mass ping and Discord expands `<@123>` into a real mention, so a trail named
 * "@everyone" would notify the whole server the moment it was submitted. A
 * zero-width space after the `@` leaves the text readable and stops it
 * resolving. It is written as `\u200B` rather than pasted literally, so the
 * character survives copying and is visible to whoever reads this next.
 *
 * Backticks are neutralised too, so a submission cannot open a code fence and
 * swallow the labelled fields printed after it, and newlines are collapsed so
 * it cannot forge convincing extra lines — free text containing
 * "Requested by: admin" should read as part of the note, not as a field.
 */
function sanitizeForChat(raw: string, max: number): string {
  return raw
    .slice(0, max)
    .replace(/@/g, '@\u200B')
    .replace(/`/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

type ReportRecord = {
  id?: string
  reporter_id?: string
  reported_user_id?: string | null
  hike_id?: string | null
  comment_id?: string | null
  reason?: string
  details?: string | null
  created_at?: string
}

type TrailRequestRecord = {
  id?: string
  requested_by?: string
  trail_name?: string
  location?: string | null
  notes?: string | null
  status?: string
  created_at?: string
}

function describeTarget(r: ReportRecord): string {
  if (r.comment_id) return `comment ${r.comment_id}`
  if (r.hike_id) return `hike ${r.hike_id}`
  if (r.reported_user_id) return `user ${r.reported_user_id}`
  return 'unspecified target'
}

function formatReport(record: ReportRecord): string {
  // `details` is free text written by the reporter. It is only ever displayed,
  // never interpreted, but it is truncated so one long report can't blow past
  // the receiving webhook's payload limit and drop the alert entirely.
  const details = sanitizeForChat(record.details ?? '', DETAILS_MAX)
  return [
    '🚩 New report on Summit',
    `Reason: ${sanitizeForChat(record.reason ?? 'unspecified', FIELD_MAX)}`,
    `Target: ${describeTarget(record)}`,
    `Reporter: ${record.reporter_id ?? 'unknown'}`,
    `Report id: ${record.id ?? 'unknown'}`,
    details ? `Details: ${details}` : null,
  ].filter(Boolean).join('\n')
}

function formatTrailRequest(record: TrailRequestRecord): string {
  const name = sanitizeForChat(record.trail_name ?? '', FIELD_MAX) || 'unnamed'
  const location = sanitizeForChat(record.location ?? '', FIELD_MAX)
  const notes = sanitizeForChat(record.notes ?? '', DETAILS_MAX)
  return [
    '🥾 New trail request on Summit',
    `Trail: ${name}`,
    location ? `Location: ${location}` : null,
    notes ? `Notes: ${notes}` : null,
    `Requested by: ${record.requested_by ?? 'unknown'}`,
    `Request id: ${record.id ?? 'unknown'}`,
    // Spelled out because, unlike a report, the next step is not self-evident:
    // the row stays 'pending' forever unless someone moves it by hand.
    "Triage: add the trail, then set this row's status to 'added' or 'declined'.",
  ].filter(Boolean).join('\n')
}

Deno.serve(async req => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  if (!isAuthorized(req)) {
    // Shapes only, never values. A 401 here is almost always a credential
    // *format* mismatch rather than an attack, and without this the only way to
    // tell the two apart is to redeploy a diagnostic.
    const presented = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
    console.error('rejected call to report-alert', JSON.stringify({
      presented_len: presented.length,
      presented_prefix: presented.slice(0, 3),
      service_role_key_len: SERVICE_ROLE_KEY?.length ?? 0,
      service_role_key_prefix: SERVICE_ROLE_KEY?.slice(0, 3) ?? null,
      alert_secret_configured: !!ALERT_SECRET,
    }))
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  let payload: { type?: string; table?: string; record?: ReportRecord & TrailRequestRecord }
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 })
  }

  const record = payload.record
  if (payload.type !== 'INSERT' || !record) {
    return new Response(JSON.stringify({ ok: true, skipped: 'not an insert' }), { status: 200 })
  }

  // Defaulting to reports keeps the existing webhook working even if it is ever
  // replayed without a `table` field, rather than silently dropping an abuse
  // alert on a shape change.
  const table = payload.table ?? 'reports'

  let message: string
  let webhookUrl: string | undefined
  if (table === 'trail_requests') {
    message = formatTrailRequest(record)
    webhookUrl = TRAIL_REQUEST_WEBHOOK_URL ?? ALERT_WEBHOOK_URL
  } else if (table === 'reports') {
    message = formatReport(record)
    webhookUrl = ALERT_WEBHOOK_URL
  } else {
    // Loud rather than silent: a webhook pointed here for a table nobody wrote
    // a formatter for would otherwise look like it was delivering fine.
    console.error('no formatter for table', table)
    return new Response(JSON.stringify({ ok: false, error: `unsupported table: ${table}` }), { status: 400 })
  }

  if (!webhookUrl) {
    console.error('no alert webhook configured;', table, record.id, 'was not announced')
    // Deliberately non-2xx. pg_net does not retry, but a failure is recorded in
    // net._http_response and shows up against the webhook, whereas a 200 would
    // make an unannounced row look successfully announced.
    return new Response(JSON.stringify({ ok: false, error: 'alert channel not configured' }), { status: 500 })
  }

  // Slack reads `text`, Discord reads `content`, and each ignores the other's
  // key — so one body works for whichever URL is configured.
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: message, content: message }),
  })

  if (!res.ok) {
    console.error('alert webhook rejected the message', res.status, await res.text())
    return new Response(JSON.stringify({ ok: false, error: 'alert delivery failed' }), { status: 502 })
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 })
})

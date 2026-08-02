// Alerts on new content reports.
//
// `reports` rows are only readable by the person who filed them, and there is
// no admin read path, so a report used to arrive and sit there with nobody
// aware of it. A Database Webhook on reports INSERT calls this function, which
// forwards a short summary to an outbound webhook (Slack or Discord) so the
// report is actually seen. Triage still happens in the Supabase dashboard.
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
// webhook) and REPORT_ALERT_SECRET (optional, a dedicated shared secret).

const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const ALERT_SECRET = Deno.env.get('REPORT_ALERT_SECRET')
const ALERT_WEBHOOK_URL = Deno.env.get('REPORT_ALERT_WEBHOOK_URL')

const DETAILS_MAX = 500

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

function describeTarget(r: ReportRecord): string {
  if (r.comment_id) return `comment ${r.comment_id}`
  if (r.hike_id) return `hike ${r.hike_id}`
  if (r.reported_user_id) return `user ${r.reported_user_id}`
  return 'unspecified target'
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

  let payload: { type?: string; record?: ReportRecord }
  try {
    payload = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body' }), { status: 400 })
  }

  const record = payload.record
  if (payload.type !== 'INSERT' || !record) {
    return new Response(JSON.stringify({ ok: true, skipped: 'not an insert' }), { status: 200 })
  }

  if (!ALERT_WEBHOOK_URL) {
    console.error('REPORT_ALERT_WEBHOOK_URL is not set; report', record.id, 'was not announced')
    // Deliberately non-2xx. pg_net does not retry, but a failure is recorded in
    // net._http_response and shows up against the webhook, whereas a 200 would
    // make an unannounced report look successfully announced.
    return new Response(JSON.stringify({ ok: false, error: 'alert channel not configured' }), { status: 500 })
  }

  // `details` is free text written by the reporter. It is only ever displayed,
  // never interpreted, but it is truncated so one long report can't blow past
  // the receiving webhook's payload limit and drop the alert entirely.
  const details = (record.details ?? '').slice(0, DETAILS_MAX)

  const lines = [
    '🚩 New report on Summit',
    `Reason: ${record.reason ?? 'unspecified'}`,
    `Target: ${describeTarget(record)}`,
    `Reporter: ${record.reporter_id ?? 'unknown'}`,
    `Report id: ${record.id ?? 'unknown'}`,
    details ? `Details: ${details}` : null,
  ].filter(Boolean)
  const message = lines.join('\n')

  // Slack reads `text`, Discord reads `content`, and each ignores the other's
  // key — so one body works for whichever URL is configured.
  const res = await fetch(ALERT_WEBHOOK_URL, {
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

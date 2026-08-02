// Alerts on new content reports.
//
// `reports` rows are only readable by the person who filed them, and there is
// no admin read path, so a report used to arrive and sit there with nobody
// aware of it. A Database Webhook on reports INSERT calls this function, which
// forwards a short summary to an outbound webhook (Slack or Discord) so the
// report is actually seen. Triage still happens in the Supabase dashboard.
//
// Deploy with verify_jwt = false: the caller is Postgres, not a signed-in user.
// Authorization is instead an exact match on the service role key, which the
// Database Webhook sends as its bearer token. verify_jwt = true would NOT be
// sufficient here, since any signed-in user's JWT would also satisfy it.
//
// Required secret: REPORT_ALERT_WEBHOOK_URL (a Slack or Discord incoming
// webhook). Without it the function is inert and reports nothing.

const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALERT_WEBHOOK_URL = Deno.env.get('REPORT_ALERT_WEBHOOK_URL')

const DETAILS_MAX = 500

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

  const auth = req.headers.get('Authorization') ?? ''
  if (auth !== `Bearer ${SERVICE_ROLE_KEY}`) {
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

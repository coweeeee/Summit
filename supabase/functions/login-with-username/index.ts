// Username login.
//
// `get_email_for_username` is SECURITY DEFINER and used to be executable by
// `anon`, which meant anyone holding the (public, app-bundled) anon key could
// turn a username into that account's email address. This function is the only
// caller now: it resolves the email with the service role, signs in on the
// user's behalf, and returns nothing but a session. The email never leaves the
// server.
//
// Deploy with verify_jwt = false — callers are by definition not signed in yet.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// An unknown username and a wrong password both return this, so the endpoint
// can't be used to test whether a username exists.
const REJECTED = { ok: false }

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  let body: { username?: unknown; password?: unknown }
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Invalid request body' }, 400)
  }

  const { username, password } = body
  if (typeof username !== 'string' || typeof password !== 'string' || !username || !password) {
    return json({ error: 'Invalid request body' }, 400)
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  // The RPC already compares on lower(username); normalizing here keeps this in
  // step with lib/username.ts on the client.
  const { data: email, error: lookupError } = await admin.rpc('get_email_for_username', {
    lookup_username: username.trim().toLowerCase(),
  })
  if (lookupError) return json({ error: 'Something went wrong. Please try again.' }, 500)
  if (!email) return json(REJECTED, 200)

  // Sign in through a plain anon client rather than minting a session with the
  // service role, so GoTrue applies the same password checks, rate limiting and
  // lockout rules it would for an ordinary email login.
  const anon = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: signInData, error: signInError } = await anon.auth.signInWithPassword({
    email: email as string,
    password,
  })
  if (signInError || !signInData.session) return json(REJECTED, 200)

  const { access_token, refresh_token, expires_at, expires_in, token_type } = signInData.session
  return json({ ok: true, access_token, refresh_token, expires_at, expires_in, token_type }, 200)
})

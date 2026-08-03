// Public preview data for shared links.
//
// The share landing page is unauthenticated, and `anon` holds zero table
// grants in this project -- deliberately, from the earlier audit. Rather than
// reopening those grants, this reads with the service role and returns only an
// explicitly whitelisted set of fields. Nothing reaches the page that is not
// named below.
//
// Deploy with verify_jwt = false: callers are strangers on the open web.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
      // Shared links get hit repeatedly by link unfurlers (iMessage, Slack,
      // WhatsApp all fetch independently). Cache so one popular share does not
      // become a stream of identical service-role reads.
      'Cache-Control': 'public, max-age=300',
    },
  })
}

// A missing record, a private account, and a hike belonging to a private
// account all return this. Distinguishing them would turn the endpoint into a
// username enumeration oracle, which is the same trap the username login fix
// had to avoid.
const NOT_SHAREABLE = { ok: false as const }

type PublicProfile = {
  kind: 'profile'
  username: string | null
  displayName: string | null
  bio: string | null
  avatarUrl: string | null
  hikeCount: number
  totalMiles: number
}

type PublicTrail = {
  kind: 'trail'
  name: string | null
  location: string | null
  region: string | null
  distanceMi: number | null
  elevationFt: number | null
  difficulty: string | null
  description: string | null
  tags: string[]
}

type PublicHike = {
  kind: 'hike'
  trailName: string | null
  location: string | null
  distanceMi: number | null
  elevationFt: number | null
  difficulty: string | null
  date: string | null
  authorName: string | null
  authorUsername: string | null
  authorAvatarUrl: string | null
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function loadProfile(username: string): Promise<PublicProfile | null> {
  const { data: profile } = await admin
    .from('profiles')
    .select('id, username, full_name, bio, avatar_url, is_private')
    .eq('username', username.trim().toLowerCase())
    .maybeSingle()

  // A private account is not shareable. This is the whole reason is_private is
  // read here -- a share link would otherwise publish to the open web exactly
  // what that flag exists to withhold from signed-in strangers.
  if (!profile || profile.is_private) return null

  const { data: hikes } = await admin
    .from('hikes')
    .select('distance_mi')
    .eq('user_id', profile.id)

  const rows = hikes ?? []
  return {
    kind: 'profile',
    username: profile.username,
    displayName: profile.full_name,
    bio: profile.bio,
    avatarUrl: profile.avatar_url,
    hikeCount: rows.length,
    totalMiles: Math.round(rows.reduce((sum, h) => sum + (Number(h.distance_mi) || 0), 0) * 10) / 10,
  }
}

async function loadHike(hikeId: string): Promise<PublicHike | null> {
  const { data: hike } = await admin
    .from('hikes')
    .select('user_id, trail_name, location, distance_mi, elevation_ft, difficulty, date')
    .eq('id', hikeId)
    .maybeSingle()
  if (!hike) return null

  const { data: author } = await admin
    .from('profiles')
    .select('username, full_name, avatar_url, is_private')
    .eq('id', hike.user_id)
    .maybeSingle()

  // Same rule as above, applied to the hike's owner rather than the subject.
  if (!author || author.is_private) return null

  return {
    kind: 'hike',
    trailName: hike.trail_name,
    location: hike.location,
    distanceMi: hike.distance_mi === null ? null : Number(hike.distance_mi),
    elevationFt: hike.elevation_ft === null ? null : Number(hike.elevation_ft),
    difficulty: hike.difficulty,
    date: hike.date,
    authorName: author.full_name,
    authorUsername: author.username,
    authorAvatarUrl: author.avatar_url,
  }
}

// Trails are the public catalogue, not user content -- no is_private to
// respect and nothing personal in the row. The whitelist is still explicit,
// so ingestion bookkeeping like needs_review or external_id cannot leak.
async function loadTrail(trailId: string): Promise<PublicTrail | null> {
  const { data: trail } = await admin
    .from('trails')
    .select('name, location, region, distance_mi, elevation_ft, difficulty, description, tags')
    .eq('id', trailId)
    .maybeSingle()
  if (!trail) return null

  return {
    kind: 'trail',
    name: trail.name,
    location: trail.location,
    region: trail.region,
    distanceMi: trail.distance_mi === null ? null : Number(trail.distance_mi),
    elevationFt: trail.elevation_ft === null ? null : Number(trail.elevation_ft),
    difficulty: trail.difficulty,
    description: trail.description,
    tags: Array.isArray(trail.tags) ? trail.tags.slice(0, 4) : [],
  }
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405)

  const url = new URL(req.url)
  const type = url.searchParams.get('type')
  const id = url.searchParams.get('id')
  if (!id || (type !== 'profile' && type !== 'hike' && type !== 'trail')) {
    return json({ error: 'Expected ?type=profile|hike|trail&id=...' }, 400)
  }

  try {
    const data =
      type === 'profile' ? await loadProfile(id)
      : type === 'hike' ? await loadHike(id)
      : await loadTrail(id)
    if (!data) return json(NOT_SHAREABLE, 200)
    return json({ ok: true, ...data }, 200)
  } catch (_) {
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }
})

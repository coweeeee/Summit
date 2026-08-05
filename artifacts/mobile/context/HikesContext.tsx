import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthContext'
import { sendPushNotification } from '@/lib/notifications'
import { BADGE_DEFINITIONS, isEarlyBirdStart } from '@/lib/badges'

export type DimRating = { name: string; score: number }

export type Hike = {
  id: string
  trailName: string
  location: string
  distanceMi: number
  /**
   * Null when the logger left the field blank — distinct from 0, which is a
   * real elevation. Collapsing the two is what made hike detail unable to
   * describe a flat hike as flat.
   */
  elevationFt: number | null
  durationHr?: number
  difficulty: string
  overallScore: number
  dimRatings: DimRating[]
  notes: string
  date: string
  /**
   * Condition keys from lib/trailConditions.ts — stable keys, not labels.
   *
   * Empty means nothing was recorded, which is deliberately distinguishable
   * from holding the "good" key, i.e. the hiker actively said the trail was
   * fine. Collapsing those two would leave any future aggregate with a
   * numerator and no denominator.
   */
  conditions: string[]
  user_id?: string
  trail_id?: string
  /** The linked trail's tags, for the row icon. Empty when trail_id is null. */
  trailTags?: string[]
}

type HikesContextType = {
  hikes: Hike[]
  likedIds: Set<string>
  awardedBadgeKeys: Set<string>
  loading: boolean
  addHike: (hike: Omit<Hike, 'id'> & { trailId?: string }) => Promise<{ id: string } | { error: string }>
  updateHike: (id: string, fields: Pick<Hike, 'distanceMi' | 'elevationFt' | 'durationHr' | 'difficulty' | 'notes' | 'date' | 'conditions'>) => Promise<{ id: string } | { error: string }>
  toggleLike: (hikeId: string) => Promise<void>
  refresh: () => Promise<void>
}

const HikesContext = createContext<HikesContextType>({} as HikesContextType)

function mapHike(h: any): Hike {
  return {
    id: h.id,
    trailName: h.trail_name,
    location: h.location || '',
    distanceMi: h.distance_mi || 0,
    // `?? null`, not `|| 0`: the old form turned a genuine 0 into 0 harmlessly
    // but also turned NULL into 0, which is the coercion this fix exists to
    // remove. Reading it back as null keeps unknown distinguishable from flat.
    elevationFt: h.elevation_ft ?? null,
    durationHr: h.duration_hr,
    difficulty: h.difficulty || '',
    overallScore: h.overall_score || 0,
    dimRatings: (h.dim_ratings || []).map((d: any) => ({ name: d.name, score: d.score })),
    notes: h.notes || '',
    date: h.date,
    // `|| []` covers rows written before the conditions column existed, and any
    // client reading this before the migration has been applied.
    conditions: h.conditions || [],
    user_id: h.user_id,
    trail_id: h.trail_id,
    // Embedded rather than fetched separately: the hikes.trail_id -> trails.id
    // FK lets PostgREST return this in the same round trip. Null trail_id
    // yields no row here at all, which trailIconKey treats as "no tags".
    trailTags: h.trails?.tags ?? [],
  }
}

export function HikesProvider({ children }: { children: React.ReactNode }) {
  const { session, profile } = useAuth()
  const distanceUnit = profile?.distance_unit ?? 'imperial'
  const [hikes, setHikes] = useState<Hike[]>([])
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [awardedBadgeKeys, setAwardedBadgeKeys] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const fetchHikes = async () => {
    if (!session) return []
    setLoading(true)
    const { data } = await supabase
      .from('hikes')
      .select('*, dim_ratings(*), trails(tags)')
      .eq('user_id', session.user.id)
      .order('date', { ascending: false })
    const mapped = data ? data.map(mapHike) : []
    setHikes(mapped)
    setLoading(false)
    return mapped
  }

  const fetchBadges = async () => {
    if (!session) return new Set<string>()
    const { data } = await supabase
      .from('user_badges')
      .select('badge_key')
      .eq('user_id', session.user.id)
    const keys = new Set<string>((data || []).map((r: any) => r.badge_key))
    setAwardedBadgeKeys(keys)
    return keys
  }

  // `user_badges` is the permanent record of what's been earned; the checks in
  // BADGE_DEFINITIONS only decide *when* to award. The client can't write that
  // table (there's no INSERT policy) - the send-notification edge function
  // records the award with the service role and is idempotent on
  // (user_id, badge_key), so re-sending an already-awarded badge is a no-op.
  //
  // Anything earned but not yet recorded is re-sent here rather than assumed
  // saved, so a dropped award call - or a badge earned before awards were
  // recorded at all - heals on the next load instead of silently never landing.
  const syncBadges = async (currentHikes: Hike[]) => {
    if (!session) return
    const awarded = await fetchBadges()
    const hikeCount = currentHikes.length
    // Unrecorded elevation contributes nothing rather than NaN-ing the total
    // and silently costing somebody a badge they had earned.
    const totalElevFt = currentHikes.reduce((s, h) => s + (h.elevationFt ?? 0), 0)
    const hasEarlyHike = currentHikes.some(h => isEarlyBirdStart(h.date))

    const missing = BADGE_DEFINITIONS.filter(
      b => b.check(hikeCount, totalElevFt, hasEarlyHike) && !awarded.has(b.key)
    )
    if (missing.length === 0) return

    await Promise.all(
      missing.map(b =>
        sendPushNotification({
          targetUserId: session.user.id,
          type: 'milestone',
          title: 'Badge earned!',
          body: `You earned the ${b.announce(distanceUnit)}`,
          badgeKey: b.key,
        })
      )
    )
    await fetchBadges()
  }

  const fetchLikes = async () => {
    if (!session) return
    const { data } = await supabase
      .from('likes')
      .select('hike_id')
      .eq('user_id', session.user.id)
    if (data) setLikedIds(new Set(data.map((l: any) => l.hike_id)))
  }

  useEffect(() => {
    if (session) {
      fetchHikes().then(syncBadges)
      fetchLikes()
    } else {
      setHikes([])
      setLikedIds(new Set())
      setAwardedBadgeKeys(new Set())
    }
  }, [session?.user.id])

  const addHike = async (hike: Omit<Hike, 'id'> & { trailId?: string }) => {
    if (!session) return { error: 'Not signed in.' }
    const { data: hikeData, error } = await supabase
      .from('hikes')
      .insert({
        user_id: session.user.id,
        trail_name: hike.trailName,
        location: hike.location,
        distance_mi: hike.distanceMi,
        elevation_ft: hike.elevationFt,
        duration_hr: hike.durationHr,
        difficulty: hike.difficulty,
        overall_score: hike.overallScore,
        notes: hike.notes,
        date: hike.date || new Date().toISOString(),
        conditions: hike.conditions ?? [],
        trail_id: hike.trailId || null,
      })
      .select()
      .single()

    if (error || !hikeData) return { error: error?.message || 'Could not save hike.' }

    let dimRatingsError: string | undefined
    if (hike.dimRatings && hike.dimRatings.length > 0) {
      const { error: dimError } = await supabase.from('dim_ratings').insert(
        hike.dimRatings.map(d => ({ hike_id: hikeData.id, name: d.name, score: d.score }))
      )
      if (dimError) dimRatingsError = dimError.message
    }
    // Recomputing from the refreshed list rather than from a predicted count
    // keeps the award decision consistent with what's actually persisted.
    await syncBadges(await fetchHikes())

    return dimRatingsError ? { error: `Hike saved, but ratings failed to save: ${dimRatingsError}` } : { id: hikeData.id }
  }

  /**
   * Edit the factual fields of an existing hike.
   *
   * Deliberately narrower than addHike: no trail, ratings or photos. Ratings
   * are excluded because dim_ratings has INSERT and UPDATE policies but no
   * DELETE, so un-rating a dimension would fail silently — that needs a
   * migration before an edit screen can honestly offer it.
   *
   * RLS already restricts UPDATE to your own rows, so the eq(user_id) below is
   * belt and braces rather than the actual guard — it turns a policy violation
   * into a plain "no rows matched" instead of a confusing error.
   *
   * Ends in the same syncBadges(fetchHikes()) as addHike, which is what lets an
   * edited start time newly earn Early Bird. Badges are never revoked, so an
   * edit that stops qualifying keeps the badge — see CLAUDE.md.
   */
  const updateHike = async (
    id: string,
    fields: Pick<Hike, 'distanceMi' | 'elevationFt' | 'durationHr' | 'difficulty' | 'notes' | 'date' | 'conditions'>,
  ) => {
    if (!session) return { error: 'Not signed in.' }
    const { data, error } = await supabase
      .from('hikes')
      .update({
        distance_mi: fields.distanceMi,
        elevation_ft: fields.elevationFt,
        duration_hr: fields.durationHr ?? null,
        difficulty: fields.difficulty,
        notes: fields.notes,
        date: fields.date,
        // Editable, and that is the whole reason for an array column: removing
        // a tag here is an UPDATE, which `hikes` has a policy for. A child
        // table would have needed a DELETE policy, which `dim_ratings` lacks —
        // the exact reason ratings are still not editable.
        conditions: fields.conditions ?? [],
      })
      .eq('id', id)
      .eq('user_id', session.user.id)
      .select('id')
      .maybeSingle()

    if (error) return { error: error.message }
    // No row came back: either it is not yours or it no longer exists. Both are
    // worth saying out loud rather than reporting a success that did nothing.
    if (!data) return { error: 'That hike could not be updated.' }

    await syncBadges(await fetchHikes())
    return { id }
  }

  const refresh = async () => {
    await syncBadges(await fetchHikes())
  }

  const toggleLike = async (hikeId: string) => {
    if (!session) return
    const isLiked = likedIds.has(hikeId)
    if (isLiked) {
      await supabase.from('likes').delete()
        .eq('user_id', session.user.id).eq('hike_id', hikeId)
      setLikedIds(prev => { const next = new Set(prev); next.delete(hikeId); return next })
    } else {
      await supabase.from('likes').insert({ user_id: session.user.id, hike_id: hikeId })
      setLikedIds(prev => new Set([...prev, hikeId]))
    }
  }

  return (
    <HikesContext.Provider value={{ hikes, likedIds, awardedBadgeKeys, loading, addHike, updateHike, toggleLike, refresh }}>
      {children}
    </HikesContext.Provider>
  )
}

export const useHikes = () => useContext(HikesContext)

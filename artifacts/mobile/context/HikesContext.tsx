import React, { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from './AuthContext'
import { sendPushNotification } from '@/lib/notifications'
import { BADGE_DEFINITIONS } from '@/lib/badges'

export type DimRating = { name: string; score: number }

export type Hike = {
  id: string
  trailName: string
  location: string
  distanceMi: number
  elevationFt: number
  durationHr?: number
  difficulty: string
  overallScore: number
  dimRatings: DimRating[]
  notes: string
  date: string
  user_id?: string
  trail_id?: string
}

type HikesContextType = {
  hikes: Hike[]
  likedIds: Set<string>
  loading: boolean
  addHike: (hike: Omit<Hike, 'id'> & { trailId?: string }) => Promise<void>
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
    elevationFt: h.elevation_ft || 0,
    durationHr: h.duration_hr,
    difficulty: h.difficulty || '',
    overallScore: h.overall_score || 0,
    dimRatings: (h.dim_ratings || []).map((d: any) => ({ name: d.name, score: d.score })),
    notes: h.notes || '',
    date: h.date,
    user_id: h.user_id,
    trail_id: h.trail_id,
  }
}

export function HikesProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth()
  const [hikes, setHikes] = useState<Hike[]>([])
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  const fetchHikes = async () => {
    if (!session) return
    setLoading(true)
    const { data } = await supabase
      .from('hikes')
      .select('*, dim_ratings(*)')
      .eq('user_id', session.user.id)
      .order('date', { ascending: false })
    if (data) setHikes(data.map(mapHike))
    setLoading(false)
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
      fetchHikes()
      fetchLikes()
    } else {
      setHikes([])
      setLikedIds(new Set())
    }
  }, [session?.user.id])

  const addHike = async (hike: Omit<Hike, 'id'> & { trailId?: string }) => {
    if (!session) return
    const prevCount = hikes.length
    const prevElevFt = hikes.reduce((s, h) => s + h.elevationFt, 0)
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
        trail_id: hike.trailId || null,
      })
      .select()
      .single()

    if (error || !hikeData) return

    if (hike.dimRatings && hike.dimRatings.length > 0) {
      await supabase.from('dim_ratings').insert(
        hike.dimRatings.map(d => ({ hike_id: hikeData.id, name: d.name, score: d.score }))
      )
    }
    await fetchHikes()

    const { count } = await supabase
      .from('hikes')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
    const newCount = count ?? prevCount + 1
    const newElevFt = prevElevFt + (hike.elevationFt || 0)

    BADGE_DEFINITIONS.forEach(badge => {
      const wasUnlocked = badge.check(prevCount, prevElevFt)
      const isUnlocked = badge.check(newCount, newElevFt)
      if (!wasUnlocked && isUnlocked) {
        sendPushNotification({
          targetUserId: session.user.id,
          type: 'milestone',
          title: 'Badge earned!',
          body: `You earned the ${badge.label}`,
          badgeKey: badge.key,
        })
      }
    })
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
    <HikesContext.Provider value={{ hikes, likedIds, loading, addHike, toggleLike, refresh: fetchHikes }}>
      {children}
    </HikesContext.Provider>
  )
}

export const useHikes = () => useContext(HikesContext)

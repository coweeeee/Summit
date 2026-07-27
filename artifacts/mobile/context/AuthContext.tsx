import React, { createContext, useContext, useEffect, useState } from 'react'
  import { Session } from '@supabase/supabase-js'
  import { Alert } from 'react-native'
  import { supabase } from '@/lib/supabase'
  import { LEGAL_TERMS_VERSION } from '@/constants/legal'
  import { isValidUsername, normalizeUsername } from '@/lib/username'

  export type Profile = {
    id: string
    username: string | null
    full_name: string | null
    bio: string | null
    avatar_url: string | null
    created_at: string
    distance_unit: 'imperial' | 'metric'
    notif_likes: boolean
    notif_follows: boolean
    notif_milestones: boolean
    notif_comments: boolean
    is_private: boolean
  }

  type AuthContextType = {
    session: Session | null
    profile: Profile | null
    loading: boolean
    networkError: boolean
    signIn: (email: string, password: string) => Promise<boolean>
    signUp: (email: string, password: string, fullName: string, username: string, termsAccepted: boolean) => Promise<{ ok: boolean; usernameConflict?: boolean }>
    claimUsername: (username: string) => Promise<{ ok: boolean; conflict?: boolean; invalid?: boolean }>
    signOut: () => Promise<void>
    refreshProfile: () => Promise<void>
    retryAuth: () => void
  }

  const AuthContext = createContext<AuthContextType>({} as AuthContextType)

  function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('auth_timeout')), ms)
      ),
    ])
  }

  export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [session, setSession] = useState<Session | null>(null)
    const [profile, setProfile] = useState<Profile | null>(null)
    const [loading, setLoading] = useState(true)
    const [networkError, setNetworkError] = useState(false)
    const [retryKey, setRetryKey] = useState(0)

    // Returns whether the profile actually loaded. A silent failure here used to
    // leave `profile` null forever, which every screen reads as "imperial" and
    // which turns every Settings toggle into a no-op — with nothing shown to the
    // user. Callers decide how loudly to fail.
    const fetchProfile = async (userId: string): Promise<boolean> => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()
        if (error || !data) {
          console.warn('profile fetch failed', error?.message)
          return false
        }
        setProfile(data)
        return true
      } catch (e: any) {
        console.warn('profile fetch failed', e?.message)
        return false
      }
    }

    useEffect(() => {
      setLoading(true)
      setNetworkError(false)

      withTimeout(supabase.auth.getSession(), 10_000)
        .then(async ({ data: { session } }) => {
          setSession(session)
          // Awaited, so the app never renders past the gate with a session but
          // no profile. A profile that won't load surfaces the same retry screen
          // as an unreachable server rather than silently wrong preferences.
          if (session && !(await fetchProfile(session.user.id))) {
            setNetworkError(true)
          }
          setLoading(false)
        })
        .catch(() => {
          setNetworkError(true)
          setLoading(false)
        })

      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
        setSession(session)
        if (session) fetchProfile(session.user.id)
        else setProfile(null)
      })

      return () => subscription.unsubscribe()
    }, [retryKey])

    const retryAuth = () => {
      setNetworkError(false)
      setLoading(true)
      setRetryKey(k => k + 1)
    }

    const signIn = async (email: string, password: string): Promise<boolean> => {
      try {
        const { error } = await withTimeout(
          supabase.auth.signInWithPassword({ email, password }),
          15_000
        )
        if (error) { Alert.alert('Login failed', error.message); return false }
        return true
      } catch (e: any) {
        Alert.alert('Login failed', e?.message === 'auth_timeout' ? 'Connection timed out. Please try again.' : 'Unexpected error.')
        return false
      }
    }

    const signUp = async (email: string, password: string, fullName: string, username: string, termsAccepted: boolean): Promise<{ ok: boolean; usernameConflict?: boolean }> => {
      if (!termsAccepted) {
        Alert.alert('Sign up failed', 'You must accept the Privacy Policy and Terms of Service to create an account.')
        return { ok: false }
      }
      try {
        const { data, error } = await withTimeout(
          supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: fullName,
                username,
                terms_accepted_at: new Date().toISOString(),
                terms_version: LEGAL_TERMS_VERSION,
              },
            },
          }),
          15_000
        )
        if (error) { Alert.alert('Sign up failed', error.message); return { ok: false } }

        const userId = data.user?.id
        if (userId && username) {
          // The profiles row is created asynchronously by a DB trigger on auth.users,
          // so retry briefly until it exists before setting the chosen username.
          for (let attempt = 0; attempt < 5; attempt++) {
            const { error: updateError } = await supabase
              .from('profiles')
              .update({ username })
              .eq('id', userId)
            if (!updateError) break
            if (updateError.code === '23505') {
              return { ok: true, usernameConflict: true }
            }
            await new Promise(r => setTimeout(r, 400))
          }
        }
        return { ok: true }
      } catch (e: any) {
        Alert.alert('Sign up failed', e?.message === 'auth_timeout' ? 'Connection timed out. Please try again.' : 'Unexpected error.')
        return { ok: false }
      }
    }

    // The only supported way to write `profiles.username`. Normalizes, validates
    // and checks availability before writing, so every caller gets the same
    // rules and the same conflict handling instead of a raw Postgres error.
    const claimUsername = async (username: string): Promise<{ ok: boolean; conflict?: boolean; invalid?: boolean }> => {
      if (!session) return { ok: false }

      const normalized = normalizeUsername(username)
      if (!isValidUsername(normalized)) return { ok: false, invalid: true }

      // `is_username_available` counts the caller's own row, so an unchanged
      // username would otherwise report itself as taken.
      if (normalized !== profile?.username) {
        const { data: available, error: checkError } = await supabase
          .rpc('is_username_available', { check_username: normalized })
        if (checkError) {
          Alert.alert('Could not save username', 'Could not check availability. Please try again.')
          return { ok: false }
        }
        if (!available) return { ok: false, conflict: true }
      }

      const { error } = await supabase.from('profiles').update({ username: normalized }).eq('id', session.user.id)
      if (error) {
        if (error.code === '23505') return { ok: false, conflict: true }
        Alert.alert('Could not save username', error.message)
        return { ok: false }
      }
      await fetchProfile(session.user.id)
      return { ok: true }
    }

    const signOut = async () => {
      await supabase.auth.signOut()
    }

    const refreshProfile = async () => {
      if (session) await fetchProfile(session.user.id)
    }

    return (
      <AuthContext.Provider value={{ session, profile, loading, networkError, signIn, signUp, claimUsername, signOut, refreshProfile, retryAuth }}>
        {children}
      </AuthContext.Provider>
    )
  }

  export const useAuth = () => useContext(AuthContext)
  
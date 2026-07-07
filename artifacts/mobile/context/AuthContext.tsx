import React, { createContext, useContext, useEffect, useState } from 'react'
  import { Session } from '@supabase/supabase-js'
  import { Alert } from 'react-native'
  import { supabase } from '@/lib/supabase'

  export type Profile = {
    id: string
    username: string | null
    full_name: string | null
    bio: string | null
  }

  type AuthContextType = {
    session: Session | null
    profile: Profile | null
    loading: boolean
    networkError: boolean
    signIn: (email: string, password: string) => Promise<boolean>
    signUp: (email: string, password: string, fullName: string) => Promise<boolean>
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

    const fetchProfile = async (userId: string) => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()
        if (data) setProfile(data)
      } catch (_) {}
    }

    useEffect(() => {
      setLoading(true)
      setNetworkError(false)

      withTimeout(supabase.auth.getSession(), 10_000)
        .then(({ data: { session } }) => {
          setSession(session)
          if (session) fetchProfile(session.user.id)
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

    const signUp = async (email: string, password: string, fullName: string): Promise<boolean> => {
      try {
        const { error } = await withTimeout(
          supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } }),
          15_000
        )
        if (error) { Alert.alert('Sign up failed', error.message); return false }
        return true
      } catch (e: any) {
        Alert.alert('Sign up failed', e?.message === 'auth_timeout' ? 'Connection timed out. Please try again.' : 'Unexpected error.')
        return false
      }
    }

    const signOut = async () => {
      await supabase.auth.signOut()
    }

    const refreshProfile = async () => {
      if (session) await fetchProfile(session.user.id)
    }

    return (
      <AuthContext.Provider value={{ session, profile, loading, networkError, signIn, signUp, signOut, refreshProfile, retryAuth }}>
        {children}
      </AuthContext.Provider>
    )
  }

  export const useAuth = () => useContext(AuthContext)
  
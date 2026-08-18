import React, { createContext, useContext, useEffect, useState } from 'react'
  import AsyncStorage from '@react-native-async-storage/async-storage'
  import { Session } from '@supabase/supabase-js'
  import * as Linking from 'expo-linking'
  import { Alert } from 'react-native'
  import { supabase } from '@/lib/supabase'
  import { LEGAL_TERMS_VERSION } from '@/constants/legal'
  import { acceptedVersionFrom, needsReacceptance } from '@/lib/legalAcceptance'
  import { isValidUsername, normalizeUsername } from '@/lib/username'

  export type Profile = {
    id: string
    username: string | null
    full_name: string | null
    bio: string | null
    avatar_url: string | null
    /** Key into AVATAR_PRESETS. Mutually exclusive with avatar_url. */
    avatar_preset: string | null
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
    signInWithIdentifier: (identifier: string, password: string) => Promise<boolean>
    signUp: (email: string, password: string, fullName: string, username: string, termsAccepted: boolean) => Promise<{ ok: boolean; usernameConflict?: boolean }>
    claimUsername: (username: string) => Promise<{ ok: boolean; conflict?: boolean; invalid?: boolean }>
    signOut: () => Promise<void>
    refreshProfile: () => Promise<void>
    retryAuth: () => void
    /** Signed in, but has not accepted the current LEGAL_TERMS_VERSION. */
    termsOutOfDate: boolean
    acceptCurrentTerms: () => Promise<boolean>
    /** Emails a recovery link. Resolves true if the request itself succeeded. */
    sendPasswordReset: (email: string) => Promise<boolean>
    /**
     * True while a recovery link has put the app in a session that exists only
     * to set a new password. The app must not behave as normally signed in.
     */
    recoveryMode: boolean
    beginRecovery: (accessToken: string, refreshToken: string) => Promise<boolean>
    /** Sets the new password and leaves recovery mode. */
    completeRecovery: (newPassword: string) => Promise<boolean>
    cancelRecovery: () => Promise<void>
  }

  const AuthContext = createContext<AuthContextType>({} as AuthContextType)

  /**
   * Whether supabase-js still has a session persisted locally.
   *
   * Read straight from storage rather than through the client, because this
   * exists precisely to second-guess `getSession()` when it reports no session.
   * supabase-js keys the entry `sb-<project-ref>-auth-token`, so it is matched
   * by shape instead of by reconstructing the ref from the URL.
   *
   * A refresh token surviving here means the user never signed out -- signOut()
   * clears the entry, and so does a refresh the server actively rejects. What
   * it cannot clear is a refresh that never reached the server at all, which is
   * the case this distinguishes.
   */
  async function hasPersistedSession(): Promise<boolean> {
    try {
      const keys = await AsyncStorage.getAllKeys()
      const authKey = keys.find(k => /^sb-.+-auth-token$/.test(k))
      if (!authKey) return false
      const raw = await AsyncStorage.getItem(authKey)
      if (!raw) return false
      return !!JSON.parse(raw)?.refresh_token
    } catch {
      // Unreadable or malformed storage is not evidence of a session.
      return false
    }
  }

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
    const [recoveryMode, setRecoveryMode] = useState(false)
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
          if (!session) {
            // getSession() resolves with a null session in two very different
            // situations: the user is genuinely signed out, or it could not
            // reach the server to refresh and swallowed the network error.
            // Treating both as "signed out" bounced offline users with a
            // perfectly valid session to a login form they cannot use without
            // a network. A persisted refresh token tells the two apart.
            if (await hasPersistedSession()) {
              setNetworkError(true)
              setLoading(false)
              return
            }
            setSession(null)
            setLoading(false)
            return
          }

          setSession(session)
          // Awaited, so the app never renders past the gate with a session but
          // no profile. A profile that won't load surfaces the same retry screen
          // as an unreachable server rather than silently wrong preferences.
          if (!(await fetchProfile(session.user.id))) {
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

    // Username login goes through the `login-with-username` edge function, which
    // resolves the email server-side so it is never returned to the client.
    // Email login stays on the client: there is nothing to hide, and routing it
    // through the function would take all logins down whenever it is down.
    const signInWithIdentifier = async (identifier: string, password: string): Promise<boolean> => {
      const raw = identifier.trim()
      if (raw.includes('@')) return signIn(raw, password)

      try {
        const { data, error } = await withTimeout(
          supabase.functions.invoke('login-with-username', {
            body: { username: normalizeUsername(raw), password },
          }),
          15_000
        )
        if (error) { Alert.alert('Login failed', 'Could not reach the server. Please try again.'); return false }
        if (!data?.ok) { Alert.alert('Login failed', 'Incorrect username or password.'); return false }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: data.access_token,
          refresh_token: data.refresh_token,
        })
        if (sessionError) { Alert.alert('Login failed', sessionError.message); return false }
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

    const sendPasswordReset = async (email: string): Promise<boolean> => {
      // Points at /login, which is a real route, NOT at /reset-password, which
      // deliberately is not one -- the reset screen lives in components/ so it
      // cannot be opened by URL. Sending the link to a path with no route makes
      // expo-router show its "Oops!" unmatched screen behind the alert. The
      // path is only a landing spot; what matters is the fragment, which the
      // listener in _layout.tsx reads to start recovery.
      //
      // Only the `summit://` scheme is ever produced here, including in a dev
      // client. Verified rather than assumed: expo-linking contains no `exp+`
      // construction anywhere, resolveScheme returns app.json's `scheme`
      // ('summit'), and an instrumented run in the dev client emitted
      // `summit:///login` with hostUri present but unused. `exp+summit://` is
      // registered in Info.plist by the expo-dev-client plugin for the LAUNCHER
      // url only, and Release excludes the dev client entirely -- it does not
      // need allow-listing and never did.
      // NO LEADING SLASH:
      //   createURL('/login') -> summit:///login   (empty host, path /login)
      //   createURL('login')  -> summit://login    (host `login`, no path)
      // Both verified by logging the real call in a dev client.
      //
      // THE SHAPE WAS NEVER THE WHOLE BUG, and an earlier version of this
      // comment claimed `summit://**` was already allow-listed. IT IS NOT.
      // Password reset kept failing on build 1.0.0 (3), which contains the
      // no-leading-slash fix, and the reason is configuration rather than code:
      // `summit://login` is absent from Supabase Auth > URL Configuration >
      // Redirect URLs, so GoTrue discards it and falls back to Site URL -- the
      // Vercel share host -- and the emailed link opens a browser there with a
      // perfectly valid recovery fragment that never reaches the app.
      //
      // Proven against the live project by probing /verify with a junk token,
      // which still honours redirect_to for an ALLOW-LISTED target and falls
      // back for an unlisted one. No email and no user data involved:
      //
      //   curl -sSD - -o /dev/null \
      //     "$SUPABASE_URL/auth/v1/verify?token=INVALIDPROBE&type=recovery\
      //      &redirect_to=<url-encoded target>" | grep -i '^location:'
      //
      //   https://<site>/DISCRIMINATOR -> echoed back  (redirect_to IS honoured)
      //   summit://login               -> Site URL     (rejected)
      //   summit://                    -> Site URL     (rejected)
      //   https://not-allowed.example  -> Site URL     (rejected, control)
      //
      // Re-run that probe after adding the entry: `summit://login` echoing back
      // instead of the Site URL is the confirmation, and it does not need a
      // real recovery email to check.
      const redirectTo = Linking.createURL('login')
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
      if (error) {
        // Deliberately not surfaced to the caller as "no such account" -- see
        // the screen, which reports the same thing either way so this cannot be
        // used to test whether an address is registered.
        console.warn('password reset request failed', error.message)
        return false
      }
      return true
    }

    const beginRecovery = async (accessToken: string, refreshToken: string): Promise<boolean> => {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      })
      if (error) {
        Alert.alert('Link expired', 'That reset link is no longer valid. Please request a new one.')
        return false
      }
      setRecoveryMode(true)
      return true
    }

    const completeRecovery = async (newPassword: string): Promise<boolean> => {
      const { error } = await supabase.auth.updateUser({ password: newPassword })
      if (error) {
        Alert.alert('Could not set password', error.message)
        return false
      }
      // Cleared only after the update succeeds. Clearing first would drop the
      // user into the app on a recovery session with the old password intact.
      setRecoveryMode(false)
      return true
    }

    const cancelRecovery = async () => {
      // Sign out rather than just lowering the flag: the recovery session is a
      // real session, and leaving it live would mean backing out of the reset
      // screen lands you inside the account without ever proving the password.
      setRecoveryMode(false)
      await supabase.auth.signOut()
    }

    // Only meaningful once a session exists -- a signed-out user is heading to
    // the signup screen, which collects acceptance on its own.
    const termsOutOfDate = !!session && needsReacceptance(acceptedVersionFrom(session.user.user_metadata))

    const acceptCurrentTerms = async (): Promise<boolean> => {
      if (!session) return false
      // Writes to auth user metadata, the same place signUp records it -- see
      // lib/legalAcceptance.ts for why that is the store and what it is not.
      // updateUser emits USER_UPDATED, which the onAuthStateChange listener
      // above turns into a fresh session, so termsOutOfDate recomputes without
      // any extra refresh here.
      const { error } = await supabase.auth.updateUser({
        data: {
          terms_version: LEGAL_TERMS_VERSION,
          terms_accepted_at: new Date().toISOString(),
        },
      })
      if (error) {
        Alert.alert('Could not save', 'We could not record your acceptance. Please try again.')
        return false
      }
      return true
    }

    return (
      <AuthContext.Provider value={{ session, profile, loading, networkError, signInWithIdentifier, signUp, claimUsername, signOut, refreshProfile, retryAuth, termsOutOfDate, acceptCurrentTerms, sendPasswordReset, recoveryMode, beginRecovery, completeRecovery, cancelRecovery }}>
        {children}
      </AuthContext.Provider>
    )
  }

  export const useAuth = () => useContext(AuthContext)
  
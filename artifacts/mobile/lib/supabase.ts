import AsyncStorage from '@react-native-async-storage/async-storage'
  import { createClient } from '@supabase/supabase-js'

  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY

  const missing = [
    supabaseUrl ? null : 'EXPO_PUBLIC_SUPABASE_URL',
    supabaseAnonKey ? null : 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  ].filter((name): name is string => name !== null)

  /**
   * Null when the build has credentials; otherwise names what is missing.
   *
   * This module deliberately does not throw at import time. A clean checkout,
   * CI, or an EAS build with no secrets has neither variable, and the previous
   * `!` assertions handed `undefined` straight to createClient. That throws
   * while app/_layout.tsx is still evaluating its own imports -- before
   * RootLayout renders, so outside <ErrorBoundary>, which cannot catch it. The
   * splash was already held by preventAutoHideAsync and hideAsync only ran off
   * the font effect, so the whole failure surfaced as a permanent hang with no
   * message anywhere. Reporting the problem as a value lets _layout.tsx render
   * it instead.
   */
  export const supabaseConfigError: string | null =
    missing.length === 0
      ? null
      : `${missing.join(' and ')} ${missing.length === 1 ? 'is' : 'are'} not set; this build has no backend credentials.`

  function unconfigured(): never {
    throw new Error(`Supabase is not configured: ${supabaseConfigError}`)
  }

  // Backstop for any entry point that reaches the client anyway -- a named,
  // legible throw at the call site rather than a stray "Invalid URL" from deep
  // inside supabase-js.
  export const supabase = supabaseConfigError
    ? (new Proxy({}, { get: unconfigured }) as ReturnType<typeof createClient>)
    : createClient(supabaseUrl!, supabaseAnonKey!, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: false,
        },
      })

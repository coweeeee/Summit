// Password recovery: parsing the link Supabase emails, and the password rules.
//
// Why this is parsed by hand. lib/supabase.ts sets `detectSessionInUrl: false`,
// which is correct for React Native -- there is no browser URL for the client to
// read. The cost is that nothing picks the recovery tokens out of the deep link
// automatically, so the app has to do it and call setSession itself.
//
// Supabase's verify endpoint redirects to `summit://reset-password` with the
// tokens in the URL FRAGMENT, not the query string. That matters: a fragment is
// never sent to a server, so the tokens stay out of request logs on the way
// through. Keep them there -- do not "tidy" this into a query parameter.

/** Minimum password length. Matches the signup check in app/signup.tsx. */
export const MIN_PASSWORD_LENGTH = 6;

export type RecoveryLink =
  | { kind: "recovery"; accessToken: string; refreshToken: string }
  | { kind: "error"; message: string }
  | { kind: "unrelated" };

/**
 * Classifies an incoming deep link.
 *
 * Three outcomes rather than two, because an expired or already-used link is
 * the single most common real-world case: Supabase redirects with `error` and
 * `error_description` in the same fragment, and treating that as "unrelated"
 * would drop the user on the login screen with no idea why the link did
 * nothing.
 */
export function parseRecoveryLink(url: string): RecoveryLink {
  const hashIndex = url.indexOf("#");
  if (hashIndex === -1) return { kind: "unrelated" };

  const params = new URLSearchParams(url.slice(hashIndex + 1));

  const error = params.get("error") ?? params.get("error_code");
  if (error) {
    const description = params.get("error_description");
    return {
      kind: "error",
      // Supabase sends the description plus-encoded; URLSearchParams already
      // decodes it, so this is displayable as-is.
      message: description && description.length > 0 ? description : error,
    };
  }

  if (params.get("type") !== "recovery") return { kind: "unrelated" };

  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");
  // Both are required: setSession cannot establish a usable session from one.
  if (!accessToken || !refreshToken) return { kind: "unrelated" };

  return { kind: "recovery", accessToken, refreshToken };
}

/**
 * Returns a message to show, or null when the password is acceptable.
 *
 * Returns a reason rather than a boolean so the screen never has to guess which
 * of the two rules was broken.
 */
export function passwordProblem(password: string, confirmation: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password !== confirmation) return "Those passwords don't match.";
  return null;
}

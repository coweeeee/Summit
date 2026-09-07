// ES256 developer-token signing for Apple WeatherKit REST.
//
// No dependency. Web Crypto already emits the exact 64-byte r||s (IEEE P1363)
// form that JWS ES256 requires, so there is NO DER unwrapping step here -- that
// is the trap this file exists to not fall into. If you ever see a 70-72 byte
// variable-length signature, something handed you DER and it must be unwrapped;
// the length guard below turns that into a loud error instead of a 401 from
// Apple that tells you nothing.
//
// Every claim below is from Apple's own spec, read via the DocC JSON backing
// endpoints because the HTML pages render as empty shells:
//   https://developer.apple.com/tutorials/data/documentation/weatherkitrestapi/request-authentication-for-weatherkit-rest-api.json

const enc = new TextEncoder();

/** RFC 7515 App. C base64url — base64, '+'->'-', '/'->'_', padding stripped. */
function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
const b64urlText = (s: string) => b64url(enc.encode(s));

/**
 * PEM -> PKCS#8 DER.
 *
 * The \n unescape MUST run before the whitespace strip. A secret pasted through
 * a shell often arrives with literal two-character backslash-n, which is not
 * whitespace, so /\s+/ would leave it inside the base64 body and atob() throws
 * a completely unhelpful InvalidCharacterError.
 *
 * NOTE ON WHAT IS AND IS NOT DOCUMENTED: Apple states only that the key
 * downloads as "a text file with a .p8 file extension". That it is PEM-wrapped
 * PKCS#8 on P-256 is an inference from ES256 plus every third-party client, not
 * an Apple guarantee. So this asserts the format loudly rather than assuming it
 * -- if Apple ever hands over SEC1 ("BEGIN EC PRIVATE KEY"), importKey('pkcs8')
 * would reject it and the message below says why.
 */
function pemToPkcs8Der(pem: string): Uint8Array {
  const normalized = pem.replace(/\\n/g, "\n").replace(/\r/g, "").trim();
  const m = normalized.match(/-----BEGIN PRIVATE KEY-----([\s\S]+?)-----END PRIVATE KEY-----/);
  if (!m) {
    throw new Error(
      "APPLE_WEATHERKIT_PRIVATE_KEY is not a PKCS#8 PEM (expected '-----BEGIN PRIVATE KEY-----'). " +
        "'BEGIN EC PRIVATE KEY' is SEC1 and will not import.",
    );
  }
  const b64 = m[1].replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
    throw new Error(
      "APPLE_WEATHERKIT_PRIVATE_KEY body has non-base64 characters — the secret is probably still escaped",
    );
  }
  const bin = atob(b64);
  const der = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) der[i] = bin.charCodeAt(i);
  return der;
}

// Module scope survives across requests in a warm isolate, so the key is
// imported once rather than per call.
let cachedKey: CryptoKey | null = null;

async function getSigningKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const pem = Deno.env.get("APPLE_WEATHERKIT_PRIVATE_KEY");
  if (!pem) throw new Error("APPLE_WEATHERKIT_PRIVATE_KEY is not set");
  cachedKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8Der(pem),
    { name: "ECDSA", namedCurve: "P-256" }, // ES256 = ECDSA + P-256 + SHA-256
    false,
    ["sign"],
  );
  return cachedKey;
}

async function signES256(header: Record<string, unknown>, payload: Record<string, unknown>): Promise<string> {
  const key = await getSigningKey();
  const signingInput = `${b64urlText(JSON.stringify(header))}.${b64urlText(JSON.stringify(payload))}`;

  const raw = new Uint8Array(
    // The hash belongs in the SIGN parameters, not the import parameters.
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(signingInput)),
  );

  if (raw.byteLength !== 64) {
    throw new Error(`expected a 64-byte P1363 ECDSA signature, got ${raw.byteLength} — looks like DER`);
  }
  return `${signingInput}.${b64url(raw)}`;
}

/**
 * A WeatherKit developer token.
 *
 * The claim shape is exact and Apple is strict about it:
 *   header  { alg: "ES256", kid: <10-char Key ID>, id: "<TeamID>.<ServiceID>" }
 *   payload { iss: <TeamID>, iat, exp, sub: <ServiceID> }
 *
 * Two things that are easy to get backwards and both produce a bare 401:
 *  - `iss` is the TEAM ID and `sub` is the SERVICE ID. Not the other way round,
 *    and `sub` is NOT the bundle identifier.
 *  - the `id` HEADER field is Team ID first, then Service ID, joined by a single
 *    '.', which reads like a bundle id but is not one.
 *
 * Apple: "Ensure that the token contains only the claims listed below." So no
 * extra claims are added here, however tempting a `jti` might be.
 *
 * No maximum lifetime is documented for WeatherKit (MusicKit's 6-month cap is a
 * different service and does not transfer). One hour is chosen for blast radius,
 * and re-signing is cheap because the imported key is cached above.
 */
export async function weatherKitToken(): Promise<string> {
  const teamId = Deno.env.get("APPLE_TEAM_ID");
  const keyId = Deno.env.get("APPLE_WEATHERKIT_KEY_ID");
  const serviceId = Deno.env.get("APPLE_WEATHERKIT_SERVICE_ID");
  const missing = [
    !teamId && "APPLE_TEAM_ID",
    !keyId && "APPLE_WEATHERKIT_KEY_ID",
    !serviceId && "APPLE_WEATHERKIT_SERVICE_ID",
  ].filter(Boolean);
  if (missing.length) throw new Error(`WeatherKit is not configured: missing ${missing.join(", ")}`);

  const now = Math.floor(Date.now() / 1000); // seconds, not ms — Apple is explicit
  return await signES256(
    { alg: "ES256", kid: keyId, id: `${teamId}.${serviceId}` },
    { iss: teamId, iat: now, exp: now + 3600, sub: serviceId },
  );
}

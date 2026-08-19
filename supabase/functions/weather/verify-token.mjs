// Exercises the REAL supabase/functions/weather/appleToken.ts by shimming Deno.env.
// One mode per process, because the module caches the imported CryptoKey.
import assert from "node:assert/strict";
const { subtle } = globalThis.crypto;
const mode = process.argv[2];
const TEAM = "6NKUB3U255", KEYID = "ABCDE12345", SERVICE = "com.coweeeee.summit.weather";
const MOD = "/Users/connorwee/summit-app/supabase/functions/weather/appleToken.ts";

function pemWrap(der) {
  return `-----BEGIN PRIVATE KEY-----\n${Buffer.from(der).toString("base64").match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n`;
}
const setEnv = (o) => { globalThis.Deno = { env: { get: (k) => o[k] } }; };

if (mode === "sign" || mode === "sign-escaped") {
  const kp = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  let pem = pemWrap(await subtle.exportKey("pkcs8", kp.privateKey));
  if (mode === "sign-escaped") pem = pem.replace(/\n/g, "\\n");
  setEnv({ APPLE_TEAM_ID: TEAM, APPLE_WEATHERKIT_KEY_ID: KEYID, APPLE_WEATHERKIT_SERVICE_ID: SERVICE, APPLE_WEATHERKIT_PRIVATE_KEY: pem });

  const { weatherKitToken } = await import(MOD);
  const jwt = await weatherKitToken();
  const [h, p, s] = jwt.split(".");
  assert.equal(jwt.split(".").length, 3);
  const dec = (x) => JSON.parse(Buffer.from(x.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
  const header = dec(h), payload = dec(p);

  assert.deepEqual(Object.keys(header).sort(), ["alg", "id", "kid"]);
  assert.equal(header.alg, "ES256");
  assert.equal(header.kid, KEYID);
  assert.equal(header.id, `${TEAM}.${SERVICE}`);
  assert.deepEqual(Object.keys(payload).sort(), ["exp", "iat", "iss", "sub"]);
  assert.equal(payload.iss, TEAM);
  assert.equal(payload.sub, SERVICE);
  assert.ok(Number.isInteger(payload.iat) && String(payload.iat).length === 10);
  assert.equal(payload.exp - payload.iat, 3600);
  assert.ok(!/[+/=]/.test(h + p + s), "base64url, unpadded");

  const sig = Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
  assert.equal(sig.length, 64, "raw r||s P1363, not DER");
  assert.ok(await subtle.verify({ name: "ECDSA", hash: "SHA-256" }, kp.publicKey, sig, new TextEncoder().encode(`${h}.${p}`)));
  console.log(`  PASS ${mode}: header=alg/kid/id exact, claims=iss/iat/exp/sub only, iss=Team sub=Service, 64-byte sig verifies`);
}

if (mode === "missing") {
  setEnv({});
  const { weatherKitToken } = await import(MOD);
  await assert.rejects(() => weatherKitToken(), /not configured: missing/);
  console.log("  PASS missing-env: named error, does not sign garbage");
}

if (mode === "sec1") {
  setEnv({ APPLE_TEAM_ID: TEAM, APPLE_WEATHERKIT_KEY_ID: KEYID, APPLE_WEATHERKIT_SERVICE_ID: SERVICE,
    APPLE_WEATHERKIT_PRIVATE_KEY: "-----BEGIN EC PRIVATE KEY-----\nMHc=\n-----END EC PRIVATE KEY-----" });
  const { weatherKitToken } = await import(MOD);
  await assert.rejects(() => weatherKitToken(), /PKCS#8 PEM/);
  console.log("  PASS sec1-key: rejected by name, not an opaque importKey failure");
}

// ---------------------------------------------------------------------------
// Run:  for m in sign sign-escaped missing sec1; do node verify-token.mjs $m; done
//
// This exercises the REAL appleToken.ts (Deno.env shimmed) with a locally
// generated P-256 key. It proves the crypto path: claim shape, base64url,
// seconds-not-ms, and a 64-byte raw r||s signature that actually verifies.
//
// It does NOT prove Apple accepts the token. That needs the real .p8 and a live
// call, and until that has happened this feature is unverified.
// ---------------------------------------------------------------------------

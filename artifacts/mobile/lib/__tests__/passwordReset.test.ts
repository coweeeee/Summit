import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { parseRecoveryLink, passwordProblem, MIN_PASSWORD_LENGTH } from "../passwordReset.ts";

// Run with `npm test`.
//
// Tested rather than eyeballed because the whole flow is unreachable without a
// real email round trip, and the failure modes are silent: classify a valid
// link as unrelated and the user taps their email and lands on the login screen
// with no explanation; classify an expired one as valid and setSession fails
// somewhere further along with a worse message.
//
// The URL shapes below are Supabase's, with the tokens in the FRAGMENT rather
// than the query string.

const SCHEME = "summit://reset-password";

describe("parseRecoveryLink", () => {
  test("extracts both tokens from a real recovery link", () => {
    const url = `${SCHEME}#access_token=eyJhbGciOi.aaa.bbb&expires_in=3600&refresh_token=v1refresh&token_type=bearer&type=recovery`;
    assert.deepEqual(parseRecoveryLink(url), {
      kind: "recovery",
      accessToken: "eyJhbGciOi.aaa.bbb",
      refreshToken: "v1refresh",
    });
  });

  test("parameter order does not matter", () => {
    const url = `${SCHEME}#type=recovery&refresh_token=r2&access_token=a2`;
    assert.deepEqual(parseRecoveryLink(url), {
      kind: "recovery",
      accessToken: "a2",
      refreshToken: "r2",
    });
  });

  test("an expired link reports the reason instead of being silently ignored", () => {
    // The most common real failure. Supabase plus-encodes the description.
    const url = `${SCHEME}#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`;
    const result = parseRecoveryLink(url);
    assert.equal(result.kind, "error");
    assert.equal(
      result.kind === "error" ? result.message : null,
      "Email link is invalid or has expired"
    );
  });

  test("falls back to the error code when no description is sent", () => {
    const result = parseRecoveryLink(`${SCHEME}#error=access_denied`);
    assert.equal(result.kind, "error");
    assert.equal(result.kind === "error" ? result.message : null, "access_denied");
  });

  test("a link with no fragment is unrelated", () => {
    assert.deepEqual(parseRecoveryLink("summit://hike-detail?id=abc"), { kind: "unrelated" });
  });

  test("a non-recovery fragment is unrelated — magic-link and signup links must not be hijacked", () => {
    const url = `${SCHEME}#access_token=a&refresh_token=r&type=magiclink`;
    assert.deepEqual(parseRecoveryLink(url), { kind: "unrelated" });
  });

  test("a recovery link missing either token is unrelated, not half-valid", () => {
    // setSession cannot build a session from one token, so treating this as
    // recovery would strand the user on a reset screen that can never submit.
    assert.deepEqual(parseRecoveryLink(`${SCHEME}#access_token=a&type=recovery`), { kind: "unrelated" });
    assert.deepEqual(parseRecoveryLink(`${SCHEME}#refresh_token=r&type=recovery`), { kind: "unrelated" });
  });

  test("an empty fragment does not throw", () => {
    assert.deepEqual(parseRecoveryLink(`${SCHEME}#`), { kind: "unrelated" });
  });
});

describe("passwordProblem", () => {
  test("accepts a valid matching password", () => {
    assert.equal(passwordProblem("hunter22", "hunter22"), null);
  });

  test("rejects anything under the minimum, matching signup's rule", () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    assert.equal(passwordProblem(short, short), `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  });

  test("accepts exactly the minimum — the boundary signup allows", () => {
    const exact = "a".repeat(MIN_PASSWORD_LENGTH);
    assert.equal(passwordProblem(exact, exact), null);
  });

  test("reports the mismatch separately from the length rule", () => {
    assert.equal(passwordProblem("hunter22", "hunter23"), "Those passwords don't match.");
  });

  test("length is checked before matching, so two short mismatched entries report length", () => {
    // Otherwise someone fixing the mismatch still gets rejected, with no hint why.
    assert.equal(passwordProblem("abc", "xyz"), `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
  });
});

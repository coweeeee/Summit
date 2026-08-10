import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { acceptedVersionFrom, needsReacceptance } from "../legalAcceptance.ts";

// Run with `npm test`.
//
// This is tested rather than eyeballed because the failure is invisible in the
// app: getting it backwards either locks every user out behind a prompt they
// cannot clear, or silently lets everyone through without ever re-accepting --
// and the second one looks exactly like success.
//
// The metadata shapes below are real ones. auth.users.raw_user_meta_data holds
// terms_version for 2 of the 3 accounts in the live database; the third is an
// automated test account whose blob carries only sub/email/email_verified/
// phone_verified, which is the "missing key" case.

describe("acceptedVersionFrom", () => {
  test("reads the recorded version", () => {
    assert.equal(
      acceptedVersionFrom({ sub: "x", email: "a@b.c", terms_version: "2026-07-08" }),
      "2026-07-08"
    );
  });

  test("returns null when the key is absent — the shape a pre-terms account has", () => {
    assert.equal(
      acceptedVersionFrom({ sub: "x", email: "a@b.c", email_verified: true, phone_verified: false }),
      null
    );
  });

  test("returns null for null, undefined and non-objects rather than throwing", () => {
    assert.equal(acceptedVersionFrom(null), null);
    assert.equal(acceptedVersionFrom(undefined), null);
    assert.equal(acceptedVersionFrom("2026-07-08"), null);
    assert.equal(acceptedVersionFrom(42), null);
  });

  test("a non-string or empty version is no record, not a version", () => {
    assert.equal(acceptedVersionFrom({ terms_version: "" }), null);
    assert.equal(acceptedVersionFrom({ terms_version: null }), null);
    assert.equal(acceptedVersionFrom({ terms_version: 20260708 }), null);
  });
});

describe("needsReacceptance", () => {
  test("false only when the accepted version matches exactly", () => {
    assert.equal(needsReacceptance("2026-07-08", "2026-07-08"), false);
  });

  test("true when the user accepted an older version", () => {
    assert.equal(needsReacceptance("2026-07-08", "2026-08-10"), true);
  });

  test("true when nothing was ever accepted", () => {
    assert.equal(needsReacceptance(null, "2026-07-08"), true);
  });

  test("true when the accepted version is NEWER than the current one", () => {
    // Not a curiosity: it is what a user who accepted on an updated build then
    // opened an older one looks like. Prompting is the safe direction -- the
    // alternative is treating an unrecognised value as consent to this text.
    assert.equal(needsReacceptance("2026-12-01", "2026-08-10"), true);
  });

  test("does not treat versions as dates or try to order them", () => {
    assert.equal(needsReacceptance("v2", "v10"), true);
    assert.equal(needsReacceptance("v10", "v10"), false);
  });
});

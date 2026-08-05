import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { filterDecimal, filterInteger, parseOptionalInt } from "../hikeForm.ts";

// Run with `npm test`.
//
// parseOptionalInt exists to keep one distinction alive all the way to the
// database: blank is not zero. Both forms previously did
// `parseInt(str) || 0`, so an unfilled elevation stored 0 — a real elevation —
// and nothing downstream could ever tell "I didn't record this" from "this
// trail is flat" again.

describe("parseOptionalInt", () => {
  test("blank is null, not zero", () => {
    assert.equal(parseOptionalInt(""), null);
    assert.equal(parseOptionalInt("   "), null);
  });

  test("a typed zero is zero, because zero is a real elevation", () => {
    // The other half of the distinction. Someone who deliberately enters 0 on a
    // Florida boardwalk is recording a fact, and it has to survive.
    assert.equal(parseOptionalInt("0"), 0);
  });

  test("parses ordinary values", () => {
    assert.equal(parseOptionalInt("1000"), 1000);
    assert.equal(parseOptionalInt(" 2400 "), 2400);
  });

  test("nonsense is absent rather than zero", () => {
    // `|| 0` used to turn this into a confident 0.
    assert.equal(parseOptionalInt("abc"), null);
  });

  test("never returns NaN, which would poison every total downstream", () => {
    for (const input of ["", "   ", "abc", "0", "12"]) {
      const out = parseOptionalInt(input);
      assert.ok(out === null || Number.isFinite(out), `${JSON.stringify(input)} gave ${out}`);
    }
  });
});

describe("filterInteger / filterDecimal still hold", () => {
  test("integer filter keeps digits only", () => {
    assert.equal(filterInteger("1a2b3"), "123");
    assert.equal(filterInteger("-45"), "45");
  });

  test("decimal filter folds extra points in rather than dropping them", () => {
    assert.equal(filterDecimal("1.2.3"), "1.23");
    assert.equal(filterDecimal("abc4.5"), "4.5");
  });
});

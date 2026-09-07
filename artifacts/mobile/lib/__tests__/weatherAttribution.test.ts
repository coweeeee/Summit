import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  loadWeatherKitAttribution,
  __resetAttributionCache,
  WEATHERKIT_LEGAL_URL,
} from "../weatherAttribution.ts";

// The live payload, copied verbatim from a real GET of
// https://weatherkit.apple.com/attribution/en. Two details here are the whole
// reason these tests exist, because both are easy to get wrong by assumption:
// the density is part of the KEY, and every value is a RELATIVE path.
const LIVE_BODY = {
  "logoDark@3x": "/assets/branding/en/Apple_Weather_wht_en_3X_090122.png",
  "logoLight@1x": "/assets/branding/en/Apple_Weather_blk_en_1X_090122.png",
  "logoDark@2x": "/assets/branding/en/Apple_Weather_wht_en_2X_090122.png",
  "logoDark@1x": "/assets/branding/en/Apple_Weather_wht_en_1X_090122.png",
  "logoLight@2x": "/assets/branding/en/Apple_Weather_blk_en_2X_090122.png",
  "logoLight@3x": "/assets/branding/en/Apple_Weather_blk_en_3X_090122.png",
  "logoSquare@2x": "/assets/branding/square-mark@2x.png",
  serviceName: "Apple Weather",
  "logoSquare@1x": "/assets/branding/square-mark.png",
  "logoSquare@3x": "/assets/branding/square-mark@3x.png",
};

function fakeFetch(body: unknown, ok = true, status = 200) {
  const calls: string[] = [];
  const impl = async (url: any) => {
    calls.push(String(url));
    return { ok, status, json: async () => body } as any;
  };
  return Object.assign(impl, { calls });
}

beforeEach(() => __resetAttributionCache());

describe("loadWeatherKitAttribution — the live shape", () => {
  test("pulls the service name and a dark-variant mark", async () => {
    const f = fakeFetch(LIVE_BODY);
    const a = await loadWeatherKitAttribution("en", f);
    assert.equal(a?.serviceName, "Apple Weather");
    // `logoDark` is the WHITE artwork, for a dark background. Summit pins
    // userInterfaceStyle:"dark", so picking the black-ink `logoLight` here
    // would render an invisible mark on the dark card.
    assert.match(a!.logoUrl, /Apple_Weather_wht_/);
    assert.doesNotMatch(a!.logoUrl, /_blk_/);
  });

  test("relative paths are joined onto the origin", async () => {
    const a = await loadWeatherKitAttribution("en", fakeFetch(LIVE_BODY));
    assert.match(a!.logoUrl, /^https:\/\/weatherkit\.apple\.com\/assets\/branding\//);
  });

  test("an already-absolute URL is left alone", async () => {
    const a = await loadWeatherKitAttribution("en", fakeFetch({
      serviceName: "Apple Weather",
      "logoDark@2x": "https://cdn.example.com/mark.png",
    }));
    assert.equal(a?.logoUrl, "https://cdn.example.com/mark.png");
  });

  test("the legal link points at Apple's data-source page", async () => {
    const a = await loadWeatherKitAttribution("en", fakeFetch(LIVE_BODY));
    assert.equal(a?.legalUrl, WEATHERKIT_LEGAL_URL);
    assert.match(a!.legalUrl, /developer\.apple\.com/);
  });

  test("the language reaches the URL", async () => {
    const f = fakeFetch(LIVE_BODY);
    await loadWeatherKitAttribution("fr", f);
    assert.match(f.calls[0], /\/attribution\/fr$/);
  });
});

describe("loadWeatherKitAttribution — failures skip the credit, never crash", () => {
  test("a non-200 yields null", async () => {
    assert.equal(await loadWeatherKitAttribution("en", fakeFetch({}, false, 503)), null);
  });

  test("a thrown fetch yields null rather than propagating", async () => {
    // The attribution call is separate from the reading. Apple's endpoint being
    // briefly unreachable must not take down the weather card.
    const boom = (async () => { throw new Error("network down"); }) as any;
    assert.equal(await loadWeatherKitAttribution("en", boom), null);
  });

  test("malformed JSON yields null", async () => {
    const impl = (async () => ({ ok: true, json: async () => { throw new Error("bad json"); } })) as any;
    assert.equal(await loadWeatherKitAttribution("en", impl), null);
  });

  test("a body with no serviceName yields null", async () => {
    // Half an attribution is not an attribution — a nameless mark reads as a
    // rendering bug, so nothing is shown instead.
    const { serviceName, ...noName } = LIVE_BODY as any;
    assert.equal(await loadWeatherKitAttribution("en", fakeFetch(noName)), null);
  });

  test("a body with no dark logo at any density yields null", async () => {
    assert.equal(await loadWeatherKitAttribution("en", fakeFetch({ serviceName: "Apple Weather" })), null);
  });

  test("a failure is NOT cached — the next reading retries", async () => {
    // Caching the failure would cost the whole session its attribution over one
    // transient blip, which is the obligation this module exists to meet.
    assert.equal(await loadWeatherKitAttribution("en", fakeFetch({}, false, 500)), null);
    const good = fakeFetch(LIVE_BODY);
    assert.equal((await loadWeatherKitAttribution("en", good))?.serviceName, "Apple Weather");
    assert.equal(good.calls.length, 1);
  });
});

describe("loadWeatherKitAttribution — fetched once per session", () => {
  test("a second call is served from cache without another request", async () => {
    const f = fakeFetch(LIVE_BODY);
    await loadWeatherKitAttribution("en", f);
    await loadWeatherKitAttribution("en", f);
    await loadWeatherKitAttribution("en", f);
    assert.equal(f.calls.length, 1);
  });

  test("concurrent callers share one request", async () => {
    // Two trail-detail screens mounting together must not both hit Apple.
    const f = fakeFetch(LIVE_BODY);
    const [a, b] = await Promise.all([
      loadWeatherKitAttribution("en", f),
      loadWeatherKitAttribution("en", f),
    ]);
    assert.equal(f.calls.length, 1);
    assert.equal(a?.logoUrl, b?.logoUrl);
  });

  test("different languages are cached separately", async () => {
    const f = fakeFetch(LIVE_BODY);
    await loadWeatherKitAttribution("en", f);
    await loadWeatherKitAttribution("de", f);
    assert.equal(f.calls.length, 2);
  });
});

describe("sizing", () => {
  test("the native aspect ratio is carried so the mark cannot be squashed", async () => {
    // Native 1x is 77x14. The UI sizes by height and derives width from this,
    // so a reissued asset at another size still renders in proportion.
    const a = await loadWeatherKitAttribution("en", fakeFetch(LIVE_BODY));
    assert.ok(Math.abs(a!.aspectRatio - 77 / 14) < 0.001);
  });
});

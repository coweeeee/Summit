// Apple WeatherKit attribution.
//
// WHY THIS EXISTS: Apple requires attribution to publish software that uses
// WeatherKit -- the Apple Weather mark plus a link to their data-source page,
// shown next to the data. Open-Meteo has the same kind of requirement and is
// already credited at two sites on trail-detail; until now the WeatherKit path
// rendered NOTHING at either, because both credits were gated on
// `weatherSource === "open-meteo"`.
//
// The mark is not a static asset we can bundle: Apple serves it per language
// from an endpoint, and the filenames carry a datestamp
// (Apple_Weather_wht_en_2X_090122.png), so hardcoding a URL would rot. Hence a
// fetch.
//
// This endpoint is UNAUTHENTICATED and is deliberately NOT the signed weather
// endpoint -- no developer token, no edge function, no metered quota. It is a
// direct call from the device, which is why it does not go through
// supabase.functions.invoke like the weather data itself.
//
// SHAPE, confirmed against the live endpoint rather than assumed:
//
//   GET https://weatherkit.apple.com/attribution/en
//   {
//     "serviceName": "Apple Weather",
//     "logoLight@1x": "/assets/branding/en/Apple_Weather_blk_en_1X_090122.png",
//     "logoDark@1x":  "/assets/branding/en/Apple_Weather_wht_en_1X_090122.png",
//     "logoSquare@1x": "/assets/branding/square-mark.png",
//     ... @2x and @3x for each
//   }
//
// Two things the shape gets wrong if you guess at it: the density is part of
// the KEY (`logoDark@2x`), not a nested object, and every value is a RELATIVE
// path that has to be joined onto the origin.

const ORIGIN = "https://weatherkit.apple.com";

/**
 * Where the mark must link.
 *
 * `${ORIGIN}/legal-attribution.html` 308-redirects here; using the resolved
 * target avoids making every tap pay for a redirect.
 */
export const WEATHERKIT_LEGAL_URL = "https://developer.apple.com/weatherkit/data-source-attribution/";

export type WeatherKitAttribution = {
  /** "Apple Weather" — Apple's own name for the service, not ours to invent. */
  serviceName: string;
  /** Absolute URL to the density-appropriate mark. */
  logoUrl: string;
  /** Native aspect ratio of the mark (77x14 at 1x), so the UI can size by height. */
  aspectRatio: number;
  legalUrl: string;
};

/**
 * `logoDark` is the WHITE artwork, meant for a DARK background -- the naming
 * refers to the appearance it sits in, not the ink. Summit pins
 * `userInterfaceStyle: "dark"` in app.json, so that is the variant, and it is
 * chosen here rather than at the call site so there is one place to change if
 * the app ever gains a light theme.
 */
const VARIANT = "logoDark";

/** Native 1x is 77x14. Sizing by height keeps the mark on the text baseline. */
const NATIVE_ASPECT = 77 / 14;

type Loaded = WeatherKitAttribution | null;

// Module state, deliberately not React state: the mark is identical for every
// screen and every trail, so re-fetching per mount would be pure waste.
const cache = new Map<string, WeatherKitAttribution>();
// Concurrent callers share one request rather than racing -- two trail-detail
// screens mounting together must not both hit Apple.
const inflight = new Map<string, Promise<Loaded>>();

/** Test seam. Production never calls this. */
export function __resetAttributionCache(): void {
  cache.clear();
  inflight.clear();
}

/** Screen density, if React Native is loaded. Required lazily so this module
 *  stays importable under `node --test`, where its logic is actually verified. */
function densitySuffix(): "@1x" | "@2x" | "@3x" {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { PixelRatio } = require("react-native");
    const r = PixelRatio.get();
    if (r >= 3) return "@3x";
    if (r >= 2) return "@2x";
    return "@1x";
  } catch {
    // 2x is the safe middle: crisper than needed on a 1x screen, never blurry.
    return "@2x";
  }
}

function absolute(path: string): string {
  return /^https?:\/\//i.test(path) ? path : `${ORIGIN}${path.startsWith("/") ? "" : "/"}${path}`;
}

/**
 * Load the attribution assets, at most once per language per session.
 *
 * Returns null on ANY failure -- unreachable endpoint, non-200, malformed
 * body, missing fields. The caller renders no credit in that case rather than
 * rendering a broken image or a bare link, and weather itself is unaffected:
 * this is a separate request from the reading, and a failure here must never
 * take down the card the user is looking at.
 *
 * A failure is NOT cached. Caching it would mean one transient blip costs the
 * whole session its attribution, which is the obligation this module exists to
 * meet; instead the next successful WeatherKit reading tries again. Only one
 * request is ever in flight per language, so a persistently dead endpoint costs
 * one small request per weather load rather than a storm.
 */
export async function loadWeatherKitAttribution(
  language: string = "en",
  fetchImpl: typeof fetch = fetch,
): Promise<Loaded> {
  const cached = cache.get(language);
  if (cached) return cached;

  const pending = inflight.get(language);
  if (pending) return pending;

  const run = (async (): Promise<Loaded> => {
    try {
      const res = await fetchImpl(`${ORIGIN}/attribution/${encodeURIComponent(language)}`);
      if (!res.ok) return null;
      const body = await res.json();
      if (!body || typeof body !== "object") return null;

      const serviceName = body.serviceName;
      const logoPath = body[`${VARIANT}${densitySuffix()}`] ?? body[`${VARIANT}@2x`];
      // Both are required. A mark with no name, or a name with no mark, is not
      // an attribution -- better to show nothing than something half-formed
      // that looks like a rendering bug.
      if (typeof serviceName !== "string" || !serviceName) return null;
      if (typeof logoPath !== "string" || !logoPath) return null;

      const value: WeatherKitAttribution = {
        serviceName,
        logoUrl: absolute(logoPath),
        aspectRatio: NATIVE_ASPECT,
        legalUrl: WEATHERKIT_LEGAL_URL,
      };
      cache.set(language, value);
      return value;
    } catch {
      return null;
    } finally {
      inflight.delete(language);
    }
  })();

  inflight.set(language, run);
  return run;
}

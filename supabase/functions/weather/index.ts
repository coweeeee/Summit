import { weatherKitToken } from "./appleToken.ts";

// WeatherKit proxy.
//
// WHY THIS EXISTS AT ALL, rather than the client calling Apple directly:
// WeatherKit REST authenticates with a JWT signed by a private .p8 key. Signing
// in React Native would mean shipping that key inside the app bundle, where it
// is trivially extractable from the IPA. The key never leaves this function.
//
// verify_jwt: TRUE. Weather is only ever shown on trail-detail, which is behind
// the auth gate, so there are no unauthenticated callers to serve -- and this
// endpoint spends a metered Apple quota, so leaving it open would let anyone
// burn it. This differs from report-alert/login-with-username/share-preview,
// which are verify_jwt false precisely because their callers are NOT signed in
// (see CLAUDE.md).
//
// Env: APPLE_TEAM_ID, APPLE_WEATHERKIT_KEY_ID, APPLE_WEATHERKIT_SERVICE_ID,
//      APPLE_WEATHERKIT_PRIVATE_KEY. All four are required; see
//      docs/weatherkit-setup.md for how they are produced.

const WEATHERKIT_BASE = "https://weatherkit.apple.com/api/v1";

/**
 * Data sets, from Apple's DataSet enum. Exactly five values exist and they are
 * lowerCamelCase: currentWeather, forecastDaily, forecastHourly,
 * forecastNextHour, weatherAlerts.
 *
 * An unrecognised value is NOT an error -- Apple returns 200 with that section
 * simply absent, which is far harder to debug than a 4xx. So the set is fixed
 * here rather than passed through from the client.
 */
const DATA_SETS = "currentWeather,forecastDaily";

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  let body: { lat?: number; lng?: number; timezone?: string; language?: string; countryCode?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be JSON" }, 400);
  }

  const { lat, lng } = body;
  if (typeof lat !== "number" || typeof lng !== "number" || Number.isNaN(lat) || Number.isNaN(lng)) {
    return json({ error: "lat and lng are required numbers" }, 400);
  }
  // Apple bounds these on the path; rejecting here gives a useful message
  // instead of a 400 from Apple with no body.
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return json({ error: "lat must be -90..90 and lng -180..180" }, 400);
  }

  // `timezone` is REQUIRED on the weather endpoint -- Apple marks it
  // required:true, and it is what daily forecasts are rolled up against. This is
  // the single easiest way to get an unexplained 400: the availability endpoint
  // does not take it, so anyone extrapolating from a smoke test omits it.
  // IANA name; the client sends the device's, and UTC is a safe floor.
  const timezone = body.timezone || "UTC";

  // `language` is the ONLY caller-supplied value that reaches the URL PATH
  // rather than a query parameter, so it gets the same up-front check lat/lng
  // get. Everything else is either fixed server-side (dataSets, see above) or
  // goes through searchParams.set, which percent-encodes.
  //
  // Without this, the URL constructor happily resolves `..` segments and honours
  // `?`/`#`, so a caller could steer the request at any path under
  // weatherkit.apple.com while carrying OUR signed developer token -- and the
  // upstream body is returned to them verbatim below. A plain malformed value is
  // the likelier case and was just as bad: an unexplained 4xx from Apple instead
  // of a 400 that says what is wrong.
  const language = body.language ?? "en";
  if (typeof language !== "string" || !/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})*$/.test(language)) {
    return json({ error: "language must be a BCP-47 tag, e.g. en or en-US" }, 400);
  }

  let token: string;
  try {
    token = await weatherKitToken();
  } catch (e) {
    // Configuration problems are ours, not the caller's, and must be
    // distinguishable from Apple rejecting a well-formed request.
    console.error("weather: token signing failed", e instanceof Error ? e.message : e);
    return json({ error: "Weather is not configured on the server" }, 503);
  }

  const url = new URL(`${WEATHERKIT_BASE}/weather/${language}/${lat}/${lng}`);
  url.searchParams.set("dataSets", DATA_SETS);
  url.searchParams.set("timezone", timezone);
  // Optional, but Apple notes it is "necessary for weather alerts". Harmless
  // when absent; note the availability endpoint spells this `country` instead.
  if (body.countryCode) url.searchParams.set("countryCode", body.countryCode);

  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (e) {
    console.error("weather: upstream fetch threw", e instanceof Error ? e.message : e);
    return json({ error: "Could not reach WeatherKit" }, 502);
  }

  if (!res.ok) {
    // Surface Apple's status rather than flattening everything to 500. 401 here
    // almost always means the developer token was rejected -- wrong claim shape,
    // or a key created WITHOUT the WeatherKit capability ticked, which is the
    // most common cause and is invisible from the token itself.
    const detail = await res.text().catch(() => "");
    console.error(`weather: WeatherKit responded ${res.status}`, detail.slice(0, 500));
    return json(
      {
        error: `WeatherKit request failed (${res.status})`,
        // 401 is worth calling out by name because the remedy is in the portal,
        // not in this code.
        hint: res.status === 401 ? "Developer token rejected — check the key has WeatherKit enabled" : undefined,
      },
      res.status === 401 ? 502 : res.status,
    );
  }

  const data = await res.json();

  // Returned as-is. Mapping to the client's shape happens in the app, where the
  // unit preference lives -- WeatherKit always answers in metric SI regardless
  // of the caller, unlike Open-Meteo which converts server-side.
  return json(data, 200);
});

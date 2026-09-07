# WeatherKit — what you need to do in the Apple Developer portal

This is the step I cannot do. Everything else is built and waiting on these four values.

Spec references below come from Apple's DocC JSON endpoints
(`developer.apple.com/tutorials/data/documentation/weatherkitrestapi/*.json`), because the HTML
documentation pages render as empty shells with the word "WeatherKit" appearing nowhere in the body.

---

## Part 1 — three steps in the portal

### Step 1. Register a Services ID

**Certificates, Identifiers & Profiles → Identifiers → + → Services IDs**

Use a reverse-domain string that is **not** the bundle identifier — suggested:
`com.coweeeee.summit.weather`.

> Why not reuse `com.coweeeee.summit`? Apple's REST auth doc defines the `sub` claim as *"your
> registered Service ID"*, and a distinct string makes it impossible to accidentally substitute the
> bundle ID — which is the single most common cause of a rejected token. I originally wrote that
> Apple's namespace forbids the collision; **that was invented and I removed it.** Apple documents no
> such constraint. The recommendation stands on the clarity argument alone.

Whether Apple actively *rejects* an App ID in `sub` is **unknown** — Apple never says so, and their own
DTS engineer has suggested the App-ID form works. But the documented contract is the Services ID, so
that is what this implementation follows.

### Step 2. Create a private key **with WeatherKit enabled** ← the step that catches people

**Certificates, Identifiers & Profiles → Keys → + → tick the WeatherKit capability**

**This tick is mandatory.** A key created without it produces a perfectly well-formed token that Apple
rejects with a bare `401` and no explanation — the token looks correct, so the natural instinct is to
go debugging the JWT claim shape, which is fine. This is the most expensive failure mode in the whole
setup, which is why the edge function returns an explicit hint on 401.

Download the key. It arrives as a **`.p8` text file** in Downloads.

> ⚠️ **Apple lets you download it exactly once.** Store it somewhere safe before you leave the page.

### Step 3. Note the Key ID

Shown on the key's detail page after creation — a 10-character identifier. This becomes `kid` in the
JWT header.

---

## Part 2 — the four values to send me

| Name | What it is | Secret? |
|---|---|---|
| `APPLE_TEAM_ID` | `6NKUB3U255` — already in `app.json`, no action needed | No |
| `APPLE_WEATHERKIT_KEY_ID` | The 10-character Key ID from step 3 | Not really, but treat as config |
| `APPLE_WEATHERKIT_SERVICE_ID` | The Services ID string from step 1, e.g. `com.coweeeee.summit.weather` | No |
| `APPLE_WEATHERKIT_PRIVATE_KEY` | **The full contents of the `.p8` file**, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines | **Yes — this is the actual secret** |

### Setting them

Per this project's convention, **you set secrets, not me** — I never generate or echo them. Either:

```bash
supabase secrets set --project-ref sigupaldsyuaomgllyvw \
  APPLE_TEAM_ID=6NKUB3U255 \
  APPLE_WEATHERKIT_KEY_ID=XXXXXXXXXX \
  APPLE_WEATHERKIT_SERVICE_ID=com.coweeeee.summit.weather
supabase secrets set --project-ref sigupaldsyuaomgllyvw \
  APPLE_WEATHERKIT_PRIVATE_KEY="$(cat ~/Downloads/AuthKey_XXXXXXXXXX.p8)"
```

or paste each into **Dashboard → Edge Functions → Secrets**.

The `$(cat ...)` form is preferred because it preserves real newlines. The parser handles the
escaped-`\n` form too — that case is covered by a test — but real newlines avoid the question.

---

## What you do **not** need to do

- **You do not need to enable WeatherKit on the App ID.** That capability is for the *native*
  WeatherKit framework. The REST API authenticates purely with the developer token, and changing App
  ID capabilities invalidates existing provisioning profiles — which would force a regeneration
  mid-TestFlight, with build 3 already uploaded. Skip it.
- You do not need a new certificate or provisioning profile.

---

## The spec this was built against

Recorded here so the next person does not have to re-derive it. All verified from Apple's DocC JSON.

**JWT header** — exactly three fields:

```json
{ "alg": "ES256", "kid": "<10-char Key ID>", "id": "<TeamID>.<ServiceID>" }
```

**JWT payload** — exactly four claims. Apple: *"Ensure that the token contains only the claims listed
below."*

```json
{ "iss": "<TeamID>", "iat": <seconds>, "exp": <seconds>, "sub": "<ServiceID>" }
```

Two things that are easy to get backwards and both yield a bare 401:

- **`iss` is the Team ID; `sub` is the Service ID.** Not the reverse.
- The `id` **header** field is Team-ID-first, joined by a single `.` — it reads like a bundle
  identifier but is not one.

`iat`/`exp` are **seconds**, not milliseconds. ES256 only — Apple rejects other algorithms with a 401.
No maximum token lifetime is documented for WeatherKit (MusicKit's 6-month cap is a different service
and does not transfer); this implementation uses one hour.

**Endpoints:**

```
GET https://weatherkit.apple.com/api/v1/weather/{language}/{latitude}/{longitude}
GET https://weatherkit.apple.com/api/v1/availability/{latitude}/{longitude}
GET https://weatherkit.apple.com/attribution/{language}          ← note: no /api/v1
```

**A trap worth knowing:** on the *weather* endpoint the `timezone` query parameter is marked
**required**, while `dataSets` is optional. The *availability* endpoint takes `country` (required)
where weather takes `countryCode` (optional) — same concept, different spelling and requiredness. So
anyone extrapolating a weather request from an availability smoke test writes something that 400s.

**`dataSets`** has exactly five valid values, all lowerCamelCase: `currentWeather`, `forecastDaily`,
`forecastHourly`, `forecastNextHour`, `weatherAlerts`. An unrecognised value is **not** an error —
Apple returns `200` with that section simply missing, which is harder to debug than a 4xx. This is why
the set is fixed server-side rather than passed through from the client.

---

## Still unverified, and I want to be straight about it

- **That Apple accepts our token.** The crypto path is proven — see the PR — but no real WeatherKit
  call has been made. Until one has, this is unverified by this project's usual standard.
- **The exact attribution obligation.** The endpoint `GET /attribution/{language}` is real and
  confirmed. What a client is *required to display* (the Apple Weather mark, a legal link) is **not**
  confirmed — the page I first cited for it turned out to list WeatherKit's meteorological data
  sources, not client display requirements. **This must be resolved before Open-Meteo is removed**,
  or we would swap one attribution gap for another.

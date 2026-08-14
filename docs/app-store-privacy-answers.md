# App Store Connect — "App Privacy" answers for Summit

This is the **manual questionnaire** on the App Store Connect listing page. It is a
separate thing from `PrivacyInfo.xcprivacy` in the binary, and **Apple does not sync the
two**. The file describes what the code does; this questionnaire is what shows on the
store listing as the privacy "nutrition label". They must agree — a mismatch is its own
review risk.

There is no API for this. It has to be clicked through by hand.

**Where:** App Store Connect → **Apps** → Summit → **App Privacy** (left sidebar, under
the app, not under a specific version) → **Edit** next to "Data Types".

Derived from the seven data types verified against the live Supabase schema and the
client code on 2026-08-14. Same list that went into `ios.privacyManifests` in
`artifacts/mobile/app.json`.

---

## Step 0 — the gate question

> **Do you or your third-party partners collect data from this app?**

**Yes.**

---

## Step 1 — tick exactly these seven, and nothing else

The picker groups types under headings. Tick these:

| Heading | Data type to tick |
|---|---|
| Contact Info | **Email Address** |
| Contact Info | **Name** |
| Health & Fitness | **Fitness** |
| User Content | **Photos or Videos** |
| User Content | **Other User Content** |
| Identifiers | **User ID** |
| Identifiers | **Device ID** |

Leave every other box unticked. The ones most likely to be ticked by mistake are called
out in Step 3.

---

## Step 2 — answer these three questions per type

Apple asks the same three questions for each type. **The answers are identical for all
seven**, which makes this fast but also easy to rush — the values are:

- **Used to track you?** → **No**
- **Linked to the user's identity?** → **Yes**
- **Purposes?** → **App Functionality** (only — do not also tick Analytics or
  Product Personalization)

Per type, with the justification if you're asked to defend it:

| Data type | Linked | Tracking | Purpose | Why it's collected |
|---|---|---|---|---|
| **Email Address** | Yes | No | App Functionality | Account creation and sign-in via Supabase Auth; also the password-reset path. |
| **Name** | Yes | No | App Functionality | `profiles.full_name` — the display name shown on your profile and posts. Seeded from the username at signup, editable in Settings. |
| **User ID** | Yes | No | App Functionality | `profiles.id` and `profiles.username` — the account identifier and public handle. |
| **Device ID** | Yes | No | App Functionality | The Expo push token stored in `push_tokens`, used only to deliver notifications you enabled. |
| **Photos or Videos** | Yes | No | App Functionality | Profile pictures and hike photos you upload. Videos are not supported; Apple has no photo-only option. |
| **Other User Content** | Yes | No | App Functionality | Bio, hike notes, comments, ratings, trail-condition tags, report reasons, trail requests. |
| **Fitness** | Yes | No | App Functionality | Hike distance, elevation gain, duration and date — self-reported, not from HealthKit or the Motion API. |

**Everything is "Linked"** because every row hangs off an account — there is no anonymous
write path anywhere in the app.

**Nothing is "Tracking."** Apple defines tracking as linking your data with third-party
data for ads or measurement, or sharing it with a data broker. Summit does none: there is
no analytics SDK, no crash-reporting SDK, no advertising identifier, no ATT prompt and no
third-party data sharing in the dependency tree. This is why the app has no
`NSUserTrackingUsageDescription` and why "Data Used to Track You" should end up empty.

---

## Step 3 — the ones to explicitly NOT tick

Worth being deliberate here, because several look plausible.

**Location (Precise or Coarse) — do NOT tick.** The app requests location-when-in-use and
uses it *only on device*, to sort trails by distance. `lib/location.ts` and
`lib/useDeviceLocation.ts` contain no network or Supabase call at all; `discover.tsx`
feeds the fix into a client-side haversine. **No coordinate is ever transmitted**, and
Apple's definition of "collect" is transmitting off device. The place names stored on a
hike are copied from the trail catalogue, not read from the device.

> ⚠️ If GPS coordinates are ever sent to the server — a route trace, a check-in, a
> "hiked here" pin — this answer changes and `PrivacyInfo.xcprivacy` has to change with
> it.

**Health — do NOT tick.** Fitness covers the hike stats. Nothing touches HealthKit.

**Search History — do NOT tick.** Trail search queries go to the database to serve the
request in real time and are not retained as user data.

**Contacts — do NOT tick.** The follow graph is in-app social data; the app never reads
the device address book.

**Browsing History, Purchases, Financial Info, Sensitive Info, Audio Data, Gameplay
Content, Customer Support, Crash Data, Performance Data, Diagnostics, Advertising Data,
Product Interaction, Other Usage Data — none apply.** There is no analytics or crash SDK
to produce the diagnostics ones.

---

## Step 4 — checks before you hit Publish

- The **Privacy Policy URL** field must be filled in and publicly reachable. Summit's
  policy lives in-app at `/privacy-policy` and is linked from Settings and signup — if
  the field wants a web URL, it needs a hosted copy, not the in-app route.
- The label preview should show **"Data Linked to You"** containing all seven, and
  **"Data Used to Track You"** empty.
- These answers apply at the app level and persist across versions — you are not
  re-answering per build.
- Sanity-check against the binary: the seven here map 1:1 onto the seven
  `NSPrivacyCollectedDataType` entries in `artifacts/mobile/app.json`. If you ever change
  one, change both.

---

## Open judgment call

**Fitness** is the one worth a second look. Summit stores self-reported hike distance,
elevation and duration rather than sensor data, and Apple's category description
references the Motion and Fitness API. It is declared anyway on the view that a hiking log
*is* exercise data about an identifiable person, and that under-declaring is the riskier
direction. If you'd rather drop it, it has to come out of `app.json` in the same change so
the two stay consistent.

# Nearby facilities

Phase 9. How the app finds hospitals and police stations near the user, why the
default provider needs no API key, and what happens when a provider fails.

---

## 1. The abstraction

Everything above the provider layer speaks only in `NearbyPlace`. Nothing outside
a `*Provider.ts` file has ever seen an Overpass element or a Google Places
response.

```
useNearbyPlaces                    TanStack Query + offline cache
      ↓
nearbyPlacesService                ordered provider chain, falls back on failure
      ↓
NearbyPlacesProvider               ← the seam
  ├── googlePlacesProvider         optional; only when a key is configured
  └── overpassProvider             default; no key required
      ↓
*Mapping.ts                        pure: raw response → NearbyPlace
      ↓
nearbyPlaceRanking                 pure: distance, radius, de-duplication, sort
```

That seam is the point of the phase rather than tidiness. The app has to keep
working when a provider is unreachable, rate limited, or swapped out — and it can
only do that if the swap is invisible to everything downstream.

The provider contract has one rule worth restating: **`search` must throw on
failure, never return `[]`.** "No hospital within 15 km" and "the lookup failed"
are completely different things to tell someone who has just had an accident, and
a provider that conflates them makes it impossible for anything upstream to tell
them apart.

---

## 2. Providers, and the answer to "secure keys"

### The short version

**A mobile app cannot hold a secret.** Every `EXPO_PUBLIC_*` value is inlined
into the JavaScript bundle by Metro at build time and can be read out of a
shipped binary in minutes — `src/config/env.ts` has said so since Phase 1. So the
approach here is not to protect a key better; it is to **not need one**.

### OpenStreetMap via Overpass — the default

Keyless. No credential exists, so none can leak, and the repository's shipped
configuration works out of the box with nothing to set up.

The honest trade-off, stated in the UI as well as here: OpenStreetMap coverage
varies enormously by region — excellent across much of Europe, patchy elsewhere.
Data is © OpenStreetMap contributors under the **ODbL**, and attribution is a
licence condition; the screen renders it.

The endpoint **defaults** to the public `overpass-api.de` instance, which is
free, heavily used, and will refuse or throttle under load. That is not a defect
to work around — it is exactly the case the fallback chain and the offline cache
exist for.

Phase 14 made it configurable: set `EXPO_PUBLIC_OVERPASS_ENDPOINT` to point at an
instance the project runs or pays for. Anything beyond demonstration should.
`overpass-api.de` is volunteer-run and has no obligation to this app, and its
throttling is experienced by a user as "nearby help is unavailable" on a screen
they may have opened in an emergency.

The value is validated at startup as an absolute `https:` URL, and plain `http:`
is refused rather than warned about. The query carries the user's position —
rounded to about a metre, but still a position — and putting that in clear text
over a network the user does not control is not a trade-off worth offering a
switch for.

### Google Places (New) — optional, and proxied since Phase 12

Enabled only when `EXPO_PUBLIC_GOOGLE_PLACES_PROXY_ENABLED` is `true`. It exists
to prove the abstraction is real rather than decorative, and for better coverage
where OpenStreetMap is thin.

**Note the change in Phase 12.** That environment variable is now a _flag_, not a
key. Until Phase 12 the app carried `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` and
called Google directly. Every `EXPO_PUBLIC_*` value is inlined into the shipped
JavaScript bundle and can be extracted from an app in minutes, so the key was
**public, billable configuration that no client-side measure could make secret** —
the only available mitigations were restricting it by bundle id and API and
capping the daily quota.

The call now goes to the `nearbyPlacesProxy` Cloud Function, which holds the key
as a Secret Manager secret. There is no billable credential in the bundle at all,
which is a different thing from a well-restricted one. Set it with:

```bash
firebase functions:secrets:set GOOGLE_PLACES_API_KEY
```

and, for the emulator, in `functions/.secret.local` (git-ignored).

What the proxy adds beyond holding the key:

- **it requires authentication**, so it is not an open relay onto a billable API;
- **it bounds the radius** and **allow-lists the place types** to `hospital` and
  `police`, so it cannot be turned into a general Places gateway on this
  project's billing account;
- **it rounds the coordinates again.** The app already rounds to five decimal
  places; a proxy that trusted its caller to have done so would not be a privacy
  control.
- **it never forwards the upstream error body**, which can echo the key back.

The request still sends a tight `X-Goog-FieldMask` — Google bills per field, and
asking for `places.*` would be both expensive and a request for more data than
the feature uses — and the key travels in a header, never a query parameter.

`mapGooglePlacesResponse` stays in the app, running on the raw response the proxy
forwards. It is the piece that knows how a Places record becomes a `NearbyPlace`,
it is already tested, and moving it to the server would either duplicate it or
strand it. The function stays as thin as the one job it exists for.

If the flag is on but the server has no key, the proxy answers
`failed-precondition`, the provider throws, and the chain falls through to
OpenStreetMap — so an incomplete setup degrades rather than breaking.

### Nothing secret is committed

The repository contains no key. `.env` is gitignored, the `*.example` templates
ship blank values, and the default path needs no credential at all. Since Phase
12 this is also _enforced_ rather than merely intended: `npm run scan:secrets`
runs as part of `npm run verify` and fails the build if anything credential-shaped
reaches a file git is carrying.

---

## 3. Recovering from provider failure

Four layers, in order:

1. **Timeouts.** `fetch` has none of its own. `httpJson.ts` bounds every request
   (12 s Overpass, 8 s Google) so a server that accepts a connection and never
   answers cannot leave a spinner running forever — the same class of bug Phase 5
   hit with Storage uploads sitting at 0% for eight minutes.
2. **The provider chain.** `fetchNearbyPlaces` tries each available provider in
   order and stops at the first that returns. Failures are collected and reported
   so the UI can say results may be incomplete rather than pretending otherwise.
3. **The offline cache.** `nearbyPlaceCache` keeps the last usable result. It is
   read _alongside_ the request rather than only after it fails, so a user on a
   dead connection sees something immediately instead of watching a timeout
   elapse. Serving stale data is fine; serving it **unlabelled** is not, so
   `isFromCache` and `isStale` drive an on-screen note.
4. **An honest error.** Only when there is genuinely nothing to show.

Two behaviours are deliberate and easy to get wrong:

- **An empty result does not advance the chain.** A provider that succeeded and
  found nothing has answered the question.
- **A cancellation does not advance the chain.** If the user navigates away or
  changes the filter, the request is abandoned rather than retried against the
  next provider on their way out.

---

## 4. Honesty rules this screen follows

The project's standing rule is that the app must never imply it can summon
medical or police help. Concretely, on this screen:

- The **emergency-number instruction comes first**, above the list, not in a
  footnote — it is the only line that matters to someone reading in a hurry.
- **Distances are straight-line and say so.** A hospital 2 km across a river can
  be a 15 km drive.
- **Unknown opening hours are stated as unknown.** Most crowd-mapped records
  carry no hours at all. `alwaysOpen` is a three-state field and `undefined` is
  never rendered as "closed"; implying a hospital is shut because a volunteer
  never filled the tag in would be actively dangerous. The Overpass mapping only
  returns `true` for a literal `24/7` and never returns `false`.
- **Google's `openNow` is never mapped to `alwaysOpen`.** "Open right now" and
  "open 24 hours" are different claims.
- **`amenity=clinic` is not treated as a hospital.** A clinic is often a small
  daytime practice with no emergency provision. Under-listing is the survivable
  error.
- **The empty state says "not recorded", not "none here."** Absence of data is
  not evidence of absence.
- **Directions hand off; they do not navigate.** The app cannot know whether the
  maps app opened or whether a route was found.
- **The category filter can never be emptied.** An empty selection would produce
  a blank list indistinguishable from "nothing found nearby".

---

## 5. Privacy

- The position sent to a provider is **rounded to five decimal places** (~1 m) in
  both the Overpass query and the Places request. A third party does not need
  more precision than that to find a hospital.
- The cache stores a **centre rounded to ~1 km**, the same treatment
  `blackSpotCache` gives it, so the file cannot become a location history.
- Nothing about this feature is written to Firestore. No search is logged, no
  facility view is recorded.
- Only the place id — never a phone number — reaches the logger.

---

## 6. Testing

`npm run verify` covers all of it without a network:

| Suite                         | Covers                                                 |
| ----------------------------- | ------------------------------------------------------ |
| `nearbyPlaceRanking.test.ts`  | distance, radius enforcement, de-duplication, ordering |
| `overpassMapping.test.ts`     | crowd-mapped tag handling, and what gets dropped       |
| `googlePlacesMapping.test.ts` | field-by-field validation of the Places response       |
| `nearbyPlacesService.test.ts` | **the fallback chain** — the phase's gate              |
| `nearbyPlaceCache.test.ts`    | offline behaviour, staleness labelling, distance limit |
| `directions.test.ts`          | platform URLs and escaping                             |

To exercise it for real, open **SOS → Find nearby help** with location granted.
Overpass needs no setup. To check the fallback path end to end, point
`OVERPASS_ENDPOINT` at an unroutable host and confirm the screen serves cached
results with the "saved on this device" note rather than an error.

### What a live query actually returned

The generated query was run against `overpass-api.de` during Phase 9, and both
outcomes are worth recording because they are what this code has to live with.

**First attempt: HTTP 504, with an HTML body.** The public instance was
overloaded. That is exactly the shape `httpJson.ts` is written for — it rejects
on `!response.ok` before ever attempting `response.json()`, so the failure
surfaces as a retryable `AppError` rather than as a `SyntaxError` about
unexpected `<`.

**Second attempt, 3 km around central London: HTTP 200**, 63 elements.
Through the pipeline: 62 mapped (one dropped — no name), then 40 after
de-duplication and the result cap. Categories split 31 hospital / 9 police;
34 carried a usable address, 6 a phone number, and **none** declared `24/7` —
which is why the row says hours are unknown rather than leaving the line blank.

One record in that result set, "Until SOHO", is a cosmetic clinic tagged
`amenity=hospital` by whoever entered it. Nothing client-side can detect a
miscategorised record, and no heuristic was added to pretend otherwise. It is
listed in the README's known limitations instead, because the honest answer is
that this list is a starting point rather than a vetted directory.

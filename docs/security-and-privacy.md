# Security, privacy and abuse prevention

Phase 12. What is enforced, where it is enforced, and — as importantly — what is
**not** protected and should not be assumed to be.

---

## 1. The two paths into the data

Every guarantee in this project has to hold on two independent paths, and almost
every mistake in this area comes from securing one and forgetting the other.

| Path           | Who uses it                                                      | What constrains it                                   |
| -------------- | ---------------------------------------------------------------- | ---------------------------------------------------- |
| **Client SDK** | the mobile app, the dashboard's sign-in                          | `firebase/firestore.rules`, `firebase/storage.rules` |
| **Admin SDK**  | dashboard server actions, Cloud Functions, the analytics service | **nothing** — it bypasses rules by design; only code |

The Admin SDK ignores every rule in this repository. That is the point of a
privileged credential, and it is why each of the following exists in a matched
pair:

| Guarantee                        | Client-path control                   | Admin-path control                          |
| -------------------------------- | ------------------------------------- | ------------------------------------------- |
| Nobody approves their own report | no client approval path exists at all | `evaluateModerationDecision` (shared-types) |
| Reporter identity stays private  | `firebase/tests/privacy.test.mjs`     | `apps/admin/src/lib/reporterPrivacy.ts`     |
| Only an admin changes roles      | no rule grants any role a write       | `canManageRoles` re-check in `actions.ts`   |
| A user may erase their own data  | rules deny it, deliberately           | `functions/src/deleteAccount.ts`            |

Neither half of any row is redundant. Remove the left and a tampered mobile
client gets through; remove the right and the dashboard does.

---

## 2. Rate limiting and duplicate detection

The hardest thing in the phase, because Firestore rules cannot count.

There is no aggregate function in the rules language, and a rule that read every
report a user had ever filed would cost a read per evaluation. So the count lives
in a document **the user writes themselves**, and the rules constrain the
_transition_ rather than the value.

### How the coupling works

A report write is refused unless the caller's rate-limit counter and duplicate
fingerprint are committed **in the same commit**:

```
allow create: if …
              && isServerTime(rateLimitAfter().lastReportAt)
              && isServerTime(fingerprintAfter(request.resource.data).lastReportAt)
              && fingerprintAfter(request.resource.data).reportId == reportId;
```

`getAfter()` reads a sibling document's state _after this commit_. `request.time`
is identical for every write in one commit and cannot be forged by a client, so
requiring the sibling's `lastReportAt` to equal it proves the sibling was written
here and now. A lone report write leaves a stale counter and is refused.

Verified against the real rules engine, not assumed — `firebase/tests/limits.test.mjs`.

### Everything a client might try instead

| Attempt                                       | Why it fails                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------ |
| Write the report without the counter          | `getAfter` coupling above                                                |
| Write a counter with a chosen timestamp       | `lastReportAt == request.time`; only `serverTimestamp()` satisfies it    |
| Write a lower count, or the same count        | the transition is exact: `count == resource.count + 1`                   |
| Slide `windowStartAt` forward                 | inside the window it must be unchanged; outside it the count resets to 1 |
| Delete the counter to reset the allowance     | `allow delete: if false`                                                 |
| Point the duplicate check at another document | the rule _recomputes_ the fingerprint id from the report's own fields    |
| Delete a fingerprint to clear its window      | `allow delete: if false`                                                 |

### The numbers

| Limit                 | Value     | Reasoning                                                                                                                                                                |
| --------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Reports per window    | 10 / 24 h | Generous on purpose. A limit that stops a conscientious user reporting a real hazard has done more harm than the spam it prevented.                                      |
| Minimum gap           | 60 s      | A person filling in a description and attaching a photo cannot produce two reports in a minute. A script can produce hundreds.                                           |
| Duplicate window      | 6 h       | A black spot is somewhere things happen repeatedly, so this must expire — a permanent fingerprint would suppress the corroboration the analytics service exists to find. |
| Fingerprint precision | geohash 7 | ~150 m, about one junction and its approaches.                                                                                                                           |

Defined once in `packages/shared-types/src/reportLimits.ts`, duplicated into the
rules because a rules file cannot import, and the duplication is asserted by
`firebase/tests/limits.test.mjs`.

### What duplicate detection does not claim

The location component is a **grid cell, not a radius**. Two reports 20 m apart
either side of a cell boundary land in different cells and are not treated as
duplicates. This suppresses casual and accidental repeat submission; it is not a
proof of uniqueness. The rigorous version is the haversine dedupe the analytics
service performs on ingest, where real distances are available.

It also, deliberately, **never folds two people's reports together**. The
fingerprint id begins with the reporter's uid, so a witness reporting the same
crash is a separate fingerprint. Silencing corroborating reports would defeat the
clustering model outright.

---

## 3. Reporter identity

The phase gate. Three separate things had to be true, and one of them was not.

**On the client path** — no signed-in caller of any role can read a `reporterId`
that is not their own, through a document read, a filtered query, or a query that
tries to smuggle the filter past the rule. Including moderators and admins: they
reach reports through the Admin SDK, so widening the rule would add reach without
adding a capability anybody needs.

**On the dashboard path** — this was broken until Phase 12. `ReportRow` carried
the raw `reporterId`, and a server component handed that row to a client
component. **Next.js serialises a client component's props into the HTML**, so
every reporter's uid was in the page source of the moderation queue, on every
load, for every moderator. The rules were doing their job perfectly; the
dashboard was going round them.

The fix is `apps/admin/src/lib/reporterPrivacy.ts`. `ReportRow` has **no
`reporterId` field at all** — its absence from the type is the control, because
reintroducing it requires editing an interface with a comment on it. What crosses
to the browser instead:

- `isOwnReport`, a boolean computed server-side where both real uids are in scope;
- `pseudonym`, a salted truncated SHA-256, so a moderator can still see that five
  reports about one junction came from one person rather than five — the
  difference between corroboration and one person's insistence.

`reviewedBy` — the deciding moderator's uid — was removed from the row for the
same reason. It was rendered nowhere and rode into the page source anyway.

Set `REPORTER_SALT` in a deployment. Unsalted, somebody holding a list of uids
could confirm which of them filed a report by recomputing the hash. Then leave it
alone: changing it renumbers every reporter and destroys the recognition the
label exists for.

---

## 4. Account deletion and data export

Both are callable Cloud Functions, because the rules deny a client the deletion
of its own reports, alert logs, profile and Storage objects — deliberately, so
that a report a published black spot rests on cannot be withdrawn by whoever
filed it.

### What deletion does to each thing

| Data                                                     | What happens         |
| -------------------------------------------------------- | -------------------- |
| Profile and settings                                     | deleted              |
| Emergency contacts                                       | deleted              |
| Alert logs                                               | deleted              |
| Rate-limit counter and fingerprints                      | deleted              |
| Photographs (all of them, including on approved reports) | deleted              |
| Pending and rejected reports                             | deleted              |
| **Approved reports**                                     | **kept, anonymised** |
| Firebase Auth record                                     | deleted, **last**    |

The one exception is a genuine tension, and the resolution is stated on the
deletion screen _before_ the decision rather than buried in a policy: an approved
report is the evidence behind a warning shown to other people. If approving a
report and then deleting the account silently withdrew that evidence, the black
spot would be a warning with nothing behind it. So the incident is kept — where,
what kind, how severe, when — and the link to the person is cut. After the link
is cut it is a fact about a road rather than a fact about a person.

This is a defensible reading, not the only one. An operator who would rather
delete approved reports outright changes `plans` in
`functions/src/deletionPolicy.ts` and nothing else.

**Ordering matters.** The Auth record goes last, so a failure part-way leaves the
user with an account they can use to retry; every step is idempotent. The reverse
order would leave data with no owner able to trigger its removal — unreachable
but not gone.

A tombstone is written to `deletedAccounts`: random id, counts and a time, **no
uid, no email, no location**. It answers "did this run complete" without
retaining the account. A deletion record that identified the person would defeat
the deletion it records.

### Export

`exportMyData` returns the profile, every report with its moderation decision and
notes, the emergency contacts and the alert log. It excludes `reviewedBy` — the
requester is entitled to the decision, not to the identity of the person who made
it; naming moderators in a downloadable file is how a moderator gets harassed —
and the internal anti-abuse counters, which are bookkeeping derived from reports
already in the file.

The export states in its own `notes` what is not in it. An export that quietly
omits things is worse than none, because the person believes they have
everything.

---

## 5. Secrets

`npm run scan:secrets`, part of `npm run verify`.

It scans **tracked files plus untracked files that are not ignored** — the second
half matters, because a scan of tracked files alone is always one commit behind:
a new file holding a key passes every check right up until the moment it is
committed, at which point the secret is in history and must be assumed
compromised.

Detection is a pure function in `scripts/secretPatterns.mjs`, unit-tested. False
positives are allow-listed by `(path, rule)` with a written reason, never by an
inline suppression comment — an inline marker would let any future file silence
the scanner by writing a comment next to the secret.

It also refuses to let certain paths be tracked at all (`.env`, service-account
JSON, keystores, `google-services.json`), because `.gitignore` cannot help with a
file that was added to the index before the ignore rule existed.

**What it cannot do**: catch a credential that looks like ordinary prose. A clean
run means "none of the known shapes are present", not "this repository is safe".

### The Google Places key

Until Phase 12 the app carried `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY`. Every
`EXPO_PUBLIC_*` value is inlined into the shipped JavaScript bundle and can be
extracted from an app in minutes, so it was **public, billable configuration that
no amount of care could make secret** — the only available mitigations were
restricting it by bundle id and capping the daily quota.

The call now goes through the `nearbyPlacesProxy` Cloud Function, which holds the
key in Secret Manager. There is no billable credential in the bundle at all,
which is a different thing from a well-restricted one. The proxy requires
authentication, bounds the radius, and allow-lists the place types so it cannot
become a general Places gateway on this project's billing account.

---

## 6. Data minimisation

What is deliberately _not_ collected or kept:

- **No continuous location history.** Alert logs record that a warning was shown
  and how far away the black spot was. Coordinates are permitted by the rules but
  the app does not write them.
- **No image metadata.** Uploads set a content type and a cache header and
  nothing else — no original filename (some cameras encode a timestamp and
  sequence), no device model, no EXIF summary.
- **Coordinates are rounded to five decimal places** before leaving for a
  third-party place lookup, in the app and again in the proxy. A proxy that
  trusted its caller to have rounded would not be a privacy control.
- **`users` has no `list` capability**, so the membership and every registered
  email address cannot be enumerated. This is also why the roles screen is
  address-in rather than a table of everybody.
- **Emergency contacts are readable by nobody but their owner** — not moderators,
  not admins, not any future feature. They are other people's phone numbers, held
  by somebody those people never agreed to be listed by.

---

## 7. Known gaps

Stated because a security document that only lists wins is not one.

- **Content type is client-declared.** The Storage rules allow-list
  `image/jpeg` and friends, but nothing inspects the bytes. A file with a lying
  content type is accepted. Mitigated by the object never being executed and by
  moderators viewing it as an image; a magic-byte check belongs in a future
  phase.
- **A `getDownloadURL()` token grants access without re-evaluating the rules.**
  That is Firebase behaviour. Treat any such URL stored on a report as a
  capability, and never expose one beyond moderation.
- **The reporter pseudonym is not anonymity against whoever holds the salt.** The
  server can obviously recompute it. What it stops is the identifier leaving the
  server at all.
- **Six hex characters is 24 bits**, so distinct reporters collide occasionally in
  a large corpus. Acceptable because the label supports a judgement a moderator
  makes alongside the report's content, and authorises nothing.
- **The rate limit is per account, not per person.** Someone willing to register
  repeatedly can file more than ten reports a day. Bounding that needs
  registration controls, which this phase does not add.
- **No App Check.** Nothing proves a request comes from a genuine build of this
  app rather than a script driving the SDK with valid credentials. Every rule
  here is written on the assumption that the client is hostile, which is the
  right posture regardless, but App Check would raise the cost of the attempt.
- **The analytics service has still only run against the emulator.** Its
  service-account and ADC paths are written but never exercised.

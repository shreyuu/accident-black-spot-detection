# Data model

Every Firestore collection, who can touch it, and the fields that carry a
constraint worth knowing about. The authority is `firebase/firestore.rules` and
`packages/shared-types/src/vocabulary.ts` — this is a map of them, not a second
source of truth, and where the two disagree the rules are right.

For _why_ the access control is shaped this way, see
[`security-and-privacy.md`](security-and-privacy.md). For how the pieces
interact, see [`architecture.md`](architecture.md).

---

## 1. Access, at a glance

"Client" below means the mobile app through the Firebase Web SDK — the only
caller that security rules apply to. The dashboard, Cloud Functions and the
analytics service use the Admin SDK and bypass all of it.

| Collection            | Client read           | Client write                     | Written by                    |
| --------------------- | --------------------- | -------------------------------- | ----------------------------- |
| `users`               | own document only     | create + update own, no delete   | client; deletion function     |
| `blackSpots`          | any signed-in user    | **never**                        | dashboard (admin)             |
| `incidentReports`     | own reports only      | create only — no edit, no delete | client; dashboard (moderator) |
| `emergencyContacts`   | own only              | full CRUD on own                 | client                        |
| `alertLogs`           | own only              | create only, append-only         | client                        |
| `reportRateLimits`    | own only              | create/update own, coupled       | client, in a batch            |
| `reportFingerprints`  | own only              | create/update, coupled           | client, in a batch            |
| `adminAuditLogs`      | moderators and admins | **never**                        | dashboard, in a transaction   |
| `blackSpotCandidates` | moderators and admins | **never**                        | analytics service             |
| `analysisJobs`        | moderators and admins | **never**                        | analytics service             |
| `deletedAccounts`     | **never**             | **never**                        | deletion function             |
| anything else         | **never**             | **never**                        | —                             |

The last row is not filler. `match /{document=**} { allow read, write: if false; }`
is the final rule, so a collection added tomorrow is closed until someone opens
it deliberately. Failing closed is the default posture everywhere in this
project, including the analytics service's bearer token.

### Three of those rows are the project's central claims

- **`blackSpots` is read-only to every client.** Nothing a user does creates a
  warning other users see.
- **`blackSpotCandidates` cannot be read by the mobile app at all** — not
  "filtered out client-side", cannot be read. An algorithm's proposal has no path
  to a user's screen that does not go through an administrator.
- **`incidentReports` allows `create` and nothing else.** No client update, no
  client delete, whatever the field. Approving a report is a dashboard action
  under `evaluateModerationDecision`, and the rules refuse the alternative.

---

## 2. Collections

### `users/{userId}`

The profile and the preferences, in one document keyed by the Auth uid.

| Field                            | Type                               | Notes                                                                         |
| -------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| `name`, `email`                  | string                             | Email is duplicated from Auth for display                                     |
| `phone`                          | string, optional                   |                                                                               |
| `role`                           | `'user' \| 'moderator' \| 'admin'` | **Display only.** Authorisation reads the Auth custom claim, never this field |
| `alertRadiusM`                   | number, 100–2000                   | Default 1000                                                                  |
| `alertsEnabled`                  | boolean                            |                                                                               |
| `backgroundMonitoringEnabled`    | boolean                            | Defaults **false**; opt-in behind a disclosure                                |
| `hapticsEnabled`, `soundEnabled` | boolean                            |                                                                               |
| `darkModePreference`             | `'system' \| 'light' \| 'dark'`    |                                                                               |
| `createdAt`, `updatedAt`         | server timestamp                   |                                                                               |

`role` being cosmetic is worth restating: a client can write its own profile, so
a `role` field a client could set would be a privilege-escalation hole. The rules
enforce that a profile update cannot change the privileged fields at all.

> That check is where **Phase 13's bug** lived. `hasNoPrivilegedFields` was called
> with the `Set` from `diff().affectedKeys()` but written as though it received a
> `Map`, so it called `.keys()` on a `Set`. The rules engine raised
> "Function not found: keys", and an erroring rule is a denial — so **every**
> profile update was refused, and saving a preference to your account had never
> once worked. 143 rules tests covered creation, deletion and every refusal; none
> covered the one operation the settings screen performs. It is now covered by six
> regression tests whose first assertion is the happy path.

### `blackSpots/{id}`

The published hazards. Read by any signed-in user, written by no client ever.

| Field                                        | Type                                        | Notes                                                                    |
| -------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| `name`, `description`                        | string                                      |                                                                          |
| `category`                                   | `accident \| crime \| unsafe-road \| mixed` |                                                                          |
| `latitude`, `longitude`                      | number                                      |                                                                          |
| `geohash`                                    | string                                      | Written by the producer; Firestore cannot compute it                     |
| `radiusM`                                    | number, 50–5000                             | The warning radius, not the app's alert radius                           |
| `riskLevel`                                  | `low \| medium \| high \| critical`         | Never communicated by colour alone in the UI                             |
| `severityScore`                              | number, 0–100                               |                                                                          |
| `accidentCount`, `crimeCount`, `reportCount` | number                                      |                                                                          |
| `verified`, `active`                         | boolean                                     | **The app queries `verified == true && active == true`.** Both must hold |
| `source`                                     | `official \| reports \| algorithm`          |                                                                          |
| `createdBy`                                  | string                                      |                                                                          |

A wrong or missing `geohash` makes a spot invisible rather than misplaced: the
repository range-scans that field. It is the field most worth checking first when
a spot that should be nearby is not.

### `incidentReports/{id}`

What users submit. Create-only for clients.

| Field                                         | Type                                                   | Notes                                                            |
| --------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------- |
| `reporterId`                                  | string                                                 | Must equal the caller's uid                                      |
| `type`                                        | `accident \| crime \| pothole \| unsafe-road \| other` |                                                                  |
| `severity`                                    | `low \| medium \| high`                                | Three-point, deliberately **not** the four-point `riskLevel`     |
| `description`                                 | string                                                 | Free text. Never read by the analytics service                   |
| `latitude`, `longitude`, `geohash`            | number, number, string                                 |                                                                  |
| `occurredAt`                                  | timestamp, optional                                    | Cannot be in the future                                          |
| `imageUrls`                                   | string[], max 3                                        |                                                                  |
| `status`                                      | `draft \| pending \| approved \| rejected`             | A client may only ever create `pending`                          |
| `moderationNotes`, `reviewedBy`, `reviewedAt` | —                                                      | Moderation-only. A client write touching any of these is refused |

The severity vocabularies being separate is a safety decision, not a modelling
accident: a member of the public judging one event they witnessed is doing
something different from a moderator classifying an aggregated hazard, and
keeping the words distinct is what stops a self-reported "high" ever reading as
an official classification.

### `emergencyContacts/{id}`

Full CRUD on your own. Contains **other people's personal data**, supplied
without their involvement — they are never told they were added and never
contacted automatically.

`userId`, `name`, `phone`, `relationship?`, `isPrimary`.

Capped at five (`MAX_EMERGENCY_CONTACTS`) — in the repository, not in the rules.
The cap is a usability decision rather than a security control: a list you have
to scroll is a list you cannot use in the three seconds an SOS countdown gives
you. A client bypassing it harms nobody but its own user.

### `alertLogs/{id}`

Append-only. A record that a warning happened.

`userId`, `blackSpotId`, `distanceM`, `alertType` (`foreground | background | push`).

`latitude` and `longitude` exist in the type as **optional and are not written**.
Storing a position with every alert would build precisely the continuous location
history the app tells users it does not keep. The black spot id already says
where, to any precision anyone needs.

### `reportRateLimits/{userId}` and `reportFingerprints/{id}`

The abuse controls, and the most unusual rows in the model: they are written _by
the client_ but cannot be forged, because the rules require them to arrive in the
**same batched write** as the report they authorise. A client that writes a
report without incrementing its counter is refused; a client that increments its
counter without a matching report is refused. The coupling is the mechanism.

`reportFingerprints` is the more interesting of the two. The identifying
information is in the **document id**, not in its fields: the id is derived from
the reporter, the incident type and a 7-character geohash prefix (about a
153 m cell — roughly one junction and its approaches). The rule **recomputes that
id from the report's own fields**, so a client cannot satisfy the check by
pointing at an unrelated document. The fields themselves are only `reporterId`,
`reportId` and `lastReportAt`.

What that does _not_ claim: a geohash prefix is a grid cell, not a radius, so two
reports 20 m apart either side of a boundary land in different cells and are not
treated as duplicates. It is a mitigation against accidental and casual repeat
submission, not a proof of uniqueness — the thorough version is the
proximity-based dedupe the analytics service performs on ingest, where a real
haversine distance is available. A fingerprint expires after 6 hours, because a
black spot is somewhere things happen repeatedly and a permanent one would
silence exactly the corroboration the analytics service is looking for.

The limit is per **account**, not per person. Registration is not rate limited and
email addresses are not verified, so someone willing to register repeatedly can
exceed the daily allowance. There is no App Check either.

### `adminAuditLogs/{id}`

Readable by moderators and admins, writable by no client. Written in the **same
transaction** as the privileged action it records — approve, reject, publish,
withdraw, grant a role, revoke one. The action and its record are one write, so
an action cannot occur without its log entry.

### `blackSpotCandidates/{id}` and `analysisJobs/{id}`

The analytics service's output, and its run metadata. No client may write either;
only moderators and admins may read them; **the mobile app cannot read them at
all.**

A candidate carries a position, radius, `riskLevel`, `severityScore`, the
component scores that produced it, `reportCount`, `distinctReporters`, the ECLAT
patterns as human-readable sentences, and the `report_ids` behind it so a
moderator can trace it to its evidence. It carries **no `verified` or `active`
field**, which means a document copied verbatim into `blackSpots` would still
fail the app's query. That is a third independent barrier behind the read rule
and the write rule.

`analysisJobs` records `algorithmVersion` alongside the parameters used, so a
score can be compared against another score only when it is meaningful to.

### `deletedAccounts/{id}`

A tombstone written by `deleteAccount`. No client may read or write it. It
records that an account was deleted and when, and nothing that identifies the
person.

---

## 3. Indexes

`firebase/firestore.indexes.json`. Each one exists because a specific query fails
at runtime with `FAILED_PRECONDITION` without it — an error that appears only
when the feature is used, never at build time.

| Collection          | Fields                          | Serves                         |
| ------------------- | ------------------------------- | ------------------------------ |
| `blackSpots`        | `verified`, `active`, `geohash` | Nearby lookup                  |
| `incidentReports`   | `reporterId`, `createdAt` desc  | "My reports"                   |
| `incidentReports`   | `status`, `createdAt` asc       | Moderation queue, oldest first |
| `emergencyContacts` | `userId`, `name` asc            | Contacts, alphabetical         |
| `alertLogs`         | `userId`, `createdAt` desc      | Alert history                  |

Equality fields must precede the range or ordered field in every one of them.
That is a Firestore requirement, not a style choice.

---

## 4. Cloud Storage

`incidentReports/{userId}/{fileName}`.

Writes are constrained by `storage.rules`: the path's `userId` must be the
caller's, the content type must be in an image allow-list, and the size is
capped.

Two things to know:

- **Content type is client-declared.** Nothing inspects the bytes, so a file
  with a lying content type is accepted. Recorded as a known gap rather than
  papered over.
- **Overwriting an existing object is evaluated as `create`, not `update`.**
  `allow update: if false` alone does not prevent it — the rule that does is
  requiring `resource == null` on create.

Images upload **before** the report document is written, so abandoning the form
after choosing a photo leaves an unreferenced object. That ordering is
deliberate: a report must never reference photographs that never arrived. The
`sweepOrphanedImages` scheduled function removes anything unreferenced for more
than 24 hours, and the grace period is generous because deleting an object from a
submission still being typed would strip evidence from a live report.

---

## 5. Timestamps

Every `createdAt` and `updatedAt` is a Firestore **server** timestamp. Client
clocks are wrong often enough to matter for a rate limit measured in days.

One consequence, learned the hard way: a converter's `toFirestore` runs on the
data being _written_. An early version stripped `serverTimestamp()` sentinels on
the way out, and every write failed with an opaque `PERMISSION_DENIED` — because
the rules require a server timestamp and were being handed nothing.

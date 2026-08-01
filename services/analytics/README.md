# Analytics service

Clusters approved incident reports, mines co-occurrence patterns with a
hand-written ECLAT, scores each cluster 0–100, and proposes **black spot
candidates**.

> **It never publishes anything.** Candidates go to `blackSpotCandidates`, which
> the mobile app cannot read and no client can write. Turning one into a warning
> users see is an administrator's deliberate, audited act.

The methodology — the algorithm, how its correctness is established, what the
score means and what it does not — is in
[`docs/eclat-methodology.md`](../../docs/eclat-methodology.md).

---

## Layout

```
services/analytics/
├── app/
│   ├── main.py            FastAPI entry point
│   ├── config.py          settings, validated at startup
│   ├── api/routes.py      /health, /analyse, /jobs
│   ├── models/            domain models + wire schemas (kept separate)
│   ├── algorithms/        eclat, clustering, transactions, risk_score, geo
│   ├── services/          cleaning, pipeline
│   └── repositories/      the only module that touches Firestore
└── tests/                 beside app/, not inside it
```

Everything except `repositories/` is free of I/O, which is why the whole pipeline
is tested without a database.

---

## Running it

Requires [uv](https://docs.astral.sh/uv/) and Python 3.12+ (verified on 3.14.6).

```bash
cd services/analytics && uv sync
```

Start the Firebase emulators and seed some approved reports first — from the
repository root:

```bash
npm run emulators
```

```bash
npm run seed:reports -- 51.5074 -0.1278
```

Then run the service:

```bash
npm run analytics
```

Interactive API docs are then at <http://localhost:8000/docs>.

### Triggering a run

`dry_run` defaults to **true** — the destructive form is the one you have to ask
for, because a real run writes to the moderation queue and exploring the API
should not fill it.

```bash
curl -s -X POST http://127.0.0.1:8000/analyse -H 'Authorization: Bearer local-dev-token' -H 'Content-Type: application/json' -d '{"dry_run": true}'
```

To actually write candidates and a job record, send `{"dry_run": false}`.

---

## Configuration

Read from the environment or a `.env` file in this directory. **Never commit a
`.env`** — the root `.gitignore` already covers it.

| Variable                         | Default                              | Notes                                                    |
| -------------------------------- | ------------------------------------ | -------------------------------------------------------- |
| `FIRESTORE_EMULATOR_HOST`        | unset                                | Set it to use the emulator; no credentials needed at all |
| `FIREBASE_PROJECT_ID`            | `demo-accident-black-spot-detection` | Matches `.firebaserc`                                    |
| `ANALYSIS_API_TOKEN`             | unset                                | **Required** to use `/analyse` and `/jobs`               |
| `GOOGLE_APPLICATION_CREDENTIALS` | unset                                | Service account path, for a real project. Untested       |
| `MAX_REPORTS_PER_RUN`            | `50000`                              | Bounds memory and runtime                                |

**With no `ANALYSIS_API_TOKEN` set, `/analyse` and `/jobs` refuse every request**
rather than allowing all of them. Failing closed matches the Firestore rules'
default-deny posture, and means a misconfigured deployment is inert rather than
open. `/health` stays unauthenticated — a health check that needs a credential
stops working when the credential rotates.

---

## Verification

```bash
npm run analytics:verify
```

That runs `ruff check`, `ruff format --check`, `mypy --strict` and `pytest`.
None of it needs the emulator or a network.

| Suite                       | Covers                                                        |
| --------------------------- | ------------------------------------------------------------- |
| `test_eclat.py`             | **Cross-validation against `mlxtend.fpgrowth`** — the gate    |
| `test_geo.py`               | Haversine, centroid, and geohash compatibility with geofire   |
| `test_cleaning.py`          | What is dropped, and that corroboration is never deduplicated |
| `test_clustering.py`        | DBSCAN grouping, noise rejection, determinism                 |
| `test_transactions.py`      | Item encoding, and that patterns describe rather than predict |
| `test_risk_score.py`        | Weighting, bounds, reproducibility                            |
| `test_pipeline.py`          | End to end, including that candidates are never publishable   |
| `test_api.py`               | Routing, auth, dry-run default                                |
| `test_vocabulary_mirror.py` | That the Python enums still match `vocabulary.ts`             |

The rules side is covered separately by `npm run test:rules`, which needs the
emulator.

---

## Notes

- **The Admin SDK bypasses security rules by design.** That is appropriate for a
  trusted server-side process and is exactly why it must never run in the mobile
  app. The compensating control is that this service can write to two
  collections, neither of which users read.
- **The vocabulary is duplicated from TypeScript and tested for drift.** Python
  cannot import a `.ts` module; `test_vocabulary_mirror.py` parses the source and
  fails the build if the two disagree.
- **`geopandas` is not installed**, despite appearing in the Phase 0 stack list.
  DBSCAN's haversine metric comes from scikit-learn and nothing here reads a
  geospatial file format. An unused compiled dependency is only a liability.
- **The emulator needs a custom credential class.** `firebase_admin.credentials`
  has no anonymous option, and passing `None` falls back to Application Default
  Credentials — which fails with a `DefaultCredentialsError` that names ADC
  rather than the emulator. See `_EmulatorCredentials` in `repositories/firestore.py`.

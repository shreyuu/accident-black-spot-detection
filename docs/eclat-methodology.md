# ECLAT methodology

Phase 10. Why this project implements ECLAT itself, how the implementation
works, how its correctness is established, and — just as importantly — what the
output does and does not mean.

---

## 1. Why implement it at all

**There is no maintained ECLAT library for Python.** The Phase 0 audit
established this and it directly shaped this phase:

- `mlxtend.frequent_patterns` exposes `apriori`, `fpgrowth`, `fpmax`, `hmine`
  and `association_rules` — **no ECLAT**.
- `pyECLAT` on PyPI was last released **1.0.2, June 2020**, and pins
  `pandas>=0.25.3` against a pandas 3 world.

The brief asks for a documented ECLAT implementation, so the decision was to
write one and prove it correct against an independent oracle rather than depend
on an abandoned package.

---

## 2. The algorithm

Apriori and FP-Growth think **horizontally**: a transaction is a row, and support
is counted by scanning rows. ECLAT flips the layout. Each item is stored as its
**tidset** — the set of transaction ids containing it.

```
transactions              vertical layout
T1: {a, b, c}             a -> {T1, T2}
T2: {a, b}                b -> {T1, T2, T3}
T3: {b, c}                c -> {T1, T3}
```

The support of an itemset is then the size of the intersection of its items'
tidsets, and candidate generation is a depth-first walk in which each step
intersects one more tidset:

```
support({a, b}) = |{T1,T2} ∩ {T1,T2,T3}| = 2
```

Two properties make it work, and the implementation depends on both:

**Intersections only shrink.** `|A ∩ B| <= min(|A|, |B|)`, so once a prefix falls
below the support threshold every extension of it does too, and the entire branch
is abandoned. This is Apriori's downward-closure property applied to a DFS
instead of a level-wise scan.

**Suffix-only extension.** Each recursion extends the prefix using only items
appearing _after_ the current one in a fixed order. Without this, `{a,b}` and
`{b,a}` are both generated and the search enumerates every permutation.

### Implementation notes

`services/analytics/app/algorithms/eclat.py`.

- **Determinism is part of the contract.** Singletons are sorted by item label,
  not by frequency. Frequency-descending is the usual optimisation, but ties
  would then break on dictionary insertion order and the output would vary
  between runs. At this data size the constant factor is irrelevant and
  reproducibility is an acceptance criterion — a moderator reviewing a candidate
  must see what the run produced.
- **The support threshold is a genuine lower bound.** `min_support * n` is
  rounded **up**. With 10 transactions and `min_support=0.25`, an itemset in 2 of
  them is 0.2 and must not qualify; flooring would quietly admit it.
- **Floating point is handled explicitly.** `0.3 * 10` is `2.9999999999999996`
  in binary floating point. The count is rounded to nine decimal places before
  the ceiling, which removes the representation error without affecting any
  threshold anyone would actually choose.
- A transaction is treated as a **set**: a repeated item within one transaction
  counts once.

---

## 3. How correctness is established

**Cross-validation against `mlxtend.fpgrowth`.** Apriori, FP-Growth and ECLAT are
different routes to the same destination: for a given transaction set and minimum
support they must return exactly the same frequent itemsets. Two independent
implementations agreeing is a far stronger argument than either passing
hand-written expectations, and it is cheap.

`tests/test_eclat.py` runs this over:

| Suite                      | Cases |
| -------------------------- | ----- |
| Worked examples × supports | 25    |
| Seeded random datasets     | 40    |
| Dense datasets             | 10    |
| Support-count agreement    | 10    |

Randomised but **seeded**, so a failure is reproducible from its seed number.
Measured during development, the 40 random cases alone compare **787 itemsets**
up to length 5 — the agreement is not the trivial one of two empty sets.

`mlxtend` is a **development dependency only**. It is never imported by `app/`;
it exists as a test oracle.

---

## 4. From reports to patterns

```
approved reports
   → clean (drop unapproved, null-island, undated)
   → dedupe (same reporter, same place, same hour — never across reporters)
   → DBSCAN cluster (haversine, eps 150 m, min 3 reports)
   → transactions (one per report)
   → ECLAT (min support 0.5, max length 3)
   → risk score (0–100)
   → candidates (unpublished)
```

### One report is one transaction

The alternative — one _cluster_ per transaction — was rejected. With a handful of
clusters there are too few transactions for a support threshold to mean anything,
and the patterns found would describe which clusters resemble each other rather
than what tends to happen at a dangerous place. Per-report transactions answer
the useful question and give support a real denominator.

### Items are namespaced `key=value`

`severity=high` and a hypothetical `type=high` would otherwise be the same item,
and a pattern mixing them would be nonsense that looks entirely plausible.

Four item kinds are derived, all from fixed-choice fields or the timestamp:

- `type=` — incident type
- `severity=` — reporter-assessed severity
- `time=` — night / morning-peak / daytime / evening-peak / evening
- `day=` — weekday / weekend

**No free text is ever mined.** Report descriptions are not even read from
Firestore, so a pattern cannot surface something someone wrote about themselves
or another person.

---

## 5. What the output means — and does not

This is the section to read before trusting a number.

**Patterns are descriptions, not predictions.** `describe_itemset` produces
"incident type accident and time of day night — in 89% of reports here". That is
a statement about the reports on record. It is not a claim that an accident will
happen there tonight, and the wording is asserted in the tests to contain no
predictive language.

**The risk score is a ranking heuristic, not a measurement of danger.** It orders
a moderation queue. Its components and weights:

| Component     | Weight | What it captures                                                   |
| ------------- | ------ | ------------------------------------------------------------------ |
| Corroboration | 0.35   | Distinct **people** reporting — the strongest signal               |
| Severity      | 0.30   | Mean reported severity                                             |
| Volume        | 0.20   | Report count — easiest to inflate, so weighted below corroboration |
| Recency       | 0.15   | Age of the most recent report, decaying over 2 years               |

Design choices worth knowing:

- **Distinct reporters, not reports.** Twenty reports from one person is one
  person's opinion; three from three people is corroboration. Deduplication never
  collapses across reporters for exactly this reason — that would delete the
  signal the score is built on.
- **Severity is the mean, not the maximum.** Using the maximum would make the
  component trivially inflatable by a single report.
- **Recency uses the most recent report, not the mean age.** A long history plus
  an incident last week is currently dangerous; averaging would hide that.
- **Components saturate, and are absolute rather than relative to the dataset.**
  Scaling against the largest cluster present would mean adding a busy new area
  silently lowered every existing candidate's score, so a moderator would see
  candidates they had already reviewed change for unrelated reasons.
- **Nothing ever scores 100.** The saturating curve approaches but never reaches
  its ceiling. That is honest for a heuristic ranking crowd-sourced evidence.

Observed calibration:

```
 18  low       3 reports, 1 person, low severity, 2 years old
 47  medium    4 reports, 2 people, medium, 60 days
 58  high      8 reports, 5 people, medium, 14 days
 81  critical  20 reports, 10 people, high, 1 day
 97  critical  200 reports, 100 people, high, today
```

**A place with no reports scores nothing, and that says nothing about safety.**
Coverage is crowd-sourced and unevenly distributed. Absence of evidence is not
evidence of absence — the same rule the app's empty states follow.

---

## 6. Candidates are never published

The project's central rule: **an algorithm must not be able to put a hazard
warning in front of users.** Four independent things hold that line.

1. **A different collection.** Output goes to `blackSpotCandidates`, never
   `blackSpots`.
2. **The app cannot read it.** Not "reads it and filters" — `firestore.rules`
   denies ordinary users outright, so no client bug can surface a candidate.
   Moderators and admins can read it; that is the review queue.
3. **No client can write one.** `allow write: if false` for every role. Even a
   stolen admin token cannot manufacture a proposal.
4. **A different shape.** A candidate carries no `verified` and no `active`
   field, which is precisely what the mobile query requires, so it could not
   satisfy that query even if copied across.

Verified in `firebase/tests/candidates.test.mjs` against the real rules engine,
and in `tests/test_pipeline.py` for the service side.

Publishing means an administrator creating a `blackSpots` document through the
dashboard — a separate, deliberate, audited act.

---

## 7. Reproducibility and versioning

`ALGORITHM_VERSION` is written onto every candidate **and** every job record, and
every parameter that affected a result is stored with the job. Without that, a
candidate in the queue is unreviewable: there is no way to tell which version of
the scoring produced a 72, and therefore no way to re-run or challenge it. Bump
it whenever a change alters output for unchanged input.

Candidate ids are derived from the job and cluster (`job-abc123--cluster-0`), so
re-running a job overwrites its own candidates rather than piling up
near-duplicates in the moderation queue.

---

## 8. Known limitations

- **No timezone handling.** `time=` bands use the stored timestamp as-is. The
  service does not know the reporter's local offset, and guessing one would place
  incidents in the wrong band with an air of precision.
- **Only four item kinds.** Road type, weather and lighting would all be more
  informative, and none of them is collected. Adding an item kind is one function
  in `transactions.py`.
- **DBSCAN parameters are global.** A 150 m neighbourhood suits an urban junction
  and is probably too tight for a rural A-road. Per-region tuning is not
  attempted.
- **The real-project path is untested.** Every run so far has been against the
  Firestore emulator. `GOOGLE_APPLICATION_CREDENTIALS` and Application Default
  Credentials are written but never exercised.
- **No scheduling.** Runs are triggered by an HTTP call. Running it on a schedule
  is deployment work that no phase performed; no scheduler exists.

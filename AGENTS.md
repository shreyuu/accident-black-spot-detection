# Project Agent Instructions

Authoritative instructions for AI coding agents working on this repository.
They sit above any default behaviour, and below anything the human asks for
directly.

Three companion documents carry the rest of the picture, and they are not
optional reading:

| File                           | Answers                                                     |
| ------------------------------ | ----------------------------------------------------------- |
| [`flow.md`](flow.md)           | **How** the system executes — call chains, data flow, gates |
| [`decisions.md`](decisions.md) | **Why** the code is shaped the way it is — DEC-001 onwards  |
| [`docs/`](docs/)               | One document per subsystem, plus [`docs/adr/`](docs/adr/)   |

---

## Project Overview

A location-based road-safety system. It detects accident-prone **black spots**,
alerts users who approach one, accepts moderated incident reports, and provides
emergency SOS assistance.

Four deployables and one shared package, sharing a Firestore database and
nothing else:

| Deployable              | Stack                                         | Firebase SDK | Security rules |
| ----------------------- | --------------------------------------------- | ------------ | -------------- |
| `apps/mobile`           | Expo / React Native, Expo Router              | **Client**   | **Apply**      |
| `apps/admin`            | Next.js (App Router) moderation dashboard     | Admin        | Bypassed       |
| `functions`             | Firebase Cloud Functions (TypeScript)         | Admin        | Bypassed       |
| `services/analytics`    | FastAPI (Python), managed by `uv`             | Admin        | Bypassed       |
| `packages/shared-types` | TypeScript source, imported by mobile + admin | —            | —              |

**The load-bearing asymmetry:** only the mobile app is constrained by
`firebase/firestore.rules`. Everything else uses the Admin SDK and bypasses the
rules entirely, so every guarantee is enforced **twice** — once in rules, once
in code. Never "fix" a redundant-looking check in one of those pairs without
reading `docs/security-and-privacy.md` §1 first.

## Repository Architecture

```
apps/mobile/          Expo app — the only rules-constrained client
  app/                Expo Router screens; file-based routing
    (auth)/           login, register, forgot-password
    (tabs)/           map, report, sos, settings
    black-spots/[id].tsx, nearby/, reports/, account/data.tsx,
    emergency-contacts/
  src/features/       One folder per feature: UI + hooks + pure cores
    alerts/           proximityEngine.ts, zoneStateStore.ts,
                      backgroundLocationTask.ts, backgroundRunHealth.ts
    black-spots/      blackSpotRepository.ts, useNearbyBlackSpots.ts,
                      blackSpotCache.ts
    reports/          submitIncidentReport.ts, draftQueue.ts,
                      EmailVerificationGate.tsx, reportSchemas.ts
    auth/ location/ sos/ emergency-contacts/ nearby-places/ settings/ account/
  src/services/firebase/   Firebase SDK access (app.ts)
  src/utils/          geo.ts, errors.ts, logger.ts, useNow
  src/components/     Reusable presentation (AppText, AppButton, ErrorBoundary…)

apps/admin/src/       Next.js moderation dashboard
  app/(dashboard)/    reports, black-spots, roles, audit
  app/api/session/    session cookie exchange
  lib/                actions.ts, data.ts, session.ts, auditLog.ts,
                      firebaseAdmin.ts, reporterPrivacy.ts

functions/src/        Cloud Functions — deleteAccount, exportMyData,
                      nearbyPlacesProxy, sweepOrphanedImages (+ orphanSweep.ts,
                      the extracted testable core — see DEC-005)

services/analytics/app/
  api/routes.py       POST /analyse, GET /health, GET /jobs
  services/           pipeline.py (run_pipeline), cleaning.py
  algorithms/         clustering.py (DBSCAN/haversine), eclat.py,
                      transactions.py, risk_score.py, geo.py
  models/             domain.py, schemas.py
  repositories/       firestore.py

packages/shared-types/src/  roles, moderation, reportLimits, vocabulary, audit

firebase/             firestore.rules (43 KB — read it), storage.rules,
                      firestore.indexes.json, seed/, tests/, scripts/
scripts/              Repo-hygiene gates run by `npm run test:scripts`
docs/                 Subsystem documentation + docs/adr/
.github/workflows/    ci.yml (four jobs), advisories.yml (weekly)
```

## Development Environment

npm workspaces at the root (`apps/*`, `packages/*`, `firebase`, `functions`);
Node `>=20.19.4`. The analytics service is **not** an npm workspace — it is a
Python 3.12+ project managed by `uv` and driven through root npm scripts.

Commands that matter, all from the repository root:

```bash
npm run verify          # format:check → lint → typecheck → test → test:scripts → scan:secrets
npm run verify:all      # the above + analytics:verify + test:rules + test:functions
npm run emulators       # Auth + Firestore + Storage + Functions emulators
npm run start           # Expo dev server
npm run admin           # Next.js dashboard
npm run analytics       # uvicorn on :8000
npm run analyse         # trigger the analytics pipeline
```

Secrets live in `.env` files that are gitignored; only `*.example` templates are
tracked. **Never print, echo, or copy `.env` contents into a file, a commit, a
log, or a chat message.** `npm run scan:secrets` is the gate that catches this.

## Graphify

A tree-sitter-derived knowledge graph of the whole repository lives in
`graphify-out/` (`graph.json`, `GRAPH_REPORT.md`, `graph.html`). It currently
holds ~2.4k nodes and ~5.5k edges across TypeScript, Python and shell.

**Graphify is the first tool to reach for on architectural and relationship
questions** — before grepping, and before reading files. It returns a scoped
subgraph rather than a pile of file contents.

```bash
graphify query "<architectural question>"   # BFS over the graph; --budget N to widen
graphify explain "<component>"              # a node and its neighbours
graphify path "<A>" "<B>"                   # shortest path; --undirected if none found
graphify affected "<symbol>"                # reverse traversal — blast radius of a change
graphify god-nodes --top 10                 # the architectural hubs
```

Use it for questions like:

- What calls this service? → `graphify affected "run_pipeline()"`
- Which components participate in producing a black spot candidate?
  → `graphify query "how are black spot candidates produced"`
- What connects the mobile map to Firestore?
  → `graphify path "useNearbyBlackSpots.ts" "getFirebaseFirestore()"`
- What breaks if I change this? → `graphify affected "toAppError()"`

Graphify **does not** replace reading source when exact implementation detail
matters. Its edges are syntactic. Treat them as a map, not as proof.

A `PreToolUse` hook in `.claude/settings.json` reminds agents to query the graph
before searching raw files. It is a reminder, not a block.

**Known gap:** community labels in `GRAPH_REPORT.md` are `Community N`
placeholders. Naming them needs an LLM backend. With `ANTHROPIC_API_KEY`
exported, `graphify label .` fills them in. Node and edge data are unaffected.

## Serena

Serena provides **LSP-backed semantic code intelligence** over this repository:
real definitions, real references, real callers — resolved by the TypeScript and
Python language servers, not by text matching.

- MCP server: registered for Claude Code at user scope as `serena`, running
  `serena start-mcp-server --context=claude-code --project-from-cwd`.
- Project config: [`.serena/project.yml`](.serena/project.yml), language servers
  `typescript` (268 files, covers `.ts`/`.tsx`/`.js`/`.mjs`) and `python`
  (31 files). Nothing else — the Swift and Kotlin under `apps/mobile/ios|android`
  is generated `expo prebuild` output, gitignored, and must not be indexed.
- `ignore_all_files_in_gitignore: true`, so `node_modules/`, `functions/lib/`
  and native build output stay out of the index.

Prefer Serena for:

- finding a symbol and its exact definition,
- finding every reference to it,
- discovering callers and dependents,
- examining a file's symbol structure without reading the whole file,
- symbol-level edits and refactoring.

Re-index after large structural changes:

```bash
serena project index .
serena project health-check .    # confirms the language servers still resolve
```

## Code Investigation Strategy

```
Need architecture / relationships / blast radius?
        ↓
Graphify          graphify query | explain | path | affected

Need an exact symbol, its definition, or its callers?
        ↓
Serena            find_symbol · get_symbols_overview · find_referencing_symbols

Need exact implementation detail?
        ↓
Serena to locate  →  read only that symbol's range

Need config, Markdown, YAML, JSON, env-var names, shell, or generated files?
        ↓
Ordinary grep / glob
```

Ordinary search remains correct and expected for: `firebase/firestore.rules`
(it is not a language Serena indexes), `.github/workflows/*.yml`,
`package.json` scripts, `*.example` templates, `docs/**`, and anything where the
question is textual rather than semantic.

**Do not read a whole large source file when Serena can return the one symbol
you need.** `firebase/firestore.rules` is 43 KB and `flow.md` is 29 KB —
navigate by section, not by full read.

## Change Workflow

Every substantial coding task follows this sequence:

```
 1. Understand the request
 2. Query Graphify for architectural context
 3. Use Serena to locate the relevant symbols and references
 4. Inspect only the implementation that matters
 5. Identify the affected execution flow in flow.md
 6. Make the smallest correct change
 7. Run tests / lint / type checks
 8. Update decisions.md if a meaningful decision was made
 9. Update flow.md if execution, data, or control flow changed
10. Refresh the Graphify graph
11. Verify the affected relationships still hold
```

### Graph refresh policy

After any meaningful structural change — new module, moved file, renamed or
deleted symbol, changed import graph — run the incremental update:

```bash
graphify update .
```

It is AST-only and costs nothing. Add `--force` after a refactor that **deletes**
code, otherwise the shrink guard refuses to overwrite a larger graph.

A full rebuild (`graphify extract . --code-only` then `graphify cluster-only .`)
is only warranted when:

- initialising the repository,
- the graph has become inconsistent with the tree,
- a major restructuring has happened,
- an incremental update cannot correctly reflect the project.

Cosmetic edits, comment changes, and documentation edits do **not** need a
refresh.

## decisions.md Rules

[`decisions.md`](decisions.md) is a living engineering decision log, running from
`DEC-001`. Read [its "Scope of this file" section](decisions.md) before adding to
it — decisions from Phases 0–14 live in `docs/adr/`, `docs/`, and source
comments, and are deliberately **not** duplicated.

**Append a new `DEC-NNN` when** a change involves: choosing one library or
pattern over another; changing data flow, an API, or a Firestore schema;
introducing caching or a new abstraction; changing ML preprocessing, scoring, or
clustering behaviour; changing state management or the error-handling strategy;
a security, privacy, performance, or compatibility trade-off; or a deliberate
decision _not_ to take an obvious approach.

**Do not** add an entry for formatting, typo fixes, dependency bumps with no
behavioural consequence, or test-only additions that change nothing about the
design.

Rules that must hold:

- Existing IDs are **never** renumbered and existing entries are **never**
  rewritten. Append only.
- A superseded decision is marked `Superseded` / `Deprecated` / `Reverted` with a
  reference to the newer `DEC-NNN`. The original text stays.
- Where a source comment already argues the point, **link to it** rather than
  copying it — this codebase documents _why_ at the point of decision, and two
  copies will drift.
- Follow the existing entry shape: Date · Status · Affected Areas · Context ·
  Decision · Reasoning · Alternatives Considered · Trade-offs · Consequences ·
  Revisit When.

## flow.md Rules

[`flow.md`](flow.md) describes how this system actually executes. Every chain in
it was traced against source, and where a path is unverified it says so.

**Update it when** execution order, a call chain, a data path, an entry point, a
startup step, or an error path changes. **Do not** update it when only
implementation detail inside an existing step changed.

Rules that must hold:

- Every file, module, class, and function named in `flow.md` must actually
  exist. **Never invent a symbol.** Verify with Serena before writing it down.
- If you add a chain you have not traced end to end, say so explicitly rather
  than implying verification.
- Keep the `Verification gates` section in step with `package.json` scripts and
  `.github/workflows/ci.yml`.

## Testing and Validation

| Command                    | Scope                                                        | Needs emulators |
| -------------------------- | ------------------------------------------------------------ | --------------- |
| `npm run verify`           | format, lint, types, jest, repo-hygiene scripts, secret scan | no              |
| `npm run test:rules`       | `firebase/firestore.rules` + `storage.rules`                 | yes             |
| `npm run test:functions`   | Cloud Functions                                              | yes             |
| `npm run analytics:verify` | ruff + mypy (strict) + pytest                                | no              |
| `npm run verify:all`       | all of the above                                             | yes             |

- Jest enforces **per-path coverage floors**, not one global percentage — see
  `DEC-004`. A new module under a floored path needs tests to land at all.
- `checkWorkflowParity.mjs` fails if `.github/workflows/ci.yml` stops running a
  step that `npm run verify` runs. Change both together.
- `checkNativeBuildOutput.mjs` fails if `expo prebuild` output gets committed —
  see `DEC-001`.
- The analytics tests treat determinism as an acceptance criterion. A test that
  passes only sometimes is a failure, not a flake.
- Run the narrowest relevant gate while iterating; run `npm run verify` before
  declaring a change complete.

## Documentation Requirements

When a change lands, ask in order:

1. Did a **decision** get made? → append to `decisions.md`.
2. Did **execution or data flow** change? → update `flow.md`.
3. Did a **subsystem's behaviour** change? → update the matching `docs/*.md`.
4. Did the **structure** change? → `graphify update .`.
5. Did **setup or commands** change? → update `README.md`.

The README is deliberately a quick start plus an index (see `DEC-007`). Depth
belongs in `docs/`, not in the README.

## Things Agents Must Not Do

- **Do not** print, copy, or commit the contents of any `.env` file, service
  account key, keystore, or provisioning profile. Only `*.example` templates are
  tracked, and that is deliberate.
- **Do not** commit or push anything unless the human explicitly asks.
- **Do not** commit `expo prebuild` output (`apps/mobile/ios|android`, or a
  root-level `/ios`, `/android`, `/app.json`). See `DEC-001`.
- **Do not** weaken `firebase/firestore.rules` or `storage.rules` to make a test
  or a feature pass. The rules and the Admin-SDK code are a matched pair; break
  one and the guarantee is gone.
- **Do not** add a `verified` or `active` field to `blackSpotCandidates`. Their
  absence is what prevents a candidate ever satisfying the mobile app's
  `blackSpots` query. See `flow.md` § Analytics service.
- **Do not** let anything on the background task's path throw — an escaping
  exception is reported by the OS as a task failure. See
  `docs/background-monitoring.md`.
- **Do not** rewrite or renumber existing `decisions.md` entries.
- **Do not** invent file, function, or class names in `flow.md`, `decisions.md`,
  or this file. Verify with Serena first.
- **Do not** add languages to `.serena/project.yml` that the repository does not
  actually use, and do not index generated native build output.
- **Do not** install Serena or Graphify into the project's own dependency
  environments. They are external developer tools installed with
  `uv tool install`, and `services/analytics/pyproject.toml` stays lean by
  design.
- **Do not** add dependencies unrelated to the task at hand.
- **Do not** trust the Graphify graph over the source code. Graph → map,
  Serena → semantics, **source code → ground truth**.

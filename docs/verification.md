# Verification

What each gate covers, what it does not, and how to run the suites that need emulators.
Moved out of the README; `npm run verify` remains the one command a developer needs.

---

## Verification

Run the whole gate — formatting, linting, strict typecheck, tests, and the secret scan:

```bash
npm run verify
```

That needs **no emulator**. Two further gates do:

```bash
npm run test:rules
```

The Firestore and Cloud Storage security rules, evaluated by the real rules engine against the
emulator — 151 tests covering ownership, roles, rate limiting, duplicate detection, reporter
privacy and the upload rules.

Both emulator gates have a `:ci` variant that starts and stops the emulators themselves, which is
what the CI workflow runs and what to use if you would rather not keep a second terminal open:

```bash
npm run test:rules:ci
```

```bash
npm run test:functions:ci
```

```bash
npm run test:functions
```

End-to-end verification of account deletion and data export against the Auth, Firestore, Storage
and Functions emulators. This is the test that proves deletion _actually_ removes the data rather
than proving the policy that describes it.

Everything at once, emulators running:

```bash
npm run verify:all
```

The same gates run in CI on every push and pull request — see
[`.github/workflows/ci.yml`](../.github/workflows/ci.yml). `npm run verify` also checks that the
workflow has not drifted below it: `scripts/checkWorkflowParity.mjs` fails if a step exists locally
but not in CI, so a gate added here cannot silently be weaker there. **The workflow has never been
run on GitHub** — each job's commands were executed locally.

Coverage:

```bash
npm run test --workspace @accident-black-spot-detection/mobile -- --coverage
```

Mobile line coverage is **48%**, and the shape matters more than the number: the pure,
safety-critical cores — the proximity engine, the draft queue, the report limits, the moderation
rules — are covered thoroughly, while presentational components and hooks are thin. Phase 13 added
screen-level tests for the warning banner specifically because a regression there is harmful rather
than merely ugly.

Behaviour that automated tests cannot reach — real permissions, real OS dialogs, real process
death — is covered by [`manual-test-plan.md`](manual-test-plan.md): twenty scenarios,
twelve executed and recorded on an Android device build, eight documented with steps for a physical
device.

Scan for credentials in anything git is carrying, including files not yet committed:

```bash
npm run scan:secrets
```

Individually:

```bash
npm run format:check
```

```bash
npm run lint
```

```bash
npm run typecheck
```

```bash
npm test
```

Check that installed package versions match the Expo SDK:

```bash
npm run doctor
```

Reformat every file in place:

```bash
npm run format
```

---

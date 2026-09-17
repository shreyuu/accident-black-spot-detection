# Hyperframes Composition Brief: Accident Black Spot Detection — "The machine that doesn't get a vote"

## Objective
A second brag video for the same product, showing the analytics pipeline the first video never
touched: DBSCAN clustering, a hand-written ECLAT, a weighted risk score — and the candidate that
waits, unpublished, for a human.

## Output
- Composition directory: `video-analytics-pipeline/composition/`
- Rendered video: `video-analytics-pipeline/analytics-pipeline-landscape.mp4`
- Format: landscape — 1920x1080
- Duration: 24.9s (6 scenes)

## Source Material
- Project root: `/Users/shreyu/VSCODE/Projects/accident-black-spot-detection`
- Primary files read:
  - `docs/eclat-methodology.md` — the pipeline, the parameters, the honesty section
  - `services/analytics/app/algorithms/clustering.py` — DBSCAN, haversine, defaults
  - `services/analytics/app/algorithms/transactions.py` — time bands, item namespacing
  - `services/analytics/app/algorithms/risk_score.py` — the 0–100 score
  - `services/analytics/app/models/domain.py` — the candidate docstring
  - `apps/admin/` — the moderation dashboard's real button label
- Product name: **Accident Black Spot Detection**
- Tagline: *Every warning has a human behind it.* (same as video 1 — deliberate brand consistency)
- Key visual moment to recreate: **the DBSCAN cluster forming while the noise points fade out**
- Copy that must appear verbatim (all real, all checked against source):
  - `There is no maintained ECLAT library for Python.`
  - `Isolated events are not black spots.`
  - `incident type accident and time of day night — in 89% of reports here`
  - `No free text is ever mined.`
  - `A ranking heuristic. Not a measurement of danger.`
  - `A proposed black spot. Never a published one.`
  - `Publish black spot` *(the dashboard's real button label)*
- Real parameters that must be correct — do not invent numbers:
  - DBSCAN: `metric haversine`, `eps 150 m`, `min_samples 3`
  - ECLAT: `min_support 0.5`, `max length 3`
  - Item namespaces: `type=` `severity=` `time=` `day=`
  - Time bands: `night` `morning-peak` `daytime` `evening-peak` `evening`
  - Risk weights: corroboration `0.35`, severity `0.30`, volume `0.20`, recency `0.15`
  - Risk score range `0–100`; candidate provenance is always `algorithm`

## Creative Direction
- **Tone preset:** `polished`
- **Creative direction:** a quiet engineering film about a machine that stops short on purpose
- **Interpretation:** Restraint as confidence. Slow crossfades, long holds, one idea per scene. Six
  scenes because the pipeline has real stages. Largely a monospace film — that is the honest
  typography for parameters, items and file paths.
- **Angle:** It does all the maths and still doesn't get the vote. The pipeline is genuinely hard
  work (an ECLAT written from scratch, cross-validated against `mlxtend.fpgrowth`) and the video
  earns the right to show it — then ends on a candidate marked UNPUBLISHED beside a button nobody
  presses.
- **Hook:** `There is no maintained ECLAT library for Python.` → *So this repository implements one.*
- **Outro / punchline:** the **Publish black spot** button, drawn and enabled and never pressed,
  with no sound at all.
- **Avoid:**
  - Generic SaaS language; abstract filler; unrelated redesign
  - Any dramatisation of a crash; any siren/alarm motif (same rule as video 1)
  - Predictive language anywhere — the methodology doc asserts in tests that the generated
    description contains none, so the video must not add any
  - Making the algorithm look authoritative; the whole point is that it is not

## Visual Identity
Same brand truth as video 1 (`apps/mobile/src/theme/tokens.ts`, dark theme) so both read as one
product. This one leans on the accent rather than the risk ramp — it is about process, not danger.

- Background `#060F1D` · Surface `#0B1F3A` · Nested `#122C4F` · Border `#1B3B66`
- Text `#F6F8FB` · muted `#B3BDCC` · subtle `#8794A6`
- Accent `#7FB0F7`; risk ramp only where a level is actually named (`#F79B5C` high)
- Display: system sans 800 · **monospace throughout for data**
- Visual references: the cluster hull forming; the transaction rows; the weighted bars; the
  candidate card with its status chip

## Storyboard
Use the storyboard in `brag-plan.md` as the creative contract.

Scene summary:
1. **The library that doesn't exist** — 3.55s (0.00→3.55) — the ECLAT line, then the consequence.
2. **DBSCAN, and what it discards** — 5.74s (3.55→9.29) — dots arrive on the beat grid, hulls form,
   four outliers fade to `noise · dropped`; parameters in mono down the left.
3. **One report, one transaction** — 5.44s (9.29→14.73) — four `key=value` rows build, shared items
   highlight, the itemset lifts out with `support 0.89` and the real generated sentence.
4. **A ranking heuristic** — 3.28s (14.73→18.01) — four weighted bars, a score counting to 78, and
   the honest label.
5. **Then it stops** — 4.36s (18.01→22.37) — the candidate card assembles, stamped `UNPUBLISHED`,
   beside a `Publish black spot` button that is never pressed.
6. **The name** — 2.53s (22.37→24.90) — name on the 22.37s cue, tagline on 22.92s.

## Audio
- **Audio role:** sparse professional accents over a low, steady bed — a process film
- **Audio arc:** level throughout; density rises with the dots and rows, then drops to nothing for
  the button; a gentle resolve under the name
- **Music:** `happy-beats-business-moves-vol-10-by-ende-dot-app.mp3` (109.96 BPM)
- **Music treatment:** steady ~0.20, no ducking theatrics, gentle fade across the last 1.1s.
  Deliberately unlike video 1's hard cut to silence.
- **Music cue guidance:** preset at
  `~/.claude/plugins/cache/brag/brag/0.2.2/skills/brag/assets/music/cues/happy-beats-business-moves-vol-10-by-ende-dot-app.music-cues.{md,json}`.
  Strong cues to lock: **15.82s** (risk bars), **18.55s** (candidate card), **22.92s** (tagline).
  Beat grid for sequential reveals: report dots from **4.10s**, transaction rows from **9.83s**
  on alternating beats (they are text, so every other beat — a 0.55s spacing outruns reading).
- **Audio-reactive treatment:** subtle — background glow depth breathes with RMS. No waveform or
  equalizer visuals, no text scaling.
- **Audio-coupled moments:**
  - Scene 2, ~11 report dots — soft placements on consecutive beats, alternating files
  - Scene 2, hulls closing — one soft impact; **nothing** on the noise points fading out
  - Scene 3, four transaction rows — quiet placements; one soft impact on the itemset lift
  - Scene 4, four bars — one soft tick each; nothing on the counter
  - Scene 5, candidate card — one soft impact; **explicitly nothing on the Publish button**
- **SFX selection guidance:** soft UI only — `interface/drop_002`/`drop_003` (warm, negligible
  brightBurden, safe to repeat) and `impact/impactSoft_medium_001`/`_002` (warm, low HF risk) for
  the three genuine discoveries. **Forbidden:** `error_*`, `impactPunch_*`, `glitch_*`, anything
  siren-like.
- **Audio files:** already copied into `composition/assets/`.

## Hyperframes Instructions
Load `hyperframes-core`, `hyperframes-animation`, `hyperframes-creative`, `hyperframes-keyframes`
and `hyperframes-cli`. /brag is its own workflow — do not enter the `hyperframes` entry-point intent
interview or route into its generic promo / launch-video workflow.

Requirements:
- Show real UI, copy and parameters from the project — every number above is checked against source.
- Keep all text readable: short label ≥0.8s settled, a sentence ≥0.3s per word. The generated
  description sentence and the two honesty lines get the longest holds.
- **Verify text layout from the rendered MP4, not from `snapshot`.** On video 1 the render worker
  resolved `system-ui` to a wider face than the snapshot browser did, and a headline that looked
  fine in the contact sheet collided with the element beneath it in the actual render.
- Keep the video within 15–25 seconds.
- Lock 1–3 strong cues, marked `// beat-locked`; mark sequential runs `// beat-grid`.
- Run `hyperframes check` before render — it is brag's single gate.

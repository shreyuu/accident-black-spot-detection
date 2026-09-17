# Brag Plan: Accident Black Spot Detection — "The machine that doesn't get a vote"

> Second brag video. The first one (`video-app-walkthrough/`) used the app's disclaimers as its script.
> This one shows the half that video never touched: the analytics service behind the warnings.

## What is this app?

A road-safety app whose black spots are proposed by a Python service — DBSCAN clustering plus a
hand-written ECLAT implementation plus a risk score — and then published by nobody until a human
approves them. The machine does every piece of the analysis and is still not allowed to decide.

## The angle

**It does all the maths. It still doesn't get the vote.**

The pipeline is genuinely impressive and the video earns the right to show it: haversine DBSCAN,
an ECLAT implementation written from scratch because no maintained Python one exists,
cross-validated against `mlxtend.fpgrowth`, a weighted risk score. Then the last frame of the
pipeline is a candidate marked *unpublished*, and a **Publish black spot** button that nobody
presses. The flex and the restraint are the same story — same DNA as the first video, completely
different body.

## Hook (first 2-3 seconds)

A stated fact, not a boast:

> **There is no maintained ECLAT library for Python.**

Then, smaller, underneath: `So this repository implements one.`
Credit: `docs/eclat-methodology.md`

Any engineer watching knows exactly what that sentence costs.

## Key moments (the middle)

- **DBSCAN, and what it throws away.** Approved reports land on a dark map; clustering pulls two
  groups together and **dims the isolated ones out** — noise, dropped. `eps 150 m · min 3 reports ·
  haversine`. The honest caption: *Isolated events are not black spots.*
- **Transactions, namespaced.** Report rows resolve into `type=` `severity=` `time=` `day=` items,
  one transaction per report, and the mined itemset lifts out of them.
- **The sentence it generates.** The real `describe_itemset` output, verbatim:
  *"incident type accident and time of day night — in 89% of reports here"* — with the guard beside
  it: **No free text is ever mined.**
- **The score, weighted and labelled honestly.** Four bars — corroboration .35, severity .30,
  volume .20, recency .15 — under the line *A ranking heuristic. Not a measurement of danger.*

## Outro / punchline

The candidate card, complete, scored, and stamped **UNPUBLISHED** — beside a **Publish black spot**
button that is never pressed. It gets no sound. Then the name.

## User flow worth showing

This video's "user" is the pipeline, and its three beats are real:

1. **Entry** — approved reports arrive and are cleaned and deduped.
2. **Key action** — DBSCAN clusters them; ECLAT mines the pattern; the risk score ranks it.
3. **Result** — a candidate is written *unpublished* and waits in a moderation queue.

## Tone

- **Preset:** `polished`
- **Creative direction:** a quiet engineering film about a machine that stops short on purpose
- **Interpretation:** Restraint as confidence. Slow crossfades, generous holds, one idea per scene,
  no winking. The material is impressive enough that overselling it would cheapen it. Six scenes
  rather than polished's usual three-to-four, because the pipeline has real stages and skipping one
  would misrepresent it.

## Format: landscape — 1920x1080
## Duration: 24.9s

## Visual identity (from the project)

Same brand truth as the first video — `apps/mobile/src/theme/tokens.ts`, dark theme — so the two
videos read as one product. This one leans on the **accent** rather than the risk ramp, because it
is about process, not danger.

- Background: `#060F1D` · Surface `#0B1F3A` · Nested `#122C4F` · Border `#1B3B66`
- Text: `#F6F8FB` · muted `#B3BDCC` · subtle `#8794A6`
- Accent: `#7FB0F7` · Risk ramp used only where a level is actually named
- Display: system sans (800) · **monospace for every item, parameter and file path** — this video is
  largely a monospace film, which is the honest typography for what it depicts
- Strongest visual: the cluster forming while the noise points fade out

## Share copy (draft)

The black spots in my road-safety app are found by DBSCAN and an ECLAT implementation I had to write
myself. None of them reach a user until a person approves them.

## Audio direction

- **Role:** low, steady bed with sparse motion-matched accents — a process film, not a trailer
- **Music:** `happy-beats-business-moves-vol-10-by-ende-dot-app.mp3` (109.96 BPM, 60s)
- **Music treatment:** steady ~0.20 throughout, no ducking theatrics; gentle fade over the last 1.1s
  so the film resolves rather than stops. Deliberately *unlike* the first video's silent ending.
- **Music cue guidance:** preset `cues/...vol-10...music-cues.md`. Strong cues to target:
  **15.82s** (risk bars), **18.55s** (candidate card), **22.37s** (name), **22.92s** (tagline).
  Beat grid for sequential reveals — report dots and transaction rows — from 4.10s and 9.83s.
  Lock no more than 3 strong cues.
- **Audio-reactive treatment:** subtle; background glow depth breathes with RMS. No waveforms.
- **SFX posture:** sparse, ~8 quiet cues; the report dots are the only dense moment
- **Restraint rule:** no sirens, alarms or crash impacts (same as video 1), **and the Publish
  button gets no sound at all** — its silence is the ending.

## Storyboard

### Scene 1 — The library that doesn't exist — 3.55s (0.00 → 3.55)
Empty navy, anchored left. Mono kicker `PHASE 10 · PATTERN MINING`. The line lands large and holds:
**"There is no maintained ECLAT library for Python."** Beneath, after a beat, smaller and quieter:
*So this repository implements one.* Mono credit: `docs/eclat-methodology.md`.
Sequential/interaction: none — statement, then consequence.
Audio intent: a bed that has already started; nothing announces itself.
Audio-coupled idea: none on the hook.
Transition mood: slow crossfade → Scene 2

### Scene 2 — DBSCAN, and what it discards — 5.74s (3.55 → 9.29)
Dark map, right two-thirds. Approved report dots arrive scattered, on the beat grid from 4.10s.
Then clustering resolves: two groups draw a hull and pull tight in accent blue, while **four
outliers fade to 20% and get the label `noise · dropped`**. Left column carries the parameters in
mono: `DBSCAN`, `metric haversine`, `eps 150 m`, `min_samples 3`, and the caption *Isolated events
are not black spots.*
Sequential/interaction: **yes** — ~11 dots arrive on consecutive beats, then hulls form, then the
outliers fade. Three distinct movements.
Audio intent: assembly. Quiet, procedural, unhurried.
Audio-coupled idea: a soft placement per dot (low volume, alternating files); one soft impact as the
hulls close. Nothing on the noise fade — things being discarded should be silent.
Transition mood: soft crossfade → Scene 3

### Scene 3 — One report, one transaction — 5.44s (9.29 → 14.73)
Monospace centre stage. Four transaction rows build one by one from 9.83s on the beat grid:
`type=accident  severity=high  time=night  day=weekday` and so on. Then the shared items
**highlight in accent across every row** and lift out as the mined itemset
`{type=accident, time=night}` with `support 0.89`. Beneath it, the real generated sentence:
*"incident type accident and time of day night — in 89% of reports here"*. A mono guard sits at the
foot: **No free text is ever mined.**
Sequential/interaction: **yes** — four rows on alternating beats (text, so every other beat), then a
highlight sweep, then the lift-out.
Audio intent: something being worked out, then found.
Audio-coupled idea: a quiet placement per row; one soft impact on the itemset lift.
Transition mood: clean → Scene 4

### Scene 4 — A ranking heuristic — 3.28s (14.73 → 18.01)
Four weighted bars fill from the left, labelled in mono with their weights:
`corroboration 0.35` · `severity 0.30` · `volume 0.20` · `recency 0.15`. A score counts up to **78**
beside them. The line underneath is the honest one: **"A ranking heuristic. Not a measurement of
danger."** Small mono note: *it orders a moderation queue.*
Sequential/interaction: **yes** — bars fill staggered; the score counts rather than appears.
Audio intent: measurement. Precise, not dramatic.
Audio-coupled idea: one soft tick per bar; nothing on the counter.
Transition mood: clean → Scene 5

### Scene 5 — Then it stops — 4.36s (18.01 → 22.37)
The candidate card assembles on the strong cue at 18.55s: location, `risk high · score 78`, the
mined pattern, `provenance: algorithm`, and a status chip reading **UNPUBLISHED**. Beside it sits
the dashboard's real button, **Publish black spot** — drawn, enabled, and never pressed. The line:
**"A proposed black spot. Never a published one."** (verbatim docstring from
`app/models/domain.py`). Mono credit beneath.
Sequential/interaction: **yes** — the card assembles field by field, then the button appears last
and simply waits. No cursor, no press.
Audio intent: arrival, then a held breath. The button's silence is the whole point.
Audio-coupled idea: one soft impact on the card; **explicitly nothing on the button.**
Transition mood: slow crossfade → Scene 6

### Scene 6 — The name — 2.53s (22.37 → 24.90)
Name lands on the strong cue at 22.37s, tagline on 22.92s. Same closing line as the first video, so
the two read as one product:
**Accident Black Spot Detection** · *Every warning has a human behind it.*
Music fades gently across the last 1.1s.
Sequential/interaction: none.
Audio intent: resolve, don't stop.
Audio-coupled idea: none.

**Music mood for this video:** polished — a steady, unhurried bed that never asks for attention.
**Audio summary:** A level bed carries a procedural build — dots placing, rows arriving, bars ticking — one soft impact per genuine discovery, and total silence on the button that never gets pressed.

# Accident Black Spot Detection — LinkedIn post & walkthrough art direction

Concept: **Honest safety engineering.**
Scope: presentation only. Not a single character of the caption changes.

Measured against the actual render (`app-walkthrough-landscape.mp4`, 1920×1080, 30 fps, 24.03 s),
the actual poster (`app-walkthrough-landscape.jpg`), the actual composition CSS
(`composition/index.html`) and the actual caption (`linkedin-post.txt`, 2,759 characters).

---

## 1. Critique of the current presentation

### 1.1 The concept is already right — the execution is under-scaled

This is not a generic portfolio video. The dark navy, the deadpan holds, the real file paths, the
`LOCAL EMULATOR BUILD` slug in the top-right, the refusal used as the hook — that is the
correct idea and most people never get there. Everything below is about **delivery**, not concept.

### 1.2 The hard problem: it is typeset for a cinema screen, not for a feed

LinkedIn does not play this at 1920. It plays it at roughly:

| Surface | Rendered width | Scale from 1920 |
|---|---|---|
| Desktop feed | ~555 px | **0.289×** |
| Mobile feed | ~360–400 px | **0.19–0.21×** |

Pulling the real values out of `composition/index.html` and applying mobile scale:

| Element | Size @1920 | On a phone | Verdict |
|---|---|---|---|
| Hook headline | 96 px | ~18 px | Readable, not dominant |
| Scene lines (s2 / s4 / s5) | 62 / 60 / 58 px | ~11–12 px | Marginal |
| `200 m ahead` | 82 px | ~15 px | OK |
| Warning sub-line | 36 px | ~7 px | **Illegible** |
| Form labels / values | 28 / 34 px | ~5–6 px | **Illegible** |
| `PENDING REVIEW` chip | 24 px | ~4.5 px | **Illegible** |
| File-path captions (mono) | 22–24 px | ~4–4.5 px | **Illegible** |
| Risk legend | 23 px | ~4.3 px | **Illegible** |
| Marker chips (`LOW`…`CRITICAL`) | 21 px | ~4 px | **Illegible** |
| Top bar slugs | 22 px | ~4 px | **Illegible** |

Roughly **60 % of the meaning-carrying text in this video cannot be read on the device most
people will watch it on.** That is the single biggest fixable problem.

**Rule to adopt:** at 1920×1080, nothing that carries meaning goes below **56 px**
(≈ 11 px on a phone). Headline type ≥ **150 px**. Anything you were going to set at 22 px is
either enlarged to 56 px or deleted — there is no third option.

### 1.3 The hook frame gives away half the frame for free

Measured on the poster: the headline block occupies x 163→1283, y 365→560 — **58 % of the width,
18 % of the height, ≈ 10 % of the frame area.** You asked for 40–50 %. The right third and the
bottom 40 % are empty navy doing no work.

Also on the hook frame:
- The only "map" element is a single faint arc in the top right. It reads as a stray curve, not a
  road network, and in the scene-5 frame it slices straight through the word *publishes*.
- **There is no hotspot.** The one element that would make the frame say "road safety" at a glance
  is missing.
- The `apps/mobile/src/constants/disclaimer.ts` caption — the detail that turns the headline from an
  ad into a source constant, the whole twist of the hook — is 24 px, parked at the bottom, separated
  from the headline by a full-width rule and ~200 px of gap. At feed scale it is a grey smudge. The
  joke does not land because nobody can see the punchline.
- Frame 0 of the video is **mid-fade** (headline at ~40 % opacity). The exported poster JPG is the
  settled frame, which is correct — but only if you actually upload it as a custom thumbnail.

### 1.4 The strongest idea in the project gets the weakest four seconds

The authorisation boundary is bullet #1 of your caption and the thesis of the whole project.
In the video (13.11 → 17.47 s) it is:

- **told** in a sentence — "An algorithm never publishes a warning on its own."
- **shown** as a small muted chip reading `PENDING REVIEW`.

And the visual hierarchy actively contradicts the message: **`Submit report` is a bright
`#7FB0F7` filled button — the highest-contrast object on screen — while `PENDING REVIEW`, the
thing that matters, is rendered in the lowest-contrast treatment in the frame.** The eye is told
that submitting is the point. The story says the opposite.

Nothing on screen shows *who* approves, *why* it is pending, or that a boundary exists at all.
There is no second actor, no gate, no chain. The sentence is doing 100 % of the work.

### 1.5 No engineering evidence appears anywhere

Your caption promises a `npm run verify` gate, four CI jobs, emulator integration tests, Firestore
rules with their own test suite, Haversine DBSCAN, a hand-written ECLAT. **The video shows none of
it.** The three mono file paths are the only gesture toward it, and they are unreadable.

The video currently proves "I can build a nice-looking app." The caption claims "I think about
failure modes, authorisation boundaries and verification." Those are two different posts.

### 1.6 Smaller things

- **The risk legend is redundant.** Every marker already carries its level word on the chip
  (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) — that is your tokens file's colour-plus-word rule working
  correctly. The legend restates it at 23 px and adds four lines of unreadable clutter. Cut it.
- **Dead left column.** In the warning-card beat, `It warns you before you get there.` disappears
  and leaves the left third empty while the card sits bottom-right. The frame goes lopsided.
- **The SOS disc is the brightest object in the video.** A large filled `#F1888C` circle reading
  `SOS`, alone, outweighs the honesty line beside it. For ~1 s the frame reads as
  *emergency button* before the caveat registers — the exact impression the project exists to avoid.
- **The ending has nothing to act on.** `Accident Black Spot Detection` + tagline, then black.
  No repo, no handle. The one frame people screenshot is the one that should carry the URL.
- **Six beats, five of which are "a card and a sentence."** The grammar never varies, so the video
  reads as a slideshow rather than a system being demonstrated.

### 1.7 The caption

Structurally strong. Three specific notes:

- **Length:** 2,759 characters — 241 under LinkedIn's 3,000 limit. You have room for whitespace.
- **The fold:** LinkedIn truncates at ~210 characters. Your cumulative counts are 91 (line 1),
  152 (line 3), 236 (line 5). So the fold lands **inside** `From the SOS screen: "Opens your dialler.
  This app neve…` — which is a genuinely good place to be cut off. Do not fight it.
- **The Unicode bold is a real trade-off.** `𝗧𝗵𝗲 𝗮𝘂𝘁𝗵𝗼𝗿𝗶𝘀𝗮𝘁𝗶𝗼𝗻 𝗯𝗼𝘂𝗻𝗱𝗮𝗿𝘆` is
  Mathematical Sans-Serif Bold, not styled Latin. Screen readers announce it character by character
  or skip it, and LinkedIn's search index does not match it. For a post whose thesis is that
  accessibility and honesty are engineering disciplines, that is a contradiction someone may notice.
  **This is your call and I have changed nothing** — but the fix is free: line breaks alone
  (section 5) give the four principles the same scannability without the bold.

---

## 2. Redesigned visual concept

> **A system that refuses to publish a warning on its own — shown as a system.**

One sentence drives every decision: the video should look like an **incident-review console**, not
an app promo. The viewer should feel they are watching the inside of a pipeline with a human gate in
it, narrated by the project's own source constants.

Three structural moves:

1. **The refusal is a source constant, not a slogan.** Bind the file path to the headline — same
   block, ~32 px apart, path at 56 px mono. The twist ("this is shipped code, not marketing") has
   to be legible or the hook is just a dark title card.

2. **Make the boundary a visible object.** The four-node chain is the centrepiece, not a chip:
   `REPORT → PENDING → HUMAN REVIEW → APPROVED`, drawn as nodes on a line, with the connector
   between PENDING and HUMAN REVIEW **stalling visibly** for a full beat. Nothing crosses that gap
   automatically. That stall is the whole film.
   *(Source the node labels from `packages/shared-types/src/vocabulary.ts` — `draft` / `pending` /
   `approved` / `rejected` are real statuses. Use your own strings; nothing invented.)*

3. **Spend the last third on evidence.** Replace decorative motion with real artefacts:
   the `npm run verify` step list, the emulator ports, a DBSCAN cluster resolving into a black spot,
   a two-line excerpt of `firestore.rules`. Brief, large, factual.

**The arrow motif (`→`) becomes the film's grammar.** It is already the connective tissue of your
caption. Carry it into: the approval chain connectors, the direction-of-travel vector on the map,
the pipeline in the evidence beat, and one arrow beside the repo URL on the end card. Same stroke
weight (3 px @1920), same `#7FB0F7`, everywhere.

---

## 3. Second-by-second storyboard (24.0 s)

Beat grid: 109.96 BPM → **0.5457 s per beat**. Every cut below lands on a beat, and
17.462 / 21.283 are already scene boundaries in your composition — they do not move.

| # | In → Out | Dur | Beat | What is on screen |
|---|---|---|---|---|
| 1 | 0.000 → 2.728 | 2.73 | **THE REFUSAL** | Hook / thumbnail frame |
| 2 | 2.728 → 7.093 | 4.37 | **THE BLACK SPOTS** | Map builds, warning card lands at 5.457 |
| 3 | 7.093 → 10.368 | 3.28 | **THE DIALLER** | SOS and its limit |
| 4 | 10.368 → 13.642 | 3.27 | **THE REPORT** | Submit → pending |
| 5 | 13.642 → 17.462 | 3.82 | **THE BOUNDARY** | The approval chain stalls |
| 6 | 17.462 → 21.283 | 3.82 | **THE EVIDENCE** | Approved + verification artefacts |
| 7 | 21.283 → 24.011 | 2.73 | **THE NAME** | End card with URL |

> **One deviation from your brief, flagged:** you specified a 0–2 s hook. LinkedIn autoplay takes
> ~0.8–1.2 s to start and settle, so a 2.0 s hook is seen for about one second. 2.73 s is the
> minimum that survives contact with the feed. Everything downstream still lands inside your
> requested windows.
>
> **Also worth knowing:** seven beats in 24 s averages 3.4 s each, which is faster than the
> "long holds" your composition brief is built on. If you can extend to 30 s, give beats 1, 5 and 6
> the extra 6 s — the stall in beat 5 in particular gets much stronger with a longer hold. The 24 s
> cut below works; the 30 s cut would work better.

---

### Beat 1 — THE REFUSAL · 0.000 → 2.728

| t | Action |
|---|---|
| 0.000 | **Frame is already fully settled.** Headline at 100 % opacity on frame 0. No fade-in. |
| 0.000 | Faint road network + hotspot already present, static |
| 0.400 | Hotspot begins a 2.4 s breath (opacity 0.5 → 0.85 → 0.5), nothing else moves |
| 1.150 | File-path caption fades in under the headline over 0.35 s |
| 2.728 | Cut |

Layout — this is also the thumbnail, so it is specified exactly in section 4.1.

The critical change: **no entrance animation on the headline.** Frame 0 must be the finished frame.
LinkedIn's poster, the scrubber preview and the first autoplay frame are all frame 0; if it is
mid-fade you have given away your best asset.

### Beat 2 — THE BLACK SPOTS · 2.728 → 7.093

| t | Action |
|---|---|
| 2.728 | Cross-dissolve 0.25 s. Road network rises from 8 % → 22 % opacity — the map becomes visible as a map |
| 2.9–5.0 | Four markers land on the beat grid: **3.274 / 3.820 / 4.366 / 4.911**. The fifth — the `HIGH` spot — is held back and arrives with the card at 5.457, so the build and the payoff merge |
| 2.9 | Left rail: `It warns you before you get there.` at 72 px, two lines max |
| — | **Legend deleted.** Level words stay on the chips at 56 px |
| 5.457 | User dot enters bottom-left travelling toward the `HIGH` spot, with a `→` vector ahead of it |
| 5.457 | **Warning card lands** on the strong music cue: scale 0.96 → 1.00, 0.28 s, `power3.out`. No bounce |
| 5.7 | Slow 1.00 → 1.06 push-in on the card region, holds to the cut |
| 7.093 | Cut |

Card contents unchanged (`HIGH RISK` / `200 m ahead` / `Junction with 4 recorded incidents.` /
`Distances shown are approximate.`) — but the sub-line goes 36 → 56 px and the footnote 24 → 44 px.

### Beat 3 — THE DIALLER · 7.093 → 10.368

| t | Action |
|---|---|
| 7.093 | Cut. Map holds at 6 % opacity behind — do not go to flat navy |
| 7.093 | **SOS control is an outlined ring, not a filled disc.** 4 px `#F1888C` stroke, `SOS` in `#F1888C` at 108 px, transparent centre |
| 7.35 | The line arrives at 72 px: `Opens your dialler. This app never places a call by itself.` |
| 7.9 | A dialler glyph fades in **outside** the ring, connected by a short `→`. The arrow ends at the dialler — the app hands off, it does not act |
| 8.4 | `apps/mobile/app/(tabs)/sos.tsx` at 56 px mono, directly under the line |
| 8.4–10.368 | **Dead hold.** Nothing moves. Longest still in the video |
| 10.368 | Cut |

Outlining the ring drops it from "brightest object in the film" to "a control that does one modest
thing," which is what the sentence beside it says. The `→` to an external dialler makes the handoff
structural rather than verbal.

### Beat 4 — THE REPORT · 10.368 → 13.642

| t | Action |
|---|---|
| 10.368 | Cut. Report form, **enlarged to ~46 % frame width** (from ~30 %). Labels 56 px, values 64 px |
| 10.6 | Right rail stays empty — deliberately. The form is alone |
| 11.460 | Cursor moves to `Submit report`, 0.5 s ease |
| 12.005 | **Press.** Button scales 1.00 → 0.98 → 1.00 over 0.16 s. One precise tap in the mix |
| 12.278 | Form fields desaturate to 40 % — the input is spent |
| 12.55 | Row appears: `Accident · your report` + `PENDING REVIEW` chip, chip at **64 px**, chip is now the **brightest element in the frame** and `Submit report` has dimmed |
| 13.642 | Cut |

The contrast swap is the whole point of this beat: the moment of submission is not the payoff, the
moment of *not publishing* is.

### Beat 5 — THE BOUNDARY · 13.642 → 17.462

The centrepiece. Everything else exists to earn this.

| t | Action |
|---|---|
| 13.642 | Cut to near-empty navy. The `PENDING REVIEW` chip from beat 4 **match-cuts in place** and becomes node 2 of a chain |
| 13.9 | Chain draws left → right, node by node, connectors as `→` strokes: `REPORT` (13.9) → `PENDING` (14.2) |
| 14.7 | The connector out of `PENDING` starts to draw… and **stops at 40 %.** Stroke goes dashed. It stays there |
| 14.7–15.8 | **1.1 seconds of nothing crossing that gap.** This is the longest deliberate stall in the video. Let it be uncomfortable |
| 15.8 | `HUMAN REVIEW` node fades in **above** the gap, off the main line, in `#F6F8FB` — a different actor, not part of the automatic flow |
| 16.1 | Its connector drops down into the gap and completes it. The dashed line goes solid |
| 16.35 | `APPROVED` node lands in `#5FCB99` |
| 16.6 | Under the chain at 56 px mono: `firebase/firestore.rules` |
| 16.9 | Right rail, 72 px: `An algorithm never publishes a warning on its own.` |
| 17.462 | Cut on the existing strong cue |

**Audio:** the bed thins at 14.7 and there is no accent at all during the stall. The `APPROVED`
node at 16.35 is the only hit. Silence is what sells the gate.

Use only strings your project actually owns. `pending` and `approved` are real statuses from
`vocabulary.ts`; label the other two nodes with your own existing copy rather than inventing
process words.

### Beat 6 — THE EVIDENCE · 17.462 → 21.283

Four artefacts, ~0.95 s each, each entering with a 0.2 s wipe, no other motion. Grammar changes
here — this is the only fast section and the contrast is the point.

| t | Artefact |
|---|---|
| 17.462 | The approved warning appears **back on the map** as a published black spot — the loop closes |
| 18.41 | `npm run verify` — the six steps listed, each with a check mark, at 56 px mono |
| 19.36 | Firebase Emulator Suite — the port table, `firebase/firestore.rules` excerpt beside it |
| 20.31 | The DBSCAN plot: scattered approved reports resolving into one cluster, `eps 150 m · min_samples 3` labelled at 56 px |
| 20.30 | Scrim begins (existing value — keep it), music fades to zero across 20.6 → 21.8 |
| 21.283 | Cut to near-black |

Keep each of these to one legible idea. They are evidence, not a feature tour.

### Beat 7 — THE NAME · 21.283 → 24.011

| t | Action |
|---|---|
| 21.283 | Near-black `#04090F`. Silence |
| 21.84 | `Accident Black Spot Detection` at 140 px, centred, no motion but a 0.3 s opacity fade |
| 22.93 | `Every warning has a human behind it.` at 64 px, `#B3BDCC` |
| 23.35 | **`→ github.com/shreyuu/accident-black-spot-detection`** at 56 px mono, `#7FB0F7` |
| 24.011 | End on a static, complete frame |

The URL is the one addition the current ending is missing. Last frame gets screenshotted; make it
carry something.

---

## 4. Exact recommendations

### 4.1 Thumbnail composition (also frame 0)

Canvas 1920×1080. Upload this as a **custom thumbnail** — do not let LinkedIn pick one.

```
┌──────────────────────────────────────────────────────────────────────┐
│  ACCIDENT BLACK SPOT DETECTION            LOCAL EMULATOR BUILD       │ ← 44px mono, 0.18em
│ ─────────────────────────────────────────────────────────────────── │   #8794A6 / rule #1B3B66
│                                                                      │
│   SHIPPED IN THE APP                                                 │ ← 48px, #7FB0F7, 0.2em
│   ────────                                                           │   36px rule under it
│                                                                      │
│   This app cannot                                                    │
│   summon emergency                       ·                           │ ← 168px/172lh, w800
│   services.                          (hotspot)                       │   -0.035em, #F6F8FB
│                                                                      │
│   ────────                                                           │ ← short rule, 120px
│   apps/mobile/src/constants/disclaimer.ts                            │ ← 56px mono, #8794A6
│                                                                      │
│ ─────────────────────────────────────────────────────────────────── │
└──────────────────────────────────────────────────────────────────────┘
```

Specifications:

- **Headline:** 168 px / 172 line-height, weight 800, `-0.035em`, three lines, `#F6F8FB`.
  Block spans x 150 → 1290, y 300 → 820. That is **59 % width × 48 % height** — inside your
  40–50 % target by area once the eyebrow and caption are counted. On a phone this renders at
  ~32 px: unmistakable at a glance, muted, mid-scroll.
- **Break the headline as three lines, not two.** `This app cannot / summon emergency / services.`
  Three short lines read faster at thumbnail scale and the lone word `services.` gives the block a
  deliberate, typeset silhouette.
- **Bind the file path to the headline.** Gap of 72 px, not 200. Short 120 px rule above it, not a
  full-width one. The path is the punchline; it must sit inside the same optical block.
- **The hotspot:** one marker at approximately (1520, 560) — optically level with the headline's
  second line, in the right third. Three concentric rings, `#F79B5C` at 3 px / 6 % / 3 % alpha,
  40 / 110 / 200 px radius, plus a 12 px solid core. **No label, no glow bloom.** This is the only
  saturated element on the frame and it must stay under ~1 % of the area.
- **Road network:** 5–7 long, near-straight strokes crossing the full frame at shallow angles,
  1.5 px, `#1B3B66` at 22 % — plus two gentle curves. They should pass *behind* the type block, not
  through the headline's x-height. Delete the current single lone arc; one curve reads as a
  mistake, a network reads as a map.
- **Coordinate ticks:** a column of four mono values at 40 px, `#8794A6` at 40 %, down the right
  margin at x≈1830. Real-looking lat/long from your seed data. Adds instrument-panel texture at
  near-zero visual cost.
- **Keep the top bar exactly as it is** — just at 44 px instead of 22. `LOCAL EMULATOR BUILD` in
  the top right is already the restrained system label you were asking for.
- **Do not add anything else.** The frame's power is the ratio of one sentence to a lot of navy.

### 4.2 Typography

| Role | Size @1920 | Weight | Tracking | Colour |
|---|---|---|---|---|
| Thumbnail headline | 168 / 172 | 800 | −0.035em | `#F6F8FB` |
| Scene headline | 128 / 138 | 800 | −0.035em | `#F6F8FB` |
| Scene line (body) | 72 / 92 | 700 | −0.02em | `#F6F8FB` |
| Data point (`200 m ahead`) | 104 | 800 | −0.03em | `#F6F8FB` |
| Sub-line / support | 56 / 74 | 400 | 0 | `#B3BDCC` |
| Eyebrow / section label | 48 | 700 | 0.2em, uppercase | `#7FB0F7` |
| Chips, node labels | 56 | 800 | 0.14em, uppercase | per risk colour |
| Mono — file paths, data | 56 | 400 | 0.08em | `#8794A6` |
| Top bar slug | 44 | 500 | 0.18em, uppercase | `#8794A6` |

**Four sizes per frame, maximum.** Two typefaces only: Inter (or your platform UI stack) and one
mono. Never centre body text — everything left-aligns to one of two vertical rails at x=150 and
x=1000. The end card is the single exception.

### 4.3 Spacing and grid

- 12-column grid, 150 px side margins, 48 px gutters.
- Two rails only: **x = 150** (primary) and **x = 1000** (secondary). Every text block starts on one.
- Safe area: keep all type inside 150 px from every edge — LinkedIn overlays controls on the
  bottom ~90 px and its own chrome on the top.
- Vertical rhythm in multiples of 24 px. Eyebrow → headline = 72 px. Headline → caption = 72 px.
  Block → block = 144 px.
- **Never fill more than 60 % of the frame.** The emptiness is the brand.

### 4.4 Transitions

| Between | Transition | Duration |
|---|---|---|
| 1 → 2 | Cross-dissolve | 0.25 s |
| 2 → 3 | Hard cut | 0 |
| 3 → 4 | Hard cut | 0 |
| 4 → 5 | **Match cut** — the `PENDING REVIEW` chip holds position and becomes a chain node | 0 |
| 5 → 6 | Hard cut | 0 |
| 6 → 7 | Dip to near-black via the existing 20.30 s scrim | 0.98 s |

No wipes, no slides, no push transitions, no light leaks, no glitch. The match cut at 13.642 is the
only "clever" move in the film and it earns itself because it is carrying the argument.

### 4.5 Animation

One easing curve for the whole film: **`power3.out`, 0.28 s** for entrances. One exception:
the stalled connector in beat 5 uses `power1.inOut` over 0.6 s and then simply stops.

- Entrances: opacity 0 → 1 with a 24 px upward translate. Nothing scales in from 0.
- **No bounce, no overshoot, no elastic, ever.** Overshoot reads as marketing.
- **No glow pulsing, no scale-breathing on text, no particles, no waveform.** The only looping
  motion in the film is the hotspot's opacity breath on the hook.
- Maximum two elements animating at once. If a third wants to move, it waits a beat.
- Exits: opacity to 0 over 0.2 s, no translate. Things leave quietly.
- Line draws (chain connectors, road reveals): `strokeDashoffset`, linear, 0.35 s.

### 4.6 Zooms and push-ins

Exactly **two** camera moves in 24 seconds:

1. **5.7 → 7.093 s** — 1.00 → 1.06 on the warning card region, `power1.out`, anchored at the card's
   centre. Barely perceptible; it exists to make the warning feel like it is arriving at *you*.
2. **19.36 → 20.31 s** — 1.00 → 1.04 on the emulator/rules artefact, linear. Signals "look closer."

Everything else is locked off. Static frames are what make this read as an instrument rather than a
promo. If you are tempted to add a third move, add a hold instead.

### 4.7 Map movement

- The map **never pans and never rotates.** The camera is a fixed overhead plate; only the data
  moves on it.
- Road network sits at 8 % opacity behind text scenes, 22 % when the map is the subject. Change it
  with a 0.6 s dissolve at scene boundaries, never mid-scene.
- Markers land as: radius ring scales 0.4 → 1.0 over 0.32 s `power3.out`, core dot and level chip
  fade in 0.1 s behind it. Staggered on the beat grid, never simultaneous.
- The user dot travels **in a straight line at constant speed** — no easing, no curve. It is
  telemetry, not a character.
- Warning radii: fill at 6 % alpha, stroke at 45 %, 3 px. They may overlap and the overlaps should
  be visible — overlapping risk zones are a true property of the data.

### 4.8 UI framing

- Screens appear as **flat surfaces on the navy**, never inside a phone bezel, never on a laptop,
  never at a 3D angle, never with a drop shadow. Device mockups are the fastest way to look like
  every other portfolio post.
- Card treatment, straight from your tokens: fill `#0B1F3A`, 1 px `#1B3B66` border, radius 14.
  Nested surfaces `#122C4F`. No gradient fills, no glass blur.
- Crop aggressively. Show the three rows of the form that matter, not the whole screen. A cropped
  UI fragment at 46 % frame width beats a complete screen at 30 %.
- One UI element is the subject per beat. Everything else drops to 40 % opacity.

### 4.9 Technical overlays

These are the credibility layer. Rules:

- Always **mono, 56 px, `#8794A6`**, always bottom-left of the block they annotate, always with a
  120 px `#1B3B66` rule above.
- One per scene, maximum. `apps/mobile/src/constants/disclaimer.ts` ·
  `apps/mobile/app/(tabs)/sos.tsx` · `firebase/firestore.rules` — plus the two new ones in beat 6.
- They enter 0.4 s **after** the line they support, never with it. The claim lands first, then the
  receipt.
- **Never overlay a path on top of UI or map.** It goes in empty space or it does not go in.
- In beat 6, code excerpts get a maximum of **two lines** at 56 px. A wall of unreadable code is
  decoration; two readable lines are evidence.

### 4.10 Ending frame

Static, centred, near-black `#04090F`:

```
                  Accident Black Spot Detection          ← 140px, w800, #F6F8FB
                Every warning has a human behind it.      ← 64px, #B3BDCC

           → github.com/shreyuu/accident-black-spot-detection   ← 56px mono, #7FB0F7
```

Silent. No logo animation, no fade-out to black — hold the completed frame to the last frame so a
paused video shows a finished card. The `→` before the URL closes the arrow motif that opened in
the caption.

---

## 5. Caption presentation — whitespace only

**Not one character changes.** The reflow in `linkedin-post-formatted.txt` was generated by only
(a) replacing an existing space with a newline and (b) inserting blank lines. Verified:

```
diff <(tr -d '[:space:]' < linkedin-post.txt) \
     <(tr -d '[:space:]' < linkedin-post-formatted.txt)
→ identical
```

2,759 → 2,761 characters (two added blank lines). Still 239 under the limit.

### What changed and why

| Location | Change | Effect |
|---|---|---|
| The three quotes | Blank line between each | Three separate exhibits instead of one grey block. Each quote gets its own silence |
| "Most side projects are a demo." | Line break after it | Isolates a five-word sentence into a hard statement |
| "…is three pieces:" | Line break at each comma | The three pieces become three lines — the architecture is now scannable |
| **The four `→` principles** | Line break after each bold lead | **The most important change.** Each principle's name becomes its own line; the body sits beneath it. They now read as four headed sections |
| "The whole system runs on…" | Two line breaks | Three short lines ending on "you can." — a clean, confident close |
| Stack line | **Unchanged** | Its density is the point. It should read as a spec sheet, not a list |
| Hook, URL, hashtags | **Unchanged** | Already correct |

### Rules to preserve when you paste

- **Never two blank lines in a row.** Some LinkedIn clients collapse them, others render them as
  spam-looking gaps; the result is inconsistent across devices.
- **Paste as plain text.** Rich-text paste from an editor can strip single newlines and collapse
  your four principles back into paragraphs. Paste into the composer directly from
  `linkedin-post-formatted.txt`.
- **Check the fold before posting.** The truncation should land inside `From the SOS screen:
  "Opens your dialler. This app neve…`. If it cuts earlier, LinkedIn has changed the limit.
- The URL is a bare domain. LinkedIn usually auto-links `github.com/...`, but with a video attached
  no preview card renders — so verify it is clickable in the published post, not the composer.

---

## 6. Visual design system

All colour values are your own tokens from `apps/mobile/src/theme/tokens.ts`. Nothing invented.

### Background
| Token | Value | Use |
|---|---|---|
| Base | `#060F1D` | Every scene |
| End card | `#04090F` | Beat 7 only |
| Surface | `#0B1F3A` | Cards, forms, nodes |
| Nested | `#122C4F` | Inputs, inner surfaces |
| Border | `#1B3B66` | 1 px borders, rules, road network |

Plus a fixed radial vignette: transparent centre → `#04090F` at 35 % at the corners. Static. It may
breathe ±3 % with the music RMS and nothing more.

### Typography hierarchy
Four tiers, per section 4.2: **display** (128–168) · **body** (72) · **support** (56) ·
**system** (44–48 mono/tracked). Never more than four sizes in one frame.

### Accent usage
| Colour | Meaning | Budget per frame |
|---|---|---|
| `#7FB0F7` blue300 | System / interactive / arrows / eyebrows | ≤ 4 % of area |
| `#F1888C` red300 | SOS and `critical` **only** | ≤ 2 %, outlined not filled |
| `#5FCB99` / `#F0B449` / `#F79B5C` / `#F1888C` | Risk ramp, low → critical | Chips and radii only |

**Hard rule, inherited from your own tokens file: a risk colour never appears without its word.**
Every chip carries `LOW` / `MEDIUM` / `HIGH` / `CRITICAL`. This is why the legend can be deleted —
the rule already makes it redundant. It is also the reason the video is accessible to a colour-blind
viewer, which is worth being able to say out loud if anyone asks.

### Line style
- Structural rules: 1 px `#1B3B66`
- Emphasis rules (under eyebrows): 3 px `#7FB0F7`, 120 px long
- Arrows / connectors: 3 px, `#7FB0F7`, square cap, 12 px arrowhead
- Pending connectors: 3 px dashed, 12/8 dash array, `#8794A6`
- Never a curve on a connector. Orthogonal or straight diagonal only — this is a diagram, not a flow chart in a pitch deck.

### Map style
- Roads: 1.5 px `#1B3B66`, 8 % ambient / 22 % active, shallow angles, 5–7 strokes plus 2 curves
- No labels, no place names, no terrain fill, no satellite imagery, no Google Maps chrome
- Warning radii: 6 % fill, 45 % stroke at 3 px, in the risk colour
- Coordinate ticks: 40 px mono, `#8794A6` at 40 %, right margin only
- Grid: optional 1 px `#1B3B66` at 6 %, 120 px pitch. If you use it, use it in every scene

### Animation style
One curve (`power3.out`), one duration (0.28 s), 24 px translate, two concurrent elements maximum,
no overshoot, no loops except the hook hotspot. Detail in 4.5.

### UI framing
Flat on navy. No bezels, no shadows, no perspective, no glass. Crop to the rows that matter.
One subject per beat; everything else at 40 %.

### Engineering diagram aesthetic
Nodes are `#0B1F3A` pills with 1 px `#1B3B66` borders and 56 px uppercase labels. Connectors are
`→` strokes. State is carried by **border colour and the label**, never by fill alone. A node
completes by its border going solid and its label reaching full opacity — no flash, no pulse.
Read it as a CI pipeline diagram, not an infographic.

---

## 7. Shot list

Editor-agnostic. Every timecode is beat-locked at 109.96 BPM.
**If you are working in the existing HyperFrames composition** (`composition/index.html`), these map
onto the existing `data-start` / `data-duration` clips — beats 5 and 6 are the only genuinely new
scenes; the rest are re-typesetting and re-timing of clips that already exist.

| # | In | Out | Shot | Contents | Motion |
|---|---|---|---|---|---|
| 01 | 0.000 | 2.728 | Hook, locked | Headline 168px (3 lines) · eyebrow · file path · hotspot · road net | None. Hotspot opacity 0.5→0.85→0.5 over 2.4 s |
| 02 | 2.728 | 5.457 | Map builds | Road net to 22 % · 4 markers at 3.274 / 3.820 / 4.366 / 4.911 · left rail line | Marker rings scale 0.4→1.0, 0.32 s each |
| 03 | 5.457 | 7.093 | Warning lands | `HIGH` spot + user dot + `→` vector + warning card | Card 0.96→1.00 / 0.28 s; region push 1.00→1.06 |
| 04 | 7.093 | 10.368 | SOS | Outlined ring · line 72px · dialler glyph + `→` · sos.tsx path | Ring fade 0.3 s, then locked |
| 05 | 10.368 | 12.005 | Report form | Form at 46 % width · labels 56 / values 64 · cursor travel | Cursor ease 0.5 s |
| 06 | 12.005 | 13.642 | Submit → pending | Press 0.16 s · fields to 40 % · row + `PENDING REVIEW` at 64px | Contrast swap: chip up, button down |
| 07 | 13.642 | 14.700 | Chain opens | Match cut on chip · `REPORT` → `PENDING` draw | strokeDashoffset, 0.35 s |
| 08 | 14.700 | 15.800 | **The stall** | Connector dashed at 40 %, gap open | **Nothing moves. 1.1 s** |
| 09 | 15.800 | 17.462 | Human closes it | `HUMAN REVIEW` above the line · connector completes · `APPROVED` · rules path · right-rail line | Fade 0.3 s, draw 0.35 s, node 0.28 s |
| 10 | 17.462 | 18.410 | Published | Approved warning back on the map | Wipe in 0.2 s |
| 11 | 18.410 | 19.360 | Verify gate | `npm run verify` six steps, 56px mono, checks | Wipe 0.2 s, steps stagger 0.08 s |
| 12 | 19.360 | 20.310 | Emulator + rules | Port table · 2-line rules excerpt | Wipe 0.2 s; push 1.00→1.04 |
| 13 | 20.310 | 21.283 | DBSCAN | Scatter resolving to one cluster · `eps 150 m · min_samples 3` | Points converge 0.6 s; scrim in from 20.30 |
| 14 | 21.283 | 24.011 | End card | Name 140 · tagline 64 · `→` URL 56 mono | Opacity only: 21.84 / 22.93 / 23.35 |

**Audio map:** bed at 0.22 throughout, ducked to 0.10 under beat 1 · accent on the card at 5.457 ·
one tap on the press at 12.005 · **silence 14.700 → 16.350 (the stall)** · single hit on `APPROVED`
at 16.350 · fade to zero 20.6 → 21.8 · last 2.2 s silent. Three strong cues total: **5.457, 16.350,
22.930.** No sirens, no alarms, no alert buzzers — an alert-like cue on a real safety product risks
reading as a genuine alert.

---

## 8. What to keep, shorten, move, enlarge, highlight, de-emphasise

### Keep exactly as-is
- The navy palette and every token value — they come from the app, which is the whole argument
- The top bar: `ACCIDENT BLACK SPOT DETECTION` / `LOCAL EMULATOR BUILD` (enlarge to 44 px, change nothing else)
- The deadpan holds and the refusal-as-hook concept
- The verbatim disclaimer script — never paraphrase these strings
- The warning card's structure and copy
- The outro tagline `Every warning has a human behind it.`
- The scene boundaries at **17.462** and **21.283** — already beat-locked, do not move
- The 20.30 s scrim and the silent final beat

### Enlarge (highest-priority change in the whole document)
- **Everything currently under 56 px.** Top bar 22→44 · file paths 22→56 · warning sub-line 36→56 ·
  footnote 24→44 · form labels 28→56 · form values 34→64 · `PENDING REVIEW` 24→64 · marker chips 21→56
- Hook headline **96 → 168 px**
- Scene body lines **58–62 → 72 px**
- Outro name **92 → 140 px** · tagline **44 → 64 px**
- Report form **~30 % → ~46 %** of frame width

### Shorten
- Beat 2's marker build: five sequential landings is one too many. Four markers, then the fifth
  arrives *with* the warning card — the build and the payoff merge and you save ~0.5 s
- The map-only hold before the card arrives
- Beat 4's form read: the press can come earlier now that the type is legible at a glance

### Move
- **The file path in the hook: up.** From the bottom of the frame to 72 px under the headline. It is
  the punchline of the hook, not a footer
- **The hotspot: onto the hook frame.** It does not currently exist there and it is what makes the
  thumbnail legible as road-safety software
- **`An algorithm never publishes a warning on its own.`** from beat 4 to beat 5, so it lands
  *with* the chain rather than over the form
- The repo URL: onto the end card, where it currently does not appear at all

### Visually highlight
- **The stall at 14.700–15.800.** The single most important 1.1 seconds in the film
- `PENDING REVIEW` — must become the brightest element in its frame
- The four evidence artefacts in beat 6 — currently absent entirely
- The `→` connectors: same colour, same weight, everywhere, so the motif is legible as a system

### Remove or de-emphasise
- **Delete the risk legend.** Redundant with the chips, illegible, four lines of clutter
- **De-fill the SOS disc** → outlined ring. It is currently the brightest object in the film and it
  is the one element that risks over-claiming
- **Replace the lone arc** with a proper 5–7 stroke road network. In its current form it slices
  through the word *publishes* in beat 5
- **De-emphasise `Submit report`** once pressed — it must lose to the pending chip
- Drop the full-width rule above the hook's file path → 120 px short rule
- The empty left rail during the warning card — either fill it or recompose the card toward centre

---

## 9. Making the first two seconds work on muted autoplay

LinkedIn autoplays muted, in-feed, at ~360–400 px on a phone, while the frame is still moving up the
screen. You have roughly **0.8 seconds of genuine attention.** Nine rules:

1. **Frame 0 is the finished frame.** No fade-in on the headline. Your current frame 0 is at ~40 %
   opacity — the strongest asset in the post is being shown mid-dissolve. Single highest-leverage
   fix in this document, and it costs one deleted keyframe.
2. **Upload the poster JPG as a custom thumbnail.** Never let LinkedIn auto-select. The poster and
   frame 0 should be the same image so there is no flicker when playback starts.
3. **168 px headline.** At mobile scale that is ~32 px of on-screen type — readable at arm's length,
   in sunlight, at speed. 96 px gives you ~18 px and loses.
4. **Three short lines, not two long ones.** `This app cannot / summon emergency / services.` reads
   in one saccade; a two-line block at this length forces a scan.
5. **The word `cannot` is the whole hook.** It sits at the end of line one, where the eye stops.
   Do not let the line break fall anywhere else. Everything in the post hangs on a reader
   registering that a developer is advertising a limitation.
6. **Lead with the sentence, not the brand.** No logo animation, no intro card, no title reveal.
   The eyebrow and top bar are 44–48 px and stay quiet.
7. **One moving thing, and make it small.** The hotspot's slow opacity breath. Motion catches the
   eye in a feed of static images, but a *whole frame* animating reads as an ad — a single
   200 px-wide element breathing reads as an instrument that is on.
8. **Burn-in captions from 0.0 s.** Muted autoplay means your first line must be visible text, which
   it already is. If you add any voiceover later, caption it from frame one.
9. **Contrast, not colour.** `#F6F8FB` on `#060F1D` is ~17:1. That survives a bright phone screen
   outdoors, which is where a good share of these views happen.

**The test:** shrink frame 0 to 400 px wide, look at it for one second, look away. If you cannot say
what the app refuses to do, the frame has failed. Your current frame fails this; the redesigned one
should pass.

---

## 10. Final recommended post layout

```
┌─────────────────────────────────────────────┐
│  Shreyash Meshram                           │
│  ▸ Post to Anyone   ▸ Comments: Anyone      │
├─────────────────────────────────────────────┤
│                                             │
│  [ caption — linkedin-post-formatted.txt ]  │
│                                             │
│   ▸ hook (2 lines, fold at ~210 chars)      │
│   ▸ three quoted refusals, one stanza each  │
│   ▸ the thesis paragraph                    │
│   ▸ the three pieces, on three lines        │
│   ▸ "What I'd actually want to be asked"    │
│   ▸ four → principles, each headed          │
│   ▸ stack (dense, one block)                │
│   ▸ emulator / run-it-yourself, three lines │
│   ▸ repo URL                                │
│   ▸ seven hashtags                          │
│                                             │
├─────────────────────────────────────────────┤
│                                             │
│   ┌───────────────────────────────────┐     │
│   │ ACCIDENT BLACK SPOT DETECTION     │     │
│   │                   LOCAL EMULATOR  │     │
│   │  SHIPPED IN THE APP               │     │
│   │  ────────                         │     │
│   │  This app cannot                  │     │
│   │  summon emergency        ·        │     │
│   │  services.                        │     │
│   │  ────────                         │     │
│   │  apps/mobile/src/constants/…      │     │
│   └───────────────────────────────────┘     │
│        custom thumbnail = frame 0           │
│                                             │
└─────────────────────────────────────────────┘
```

### Posting checklist

1. Paste `linkedin-post-formatted.txt` as **plain text**. Verify the four `→` principles kept their
   line breaks in the preview — this is the thing most likely to break.
2. Attach the re-rendered 1920×1080 MP4.
3. **Upload the poster JPG as a custom thumbnail.** Do not accept the auto-selected frame.
4. Check the `see more` fold lands inside the SOS quote.
5. Confirm `github.com/shreyuu/accident-black-spot-detection` rendered as a link.
6. Preview on mobile before posting — that is where the type either works or does not.
7. Post, then add nothing in the comments for the first hour. The post's argument is that it does
   not over-claim; a "check out my repo!!" follow-up comment undercuts it.

### What to expect if this works

The post should not read as *"I built an app."* Every element above is tuned so that a senior
engineer scrolling past registers, in order: a developer advertising a limitation → a real source
constant → a human gate in a publication pipeline → tests and an emulator → a documented list of
things the project cannot do.

That is a hiring signal. "I built an app" is not.

# Hyperframes Composition Brief: Accident Black Spot Detection

## Objective
Create a short launch-style brag video for **Accident Black Spot Detection** — a road-safety app
whose defining characteristic is that it refuses to overclaim. The video's script is the app's own
disclaimer strings, quoted verbatim.

## Output
- Composition directory: `video-app-walkthrough/composition/`
- Rendered video: `video-app-walkthrough/app-walkthrough-landscape.mp4`
- Format: landscape — 1920x1080
- Duration: 24.0s (6 scenes)

## Source Material
- Project root: `/Users/shreyu/VSCODE/Projects/accident-black-spot-detection`
- Primary files read:
  - `README.md` — product description and constraints
  - `apps/mobile/src/theme/tokens.ts` — the full palette, verbatim
  - `apps/mobile/src/constants/disclaimer.ts` — the script
  - `apps/mobile/app/(tabs)/{map,report,sos}.tsx` — real screen copy and a11y hints
  - `packages/shared-types/src/vocabulary.ts` — report types and severity levels
  - `firebase/firestore.rules` — the no-client-publishes-a-warning constraint
- Product name: **Accident Black Spot Detection**
- Tagline / strongest claim: *Every warning has a human behind it.*
- Key UI moment to recreate: **the dark map with black-spot markers and their translucent warning
  radii**, then the **`HIGH RISK · 200 m ahead` proximity card** arriving over it.
- Copy that must appear verbatim (these are real strings in the repo — do not paraphrase):
  - `This app cannot summon emergency services.`
  - `It warns you before you get there.` *(scene line, plain)*
  - `Distances shown are approximate.`
  - `An algorithm never publishes a warning on its own.`
  - `Opens your dialler. This app never places a call by itself.`
  - `Pending review` *(status chip — real `pending` status from the vocabulary)*
- Real vocabulary that must be used correctly:
  - Report types are `accident` · `crime` · `pothole` · `other` — **not** invented ones
  - Severity/risk levels are `low` · `medium` · `high` · `critical`
  - Report statuses are `draft` · `pending` · `approved` · `rejected`

## Creative Direction
- **Tone preset:** `deadpan`
- **Creative direction:** a road-safety product that brags by reading out its own disclaimers
- **Interpretation:** Long holds, large type, generous empty navy. Nothing winks at the camera.
  Entrances are quick (0.3–0.5s) and then everything *stops* — the stillness is the style. Five
  scenes rather than deadpan's usual three-to-four, because the user flow needs its three beats.
- **Angle:** Every safety app brags about what it will do for you; this one ships a list of what it
  won't. The script is not marketing copy — it is the app's disclaimer constants and accessibility
  hints, quoted exactly. The joke and the flex are the same thing: radical honesty as an engineering
  discipline. No other project's video can use this script.
- **Hook:** Navy void. `This app cannot summon emergency services.` lands and sits. A monospace
  caption fades in under it: `src/constants/disclaimer.ts`. The viewer realises this is a source
  constant, not an ad.
- **Outro / punchline:** Near-black, near-silence, a real empty beat, then the name lands quietly:
  **Accident Black Spot Detection** · *Every warning has a human behind it.*
- **Avoid:**
  - Generic SaaS language
  - Abstract filler visuals
  - Unrelated visual redesign
  - **Any dramatisation of a crash**, and any siren/alarm/alert-buzzer motif, visual or audible.
    This is a real safety product; an alarm-like cue risks reading as a genuine alert.
  - Risk colour used as the *only* carrier of meaning — the app's own tokens file forbids it, so
    every risk colour in this video appears with its word beside it.

## Visual Identity
Exact values from `apps/mobile/src/theme/tokens.ts`, dark theme (the app's night-driving face).

- Background: `#060F1D` (navy900)
- Surface: `#0B1F3A` (navy800) · nested surface `#122C4F` (navy700) · border `#1B3B66` (navy600)
- Text: `#F6F8FB` (grey50) · muted `#B3BDCC` (grey300) · subtle `#8794A6` (grey400)
- Accent: `#7FB0F7` (blue300 — the dark theme's primary)
- Danger / SOS: `#F1888C` (red300)
- Risk ramp: `#5FCB99` low · `#F0B449` medium · `#F79B5C` high · `#F1888C` critical
- Display font: Inter (app uses platform system UI fonts; Inter is the closest neutral match)
- Body font: Inter · **monospace** (courier-adjacent) for source-file captions and data points
- Radii from the app: `sm 6` · `md 10` · `lg 14` · `xl 20` · `pill 999`
- Visual references from the project:
  - Dark map surface with concentric translucent warning radii in risk colours
  - The proximity warning card: navy800 surface, 3px border all round, risk level carried by a pill
    (the app's real RiskBadge pattern — a left-edge accent stripe was rejected as an AI design tell)
  - Risk chips: pill, risk colour, with the level word always present
  - The SOS control: large, `#F1888C`, unmistakably a button that does one modest thing

## Storyboard
Use the storyboard in `video-app-walkthrough/brag-plan.md` as the creative contract.

Scene summary:
1. **The refusal** — 3.80s (0.00→3.80) — `This app cannot summon emergency services.` holds dead
   centre on empty navy; mono caption `src/constants/disclaimer.ts` fades in beneath. No SFX.
2. **The map builds** — 4.94s (3.80→8.74) — five black-spot markers drop in one by one with
   expanding warning radii and their level words; overlay line `It warns you before you get there.`
3. **The warning arrives** — 4.37s (8.74→13.11) — user dot approaches the `high` spot; the card
   `HIGH RISK · 200 m ahead` lands on the strong cue, with `Junction with 4 recorded incidents.`
   and the footnote `Distances shown are approximate.`
4. **It does not publish itself** — 4.36s (13.11→17.47) — report form (`Accident`, severity `high`),
   a cursor presses **Submit report**, the row settles with a `Pending review` chip instead of
   publishing. Line: `An algorithm never publishes a warning on its own.` Mono credit:
   `firebase/firestore.rules`.
5. **The dialler** — 3.81s (17.47→21.28) — SOS screen; the button's real a11y hint
   `Opens your dialler. This app never places a call by itself.` gets the longest hold in the video.
6. **The name** — 2.74s (21.28→24.02) — scrim to near-black from 20.35s, the music gone, then the
   name on a beat at 21.84s and the tagline on the strongest cue at 22.93s.

## Audio
- **Audio role:** sparse professional accents over a low, restrained bed — sound supports the holds, never fills them
- **Audio arc:** ducked under the hook → steady bed as the map assembles → one weighted arrival on
  the warning → one precise tap on submit → withdraws entirely, so the product name lands in silence
- **Music:** `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (109.96 BPM — the slowest
  bundled track, and the only one that does not fight a deadpan read)
- **Music treatment:** start 0.0s, low bed (~0.22), ducked further under scene 1, hard fade to zero
  across 20.6→21.8s. The final second is silent.
- **Music cue guidance:** bundled preset at
  `~/.claude/plugins/cache/brag/brag/0.2.2/skills/brag/assets/music/cues/happy-beats-business-moves-vol-12-by-ende-dot-app.music-cues.{md,json}`.
  Strong cues locked: **8.74s** (warning card lands), **13.11s** (scene-4 entrance), **17.47s** (SOS
  screen), **22.93s** (tagline). The submit press sits on the beat grid at 14.73s and the
  `Pending review` chip at 15.29s, so the form has time to read before the press. Beat grid for scene 2's sequential markers:
  **4.39 / 5.34 / 6.00 / 6.56 / 7.09**. Lock no more than 3 strong cues.
- **Audio-reactive treatment:** none-to-minimal. Deadpan wants stillness. At most, background
  vignette depth breathing gently with RMS. **No** glow pulsing, text scaling, waveforms or
  equalizer graphics. If extraction is unavailable, skip it and note that — do not block the render.
- **Audio-coupled moments:**
  - Scene 2, five markers landing — sequential card/drop-style placement, snapped to the beat grid
  - Scene 3, warning card arrival — one soft medium impact, beat-locked to 8.74s
  - Scene 4, Submit press — one precise click; one soft settle as the `Pending review` chip lands
  - Scene 5, product name — silence is preferred; at most one very soft low placement
- **SFX selection guidance:** soft UI family only. `interface/drop_00*` and `interface/click_00*`
  are the right register; `impact/impactSoft_medium_*` is the safest choice for the one card
  arrival. Vary the five marker sounds so they do not sound mechanical. **Forbidden:** anything from
  `error_*`, `impactPunch_*`, `glitch_*`, or any siren/alarm-like cue — see *Avoid* above.
- **SFX analysis guidance:**
  `~/.claude/plugins/cache/brag/brag/0.2.2/skills/brag/assets/sfx/sfx-analysis.md`. Prefer low
  high-frequency-risk files; scene 2 repeats a sound five times, so it must be a low-HF-risk pick.
- **Exact SFX choice:** Hyperframes chooses filenames, timestamps, density and volume after the
  visual animation exists.
- **Audio files:** copy the chosen music and SFX into `video-app-walkthrough/composition/assets/`.

## Hyperframes Instructions
Load the composition-building Hyperframes domain skills — `hyperframes-core` (composition contract +
`data-*` timing), `hyperframes-animation` (motion), `hyperframes-creative` (design spec, beats,
audio-reactive), `hyperframes-keyframes` (seek-safe keyframes), and `hyperframes-cli` (lint/check/
render). /brag is its own workflow: do not enter the `hyperframes` entry-point intent interview and
do not route into its generic promo / launch-video workflow. Prefer native Hyperframes conventions
over anything in `/brag`.

Requirements:
- Show at least one real UI, copy, or visual element from the source project. (Scenes 2–5 all do.)
- Keep all text readable: short label ≥0.8s settled; a sentence ≥0.3s per word. The hook line and
  the SOS line get the longest holds. Entrances stay fast — fast-in, then hold.
- Keep the video within 15–25 seconds.
- Include the planned music/SFX layer.
- Treat `/brag` audio notes as guidance, not a fixed cue sheet. Choose SFX after the animation exists.
- Treat music cue metadata as optional timing hints; ignore any cue that hurts readability or pacing.
- Major reveals may move within ±0.15s of a strong cue; smaller entrances within ±0.10s of a beat.
  Use 1–3 strong-cue locks, marked `// beat-locked`. Mark the scene-2 sequence `// beat-grid`.
- Use local assets for audio and any runtime/media dependencies.
- Run `hyperframes check` before render — it is brag's single gate.

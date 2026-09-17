# Brag Plan: Accident Black Spot Detection — vertical cut

> **This is a reformat, not a new concept.** The angle, script, tone, timings, music, cue locks and
> SFX sheet are all inherited verbatim from `video-app-walkthrough/brag-plan.md`. Only the composition changes.
> Read that plan for the creative reasoning; this file records what portrait changed and why.

## What is this app?
A road-safety app that warns you about accident black spots, whose defining feature is the list of
things it refuses to claim.

## The angle
Unchanged: every safety app brags about what it will do for you; this one ships a list of what it
won't, and the script is its own disclaimer constants quoted verbatim.

## Hook (first 2-3 seconds)
Unchanged: **"This app cannot summon emergency services."** with the mono credit
`src/constants/disclaimer.ts` beneath it.

## Outro / punchline
Unchanged: near-black, an empty beat, then **Accident Black Spot Detection** ·
*Every warning has a human behind it.*

## Tone
- Preset: `deadpan`
- Creative direction: a road-safety product that brags by reading out its own disclaimers
- Interpretation: unchanged. Portrait actually helps the deadpan read — the taller frame leaves more
  empty navy around each line.

## Format: vertical — 1080x1920
## Duration: 24.0s (6 scenes, identical timings to the landscape cut)

## What portrait changed

This is a **relayout, not a crop**. Nothing is cut off and no text got smaller relative to the frame.

| Scene | Landscape | Vertical |
| --- | --- | --- |
| 1 | Headline left-anchored across 1320px | Headline across the full 920px column, 3 lines, credit pushed to y1184 for clearance |
| 2–3 | Map right, text panel **left** | Map **top** (y150–1180), text panel **bottom** — the panel now rises from the bottom edge instead of sliding in from the left |
| 2 | Risk legend stacked vertically | Risk legend as a single horizontal row of four chips |
| 3 | Warning card floating over the map | Warning card fills the bottom panel, full column width |
| 4 | Form left, statement right | Statement on top, form below it, result row beneath — a vertical read |
| 5 | SOS circle left, line right | SOS circle centred in the upper half, line below it |
| 6 | Unchanged shape, retuned type sizes | Same |

Marker coordinates, ring radii and the user dot's travel path were all recomputed for the
1080×1030 map viewport. The dot still ends beside the `high` spot the warning refers to.

Scene 4's lower third is deliberately left empty: on Reels, TikTok and Stories that band is covered
by platform chrome (caption, handle, buttons), so nothing that must be read lives there.

## Visual identity
Identical to the landscape cut — same tokens from `apps/mobile/src/theme/tokens.ts`, so all three
videos read as one product. Type sizes were scaled for the narrower column (headline 104→80px,
scene lines 60→54px); nothing dropped below the video-legibility floor.

## Share copy
Unchanged — shares `share-copy.txt` with the landscape cut.

## Audio direction
**Byte-identical cue sheet to the landscape cut**, deliberately: same track
(`happy-beats-business-moves-vol-12`), same bed automation (0.10 ducked → 0.22 → hard fade from
20.4s), same five marker placements on the beat grid, same beat-locked impact at 8.74s, same click
at 14.73s and chip at 15.29s, same silent ending. Measured output matches the landscape cut at
−30.9 dB mean / −5.5 dB peak.

- Restraint rule: unchanged — no sirens, alarms or crash impacts, and no sound on the SOS button.

## Storyboard
Scene boundaries are identical to `video-app-walkthrough/brag-plan.md`; only staging differs.

1. **The refusal** — 3.80s (0.00→3.80)
2. **The map builds** — 4.94s (3.80→8.74) — five markers on the beat grid
3. **The warning arrives** — 4.37s (8.74→13.11) — card beat-locked to 8.74s
4. **It does not publish itself** — 4.36s (13.11→17.47) — submit at 14.73s, chip at 15.29s
5. **The dialler** — 3.81s (17.47→21.28)
6. **The name** — 2.74s (21.28→24.02) — tagline beat-locked to 22.93s

**Music mood:** deadpan. **Audio summary:** unchanged from the landscape cut.

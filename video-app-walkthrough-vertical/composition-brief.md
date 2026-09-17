# Hyperframes Composition Brief: Accident Black Spot Detection — vertical cut

## Objective
Reformat the landscape brag video (`video-app-walkthrough/`) to 1080x1920 for Reels / TikTok / Stories.
**A relayout, not a crop.** Same angle, script, timings, music and cue locks.

## Output
- Composition directory: `video-app-walkthrough-vertical/composition/`
- Rendered video: `video-app-walkthrough-vertical/app-walkthrough-vertical.mp4`
- Format: vertical — 1080x1920
- Duration: 24.0s (6 scenes)

## Source Material
Identical to `video-app-walkthrough/composition-brief.md`. Every verbatim string carries over unchanged:
- `This app cannot summon emergency services.`
- `It warns you before you get there.`
- `Distances shown are approximate.`
- `An algorithm never publishes a warning on its own.`
- `Opens your dialler. This app never places a call by itself.`
- `Pending review` · report type `Accident` · severity `HIGH`

File-path credits were shortened to fit the narrower column
(`apps/mobile/src/constants/disclaimer.ts` → `src/constants/disclaimer.ts`,
`apps/mobile/app/(tabs)/sos.tsx` → `app/(tabs)/sos.tsx`). The paths still resolve unambiguously
within the repo.

## Creative Direction
Unchanged from the landscape brief: `deadpan` preset, disclaimers-as-script angle, same hook and
outro, same Avoid list (no crash dramatisation, no siren motif, no risk colour without its word).

## Visual Identity
Identical palette and tokens. Type rescaled for a 920px content column:
headline 104→80px, scene lines 60→54px, body 36→34px, mono credits 24→24px. All remain above the
video-legibility floor.

## Storyboard
Scene boundaries identical to the landscape cut; staging is restacked vertically. See
`brag-plan.md` → "What portrait changed" for the per-scene mapping.

## Audio
Identical cue sheet, deliberately — same track, same bed automation, same beat-grid marker
placements, same beat-locked impact at 8.74s, same silent ending. Assets were copied from the
landscape composition rather than re-selected, and `audio-data.js` is reused unchanged so the
audio-reactive background behaves identically.

## Hyperframes Instructions
Same as the landscape brief. Additionally:
- Portrait pushes text into narrower columns, so **leave clearance for one extra wrapped line** on
  every headline block — the landscape cut shipped a collision caused by exactly this.
- **Verify text layout from the rendered MP4, not from `snapshot`** — the render worker resolves
  `system-ui` to a wider face than the snapshot browser.
- Keep the bottom ~15% of the frame free of must-read text; platform chrome covers it.
- Run `hyperframes check` before render.

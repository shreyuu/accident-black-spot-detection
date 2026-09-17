# Brag Plan: Accident Black Spot Detection

## What is this app?

A React Native road-safety app that warns you as you approach an accident-prone black spot, lets you
report incidents for human moderation, and gives you an SOS screen — backed by a Next.js moderation
dashboard and a Python DBSCAN/ECLAT service that only ever *proposes* hazards for a human to approve.
What makes it remarkable is not what it promises. It is what it refuses to promise, in writing, in
the source.

## The angle

**Every safety app brags about what it will do for you. This one ships a list of what it won't.**

The script is not marketing copy — it is the app's own disclaimer constants and accessibility hints,
quoted verbatim. `"Opens your dialler. This app never places a call by itself."` is a real string in
`apps/mobile/app/(tabs)/sos.tsx`. `"An algorithm never publishes a warning on its own"` is a real
constraint enforced in security rules and tested. The video's joke, and its flex, are the same
thing: radical honesty as an engineering discipline.

This is impossible to make generic. No other project's brag video can use this script.

## Hook (first 2-3 seconds)

Navy black. One line, full-width, arrives fast and then sits there:

> **This app cannot summon emergency services.**

Then a small monospace credit fades in underneath: `src/constants/disclaimer.ts`

That caption is the whole hook. The viewer realises they are not reading an ad — they are reading a
constant in the codebase. A safety app opening with its own limitation earns the next twenty seconds.

## Key moments (the middle)

- **The map builds itself.** Black spots drop onto a dark map one by one, each with its warning
  radius, coloured by the real risk ramp (green → amber → orange → red).
- **The warning arrives before you do.** A risk card slams in: `HIGH RISK · 200 m ahead`. This is the
  product's entire reason to exist, shown rather than described.
- **The report does not become a warning.** Submit lands, and the row gets a `Pending review` chip
  instead of publishing. Line: *"An algorithm never publishes a warning on its own."*
- **The SOS button that refuses to be a hero.** The screen's own accessibility hint is the punchline.

## Outro / punchline

Cut to near-black and near-silence. Beat. Then the name lands on the track's strongest cue:

> **Accident Black Spot Detection**
> *Every warning has a human behind it.*

## User flow worth showing

Three beats, all from the working app, not the README:

1. **Entry** — open the map; black spots and their warning radii load around you.
2. **Key action** — you travel toward one; the proximity warning fires with risk level and distance.
3. **Result** — you report what you saw; it goes to a human moderator, not straight to the map.

The SOS screen is the fourth beat and carries the closing line.

## Tone

- **Preset:** `deadpan`
- **Creative direction:** a road-safety product that brags by reading out its own disclaimers
- **Interpretation:** Long holds, large type, generous empty navy. Nothing winks at the camera. The
  restraint is not a stylistic choice imposed on the project — it *is* the project's voice, lifted
  straight from its source. Five scenes instead of deadpan's usual three-to-four, because the user
  flow needs its three beats and each line has a real reading floor.

## Format: landscape — 1920x1080
## Duration: 24.0s (6 scenes)

## Visual identity (from the project)

Taken from `apps/mobile/src/theme/tokens.ts` (dark theme — the app's night-driving face).

- Background: `#060F1D` (navy900 — chosen in-source to evoke road signage at night without being pure black)
- Surface / cards: `#0B1F3A` (navy800), nested `#122C4F` (navy700)
- Accent: `#7FB0F7` (blue300 — the dark theme's primary)
- Text: `#F6F8FB` (grey50), muted `#B3BDCC` (grey300)
- Danger / SOS: `#F1888C` (red300)
- Risk ramp: `#5FCB99` low · `#F0B449` medium · `#F79B5C` high · `#F1888C` critical
- Display font: Inter (the app uses platform system UI fonts; Inter is the closest neutral match)
- Body font: Inter · **monospace for source-file captions and data points** (courier-adjacent)
- Strongest visual element: the dark map with concentric warning radii in the risk ramp — the one
  image that is unmistakably this product

**Design note, non-negotiable:** the risk ramp must never be the only carrier of meaning. The app's
own tokens file states this rule and ships text labels beside every colour. The video follows it —
every risk colour appears with its word.

## Share copy (draft)

Most safety apps tell you what they'll do for you. Mine ships with a list of what it won't.

## Audio direction

- **Role:** sparse professional accents over a low, restrained bed — sound supports the holds, never fills them
- **Music:** `happy-beats-business-moves-vol-12-by-ende-dot-app.mp3` (109.96 BPM — the slowest bundled track, the only one that does not fight a deadpan read)
- **Music treatment:** start at 0.0s, ducked to 0.10 under the hook, up to 0.22 as the map builds,
  hard fade to zero across 20.4→21.6s. The final 2.4s of the render measure −91 dB — true silence.
- **Music cue guidance:** preset read from `cues/happy-beats-business-moves-vol-12…music-cues.md`.
  Target strong cues: **8.74s** (warning card slams in), **13.11s** (report submit), **17.47s** (SOS
  screen), **22.93s** (product name). Sequential black-spot drops in Scene 2 use the beat grid at
  **4.39 / 5.34 / 6.00 / 6.56 / 7.09** — these are marks and radii, not text, so beat spacing is safe.
  Restraint note: cues are permission to land cleanly, not a reason to add motion. Skip any cue that
  would shorten a read.
- **Audio-reactive treatment:** none-to-minimal. Deadpan wants stillness. At most, background vignette
  depth breathing with RMS. No glow pulsing, no scaling text, no waveform or equalizer visuals.
- **SFX posture:** sparse — roughly five cues in the whole video, motion-matched, all soft
- **Audio-coupled moments:** black spots landing one by one; the warning card's single arrival; the
  submit tap; the `Pending review` chip settling
- **Restraint rule:** **No sirens, no alarm tones, no alert buzzers, no collision or crash impacts,
  and no tyre/brake sounds.** This is a real road-safety product — an alarm-like cue risks reading as
  an actual alert, and dramatising a crash would betray the tone the whole project is built on. Soft
  UI sounds only. Nothing in the `error_*` or `impactPunch_*` families.

## Storyboard

### Scene 1 — The refusal — 3.8s (0.00 → 3.80)
Full navy `#060F1D`, empty. The line arrives fast (~0.4s) and then holds, dead centre, large display
weight in `#F6F8FB`: **"This app cannot summon emergency services."** Settles for ~2.4s. At ~2.0s a
small monospace caption fades in below in `#B3BDCC`: `src/constants/disclaimer.ts`. Nothing moves
after that. The stillness is the point.
Sequential/interaction: none — one line, one caption, deliberate emptiness.
Audio intent: music barely present, ducked. The quiet makes the viewer read.
Audio-coupled idea: none. No SFX on the hook — a sound here would undercut it.
Music: low bed from 0.0s, ducked under the line.
Transition mood: slow crossfade → Scene 2

### Scene 2 — The map builds — 4.94s (3.80 → 8.74)
Recreate the map screen. Dark navy map surface, subtle road geometry, the user's position dot in
`#7FB0F7` with a soft accuracy ring. Five black spots drop in **one by one**, each a filled marker
with a translucent warning radius in its risk colour, each carrying its text label — `Low`, `Medium`,
`High`, `High`, `Critical` — because colour alone is never enough in this app. A quiet overlay line
sits top-left through the scene: **"It warns you before you get there."** (holds ~2.4s settled).
Sequential/interaction: **yes** — five markers arrive one by one on the beat grid (4.39 / 5.34 / 6.00
/ 6.56 / 7.09). These are marks, not text, so beat spacing is safe. Radii expand as each lands.
Audio intent: the map assembling itself — competent, unhurried, slightly clinical.
Audio-coupled idea: a soft drop/placement sound per marker, low and dry, varied so five in a row do
not sound mechanical.
Music: bed lifts slightly to normal level as the map builds.
Transition mood: clean → Scene 3

### Scene 3 — The warning arrives — 4.37s (8.74 → 13.11)
The user dot travels toward the orange `High` spot. On the strong cue at **8.74s** a warning card
slams into frame over the map — `#0B1F3A` surface, left border in `#F79B5C`:
**`HIGH RISK · 200 m ahead`**, with a second line beneath: *"Junction with 4 recorded incidents."*
Card holds settled ~2.8s. Beneath it, a muted footnote in `#B3BDCC`: *"Distances shown are
approximate."* — another verbatim disclaimer, earning its laugh by being sincere.
Sequential/interaction: the dot's approach is the interaction; the card is a single decisive arrival.
Audio intent: arrival, not alarm. Weight without threat.
Audio-coupled idea: one soft medium impact on the card's landing, exactly on the cue. **Nothing
siren-like.**
Music: full bed, unchanged. No riser.
Transition mood: clean → Scene 4

### Scene 4 — It does not publish itself — 4.36s (13.11 → 17.47)
The report screen. A short filled form: *What are you reporting?* → `Accident`, *How serious was it?*
→ a selected severity chip. On the cue at **13.11s** a cursor presses **Submit report**. The row
slides into a list — and instead of appearing on the map, it receives a muted chip: **`Pending
review`**. The scene's line holds over it: **"An algorithm never publishes a warning on its own."**
(9 words, ~2.7s settled). Small monospace credit: `firebase/firestore.rules`.
Sequential/interaction: **yes** — simulate the cursor tap on Submit, then the row settling with its
chip. The withheld publish is the beat.
Audio intent: a decision being recorded, then held. Deliberately anticlimactic.
Audio-coupled idea: one precise click on the tap; one soft settle as the `Pending review` chip lands.
Music: bed steady.
Transition mood: slow crossfade → Scene 5

### Scene 5 — The dialler — 3.81s (17.47 → 21.28)
**17.47 → 21.28** — the SOS screen on the cue at 17.47s. A large `#F1888C` SOS control, contacts
listed beneath. The screen's own accessibility hint types or fades in beneath the button, quoted
exactly: **"Opens your dialler. This app never places a call by itself."** (11 words, ~3.0s settled).
This is the best line in the repository and it gets the longest hold in the video.

### Scene 6 — The name — 2.74s (21.28 → 24.02)
A scrim takes the frame to near-black from 20.35s and the music fades out. About a second of
nothing. The name lands on a beat at **21.84s**, and the tagline follows on the track's strongest
cue at **22.93s**:
**Accident Black Spot Detection** · *Every warning has a human behind it.*
The final 2.4s play in measured silence.
Sequential/interaction: the hint line revealing beneath the button; then the empty beat before the name.
Audio intent: the SOS beat is calm, not urgent. The empty beat is genuinely empty. The name lands dry.
Audio-coupled idea: nothing on the SOS button — a sound there would imply it did something. One
extremely soft, low placement on the name, or silence. Silence is acceptable and probably better.
Music: fade to zero across 20.6 → 21.8. The last second is silent.
Transition mood: slow crossfade to near-black, then hold.

**Music mood for this video:** deadpan — a low restrained bed at 110 BPM that withdraws entirely for the final beat.
**Audio summary:** A quiet bed carries a calm build — five markers placing themselves, one weighted warning arrival, one precise tap — then steps out of the way completely so the product name lands in silence.

# Branding sources

Every PNG in `../images/` is **generated** from the SVG files in this directory. Edit the
SVG, re-run the generator, commit both:

```bash
npm run icons
```

The generator is `scripts/generateAppIcons.mjs` at the repository root. It needs
`rsvg-convert` (librsvg) and `magick` (ImageMagick 7) on `PATH`:

```bash
brew install librsvg imagemagick
```

Neither is a project dependency and neither is installed by `npm install`. That is
deliberate — artwork changes rarely, the generated PNGs are committed, and no build,
test or CI job invokes the generator. It is a tool you run by hand when the design
changes, not a build step.

## The mark

A location pin carrying a warning triangle, over concentric alert ripples.

The two halves say the two things the app does: **here** (a pin — a specific place on a
map) and **be careful** (a warning triangle — the international hazard glyph). The
ripples read as a proximity alert radiating outward, which is literally what the
proximity engine computes.

What it deliberately is **not**: a crash, a wrecked car, a red cross, a siren, or
anything resembling an emergency service's own insignia. This app is not an emergency
service and must never be mistaken for one — the same rule that governs the SOS copy
governs the icon.

The Android status-bar icon breaks from the mark and uses the warning triangle on its
own. At 24dp the pin's cut-out closes up into a blob; the two were rendered side by side
at that size before choosing. Consistency loses to legibility on an asset that exists to
be understood at a glance.

## Colour

Drawn from `apps/mobile/src/theme/tokens.ts`; the icon uses no colour the app does not.

| Role       | Token      | Value     |
| ---------- | ---------- | --------- |
| Field      | `navy800`  | `#0B1F3A` |
| Field edge | `navy900`  | `#060F1D` |
| Mark       | `amber300` | `#F0B449` |
| Ripples    | `blue300`  | `#7FB0F7` |

Amber on navy, not red on navy. Red is `danger` in the design system and is reserved
for the highest risk tier inside the app; an icon that is permanently red would spend
the one colour that has to mean something.

The mark stays legible with colour removed — pin silhouette plus triangle cut-out is a
shape difference, not a hue difference. That is the same requirement Phase 11 applied to
risk levels, applied here.

## Files, and the constraints each one is under

| Source                    | Output                             | Constraint                                                                                                                                                                                                                                                                                                                                          |
| ------------------------- | ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `icon.svg`                | `icon.png` 1024²                   | **No alpha channel.** App Store Connect rejects a marketing icon with transparency; the generator flattens it. Full-bleed, square, no rounded corners — iOS applies its own mask.                                                                                                                                                                   |
| `adaptive-foreground.svg` | `android-icon-foreground.png` 512² | Content inside the Android adaptive-icon safe circle (⌀66/108 of the canvas ≈ 313 px). Anything outside can be cropped by an OEM mask.                                                                                                                                                                                                              |
| `adaptive-background.svg` | `android-icon-background.png` 512² | Full-bleed. Must survive being masked to a circle, squircle or teardrop, so it carries no detail that needs its corners.                                                                                                                                                                                                                            |
| `adaptive-monochrome.svg` | `android-icon-monochrome.png` 432² | Android 13+ themed icons. **Alpha is the only channel Android reads** — it tints the silhouette with the wallpaper palette, so this is white-on-transparent and the triangle must be a real hole, not a navy fill.                                                                                                                                  |
| `splash-icon.svg`         | `splash-icon.png` 512²             | Transparent background — `expo-splash-screen` paints the field colour behind it, per theme. Rendered at `imageWidth: 180`.                                                                                                                                                                                                                          |
| `notification-icon.svg`   | `notification-icon.png` 192²       | Same alpha-only rule as monochrome, and for the same reason: Android status-bar icons are silhouettes. A coloured PNG here renders as a white blob. Consumed by both `expo-notifications` (proximity alerts) and `expo-location` (the background-monitoring foreground service). **This is the one file that is not the pin** — see the note in it. |
| `favicon.svg`             | `favicon.png` 48²                  | Web only. `web.output` is `static` and the web target is not a supported platform for this app.                                                                                                                                                                                                                                                     |

## Verifying a change

`npm run icons` prints the geometry and channel layout of everything it writes. Two
properties are worth checking by eye, because nothing else does:

1. `icon.png` reports **no alpha**. If it does not, the App Store upload fails.
2. `android-icon-monochrome.png` and `notification-icon.png` report **alpha present and
   colour effectively white**. If either is opaque, Android draws a filled rectangle.

At 48 px the pin, the triangle and the hole in it should all still be distinguishable.
Shrink `icon.png` and look at it — this is the size a user actually sees in a
notification shade or a search result.

#!/usr/bin/env node
/**
 * Render the committed SVG branding sources to the PNGs the app actually ships.
 *
 * Run by hand when the artwork changes — `npm run icons` — and never by a build,
 * a test or CI. The outputs are committed, so a clone builds without librsvg or
 * ImageMagick installed. Making this a build step would add two Homebrew
 * dependencies to every contributor and every CI runner in exchange for
 * regenerating files that change once a year.
 *
 * Two properties are enforced here rather than left to the artwork, because both
 * fail silently and both fail *late* — one at App Store upload, one on a user's
 * phone:
 *
 *   1. The iOS marketing icon must have NO alpha channel. App Store Connect
 *      rejects the binary otherwise, at submission, after everything else has
 *      passed. rsvg-convert always emits RGBA, so it is flattened explicitly.
 *   2. The Android monochrome and notification icons must have alpha and must be
 *      white where they are opaque. Android reads alpha only and tints the rest;
 *      an opaque export renders as a filled rectangle in the status bar.
 *
 * Both are asserted after writing, and both assertions are the reason this is a
 * script rather than a line in the README.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = resolve(repoRoot, 'apps/mobile/assets/branding');
const outputDir = resolve(repoRoot, 'apps/mobile/assets/images');

/**
 * @typedef {object} Target
 * @property {string} source     SVG filename in assets/branding.
 * @property {string} output     PNG filename in assets/images.
 * @property {number} size       Square edge length in pixels.
 * @property {'flatten' | 'alpha'} channels
 *   `flatten` composites onto the field colour and strips alpha, then asserts it
 *   is gone. `alpha` requires transparency to survive.
 * @property {boolean} [silhouette]
 *   Assert the opaque pixels are white. Only meaningful for the two icons
 *   Android renders as tinted silhouettes.
 */

/** The navy the app icon is composited onto when alpha is stripped. */
const FIELD_COLOUR = '#0B1F3A';

/** @type {readonly Target[]} */
const TARGETS = [
  { source: 'icon.svg', output: 'icon.png', size: 1024, channels: 'flatten' },
  {
    source: 'adaptive-foreground.svg',
    output: 'android-icon-foreground.png',
    size: 512,
    channels: 'alpha',
  },
  // Opaque, not transparent: a background layer with holes in it shows the
  // launcher wallpaper through the icon.
  {
    source: 'adaptive-background.svg',
    output: 'android-icon-background.png',
    size: 512,
    channels: 'flatten',
  },
  {
    source: 'adaptive-monochrome.svg',
    output: 'android-icon-monochrome.png',
    size: 432,
    channels: 'alpha',
    silhouette: true,
  },
  { source: 'splash-icon.svg', output: 'splash-icon.png', size: 512, channels: 'alpha' },
  {
    source: 'notification-icon.svg',
    output: 'notification-icon.png',
    size: 192,
    channels: 'alpha',
    silhouette: true,
  },
  { source: 'favicon.svg', output: 'favicon.png', size: 48, channels: 'flatten' },
];

function run(command, args) {
  return execFileSync(command, args, { encoding: 'utf8' }).trim();
}

function requireTool(command, installHint) {
  try {
    execFileSync(command, ['--version'], { stdio: 'ignore' });
  } catch {
    // Named explicitly rather than letting ENOENT surface: "spawn rsvg-convert
    // ENOENT" tells a contributor nothing about what to install.
    throw new Error(`\`${command}\` is not on PATH. Install it with:\n\n  ${installHint}\n`);
  }
}

/** Reports `WxH channels alphaKind` for a PNG, via ImageMagick. */
function describe(path) {
  const [width, height, channels, alpha] = run('magick', [
    'identify',
    '-format',
    '%w\n%h\n%[channels]\n%A',
    path,
  ]).split('\n');
  return { width: Number(width), height: Number(height), channels, alpha };
}

/**
 * The darkest channel value anywhere in the image once it is composited over
 * white, as a fraction in 0..1. Returns 1 for a pure white-on-transparent
 * silhouette.
 *
 * Composited over white rather than measured directly, because a transparent
 * pixel in a PNG still carries RGB — usually black — and averaging or
 * minimising over the raw file measures the colour of pixels nobody will ever
 * see. Over white, a pixel only pulls the minimum down if it is *both* opaque
 * and not white, which is exactly the failure worth catching: a shape that was
 * filled navy when it should have been cut out. Navy `#0B1F3A` lands at 0.04.
 *
 * The minimum, not the mean: a mean over a 432² canvas hides a hundred wrong
 * pixels in the rounding.
 */
function darkestOverWhite(path) {
  return Number(
    run('magick', [
      path,
      '-background',
      'white',
      '-alpha',
      'remove',
      '-alpha',
      'off',
      '-format',
      '%[fx:minima]',
      'info:',
    ]),
  );
}

function main() {
  requireTool('rsvg-convert', 'brew install librsvg');
  requireTool('magick', 'brew install imagemagick');

  mkdirSync(outputDir, { recursive: true });

  const problems = [];

  for (const target of TARGETS) {
    const source = resolve(sourceDir, target.source);
    const output = resolve(outputDir, target.output);

    // rsvg-convert rather than ImageMagick's own SVG delegate: ImageMagick
    // renders SVG through whatever delegate is installed, which on a machine
    // without librsvg is its internal MSVG renderer. That one silently ignores
    // `fill-rule="evenodd"` and radial gradients — the two things every file
    // here depends on — and produces a plausible-looking wrong icon.
    run('rsvg-convert', [
      '--width',
      String(target.size),
      '--height',
      String(target.size),
      '--keep-aspect-ratio',
      '--background-color',
      'none',
      '--output',
      output,
      source,
    ]);

    if (target.channels === 'flatten') {
      run('magick', [
        output,
        '-background',
        FIELD_COLOUR,
        '-alpha',
        'remove',
        '-alpha',
        'off',
        output,
      ]);
    }

    const info = describe(output);
    const hasAlpha = info.alpha !== 'Undefined' && info.alpha !== 'False';

    let note = '';

    if (target.channels === 'flatten' && hasAlpha) {
      problems.push(`${target.output}: expected no alpha channel, got ${info.channels}`);
    }
    if (target.channels === 'alpha' && !hasAlpha) {
      problems.push(`${target.output}: expected an alpha channel, got ${info.channels}`);
    }
    if (target.silhouette) {
      const darkest = darkestOverWhite(output);
      note = `  darkest-over-white ${darkest.toFixed(3)}`;
      // 0.98 rather than 1.0: cairo un-premultiplies on write, so an antialiased
      // edge pixel can land a value or two below pure white. Anything genuinely
      // filled is an order of magnitude darker than this bound.
      if (darkest < 0.98) {
        problems.push(
          `${target.output}: darkest pixel over white is ${darkest.toFixed(3)}, expected ~1.0. ` +
            'Android tints this by alpha and discards colour, so a non-white opaque region is a ' +
            'sign something was filled that should have been cut out — it will render as a solid blob.',
        );
      }
    }
    if (info.width !== target.size || info.height !== target.size) {
      problems.push(`${target.output}: expected ${target.size}², got ${info.width}x${info.height}`);
    }

    process.stdout.write(
      `${relative(repoRoot, output).padEnd(46)} ${`${info.width}x${info.height}`.padEnd(10)} ` +
        `${info.channels.padEnd(6)} alpha=${hasAlpha ? 'yes' : 'no '}${note}\n`,
    );
  }

  if (problems.length > 0) {
    process.stderr.write(`\n${problems.length} problem(s):\n`);
    for (const problem of problems) {
      process.stderr.write(`  • ${problem}\n`);
    }
    process.exitCode = 1;
    return;
  }

  process.stdout.write('\nAll targets written and verified.\n');
}

main();

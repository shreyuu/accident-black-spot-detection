import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { FORBIDDEN, formatOffenders, offendingPaths } from '../nativeBuildOutput.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('offendingPaths', () => {
  // The happy path first, deliberately. Phase 13's rules bug survived eleven
  // phases behind 143 tests that asserted only refusals: a check that flags
  // everything passes every test that only looks for flags.
  it('accepts a tree with no native build output', () => {
    assert.deepEqual(
      offendingPaths([
        'apps/mobile/src/features/alerts/proximityEngine.ts',
        'apps/mobile/app.config.ts',
        'firebase/firestore.rules',
        'package.json',
      ]),
      [],
    );
  });

  it('flags a prebuild at the repository root', () => {
    const offenders = offendingPaths(['ios/Podfile', 'ios/accidentblackspotdetection/Info.plist']);

    assert.equal(offenders.length, 2);
    assert.deepEqual(
      offenders.map((offender) => offender.path),
      ['ios/Podfile', 'ios/accidentblackspotdetection/Info.plist'],
    );
  });

  it('flags a root app.json but not one inside a workspace', () => {
    assert.deepEqual(
      offendingPaths(['app.json', 'apps/admin/app.json']).map((offender) => offender.path),
      ['app.json'],
    );
  });

  it('flags prebuild output inside the mobile workspace', () => {
    assert.deepEqual(
      offendingPaths(['apps/mobile/ios/Podfile', 'apps/mobile/android/build.gradle']).map(
        (offender) => offender.path,
      ),
      ['apps/mobile/ios/Podfile', 'apps/mobile/android/build.gradle'],
    );
  });

  it('flags the functions tsc emit', () => {
    assert.deepEqual(
      offendingPaths(['functions/lib/index.js', 'functions/src/index.ts']).map(
        (offender) => offender.path,
      ),
      ['functions/lib/index.js'],
    );
  });

  // `ios/` as a prefix must not match a path that merely starts with those
  // letters — `iosolate/` is nonsense, but `apps/mobile/src/utils/ios.ts` is not,
  // and a check that rejects a legitimate source file is a check somebody deletes.
  it('does not flag paths that only begin with a forbidden name', () => {
    assert.deepEqual(
      offendingPaths(['iossification/notes.md', 'apps/mobile/src/utils/ios.ts']),
      [],
    );
  });

  it('reports each file once even when several rules could match', () => {
    const offenders = offendingPaths(
      ['ios/Podfile'],
      [
        { prefix: 'ios/', reason: 'first' },
        { prefix: 'ios/', reason: 'second' },
      ],
    );

    assert.equal(offenders.length, 1);
    assert.equal(offenders[0]?.reason, 'first');
  });
});

describe('formatOffenders', () => {
  it('renders nothing when there is nothing to report', () => {
    assert.equal(formatOffenders([]), '');
  });

  it('groups files under a shared reason and names the remedy', () => {
    const message = formatOffenders([
      { path: 'ios/Podfile', reason: 'a prebuild at the root' },
      { path: 'ios/Info.plist', reason: 'a prebuild at the root' },
    ]);

    assert.match(message, /2 file\(s\)/);
    assert.match(message, /ios\/Podfile/);
    assert.match(message, /ios\/Info\.plist/);
    assert.match(message, /git rm -r --cached/);
    // The reason appears once, not once per file.
    assert.equal(message.split('a prebuild at the root').length - 1, 1);
  });

  it('truncates a long list rather than printing every sibling', () => {
    const offenders = Array.from({ length: 13 }, (_, index) => ({
      path: `ios/file-${index}`,
      reason: 'a prebuild at the root',
    }));

    assert.match(formatOffenders(offenders), /…and 8 more/);
  });
});

describe('this repository', () => {
  it('tracks no generated native build output', () => {
    const stdout = execFileSync('git', ['ls-files', '-z'], {
      cwd: repoRoot,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    const tracked = stdout.split('\0').filter((path) => path !== '');

    assert.equal(formatOffenders(offendingPaths(tracked)), '');
  });
});

describe('FORBIDDEN', () => {
  it('gives every rule a reason, because the failure message quotes it', () => {
    for (const { prefix, reason } of FORBIDDEN) {
      assert.ok(prefix.length > 0, 'a rule with an empty prefix matches everything');
      assert.ok(reason.length > 0, `${prefix} has no reason`);
    }
  });
});

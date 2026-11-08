import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { DRAFT_MAX_AGE_MS } from '@accident-black-spot-detection/shared-types';

import {
  ORPHAN_GRACE_PERIOD_HOURS,
  ownerOfObject,
  planOrphanSweep,
  type StorageObjectSummary,
} from '../orphanSweep.ts';

const NOW = Date.UTC(2026, 7, 2, 12, 0, 0);
const HOUR = 60 * 60 * 1000;

function object(path: string, ageHours: number): StorageObjectSummary {
  return { path, createdAtMs: NOW - ageHours * HOUR };
}

/** A download URL as `getDownloadURL()` produces one: path percent-encoded, plus a token. */
function downloadUrl(path: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/demo.appspot.com/o/${encodeURIComponent(path)}?alt=media&token=abc-123`;
}

describe('planOrphanSweep', () => {
  it('leaves a referenced object alone however old it is', () => {
    const old = object('incidentReports/uid1/a.jpg', 1000);
    const result = planOrphanSweep({
      objects: [old],
      referencedUrls: [downloadUrl(old.path)],
      nowMs: NOW,
    });

    assert.deepEqual(result.referenced, [old]);
    assert.deepEqual(result.orphaned, []);
  });

  it('collects an unreferenced object past the grace period', () => {
    const stale = object('incidentReports/uid1/b.jpg', ORPHAN_GRACE_PERIOD_HOURS + 1);
    const result = planOrphanSweep({ objects: [stale], referencedUrls: [], nowMs: NOW });

    assert.deepEqual(result.orphaned, [stale]);
  });

  it('spares an unreferenced object still inside the grace period', () => {
    // The live-submission case: the photo is uploaded and the user is still
    // typing the description. Deleting it would silently strip evidence from a
    // report in progress.
    const fresh = object('incidentReports/uid1/c.jpg', 1);
    const result = planOrphanSweep({ objects: [fresh], referencedUrls: [], nowMs: NOW });

    assert.deepEqual(result.tooRecent, [fresh]);
    assert.deepEqual(result.orphaned, []);
  });

  it('keeps an object sitting exactly on the boundary', () => {
    // The ambiguous case must fall on the side that does not delete.
    const boundary = object('incidentReports/uid1/d.jpg', ORPHAN_GRACE_PERIOD_HOURS);
    const result = planOrphanSweep({ objects: [boundary], referencedUrls: [], nowMs: NOW });

    assert.deepEqual(result.orphaned, []);
    assert.deepEqual(result.tooRecent, [boundary]);
  });

  it('recognises a reference whether the URL encodes the path or contains it plainly', () => {
    const target = object('incidentReports/uid1/e.jpg', ORPHAN_GRACE_PERIOD_HOURS + 100);

    for (const url of [downloadUrl(target.path), `http://localhost:9199/${target.path}`]) {
      const result = planOrphanSweep({ objects: [target], referencedUrls: [url], nowMs: NOW });
      assert.deepEqual(result.orphaned, [], `should treat ${url} as a reference`);
    }
  });

  it('does not treat one user’s reference as covering another user’s object', () => {
    const mine = object('incidentReports/uid1/f.jpg', ORPHAN_GRACE_PERIOD_HOURS + 100);
    const theirs = object('incidentReports/uid2/f.jpg', ORPHAN_GRACE_PERIOD_HOURS + 100);

    const result = planOrphanSweep({
      objects: [mine, theirs],
      referencedUrls: [downloadUrl(mine.path)],
      nowMs: NOW,
    });

    assert.deepEqual(result.referenced, [mine]);
    assert.deepEqual(result.orphaned, [theirs]);
  });

  it('honours an overridden grace period', () => {
    const target = object('incidentReports/uid1/g.jpg', 2);

    assert.deepEqual(
      planOrphanSweep({ objects: [target], referencedUrls: [], nowMs: NOW, graceHours: 1 })
        .orphaned,
      [target],
    );
    assert.deepEqual(
      planOrphanSweep({ objects: [target], referencedUrls: [], nowMs: NOW, graceHours: 3 })
        .orphaned,
      [],
    );
  });

  it('partitions every object exactly once', () => {
    const objects = [
      object('incidentReports/uid1/h.jpg', ORPHAN_GRACE_PERIOD_HOURS + 100),
      object('incidentReports/uid1/i.jpg', ORPHAN_GRACE_PERIOD_HOURS + 100),
      object('incidentReports/uid1/j.jpg', 1),
    ];

    const result = planOrphanSweep({
      objects,
      referencedUrls: [downloadUrl('incidentReports/uid1/h.jpg')],
      nowMs: NOW,
    });

    assert.equal(
      result.orphaned.length + result.tooRecent.length + result.referenced.length,
      objects.length,
    );
  });
});

describe('ownerOfObject', () => {
  it('reads the uid out of a well-formed path', () => {
    assert.equal(ownerOfObject('incidentReports/uid123/abc.jpg'), 'uid123');
  });

  it('refuses a path it does not recognise rather than guessing', () => {
    // Guessing wrong here means deleting somebody else's file.
    for (const path of [
      'incidentReports/uid123',
      'incidentReports/uid123/nested/abc.jpg',
      'somethingElse/uid123/abc.jpg',
      'incidentReports//abc.jpg',
      '',
      'abc.jpg',
    ]) {
      assert.equal(ownerOfObject(path), null, `should refuse: ${path}`);
    }
  });
});

describe('the grace period and the offline draft queue', () => {
  /**
   * A draft that failed to submit keeps its photos' download URLs and never
   * re-uploads them, for up to DRAFT_MAX_AGE_MS. A sweep that deleted
   * unreferenced objects sooner than that destroyed the evidence of a report
   * the user would still go on to submit — retried on day two, the report
   * pointed at photographs that no longer existed.
   */
  it('outlasts the longest a draft can wait, with margin', () => {
    assert.ok(
      ORPHAN_GRACE_PERIOD_HOURS * HOUR > DRAFT_MAX_AGE_MS,
      `grace ${ORPHAN_GRACE_PERIOD_HOURS}h must exceed the ${DRAFT_MAX_AGE_MS / HOUR}h draft lifetime`,
    );
  });

  it('spares the photos of a draft queued three days ago', () => {
    const queued = object('incidentReports/uid1/queued.jpg', 72);
    const result = planOrphanSweep({ objects: [queued], referencedUrls: [], nowMs: NOW });

    assert.deepEqual(result.orphaned, []);
    assert.deepEqual(result.tooRecent, [queued]);
  });
});

describe('a reference names exactly one object', () => {
  // Matching by substring let one long `imageUrls` entry carry any number of
  // object paths, each of which the sweep then treated as referenced — a way
  // to keep arbitrary uploads alive for ever.
  it('does not count object paths smuggled into the query string', () => {
    const named = object('incidentReports/uid1/named.jpg', 1000);
    const smuggled = object('incidentReports/uid1/smuggled.jpg', 1000);
    const packed = `${downloadUrl(named.path)}&x=${encodeURIComponent(smuggled.path)}${smuggled.path}`;

    const result = planOrphanSweep({
      objects: [named, smuggled],
      referencedUrls: [packed],
      nowMs: NOW,
    });

    assert.deepEqual(result.referenced, [named]);
    assert.deepEqual(result.orphaned, [smuggled]);
  });

  it('does not count a path concatenated onto another inside the object segment', () => {
    const smuggled = object('incidentReports/uid1/keep.jpg', 1000);
    const url = downloadUrl(`incidentReports/uid1/a.jpg${smuggled.path}`);

    const result = planOrphanSweep({ objects: [smuggled], referencedUrls: [url], nowMs: NOW });

    assert.deepEqual(result.orphaned, [smuggled]);
  });

  it('ignores a string that is not a URL at all', () => {
    const target = object('incidentReports/uid1/x.jpg', 1000);
    const result = planOrphanSweep({
      objects: [target],
      referencedUrls: [`not a url ${target.path}`],
      nowMs: NOW,
    });

    assert.deepEqual(result.orphaned, [target]);
  });
});

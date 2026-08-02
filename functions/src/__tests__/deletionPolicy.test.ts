import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  anonymisedReportFields,
  buildDeletionReceipt,
  DELETED_REPORTER_MARKER,
  dispositionOf,
  planReportDeletion,
} from '../deletionPolicy.ts';

describe('dispositionOf', () => {
  it('keeps an approved report, anonymised, because a black spot may depend on it', () => {
    assert.equal(dispositionOf('approved'), 'anonymise');
  });

  it('deletes a report that was never published', () => {
    assert.equal(dispositionOf('pending'), 'delete');
    assert.equal(dispositionOf('rejected'), 'delete');
  });

  it('deletes anything with an unrecognised status', () => {
    // If this function and the report model have diverged, erasing the person's
    // data is the failure to prefer over silently retaining it.
    assert.equal(dispositionOf('some-future-status'), 'delete');
    assert.equal(dispositionOf(''), 'delete');
  });
});

describe('planReportDeletion', () => {
  it('splits a mixed set correctly', () => {
    const plan = planReportDeletion([
      { id: 'a', status: 'pending' },
      { id: 'b', status: 'approved' },
      { id: 'c', status: 'rejected' },
      { id: 'd', status: 'approved' },
    ]);

    assert.deepEqual(plan.reportsToDelete, ['a', 'c']);
    assert.deepEqual(plan.reportsToAnonymise, ['b', 'd']);
  });

  it('accounts for every report exactly once', () => {
    const reports = Array.from({ length: 20 }, (_, index) => ({
      id: `r${index}`,
      status: index % 3 === 0 ? 'approved' : 'pending',
    }));

    const plan = planReportDeletion(reports);
    const handled = [...plan.reportsToDelete, ...plan.reportsToAnonymise];

    assert.equal(handled.length, reports.length);
    assert.equal(new Set(handled).size, reports.length);
  });

  it('handles an account with no reports', () => {
    assert.deepEqual(planReportDeletion([]), { reportsToDelete: [], reportsToAnonymise: [] });
  });
});

describe('anonymisedReportFields', () => {
  it('cuts the reporter link', () => {
    assert.equal(anonymisedReportFields().reporterId, DELETED_REPORTER_MARKER);
  });

  it('uses a marker that cannot collide with a real uid', () => {
    // The rules compare `reporterId == request.auth.uid`. A marker that could be
    // a uid would hand the anonymised reports to whoever held it.
    assert.match(DELETED_REPORTER_MARKER, /-/);
    assert.equal(/^[A-Za-z0-9]{20,}$/.test(DELETED_REPORTER_MARKER), false);
  });

  it('empties imageUrls in the same write, so the document never points at deleted objects', () => {
    assert.deepEqual(anonymisedReportFields().imageUrls, []);
  });
});

describe('buildDeletionReceipt', () => {
  const now = new Date('2026-08-02T12:00:00.000Z');

  it('records what was done', () => {
    const receipt = buildDeletionReceipt({
      documentsDeleted: 7,
      reportsAnonymised: 2,
      imagesDeleted: 3,
      now,
    });

    assert.deepEqual(receipt, {
      documentsDeleted: 7,
      reportsAnonymised: 2,
      imagesDeleted: 3,
      deletedAt: now,
    });
  });

  it('identifies nobody', () => {
    // A deletion record that named the person would defeat the deletion it
    // records. The tombstone must be countable, not attributable.
    const receipt = buildDeletionReceipt({
      documentsDeleted: 1,
      reportsAnonymised: 0,
      imagesDeleted: 0,
      now,
    });

    const serialised = JSON.stringify(receipt).toLowerCase();
    for (const forbidden of ['uid', 'email', 'name', 'phone', 'latitude', 'longitude']) {
      assert.equal(serialised.includes(forbidden), false, `receipt must not carry ${forbidden}`);
    }
  });
});

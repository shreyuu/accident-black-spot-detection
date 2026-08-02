import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildDataExport, EXPORT_FORMAT, type ExportInput } from '../exportPayload.ts';

const GENERATED_AT = new Date('2026-08-02T12:00:00.000Z');

/** Stands in for a Firestore Timestamp, of which the export only uses `toDate`. */
function timestamp(iso: string) {
  return { toDate: () => new Date(iso) };
}

function input(overrides: Partial<ExportInput> = {}): ExportInput {
  return {
    uid: 'uid-1',
    profile: null,
    reports: [],
    emergencyContacts: [],
    alertLogs: [],
    generatedAt: GENERATED_AT,
    ...overrides,
  };
}

describe('buildDataExport', () => {
  it('stamps the format and the time, so a file on disk is identifiable later', () => {
    const result = buildDataExport(input());

    assert.equal(result.format, EXPORT_FORMAT);
    assert.equal(result.generatedAt, '2026-08-02T12:00:00.000Z');
  });

  it('includes the profile, reports, contacts and alert logs', () => {
    const result = buildDataExport(
      input({
        profile: { id: 'uid-1', name: 'Ada', email: 'ada@example.test' },
        reports: [{ id: 'r1', description: 'A pothole' }],
        emergencyContacts: [{ id: 'c1', name: 'Sam', phone: '+447700900123' }],
        alertLogs: [{ id: 'a1', blackSpotId: 'spot-1' }],
      }),
    );

    assert.equal(result.account?.name, 'Ada');
    assert.equal(result.reports.length, 1);
    assert.equal(result.emergencyContacts[0]?.phone, '+447700900123');
    assert.equal(result.alertLogs[0]?.blackSpotId, 'spot-1');
  });

  it('gives the requester the decision on their report but not who made it', () => {
    // A person is entitled to know what was decided and why. Naming the
    // moderator in a file they can download is how a moderator gets harassed.
    const result = buildDataExport(
      input({
        reports: [
          {
            id: 'r1',
            status: 'rejected',
            moderationNotes: 'Could not be located.',
            reviewedBy: 'moderator-uid-7',
          },
        ],
      }),
    );

    const report = result.reports[0];
    assert.equal(report?.status, 'rejected');
    assert.equal(report?.moderationNotes, 'Could not be located.');
    assert.equal('reviewedBy' in (report ?? {}), false);
    assert.equal(JSON.stringify(result).includes('moderator-uid-7'), false);
  });

  it('renders timestamps as ISO strings rather than Firestore internals', () => {
    // `{_seconds, _nanoseconds}` is meaningless to somebody reading their own
    // export, which is the only audience this file has.
    const result = buildDataExport(
      input({ reports: [{ id: 'r1', createdAt: timestamp('2026-01-02T03:04:05.000Z') }] }),
    );

    assert.equal(result.reports[0]?.createdAt, '2026-01-02T03:04:05.000Z');
  });

  it('normalises a plain Date as well as a Timestamp', () => {
    const result = buildDataExport(
      input({ alertLogs: [{ id: 'a1', createdAt: new Date('2026-01-02T03:04:05.000Z') }] }),
    );

    assert.equal(result.alertLogs[0]?.createdAt, '2026-01-02T03:04:05.000Z');
  });

  it('normalises values inside arrays', () => {
    const result = buildDataExport(
      input({ reports: [{ id: 'r1', imageUrls: ['https://example.test/a.jpg'] }] }),
    );

    assert.deepEqual(result.reports[0]?.imageUrls, ['https://example.test/a.jpg']);
  });

  it('turns a missing value into null rather than dropping the key', () => {
    // A key that vanishes reads as "we never had this"; an explicit null reads
    // as "we hold this field and it is empty", which is the true statement.
    const result = buildDataExport(input({ reports: [{ id: 'r1', occurredAt: undefined }] }));

    assert.equal('occurredAt' in (result.reports[0] ?? {}), true);
    assert.equal(result.reports[0]?.occurredAt, null);
  });

  it('handles an account with nothing in it', () => {
    const result = buildDataExport(input());

    assert.equal(result.account, null);
    assert.deepEqual(result.reports, []);
    assert.deepEqual(result.emergencyContacts, []);
    assert.deepEqual(result.alertLogs, []);
  });

  it('explains what is not in the file', () => {
    // An export that quietly omits things is worse than one that says so.
    const notes = buildDataExport(input()).notes.join(' ').toLowerCase();

    assert.match(notes, /photographs/);
    assert.match(notes, /moderator/);
    assert.match(notes, /approved reports are kept/);
  });

  it('carries no internal anti-abuse bookkeeping', () => {
    const serialised = JSON.stringify(buildDataExport(input()));

    assert.equal(serialised.includes('reportRateLimits'), false);
    assert.equal(serialised.includes('fingerprint'), false);
  });
});

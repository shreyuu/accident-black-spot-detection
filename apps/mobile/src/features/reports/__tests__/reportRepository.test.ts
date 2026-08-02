import { getDocs, runTransaction, serverTimestamp } from 'firebase/firestore';

import { REPORT_RATE_LIMIT } from '@accident-black-spot-detection/shared-types';

import { createIncidentReport, fetchMyReports } from '@/features/reports/reportRepository';
import { AppError } from '@/utils/errors';

jest.mock('@/services/firebase/app', () => ({
  getFirebaseFirestore: () => ({}),
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  // Returns the path so the transaction fake can tell the three documents apart.
  doc: jest.fn((_db: unknown, path: string, id: string) => ({ id, path: `${path}/${id}` })),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
  orderBy: jest.fn(() => ({})),
  limit: jest.fn(() => ({})),
  getDocs: jest.fn(),
  runTransaction: jest.fn(),
  serverTimestamp: jest.fn(() => '__serverTimestamp__'),
}));

const mockedGetDocs = jest.mocked(getDocs);
const mockedRunTransaction = jest.mocked(runTransaction);

interface FakeDocument {
  id: string;
  data: () => Record<string, unknown>;
}

function validDocument(id: string, overrides: Record<string, unknown> = {}): FakeDocument {
  return {
    id,
    data: () => ({
      reporterId: 'user-1',
      type: 'pothole',
      description: 'Deep pothole across the nearside lane just after the junction.',
      latitude: 51.5074,
      longitude: -0.1278,
      geohash: 'gcpvj0duq5',
      severity: 'medium',
      imageUrls: [],
      status: 'pending',
      ...overrides,
    }),
  };
}

function snapshot(docs: FakeDocument[], fromCache = false) {
  return { docs, empty: docs.length === 0, metadata: { fromCache, hasPendingWrites: false } };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createIncidentReport', () => {
  const NOW = Date.UTC(2026, 7, 2, 12, 0, 0);
  const HOUR = 60 * 60 * 1000;

  const payload = {
    reporterId: 'user-1',
    type: 'accident' as const,
    description: 'A car left the road on the bend by the school and hit the barrier.',
    latitude: 51.5074,
    longitude: -0.1278,
    geohash: 'gcpvj0duq5',
    severity: 'high' as const,
    imageUrls: [],
    status: 'pending' as const,
  };

  /** A Firestore-like Timestamp, which is all the repository reads off one. */
  function timestamp(ms: number) {
    return { toMillis: () => ms };
  }

  function documentSnapshot(data: Record<string, unknown> | undefined) {
    return {
      exists: () => data !== undefined,
      data: () => data,
      get: (field: string) => data?.[field],
    };
  }

  /**
   * Drive the transaction callback with controllable stored state.
   *
   * The real transaction is exercised against the emulator by
   * `firebase/tests/limits.test.mjs`; what is under test here is the repository's
   * own decisions — which documents it writes, and when it refuses.
   */
  function runWith(stored: {
    report?: Record<string, unknown>;
    rateLimit?: Record<string, unknown>;
    fingerprint?: Record<string, unknown>;
  }) {
    const writes: { path: string; data: Record<string, unknown> }[] = [];

    mockedRunTransaction.mockImplementation(async (_db: unknown, updateFunction: unknown) => {
      const transaction = {
        get: (ref: { path: string }) => {
          if (ref.path.startsWith('incidentReports/')) {
            return Promise.resolve(documentSnapshot(stored.report));
          }
          if (ref.path.startsWith('reportRateLimits/')) {
            return Promise.resolve(documentSnapshot(stored.rateLimit));
          }
          return Promise.resolve(documentSnapshot(stored.fingerprint));
        },
        set: (ref: { path: string }, data: Record<string, unknown>) => {
          writes.push({ path: ref.path, data });
        },
      };

      return (updateFunction as (t: typeof transaction) => Promise<void>)(transaction);
    });

    return writes;
  }

  it('writes the report, the counter and the fingerprint in one transaction', async () => {
    // All three are required by the rules to arrive together; a missing one is
    // refused server-side, so this is the shape of a working submission.
    const writes = runWith({});

    await createIncidentReport('report-1', payload, NOW);

    expect(writes.map((write) => write.path).sort()).toEqual([
      'incidentReports/report-1',
      'reportFingerprints/user-1__accident__gcpvj0d',
      'reportRateLimits/user-1',
    ]);
  });

  it('adds server timestamps rather than device ones', async () => {
    const writes = runWith({});

    await createIncidentReport('report-1', payload, NOW);

    const report = writes.find((write) => write.path === 'incidentReports/report-1');
    expect(report?.data).toEqual(
      expect.objectContaining({
        status: 'pending',
        createdAt: '__serverTimestamp__',
        updatedAt: '__serverTimestamp__',
      }),
    );
    expect(serverTimestamp).toHaveBeenCalled();
  });

  it('starts the counter at one when the user has never reported', async () => {
    const writes = runWith({});

    await createIncidentReport('report-1', payload, NOW);

    const counter = writes.find((write) => write.path === 'reportRateLimits/user-1');
    expect(counter?.data).toEqual({
      userId: 'user-1',
      windowStartAt: '__serverTimestamp__',
      count: 1,
      lastReportAt: '__serverTimestamp__',
    });
  });

  it('writes back the stored windowStartAt unchanged while the window is current', async () => {
    // The rule compares it for exact equality. Rebuilding it from milliseconds
    // would drift by the sub-millisecond part and the write would be refused.
    const storedWindowStart = timestamp(NOW - 2 * HOUR);
    const writes = runWith({
      rateLimit: {
        windowStartAt: storedWindowStart,
        count: 3,
        lastReportAt: timestamp(NOW - HOUR),
      },
    });

    await createIncidentReport('report-1', payload, NOW);

    const counter = writes.find((write) => write.path === 'reportRateLimits/user-1');
    expect(counter?.data.windowStartAt).toBe(storedWindowStart);
    expect(counter?.data.count).toBe(4);
  });

  it('starts a fresh window once the old one has elapsed', async () => {
    const writes = runWith({
      rateLimit: {
        windowStartAt: timestamp(NOW - (REPORT_RATE_LIMIT.windowHours + 1) * HOUR),
        count: REPORT_RATE_LIMIT.maxPerWindow,
        lastReportAt: timestamp(NOW - (REPORT_RATE_LIMIT.windowHours + 1) * HOUR),
      },
    });

    await createIncidentReport('report-1', payload, NOW);

    const counter = writes.find((write) => write.path === 'reportRateLimits/user-1');
    expect(counter?.data.windowStartAt).toBe('__serverTimestamp__');
    expect(counter?.data.count).toBe(1);
  });

  it('refuses without writing anything once the daily allowance is spent', async () => {
    const writes = runWith({
      rateLimit: {
        windowStartAt: timestamp(NOW - HOUR),
        count: REPORT_RATE_LIMIT.maxPerWindow,
        lastReportAt: timestamp(NOW - HOUR),
      },
    });

    await expect(createIncidentReport('report-1', payload, NOW)).rejects.toThrow(AppError);
    // A refused submission must not consume the allowance it was refused by.
    expect(writes).toEqual([]);
  });

  it('does not offer a retry for a rate limit, which would only hammer the lockout', async () => {
    runWith({
      rateLimit: {
        windowStartAt: timestamp(NOW - HOUR),
        count: REPORT_RATE_LIMIT.maxPerWindow,
        lastReportAt: timestamp(NOW - HOUR),
      },
    });

    await expect(createIncidentReport('report-1', payload, NOW)).rejects.toMatchObject({
      retryable: false,
    });
  });

  it('refuses a duplicate of a recent report at the same place', async () => {
    const writes = runWith({
      rateLimit: {
        windowStartAt: timestamp(NOW - 2 * HOUR),
        count: 1,
        lastReportAt: timestamp(NOW - 2 * HOUR),
      },
      fingerprint: {
        reporterId: 'user-1',
        reportId: 'an-earlier-report',
        lastReportAtMs: NOW - HOUR,
        lastReportAt: timestamp(NOW - HOUR),
      },
    });

    // `userMessage`, not `message`: the latter is the technical string kept for
    // logs, and asserting on it would let the displayed copy regress unnoticed.
    await expect(createIncidentReport('report-new', payload, NOW)).rejects.toMatchObject({
      userMessage: expect.stringMatching(/already reported this/i),
      retryable: false,
    });
    expect(writes).toEqual([]);
  });

  it('treats a report that is already stored as a successful retry', async () => {
    // The reserved id is reused across retries. If the first attempt committed
    // but its response was lost, the document is already here — and rewriting it
    // is impossible anyway, because the rules refuse an update. Reporting an
    // error would push the user into filing a genuine duplicate.
    const writes = runWith({ report: { reporterId: 'user-1', status: 'pending' } });

    await expect(createIncidentReport('report-1', payload, NOW)).resolves.toBeUndefined();
    expect(writes).toEqual([]);
  });
});

describe('fetchMyReports', () => {
  it('returns the caller’s reports', async () => {
    // @ts-expect-error -- a minimal snapshot stands in for the real QuerySnapshot
    mockedGetDocs.mockResolvedValue(snapshot([validDocument('r1'), validDocument('r2')]));

    const reports = await fetchMyReports('user-1');
    expect(reports.map((report) => report.id)).toEqual(['r1', 'r2']);
  });

  it('skips a malformed document instead of blanking the list', async () => {
    mockedGetDocs.mockResolvedValue(
      // @ts-expect-error -- see above
      snapshot([validDocument('good'), validDocument('bad', { severity: 'catastrophic' })]),
    );

    const reports = await fetchMyReports('user-1');
    expect(reports.map((report) => report.id)).toEqual(['good']);
  });

  it('discards a report belonging to somebody else', async () => {
    mockedGetDocs.mockResolvedValue(
      // @ts-expect-error -- see above
      snapshot([validDocument('mine'), validDocument('theirs', { reporterId: 'user-2' })]),
    );

    const reports = await fetchMyReports('user-1');
    expect(reports.map((report) => report.id)).toEqual(['mine']);
  });

  it('omits an absent moderation note rather than setting it undefined', async () => {
    // @ts-expect-error -- see above
    mockedGetDocs.mockResolvedValue(snapshot([validDocument('r1')]));

    const [report] = await fetchMyReports('user-1');
    expect(report !== undefined && 'moderationNotes' in report).toBe(false);
  });

  it('keeps a moderation note when one was written', async () => {
    mockedGetDocs.mockResolvedValue(
      // @ts-expect-error -- see above
      snapshot([validDocument('r1', { status: 'rejected', moderationNotes: 'Already recorded.' })]),
    );

    const [report] = await fetchMyReports('user-1');
    expect(report?.moderationNotes).toBe('Already recorded.');
    expect(report?.status).toBe('rejected');
  });

  it('treats an empty cached result as a network failure, not as "no reports"', async () => {
    // getDocs resolves rather than rejecting when offline; without this check the
    // user would be told they have never filed a report.
    // @ts-expect-error -- see above
    mockedGetDocs.mockResolvedValue(snapshot([], true));

    await expect(fetchMyReports('user-1')).rejects.toThrow(AppError);
  });

  it('serves a cached result that actually contains the user’s own reports', async () => {
    // @ts-expect-error -- see above
    mockedGetDocs.mockResolvedValue(snapshot([validDocument('r1')], true));

    const reports = await fetchMyReports('user-1');
    expect(reports).toHaveLength(1);
  });
});

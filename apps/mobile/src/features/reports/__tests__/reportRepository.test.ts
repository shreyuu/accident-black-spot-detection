import { getDocs, serverTimestamp, setDoc } from 'firebase/firestore';

import { createIncidentReport, fetchMyReports } from '@/features/reports/reportRepository';
import { AppError } from '@/utils/errors';

jest.mock('@/services/firebase/app', () => ({
  getFirebaseFirestore: () => ({}),
}));

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({ id: 'generated-id' })),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
  orderBy: jest.fn(() => ({})),
  limit: jest.fn(() => ({})),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  serverTimestamp: jest.fn(() => '__serverTimestamp__'),
}));

const mockedGetDocs = jest.mocked(getDocs);
const mockedSetDoc = jest.mocked(setDoc);

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
  it('adds server timestamps rather than device ones', async () => {
    await createIncidentReport('report-1', {
      reporterId: 'user-1',
      type: 'accident',
      description: 'A car left the road on the bend by the school and hit the barrier.',
      latitude: 51.5074,
      longitude: -0.1278,
      geohash: 'gcpvj0duq5',
      severity: 'high',
      imageUrls: [],
      status: 'pending',
    });

    expect(serverTimestamp).toHaveBeenCalledTimes(2);
    expect(mockedSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: 'pending',
        createdAt: '__serverTimestamp__',
        updatedAt: '__serverTimestamp__',
      }),
    );
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

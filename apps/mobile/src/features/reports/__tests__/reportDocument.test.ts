import { buildIncidentReportPayload } from '@/features/reports/reportDocument';
import type { IncidentReportFormValues } from '@/features/reports/reportSchemas';
import { AppError } from '@/utils/errors';

/**
 * The safety-critical unit of Phase 5.
 *
 * Everything here exists to prove one property: a payload built on the client is
 * always a `pending` report and never carries a moderation field. The Firestore
 * rules enforce the same thing and are the actual control — but a client that
 * tried to break the rule would have its write rejected and lose the user's
 * report, so it must not be able to try.
 */

const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);

function values(overrides: Partial<IncidentReportFormValues> = {}): IncidentReportFormValues {
  return {
    type: 'accident',
    severity: 'high',
    description: 'A car left the road on the bend by the school and hit the barrier.',
    latitude: 51.5074,
    longitude: -0.1278,
    ...overrides,
  };
}

describe('buildIncidentReportPayload', () => {
  it('builds a complete payload', () => {
    const payload = buildIncidentReportPayload(
      { reporterId: 'user-1', values: values(), imageUrls: [] },
      NOW,
    );

    expect(payload).toMatchObject({
      reporterId: 'user-1',
      type: 'accident',
      severity: 'high',
      latitude: 51.5074,
      longitude: -0.1278,
      status: 'pending',
      imageUrls: [],
    });
  });

  it('always pins status to pending', () => {
    // The caller has no parameter for it, so the only way this could regress is
    // by someone adding one.
    const payload = buildIncidentReportPayload(
      { reporterId: 'user-1', values: values(), imageUrls: [] },
      NOW,
    );
    expect(payload.status).toBe('pending');
  });

  it('never emits a moderation or verification field', () => {
    const payload = buildIncidentReportPayload(
      {
        reporterId: 'user-1',
        // Extra keys a tampered caller might try to smuggle through. The payload
        // is assembled field by field, so they cannot survive.
        values: {
          ...values(),
          ...({
            status: 'approved',
            verified: true,
            reviewedBy: 'user-1',
            reviewedAt: NOW,
            moderationNotes: 'Looks fine to me',
          } as Partial<IncidentReportFormValues>),
        },
        imageUrls: [],
      },
      NOW,
    );

    expect(payload.status).toBe('pending');
    expect(Object.keys(payload)).not.toContain('verified');
    expect(Object.keys(payload)).not.toContain('reviewedBy');
    expect(Object.keys(payload)).not.toContain('reviewedAt');
    expect(Object.keys(payload)).not.toContain('moderationNotes');
  });

  it('never emits a createdAt or updatedAt, which belong to the server clock', () => {
    const payload = buildIncidentReportPayload(
      { reporterId: 'user-1', values: values(), imageUrls: [] },
      NOW,
    );
    expect(Object.keys(payload)).not.toContain('createdAt');
    expect(Object.keys(payload)).not.toContain('updatedAt');
  });

  it('computes a base-32 geohash for the coordinates', () => {
    const payload = buildIncidentReportPayload(
      { reporterId: 'user-1', values: values(), imageUrls: [] },
      NOW,
    );
    expect(payload.geohash).toMatch(/^[0-9b-hjkmnp-z]{10}$/);
  });

  it('produces different geohashes for different places', () => {
    const london = buildIncidentReportPayload(
      { reporterId: 'u', values: values(), imageUrls: [] },
      NOW,
    );
    const sydney = buildIncidentReportPayload(
      {
        reporterId: 'u',
        values: values({ latitude: -33.8688, longitude: 151.2093 }),
        imageUrls: [],
      },
      NOW,
    );
    expect(london.geohash).not.toBe(sydney.geohash);
  });

  it('copies the image URLs rather than aliasing the caller array', () => {
    const urls = ['https://example.test/a'];
    const payload = buildIncidentReportPayload(
      { reporterId: 'user-1', values: values(), imageUrls: urls },
      NOW,
    );

    urls.push('https://example.test/b');
    expect(payload.imageUrls).toEqual(['https://example.test/a']);
  });

  describe('occurredAt', () => {
    it('is omitted entirely when the reporter did not say', () => {
      const payload = buildIncidentReportPayload(
        { reporterId: 'user-1', values: values(), imageUrls: [] },
        NOW,
      );
      // Omitted, not undefined: Firestore rejects an explicit undefined value.
      expect('occurredAt' in payload).toBe(false);
    });

    it('is converted to a Date when supplied', () => {
      const payload = buildIncidentReportPayload(
        { reporterId: 'user-1', values: values({ occurredAtMs: NOW - 3600_000 }), imageUrls: [] },
        NOW,
      );
      expect(payload.occurredAt).toEqual(new Date(NOW - 3600_000));
    });
  });

  describe('refusals', () => {
    it('refuses a payload with no reporter', () => {
      expect(() =>
        buildIncidentReportPayload({ reporterId: '  ', values: values(), imageUrls: [] }, NOW),
      ).toThrow(AppError);
    });

    it('refuses invalid values, before anything is uploaded', () => {
      expect(() =>
        buildIncidentReportPayload(
          { reporterId: 'user-1', values: values({ description: 'too short' }), imageUrls: [] },
          NOW,
        ),
      ).toThrow(AppError);
    });

    it('refuses an out-of-range coordinate', () => {
      expect(() =>
        buildIncidentReportPayload(
          { reporterId: 'user-1', values: values({ latitude: 200 }), imageUrls: [] },
          NOW,
        ),
      ).toThrow(AppError);
    });

    it('refuses more images than a report may carry', () => {
      expect(() =>
        buildIncidentReportPayload(
          { reporterId: 'user-1', values: values(), imageUrls: ['a', 'b', 'c', 'd'] },
          NOW,
        ),
      ).toThrow(AppError);
    });

    it('reports a validation failure as a validation error, not an unknown one', () => {
      try {
        buildIncidentReportPayload(
          { reporterId: 'user-1', values: values({ description: '' }), imageUrls: [] },
          NOW,
        );
        throw new Error('Expected a throw.');
      } catch (error) {
        expect(error).toBeInstanceOf(AppError);
        expect((error as AppError).kind).toBe('validation');
      }
    });
  });
});

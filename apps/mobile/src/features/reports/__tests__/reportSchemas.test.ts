import {
  buildIncidentReportFormSchema,
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  incidentReportDocumentSchema,
  incidentReportFormSchema,
  MAX_OCCURRED_AGE_MS,
  OCCURRED_FUTURE_TOLERANCE_MS,
} from '@/features/reports/reportSchemas';

/** Fixed clock so the occurrence-time bounds are not tested against wall time. */
const NOW = Date.UTC(2026, 5, 1, 12, 0, 0);

const schema = buildIncidentReportFormSchema(() => NOW);

function values(overrides: Record<string, unknown> = {}) {
  return {
    type: 'accident',
    severity: 'medium',
    description: 'A car left the road on the bend by the school and hit the barrier.',
    latitude: 51.5074,
    longitude: -0.1278,
    ...overrides,
  };
}

describe('incident report form schema', () => {
  it('accepts a complete report', () => {
    expect(schema.safeParse(values()).success).toBe(true);
  });

  describe('description', () => {
    it('rejects one that is too short to review', () => {
      const result = schema.safeParse(values({ description: 'pothole' }));
      expect(result.success).toBe(false);
    });

    it('accepts one exactly at the minimum', () => {
      const result = schema.safeParse(values({ description: 'x'.repeat(DESCRIPTION_MIN_LENGTH) }));
      expect(result.success).toBe(true);
    });

    it('rejects one over the maximum', () => {
      const result = schema.safeParse({
        ...values(),
        description: 'x'.repeat(DESCRIPTION_MAX_LENGTH + 1),
      });
      expect(result.success).toBe(false);
    });

    it('trims before measuring, so padding cannot fake the minimum', () => {
      const result = schema.safeParse(
        values({ description: `  ${'x'.repeat(5)}${' '.repeat(40)}` }),
      );
      expect(result.success).toBe(false);
    });

    it('stores the trimmed value', () => {
      const result = schema.safeParse(values({ description: `  ${'x'.repeat(30)}  ` }));
      expect(result.success && result.data.description).toBe('x'.repeat(30));
    });
  });

  describe('coordinates', () => {
    it.each([
      ['latitude too high', { latitude: 91 }],
      ['latitude too low', { latitude: -90.1 }],
      ['longitude too high', { longitude: 180.5 }],
      ['longitude too low', { longitude: -181 }],
      ['latitude NaN', { latitude: Number.NaN }],
      ['longitude infinite', { longitude: Number.POSITIVE_INFINITY }],
    ])('rejects %s', (_label, overrides) => {
      expect(schema.safeParse(values(overrides)).success).toBe(false);
    });

    it('accepts the extremes of the valid range', () => {
      expect(schema.safeParse(values({ latitude: 90, longitude: 180 })).success).toBe(true);
      expect(schema.safeParse(values({ latitude: -90, longitude: -180 })).success).toBe(true);
    });

    it('rejects a missing location outright', () => {
      const { latitude: _latitude, ...withoutLatitude } = values();
      expect(schema.safeParse(withoutLatitude).success).toBe(false);
    });
  });

  describe('occurrence time', () => {
    it('is optional', () => {
      expect(schema.safeParse(values()).success).toBe(true);
    });

    it('accepts a recent past time', () => {
      expect(schema.safeParse(values({ occurredAtMs: NOW - 60_000 })).success).toBe(true);
    });

    it('tolerates a device clock that runs slightly fast', () => {
      const result = schema.safeParse(
        values({ occurredAtMs: NOW + OCCURRED_FUTURE_TOLERANCE_MS - 1000 }),
      );
      expect(result.success).toBe(true);
    });

    it('rejects a time beyond the clock-skew tolerance', () => {
      const result = schema.safeParse(
        values({ occurredAtMs: NOW + OCCURRED_FUTURE_TOLERANCE_MS + 60_000 }),
      );
      expect(result.success).toBe(false);
    });

    it('rejects a time older than the retention window', () => {
      const result = schema.safeParse(values({ occurredAtMs: NOW - MAX_OCCURRED_AGE_MS - 1000 }));
      expect(result.success).toBe(false);
    });
  });

  describe('the clock the schema reads', () => {
    /**
     * Regression test for a defect found on the simulator, not here: the schema
     * used to capture `Date.now()` when it was *built*, so the module-level
     * `incidentReportFormSchema` froze the clock at import. A form left open for
     * more than the five-minute skew tolerance then rejected "now" as being in
     * the future. The clock must be read at parse time.
     */
    it('re-reads the clock on every parse rather than capturing it once', () => {
      let currentTime = NOW;
      const lateBoundSchema = buildIncidentReportFormSchema(() => currentTime);

      // Ten minutes later, "ten minutes from the original now" is in the past.
      const tenMinutesOn = NOW + 10 * 60 * 1000;
      expect(lateBoundSchema.safeParse(values({ occurredAtMs: tenMinutesOn })).success).toBe(false);

      currentTime = tenMinutesOn;
      expect(lateBoundSchema.safeParse(values({ occurredAtMs: tenMinutesOn })).success).toBe(true);
    });

    it('binds the exported form schema to the live clock', () => {
      expect(incidentReportFormSchema.safeParse(values({ occurredAtMs: Date.now() })).success).toBe(
        true,
      );
    });
  });

  describe('enums', () => {
    it('rejects an unknown incident type', () => {
      expect(schema.safeParse(values({ type: 'ufo' })).success).toBe(false);
    });

    it('rejects a severity borrowed from the black spot risk scale', () => {
      // `critical` is a RiskLevel, not an IncidentSeverity. Accepting it would
      // let a self-reported severity read as an official classification.
      expect(schema.safeParse(values({ severity: 'critical' })).success).toBe(false);
    });
  });
});

describe('incident report document schema', () => {
  function document(overrides: Record<string, unknown> = {}) {
    return {
      id: 'report-1',
      reporterId: 'user-1',
      type: 'pothole',
      description: 'Deep pothole across the nearside lane just after the junction.',
      latitude: 51.5074,
      longitude: -0.1278,
      geohash: 'gcpvj0duq5',
      severity: 'high',
      imageUrls: [],
      status: 'pending',
      ...overrides,
    };
  }

  it('accepts a well-formed stored document', () => {
    expect(incidentReportDocumentSchema.safeParse(document()).success).toBe(true);
  });

  it('accepts moderation fields, which only a moderator can have written', () => {
    const result = incidentReportDocumentSchema.safeParse(
      document({
        status: 'rejected',
        moderationNotes: 'Duplicate of an existing report.',
        reviewedBy: 'mod-1',
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects a geohash outside the base-32 alphabet', () => {
    // `a`, `i`, `l` and `o` are excluded from geohash base-32.
    expect(incidentReportDocumentSchema.safeParse(document({ geohash: 'ailo' })).success).toBe(
      false,
    );
  });

  it('rejects more image URLs than a report may carry', () => {
    const result = incidentReportDocumentSchema.safeParse(
      document({ imageUrls: ['a', 'b', 'c', 'd'] }),
    );
    expect(result.success).toBe(false);
  });

  it('rejects a status outside the known set', () => {
    expect(incidentReportDocumentSchema.safeParse(document({ status: 'published' })).success).toBe(
      false,
    );
  });
});

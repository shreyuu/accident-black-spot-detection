import type { ZoneState, ZoneStates } from '@/features/alerts/proximityEngine';
import {
  MAX_PERSISTED_ZONES,
  PRESENCE_MAX_AGE_MS,
  RECORD_MAX_AGE_MS,
  ZONE_STATE_SCHEMA_VERSION,
  decodeZoneStates,
  encodeZoneStates,
  mergeZoneStates,
} from '@/features/alerts/zoneStatePersistence';

const NOW = 1_700_000_000_000;

function state(overrides: Partial<ZoneState> & { blackSpotId: string }): ZoneState {
  return { inside: false, lastAlertedAt: null, ...overrides };
}

function statesOf(...entries: ZoneState[]): ZoneStates {
  return Object.fromEntries(entries.map((entry) => [entry.blackSpotId, entry]));
}

describe('encodeZoneStates', () => {
  it('keeps zones the user is currently inside', () => {
    const encoded = encodeZoneStates(statesOf(state({ blackSpotId: 'a', inside: true })), NOW);

    expect(encoded.version).toBe(ZONE_STATE_SCHEMA_VERSION);
    expect(encoded.savedAt).toBe(NOW);
    expect(encoded.states).toEqual([{ blackSpotId: 'a', inside: true, lastAlertedAt: null }]);
  });

  it('keeps zones with a recent alert even when the user has left', () => {
    const encoded = encodeZoneStates(
      statesOf(state({ blackSpotId: 'a', inside: false, lastAlertedAt: NOW - 60_000 })),
      NOW,
    );

    expect(encoded.states).toHaveLength(1);
  });

  it('drops entries that would change no decision', () => {
    const encoded = encodeZoneStates(
      statesOf(
        state({ blackSpotId: 'outside-never-alerted' }),
        state({ blackSpotId: 'long-expired', lastAlertedAt: NOW - RECORD_MAX_AGE_MS - 1 }),
      ),
      NOW,
    );

    expect(encoded.states).toEqual([]);
  });

  it('caps the number of entries, keeping presence over alert history', () => {
    const many: ZoneState[] = [];
    for (let index = 0; index < MAX_PERSISTED_ZONES + 20; index += 1) {
      // Only the last two are inside, so a naive slice would discard them.
      const inside = index >= MAX_PERSISTED_ZONES + 18;
      many.push(state({ blackSpotId: `spot-${index}`, inside, lastAlertedAt: NOW - index }));
    }

    const encoded = encodeZoneStates(statesOf(...many), NOW);

    expect(encoded.states).toHaveLength(MAX_PERSISTED_ZONES);
    expect(encoded.states.filter((entry) => entry.inside)).toHaveLength(2);
  });
});

describe('decodeZoneStates', () => {
  it('round-trips a fresh snapshot', () => {
    const original = statesOf(
      state({ blackSpotId: 'a', inside: true, lastAlertedAt: NOW - 1000 }),
      state({ blackSpotId: 'b', inside: false, lastAlertedAt: NOW - 2000 }),
    );

    expect(decodeZoneStates(encodeZoneStates(original, NOW), NOW)).toEqual(original);
  });

  it('forgets presence once it is older than the presence window', () => {
    const encoded = encodeZoneStates(
      statesOf(state({ blackSpotId: 'a', inside: true, lastAlertedAt: NOW - 1000 })),
      NOW,
    );

    const restored = decodeZoneStates(encoded, NOW + PRESENCE_MAX_AGE_MS + 1);

    // The alert time survives — it self-expires via the engine's cooldown — but
    // `inside` must not, because a stale one would swallow a genuine warning.
    expect(restored.a).toEqual({
      blackSpotId: 'a',
      inside: false,
      lastAlertedAt: NOW - 1000,
    });
  });

  it('keeps presence right up to the edge of the presence window', () => {
    const encoded = encodeZoneStates(statesOf(state({ blackSpotId: 'a', inside: true })), NOW);

    expect(decodeZoneStates(encoded, NOW + PRESENCE_MAX_AGE_MS).a?.inside).toBe(true);
  });

  it('drops an entry left with nothing to say once presence has expired', () => {
    const encoded = encodeZoneStates(statesOf(state({ blackSpotId: 'a', inside: true })), NOW);

    expect(decodeZoneStates(encoded, NOW + PRESENCE_MAX_AGE_MS + 1)).toEqual({});
  });

  it('discards a record older than the retention limit', () => {
    const encoded = encodeZoneStates(
      statesOf(state({ blackSpotId: 'a', inside: true, lastAlertedAt: NOW })),
      NOW,
    );

    expect(decodeZoneStates(encoded, NOW + RECORD_MAX_AGE_MS + 1)).toEqual({});
  });

  it('discards a record that appears to come from the future', () => {
    // A device clock moved backwards. The elapsed time is unknowable, so the
    // record is thrown away rather than trusted to suppress a warning.
    const encoded = encodeZoneStates(statesOf(state({ blackSpotId: 'a', inside: true })), NOW);

    expect(decodeZoneStates(encoded, NOW - 1)).toEqual({});
  });

  it('drops an alert timestamp in the future rather than letting it suppress warnings', () => {
    const restored = decodeZoneStates(
      {
        version: ZONE_STATE_SCHEMA_VERSION,
        savedAt: NOW,
        states: [{ blackSpotId: 'a', inside: true, lastAlertedAt: NOW + 60_000 }],
      },
      NOW,
    );

    expect(restored.a).toEqual({ blackSpotId: 'a', inside: true, lastAlertedAt: null });
  });

  it.each([
    ['null', null],
    ['a string', 'not-an-object'],
    ['an empty object', {}],
    ['a wrong version', { version: 99, savedAt: NOW, states: [] }],
    ['a missing savedAt', { version: ZONE_STATE_SCHEMA_VERSION, states: [] }],
    ['a non-array states field', { version: ZONE_STATE_SCHEMA_VERSION, savedAt: NOW, states: {} }],
  ])('returns nothing for %s', (_label, raw) => {
    expect(decodeZoneStates(raw, NOW)).toEqual({});
  });

  it('skips malformed entries without discarding the good ones', () => {
    const restored = decodeZoneStates(
      {
        version: ZONE_STATE_SCHEMA_VERSION,
        savedAt: NOW,
        states: [
          { blackSpotId: '', inside: true, lastAlertedAt: null },
          { blackSpotId: 'good', inside: true, lastAlertedAt: null },
          { inside: true, lastAlertedAt: null },
          { blackSpotId: 'bad-types', inside: 'yes', lastAlertedAt: null },
          null,
        ],
      },
      NOW,
    );

    expect(Object.keys(restored)).toEqual(['good']);
  });
});

describe('mergeZoneStates', () => {
  it('takes entries present on only one side', () => {
    const merged = mergeZoneStates(
      statesOf(state({ blackSpotId: 'a', inside: true })),
      statesOf(state({ blackSpotId: 'b', inside: true })),
    );

    expect(Object.keys(merged).sort()).toEqual(['a', 'b']);
  });

  it('keeps the later alert time so either side can silence the other', () => {
    const merged = mergeZoneStates(
      statesOf(state({ blackSpotId: 'a', lastAlertedAt: NOW })),
      statesOf(state({ blackSpotId: 'a', lastAlertedAt: NOW - 5000 })),
    );

    expect(merged.a?.lastAlertedAt).toBe(NOW);
  });

  it('takes presence from the newer snapshot', () => {
    const merged = mergeZoneStates(
      statesOf(state({ blackSpotId: 'a', inside: true })),
      statesOf(state({ blackSpotId: 'a', inside: false })),
    );

    expect(merged.a?.inside).toBe(false);
  });

  it('takes presence from the first argument when it is the current one', () => {
    const merged = mergeZoneStates(
      statesOf(state({ blackSpotId: 'a', inside: true })),
      statesOf(state({ blackSpotId: 'a', inside: false })),
      { newerIsCurrent: false },
    );

    expect(merged.a?.inside).toBe(true);
  });

  it('normalises "never alerted" on both sides back to null', () => {
    const merged = mergeZoneStates(
      statesOf(state({ blackSpotId: 'a', inside: true })),
      statesOf(state({ blackSpotId: 'a', inside: true })),
    );

    expect(merged.a?.lastAlertedAt).toBeNull();
  });
});

import AsyncStorage from '@react-native-async-storage/async-storage';

import type { ZoneState, ZoneStates } from '@/features/alerts/proximityEngine';
import { PRESENCE_MAX_AGE_MS } from '@/features/alerts/zoneStatePersistence';
import { clearZoneStates, loadZoneStates, saveZoneStates } from '@/features/alerts/zoneStateStore';
import { logger } from '@/utils/logger';

/**
 * The AsyncStorage wrapper around zone state.
 *
 * `zoneStatePersistence.test.ts` already covers what may be trusted and for how
 * long — the encoding and decoding rules, which are pure. This file covers the
 * things only the wrapper can get wrong, and which were previously untested:
 *
 *   - the empty-record removal, which is a **privacy** behaviour rather than an
 *     optimisation;
 *   - the promise that nothing here ever throws, which the background task
 *     depends on and which no pure test can establish;
 *   - the round trip through a real serialisation boundary.
 *
 * The last one matters more than it looks. Both halves can be individually
 * correct while the pair is not: `JSON.stringify` is in this file, `decode` is
 * in the other, and nothing else in the repository puts them together.
 */

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('@/utils/logger', () => ({
  logger: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

const mockedStorage = jest.mocked(AsyncStorage);
const mockedLogger = jest.mocked(logger);

const NOW = 1_800_000_000_000;

/** The key the module owns. Asserted rather than imported: see the test below. */
const STORAGE_KEY = 'alerts.zoneStates.v1';

function zone(overrides: Partial<ZoneState> = {}): ZoneState {
  return { blackSpotId: 'spot-1', inside: true, lastAlertedAt: NOW - 1000, ...overrides };
}

function states(...entries: ZoneState[]): ZoneStates {
  return Object.fromEntries(entries.map((entry) => [entry.blackSpotId, entry]));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedStorage.getItem.mockResolvedValue(null);
  mockedStorage.setItem.mockResolvedValue();
  mockedStorage.removeItem.mockResolvedValue();
});

describe('saveZoneStates', () => {
  // The happy path first: a store that writes nothing passes every test that
  // only asserts what it declines to write.
  it('writes the encoded record', async () => {
    await saveZoneStates(states(zone()), NOW);

    expect(mockedStorage.setItem).toHaveBeenCalledTimes(1);
    const [key, value] = mockedStorage.setItem.mock.calls[0] ?? [];
    expect(key).toBe(STORAGE_KEY);
    expect(JSON.parse(String(value))).toMatchObject({
      version: 1,
      savedAt: NOW,
      states: [expect.objectContaining({ blackSpotId: 'spot-1', inside: true })],
    });
  });

  /**
   * The privacy behaviour, and the reason this is not `setItem` unconditionally.
   *
   * An empty record and no record decode identically, so writing one buys
   * nothing — but it does leave a file on disk saying this device was recently
   * near hazards, for a user who has left every zone. Removal is what stops the
   * record outliving its usefulness.
   */
  it('removes the record rather than writing an empty one', async () => {
    // Neither inside a zone nor carrying a usable alert time: nothing worth
    // keeping, so `encodeZoneStates` yields no entries.
    await saveZoneStates(states(zone({ inside: false, lastAlertedAt: null })), NOW);

    expect(mockedStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    expect(mockedStorage.setItem).not.toHaveBeenCalled();
  });

  it('removes the record when there is no state at all', async () => {
    await saveZoneStates({}, NOW);

    expect(mockedStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
    expect(mockedStorage.setItem).not.toHaveBeenCalled();
  });

  // This runs on the background task's path, where a rejected promise has
  // nowhere to go and would be reported by the OS as a task failure.
  it('does not throw when the write fails', async () => {
    mockedStorage.setItem.mockRejectedValue(new Error('disk full'));

    await expect(saveZoneStates(states(zone()), NOW)).resolves.toBeUndefined();
    expect(mockedLogger.warn).toHaveBeenCalled();
  });

  it('does not throw when the removal fails', async () => {
    mockedStorage.removeItem.mockRejectedValue(new Error('disk full'));

    await expect(saveZoneStates({}, NOW)).resolves.toBeUndefined();
    expect(mockedLogger.warn).toHaveBeenCalled();
  });

  it('falls back to the current time when no clock is given', async () => {
    await saveZoneStates(states(zone({ inside: true })));

    const [, value] = mockedStorage.setItem.mock.calls[0] ?? [];
    // Not asserted to equal any particular instant — only that a real one was
    // stamped, which is what the decoder later measures staleness against.
    expect(JSON.parse(String(value)).savedAt).toBeGreaterThan(0);
  });

  it('logs a usable message when the rejection is not an Error', async () => {
    mockedStorage.setItem.mockRejectedValue('a bare string');

    await saveZoneStates(states(zone()), NOW);

    expect(mockedLogger.warn).toHaveBeenCalledWith(
      'zoneStateStore',
      expect.any(String),
      expect.objectContaining({ error: 'unknown' }),
    );
  });
});

describe('loadZoneStates', () => {
  it('returns the decoded state', async () => {
    mockedStorage.getItem.mockResolvedValue(
      JSON.stringify({ version: 1, savedAt: NOW, states: [zone()] }),
    );

    await expect(loadZoneStates(NOW)).resolves.toEqual({
      'spot-1': expect.objectContaining({ blackSpotId: 'spot-1', inside: true }),
    });
  });

  it('returns nothing when the device has never stored any', async () => {
    mockedStorage.getItem.mockResolvedValue(null);

    await expect(loadZoneStates(NOW)).resolves.toEqual({});
    expect(mockedLogger.warn).not.toHaveBeenCalled();
  });

  /**
   * The clock has to reach the decoder.
   *
   * `decodeZoneStates` expires a stale `inside: true` using this value, and a
   * stale `inside: true` **suppresses** an entry alert. A wrapper that passed
   * its own `Date.now()` — or forgot the argument — would silently swallow a
   * genuine warning, which is the failure mode this whole feature exists to
   * avoid. Nothing about that is visible without asserting it here.
   */
  it('passes the caller’s clock through, so stale presence expires', async () => {
    const savedAt = NOW - PRESENCE_MAX_AGE_MS - 1;
    mockedStorage.getItem.mockResolvedValue(
      JSON.stringify({ version: 1, savedAt, states: [zone({ inside: true })] }),
    );

    const loaded = await loadZoneStates(NOW);

    expect(loaded['spot-1']?.inside).toBe(false);
  });

  it('does not throw when the read fails', async () => {
    mockedStorage.getItem.mockRejectedValue(new Error('unavailable'));

    await expect(loadZoneStates(NOW)).resolves.toEqual({});
    expect(mockedLogger.warn).toHaveBeenCalled();
  });

  // A truncated write, or a value some other version of the app left behind.
  // `JSON.parse` throws on it, and the throw is inside the wrapper's try.
  it('does not throw when the stored value is not JSON', async () => {
    mockedStorage.getItem.mockResolvedValue('{not json');

    await expect(loadZoneStates(NOW)).resolves.toEqual({});
    expect(mockedLogger.warn).toHaveBeenCalled();
  });

  // Valid JSON of the wrong shape reaches the decoder, which rejects it without
  // throwing — so this is the one corrupt case that is *not* a warning.
  it('returns nothing for valid JSON of an unrecognised shape', async () => {
    mockedStorage.getItem.mockResolvedValue(JSON.stringify({ version: 99, states: [] }));

    await expect(loadZoneStates(NOW)).resolves.toEqual({});
  });

  // The default clock. Both call styles exist in the codebase — the background
  // task passes an explicit `now` so its whole evaluation shares one instant,
  // while foreground callers do not — so the default is a real path, not a
  // convenience nobody uses.
  it('falls back to the current time when no clock is given', async () => {
    mockedStorage.getItem.mockResolvedValue(
      JSON.stringify({ version: 1, savedAt: Date.now(), states: [zone({ inside: true })] }),
    );

    const loaded = await loadZoneStates();

    // Saved just now, so presence has not expired.
    expect(loaded['spot-1']?.inside).toBe(true);
  });

  // The `: 'unknown'` half of the log's error ternary. A rejection that is not
  // an `Error` — which a native module bridge does produce — must not put
  // `undefined` in the log line that is the only record of the failure.
  it('logs a usable message when the rejection is not an Error', async () => {
    mockedStorage.getItem.mockRejectedValue('a bare string');

    await expect(loadZoneStates(NOW)).resolves.toEqual({});
    expect(mockedLogger.warn).toHaveBeenCalledWith(
      'zoneStateStore',
      expect.any(String),
      expect.objectContaining({ error: 'unknown' }),
    );
  });
});

describe('clearZoneStates', () => {
  it('removes the record', async () => {
    await clearZoneStates();

    expect(mockedStorage.removeItem).toHaveBeenCalledWith(STORAGE_KEY);
  });

  // Called during sign-out, where throwing would abort the rest of the cleanup
  // and leave another account's drafts and preferences on the device.
  it('does not throw when removal fails', async () => {
    mockedStorage.removeItem.mockRejectedValue(new Error('unavailable'));

    await expect(clearZoneStates()).resolves.toBeUndefined();
  });
});

describe('the round trip', () => {
  /**
   * Save and load against one in-memory store.
   *
   * Encoding and decoding are tested separately and pass separately; this is the
   * only place the two meet across `JSON.stringify`/`JSON.parse`. A field the
   * encoder emits that the decoder discards would satisfy both suites and lose
   * the state in production.
   */
  function inMemoryStorage(): void {
    const store = new Map<string, string>();
    mockedStorage.setItem.mockImplementation(async (key, value) => {
      store.set(key, value);
    });
    mockedStorage.getItem.mockImplementation(async (key) => store.get(key) ?? null);
    mockedStorage.removeItem.mockImplementation(async (key) => {
      store.delete(key);
    });
  }

  it('restores what it saved', async () => {
    inMemoryStorage();
    const original = states(
      zone({ blackSpotId: 'inside-now', inside: true, lastAlertedAt: NOW - 60_000 }),
      zone({ blackSpotId: 'alerted-recently', inside: false, lastAlertedAt: NOW - 120_000 }),
    );

    await saveZoneStates(original, NOW);
    const restored = await loadZoneStates(NOW);

    expect(restored).toEqual({
      'inside-now': { blackSpotId: 'inside-now', inside: true, lastAlertedAt: NOW - 60_000 },
      'alerted-recently': {
        blackSpotId: 'alerted-recently',
        inside: false,
        lastAlertedAt: NOW - 120_000,
      },
    });
  });

  // Sign-out must not leave the previous account's movements readable.
  it('leaves nothing behind after a clear', async () => {
    inMemoryStorage();
    await saveZoneStates(states(zone()), NOW);

    await clearZoneStates();

    await expect(loadZoneStates(NOW)).resolves.toEqual({});
  });
});

describe('the storage key', () => {
  /**
   * Pinned deliberately.
   *
   * The key is versioned and private to the module, so this is not testing an
   * API — it is making a rename visible. Changing it silently orphans the state
   * on every existing install, and the symptom is one duplicate warning per
   * user, once, which nobody would trace back to a renamed constant.
   */
  it('is the versioned key existing installs already use', async () => {
    await saveZoneStates(states(zone()), NOW);

    expect(mockedStorage.setItem).toHaveBeenCalledWith('alerts.zoneStates.v1', expect.any(String));
  });
});

import type { ZoneState, ZoneStates } from '@/features/alerts/proximityEngine';

/**
 * Serialising the proximity engine's zone state so it survives an app restart.
 *
 * Pure by design, in the same spirit as `proximityEngine` itself: this decides
 * *what is safe to remember*, and that decision is safety-relevant enough to be
 * testable without a device or a storage backend. `zoneStateStore` is the thin
 * AsyncStorage wrapper around it.
 *
 * ## The problem this solves, and the one it must not create
 *
 * Zone state used to live only in a ref, so force-quitting the app while inside
 * a zone lost the "already warned about this" memory: returning to the same spot
 * produced a second identical warning for a hazard the user had just been told
 * about. Warnings that repeat for no reason are the fastest way to teach someone
 * to ignore them.
 *
 * The obvious fix — write the state to disk and read it back verbatim — creates
 * a much worse failure in the opposite direction. `inside: true` **suppresses**
 * the entry alert, because the engine only alerts on a boundary crossing. A
 * stale `inside: true` restored from three days ago would silently swallow a
 * genuine warning. A duplicate warning is an annoyance; a missing one is the
 * thing this whole app exists to prevent.
 *
 * So the two fields are treated differently, according to which way each one can
 * fail:
 *
 *   - `inside` can only ever suppress, so it expires quickly
 *     (`PRESENCE_MAX_AGE_MS`) and is forced to `false` once stale.
 *   - `lastAlertedAt` is bounded by the engine's own cooldown — after the
 *     cooldown elapses it stops having any effect at all — so it is safe to keep
 *     for as long as the record itself is kept.
 */

/** Bumped whenever the stored shape changes; an unrecognised version is discarded. */
export const ZONE_STATE_SCHEMA_VERSION = 1;

/**
 * How long a persisted `inside: true` may keep suppressing an entry alert, in
 * milliseconds.
 *
 * Fifteen minutes: comfortably longer than the engine's ten-minute cooldown, so
 * a genuine relaunch-in-place is covered end to end, and short enough that a
 * user who drove away with the app closed is warned again when they come back.
 */
export const PRESENCE_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * How long the record is kept at all, in milliseconds.
 *
 * Past this the whole thing is discarded rather than partially trusted. Nothing
 * in it is useful a day later, and it is one less piece of movement-shaped data
 * sitting on disk than it needs to be.
 */
export const RECORD_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Upper bound on persisted entries.
 *
 * A long journey passes many zones, and the engine's own pruning only runs while
 * the app is alive. Bounding it here means a background task that is killed
 * mid-write cannot leave an unboundedly large blob behind.
 */
export const MAX_PERSISTED_ZONES = 100;

export interface PersistedZoneStates {
  version: typeof ZONE_STATE_SCHEMA_VERSION;
  /** Epoch ms at which this snapshot was taken. */
  savedAt: number;
  states: ZoneState[];
}

/**
 * Reduce live zone state to what is worth writing.
 *
 * Entries that are neither inside a zone nor carrying a recent alert time say
 * nothing — restoring them changes no decision — so they are dropped rather than
 * stored. When the cap still bites, presence is kept in preference to alert
 * history, because losing `inside` risks a duplicate warning whereas losing
 * `lastAlertedAt` only costs the cooldown.
 */
export function encodeZoneStates(states: ZoneStates, now: number): PersistedZoneStates {
  const meaningful = Object.values(states).filter(
    (state) =>
      state.inside ||
      (state.lastAlertedAt !== null && now - state.lastAlertedAt <= RECORD_MAX_AGE_MS),
  );

  const ranked = [...meaningful].sort((a, b) => {
    if (a.inside !== b.inside) {
      return a.inside ? -1 : 1;
    }
    return (b.lastAlertedAt ?? 0) - (a.lastAlertedAt ?? 0);
  });

  return {
    version: ZONE_STATE_SCHEMA_VERSION,
    savedAt: now,
    states: ranked.slice(0, MAX_PERSISTED_ZONES),
  };
}

function isZoneState(value: unknown): value is ZoneState {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.blackSpotId === 'string' &&
    candidate.blackSpotId.length > 0 &&
    typeof candidate.inside === 'boolean' &&
    (candidate.lastAlertedAt === null || typeof candidate.lastAlertedAt === 'number')
  );
}

/**
 * Rebuild zone state from whatever was on disk.
 *
 * Returns an empty object for anything it cannot fully trust — a missing record,
 * a different schema version, a truncated write, a payload from a future version
 * of the app. Starting from nothing costs at most one duplicate warning; acting
 * on a half-understood payload could cost a real one.
 */
export function decodeZoneStates(raw: unknown, now: number): ZoneStates {
  if (typeof raw !== 'object' || raw === null) {
    return {};
  }

  const record = raw as Partial<PersistedZoneStates>;
  if (record.version !== ZONE_STATE_SCHEMA_VERSION || !Array.isArray(record.states)) {
    return {};
  }

  const savedAt = record.savedAt;
  if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) {
    return {};
  }

  // A negative age means the device clock moved backwards — a timezone-less
  // manual change, or a reboot before NTP. The elapsed time is unknowable, so it
  // is treated as maximally stale rather than as "no time has passed": that
  // errs towards warning again, which is the survivable direction.
  const age = now - savedAt;
  if (age > RECORD_MAX_AGE_MS || age < 0) {
    return {};
  }

  const presenceExpired = age > PRESENCE_MAX_AGE_MS;

  const restored: Record<string, ZoneState> = {};
  for (const candidate of record.states.slice(0, MAX_PERSISTED_ZONES)) {
    if (!isZoneState(candidate)) {
      continue;
    }

    // An alert time in the future would suppress warnings until the clock caught
    // up with it, so it is dropped rather than trusted.
    const lastAlertedAt =
      candidate.lastAlertedAt !== null && candidate.lastAlertedAt <= now
        ? candidate.lastAlertedAt
        : null;

    const inside = presenceExpired ? false : candidate.inside;

    // Once presence has expired, an entry with no usable alert time carries no
    // information at all.
    if (!inside && lastAlertedAt === null) {
      continue;
    }

    restored[candidate.blackSpotId] = {
      blackSpotId: candidate.blackSpotId,
      inside,
      lastAlertedAt,
    };
  }

  return restored;
}

/**
 * Merge state observed in the background into the state the foreground holds.
 *
 * Both run the same engine against the same spots but on their own schedules, so
 * whichever wrote last is not necessarily the one that knows more. Merging per
 * field rather than per record keeps the safest reading of each:
 *
 *   - the later `lastAlertedAt` wins, so an alert delivered by either side
 *     silences the other for the cooldown;
 *   - `inside` comes from whichever snapshot is newer, because presence is a
 *     statement about *now* and the older one is simply out of date.
 */
export function mergeZoneStates(
  older: ZoneStates,
  newer: ZoneStates,
  options: { newerIsCurrent: boolean } = { newerIsCurrent: true },
): ZoneStates {
  const merged: Record<string, ZoneState> = {};

  for (const id of new Set([...Object.keys(older), ...Object.keys(newer)])) {
    const a = older[id];
    const b = newer[id];

    if (a === undefined) {
      if (b !== undefined) {
        merged[id] = b;
      }
      continue;
    }
    if (b === undefined) {
      merged[id] = a;
      continue;
    }

    merged[id] = {
      blackSpotId: id,
      inside: options.newerIsCurrent ? b.inside : a.inside,
      lastAlertedAt: Math.max(a.lastAlertedAt ?? 0, b.lastAlertedAt ?? 0) || null,
    };
  }

  return merged;
}

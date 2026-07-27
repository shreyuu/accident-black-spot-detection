import type { BlackSpot, RiskLevel } from '@/types/domain';
import { RISK_LEVEL_WEIGHT } from '@/types/domain';
import { formatDistance, haversineDistanceM, type Coordinates } from '@/utils/geo';

/**
 * Proximity alert decision logic.
 *
 * This module is the safety-critical core of the app and is deliberately
 * **pure**: no React, no Firebase, no timers, no I/O. `evaluateProximity` takes
 * the current position, the known black spots, the previous zone states and the
 * current time, and returns the next states plus any alerts to raise. Every
 * decision is therefore reproducible and exhaustively testable, and a bug can be
 * demonstrated with a plain object rather than by driving a device around.
 *
 * The behaviour it guarantees, in the project's terms:
 *
 *   - entering a zone raises exactly one alert;
 *   - staying inside raises none, however many GPS updates arrive;
 *   - leaving requires clearing the radius **plus a buffer** before another
 *     alert is possible, so a user parked on the boundary is not alerted
 *     repeatedly as GPS noise jitters them in and out;
 *   - a time cooldown applies on top of that, as a second independent guard;
 *   - overlapping zones produce one combined warning, not a burst.
 */

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

export interface ProximityConfig {
  /**
   * The user's chosen alert distance, in metres.
   *
   * A spot's own radius is used unless this is smaller — a user who asked to be
   * warned no further than 200 m away should not get a 2 km warning.
   */
  userAlertRadiusM: number;
  /**
   * Extra distance beyond the radius that must be cleared before the zone is
   * considered exited, in metres.
   *
   * This is hysteresis, and it is what makes the difference between a usable app
   * and an unusable one. Consumer GPS drifts by tens of metres even when
   * stationary; without a buffer, someone stopped at a junction on the zone
   * boundary would be alerted over and over as the reported position crossed
   * back and forth.
   */
  exitBufferM: number;
  /** Minimum time between two alerts for the same spot, in milliseconds. */
  cooldownMs: number;
  /** Maximum alerts raised from a single evaluation. */
  maxAlertsPerEvaluation: number;
}

export const DEFAULT_PROXIMITY_CONFIG: Omit<ProximityConfig, 'userAlertRadiusM'> = {
  // 100 m comfortably exceeds typical urban GPS error without making a genuine
  // re-entry feel unresponsive.
  exitBufferM: 100,
  // 10 minutes. Long enough that circling a block does not re-alert, short
  // enough that a genuine return an hour later still warns.
  cooldownMs: 10 * 60 * 1000,
  // Overlapping zones are combined into one warning; this caps the queue if a
  // user is somehow inside many at once.
  maxAlertsPerEvaluation: 1,
};

// -----------------------------------------------------------------------------
// State
// -----------------------------------------------------------------------------

/**
 * What the engine remembers about one black spot between evaluations.
 *
 * Kept small and serialisable so it can be persisted across app restarts — a
 * user who relaunches the app while still inside a zone must not be re-alerted.
 */
export interface ZoneState {
  blackSpotId: string;
  /** Whether the user was inside the effective radius at the last evaluation. */
  inside: boolean;
  /** Epoch ms of the last alert raised for this spot, or null if never. */
  lastAlertedAt: number | null;
}

export type ZoneStates = Readonly<Record<string, ZoneState>>;

export interface ProximityAlert {
  blackSpot: BlackSpot;
  distanceM: number;
  /** Short, glanceable warning text. */
  message: string;
  /** Other zones entered at the same moment, folded into this one warning. */
  alsoInside: BlackSpot[];
}

export interface ProximityEvaluation {
  nextStates: ZoneStates;
  alerts: ProximityAlert[];
  /** Every spot currently inside range, for the map and banner. */
  insideNow: { spot: BlackSpot; distanceM: number }[];
}

// -----------------------------------------------------------------------------
// Core
// -----------------------------------------------------------------------------

/**
 * The radius actually used for this spot and this user.
 *
 * Exported because the map draws the same circle, and the two must agree — a
 * warning that fires outside the drawn circle would look like a bug and destroy
 * trust in the warnings that matter.
 */
export function effectiveRadiusM(spot: BlackSpot, userAlertRadiusM: number): number {
  return Math.min(spot.radiusM, userAlertRadiusM);
}

/**
 * Below this distance the user is treated as being *at* the location rather than
 * approaching it, in metres.
 *
 * Set at 50 m because that is within typical GPS error — claiming a precise
 * approach distance inside that range would be false precision.
 */
const AT_LOCATION_THRESHOLD_M = 50;

/**
 * Warning text.
 *
 * Deliberately one short sentence: this is read at a glance, possibly by someone
 * driving. It states the hazard, the distance and one action — and never claims
 * the app prevents anything.
 */
export function buildAlertMessage(
  spot: BlackSpot,
  distanceM: number,
  alsoInsideCount: number,
): string {
  const risk =
    spot.riskLevel === 'critical' ? 'Critical-risk' : `${capitalise(spot.riskLevel)}-risk`;
  const place = describeCategory(spot.category);

  // "0 m ahead" is what you get from formatting a distance when the user is
  // already at the centre, and it reads as a mistake. Below the threshold the
  // phrasing switches from approach to presence, which is both accurate and
  // what someone glancing at the screen needs to know.
  const base =
    distanceM < AT_LOCATION_THRESHOLD_M
      ? `You are in a ${risk.toLowerCase()} ${place}. Reduce speed and stay alert.`
      : `${risk} ${place} ${formatDistance(distanceM)} ahead. Reduce speed and stay alert.`;

  if (alsoInsideCount > 0) {
    const others =
      alsoInsideCount === 1 ? '1 other warning zone' : `${alsoInsideCount} other warning zones`;
    return `${base} You are also within ${others}.`;
  }
  return base;
}

function capitalise(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function describeCategory(category: BlackSpot['category']): string {
  switch (category) {
    case 'accident':
      return 'accident area';
    case 'crime':
      return 'area';
    case 'unsafe-road':
      return 'road hazard';
    case 'mixed':
      return 'area';
  }
}

/** Higher sorts first: critical before high, then nearer before further. */
function comparePriority(
  a: { spot: BlackSpot; distanceM: number },
  b: { spot: BlackSpot; distanceM: number },
): number {
  const riskDelta = RISK_LEVEL_WEIGHT[b.spot.riskLevel] - RISK_LEVEL_WEIGHT[a.spot.riskLevel];
  if (riskDelta !== 0) {
    return riskDelta;
  }
  return a.distanceM - b.distanceM;
}

export interface EvaluateProximityInput {
  location: Coordinates;
  spots: readonly BlackSpot[];
  states: ZoneStates;
  /** Epoch ms. Injected rather than read from the clock, so tests are exact. */
  now: number;
  config: ProximityConfig;
  /** When false, state is still tracked but no alert is ever raised. */
  alertsEnabled: boolean;
}

/**
 * Decide which alerts, if any, the user should receive right now.
 *
 * State is always advanced, even when `alertsEnabled` is false. That matters:
 * a user who re-enables alerts while sitting inside a zone should not be
 * immediately warned about a place they have been parked at for an hour.
 */
export function evaluateProximity(input: EvaluateProximityInput): ProximityEvaluation {
  const { location, spots, states, now, config, alertsEnabled } = input;

  const nextStates: Record<string, ZoneState> = {};
  const insideNow: { spot: BlackSpot; distanceM: number }[] = [];
  const newlyEntered: { spot: BlackSpot; distanceM: number }[] = [];

  for (const spot of spots) {
    const distanceM = haversineDistanceM(location, spot);
    const radius = effectiveRadiusM(spot, config.userAlertRadiusM);
    const previous = states[spot.id];
    const wasInside = previous?.inside ?? false;

    // Asymmetric thresholds are the hysteresis: you become "inside" at the
    // radius, but only become "outside" again past radius + buffer.
    const isInside = wasInside ? distanceM <= radius + config.exitBufferM : distanceM <= radius;

    if (isInside) {
      insideNow.push({ spot, distanceM });
    }

    const crossedIn = isInside && !wasInside;
    const lastAlertedAt = previous?.lastAlertedAt ?? null;

    // The cooldown is a second, independent guard. Hysteresis alone can be
    // defeated by a genuine large loop; the cooldown catches that case.
    const cooldownElapsed = lastAlertedAt === null || now - lastAlertedAt >= config.cooldownMs;

    const shouldAlert = alertsEnabled && crossedIn && cooldownElapsed;

    if (shouldAlert) {
      newlyEntered.push({ spot, distanceM });
    }

    nextStates[spot.id] = {
      blackSpotId: spot.id,
      inside: isInside,
      lastAlertedAt: shouldAlert ? now : lastAlertedAt,
    };
  }

  // Spots that are no longer in range at all — the user has moved away, or the
  // record was deactivated — are dropped so the state object cannot grow without
  // bound over a long journey.
  for (const [id, state] of Object.entries(states)) {
    if (nextStates[id] === undefined && state.inside) {
      // Retained only while still marked inside, so a spot that scrolls out of
      // the query window mid-visit is not treated as a fresh entry on return.
      nextStates[id] = { ...state, inside: false };
    }
  }

  const prioritised = [...newlyEntered].sort(comparePriority);
  const selected = prioritised.slice(0, config.maxAlertsPerEvaluation);

  const alerts: ProximityAlert[] = selected.map((entry) => {
    // Everything else entered at this moment is folded into the one warning
    // rather than fired as a burst of separate alerts.
    const others = prioritised.filter((candidate) => candidate.spot.id !== entry.spot.id);
    return {
      blackSpot: entry.spot,
      distanceM: entry.distanceM,
      message: buildAlertMessage(entry.spot, entry.distanceM, others.length),
      alsoInside: others.map((candidate) => candidate.spot),
    };
  });

  return { nextStates, alerts, insideNow: insideNow.sort(comparePriority) };
}

/** Highest-priority zone the user is currently inside, for the banner. */
export function highestPriorityInside(
  insideNow: readonly { spot: BlackSpot; distanceM: number }[],
): { spot: BlackSpot; distanceM: number } | null {
  return insideNow.length === 0 ? null : ([...insideNow].sort(comparePriority)[0] ?? null);
}

/** Risk levels that justify interrupting the user. Used by Phase 8 background work. */
export const INTERRUPTING_RISK_LEVELS: readonly RiskLevel[] = ['high', 'critical'];

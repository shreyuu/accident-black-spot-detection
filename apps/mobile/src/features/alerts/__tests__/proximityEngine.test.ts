import {
  buildAlertMessage,
  DEFAULT_PROXIMITY_CONFIG,
  effectiveRadiusM,
  evaluateProximity,
  highestPriorityInside,
  type ProximityConfig,
  type ZoneStates,
} from '@/features/alerts/proximityEngine';
import type { BlackSpot, RiskLevel } from '@/types/domain';
import { destinationPoint, type Coordinates } from '@/utils/geo';

/**
 * These tests are the specification for the app's core safety behaviour.
 *
 * Each one states the user-visible promise it protects, because a future change
 * that breaks any of them turns a useful warning system into either a silent one
 * or an unusable, spammy one.
 */

const ORIGIN: Coordinates = { latitude: 51.5074, longitude: -0.1278 };
const MINUTE = 60_000;

function makeSpot(overrides: Partial<BlackSpot> & { id: string }): BlackSpot {
  return {
    name: `Spot ${overrides.id}`,
    category: 'accident',
    latitude: ORIGIN.latitude,
    longitude: ORIGIN.longitude,
    geohash: 'gcpvj',
    radiusM: 300,
    riskLevel: 'high',
    severityScore: 50,
    accidentCount: 1,
    crimeCount: 0,
    reportCount: 1,
    verified: true,
    active: true,
    source: 'manual',
    createdBy: 'admin',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

/** A spot whose centre sits `distanceM` due north of ORIGIN. */
function spotAtDistance(
  id: string,
  distanceM: number,
  overrides: Partial<BlackSpot> = {},
): BlackSpot {
  const { latitude, longitude } = destinationPoint(ORIGIN, 0, distanceM);
  return makeSpot({ id, latitude, longitude, ...overrides });
}

function config(overrides: Partial<ProximityConfig> = {}): ProximityConfig {
  return { ...DEFAULT_PROXIMITY_CONFIG, userAlertRadiusM: 1000, ...overrides };
}

function evaluate(
  spots: BlackSpot[],
  states: ZoneStates,
  now: number,
  overrides: Partial<ProximityConfig> = {},
  alertsEnabled = true,
) {
  return evaluateProximity({
    location: ORIGIN,
    spots,
    states,
    now,
    config: config(overrides),
    alertsEnabled,
  });
}

// -----------------------------------------------------------------------------

describe('effectiveRadiusM', () => {
  it("uses the spot's own radius when the user's setting is wider", () => {
    expect(effectiveRadiusM(makeSpot({ id: 'a', radiusM: 300 }), 1000)).toBe(300);
  });

  /**
   * A user who asked to be warned no further than 200 m away must not receive a
   * 2 km warning.
   */
  it("narrows to the user's setting when that is smaller", () => {
    expect(effectiveRadiusM(makeSpot({ id: 'a', radiusM: 2000 }), 200)).toBe(200);
  });
});

// -----------------------------------------------------------------------------

describe('entering a zone', () => {
  it('raises exactly one alert on entry', () => {
    const spot = spotAtDistance('a', 100, { radiusM: 300 });

    const result = evaluate([spot], {}, 0);

    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]?.blackSpot.id).toBe('a');
    expect(result.nextStates.a?.inside).toBe(true);
    expect(result.nextStates.a?.lastAlertedAt).toBe(0);
  });

  it('raises nothing when the user is outside the radius', () => {
    const spot = spotAtDistance('a', 500, { radiusM: 300 });

    const result = evaluate([spot], {}, 0);

    expect(result.alerts).toHaveLength(0);
    expect(result.nextStates.a?.inside).toBe(false);
    expect(result.insideNow).toHaveLength(0);
  });

  /**
   * The boundary is asserted a metre either side rather than exactly on it.
   *
   * Projecting a point 300 m away and measuring it back returns 300.000000000652
   * — 0.65 nanometres of floating-point round-trip error across two trigonometric
   * conversions. Asserting exact equality there tests IEEE-754 rounding, not the
   * engine, and GPS is accurate to metres at best, so a sub-nanometre
   * distinction has no physical meaning.
   */
  it('alerts just inside the radius and stays silent just outside it', () => {
    const justInside = evaluate([spotAtDistance('a', 299, { radiusM: 300 })], {}, 0);
    expect(justInside.alerts).toHaveLength(1);

    const justOutside = evaluate([spotAtDistance('a', 301, { radiusM: 300 })], {}, 0);
    expect(justOutside.alerts).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------

describe('remaining inside a zone', () => {
  /**
   * The single most important property. A GPS stream delivers a position every
   * few seconds; without this the user would be alerted continuously for as long
   * as they stayed in the area, and would disable alerts entirely.
   */
  it('does not re-alert on repeated updates while inside', () => {
    const spot = spotAtDistance('a', 100, { radiusM: 300 });

    let states: ZoneStates = {};
    let totalAlerts = 0;

    for (let tick = 0; tick < 50; tick += 1) {
      const result = evaluate([spot], states, tick * 5000);
      totalAlerts += result.alerts.length;
      states = result.nextStates;
    }

    expect(totalAlerts).toBe(1);
  });

  it('keeps reporting the zone as currently inside, for the banner', () => {
    const spot = spotAtDistance('a', 100, { radiusM: 300 });

    const first = evaluate([spot], {}, 0);
    const second = evaluate([spot], first.nextStates, 30_000);

    expect(second.alerts).toHaveLength(0);
    expect(second.insideNow).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------------

describe('exit hysteresis', () => {
  /**
   * Consumer GPS drifts by tens of metres even when stationary. Without an exit
   * buffer, someone stopped at a junction on the zone boundary would be alerted
   * repeatedly as their reported position crossed back and forth.
   */
  it('does not treat a position just past the radius as an exit', () => {
    const spot = spotAtDistance('a', 350, { radiusM: 300 });
    const inside: ZoneStates = { a: { blackSpotId: 'a', inside: true, lastAlertedAt: 0 } };

    const result = evaluate([spot], inside, MINUTE, { exitBufferM: 100 });

    // 350 m is past the 300 m radius but inside radius + buffer, so still inside.
    expect(result.nextStates.a?.inside).toBe(true);
    expect(result.alerts).toHaveLength(0);
  });

  it('registers an exit once the radius plus buffer is cleared', () => {
    const spot = spotAtDistance('a', 450, { radiusM: 300 });
    const inside: ZoneStates = { a: { blackSpotId: 'a', inside: true, lastAlertedAt: 0 } };

    const result = evaluate([spot], inside, MINUTE, { exitBufferM: 100 });

    expect(result.nextStates.a?.inside).toBe(false);
  });

  it('alerts again on a genuine re-entry after a full exit', () => {
    const near = spotAtDistance('a', 100, { radiusM: 300 });
    const far = spotAtDistance('a', 500, { radiusM: 300 });

    const entry = evaluate([near], {}, 0);
    expect(entry.alerts).toHaveLength(1);

    const exit = evaluate([far], entry.nextStates, 30 * MINUTE, { exitBufferM: 100 });
    expect(exit.nextStates.a?.inside).toBe(false);

    const reentry = evaluate([near], exit.nextStates, 60 * MINUTE, { exitBufferM: 100 });
    expect(reentry.alerts).toHaveLength(1);
  });

  /**
   * Simulates standing on the boundary with GPS noise pushing the reading back
   * and forth. This is the scenario the buffer exists for.
   */
  it('survives boundary jitter without repeat alerts', () => {
    const readings = [290, 310, 295, 320, 305, 315, 298, 330, 301, 340];
    let states: ZoneStates = {};
    let totalAlerts = 0;

    readings.forEach((distance, index) => {
      const spot = spotAtDistance('a', distance, { radiusM: 300 });
      const result = evaluate([spot], states, index * 5000, { exitBufferM: 100 });
      totalAlerts += result.alerts.length;
      states = result.nextStates;
    });

    expect(totalAlerts).toBe(1);
  });
});

// -----------------------------------------------------------------------------

describe('cooldown', () => {
  /**
   * A second, independent guard. Hysteresis can be defeated by a genuine large
   * loop — driving around a block, say — and the cooldown catches that.
   */
  it('suppresses a re-entry alert that arrives inside the cooldown window', () => {
    const near = spotAtDistance('a', 100, { radiusM: 300 });
    const far = spotAtDistance('a', 600, { radiusM: 300 });
    const cooldownMs = 10 * MINUTE;

    const entry = evaluate([near], {}, 0, { cooldownMs });
    const exit = evaluate([far], entry.nextStates, 2 * MINUTE, { cooldownMs });
    const reentry = evaluate([near], exit.nextStates, 5 * MINUTE, { cooldownMs });

    expect(entry.alerts).toHaveLength(1);
    expect(exit.nextStates.a?.inside).toBe(false);
    expect(reentry.alerts).toHaveLength(0);
    // Still tracked as inside, so the banner can show it.
    expect(reentry.nextStates.a?.inside).toBe(true);
  });

  it('allows the alert once the cooldown has elapsed', () => {
    const near = spotAtDistance('a', 100, { radiusM: 300 });
    const far = spotAtDistance('a', 600, { radiusM: 300 });
    const cooldownMs = 10 * MINUTE;

    const entry = evaluate([near], {}, 0, { cooldownMs });
    const exit = evaluate([far], entry.nextStates, 2 * MINUTE, { cooldownMs });
    const reentry = evaluate([near], exit.nextStates, 15 * MINUTE, { cooldownMs });

    expect(reentry.alerts).toHaveLength(1);
  });

  it('does not advance lastAlertedAt when no alert was raised', () => {
    const spot = spotAtDistance('a', 100, { radiusM: 300 });

    const entry = evaluate([spot], {}, 1000);
    const later = evaluate([spot], entry.nextStates, 5000);

    expect(later.nextStates.a?.lastAlertedAt).toBe(1000);
  });
});

// -----------------------------------------------------------------------------

describe('alerts disabled', () => {
  it('raises no alerts when the user has turned them off', () => {
    const spot = spotAtDistance('a', 100, { radiusM: 300 });

    const result = evaluate([spot], {}, 0, {}, false);

    expect(result.alerts).toHaveLength(0);
  });

  /**
   * State still advances while alerts are off. Otherwise a user who re-enables
   * alerts while parked inside a zone would be warned immediately about a place
   * they have been sitting in for an hour.
   */
  it('still tracks zone state so re-enabling does not fire a stale alert', () => {
    const spot = spotAtDistance('a', 100, { radiusM: 300 });

    const whileOff = evaluate([spot], {}, 0, {}, false);
    expect(whileOff.nextStates.a?.inside).toBe(true);

    const afterEnabling = evaluate([spot], whileOff.nextStates, MINUTE, {}, true);
    expect(afterEnabling.alerts).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------

describe('overlapping zones', () => {
  it('raises one combined warning rather than a burst', () => {
    const spots = [
      spotAtDistance('a', 100, { radiusM: 300, riskLevel: 'medium' }),
      spotAtDistance('b', 120, { radiusM: 300, riskLevel: 'critical' }),
      spotAtDistance('c', 140, { radiusM: 300, riskLevel: 'low' }),
    ];

    const result = evaluate(spots, {}, 0);

    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]?.alsoInside).toHaveLength(2);
  });

  it('leads with the highest-risk zone, not the nearest', () => {
    const spots = [
      spotAtDistance('near-but-low', 50, { radiusM: 300, riskLevel: 'low' }),
      spotAtDistance('far-but-critical', 250, { radiusM: 300, riskLevel: 'critical' }),
    ];

    const result = evaluate(spots, {}, 0);

    expect(result.alerts[0]?.blackSpot.id).toBe('far-but-critical');
  });

  it('breaks a risk tie by distance', () => {
    const spots = [
      spotAtDistance('further', 250, { radiusM: 300, riskLevel: 'high' }),
      spotAtDistance('closer', 80, { radiusM: 300, riskLevel: 'high' }),
    ];

    const result = evaluate(spots, {}, 0);

    expect(result.alerts[0]?.blackSpot.id).toBe('closer');
  });

  it('mentions the other zones in the message', () => {
    const spots = [
      spotAtDistance('a', 100, { radiusM: 300, riskLevel: 'critical' }),
      spotAtDistance('b', 120, { radiusM: 300, riskLevel: 'high' }),
    ];

    const result = evaluate(spots, {}, 0);

    expect(result.alerts[0]?.message).toMatch(/1 other warning zone/);
  });

  it('marks every overlapping zone as inside', () => {
    const spots = [
      spotAtDistance('a', 100, { radiusM: 300 }),
      spotAtDistance('b', 150, { radiusM: 300 }),
    ];

    const result = evaluate(spots, {}, 0);

    expect(result.insideNow).toHaveLength(2);
  });
});

// -----------------------------------------------------------------------------

describe('user alert radius', () => {
  it('does not alert beyond the radius the user chose', () => {
    // The spot would reach 2 km, but the user asked for 200 m.
    const spot = spotAtDistance('a', 500, { radiusM: 2000 });

    const result = evaluate([spot], {}, 0, { userAlertRadiusM: 200 });

    expect(result.alerts).toHaveLength(0);
  });

  it('alerts within the narrower user radius', () => {
    const spot = spotAtDistance('a', 150, { radiusM: 2000 });

    const result = evaluate([spot], {}, 0, { userAlertRadiusM: 200 });

    expect(result.alerts).toHaveLength(1);
  });
});

// -----------------------------------------------------------------------------

describe('state hygiene', () => {
  it('drops state for spots that are no longer nearby and were already outside', () => {
    const spot = spotAtDistance('a', 100, { radiusM: 300 });
    const stale: ZoneStates = {
      gone: { blackSpotId: 'gone', inside: false, lastAlertedAt: 0 },
    };

    const result = evaluate([spot], stale, MINUTE);

    // Otherwise the state object would grow without bound over a long journey.
    expect(result.nextStates.gone).toBeUndefined();
  });

  it('retains state for a spot that vanished while the user was inside it', () => {
    const other = spotAtDistance('other', 900, { radiusM: 300 });
    const stale: ZoneStates = {
      vanished: { blackSpotId: 'vanished', inside: true, lastAlertedAt: 0 },
    };

    const result = evaluate([other], stale, MINUTE);

    // Marked outside rather than forgotten, so returning is not mistaken for a
    // first entry and does not bypass the cooldown.
    expect(result.nextStates.vanished?.inside).toBe(false);
    expect(result.nextStates.vanished?.lastAlertedAt).toBe(0);
  });

  it('is pure — it never mutates the states it was given', () => {
    const spot = spotAtDistance('a', 100, { radiusM: 300 });
    const states: ZoneStates = { a: { blackSpotId: 'a', inside: false, lastAlertedAt: null } };
    const snapshot = JSON.parse(JSON.stringify(states));

    evaluate([spot], states, 0);

    expect(states).toEqual(snapshot);
  });

  it('is deterministic for identical inputs', () => {
    const spots = [spotAtDistance('a', 100), spotAtDistance('b', 200)];

    expect(evaluate(spots, {}, 12_345)).toEqual(evaluate(spots, {}, 12_345));
  });

  it('handles an empty spot list', () => {
    const result = evaluate([], {}, 0);

    expect(result.alerts).toHaveLength(0);
    expect(result.insideNow).toHaveLength(0);
  });
});

// -----------------------------------------------------------------------------

describe('buildAlertMessage', () => {
  it('states hazard, distance and one action, briefly', () => {
    const spot = makeSpot({ id: 'a', riskLevel: 'high', category: 'accident' });

    const message = buildAlertMessage(spot, 420, 0);

    expect(message).toMatch(/High-risk/);
    expect(message).toMatch(/400 m|450 m/);
    expect(message).toMatch(/Reduce speed/);
    // Read at a glance, possibly while driving.
    expect(message.length).toBeLessThan(120);
  });

  /**
   * The app must never imply it prevents anything — see the project's safety
   * rules and src/constants/disclaimer.ts.
   */
  it.each<RiskLevel>(['low', 'medium', 'high', 'critical'])(
    'never promises prevention or safety at %s risk',
    (riskLevel) => {
      const message = buildAlertMessage(makeSpot({ id: 'a', riskLevel }), 200, 0).toLowerCase();

      expect(message).not.toMatch(/\b(prevent|guarantee|safe|avoid the accident|you will)\b/);
    },
  );

  it('covers every category without producing "undefined"', () => {
    for (const category of ['accident', 'crime', 'unsafe-road', 'mixed'] as const) {
      const message = buildAlertMessage(makeSpot({ id: 'a', category }), 200, 0);
      expect(message).not.toMatch(/undefined/);
    }
  });

  it('pluralises the overlap clause correctly', () => {
    const spot = makeSpot({ id: 'a' });

    expect(buildAlertMessage(spot, 200, 1)).toMatch(/1 other warning zone\./);
    expect(buildAlertMessage(spot, 200, 3)).toMatch(/3 other warning zones\./);
  });
});

// -----------------------------------------------------------------------------

describe('highestPriorityInside', () => {
  it('returns null when nothing is in range', () => {
    expect(highestPriorityInside([])).toBeNull();
  });

  it('picks the most severe zone', () => {
    const inside = [
      { spot: makeSpot({ id: 'low', riskLevel: 'low' }), distanceM: 10 },
      { spot: makeSpot({ id: 'critical', riskLevel: 'critical' }), distanceM: 200 },
    ];

    expect(highestPriorityInside(inside)?.spot.id).toBe('critical');
  });
});

describe('message wording when already at the location', () => {
  /**
   * "0 m ahead" is what formatting a near-zero distance produces, and it reads
   * as a bug to anyone glancing at the banner. Inside typical GPS error the
   * phrasing has to switch from approach to presence.
   */
  it('says the user is in the area rather than claiming "0 m ahead"', () => {
    const message = buildAlertMessage(makeSpot({ id: 'a', riskLevel: 'critical' }), 0, 0);

    expect(message).toMatch(/^You are in a critical-risk/);
    expect(message).not.toMatch(/0 m ahead/);
  });

  it('still gives a distance once the user is meaningfully away', () => {
    const message = buildAlertMessage(makeSpot({ id: 'a', riskLevel: 'high' }), 420, 0);

    expect(message).toMatch(/ahead/);
    expect(message).toMatch(/High-risk/);
  });

  it('keeps the overlap clause in the at-location wording', () => {
    const message = buildAlertMessage(makeSpot({ id: 'a' }), 10, 2);

    expect(message).toMatch(/You are in a/);
    expect(message).toMatch(/2 other warning zones/);
  });
});

import {
  decideBackgroundMonitoring,
  isMonitoringActive,
  partitionBackgroundAlerts,
  type BackgroundMonitoringInputs,
} from '@/features/alerts/backgroundMonitoringPolicy';
import type { ProximityAlert } from '@/features/alerts/proximityEngine';
import type { BlackSpot, RiskLevel } from '@/types/domain';

/** Everything permitted and opted in. Each test varies one thing from here. */
function inputs(overrides: Partial<BackgroundMonitoringInputs> = {}): BackgroundMonitoringInputs {
  return {
    preferenceEnabled: true,
    alertsEnabled: true,
    foregroundPermission: 'granted',
    backgroundPermission: 'granted',
    taskRunning: false,
    platformSupported: true,
    ...overrides,
  };
}

describe('decideBackgroundMonitoring', () => {
  it('starts when everything is opted in and permitted', () => {
    const decision = decideBackgroundMonitoring(inputs());

    expect(decision.action).toBe('start');
    expect(decision.status).toBe('active');
  });

  it('does nothing when it is already running as intended', () => {
    expect(decideBackgroundMonitoring(inputs({ taskRunning: true })).action).toBe('none');
  });

  it('stops a running task the moment the user opts out', () => {
    const decision = decideBackgroundMonitoring(
      inputs({ preferenceEnabled: false, taskRunning: true }),
    );

    expect(decision.action).toBe('stop');
    expect(decision.status).toBe('off');
  });

  it('does not start when the user has not opted in', () => {
    expect(decideBackgroundMonitoring(inputs({ preferenceEnabled: false })).action).toBe('none');
  });

  it('stops when all alerts are switched off, since nothing could be delivered', () => {
    const decision = decideBackgroundMonitoring(
      inputs({ alertsEnabled: false, taskRunning: true }),
    );

    expect(decision.action).toBe('stop');
    expect(decision.status).toBe('alerts-disabled');
  });

  it.each([
    ['undetermined' as const, true],
    ['denied' as const, false],
  ])('asks for foreground access first when it is %s', (foregroundPermission, canRequest) => {
    const decision = decideBackgroundMonitoring(inputs({ foregroundPermission }));

    expect(decision.status).toBe('needs-location-permission');
    expect(decision.canRequestPermission).toBe(canRequest);
  });

  it.each(['undetermined' as const, 'denied' as const])(
    'asks for the background upgrade when it is %s',
    (backgroundPermission) => {
      const decision = decideBackgroundMonitoring(inputs({ backgroundPermission }));

      expect(decision.action).toBe('none');
      expect(decision.status).toBe('needs-background-permission');
      expect(decision.canRequestPermission).toBe(true);
    },
  );

  it.each([
    ['foreground', { foregroundPermission: 'blocked' as const }],
    ['background', { backgroundPermission: 'blocked' as const }],
  ])('routes the user to system settings when %s access is blocked', (_label, overrides) => {
    const decision = decideBackgroundMonitoring(inputs({ ...overrides, taskRunning: true }));

    expect(decision.action).toBe('stop');
    expect(decision.status).toBe('permission-blocked');
    expect(decision.canRequestPermission).toBe(false);
  });

  it('stops on a platform that cannot support it', () => {
    const decision = decideBackgroundMonitoring(
      inputs({ platformSupported: false, taskRunning: true }),
    );

    expect(decision.action).toBe('stop');
    expect(decision.status).toBe('unsupported');
  });

  it('never leaves a task running once any precondition is gone', () => {
    const revocations: Partial<BackgroundMonitoringInputs>[] = [
      { preferenceEnabled: false },
      { alertsEnabled: false },
      { foregroundPermission: 'denied' },
      { foregroundPermission: 'blocked' },
      { backgroundPermission: 'denied' },
      { backgroundPermission: 'blocked' },
      { platformSupported: false },
    ];

    for (const revocation of revocations) {
      expect(decideBackgroundMonitoring(inputs({ ...revocation, taskRunning: true })).action).toBe(
        'stop',
      );
    }
  });

  it('never claims monitoring is continuous or guaranteed', () => {
    const forbidden = /\b(continuous|guarantee|guaranteed|always on|never miss|constant)\b/i;

    const permutations: Partial<BackgroundMonitoringInputs>[] = [
      {},
      { preferenceEnabled: false },
      { alertsEnabled: false },
      { foregroundPermission: 'undetermined' },
      { backgroundPermission: 'denied' },
      { backgroundPermission: 'blocked' },
      { platformSupported: false },
    ];

    for (const overrides of permutations) {
      expect(decideBackgroundMonitoring(inputs(overrides)).message).not.toMatch(forbidden);
    }
  });

  it('tells the user that background warnings can be delayed or missed', () => {
    expect(decideBackgroundMonitoring(inputs()).message).toMatch(/delayed or missed/i);
  });
});

describe('isMonitoringActive', () => {
  it('is true only for the active status', () => {
    expect(isMonitoringActive('active')).toBe(true);
    expect(isMonitoringActive('off')).toBe(false);
    expect(isMonitoringActive('needs-background-permission')).toBe(false);
  });
});

describe('partitionBackgroundAlerts', () => {
  function alertOf(id: string, riskLevel: RiskLevel): ProximityAlert {
    return {
      blackSpot: { id, riskLevel } as BlackSpot,
      distanceM: 100,
      message: 'test',
      alsoInside: [],
    };
  }

  it.each(['high' as const, 'critical' as const])(
    'delivers a %s-risk alert in the background',
    (riskLevel) => {
      const { deliver, withheld } = partitionBackgroundAlerts([alertOf('a', riskLevel)]);

      expect(deliver).toHaveLength(1);
      expect(withheld).toHaveLength(0);
    },
  );

  it.each(['low' as const, 'medium' as const])('withholds a %s-risk alert', (riskLevel) => {
    const { deliver, withheld } = partitionBackgroundAlerts([alertOf('a', riskLevel)]);

    expect(deliver).toHaveLength(0);
    expect(withheld).toHaveLength(1);
  });

  it('keeps every alert accounted for', () => {
    const alerts = [
      alertOf('a', 'low'),
      alertOf('b', 'critical'),
      alertOf('c', 'medium'),
      alertOf('d', 'high'),
    ];

    const { deliver, withheld } = partitionBackgroundAlerts(alerts);

    expect([...deliver, ...withheld]).toHaveLength(alerts.length);
    expect(deliver.map((alert) => alert.blackSpot.id)).toEqual(['b', 'd']);
  });

  it('honours an explicit set of interrupting levels', () => {
    const { deliver } = partitionBackgroundAlerts([alertOf('a', 'low')], ['low']);

    expect(deliver).toHaveLength(1);
  });

  it('returns empty partitions for no alerts', () => {
    expect(partitionBackgroundAlerts([])).toEqual({ deliver: [], withheld: [] });
  });
});

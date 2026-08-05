import { fireEvent, screen } from '@testing-library/react-native';

import { ProximityAlertBanner } from '@/features/alerts/ProximityAlertBanner';
import { buildAlertMessage, type ProximityAlert } from '@/features/alerts/proximityEngine';
import { renderWithProviders } from '@/test-utils/render';
import { RISK_LEVEL_LABELS, type BlackSpot, type RiskLevel } from '@/types/domain';

/**
 * The in-app proximity warning, as rendered.
 *
 * `proximityEngine` decides *whether* to warn and is exhaustively tested on its
 * own. This file covers the other half — whether the warning a user actually
 * sees says the right thing — which had no coverage before Phase 13 and had
 * never been observed on a device either.
 *
 * The assertions are mostly about the project's safety rules rather than about
 * layout, because those are the properties whose loss would be harmful rather
 * than merely ugly: risk is never signalled by colour alone, the warning never
 * predicts an accident, overlapping zones fold into one banner, and dismissal is
 * deliberate rather than incidental.
 *
 * Note that each risk level gets its own `it.each` case rather than a loop with
 * `screen.unmount()` inside it. Unmounting mid-test detaches `screen` for
 * everything that follows in the file, and the resulting failures then point at
 * innocent tests — which cost real time to work out the first time.
 */

function blackSpot(overrides: Partial<BlackSpot> = {}): BlackSpot {
  return {
    id: 'spot-1',
    name: 'School bend',
    category: 'accident',
    latitude: 51.5074,
    longitude: -0.1278,
    geohash: 'gcpvj0duq5',
    radiusM: 300,
    riskLevel: 'high',
    severityScore: 60,
    accidentCount: 3,
    crimeCount: 0,
    reportCount: 2,
    verified: true,
    active: true,
    source: 'manual',
    createdAt: null,
    updatedAt: null,
    ...overrides,
  } as BlackSpot;
}

/**
 * A real alert, with its message built by the engine rather than hand-written.
 *
 * `buildAlertMessage` produces the sentence the user reads, so inventing a
 * `message` here would test this file's imagination instead of the app.
 */
function alert(overrides: Partial<ProximityAlert> = {}): ProximityAlert {
  const spot = overrides.blackSpot ?? blackSpot();
  const distanceM = overrides.distanceM ?? 250;
  const alsoInside = overrides.alsoInside ?? [];

  return {
    blackSpot: spot,
    distanceM,
    alsoInside,
    message: buildAlertMessage(spot, distanceM, alsoInside.length),
    ...overrides,
  };
}

async function renderBanner(proximityAlert: ProximityAlert = alert()) {
  const onDismiss = jest.fn();
  const onOpenDetail = jest.fn();

  await renderWithProviders(
    <ProximityAlertBanner
      alert={proximityAlert}
      onDismiss={onDismiss}
      onOpenDetail={onOpenDetail}
    />,
  );

  return { onDismiss, onOpenDetail };
}

describe('ProximityAlertBanner', () => {
  it('renders the black spot by name', async () => {
    await renderBanner();

    expect(screen.getByTestId('proximity-alert-banner')).toBeTruthy();
    expect(screen.getByText('School bend')).toBeTruthy();
  });

  it('is announced as an alert to a screen reader', async () => {
    // A warning somebody cannot see must still reach them without waiting for
    // focus to move, which is what the assertive live region is for.
    await renderBanner();

    const banner = screen.getByTestId('proximity-alert-banner');
    expect(banner.props.accessibilityRole).toBe('alert');
    expect(banner.props.accessibilityLiveRegion).toBe('assertive');
  });

  it.each(['low', 'medium', 'high', 'critical'] as RiskLevel[])(
    'names %s risk in words, never by colour alone',
    async (riskLevel) => {
      // The project rule. A colour-only signal is invisible to a colour-blind
      // user and to anyone glancing at a phone in bright sun. The badge shows a
      // short form but carries the full label as its accessibility name.
      await renderBanner(alert({ blackSpot: blackSpot({ riskLevel }) }));

      expect(screen.getByLabelText(RISK_LEVEL_LABELS[riskLevel])).toBeTruthy();
    },
  );

  it('states the distance, so the warning is actionable rather than vague', async () => {
    await renderBanner(alert({ distanceM: 250 }));

    expect(screen.getByText(/250 m ahead/i)).toBeTruthy();
  });

  it('rounds the distance rather than implying a precision GPS does not have', async () => {
    // 180 m is reported as 200 m. Claiming metre-level accuracy from a phone
    // fix would be a small dishonesty repeated on every warning.
    await renderBanner(alert({ distanceM: 180 }));

    expect(screen.getByText(/200 m ahead/i)).toBeTruthy();
  });

  it('switches from approach to presence once the user is at the location', async () => {
    // "0 m ahead" reads as a bug. Below the threshold the phrasing changes.
    await renderBanner(alert({ distanceM: 5 }));

    expect(screen.getByText(/you are in a/i)).toBeTruthy();
    expect(screen.queryByText(/ahead/i)).toBeNull();
  });

  it('tells the user what to do, not merely that something is there', async () => {
    await renderBanner();

    expect(screen.getByText(/reduce speed and stay alert/i)).toBeTruthy();
  });

  it('never claims an accident will happen or that the app prevents one', async () => {
    // The warning reports history. Predicting an accident, or implying the app
    // stops one, are claims this project must never make.
    await renderBanner();

    const rendered = JSON.stringify(screen.toJSON()).toLowerCase();

    for (const forbidden of ['will crash', 'you will have', 'guaranteed', 'prevents', 'safe now']) {
      expect(rendered).not.toContain(forbidden);
    }
  });

  it('folds overlapping zones into one banner rather than stacking them', async () => {
    // Three banners at once is three things to dismiss while driving.
    await renderBanner(
      alert({ alsoInside: [blackSpot({ id: 'spot-2' }), blackSpot({ id: 'spot-3' })] }),
    );

    expect(screen.getAllByTestId('proximity-alert-banner')).toHaveLength(1);
    expect(screen.getByText(/2 other warning zones/i)).toBeTruthy();
  });

  it('dismisses only through its own control, not by tapping the banner', async () => {
    // An accidental swipe or stray tap must not silence a warning the user has
    // not read yet.
    const { onDismiss, onOpenDetail } = await renderBanner();

    fireEvent.press(screen.getByTestId('proximity-alert-banner'));
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Dismiss this warning'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
    expect(onOpenDetail).not.toHaveBeenCalled();
  });

  it('opens the detail for the black spot it is warning about', async () => {
    const spot = blackSpot({ id: 'spot-42', name: 'Mill Lane junction' });
    const { onOpenDetail } = await renderBanner(alert({ blackSpot: spot }));

    fireEvent.press(screen.getByLabelText('See details for Mill Lane junction'));

    expect(onOpenDetail).toHaveBeenCalledWith('spot-42');
  });

  it('gives both controls a touch target large enough to hit in a moving car', async () => {
    await renderBanner();

    for (const label of ['Dismiss this warning', 'See details for School bend']) {
      const style: unknown = screen.getByLabelText(label).props.style;
      const flattened = (Array.isArray(style) ? Object.assign({}, ...style) : style) as {
        minHeight?: number;
      };

      expect(flattened.minHeight).toBeGreaterThanOrEqual(44);
    }
  });
});

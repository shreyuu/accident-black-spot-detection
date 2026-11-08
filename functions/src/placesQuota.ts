/**
 * The per-account allowance on `nearbyPlacesProxy` (SECURITY_AUDIT.md M3).
 *
 * The proxy holds a billable key, and accounts cost nothing to create. Signed-in
 * and verified are not limits: a script with one verified account could still
 * call it in a loop. So each account gets a daily allowance, counted in
 * `placesQuota/{uid}` and written only by the proxy through the Admin SDK.
 *
 * The number is generous for a person — the app caches results on the device
 * and only reaches for Google when the user opens the nearby-help screen — and
 * small for a script. Running out is not an outage: the app treats any proxy
 * failure as "try the next provider" and falls back to OpenStreetMap.
 *
 * Kept pure, like `orphanSweep.ts`, so the decision is tested without Firestore.
 */

export const PLACES_QUOTA = {
  maxPerWindow: 50,
  windowHours: 24,
} as const;

export interface PlacesQuotaState {
  count: number;
  windowStartMs: number;
}

export type PlacesQuotaDecision = { allowed: true; next: PlacesQuotaState } | { allowed: false };

export function evaluatePlacesQuota(
  state: PlacesQuotaState | null,
  nowMs: number,
): PlacesQuotaDecision {
  const windowMs = PLACES_QUOTA.windowHours * 60 * 60 * 1000;

  const usable =
    state !== null &&
    Number.isFinite(state.count) &&
    Number.isFinite(state.windowStartMs) &&
    nowMs - state.windowStartMs < windowMs &&
    // A window that starts in the future is corrupt; start again rather than
    // let it lock the account out until then.
    state.windowStartMs <= nowMs;

  if (!usable) {
    return { allowed: true, next: { count: 1, windowStartMs: nowMs } };
  }

  if (state.count >= PLACES_QUOTA.maxPerWindow) {
    return { allowed: false };
  }

  return { allowed: true, next: { count: state.count + 1, windowStartMs: state.windowStartMs } };
}

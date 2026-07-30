import { redirect } from 'next/navigation';

import {
  BLACK_SPOT_CATEGORIES,
  BLACK_SPOT_RADIUS_BOUNDS_M,
  canManageBlackSpots,
  RISK_LEVELS,
} from '@accident-black-spot-detection/shared-types';

import { ActionForm } from '@/components/ActionForm';
import { createBlackSpot, setBlackSpotActive } from '@/lib/actions';
import { fetchAllBlackSpots } from '@/lib/data';
import { getDashboardActor } from '@/lib/session';

/**
 * Black spot management. Administrators only.
 *
 * This is the screen that actually changes what users are warned about, so it
 * carries the higher bar: a moderator can decide reports but cannot publish. The
 * check is repeated here and in every action, because a server action is a public
 * endpoint and a hidden nav link protects nothing.
 *
 * Withdrawal rather than deletion, throughout — see `setBlackSpotActive`.
 */
export default async function BlackSpotsPage() {
  const actor = await getDashboardActor();
  if (actor === null) {
    return null;
  }

  // A moderator who reaches this URL directly is sent back rather than shown a
  // page whose every control would refuse them.
  if (!canManageBlackSpots(actor.role)) {
    redirect('/reports');
  }

  const spots = await fetchAllBlackSpots();
  const live = spots.filter((spot) => spot.verified && spot.active).length;

  return (
    <>
      <h1>Black spots</h1>
      <p className="muted small">
        {spots.length} records · {live} currently shown to users.
      </p>

      <div className="notice warn">
        Publishing a black spot puts a warning in front of every user who goes near that location.
        Only publish somewhere you have evidence for.
      </div>

      <article className="card">
        <h2>Publish a new black spot</h2>
        <p className="muted small">
          Created as verified and active, because an administrator creating one by hand is the
          verification step. Algorithm-proposed candidates (Phase 10) will arrive unverified and
          need their own approval path.
        </p>

        <ActionForm action={createBlackSpot} submitLabel="Publish black spot">
          <div className="field-row">
            <div>
              <label htmlFor="name">Name</label>
              <input id="name" name="name" required minLength={3} maxLength={120} />
            </div>
            <div>
              <label htmlFor="category">Category</label>
              <select id="category" name="category" defaultValue="accident">
                {BLACK_SPOT_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="riskLevel">Risk level</label>
              <select id="riskLevel" name="riskLevel" defaultValue="medium">
                {RISK_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field-row">
            <div>
              <label htmlFor="latitude">Latitude</label>
              <input id="latitude" name="latitude" type="number" step="any" required />
            </div>
            <div>
              <label htmlFor="longitude">Longitude</label>
              <input id="longitude" name="longitude" type="number" step="any" required />
            </div>
            <div>
              <label htmlFor="radiusM">
                Warning radius (m, {BLACK_SPOT_RADIUS_BOUNDS_M.min}–{BLACK_SPOT_RADIUS_BOUNDS_M.max}
                )
              </label>
              <input
                id="radiusM"
                name="radiusM"
                type="number"
                defaultValue={300}
                min={BLACK_SPOT_RADIUS_BOUNDS_M.min}
                max={BLACK_SPOT_RADIUS_BOUNDS_M.max}
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="description">Description (optional)</label>
            <textarea
              id="description"
              name="description"
              maxLength={2000}
              placeholder="What a driver or pedestrian should watch for here."
            />
          </div>
        </ActionForm>
      </article>

      <h2 style={{ marginTop: '2rem' }}>Existing black spots</h2>

      {spots.length === 0 ? (
        <p className="muted small">None yet.</p>
      ) : (
        spots.map((spot) => (
          <article className="card" key={spot.id}>
            <div className="actions" style={{ justifyContent: 'space-between' }}>
              <h2 style={{ marginBottom: 0 }}>{spot.name}</h2>
              <span className={`badge ${spot.riskLevel}`}>{spot.riskLevel} risk</span>
            </div>

            <p className="muted small">
              {spot.category} · {spot.radiusM} m radius · {spot.latitude.toFixed(5)},{' '}
              {spot.longitude.toFixed(5)} · source {spot.source}
              {' · '}
              {/* Stated in words, not by row colour alone. */}
              <strong>
                {spot.verified && spot.active ? 'shown to users' : 'not shown to users'}
              </strong>
              {spot.verified ? '' : ' (unverified)'}
            </p>

            <ActionForm
              action={setBlackSpotActive}
              submitLabel={spot.active ? 'Withdraw' : 'Restore'}
              submitClassName={spot.active ? 'danger' : 'secondary'}
              confirm={
                spot.active
                  ? `Withdraw "${spot.name}"? Users will stop being warned about it.`
                  : `Restore "${spot.name}"? Users near it will be warned again.`
              }
            >
              <input type="hidden" name="blackSpotId" value={spot.id} />
              <input type="hidden" name="active" value={spot.active ? 'false' : 'true'} />
            </ActionForm>
          </article>
        ))
      )}
    </>
  );
}

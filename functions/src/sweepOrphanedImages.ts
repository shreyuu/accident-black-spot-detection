import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions';

import { COLLECTIONS, REPORT_IMAGES_PREFIX } from './collections.ts';
import { adminBucket, adminFirestore } from './firebaseAdmin.ts';
import { planOrphanSweep, type StorageObjectSummary } from './orphanSweep.ts';

/**
 * Remove uploaded photographs that no report refers to.
 *
 * Which objects qualify — and in particular why nothing recent is ever touched —
 * is in `orphanSweep.ts`, where it is pure and tested. This file gathers the
 * inputs and performs the deletions.
 *
 * ## Why the reference set is built from every report
 *
 * The sweep reads `imageUrls` across the whole collection rather than checking
 * each object against the report it "should" belong to, because there is no link
 * from an object back to a report: the object is uploaded before the report
 * exists, which is the reason orphans occur at all. Building the full set is one
 * pass over a collection this app keeps small, and it fails safe — an object
 * mentioned anywhere is kept.
 *
 * ## Why this deletes nothing on a partial read
 *
 * If the report scan fails half-way, the reference set is incomplete, and an
 * incomplete reference set makes referenced objects look orphaned. The run
 * aborts instead. Deleting nothing is always recoverable; deleting a
 * photograph attached to a report awaiting moderation is not.
 */

/** Daily, well outside typical reporting hours in the deployment's timezone. */
const SCHEDULE = 'every day 03:00';

/** What one sweep did. Returned so a caller can assert on it. */
export interface OrphanSweepOutcome {
  /** Objects examined under the report-images prefix. */
  scanned: number;
  /** Objects kept because some report refers to them. */
  referenced: number;
  /** Objects kept because they are newer than the grace period. */
  withinGracePeriod: number;
  /** Objects actually removed. */
  deleted: number;
  /** True when the run stopped early rather than sweep on partial information. */
  aborted: boolean;
}

/**
 * Perform one sweep.
 *
 * Exported and separated from the trigger for the same reason
 * `handleBackgroundLocations` is separated from `defineTask` in the mobile app:
 * the schedule is the one part that cannot be exercised, so nothing else should
 * be trapped behind it.
 *
 * ## Why this is not driven through the scheduler in tests
 *
 * The obvious alternative was to run the Pub/Sub emulator and publish to the
 * `firebase-schedule-sweepOrphanedImages` topic that `firebase emulators:start`
 * creates. That was tried. The topic and its subscription are created, the
 * message is delivered, the trigger is matched — and firebase-tools 15.2.1 then
 * fails the dispatch with `Unsupported trigger signature: http`, because a v2
 * `onSchedule` function is registered with an HTTP signature the Pub/Sub path
 * does not know how to invoke. There is no working end-to-end route through the
 * scheduler in this version, so adding the Pub/Sub emulator would cost every
 * developer a download and a slower start-up in exchange for nothing.
 *
 * Calling this directly against the emulators tests everything except the cron
 * expression itself, which is a one-line declaration verified by inspection.
 *
 * @param nowMs The instant the sweep is reasoning about. Injectable for the
 *   same reason `handleBackgroundLocations` takes a clock in the mobile app,
 *   and here it is what makes the deletion path reachable at all: an object is
 *   spared for `ORPHAN_GRACE_PERIOD_HOURS` (see `orphanSweep.ts`) after creation,
 *   and a test cannot backdate `timeCreated` in the Storage emulator. Moving the
 *   clock forward is the only way to observe a deletion without sleeping for a
 *   day. Production passes nothing.
 * @returns What the sweep did. `aborted` is the only outcome that deletes
 *   nothing on purpose.
 */
export async function runOrphanSweep(nowMs: number = Date.now()): Promise<OrphanSweepOutcome> {
  const firestore = adminFirestore();

  let referencedUrls: string[];
  try {
    const reports = await firestore.collection(COLLECTIONS.incidentReports).get();
    referencedUrls = reports.docs.flatMap((document) => {
      const urls: unknown = document.get('imageUrls');
      return Array.isArray(urls)
        ? urls.filter((url): url is string => typeof url === 'string')
        : [];
    });
  } catch (error) {
    // See the note above: an incomplete reference set is more dangerous than
    // skipping a run, so this run is skipped.
    logger.error('Orphan sweep aborted: could not build the reference set', { error });
    return { scanned: 0, referenced: 0, withinGracePeriod: 0, deleted: 0, aborted: true };
  }

  const [files] = await adminBucket().getFiles({ prefix: `${REPORT_IMAGES_PREFIX}/` });

  const objects: StorageObjectSummary[] = files.map((file) => ({
    path: file.name,
    // `timeCreated` is RFC 3339. A file with no usable creation time is given
    // "now", which places it inside the grace period and spares it — the safe
    // direction for a value that could not be read.
    createdAtMs: Date.parse(String(file.metadata.timeCreated ?? '')) || nowMs,
  }));

  const plan = planOrphanSweep({ objects, referencedUrls, nowMs });

  let deleted = 0;
  for (const object of plan.orphaned) {
    try {
      await adminBucket().file(object.path).delete({ ignoreNotFound: true });
      deleted += 1;
    } catch (error) {
      // One stubborn object must not abandon the rest of the sweep.
      logger.warn('Could not delete an orphaned object', { path: object.path, error });
    }
  }

  const outcome: OrphanSweepOutcome = {
    scanned: objects.length,
    referenced: plan.referenced.length,
    withinGracePeriod: plan.tooRecent.length,
    deleted,
    aborted: false,
  };

  logger.info('Orphan sweep finished', outcome);
  return outcome;
}

/**
 * The scheduled trigger. A shell around {@link runOrphanSweep} and nothing else,
 * so that everything of substance is reachable from a test.
 */
export const sweepOrphanedImages = onSchedule(
  { schedule: SCHEDULE, timeZone: 'Etc/UTC', timeoutSeconds: 540 },
  async () => {
    await runOrphanSweep();
  },
);

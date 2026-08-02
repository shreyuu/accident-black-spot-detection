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

export const sweepOrphanedImages = onSchedule(
  { schedule: SCHEDULE, timeZone: 'Etc/UTC', timeoutSeconds: 540 },
  async () => {
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
      return;
    }

    const [files] = await adminBucket().getFiles({ prefix: `${REPORT_IMAGES_PREFIX}/` });

    const objects: StorageObjectSummary[] = files.map((file) => ({
      path: file.name,
      // `timeCreated` is RFC 3339. A file with no usable creation time is given
      // "now", which places it inside the grace period and spares it — the safe
      // direction for a value that could not be read.
      createdAtMs: Date.parse(String(file.metadata.timeCreated ?? '')) || Date.now(),
    }));

    const plan = planOrphanSweep({ objects, referencedUrls, nowMs: Date.now() });

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

    logger.info('Orphan sweep finished', {
      scanned: objects.length,
      referenced: plan.referenced.length,
      withinGracePeriod: plan.tooRecent.length,
      deleted,
    });
  },
);

import { addDoc, collection, serverTimestamp } from 'firebase/firestore';

import { getFirebaseFirestore } from '@/services/firebase/app';
import type { AlertType } from '@/types/domain';
import { logger } from '@/utils/logger';

/**
 * Append-only writes to `alertLogs`.
 *
 * Records that a user was warned, which Phase 10 uses to understand whether
 * warnings are reaching people and Phase 13 uses to verify de-duplication in the
 * field.
 *
 * **No coordinates are written.** The security rules permit the fields, but the
 * app deliberately does not send them: attaching a position to every alert would
 * accumulate exactly the continuous location history the user is told is not
 * kept. The black spot id already identifies where the alert happened.
 */

export const ALERT_LOGS_COLLECTION = 'alertLogs';

export interface RecordAlertInput {
  userId: string;
  blackSpotId: string;
  distanceM: number;
  alertType: AlertType;
}

/**
 * Record that an alert was delivered.
 *
 * Never throws. Logging is telemetry — if it fails, the user has still been
 * warned, and surfacing a Firestore error over a warning the user already acted
 * on would be actively unhelpful.
 */
export async function recordAlert(input: RecordAlertInput): Promise<void> {
  try {
    await addDoc(collection(getFirebaseFirestore(), ALERT_LOGS_COLLECTION), {
      userId: input.userId,
      blackSpotId: input.blackSpotId,
      // Rounded: the exact metre adds nothing analytically and a coarser value
      // is one less precise signal about where the user was.
      distanceM: Math.round(input.distanceM),
      alertType: input.alertType,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    logger.warn('alertLogRepository', 'Could not record the alert', {
      blackSpotId: input.blackSpotId,
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

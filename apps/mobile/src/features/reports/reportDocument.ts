import { geohashForLocation } from 'geofire-common';

import {
  buildIncidentReportFormSchema,
  MAX_IMAGES_PER_REPORT,
  type IncidentReportFormValues,
} from '@/features/reports/reportSchemas';
import { AppError } from '@/utils/errors';

/**
 * Assembly of the document written to `incidentReports`.
 *
 * Pure and separately tested, because this function carries the single most
 * important guarantee in the phase: **a client can only ever create a report as
 * `pending`.** The Firestore rules enforce that too, and they are the control
 * that counts — but a client that tried to write anything else would simply fail
 * with PERMISSION_DENIED and lose the user's report. So the payload is built
 * from a fixed shape here rather than by spreading caller-supplied data, and
 * moderation fields are never included at all.
 *
 * Note there is no `verified` field. It exists on `BlackSpot`, not on a report:
 * a report is evidence, and conflating the two vocabularies is how an
 * unmoderated report ends up rendered as an official hazard.
 */

/** Geohash precision, matching the black spot documents so both can be scanned together. */
const GEOHASH_PRECISION = 10;

export interface BuildIncidentReportInput {
  reporterId: string;
  values: IncidentReportFormValues;
  /** Download URLs of images already uploaded. Empty when none were attached. */
  imageUrls: readonly string[];
}

/**
 * Exactly the fields a client writes.
 *
 * `createdAt` and `updatedAt` are deliberately absent: they are
 * `serverTimestamp()` sentinels added by the repository, because the server
 * clock is authoritative and a device clock can be wrong or deliberately set.
 * `occurredAt` is the opposite case — it is a claim about the past that only the
 * reporter can make, so it comes from the device as an ordinary `Date`.
 */
export interface IncidentReportWritePayload {
  reporterId: string;
  type: IncidentReportFormValues['type'];
  description: string;
  latitude: number;
  longitude: number;
  geohash: string;
  severity: IncidentReportFormValues['severity'];
  imageUrls: string[];
  /** Always `'pending'`. Not a parameter — see the note above. */
  status: 'pending';
  occurredAt?: Date;
}

/**
 * Validate and assemble a report for writing.
 *
 * Throws an `AppError` rather than returning a result union because every caller
 * treats a failure the same way — the form has already validated the same
 * schema, so reaching here with bad data is a programming error or a tampered
 * client, not an ordinary user mistake.
 *
 * @param now Injected clock so the occurrence-time bounds are testable.
 */
export function buildIncidentReportPayload(
  input: BuildIncidentReportInput,
  now: number = Date.now(),
): IncidentReportWritePayload {
  const { reporterId, imageUrls } = input;

  if (reporterId.trim().length === 0) {
    throw new AppError('auth', 'You need to be signed in to submit a report.', {
      technicalMessage: 'buildIncidentReportPayload called without a reporterId.',
    });
  }

  const parsed = buildIncidentReportFormSchema(() => now).safeParse(input.values);
  if (!parsed.success) {
    throw new AppError(
      'validation',
      'Some details are missing or invalid. Please check the form.',
      {
        technicalMessage: `Invalid report values: ${parsed.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; ')}`,
      },
    );
  }

  if (imageUrls.length > MAX_IMAGES_PER_REPORT) {
    throw new AppError(
      'validation',
      `You can attach up to ${MAX_IMAGES_PER_REPORT} photos to a report.`,
      { technicalMessage: `Received ${imageUrls.length} image URLs.` },
    );
  }

  const values = parsed.data;

  return {
    reporterId,
    type: values.type,
    description: values.description,
    latitude: values.latitude,
    longitude: values.longitude,
    geohash: geohashForLocation([values.latitude, values.longitude], GEOHASH_PRECISION),
    severity: values.severity,
    imageUrls: [...imageUrls],
    // Hard-coded, never taken from the caller. See the module note.
    status: 'pending',
    // Omitted rather than set to `undefined`: under `exactOptionalPropertyTypes`
    // those differ, and Firestore rejects an explicit `undefined` field value.
    ...(values.occurredAtMs === undefined ? {} : { occurredAt: new Date(values.occurredAtMs) }),
  };
}

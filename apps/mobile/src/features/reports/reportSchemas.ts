import { z } from 'zod';

import { INCIDENT_SEVERITIES, INCIDENT_TYPES, REPORT_STATUSES } from '@/types/domain';

/**
 * Validation for incident reports, on the way in and on the way out.
 *
 * The same limits appear in three places by design — here, in
 * `firebase/firestore.rules`, and in `firebase/storage.rules` — because only the
 * server-side copies are security controls. The client copies exist to tell the
 * user what is wrong *before* they spend an upload on a rejection.
 *
 * If you change a bound here, change the matching rule. The constants below are
 * exported so tests and copy can quote them rather than re-typing a number that
 * then drifts.
 */

/**
 * Description length.
 *
 * The floor is not arbitrary. A report is read by a moderator who was not there
 * and has to decide whether to publish a public safety warning from it;
 * "pothole" alone cannot support that decision. The ceiling keeps a document
 * small enough to list cheaply and bounds what an abusive client can store.
 */
export const DESCRIPTION_MIN_LENGTH = 20;
export const DESCRIPTION_MAX_LENGTH = 1000;

/** Photographs per report. */
export const MAX_IMAGES_PER_REPORT = 3;

/**
 * Per-image size cap, in bytes.
 *
 * Mirrored exactly in `storage.rules`. Five megabytes comfortably fits a phone
 * photo after the picker's compression, while keeping an upload feasible on a
 * poor connection at the roadside — which is where these reports are written.
 */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Accepted image content types.
 *
 * An allow-list, not a deny-list: anything not named here is refused. HEIC is
 * included because it is the iPhone default, and `expo-image-picker` does not
 * always transcode it.
 */
export const ALLOWED_IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export type AllowedImageMimeType = (typeof ALLOWED_IMAGE_MIME_TYPES)[number];

/**
 * How far in the past an occurrence time may be, in milliseconds.
 *
 * A report about something two years ago says nothing useful about current road
 * conditions, and dated evidence would skew the Phase 10 clustering.
 */
export const MAX_OCCURRED_AGE_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * Tolerance for an occurrence time in the future, in milliseconds.
 *
 * Not zero: the value comes from the device clock, which can legitimately run a
 * few minutes fast. Anything beyond that is a mistake or a fabrication.
 */
export const OCCURRED_FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export const descriptionSchema = z
  .string()
  .trim()
  .min(1, 'Describe what happened.')
  .min(
    DESCRIPTION_MIN_LENGTH,
    `Add a little more detail — at least ${DESCRIPTION_MIN_LENGTH} characters. A moderator has to judge this without having been there.`,
  )
  .max(DESCRIPTION_MAX_LENGTH, `Keep it under ${DESCRIPTION_MAX_LENGTH} characters.`);

export const latitudeSchema = z
  .number({ message: 'A location is needed before you can submit.' })
  .refine(Number.isFinite, 'That location is not valid.')
  .refine((value) => value >= -90 && value <= 90, 'That latitude is not valid.');

export const longitudeSchema = z
  .number({ message: 'A location is needed before you can submit.' })
  .refine(Number.isFinite, 'That location is not valid.')
  .refine((value) => value >= -180 && value <= 180, 'That longitude is not valid.');

/**
 * The form the user fills in.
 *
 * `occurredAt` is epoch milliseconds rather than a `Date` so the value survives
 * React Hook Form's serialisation unchanged and can be compared in tests without
 * timezone ambiguity. It is validated against a clock passed in by the caller —
 * see `incidentReportFormSchema` — so tests are not at the mercy of `Date.now()`.
 */
export interface IncidentReportFormValues {
  type: (typeof INCIDENT_TYPES)[number];
  severity: (typeof INCIDENT_SEVERITIES)[number];
  description: string;
  latitude: number;
  longitude: number;
  occurredAtMs?: number | undefined;
}

/**
 * @param clock Read **inside** each refinement, not captured when the schema is
 * built. That distinction is not academic: an earlier version took a `now:
 * number`, so the module-level `incidentReportFormSchema` froze the clock at
 * import time. On a session left open for ten minutes, "now" as chosen by the
 * date picker was then nine minutes past a stale reference and the form rejected
 * it as being in the future. Caught on the simulator, not by the unit tests —
 * which passed a fixed clock and so could never have seen it.
 */
export function buildIncidentReportFormSchema(clock: () => number = Date.now) {
  return z.object({
    type: z.enum(INCIDENT_TYPES, { message: 'Choose what you are reporting.' }),
    severity: z.enum(INCIDENT_SEVERITIES, { message: 'Choose how serious it was.' }),
    description: descriptionSchema,
    latitude: latitudeSchema,
    longitude: longitudeSchema,
    occurredAtMs: z
      .number()
      .refine(Number.isFinite, 'That date and time is not valid.')
      .refine(
        (value) => value <= clock() + OCCURRED_FUTURE_TOLERANCE_MS,
        'That is in the future. Choose when it actually happened.',
      )
      .refine(
        (value) => value >= clock() - MAX_OCCURRED_AGE_MS,
        'That is more than a year ago. Reports that old are not useful for current road conditions.',
      )
      .optional(),
  });
}

/** Schema bound to the live clock. Safe to hold at module scope — see above. */
export const incidentReportFormSchema = buildIncidentReportFormSchema();

// -----------------------------------------------------------------------------
// Stored document
// -----------------------------------------------------------------------------

/**
 * Runtime shape of an `incidentReports/{id}` document as read back.
 *
 * Validated on read for the same reason black spots are: a stored document may
 * predate a schema change or have been written by the moderation tooling, and a
 * malformed record rendered as a well-typed lie fails far from its cause.
 *
 * Timestamps are excluded — Firestore returns `Timestamp` class instances that
 * Zod cannot usefully introspect, so the converter handles them separately.
 */
export const incidentReportDocumentSchema = z.object({
  id: z.string().min(1),
  reporterId: z.string().min(1),
  type: z.enum(INCIDENT_TYPES),
  description: z.string().min(1).max(DESCRIPTION_MAX_LENGTH),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  geohash: z
    .string()
    .min(1)
    .max(22)
    .regex(/^[0-9b-hjkmnp-z]+$/, 'Not a valid base-32 geohash.'),
  severity: z.enum(INCIDENT_SEVERITIES),
  imageUrls: z.array(z.string().min(1)).max(MAX_IMAGES_PER_REPORT),
  status: z.enum(REPORT_STATUSES),
  moderationNotes: z.string().max(2000).optional(),
  reviewedBy: z.string().optional(),
});

export type IncidentReportDocument = z.infer<typeof incidentReportDocumentSchema>;

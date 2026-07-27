import { z } from 'zod';

import { BLACK_SPOT_CATEGORIES, BLACK_SPOT_SOURCES, RISK_LEVELS } from '@/types/domain';

/**
 * Runtime shape of a `blackSpots/{id}` document.
 *
 * Validated on read as well as write. A stored document may predate a schema
 * change or have been written by an admin tool, and a malformed record that
 * flowed into the alert engine would produce either a missed warning or a
 * nonsensical one — so anything that does not parse is dropped rather than
 * trusted.
 */

/** Matches the bounds enforced in firestore.rules and the user's own setting. */
const RADIUS_MIN_M = 50;
const RADIUS_MAX_M = 5000;

export const blackSpotSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(120),
  description: z.string().max(2000).optional(),
  category: z.enum(BLACK_SPOT_CATEGORIES),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  // Base-32 geohash. Length is not pinned because precision is the writer's
  // choice; only the alphabet is enforced.
  geohash: z
    .string()
    .min(1)
    .max(22)
    .regex(/^[0-9b-hjkmnp-z]+$/, 'Not a valid base-32 geohash.'),
  // A spot's own radius may legitimately exceed the user's 100–2000 m setting;
  // the engine narrows it per user. These are the bounds of a sane record.
  radiusM: z.number().int().min(RADIUS_MIN_M).max(RADIUS_MAX_M),
  riskLevel: z.enum(RISK_LEVELS),
  severityScore: z.number().min(0).max(100),
  accidentCount: z.number().int().min(0),
  crimeCount: z.number().int().min(0),
  reportCount: z.number().int().min(0),
  verified: z.boolean(),
  active: z.boolean(),
  source: z.enum(BLACK_SPOT_SOURCES),
  createdBy: z.string().min(1),
});

export type BlackSpotDocument = z.infer<typeof blackSpotSchema>;

export const BLACK_SPOT_RADIUS_BOUNDS_M = { min: RADIUS_MIN_M, max: RADIUS_MAX_M } as const;

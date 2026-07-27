import type { BlackSpotCategory, BlackSpotSource } from '@/types/domain';

/**
 * User-facing copy for black spot metadata.
 *
 * Kept in one module so the map, the sheet, the detail screen and the alert
 * messages cannot drift apart — and so the wording can be reviewed against the
 * project's safety rules in a single place rather than scattered across screens.
 */

/** Plain-language guidance per category. Actionable, never a promise. */
export const CATEGORY_GUIDANCE: Record<BlackSpotCategory, string> = {
  accident: 'Reduce speed, increase your following distance and watch for stopping traffic.',
  crime:
    'Stay aware of your surroundings. Travel with others where you can, especially after dark.',
  'unsafe-road':
    'Road surface or layout may be poor. Slow down and avoid sudden steering or braking.',
  mixed: 'Both collisions and crime have been reported here. Stay alert and reduce speed.',
};

export const CATEGORY_LABELS: Record<BlackSpotCategory, string> = {
  accident: 'Accident-prone',
  crime: 'Crime-prone',
  'unsafe-road': 'Unsafe road',
  mixed: 'Accident and crime',
};

/**
 * How this record came to exist, in the user's terms.
 *
 * Shown on the detail screen because the basis for a warning affects how much
 * weight it deserves — an official record and a pattern inferred from a handful
 * of reports are not the same claim, and the app should not present them as if
 * they were.
 */
export const SOURCE_LABELS: Record<BlackSpotSource, string> = {
  official: 'From official road safety data',
  reports: 'Based on approved reports from users',
  algorithm: 'Identified by pattern analysis, then reviewed',
  manual: 'Added by a moderator',
};

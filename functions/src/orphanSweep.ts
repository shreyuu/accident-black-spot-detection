/**
 * Which uploaded photographs are no longer referenced by any report.
 *
 * Resolves the `TODO(phase-12)` in `apps/mobile/src/features/reports/reportStorage.ts`.
 *
 * ## Where orphans come from
 *
 * Images are uploaded **before** the report document is written, deliberately:
 * the alternative leaves a report referencing photographs that may never arrive.
 * The cost of that ordering is that abandoning the form after choosing a photo
 * leaves the object behind with nothing pointing at it. A stray image is a
 * storage-cost problem; a report with broken image links is a moderation
 * problem, and the cheaper failure was chosen on purpose.
 *
 * This is the sweep that collects them.
 *
 * ## Why the grace period is the important parameter
 *
 * An object uploaded ten seconds ago is *expected* to be unreferenced — the user
 * is still filling in the description. Deleting it would destroy a photograph
 * from a live submission and the user would have no idea why their report lost
 * its evidence. So nothing is deleted until it has been unreferenced for longer
 * than any plausible submission could take, and a value that feels generous is
 * the correct one: the cost of waiting is a few kilobytes, the cost of being
 * early is data loss during an incident report.
 *
 * Kept pure and separately tested because it decides what gets **deleted**, and
 * a mistake here is not recoverable.
 */

/** How long an object must have been unreferenced before it may be removed. */
export const ORPHAN_GRACE_PERIOD_HOURS = 24;

export interface StorageObjectSummary {
  /** Full object path, e.g. `incidentReports/uid123/abc-def.jpg`. */
  path: string;
  /** Upload time in epoch milliseconds. */
  createdAtMs: number;
}

export interface OrphanSweepInput {
  objects: readonly StorageObjectSummary[];
  /**
   * Download URLs referenced by report documents.
   *
   * These are `getDownloadURL()` strings, not object paths — they carry a query
   * string and an access token — so the comparison is by *containment* of the
   * URL-encoded object path rather than equality. See `isReferenced`.
   */
  referencedUrls: readonly string[];
  nowMs: number;
  graceHours?: number;
}

export interface OrphanSweepResult {
  /** Safe to delete. */
  orphaned: StorageObjectSummary[];
  /** Unreferenced but still inside the grace period — left alone this run. */
  tooRecent: StorageObjectSummary[];
  /** Referenced by a report. */
  referenced: StorageObjectSummary[];
}

/**
 * Whether any report URL points at this object.
 *
 * A Firebase download URL embeds the object path percent-encoded, so
 * `incidentReports/uid/a.jpg` appears as `incidentReports%2Fuid%2Fa.jpg`. Both
 * forms are checked: the encoded one is what `getDownloadURL` produces, and the
 * plain one covers a URL that was stored differently — by the emulator, or by a
 * future change to how images are addressed.
 *
 * Erring towards "referenced" is deliberate. A false positive keeps a file that
 * costs a fraction of a penny; a false negative deletes evidence attached to a
 * report a moderator has not yet seen.
 */
function isReferenced(path: string, referencedUrls: readonly string[]): boolean {
  const encoded = encodeURIComponent(path);
  return referencedUrls.some((url) => url.includes(encoded) || url.includes(path));
}

export function planOrphanSweep(input: OrphanSweepInput): OrphanSweepResult {
  const { objects, referencedUrls, nowMs, graceHours = ORPHAN_GRACE_PERIOD_HOURS } = input;
  const cutoffMs = nowMs - graceHours * 60 * 60 * 1000;

  const result: OrphanSweepResult = { orphaned: [], tooRecent: [], referenced: [] };

  for (const object of objects) {
    if (isReferenced(object.path, referencedUrls)) {
      result.referenced.push(object);
      continue;
    }

    // Strictly older than the cutoff. An object exactly at the boundary is kept,
    // so the ambiguous case falls on the side that does not delete.
    if (object.createdAtMs < cutoffMs) {
      result.orphaned.push(object);
    } else {
      result.tooRecent.push(object);
    }
  }

  return result;
}

/**
 * The uid that owns an object, from its path.
 *
 * Returns `null` for anything not shaped like `incidentReports/{uid}/{file}` —
 * including a path with extra segments. The sweep refuses to reason about a
 * path it does not recognise rather than guessing, because the consequence of
 * guessing wrong is deleting somebody else's file.
 */
export function ownerOfObject(path: string): string | null {
  const segments = path.split('/');
  if (segments.length !== 3) {
    return null;
  }

  const [prefix, uid, fileName] = segments;
  if (prefix !== 'incidentReports' || uid === undefined || uid.length === 0) {
    return null;
  }
  if (fileName === undefined || fileName.length === 0) {
    return null;
  }

  return uid;
}

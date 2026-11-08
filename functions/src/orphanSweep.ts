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

/**
 * How long an object must have been unreferenced before it may be removed.
 *
 * Fifteen days: the app's offline draft lifetime (`DRAFT_MAX_AGE_MS`, fourteen
 * days) plus one. A draft that failed to submit keeps its photos' download URLs
 * and does not re-upload them, so until it is retried those uploads are
 * unreferenced *and still wanted*. This was 24 hours, and a draft retried on day
 * two filed a report whose photographs the sweep had already deleted
 * (SECURITY_AUDIT.md M4).
 *
 * A copy, not an import — the functions deploy cannot resolve the workspace
 * package — and `orphanSweep.test.ts` asserts it outlasts the shared constant.
 */
export const ORPHAN_GRACE_PERIOD_HOURS = 15 * 24;

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
   * string and an access token — so each is parsed back to the one object path
   * it names. See `referencedPathOf`.
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
 * The one object path a stored URL names, or `null`.
 *
 * A Firebase download URL embeds the object path percent-encoded after `/o/`,
 * so `incidentReports/uid/a.jpg` appears as `…/o/incidentReports%2Fuid%2Fa.jpg?…`.
 * A URL without `/o/` is read as a plain path (`http://host/incidentReports/…`),
 * which covers anything stored by a different route.
 *
 * Parsed, not searched. This used to test whether the encoded path appeared
 * *anywhere* in the string, so one long `imageUrls` entry could name any number
 * of objects — in its query string, or concatenated — and keep every one of them
 * alive for ever (SECURITY_AUDIT.md L3). One URL now references one object.
 */
export function referencedPathOf(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }

  const marker = '/o/';
  const index = pathname.indexOf(marker);
  const encoded =
    index === -1 ? pathname.replace(/^\//, '') : pathname.slice(index + marker.length);

  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

/**
 * Whether any report URL points at this object.
 *
 * Erring towards "referenced" is deliberate where it costs nothing: a URL whose
 * path *ends* with the object's path (behind a bucket segment, say) counts. A
 * false positive keeps a file that costs a fraction of a penny; a false negative
 * deletes evidence attached to a report a moderator has not yet seen.
 */
function isReferenced(path: string, referencedPaths: ReadonlySet<string>): boolean {
  if (referencedPaths.has(path)) {
    return true;
  }
  for (const candidate of referencedPaths) {
    if (candidate.endsWith(`/${path}`)) {
      return true;
    }
  }
  return false;
}

export function planOrphanSweep(input: OrphanSweepInput): OrphanSweepResult {
  const { objects, referencedUrls, nowMs, graceHours = ORPHAN_GRACE_PERIOD_HOURS } = input;
  const cutoffMs = nowMs - graceHours * 60 * 60 * 1000;

  const referencedPaths = new Set(
    referencedUrls
      .map((url) => referencedPathOf(url))
      .filter((path): path is string => path !== null),
  );

  const result: OrphanSweepResult = { orphaned: [], tooRecent: [], referenced: [] };

  for (const object of objects) {
    if (isReferenced(object.path, referencedPaths)) {
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

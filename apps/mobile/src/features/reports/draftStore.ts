import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  DRAFT_SCHEMA_VERSION,
  partitionExpired,
  sortDrafts,
  type DraftRecord,
} from '@/features/reports/draftQueue';
import type { SelectedImage } from '@/features/reports/reportImages';
import type { IncidentReportFormValues } from '@/features/reports/reportSchemas';
import { logger } from '@/utils/logger';

/**
 * On-device storage for unsent reports.
 *
 * AsyncStorage, matching the other caches. What is stored is the user's own
 * incident description and the local URIs of their photographs — personal, but
 * personal *to them*, never leaving the device until it is submitted, and
 * deleted the moment it does. It is deliberately capped and expired: see
 * `DRAFT_MAX_AGE_MS`.
 *
 * Nothing here throws. This runs on the path where a submission has already
 * failed, and a storage error on top of that must not turn a recoverable
 * problem into a crash.
 */

const STORAGE_KEY = 'reports.drafts.v1';

/**
 * Upper bound on stored drafts.
 *
 * Twenty is far beyond normal use and exists to stop a pathological loop from
 * filling the device. When it is reached the **oldest** is dropped, because it
 * is the one closest to expiring anyway.
 */
export const MAX_DRAFTS = 20;

export interface StoredDraft {
  record: DraftRecord;
  values: IncidentReportFormValues;
  /**
   * The chosen photographs.
   *
   * Local `file://` URIs, plus a `downloadUrl` for any that already uploaded.
   * Keeping the URLs is what makes a retry after a partial failure resume
   * rather than restart — and it is why a draft that has uploaded two of three
   * images does not pay for them twice.
   *
   * A local URI is **not** guaranteed to survive: iOS clears its temporary
   * directory, and the picker's cache is not permanent storage. A retry whose
   * file has vanished fails with a clear error rather than silently sending a
   * report with fewer photographs than the user attached.
   */
  images: SelectedImage[];
}

interface StoredShape {
  version: typeof DRAFT_SCHEMA_VERSION;
  drafts: unknown[];
}

function isDraftRecord(value: unknown): value is DraftRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    candidate.id.length > 0 &&
    typeof candidate.reportId === 'string' &&
    candidate.reportId.length > 0 &&
    typeof candidate.reporterId === 'string' &&
    candidate.reporterId.length > 0 &&
    typeof candidate.createdAt === 'number' &&
    typeof candidate.attempts === 'number' &&
    (candidate.lastAttemptAt === null || typeof candidate.lastAttemptAt === 'number') &&
    (candidate.lastError === null || typeof candidate.lastError === 'string') &&
    typeof candidate.lastErrorRetryable === 'boolean'
  );
}

function isFormValues(value: unknown): value is IncidentReportFormValues {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.type === 'string' &&
    typeof candidate.severity === 'string' &&
    typeof candidate.description === 'string' &&
    typeof candidate.latitude === 'number' &&
    typeof candidate.longitude === 'number' &&
    Number.isFinite(candidate.latitude) &&
    Number.isFinite(candidate.longitude)
  );
}

function isStoredDraft(value: unknown): value is StoredDraft {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    isDraftRecord(candidate.record) &&
    isFormValues(candidate.values) &&
    Array.isArray(candidate.images)
  );
}

/**
 * Read every stored draft, dropping anything unusable or expired.
 *
 * Returns the expired ones separately so the caller can tell the user what was
 * removed. Work disappearing without explanation is exactly the experience
 * drafts exist to prevent.
 */
export async function loadDrafts(
  now: number = Date.now(),
): Promise<{ drafts: StoredDraft[]; expired: StoredDraft[] }> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return { drafts: [], expired: [] };
    }

    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      (parsed as StoredShape).version !== DRAFT_SCHEMA_VERSION ||
      !Array.isArray((parsed as StoredShape).drafts)
    ) {
      logger.warn('draftStore', 'Discarding an unrecognised draft payload');
      await clearDrafts();
      return { drafts: [], expired: [] };
    }

    const valid = (parsed as StoredShape).drafts.filter(isStoredDraft);

    const { kept } = partitionExpired(
      valid.map((draft) => draft.record),
      now,
    );
    const keptIds = new Set(kept.map((record) => record.id));

    const drafts = sortDrafts(kept).map(
      (record) => valid.find((draft) => draft.record.id === record.id) as StoredDraft,
    );

    return {
      drafts,
      expired: valid.filter((draft) => !keptIds.has(draft.record.id)),
    };
  } catch (error) {
    logger.warn('draftStore', 'Could not read drafts', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return { drafts: [], expired: [] };
  }
}

async function writeAll(drafts: readonly StoredDraft[]): Promise<void> {
  try {
    if (drafts.length === 0) {
      await AsyncStorage.removeItem(STORAGE_KEY);
      return;
    }

    const payload: StoredShape = {
      version: DRAFT_SCHEMA_VERSION,
      // Oldest first, then capped from the end — so the cap drops the oldest,
      // which is the one closest to expiring anyway.
      drafts: sortDrafts(drafts.map((draft) => draft.record))
        .map((record) => drafts.find((draft) => draft.record.id === record.id))
        .filter((draft): draft is StoredDraft => draft !== undefined)
        .slice(-MAX_DRAFTS),
    };

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch (error) {
    logger.warn('draftStore', 'Could not save drafts', {
      error: error instanceof Error ? error.message : 'unknown',
    });
  }
}

/** Create or replace one draft, keeping the rest. */
export async function saveDraft(draft: StoredDraft, now: number = Date.now()): Promise<void> {
  const { drafts } = await loadDrafts(now);
  const others = drafts.filter((existing) => existing.record.id !== draft.record.id);
  await writeAll([...others, draft]);
}

/** Remove one draft. Called on a successful submission, and on discard. */
export async function removeDraft(draftId: string, now: number = Date.now()): Promise<void> {
  const { drafts } = await loadDrafts(now);
  await writeAll(drafts.filter((draft) => draft.record.id !== draftId));
}

/**
 * Remove every draft.
 *
 * Called on sign-out: an unsent observation belongs to the account that wrote
 * it, and leaving it on a shared device would let the next person read it — or
 * worse, let it be submitted under their name.
 */
export async function clearDrafts(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing useful to do if even removal fails.
  }
}

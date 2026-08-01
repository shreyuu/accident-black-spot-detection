import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/features/auth/AuthProvider';
import {
  canRetryManually,
  recordAttempt,
  shouldRetryAutomatically,
  type DraftRecord,
  type RetryContext,
} from '@/features/reports/draftQueue';
import {
  loadDrafts,
  removeDraft,
  saveDraft,
  type StoredDraft,
} from '@/features/reports/draftStore';
import type { SelectedImage } from '@/features/reports/reportImages';
import type { IncidentReportFormValues } from '@/features/reports/reportSchemas';
import { reserveIncidentReportId } from '@/features/reports/reportRepository';
import { submitIncidentReport } from '@/features/reports/submitIncidentReport';
import { toAppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

/**
 * Holds unsent reports and keeps trying to send them.
 *
 * Whether a draft should be retried is decided by the pure `draftQueue` module;
 * this hook supplies the current world — who is signed in, whether the network
 * is up, what time it is — and carries out what it decides.
 *
 * ## What triggers a retry
 *
 * Returning to the app, and mounting the screen. Deliberately **not** a timer:
 * a background interval that wakes to retry uploads would drain battery for a
 * case that is almost always resolved by the user picking the phone up again,
 * and this app already asks for more background budget than most.
 *
 * The consequence is stated honestly in the UI — a draft is sent when the app
 * is next opened with a connection, not the instant signal returns.
 */

export interface UseDraftQueueResult {
  drafts: StoredDraft[];
  /** False until storage has been read. */
  ready: boolean;
  /** Ids currently being submitted. */
  sendingIds: string[];
  /** Save a report that could not be submitted. */
  enqueue: (input: EnqueueInput) => Promise<void>;
  /** Try one draft now, ignoring backoff and the attempt cap. */
  retry: (draftId: string) => Promise<boolean>;
  /** Delete a draft without sending it. */
  discard: (draftId: string) => Promise<void>;
  /** Re-read storage and attempt anything eligible. */
  refresh: () => Promise<void>;
  /** Drafts removed for age since the last read, so the user can be told. */
  expiredCount: number;
}

export interface EnqueueInput {
  reporterId: string;
  /** The id already reserved for this report, so a retry cannot duplicate it. */
  reportId?: string;
  values: IncidentReportFormValues;
  images: readonly SelectedImage[];
  /** The failure that caused this, when there was one. */
  error?: { message: string; retryable: boolean };
}

export function useDraftQueue(): UseDraftQueueResult {
  const { user } = useAuth();

  const [drafts, setDrafts] = useState<StoredDraft[]>([]);
  const [ready, setReady] = useState(false);
  const [sendingIds, setSendingIds] = useState<string[]>([]);
  const [expiredCount, setExpiredCount] = useState(0);

  const mountedRef = useRef(true);
  const userIdRef = useRef<string | null>(user?.uid ?? null);
  /** Guards against two retry passes overlapping and sending a draft twice. */
  const runningRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    userIdRef.current = user?.uid ?? null;
  }, [user]);

  const read = useCallback(async (): Promise<StoredDraft[]> => {
    const { drafts: stored, expired } = await loadDrafts();
    if (mountedRef.current) {
      setDrafts(stored);
      setExpiredCount(expired.length);
      setReady(true);
    }
    if (expired.length > 0) {
      logger.info('useDraftQueue', 'Dropped drafts past the retention limit', {
        count: expired.length,
      });
    }
    return stored;
  }, []);

  /** Attempt one draft. Returns whether it was accepted. */
  const attempt = useCallback(async (draft: StoredDraft): Promise<boolean> => {
    setSendingIds((current) => [...current, draft.record.id]);

    try {
      await submitIncidentReport({
        reportId: draft.record.reportId,
        reporterId: draft.record.reporterId,
        values: draft.values,
        images: draft.images,
        // Recorded as each image completes, so a partial success is not paid
        // for twice on the next attempt.
        onImageUploaded: (uri, downloadUrl) => {
          const index = draft.images.findIndex((image) => image.uri === uri);
          const existing = draft.images[index];
          if (existing !== undefined) {
            draft.images[index] = { ...existing, downloadUrl };
          }
        },
      });

      await removeDraft(draft.record.id);
      logger.info('useDraftQueue', 'Sent a queued report', { reportId: draft.record.reportId });
      return true;
    } catch (error) {
      const appError = toAppError(error);
      const updated: DraftRecord = recordAttempt(draft.record, {
        now: Date.now(),
        error: appError.userMessage,
        retryable: appError.retryable,
      });
      // The partially-uploaded images are written back too, so the next attempt
      // resumes from where this one stopped.
      await saveDraft({ ...draft, record: updated, images: [...draft.images] });
      logger.warn('useDraftQueue', 'A queued report failed again', {
        draftId: draft.record.id,
        attempts: updated.attempts,
      });
      return false;
    } finally {
      if (mountedRef.current) {
        setSendingIds((current) => current.filter((id) => id !== draft.record.id));
      }
    }
  }, []);

  /** Read storage, then attempt everything the policy allows. */
  const refresh = useCallback(async (): Promise<void> => {
    if (runningRef.current) {
      return;
    }
    runningRef.current = true;

    try {
      const stored = await read();

      const context: RetryContext = {
        now: Date.now(),
        // No connectivity API is wired in, so this is optimistic: a failed
        // attempt is how the queue discovers it is offline. That costs one
        // request rather than a dependency, and the backoff absorbs it.
        isOnline: true,
        currentUserId: userIdRef.current,
      };

      for (const draft of stored) {
        if (!shouldRetryAutomatically(draft.record, context).shouldRetry) {
          continue;
        }
        await attempt(draft);
      }

      await read();
    } finally {
      runningRef.current = false;
    }
  }, [attempt, read]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Returning to the app is the moment a connection has most likely come back.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void refresh();
      }
    });
    return () => subscription.remove();
  }, [refresh]);

  const enqueue = useCallback(
    async (input: EnqueueInput): Promise<void> => {
      const now = Date.now();
      const record: DraftRecord = {
        id: `draft-${now}-${Math.random().toString(36).slice(2, 8)}`,
        // Reuses the reserved id when there is one. That is what stops a
        // submission whose response was lost from filing the incident twice
        // when the draft is retried after a restart.
        reportId: input.reportId ?? reserveIncidentReportId(),
        reporterId: input.reporterId,
        createdAt: now,
        lastAttemptAt: input.error === undefined ? null : now,
        attempts: input.error === undefined ? 0 : 1,
        lastError: input.error?.message ?? null,
        lastErrorRetryable: input.error?.retryable ?? true,
      };

      await saveDraft({ record, values: input.values, images: [...input.images] });
      await read();
    },
    [read],
  );

  const retry = useCallback(
    async (draftId: string): Promise<boolean> => {
      const { drafts: stored } = await loadDrafts();
      const draft = stored.find((entry) => entry.record.id === draftId);
      if (draft === undefined) {
        return false;
      }

      const context: RetryContext = {
        now: Date.now(),
        isOnline: true,
        currentUserId: userIdRef.current,
      };
      if (!canRetryManually(draft.record, context)) {
        return false;
      }

      const sent = await attempt(draft);
      await read();
      return sent;
    },
    [attempt, read],
  );

  const discard = useCallback(
    async (draftId: string): Promise<void> => {
      await removeDraft(draftId);
      await read();
    },
    [read],
  );

  return { drafts, ready, sendingIds, enqueue, retry, discard, refresh, expiredCount };
}

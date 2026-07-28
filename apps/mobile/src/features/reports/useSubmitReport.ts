import { useCallback, useEffect, useRef, useState } from 'react';

import type { SelectedImage } from '@/features/reports/reportImages';
import { reserveIncidentReportId } from '@/features/reports/reportRepository';
import type { IncidentReportFormValues } from '@/features/reports/reportSchemas';
import {
  submitIncidentReport,
  type SubmissionProgress,
} from '@/features/reports/submitIncidentReport';
import { toAppError, type AppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

/**
 * Drives one report submission.
 *
 * Three behaviours here exist specifically to stop a bad connection from turning
 * into a bad dataset:
 *
 * 1. **Double-submit protection.** A ref, not the rendered state, is the guard.
 *    `AppButton` already ignores presses while `loading`, but that depends on a
 *    re-render having happened; two taps inside one frame would both pass. The
 *    ref is set synchronously at the top of `submit`, so the second call returns
 *    immediately.
 *
 * 2. **A stable document id across retries.** Reserved once per submission and
 *    held until `reset`, so a retry after a create whose response was lost
 *    overwrites the same document instead of filing the incident twice.
 *
 * 3. **Uploads survive a failure.** Each completed image reports its URL back
 *    through `onImageUploaded`, so the screen can record it and a retry skips
 *    what already finished.
 */

export type SubmissionState =
  | { status: 'idle' }
  | { status: 'submitting'; progress: SubmissionProgress }
  | { status: 'succeeded'; reportId: string }
  | { status: 'failed'; error: AppError };

export interface SubmitArgs {
  reporterId: string;
  values: IncidentReportFormValues;
  images: readonly SelectedImage[];
  /** Lets the caller record a completed upload so a retry does not repeat it. */
  onImageUploaded?: (uri: string, downloadUrl: string) => void;
}

export interface UseSubmitReportResult {
  state: SubmissionState;
  /**
   * Run one attempt.
   *
   * Never rejects. Resolves with the settled outcome so a caller can act on
   * success immediately — reading `state` straight after the await would see the
   * value captured by the current render, not the new one.
   */
  submit: (args: SubmitArgs) => Promise<SubmissionState>;
  /**
   * Abandon an in-flight attempt and return the form to the user.
   *
   * A safety net, not a substitute for the bounded retry window configured on
   * the Storage instance: whatever the SDK does, the user must always have a way
   * out of a submission that is going nowhere. Uploads that already finished
   * keep their URLs, so submitting again resumes rather than restarts.
   */
  cancel: () => void;
  /** Clears the result and releases the reserved id, ready for a new report. */
  reset: () => void;
}

export function useSubmitReport(): UseSubmitReportResult {
  const [state, setState] = useState<SubmissionState>({ status: 'idle' });

  const inFlightRef = useRef(false);
  const reportIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      // Stops an in-flight upload when the user navigates away. Without this the
      // task keeps running against a screen that no longer exists, and the
      // orphaned object is never referenced by any report.
      abortRef.current?.abort();
    };
  }, []);

  const submit = useCallback(async (args: SubmitArgs): Promise<SubmissionState> => {
    if (inFlightRef.current) {
      logger.debug('useSubmitReport', 'Ignored a duplicate submit while one was in flight');
      return {
        status: 'submitting',
        progress: {
          stage: 'uploading',
          fraction: 0,
          uploadedCount: 0,
          totalCount: args.images.length,
        },
      };
    }
    inFlightRef.current = true;

    const controller = new AbortController();
    abortRef.current = controller;

    // Reserved once and kept across retries — see the note above.
    reportIdRef.current ??= reserveIncidentReportId();
    const reportId = reportIdRef.current;

    setState({
      status: 'submitting',
      progress: {
        stage: 'uploading',
        fraction: 0,
        uploadedCount: 0,
        totalCount: args.images.length,
      },
    });

    try {
      await submitIncidentReport({
        reportId,
        reporterId: args.reporterId,
        values: args.values,
        images: args.images,
        onProgress: (progress) => {
          if (mountedRef.current) {
            setState({ status: 'submitting', progress });
          }
        },
        ...(args.onImageUploaded === undefined ? {} : { onImageUploaded: args.onImageUploaded }),
        signal: controller.signal,
      });

      const succeeded: SubmissionState = { status: 'succeeded', reportId };
      if (mountedRef.current) {
        setState(succeeded);
      }
      return succeeded;
    } catch (error) {
      const appError = toAppError(error);
      logger.error('useSubmitReport', 'Submission failed', appError.cause, { reportId });
      const failed: SubmissionState = { status: 'failed', error: appError };
      if (mountedRef.current) {
        setState(failed);
      }
      return failed;
    } finally {
      inFlightRef.current = false;
      abortRef.current = null;
    }
  }, []);

  const cancel = useCallback((): void => {
    // The in-flight upload rejects with a cancellation error, which the catch in
    // `submit` turns into the ordinary failed state — so the form comes back
    // with its values, its photos and a "Try again". The reserved report id is
    // kept deliberately: a cancelled attempt is still the same report.
    abortRef.current?.abort();
  }, []);

  const reset = useCallback((): void => {
    abortRef.current?.abort();
    // A new report is a new document. Reusing the id would overwrite the report
    // just submitted, which is the one thing the stable id must not do.
    reportIdRef.current = null;
    inFlightRef.current = false;
    setState({ status: 'idle' });
  }, []);

  return { state, submit, cancel, reset };
}

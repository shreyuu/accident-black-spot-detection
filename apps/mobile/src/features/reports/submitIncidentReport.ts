import { buildIncidentReportPayload } from '@/features/reports/reportDocument';
import {
  partitionForUpload,
  uploadProgressFraction,
  type SelectedImage,
} from '@/features/reports/reportImages';
import { createIncidentReport } from '@/features/reports/reportRepository';
import { uploadReportImage } from '@/features/reports/reportStorage';
import type { IncidentReportFormValues } from '@/features/reports/reportSchemas';
import { AppError } from '@/utils/errors';

/**
 * The submission sequence: photographs first, then the document.
 *
 * ## Why that order
 *
 * The document is written **last, exactly once**. Writing it first and patching
 * in image URLs afterwards would leave a window where a report exists with
 * photographs the moderator cannot see, and where a crash strands it there
 * permanently — a report that looks unsupported to whoever reviews it. Uploading
 * first costs an orphaned object when the user abandons the flow (see
 * reportStorage), which is the cheaper failure.
 *
 * ## Why this is a plain function
 *
 * No React, no component state. The hook that drives it deals with rendering and
 * cancellation; this file deals with the order of operations, which is the part
 * that has to be right.
 */

export type SubmissionStage = 'uploading' | 'saving';

export interface SubmissionProgress {
  stage: SubmissionStage;
  /** Overall 0–1 fraction across every image. `1` once uploads are done. */
  fraction: number;
  uploadedCount: number;
  totalCount: number;
}

export interface SubmitIncidentReportInput {
  /** Reserved once per submission and reused across retries — see the repository. */
  reportId: string;
  reporterId: string;
  values: IncidentReportFormValues;
  images: readonly SelectedImage[];
  onProgress?: (progress: SubmissionProgress) => void;
  /**
   * Called as each image completes.
   *
   * The caller records the URL against its own copy of the image so that a
   * failure part-way through does not throw away the uploads that succeeded.
   * Retrying then resumes rather than restarting.
   */
  onImageUploaded?: (uri: string, downloadUrl: string) => void;
  signal?: AbortSignal;
}

/** Thrown when the user navigated away or pressed cancel mid-submission. */
function abortedError(): AppError {
  return new AppError('unknown', 'The submission was cancelled.', {
    retryable: true,
    technicalMessage: 'AbortSignal fired during submission.',
  });
}

export async function submitIncidentReport(input: SubmitIncidentReportInput): Promise<void> {
  const { reportId, reporterId, values, images, onProgress, onImageUploaded, signal } = input;

  // Validated before a single byte is uploaded. Discovering a too-short
  // description after a three-photo upload on a roadside connection would be
  // an unforgivable waste of the user's time and data.
  const draftPayload = buildIncidentReportPayload({ reporterId, values, imageUrls: [] });

  const { uploaded, pending } = partitionForUpload(images);
  const totalCount = images.length;

  // Preserves the user's chosen order across a partial retry.
  const urlByUri = new Map<string, string>(
    uploaded.flatMap((image) =>
      image.downloadUrl === undefined ? [] : [[image.uri, image.downloadUrl] as const],
    ),
  );

  let completed = uploaded.length;

  onProgress?.({
    stage: 'uploading',
    fraction: uploadProgressFraction(completed, totalCount, 0),
    uploadedCount: completed,
    totalCount,
  });

  for (const image of pending) {
    if (signal?.aborted === true) {
      throw abortedError();
    }

    const url = await uploadReportImage({
      userId: reporterId,
      image,
      onProgress: (fileFraction) => {
        onProgress?.({
          stage: 'uploading',
          fraction: uploadProgressFraction(completed, totalCount, fileFraction),
          uploadedCount: completed,
          totalCount,
        });
      },
      ...(signal === undefined ? {} : { signal }),
    });

    urlByUri.set(image.uri, url);
    onImageUploaded?.(image.uri, url);
    completed += 1;

    onProgress?.({
      stage: 'uploading',
      fraction: uploadProgressFraction(completed, totalCount, 0),
      uploadedCount: completed,
      totalCount,
    });
  }

  if (signal?.aborted === true) {
    throw abortedError();
  }

  onProgress?.({ stage: 'saving', fraction: 1, uploadedCount: completed, totalCount });

  const imageUrls = images.flatMap((image) => {
    const url = urlByUri.get(image.uri);
    return url === undefined ? [] : [url];
  });

  await createIncidentReport(reportId, { ...draftPayload, imageUrls });
}

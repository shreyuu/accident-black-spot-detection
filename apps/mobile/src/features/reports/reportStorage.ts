import { getDownloadURL, ref, uploadBytesResumable } from 'firebase/storage';

import type { SelectedImage } from '@/features/reports/reportImages';
import { MAX_IMAGE_BYTES } from '@/features/reports/reportSchemas';
import { getFirebaseStorage } from '@/services/firebase/app';
import { AppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

/**
 * Photograph upload to Cloud Storage.
 *
 * ## Why the path is `incidentReports/{uid}/…`
 *
 * The uid is a path *segment*, so `storage.rules` can compare it to
 * `request.auth.uid` structurally — no lookup, and no way to write into another
 * user's folder. The alternative, keying by report id, cannot work here because
 * images are uploaded **before** the report document exists: creating the
 * document first would leave a report referencing images that may never arrive
 * if the upload fails, which is precisely the half-submitted state the retry
 * flow is meant to avoid.
 *
 * The cost of that ordering is an orphaned object when a user abandons a report
 * after picking a photo. That is deliberate — a stray image is a storage-cost
 * problem, a report with broken image links is a moderation problem.
 *
 * Phase 12 collects those orphans: `sweepOrphanedImages` in the functions
 * workspace removes anything unreferenced for more than 24 hours. The grace
 * period is generous on purpose — an object uploaded ten seconds ago is
 * *expected* to be unreferenced, because the user is still typing the
 * description, and deleting it would strip evidence from a live submission.
 */

export const REPORT_IMAGES_PREFIX = 'incidentReports';

/** Content type → filename extension, for the object's storage path. */
const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};

/**
 * Object name for a new upload.
 *
 * Random rather than derived from the source filename: a phone's filename can
 * itself be identifying (some cameras encode a timestamp and sequence), and
 * collisions between two users' `IMG_0001.jpg` would be silent overwrites.
 */
function buildObjectPath(userId: string, mimeType: string): string {
  const extension = EXTENSION_BY_MIME[mimeType] ?? 'jpg';
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${REPORT_IMAGES_PREFIX}/${userId}/${unique}.${extension}`;
}

/**
 * Read a local picker URI into a `Blob`.
 *
 * React Native's `fetch` handles `file://` URIs, and this is the supported route
 * to a Blob the Firebase JS SDK can upload — the SDK's `uploadBytes` cannot take
 * a file path directly on React Native.
 */
async function readAsBlob(uri: string): Promise<Blob> {
  try {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error(`Reading ${uri} returned HTTP ${response.status}.`);
    }
    return await response.blob();
  } catch (error) {
    throw new AppError('unknown', 'That photo could not be read from your device.', {
      retryable: true,
      cause: error,
      technicalMessage: error instanceof Error ? error.message : `Could not read ${uri}.`,
    });
  }
}

/** Firebase Storage error codes, mapped to copy and a sensible retry offer. */
function toUploadError(error: unknown, context: { userId: string }): AppError {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : '';

  switch (code) {
    case 'storage/unauthorized':
      // Reached when the object exceeds the server-side cap or its content type
      // is refused — the rules deny the write, they do not explain it.
      return new AppError(
        'permission',
        'That photo was refused. It may be too large or in an unsupported format. Try a different photo, or submit without one.',
        {
          retryable: false,
          cause: error,
          technicalMessage: `storage/unauthorized for ${context.userId}`,
        },
      );
    case 'storage/canceled':
      return new AppError('unknown', 'The upload was cancelled.', {
        retryable: true,
        cause: error,
      });
    case 'storage/quota-exceeded':
      return new AppError(
        'unavailable',
        'Photos cannot be uploaded right now. You can still submit the report without one.',
        { retryable: true, cause: error, technicalMessage: code },
      );
    case 'storage/retry-limit-exceeded':
    case 'storage/unknown':
      return new AppError(
        'network',
        'The photo could not be uploaded — the connection dropped. Try again when you have a better signal.',
        { retryable: true, cause: error, technicalMessage: code },
      );
    default:
      return new AppError('unknown', 'The photo could not be uploaded. Please try again.', {
        retryable: true,
        cause: error,
        technicalMessage: code.length > 0 ? code : 'Unknown storage failure.',
      });
  }
}

export interface UploadImageOptions {
  userId: string;
  image: SelectedImage;
  /** Called with a 0–1 fraction for this single file. */
  onProgress?: (fraction: number) => void;
  /** Abort signal, so unmounting the form stops an in-flight upload. */
  signal?: AbortSignal;
}

/**
 * Upload one image and return its download URL.
 *
 * The size check here is a courtesy that saves a doomed upload on a slow
 * connection; `storage.rules` enforces the same cap, and that is the copy that
 * actually protects the bucket.
 */
export async function uploadReportImage(options: UploadImageOptions): Promise<string> {
  const { userId, image, onProgress, signal } = options;

  const blob = await readAsBlob(image.uri);

  if (blob.size > MAX_IMAGE_BYTES) {
    throw new AppError(
      'validation',
      'That photo is too large to upload. Choose a smaller one, or submit without a photo.',
      {
        retryable: false,
        technicalMessage: `Blob is ${blob.size} bytes; the limit is ${MAX_IMAGE_BYTES}.`,
      },
    );
  }

  const storageRef = ref(getFirebaseStorage(), buildObjectPath(userId, image.mimeType));

  const task = uploadBytesResumable(storageRef, blob, {
    contentType: image.mimeType,
    // Kept minimal on purpose. No original filename, no device model, no EXIF
    // summary — the report already carries everything moderation needs, and
    // custom metadata is readable by anyone who can read the object.
    cacheControl: 'private, max-age=3600',
  });

  const abort = () => task.cancel();
  signal?.addEventListener('abort', abort);

  try {
    await new Promise<void>((resolve, reject) => {
      task.on(
        'state_changed',
        (snapshot) => {
          const fraction =
            snapshot.totalBytes > 0 ? snapshot.bytesTransferred / snapshot.totalBytes : 0;
          onProgress?.(fraction);
        },
        (error) => reject(toUploadError(error, { userId })),
        () => resolve(),
      );
    });

    const url = await getDownloadURL(task.snapshot.ref);
    logger.debug('reportStorage', 'Uploaded a report photo', { bytes: blob.size });
    return url;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw toUploadError(error, { userId });
  } finally {
    signal?.removeEventListener('abort', abort);
  }
}

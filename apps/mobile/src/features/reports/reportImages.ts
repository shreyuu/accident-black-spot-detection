import {
  ALLOWED_IMAGE_MIME_TYPES,
  MAX_IMAGES_PER_REPORT,
  MAX_IMAGE_BYTES,
} from '@/features/reports/reportSchemas';

/**
 * Photograph selection rules.
 *
 * Pure functions, no Expo and no Firebase, for the same reason the proximity
 * engine is pure: this is the logic that decides what leaves the user's device.
 * A mistake here either uploads something the bucket will reject — wasting a
 * roadside connection and losing the report — or fails to stop a file that
 * should never have been sent. Both are worth testing exhaustively and neither
 * is testable through a component.
 *
 * These checks are a **courtesy**, not a security control. `storage.rules`
 * enforces the same content-type allow-list and size cap server-side, and that
 * is the copy that matters. This one exists so the user finds out before the
 * upload rather than after it.
 */

/** A photograph the user has chosen, before or after upload. */
export interface SelectedImage {
  /** Local `file://` URI from the picker. Stable for the app session. */
  uri: string;
  /** Resolved content type. Sent as the upload's `contentType`. */
  mimeType: string;
  /** Size in bytes, or `null` when the picker did not report one. */
  sizeBytes: number | null;
  /**
   * Firebase Storage download URL, present once this image has uploaded.
   *
   * This is what makes retry cheap and correct: a second attempt after a partial
   * failure re-uploads only the images that never finished.
   */
  downloadUrl?: string;
}

/** Why a candidate image was refused. `reason` is written to be shown as-is. */
export interface RejectedImage {
  uri: string;
  reason: string;
}

export interface ImageSelectionResult {
  /** The full accepted set: previously held images plus newly accepted ones. */
  images: SelectedImage[];
  rejected: RejectedImage[];
}

/**
 * Filename extension → content type, for pickers that report neither.
 *
 * Only extensions matching the allow-list appear. An unrecognised extension
 * resolves to `null` and the image is refused, which is the safe direction:
 * guessing `image/jpeg` for an unknown file would push the failure to the
 * server, after the upload had already been paid for.
 */
const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

/** The shape `expo-image-picker` returns, narrowed to what is actually used. */
export interface PickedAsset {
  uri: string;
  mimeType?: string | undefined;
  fileName?: string | null | undefined;
  fileSize?: number | undefined;
}

/**
 * Best available content type for a picked asset.
 *
 * The picker's own `mimeType` is preferred but is genuinely absent on some
 * platform and source combinations, so the filename extension is the fallback,
 * and the URI's extension the fallback after that.
 */
export function resolveMimeType(asset: PickedAsset): string | null {
  const declared = asset.mimeType?.trim().toLowerCase();
  if (declared !== undefined && declared.length > 0) {
    return declared;
  }

  // The query string matters: a picker URI can carry `?ext=jpg#t=…`, and a naive
  // "text after the last dot" read would produce an extension of `jpg#t=…`.
  const candidates = [asset.fileName ?? '', asset.uri.split(/[?#]/)[0] ?? ''];

  for (const candidate of candidates) {
    const extension = candidate.split('.').pop()?.toLowerCase();
    if (extension !== undefined && extension in MIME_BY_EXTENSION) {
      return MIME_BY_EXTENSION[extension] ?? null;
    }
  }

  return null;
}

function isAllowedMimeType(mimeType: string): boolean {
  return (ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(mimeType);
}

/** Bytes as a short human string, for size-limit messages. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return 'unknown size';
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Check one candidate in isolation: type and size, not count.
 *
 * An unknown size passes. The picker does not always report `fileSize`, and
 * refusing every image on a platform that omits it would break the feature
 * outright — whereas the server-side cap still refuses an oversized upload, so
 * the failure mode is a clear error rather than a silent acceptance.
 */
export function validateImage(asset: PickedAsset): { ok: true } | { ok: false; reason: string } {
  const mimeType = resolveMimeType(asset);

  if (mimeType === null) {
    return {
      ok: false,
      reason: 'That file type is not supported. Choose a JPEG, PNG, WebP or HEIC photo.',
    };
  }

  if (!isAllowedMimeType(mimeType)) {
    return {
      ok: false,
      reason: `${mimeType} files are not supported. Choose a JPEG, PNG, WebP or HEIC photo.`,
    };
  }

  if (asset.fileSize !== undefined && asset.fileSize > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      reason: `That photo is ${formatBytes(asset.fileSize)}. The limit is ${formatBytes(MAX_IMAGE_BYTES)} per photo.`,
    };
  }

  return { ok: true };
}

/**
 * Merge newly picked assets into the set already held.
 *
 * Enforces the per-report count limit across the *combined* set rather than per
 * pick, and drops duplicates by URI so choosing the same photo twice does not
 * consume two of the three slots.
 *
 * Never throws and never partially applies: callers get the new full set plus
 * every rejection with its reason, so the UI can accept two photos and explain
 * why the third was refused in the same pass.
 */
export function addImages(
  existing: readonly SelectedImage[],
  candidates: readonly PickedAsset[],
): ImageSelectionResult {
  const images = [...existing];
  const rejected: RejectedImage[] = [];
  const seen = new Set(existing.map((image) => image.uri));

  for (const candidate of candidates) {
    if (seen.has(candidate.uri)) {
      rejected.push({ uri: candidate.uri, reason: 'That photo has already been added.' });
      continue;
    }

    if (images.length >= MAX_IMAGES_PER_REPORT) {
      rejected.push({
        uri: candidate.uri,
        reason: `You can attach up to ${MAX_IMAGES_PER_REPORT} photos. Remove one to add another.`,
      });
      continue;
    }

    const verdict = validateImage(candidate);
    if (!verdict.ok) {
      rejected.push({ uri: candidate.uri, reason: verdict.reason });
      continue;
    }

    const mimeType = resolveMimeType(candidate);
    if (mimeType === null) {
      // Unreachable: validateImage already refused a null type. Kept so the
      // narrowing is explicit rather than asserted.
      continue;
    }

    seen.add(candidate.uri);
    images.push({
      uri: candidate.uri,
      mimeType,
      sizeBytes: candidate.fileSize ?? null,
    });
  }

  return { images, rejected };
}

export function removeImage(existing: readonly SelectedImage[], uri: string): SelectedImage[] {
  return existing.filter((image) => image.uri !== uri);
}

/**
 * Split a selection into what still needs uploading and what is already up.
 *
 * This is what makes "try again" after a failed submission safe: an image that
 * completed on the first attempt keeps its download URL and is not sent twice,
 * so a retry on a bad connection gets progressively closer rather than starting
 * over and leaving another orphaned copy in the bucket.
 */
export function partitionForUpload(images: readonly SelectedImage[]): {
  uploaded: SelectedImage[];
  pending: SelectedImage[];
} {
  const uploaded: SelectedImage[] = [];
  const pending: SelectedImage[] = [];

  for (const image of images) {
    if (image.downloadUrl !== undefined && image.downloadUrl.length > 0) {
      uploaded.push(image);
    } else {
      pending.push(image);
    }
  }

  return { uploaded, pending };
}

/**
 * Overall progress across a multi-image upload, as a 0–1 fraction.
 *
 * Weighted by count rather than by bytes. Byte weighting would be more accurate
 * but needs every file's size up front, and `fileSize` is exactly the field the
 * picker sometimes omits — a progress bar that jumps backwards when an unknown
 * size resolves is worse than a slightly uneven one.
 */
export function uploadProgressFraction(
  completedCount: number,
  totalCount: number,
  currentFileFraction: number,
): number {
  if (totalCount <= 0) {
    return 1;
  }
  const clampedCurrent = Math.min(1, Math.max(0, currentFileFraction));
  const fraction = (completedCount + clampedCurrent) / totalCount;
  return Math.min(1, Math.max(0, fraction));
}

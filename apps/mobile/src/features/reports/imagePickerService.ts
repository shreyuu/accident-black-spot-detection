import * as ImagePicker from 'expo-image-picker';

import type { PickedAsset } from '@/features/reports/reportImages';
import { MAX_IMAGES_PER_REPORT } from '@/features/reports/reportSchemas';
import { AppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

/**
 * Camera and photo library access for report photographs.
 *
 * Wraps `expo-image-picker` so the rest of the app never sees its types. That
 * matters here beyond tidiness: the picker returns a result shape with a
 * `canceled` discriminant that is easy to mishandle, and a cancelled pick is a
 * completely ordinary outcome that must not surface as an error.
 *
 * ## Compression
 *
 * Images are compressed by the picker before they leave the device. It is not
 * only about the size cap — a report is written at the roadside on whatever
 * signal is available, and a 12 MP original would frequently fail to upload at
 * all. `quality: 0.7` keeps a number plate or a road defect legible while
 * usually landing under a megabyte.
 */

/** Matches the SelectedImage type: photographs only, never video. */
const MEDIA_TYPES: ImagePicker.MediaType[] = ['images'];

const PICKER_QUALITY = 0.7;

export type PickerSource = 'camera' | 'library';

/** A cancelled pick. Distinguished from a failure so the UI stays silent. */
export interface PickCancelled {
  cancelled: true;
}

export interface PickSucceeded {
  cancelled: false;
  assets: PickedAsset[];
}

export type PickResult = PickCancelled | PickSucceeded;

function toPickedAssets(assets: readonly ImagePicker.ImagePickerAsset[]): PickedAsset[] {
  return assets.map((asset) => ({
    uri: asset.uri,
    ...(asset.mimeType === undefined ? {} : { mimeType: asset.mimeType }),
    ...(asset.fileName === undefined || asset.fileName === null
      ? {}
      : { fileName: asset.fileName }),
    ...(asset.fileSize === undefined ? {} : { fileSize: asset.fileSize }),
  }));
}

/**
 * Permission failure copy.
 *
 * `canAskAgain` separates a refusal that can be asked about again from one that
 * can only be undone in system settings — the same distinction the location flow
 * makes, and for the same reason: a "Take a photo" button that silently does
 * nothing is worse than an explanation.
 */
function permissionError(source: PickerSource, canAskAgain: boolean): AppError {
  const what = source === 'camera' ? 'the camera' : 'your photos';
  return new AppError(
    'permission',
    canAskAgain
      ? `Access to ${what} was not granted. You can still submit a report without a photo.`
      : `Access to ${what} is turned off for this app. You can enable it in system settings, or submit a report without a photo.`,
    {
      retryable: false,
      technicalMessage: `${source} permission refused (canAskAgain=${canAskAgain}).`,
    },
  );
}

/**
 * Take a photograph with the camera.
 *
 * One image per invocation — the camera cannot do otherwise — and the caller
 * still runs it through `addImages`, so the per-report limit is enforced in one
 * place rather than being re-derived here.
 */
export async function captureReportPhoto(): Promise<PickResult> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw permissionError('camera', permission.canAskAgain);
  }

  try {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: MEDIA_TYPES,
      quality: PICKER_QUALITY,
      // Cropping is off: a report photograph is evidence, and an editing step
      // invites cropping out the context a moderator needs.
      allowsEditing: false,
      // EXIF is deliberately not requested. It carries the precise GPS position
      // and capture time of the original photo, which would attach a second,
      // more precise location to a report that already has the one the user
      // chose to share.
      exif: false,
    });

    return result.canceled
      ? { cancelled: true }
      : { cancelled: false, assets: toPickedAssets(result.assets) };
  } catch (error) {
    logger.error('imagePickerService', 'The camera could not be opened', error);
    throw new AppError('unavailable', 'The camera could not be opened. Please try again.', {
      retryable: true,
      cause: error,
    });
  }
}

/**
 * Choose photographs from the library.
 *
 * @param remainingSlots How many more images the report can accept. Passed
 * through as `selectionLimit` so the OS picker stops the user at the limit
 * rather than letting them choose six and then rejecting three.
 */
export async function pickReportPhotos(
  remainingSlots: number = MAX_IMAGES_PER_REPORT,
): Promise<PickResult> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw permissionError('library', permission.canAskAgain);
  }

  const limit = Math.max(1, Math.min(remainingSlots, MAX_IMAGES_PER_REPORT));

  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: MEDIA_TYPES,
      quality: PICKER_QUALITY,
      allowsMultipleSelection: limit > 1,
      selectionLimit: limit,
      exif: false,
    });

    return result.canceled
      ? { cancelled: true }
      : { cancelled: false, assets: toPickedAssets(result.assets) };
  } catch (error) {
    logger.error('imagePickerService', 'The photo library could not be opened', error);
    throw new AppError('unavailable', 'Your photo library could not be opened. Please try again.', {
      retryable: true,
      cause: error,
    });
  }
}

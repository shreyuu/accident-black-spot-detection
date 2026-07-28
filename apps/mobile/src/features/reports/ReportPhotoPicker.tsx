import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { AppButton, AppText } from '@/components';
import { captureReportPhoto, pickReportPhotos } from '@/features/reports/imagePickerService';
import { REPORT_PHOTO_NOTICE } from '@/features/reports/reportCopy';
import { addImages, removeImage, type SelectedImage } from '@/features/reports/reportImages';
import { MAX_IMAGES_PER_REPORT } from '@/features/reports/reportSchemas';
import { useTheme } from '@/theme';
import { getUserMessage } from '@/utils/errors';

export interface ReportPhotoPickerProps {
  images: readonly SelectedImage[];
  onChange: (images: SelectedImage[]) => void;
  disabled?: boolean;
}

/**
 * Optional photograph attachment.
 *
 * Every rejection is explained in place rather than silently dropped — a user
 * who picks four photos and sees three appear, with no word about the fourth,
 * will reasonably assume the app is broken. `addImages` returns the accepted set
 * and the reasons together precisely so both can be shown in one pass.
 */
export function ReportPhotoPicker({ images, onChange, disabled = false }: ReportPhotoPickerProps) {
  const theme = useTheme();
  const [notices, setNotices] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const remainingSlots = MAX_IMAGES_PER_REPORT - images.length;
  const atLimit = remainingSlots <= 0;

  const runPicker = async (pick: () => ReturnType<typeof pickReportPhotos>): Promise<void> => {
    setBusy(true);
    setNotices([]);
    try {
      const result = await pick();
      if (result.cancelled) {
        return;
      }

      const { images: next, rejected } = addImages(images, result.assets);
      onChange(next);
      setNotices(rejected.map((rejection) => rejection.reason));
    } catch (error) {
      // A refused camera permission is not a failure of the report — the user
      // can still submit without a photo, and the copy says so.
      setNotices([getUserMessage(error)]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText variant="label" color="textMuted">
        Photos (optional)
      </AppText>

      <AppText variant="caption" color="textSubtle">
        {REPORT_PHOTO_NOTICE}
      </AppText>

      {images.length > 0 ? (
        <View style={styles.thumbnails}>
          {images.map((image, index) => (
            <View key={image.uri} style={{ gap: theme.spacing.xxs }}>
              <Image
                source={{ uri: image.uri }}
                style={[styles.thumbnail, { borderRadius: theme.radius.md }]}
                accessibilityIgnoresInvertColors
                accessible
                accessibilityLabel={`Attached photo ${index + 1} of ${images.length}`}
              />
              <Pressable
                onPress={() => onChange(removeImage(images, image.uri))}
                disabled={disabled || busy}
                accessibilityRole="button"
                accessibilityLabel={`Remove photo ${index + 1}`}
                hitSlop={8}
                style={styles.removeRow}
                testID={`remove-photo-${index}`}
              >
                <Ionicons name="close-circle" size={16} color={theme.colors.danger} />
                <AppText variant="caption" color="danger">
                  Remove
                </AppText>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: theme.spacing.sm }}>
        <AppButton
          label="Take a photo"
          variant="secondary"
          onPress={() => void runPicker(() => captureReportPhoto())}
          disabled={disabled || atLimit}
          loading={busy}
          accessibilityHint="Opens the camera"
          style={styles.action}
          testID="capture-photo"
        />
        <AppButton
          label="Choose photos"
          variant="secondary"
          onPress={() => void runPicker(() => pickReportPhotos(remainingSlots))}
          disabled={disabled || atLimit}
          loading={busy}
          accessibilityHint="Opens your photo library"
          style={styles.action}
          testID="choose-photos"
        />
      </View>

      <AppText variant="caption" color="textSubtle">
        {atLimit
          ? `You have attached the maximum of ${MAX_IMAGES_PER_REPORT} photos.`
          : `${remainingSlots} of ${MAX_IMAGES_PER_REPORT} remaining. JPEG, PNG, WebP or HEIC, up to 5 MB each.`}
      </AppText>

      {notices.length > 0 ? (
        <View accessibilityRole="alert" style={{ gap: theme.spacing.xxs }}>
          {notices.map((notice) => (
            <AppText key={notice} variant="caption" color="danger">
              {notice}
            </AppText>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  thumbnails: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  thumbnail: { height: 96, width: 96 },
  removeRow: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  action: { flex: 1 },
});

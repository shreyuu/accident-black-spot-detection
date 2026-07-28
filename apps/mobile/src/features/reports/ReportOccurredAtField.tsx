import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, View } from 'react-native';

import { AppButton, AppCheckbox, AppText } from '@/components';
import { MAX_OCCURRED_AGE_MS } from '@/features/reports/reportSchemas';
import { useTheme } from '@/theme';

export interface ReportOccurredAtFieldProps {
  /** Epoch milliseconds, or `undefined` when the reporter did not say. */
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  error?: string;
  disabled?: boolean;
}

/**
 * Optional "when did this happen".
 *
 * Off by default, and that is the honest default: most reports are filed within
 * a minute of the event, and pre-filling "now" would put a precise time on every
 * report whether or not the reporter meant it. A moderator reading a fabricated
 * timestamp is worse off than one reading none, and `createdAt` already records
 * when the report was submitted.
 *
 * The platforms need genuinely different code. iOS renders an inline compact
 * picker that can do date and time together; Android has no combined mode and
 * uses imperative modal dialogs, so date and time are chosen in sequence.
 */
export function ReportOccurredAtField({
  value,
  onChange,
  error,
  disabled = false,
}: ReportOccurredAtFieldProps) {
  const theme = useTheme();

  const enabled = value !== undefined;
  const selected = value === undefined ? new Date() : new Date(value);

  const now = new Date();
  const earliest = new Date(now.getTime() - MAX_OCCURRED_AGE_MS);

  const openAndroidPickers = (): void => {
    DateTimePickerAndroid.open({
      value: selected,
      mode: 'date',
      maximumDate: now,
      minimumDate: earliest,
      onChange: (dateEvent, pickedDate) => {
        if (dateEvent.type !== 'set' || pickedDate === undefined) {
          return;
        }
        // Chained rather than combined: Android's picker has no datetime mode,
        // so the time dialog opens on top of the date the user just chose.
        DateTimePickerAndroid.open({
          value: pickedDate,
          mode: 'time',
          onChange: (timeEvent, pickedTime) => {
            if (timeEvent.type !== 'set' || pickedTime === undefined) {
              // Keeping the date alone is deliberate — dismissing the time
              // dialog should not silently discard the date already chosen.
              onChange(pickedDate.getTime());
              return;
            }
            const combined = new Date(pickedDate);
            combined.setHours(pickedTime.getHours(), pickedTime.getMinutes(), 0, 0);
            onChange(combined.getTime());
          },
        });
      },
    });
  };

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppCheckbox
        checked={enabled}
        onChange={(checked) => onChange(checked ? Date.now() : undefined)}
        label="I know roughly when this happened"
        testID="occurred-at-toggle"
      />

      {enabled ? (
        Platform.OS === 'android' ? (
          <View style={{ gap: theme.spacing.xs }}>
            <AppText variant="bodySmall">{selected.toLocaleString()}</AppText>
            <AppButton
              label="Change date and time"
              variant="secondary"
              onPress={openAndroidPickers}
              disabled={disabled}
              testID="occurred-at-open"
            />
          </View>
        ) : (
          <View style={{ alignItems: 'flex-start' }}>
            <DateTimePicker
              value={selected}
              mode="datetime"
              display="compact"
              maximumDate={now}
              minimumDate={earliest}
              disabled={disabled}
              onChange={(_event, pickedDate) => {
                if (pickedDate !== undefined) {
                  onChange(pickedDate.getTime());
                }
              }}
              testID="occurred-at-picker"
            />
          </View>
        )
      ) : (
        <AppText variant="caption" color="textSubtle">
          Leave this off if you are reporting something you have just seen.
        </AppText>
      )}

      {error !== undefined && error.length > 0 ? (
        <AppText variant="caption" color="danger">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { View } from 'react-native';

import {
  AppButton,
  AppText,
  AppTextInput,
  ErrorState,
  LoadingIndicator,
  OptionGroup,
  ProgressBar,
  ScreenContainer,
  type OptionGroupItem,
} from '@/components';
import { useAuth } from '@/features/auth/AuthProvider';
import { LocationPermissionGate } from '@/features/location/LocationPermissionGate';
import { useLocation } from '@/features/location/useLocation';
import { ReportLocationPicker } from '@/features/reports/ReportLocationPicker';
import { ReportOccurredAtField } from '@/features/reports/ReportOccurredAtField';
import { ReportPhotoPicker } from '@/features/reports/ReportPhotoPicker';
import {
  INCIDENT_SEVERITY_HINTS,
  INCIDENT_SEVERITY_LABELS,
  INCIDENT_TYPE_HINTS,
  INCIDENT_TYPE_LABELS,
  REPORT_SUBMISSION_NOTICE,
  REPORT_SUBMITTED_NOTICE,
} from '@/features/reports/reportCopy';
import type { SelectedImage } from '@/features/reports/reportImages';
import {
  DESCRIPTION_MAX_LENGTH,
  DESCRIPTION_MIN_LENGTH,
  incidentReportFormSchema,
  type IncidentReportFormValues,
} from '@/features/reports/reportSchemas';
import { useInvalidateMyReports } from '@/features/reports/useMyReports';
import { useSubmitReport } from '@/features/reports/useSubmitReport';
import { useTheme } from '@/theme';
import {
  INCIDENT_SEVERITIES,
  INCIDENT_TYPES,
  type IncidentSeverity,
  type IncidentType,
} from '@/types/domain';
import type { Coordinates } from '@/utils/geo';

/**
 * Incident report submission.
 *
 * The screen is split in two: this component resolves the prerequisites
 * (a signed-in user and a position), and `ReportForm` handles the form itself.
 * That split is what lets the form seed its default coordinates from a real
 * location through `defaultValues` instead of writing them into state from an
 * effect once a fix arrives — which the React Compiler lint rules correctly
 * reject, and which would also fight the user if they had already moved the pin.
 */
export default function ReportScreen() {
  const theme = useTheme();
  const { user } = useAuth();

  const {
    permission,
    location,
    error: locationError,
    initialising,
    requestAccess,
    refresh,
    openSettings,
  } = useLocation('high');

  const canReport = permission === 'granted' && locationError === null && !initialising;

  if (!canReport) {
    return (
      <ScreenContainer scrollable testID="report-screen">
        <View style={{ gap: theme.spacing.lg }}>
          <AppText variant="titleLarge">Report an incident</AppText>
          <AppText variant="bodySmall" color="textMuted">
            A report needs a location, so that a moderator knows where the incident happened.
          </AppText>

          <LocationPermissionGate
            permission={permission}
            error={locationError}
            initialising={initialising}
            onRequestAccess={() => void requestAccess()}
            onOpenSettings={() => void openSettings()}
            onRetry={() => void refresh('high')}
          />
        </View>
      </ScreenContainer>
    );
  }

  if (location === null) {
    return (
      <ScreenContainer testID="report-screen">
        <LoadingIndicator fullscreen message="Finding your location…" />
      </ScreenContainer>
    );
  }

  if (user === null) {
    // Practically unreachable — the tabs layout redirects an unauthenticated
    // user — but a report without a reporter must never be constructible.
    return (
      <ScreenContainer testID="report-screen">
        <ErrorState
          error={new Error('No session')}
          title="You need to be signed in to report an incident"
        />
      </ScreenContainer>
    );
  }

  return (
    <ReportForm
      key={user.uid}
      reporterId={user.uid}
      initialLocation={location}
      deviceLocation={location}
    />
  );
}

const TYPE_OPTIONS: readonly OptionGroupItem<IncidentType>[] = INCIDENT_TYPES.map((type) => ({
  value: type,
  label: INCIDENT_TYPE_LABELS[type],
  hint: INCIDENT_TYPE_HINTS[type],
}));

const SEVERITY_OPTIONS: readonly OptionGroupItem<IncidentSeverity>[] = INCIDENT_SEVERITIES.map(
  (severity) => ({
    value: severity,
    label: INCIDENT_SEVERITY_LABELS[severity],
    hint: INCIDENT_SEVERITY_HINTS[severity],
  }),
);

function ReportForm({
  reporterId,
  initialLocation,
  deviceLocation,
}: {
  reporterId: string;
  initialLocation: Coordinates;
  deviceLocation: Coordinates | null;
}) {
  const theme = useTheme();
  const router = useRouter();
  const invalidateMyReports = useInvalidateMyReports();

  const [images, setImages] = useState<SelectedImage[]>([]);
  const { state, submit, cancel, reset } = useSubmitReport();

  const {
    control,
    handleSubmit,
    reset: resetForm,
    setValue,
    formState: { errors },
  } = useForm<IncidentReportFormValues>({
    resolver: zodResolver(incidentReportFormSchema),
    defaultValues: {
      type: 'accident',
      severity: 'medium',
      description: '',
      latitude: initialLocation.latitude,
      longitude: initialLocation.longitude,
      occurredAtMs: undefined,
    },
    mode: 'onBlur',
  });

  const latitude = useWatch({ control, name: 'latitude' });
  const longitude = useWatch({ control, name: 'longitude' });
  const coordinateError = errors.latitude?.message ?? errors.longitude?.message;

  const submitting = state.status === 'submitting';

  /**
   * Record a completed upload against the local image.
   *
   * This is what makes "Try again" resume instead of restart: the next attempt
   * partitions on `downloadUrl` and re-sends only what never finished.
   */
  const markUploaded = useCallback((uri: string, downloadUrl: string) => {
    setImages((current) =>
      current.map((image) => (image.uri === uri ? { ...image, downloadUrl } : image)),
    );
  }, []);

  const onSubmit = handleSubmit(async (values) => {
    const outcome = await submit({
      reporterId,
      values,
      images,
      onImageUploaded: markUploaded,
    });

    if (outcome.status === 'succeeded') {
      invalidateMyReports(reporterId);
    }
  });

  const startAnother = () => {
    reset();
    setImages([]);
    resetForm({
      type: 'accident',
      severity: 'medium',
      description: '',
      latitude: initialLocation.latitude,
      longitude: initialLocation.longitude,
      occurredAtMs: undefined,
    });
  };

  if (state.status === 'succeeded') {
    return (
      <ScreenContainer scrollable testID="report-screen">
        <View style={{ gap: theme.spacing.lg }} accessibilityRole="alert">
          <AppText variant="titleLarge">Report submitted</AppText>
          <AppText variant="body" color="textMuted">
            {REPORT_SUBMITTED_NOTICE}
          </AppText>

          <AppButton
            label="View my reports"
            onPress={() => router.push('/reports')}
            fullWidth
            testID="view-my-reports"
          />
          <AppButton
            label="Report something else"
            variant="secondary"
            onPress={startAnother}
            fullWidth
            testID="report-another"
          />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer scrollable testID="report-screen" withBottomInset>
      <View style={{ gap: theme.spacing.xl }}>
        <View style={{ gap: theme.spacing.xs }}>
          <AppText variant="titleLarge">Report an incident</AppText>
          <AppText variant="bodySmall" color="textMuted">
            {REPORT_SUBMISSION_NOTICE}
          </AppText>
        </View>

        {state.status === 'failed' ? (
          <ErrorState
            error={state.error}
            title="Your report was not submitted"
            onRetry={() => void onSubmit()}
            testID="report-submit-error"
          />
        ) : null}

        <Controller
          control={control}
          name="type"
          render={({ field: { onChange, value } }) => (
            <OptionGroup
              label="What are you reporting?"
              options={TYPE_OPTIONS}
              value={value}
              onChange={onChange}
              disabled={submitting}
              {...(errors.type?.message === undefined ? {} : { error: errors.type.message })}
              testID="report-type"
            />
          )}
        />

        <Controller
          control={control}
          name="description"
          render={({ field: { onChange, onBlur, value } }) => (
            <AppTextInput
              label="What happened?"
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              {...(errors.description?.message === undefined
                ? {}
                : { error: errors.description.message })}
              hint={`Between ${DESCRIPTION_MIN_LENGTH} and ${DESCRIPTION_MAX_LENGTH} characters. Avoid names and number plates.`}
              multiline
              numberOfLines={5}
              minHeight={120}
              maxLength={DESCRIPTION_MAX_LENGTH}
              editable={!submitting}
              textAlignVertical="top"
              testID="report-description"
            />
          )}
        />

        <Controller
          control={control}
          name="severity"
          render={({ field: { onChange, value } }) => (
            <OptionGroup
              label="How serious was it?"
              options={SEVERITY_OPTIONS}
              value={value}
              onChange={onChange}
              disabled={submitting}
              {...(errors.severity?.message === undefined
                ? {}
                : { error: errors.severity.message })}
              testID="report-severity"
            />
          )}
        />

        {/*
          Latitude and longitude are one control writing two form fields. They
          stay in the form rather than in component state so the same Zod schema
          validates them, instead of a second hand-written coordinate check that
          could drift from the one the payload builder applies.
        */}
        <ReportLocationPicker
          value={{ latitude, longitude }}
          onChange={(next) => {
            setValue('latitude', next.latitude, { shouldValidate: true });
            setValue('longitude', next.longitude, { shouldValidate: true });
          }}
          deviceLocation={deviceLocation}
          disabled={submitting}
          {...(coordinateError === undefined ? {} : { error: coordinateError })}
        />

        <Controller
          control={control}
          name="occurredAtMs"
          render={({ field: { onChange, value } }) => (
            <ReportOccurredAtField
              value={value}
              onChange={onChange}
              disabled={submitting}
              {...(errors.occurredAtMs?.message === undefined
                ? {}
                : { error: errors.occurredAtMs.message })}
            />
          )}
        />

        <ReportPhotoPicker images={images} onChange={setImages} disabled={submitting} />

        {submitting ? (
          <ProgressBar
            fraction={state.progress.fraction}
            label={
              state.progress.stage === 'saving'
                ? 'Saving your report…'
                : state.progress.totalCount === 0
                  ? 'Submitting…'
                  : `Uploading photo ${Math.min(state.progress.uploadedCount + 1, state.progress.totalCount)} of ${state.progress.totalCount}`
            }
            testID="report-progress"
          />
        ) : null}

        <AppButton
          label="Submit report"
          size="large"
          onPress={() => void onSubmit()}
          loading={submitting}
          fullWidth
          accessibilityHint="Sends your report to a moderator for review"
          testID="submit-report"
        />

        {/*
          Always reachable while a submission is running. The Storage instance
          now bounds its own retries, but a user on a dying connection must never
          be left with only a spinner and no way out — and cancelling keeps the
          photos that already uploaded, so trying again resumes.
        */}
        {submitting ? (
          <AppButton
            label="Cancel"
            variant="ghost"
            onPress={cancel}
            fullWidth
            accessibilityHint="Stops sending this report. Nothing is submitted."
            testID="cancel-submit"
          />
        ) : null}
      </View>
    </ScreenContainer>
  );
}

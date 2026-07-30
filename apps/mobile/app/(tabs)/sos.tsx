import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AppButton,
  AppText,
  AppTextInput,
  DisclaimerNotice,
  ErrorState,
  ScreenContainer,
} from '@/components';
import { SOS_DELIVERY_DISCLAIMER } from '@/constants/disclaimer';
import { useAuth } from '@/features/auth/AuthProvider';
import { useEmergencyContacts } from '@/features/emergency-contacts/useEmergencyContacts';
import { useLocation } from '@/features/location/useLocation';
import { SosContactPicker } from '@/features/sos/SosContactPicker';
import { SosCountdownOverlay } from '@/features/sos/SosCountdownOverlay';
import {
  callContact,
  copySosMessage,
  sendSosSms,
  shareSosMessage,
  SOS_OUTCOME_MESSAGES,
  type SosDeliveryOutcome,
} from '@/features/sos/sosDelivery';
import {
  SOS_LOCATING,
  SOS_NO_CONTACTS,
  SOS_NO_LOCATION_WARNING,
  SOS_NOT_EMERGENCY_SERVICES,
  SOS_PREVIEW_LABEL,
  SOS_WHAT_THIS_DOES,
} from '@/features/sos/sosCopy';
import { buildSosMessage, SOS_NOTE_MAX_LENGTH } from '@/features/sos/sosMessage';
import { useSosCountdown } from '@/features/sos/useSosCountdown';
import { useTheme } from '@/theme';
import { toAppError, type AppError } from '@/utils/errors';
import { useNow } from '@/utils/useNow';

/** How often the previewed "Sent at" line is refreshed, in milliseconds. */
const PREVIEW_CLOCK_INTERVAL_MS = 10_000;

/**
 * Emergency SOS.
 *
 * ## What this screen refuses to do
 *
 * It never says a message was delivered, because it cannot know — see
 * `sosDelivery` for the platform detail. It never contacts the emergency
 * services, and says so above the button rather than below it. And it never
 * blocks on location: a fix that will not arrive must not stop someone asking
 * for help, so a missing position downgrades the message rather than the screen.
 *
 * ## Why the message is shown before it is sent
 *
 * The preview is not a nicety. The user is about to disclose their exact
 * position to another person, and they are entitled to read the words that
 * disclosure will be wrapped in first.
 */
export default function SosScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { user, profile } = useAuth();

  // High accuracy: an SOS is exactly the case where the battery cost is worth
  // paying. `useLocation` never throws — permission problems arrive as state.
  const {
    location,
    loading: locating,
    error: locationError,
    permission,
    requestAccess,
  } = useLocation('high');

  const {
    contacts,
    loading: contactsLoading,
    error: contactsError,
  } = useEmergencyContacts(user?.uid ?? null);

  const [selectedIds, setSelectedIds] = useState<string[] | null>(null);
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState<SosDeliveryOutcome | null>(null);
  const [actionError, setActionError] = useState<AppError | null>(null);
  const [sending, setSending] = useState(false);

  /**
   * Default the selection to the primary contact, falling back to the first.
   *
   * Derived rather than written into state by an effect: the React Compiler
   * rules reject the latter, and it would also fight a user who had already
   * deselected everyone. `null` means "the user has not touched this yet".
   */
  const effectiveSelection = useMemo(() => {
    if (selectedIds !== null) {
      return selectedIds;
    }
    const primary = contacts.find((contact) => contact.isPrimary) ?? contacts[0];
    return primary === undefined ? [] : [primary.id];
  }, [contacts, selectedIds]);

  const selectedContacts = useMemo(
    () => contacts.filter((contact) => effectiveSelection.includes(contact.id)),
    [contacts, effectiveSelection],
  );

  /**
   * The preview timestamp is kept live by an explicit clock rather than by
   * reading `Date.now()` while rendering, which the React Compiler rules reject
   * as an impure read. Ten seconds is the coarsest tick that still leaves the
   * "Sent at" line honest — it is the moment the message was composed, and the
   * string previewed is the exact string sent.
   */
  const now = useNow(PREVIEW_CLOCK_INTERVAL_MS);

  const message = useMemo(
    () =>
      buildSosMessage({
        senderName: profile?.name ?? '',
        location:
          location === null
            ? null
            : {
                latitude: location.latitude,
                longitude: location.longitude,
                accuracyM: location.accuracyM,
              },
        now,
        note,
      }),
    [location, note, now, profile?.name],
  );

  const dispatchSos = useCallback(async (): Promise<void> => {
    setSending(true);
    setActionError(null);
    try {
      const result = await sendSosSms(
        selectedContacts.map((contact) => contact.phone),
        message,
      );
      setOutcome(result);
    } catch (error) {
      setActionError(toAppError(error));
    } finally {
      setSending(false);
    }
  }, [message, selectedContacts]);

  const countdown = useSosCountdown(() => {
    void dispatchSos();
  });

  const canSend = selectedContacts.length > 0 && !sending;

  const runAction = async (action: () => Promise<unknown>): Promise<void> => {
    setActionError(null);
    try {
      await action();
    } catch (error) {
      setActionError(toAppError(error));
    }
  };

  return (
    <ScreenContainer scrollable testID="sos-screen" withBottomInset>
      <View style={{ gap: theme.spacing.xl }}>
        <View style={{ gap: theme.spacing.sm }}>
          <AppText variant="titleLarge">Emergency SOS</AppText>
          <AppText variant="bodySmall" color="textMuted">
            {SOS_WHAT_THIS_DOES}
          </AppText>

          {/* Above the button, not below it. */}
          <View
            accessibilityRole="alert"
            style={{
              backgroundColor: theme.colors.surfaceMuted,
              borderLeftColor: theme.colors.danger,
              borderLeftWidth: 4,
              borderRadius: theme.radius.sm,
              padding: theme.spacing.md,
            }}
          >
            <AppText variant="bodySmall">{SOS_NOT_EMERGENCY_SERVICES}</AppText>
          </View>
        </View>

        {/* ------------------------------------------------------------------ */}
        <LocationStatus
          locating={locating}
          hasLocation={location !== null}
          blocked={permission !== 'granted'}
          error={locationError}
          onRequestAccess={() => void requestAccess()}
        />

        {/* ------------------------------------------------------------------ */}
        {contactsError !== null ? (
          <ErrorState error={contactsError} title="Could not load your contacts" />
        ) : contactsLoading ? (
          <AppText variant="bodySmall" color="textMuted">
            Loading your contacts…
          </AppText>
        ) : contacts.length === 0 ? (
          <View style={{ gap: theme.spacing.sm }}>
            <AppText variant="bodySmall" color="textMuted">
              {SOS_NO_CONTACTS}
            </AppText>
            <AppButton
              label="Add an emergency contact"
              onPress={() => router.push('/emergency-contacts')}
              fullWidth
              testID="sos-add-contact"
            />
          </View>
        ) : (
          <View style={{ gap: theme.spacing.sm }}>
            <SosContactPicker
              contacts={contacts}
              selectedIds={effectiveSelection}
              onToggle={(contactId) =>
                setSelectedIds((current) => {
                  const base = current ?? effectiveSelection;
                  return base.includes(contactId)
                    ? base.filter((id) => id !== contactId)
                    : [...base, contactId];
                })
              }
              disabled={sending}
            />
            <AppButton
              label="Manage contacts"
              variant="ghost"
              onPress={() => router.push('/emergency-contacts')}
              testID="sos-manage-contacts"
            />
          </View>
        )}

        {/* ------------------------------------------------------------------ */}
        <AppTextInput
          label="Anything else they should know?"
          optional
          value={note}
          onChangeText={setNote}
          hint="Added to the end of the message."
          multiline
          minHeight={80}
          maxLength={SOS_NOTE_MAX_LENGTH}
          editable={!sending}
          testID="sos-note"
        />

        {/* ------------------------------------------------------------------ */}
        <View style={{ gap: theme.spacing.xs }}>
          <AppText variant="label" color="textMuted">
            {SOS_PREVIEW_LABEL}
          </AppText>
          <View
            style={{
              backgroundColor: theme.colors.surfaceMuted,
              borderRadius: theme.radius.md,
              padding: theme.spacing.md,
            }}
          >
            <AppText variant="bodySmall" testID="sos-preview">
              {message}
            </AppText>
          </View>
        </View>

        {/* ------------------------------------------------------------------ */}
        {actionError !== null ? (
          <ErrorState error={actionError} title="That did not work" testID="sos-error" />
        ) : null}

        {outcome !== null ? (
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={{
              backgroundColor: theme.colors.surfaceMuted,
              borderRadius: theme.radius.md,
              gap: theme.spacing.xs,
              padding: theme.spacing.md,
            }}
            testID="sos-outcome"
          >
            <AppText variant="bodySmall">{SOS_OUTCOME_MESSAGES[outcome]}</AppText>
          </View>
        ) : null}

        <AppButton
          label="Send SOS"
          variant="danger"
          size="large"
          fullWidth
          disabled={!canSend}
          loading={sending}
          onPress={() => {
            setOutcome(null);
            setActionError(null);
            countdown.start();
          }}
          accessibilityHint="Starts a three second countdown you can cancel before anything is prepared"
          testID="sos-send"
        />

        {selectedContacts.length === 0 && contacts.length > 0 ? (
          <AppText variant="caption" color="danger">
            Choose at least one contact, or use Copy or Share below.
          </AppText>
        ) : null}

        {/* ------------------------------------------------------------------ */}
        <View style={{ gap: theme.spacing.sm }}>
          <AppText variant="titleSmall">If that does not work</AppText>
          <AppText variant="caption" color="textSubtle">
            These always work, even with no signal for text messages.
          </AppText>

          <View style={styles.fallbackRow}>
            <AppButton
              label="Copy message"
              variant="secondary"
              onPress={() => void runAction(() => copySosMessage(message))}
              style={styles.fallback}
              testID="sos-copy"
            />
            <AppButton
              label="Share"
              variant="secondary"
              onPress={() => void runAction(() => shareSosMessage(message))}
              style={styles.fallback}
              testID="sos-share"
            />
          </View>

          {selectedContacts.map((contact) => (
            <AppButton
              key={contact.id}
              label={`Call ${contact.name}`}
              variant="secondary"
              onPress={() => void runAction(() => callContact(contact.phone))}
              accessibilityHint="Opens your dialler. This app never places a call by itself."
              fullWidth
              testID={`sos-call-${contact.id}`}
            />
          ))}
        </View>

        {/* ------------------------------------------------------------------ */}
        <View style={{ gap: theme.spacing.sm }}>
          <AppText variant="caption" color="textSubtle">
            {SOS_DELIVERY_DISCLAIMER}
          </AppText>
          <DisclaimerNotice />
        </View>
      </View>

      <SosCountdownOverlay
        visible={countdown.cancellable}
        secondsRemaining={countdown.secondsRemaining}
        onCancel={countdown.cancel}
      />
    </ScreenContainer>
  );
}

/**
 * Says where the location stands, in words the user can act on.
 *
 * Distinguishes "still looking" from "not permitted" from "failed", because the
 * response differs: wait, grant access, or accept a message without a position.
 * Collapsing them would leave someone tapping a button that does nothing.
 */
function LocationStatus({
  locating,
  hasLocation,
  blocked,
  error,
  onRequestAccess,
}: {
  locating: boolean;
  hasLocation: boolean;
  blocked: boolean;
  error: AppError | null;
  onRequestAccess: () => void;
}) {
  const theme = useTheme();

  if (hasLocation) {
    return (
      <AppText variant="bodySmall" color="textMuted" testID="sos-location-ok">
        Your location will be included in the message.
      </AppText>
    );
  }

  return (
    <View style={{ gap: theme.spacing.sm }} testID="sos-location-warning">
      <View
        accessibilityRole="alert"
        style={{
          backgroundColor: theme.colors.surfaceMuted,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
        }}
      >
        <AppText variant="bodySmall">
          {locating ? SOS_LOCATING : (error?.userMessage ?? SOS_NO_LOCATION_WARNING)}
        </AppText>
      </View>

      {blocked && !locating ? (
        <AppButton
          label="Allow location access"
          variant="secondary"
          onPress={onRequestAccess}
          fullWidth
          testID="sos-request-location"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fallbackRow: { flexDirection: 'row', gap: 12 },
  fallback: { flex: 1 },
});

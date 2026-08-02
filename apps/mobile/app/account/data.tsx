import * as Clipboard from 'expo-clipboard';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { Share, View } from 'react-native';

import {
  AppButton,
  AppText,
  AppTextInput,
  ConfirmationDialog,
  ErrorState,
  ScreenContainer,
} from '@/components';
import { deleteAccount, exportMyData } from '@/features/account/accountDataService';
import { useTheme } from '@/theme';
import { toAppError, type AppError } from '@/utils/errors';

/**
 * "Your data" — export and account deletion.
 *
 * Phase 12's privacy obligations, made reachable. Both operations run as
 * callable Cloud Functions because the security rules deliberately stop a client
 * deleting its own reports and Storage objects; see `accountDataService`.
 *
 * ## Why deletion needs more than a confirmation dialog
 *
 * Every other destructive action in this app is recoverable or small — a
 * contact can be re-added, a report can be filed again. This one is neither, and
 * it is reached from the same settings screen as a theme switch. So it asks the
 * person to **type the word** before the button becomes usable, which is not
 * friction for its own sake: it converts a mis-tap into a no-op, and it makes
 * the confirmation an act rather than a reflex.
 *
 * The screen also states plainly what survives. Somebody deleting their account
 * to remove their data is entitled to know that an approved report is kept with
 * their identity cut out of it, *before* they decide — burying that in a privacy
 * policy would make the promise on this screen misleading.
 */

/** Typed to arm the delete button. Compared case-insensitively; a shout is still consent. */
const CONFIRMATION_WORD = 'DELETE';

export default function AccountDataScreen() {
  const theme = useTheme();

  return (
    <ScreenContainer scrollable testID="account-data-screen">
      <Stack.Screen options={{ title: 'Your data' }} />

      <View style={{ gap: theme.spacing.xl }}>
        <ExportSection />
        <DeleteSection />
      </View>
    </ScreenContainer>
  );
}

function ExportSection() {
  const theme = useTheme();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleExport(share: boolean): Promise<void> {
    setBusy(true);
    setError(null);
    setCopied(false);

    try {
      const json = await exportMyData();

      if (share) {
        // The share sheet rather than a file: the app has no file-system
        // dependency, and every platform's sheet can already forward text to
        // mail, notes or cloud storage — which is what somebody does with an
        // export anyway.
        await Share.share({ message: json });
      } else {
        await Clipboard.setStringAsync(json);
        setCopied(true);
      }
    } catch (caught) {
      setError(toAppError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText variant="titleSmall">Download your data</AppText>

      <AppText variant="bodySmall" color="textMuted">
        A copy of everything this app holds about you: your profile and settings, every report you
        have filed and what a moderator decided about it, your emergency contacts, and the record of
        warnings you were shown.
      </AppText>

      <AppText variant="caption" color="textSubtle">
        Photographs are not included in the file itself — each report lists the links to its images,
        which you can open while your account exists. The identity of the moderator who reviewed a
        report is not included; their decision and any note to you are.
      </AppText>

      {error !== null ? <ErrorState error={error} title="Export failed" /> : null}

      <AppButton
        label="Share my data"
        variant="secondary"
        loading={busy}
        onPress={() => void handleExport(true)}
        fullWidth
        accessibilityHint="Prepares your data and opens the share sheet"
      />

      <AppButton
        label="Copy to clipboard"
        variant="secondary"
        loading={busy}
        onPress={() => void handleExport(false)}
        fullWidth
        accessibilityHint="Prepares your data and copies it to the clipboard"
      />

      {copied ? (
        <AppText variant="caption" color="textSubtle">
          Copied. Paste it somewhere safe — the clipboard is readable by other apps.
        </AppText>
      ) : null}
    </View>
  );
}

function DeleteSection() {
  const theme = useTheme();

  const [confirmation, setConfirmation] = useState('');
  const [showDialog, setShowDialog] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AppError | null>(null);

  const armed = confirmation.trim().toUpperCase() === CONFIRMATION_WORD;

  async function handleDelete(): Promise<void> {
    setShowDialog(false);
    setBusy(true);
    setError(null);

    try {
      await deleteAccount();
      // No navigation. Deleting the Auth record fires the SDK's auth state
      // listener, and `AuthProvider` returns the app to sign-in on its own —
      // pushing a route here would race that redirect.
    } catch (caught) {
      setError(toAppError(caught));
      setBusy(false);
    }
  }

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <AppText variant="titleSmall">Delete your account</AppText>

      <AppText variant="bodySmall" color="textMuted">
        This cannot be undone. Download your data first if you want to keep it.
      </AppText>

      <AppText variant="bodySmall">Deleted immediately and permanently:</AppText>
      <AppText variant="bodySmall" color="textMuted">
        Your profile and settings · your emergency contacts · every photograph you uploaded · the
        record of warnings you were shown · any report still waiting for a decision or already
        rejected · your sign-in.
      </AppText>

      {/*
        Said before the decision, not after. Somebody deleting their account to
        remove their data is entitled to know what is kept and why, at the point
        where the information can still change their mind.
      */}
      <AppText variant="bodySmall">Kept, with your name and identity removed:</AppText>
      <AppText variant="bodySmall" color="textMuted">
        Reports a moderator approved. A black spot warning shown to other people rests on those
        reports as evidence, so the incident is kept — where it happened, what kind it was, how
        severe — while the link to you is erased. Their photographs are deleted with the rest.
      </AppText>

      {error !== null ? <ErrorState error={error} title="Deletion failed" /> : null}

      <AppTextInput
        label={`Type ${CONFIRMATION_WORD} to confirm`}
        value={confirmation}
        onChangeText={setConfirmation}
        autoCapitalize="characters"
        autoCorrect={false}
        editable={!busy}
        testID="delete-confirmation-input"
        accessibilityHint={`Type the word ${CONFIRMATION_WORD} to enable the delete button`}
      />

      <AppButton
        label="Delete my account"
        variant="danger"
        // Disabled rather than hidden: a control you can see but cannot press
        // explains itself, where one that appears on the right keystroke is a
        // surprise.
        disabled={!armed || busy}
        loading={busy}
        onPress={() => setShowDialog(true)}
        fullWidth
        testID="delete-account-button"
        accessibilityHint={
          armed
            ? 'Asks you to confirm once more, then deletes your account'
            : `Type ${CONFIRMATION_WORD} in the field above first`
        }
      />

      <ConfirmationDialog
        visible={showDialog}
        title="Delete your account?"
        message="This removes your profile, contacts, photographs and pending reports, and signs you out. Approved reports are kept without your identity. It cannot be undone."
        confirmLabel="Delete permanently"
        destructive
        onConfirm={() => void handleDelete()}
        onCancel={() => setShowDialog(false)}
        testID="delete-account-dialog"
      />
    </View>
  );
}

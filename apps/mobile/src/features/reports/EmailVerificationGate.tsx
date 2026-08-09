import { useState } from 'react';
import { View } from 'react-native';

import { AppButton, AppText } from '@/components';
import { requestEmailVerification, refreshEmailVerification } from '@/features/auth/authService';
import {
  REPORT_STILL_UNVERIFIED_NOTICE,
  REPORT_UNVERIFIED_EMAIL_NOTICE,
  REPORT_UNVERIFIED_EMAIL_STILL_WORKS,
  REPORT_UNVERIFIED_EMAIL_TITLE,
} from '@/features/reports/reportCopy';
import { useTheme } from '@/theme';
import { getFirebaseAuth } from '@/services/firebase/app';

/**
 * Shown in place of the report form when the account's address is unconfirmed.
 *
 * ## Why the client checks at all
 *
 * The rule is enforced in `firestore.rules` and that is what makes it binding —
 * this component cannot be the enforcement point and is not trying to be. It
 * exists because the server-side refusal arrives as `PERMISSION_DENIED` *after*
 * the user has written a description, chosen a severity, placed a pin and
 * possibly uploaded a photograph. Letting somebody do all that and then telling
 * them it was never going to work is the failure this avoids.
 *
 * ## The token refresh
 *
 * "I have confirmed my address" does not just re-read a flag. The claim the
 * rules read lives inside the ID token, which was minted before the user
 * clicked the link — so the button forces a token refresh. See
 * `refreshEmailVerification` for why that is the part that actually matters.
 */

export interface EmailVerificationGateProps {
  /** Called once the address is confirmed, so the caller can show the form. */
  onVerified: () => void;
  testID?: string;
}

export function EmailVerificationGate({ onVerified, testID }: EmailVerificationGateProps) {
  const theme = useTheme();
  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [stillUnverified, setStillUnverified] = useState(false);
  const [resent, setResent] = useState(false);

  async function handleCheck(): Promise<void> {
    setChecking(true);
    setResent(false);
    try {
      const verified = await refreshEmailVerification();
      // Only ever set to true here. Clearing it on a successful check would be
      // pointless — the component unmounts — and leaving it set while the user
      // waits is what makes the message stay readable.
      setStillUnverified(!verified);
      if (verified) {
        onVerified();
      }
    } finally {
      setChecking(false);
    }
  }

  async function handleResend(): Promise<void> {
    const user = getFirebaseAuth().currentUser;
    if (user === null) return;

    setResending(true);
    setStillUnverified(false);
    try {
      await requestEmailVerification(user);
      // Reported as sent even when the send was rate-limited and logged as a
      // warning. The user cannot act on the difference, and "we could not send
      // it" would be misleading when the earlier email is still valid.
      setResent(true);
    } finally {
      setResending(false);
    }
  }

  const email = getFirebaseAuth().currentUser?.email ?? null;

  return (
    <View style={{ gap: theme.spacing.md }} testID={testID}>
      <AppText variant="titleMedium">{REPORT_UNVERIFIED_EMAIL_TITLE}</AppText>

      <AppText variant="bodySmall">{REPORT_UNVERIFIED_EMAIL_NOTICE}</AppText>

      {email !== null ? (
        <AppText variant="bodySmall" color="textMuted">
          Sent to {email}.
        </AppText>
      ) : null}

      {/*
        Not a footnote. Somebody who reads the message above as "the app is off
        until you do this" may stop relying on warnings or SOS, which are not
        gated and which are the whole point of the app.
      */}
      <AppText variant="bodySmall" color="textMuted">
        {REPORT_UNVERIFIED_EMAIL_STILL_WORKS}
      </AppText>

      <AppButton
        label="I have confirmed my address"
        onPress={() => void handleCheck()}
        loading={checking}
        disabled={resending}
        fullWidth
        testID="email-verification-check"
      />

      <AppButton
        label="Send the email again"
        variant="secondary"
        onPress={() => void handleResend()}
        loading={resending}
        disabled={checking}
        fullWidth
        testID="email-verification-resend"
      />

      {stillUnverified ? (
        <AppText variant="caption" color="danger" testID="email-verification-still-unverified">
          {REPORT_STILL_UNVERIFIED_NOTICE}
        </AppText>
      ) : null}

      {resent ? (
        <AppText variant="caption" color="textMuted" testID="email-verification-resent">
          Sent. It can take a minute to arrive.
        </AppText>
      ) : null}
    </View>
  );
}

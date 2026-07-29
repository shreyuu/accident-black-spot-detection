import * as Clipboard from 'expo-clipboard';
import * as SMS from 'expo-sms';
import { Linking, Share } from 'react-native';

import { toDialString, toTelUri } from '@/features/sos/phoneNumber';
import { AppError } from '@/utils/errors';
import { logger } from '@/utils/logger';

/**
 * Getting the SOS message off the device.
 *
 * ## What this module is careful never to claim
 *
 * `expo-sms` opens the platform's own SMS composer. It does not send anything,
 * and it cannot observe the network. The result it returns means only what the
 * composer reported when it closed:
 *
 *   - **Android always returns `unknown`.** The platform gives no status at all,
 *     so on Android there is never any basis for saying a message was sent.
 *   - **iOS may return `sent`**, which means the user pressed send in the
 *     composer. It does not mean the message reached the network, the recipient,
 *     or a phone that was switched on.
 *
 * Every outcome below is therefore phrased as something about the *composer*,
 * never about delivery. This is risk M7 in the Phase 0 register and it is the
 * single easiest way for this feature to mislead someone in an emergency.
 *
 * ## Why the fallbacks are not optional extras
 *
 * `SMS.isAvailableAsync()` returns false on the iOS simulator, on iPads without
 * a SIM, and on any device with no messaging app. Copy, share and call are the
 * paths that keep the feature usable there — and "call" is often the better
 * choice in a real emergency anyway.
 */

export type SosDeliveryOutcome =
  /** The composer reported the user pressed send. Delivery still unconfirmed. */
  | 'composer-sent'
  /** The user closed the composer without sending. */
  | 'composer-cancelled'
  /** The composer closed without saying what happened. Always so on Android. */
  | 'composer-unknown'
  /** No SMS composer exists on this device. */
  | 'unavailable';

/**
 * User-facing wording per outcome.
 *
 * Kept beside the type so a new outcome cannot be added without someone writing
 * honest copy for it.
 */
export const SOS_OUTCOME_MESSAGES: Record<SosDeliveryOutcome, string> = {
  'composer-sent':
    'Your messaging app reported the message as sent. This app cannot confirm it was delivered — ' +
    'if you can, call someone as well.',
  'composer-cancelled': 'You closed the messaging app without sending. Nothing has been sent.',
  'composer-unknown':
    'Your messaging app was opened. This app cannot tell whether the message was sent, so check ' +
    'your messages — and if you can, call someone as well.',
  unavailable:
    'This device cannot send text messages. Use Copy, Share or Call below instead.',
};

/** Whether an SMS composer exists here at all. */
export async function isSmsAvailable(): Promise<boolean> {
  try {
    return await SMS.isAvailableAsync();
  } catch (error) {
    logger.warn('sosDelivery', 'Could not determine SMS availability', {
      error: error instanceof Error ? error.message : 'unknown',
    });
    return false;
  }
}

/**
 * Open the SMS composer addressed to the given numbers.
 *
 * Numbers that cannot be dialled are dropped rather than passed through, because
 * a malformed recipient can make some composers refuse the whole message — one
 * bad entry must not cost the user every other contact.
 */
export async function sendSosSms(
  phones: readonly string[],
  message: string,
): Promise<SosDeliveryOutcome> {
  const addresses = phones
    .map((phone) => toDialString(phone))
    .filter((phone): phone is string => phone !== null);

  if (addresses.length === 0) {
    throw new AppError('validation', 'None of the selected contacts has a usable phone number.', {
      technicalMessage: `No diallable numbers among ${phones.length} contacts.`,
    });
  }

  if (!(await isSmsAvailable())) {
    return 'unavailable';
  }

  try {
    const { result } = await SMS.sendSMSAsync(addresses, message);

    switch (result) {
      case 'sent':
        return 'composer-sent';
      case 'cancelled':
        return 'composer-cancelled';
      default:
        return 'composer-unknown';
    }
  } catch (error) {
    logger.error('sosDelivery', 'The SMS composer could not be opened', error);
    throw new AppError(
      'unavailable',
      'Your messaging app could not be opened. Use Copy, Share or Call instead.',
      { retryable: true, cause: error },
    );
  }
}

/** Put the message on the clipboard so the user can paste it anywhere. */
export async function copySosMessage(message: string): Promise<void> {
  try {
    await Clipboard.setStringAsync(message);
  } catch (error) {
    throw new AppError('unknown', 'The message could not be copied.', {
      retryable: true,
      cause: error,
    });
  }
}

/**
 * Hand the message to the system share sheet.
 *
 * The broadest fallback there is: it reaches WhatsApp, email, or anything else
 * the user has, which on a phone with no SIM but working Wi-Fi may be the only
 * route out.
 */
export async function shareSosMessage(message: string): Promise<boolean> {
  try {
    const result = await Share.share({ message });
    // `dismissedAction` is iOS-only; Android reports `sharedAction` regardless,
    // so this is "the sheet was not visibly dismissed", not "it was shared".
    return result.action !== Share.dismissedAction;
  } catch (error) {
    throw new AppError('unknown', 'The share sheet could not be opened.', {
      retryable: true,
      cause: error,
    });
  }
}

/**
 * Open the dialler on a contact's number.
 *
 * `tel:` only opens the dialler — on iOS it prompts before calling, and this app
 * never places a call by itself. That is deliberate: an app that dialled
 * automatically could tie up a line the user needed for the emergency services.
 */
export async function callContact(phone: string): Promise<void> {
  const uri = toTelUri(phone);

  if (uri === null) {
    throw new AppError('validation', 'That contact does not have a number that can be called.', {
      technicalMessage: `Not diallable: "${phone}"`,
    });
  }

  try {
    await Linking.openURL(uri);
  } catch (error) {
    throw new AppError(
      'unavailable',
      'The dialler could not be opened. Dial the number manually if you can.',
      { retryable: true, cause: error },
    );
  }
}

// `no-console` is switched off for this file in eslint.config.js — it is the one
// module permitted to call console directly.
import { env } from '@/config/env';

/**
 * The single place the app writes diagnostics.
 *
 * Routing everything through here means a crash reporter (Sentry, Crashlytics)
 * can be added in Phase 14 by editing this file alone, with no call-site churn.
 * ESLint forbids `console.*` everywhere else to keep that true.
 *
 * Privacy rule: never pass raw coordinates, email addresses, phone numbers or
 * emergency-contact details into a log. This app handles location and emergency
 * data, and logs are the easiest place for that to leak. Log identifiers and
 * derived facts ("distance 420m") instead of the personal data itself.
 */

type LogContext = Record<string, unknown>;

const isDevelopment = env.appEnv === 'development';

function format(scope: string, message: string): string {
  return `[${scope}] ${message}`;
}

export const logger = {
  /** Verbose tracing. Development only — stripped from preview/production. */
  debug(scope: string, message: string, context?: LogContext): void {
    if (!isDevelopment) {
      return;
    }
    console.log(format(scope, message), context ?? '');
  },

  info(scope: string, message: string, context?: LogContext): void {
    if (!isDevelopment) {
      return;
    }
    console.info(format(scope, message), context ?? '');
  },

  /** A recoverable problem the user may notice. Kept in all environments. */
  warn(scope: string, message: string, context?: LogContext): void {
    console.warn(format(scope, message), context ?? '');
  },

  /**
   * A failure worth investigating.
   *
   * TODO(phase-14): forward to a crash reporter here once one is configured.
   */
  error(scope: string, message: string, error?: unknown, context?: LogContext): void {
    console.error(format(scope, message), error ?? '', context ?? '');
  },
};

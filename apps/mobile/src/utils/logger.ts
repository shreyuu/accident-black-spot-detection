// `no-console` is switched off for this file in eslint.config.js — it is the one
// module permitted to call console directly.
import { env } from '@/config/env';

/**
 * The single place the app writes diagnostics.
 *
 * Routing everything through here means a crash reporter (Sentry, Crashlytics)
 * can be added by registering it once, with no call-site churn. ESLint forbids
 * `console.*` everywhere else to keep that true.
 *
 * Privacy rule: never pass raw coordinates, email addresses, phone numbers or
 * emergency-contact details into a log. This app handles location and emergency
 * data, and logs are the easiest place for that to leak. Log identifiers and
 * derived facts ("distance 420m") instead of the personal data itself.
 *
 * That rule matters more now than it did when logs only reached a development
 * console. A registered reporter transmits what it is given to a third party,
 * where it is retained. `setCrashReporter` is the point at which a breach of the
 * rule above stops being untidy and becomes a disclosure.
 */

type LogContext = Record<string, unknown>;

/**
 * What a crash reporter has to implement.
 *
 * Deliberately narrow — one method, no initialisation, no user identification,
 * no breadcrumbs. A wider interface would invite call sites to attach a uid or a
 * position "for context", which is the thing this app must not do. Anything a
 * specific vendor needs beyond this belongs in the adapter that implements it,
 * not in the shape every call site can see.
 */
export interface CrashReporter {
  /**
   * Report a failure. Must not throw, and must not block: it is called from
   * error paths, including a headless background task where an unhandled
   * rejection kills the task rather than surfacing anywhere.
   */
  captureError(details: {
    scope: string;
    message: string;
    error?: unknown;
    context?: LogContext;
  }): void;
}

/**
 * No reporter by default, and none is bundled.
 *
 * Phase 14 delivers the seam rather than an integration, which is a deliberate
 * limit and not an oversight. Choosing Sentry or Crashlytics adds a dependency,
 * an account, a DSN to distribute, and a data-processing relationship that
 * docs/security-and-privacy.md would have to describe — none of which is a
 * decision a build phase should make on the project's behalf. What the phase can
 * do is make sure the decision is a five-line change rather than a refactor, and
 * that it is tested before it is needed.
 *
 * Register one at app start, before the first screen renders:
 *
 *     setCrashReporter({ captureError: ({ scope, message, error }) => ... });
 */
let crashReporter: CrashReporter | null = null;

/**
 * Install a crash reporter, or pass `null` to remove one.
 *
 * Idempotent and safe to call more than once; the last registration wins. Tests
 * use `null` to restore the default so a registered spy cannot leak between
 * files.
 */
export function setCrashReporter(reporter: CrashReporter | null): void {
  crashReporter = reporter;
}

function format(scope: string, message: string): string {
  return `[${scope}] ${message}`;
}

/**
 * Hand a failure to the registered reporter, if any.
 *
 * Wrapped because a reporter is third-party code on an error path. If capturing
 * an error throws, the original error must still reach the console and the
 * caller must still return normally — a logging call that can itself throw turns
 * a recoverable failure into a crash, and does so only in the builds where a
 * reporter is configured, which is to say only in the ones users have.
 */
function report(details: {
  scope: string;
  message: string;
  error?: unknown;
  context?: LogContext;
}): void {
  if (crashReporter === null) {
    return;
  }

  try {
    crashReporter.captureError(details);
  } catch (reporterError) {
    console.warn(format('logger', 'Crash reporter threw while capturing an error.'), reporterError);
  }
}

const isDevelopment = env.appEnv === 'development';

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
   * Always written to the console *as well as* forwarded. The console is what a
   * developer has attached to a device in front of them; the reporter is for the
   * ones they do not.
   */
  error(scope: string, message: string, error?: unknown, context?: LogContext): void {
    console.error(format(scope, message), error ?? '', context ?? '');
    // `exactOptionalPropertyTypes` is on, so an explicit `undefined` is not the
    // same as an absent key — the properties are built conditionally rather than
    // spread in unconditionally.
    report({
      scope,
      message,
      ...(error === undefined ? {} : { error }),
      ...(context === undefined ? {} : { context }),
    });
  },
};

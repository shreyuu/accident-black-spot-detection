import { logger, setCrashReporter, type CrashReporter } from '@/utils/logger';

/**
 * The crash-reporter seam.
 *
 * Phase 14 ships the registration point rather than a vendor integration, so
 * these tests are the only thing standing between "the seam works" and "the seam
 * looks like it works" — nothing else in the app registers a reporter, and no
 * screen would notice if forwarding silently stopped.
 *
 * The first assertion is the happy path, on purpose. Phase 13's rules bug
 * survived eleven phases behind a suite that only ever asserted refusals.
 */

type Captured = Parameters<CrashReporter['captureError']>[0];

function spyReporter(): { reporter: CrashReporter; calls: Captured[] } {
  const calls: Captured[] = [];
  return {
    calls,
    reporter: {
      captureError: (details) => {
        calls.push(details);
      },
    },
  };
}

describe('logger crash reporting', () => {
  const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);

  afterEach(() => {
    // Registration is module-level state. Left installed, a spy from one test
    // would receive the next file's errors.
    setCrashReporter(null);
    consoleErrorSpy.mockClear();
    consoleWarnSpy.mockClear();
  });

  afterAll(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  it('forwards an error to a registered reporter', () => {
    const { reporter, calls } = spyReporter();
    setCrashReporter(reporter);

    const cause = new Error('upload failed');
    logger.error('reports', 'Could not submit report', cause, { attempt: 2 });

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      scope: 'reports',
      message: 'Could not submit report',
      error: cause,
      context: { attempt: 2 },
    });
  });

  it('still writes to the console when a reporter is registered', () => {
    const { reporter } = spyReporter();
    setCrashReporter(reporter);

    logger.error('reports', 'Could not submit report');

    // A developer with a device in front of them must not lose the console
    // output just because a reporter exists.
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
  });

  it('omits absent error and context rather than sending undefined keys', () => {
    const { reporter, calls } = spyReporter();
    setCrashReporter(reporter);

    logger.error('auth', 'Sign-in failed');

    expect(calls[0]).toEqual({ scope: 'auth', message: 'Sign-in failed' });
    expect(Object.keys(calls[0] ?? {})).toEqual(['scope', 'message']);
  });

  it('does nothing when no reporter is registered', () => {
    logger.error('auth', 'Sign-in failed');

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).not.toHaveBeenCalled();
  });

  it('survives a reporter that throws', () => {
    setCrashReporter({
      captureError: () => {
        throw new Error('reporter is offline');
      },
    });

    // The original failure must still reach the console, and logger.error must
    // return normally. A logging call that can throw converts a recoverable
    // error into a crash — and only in the builds that have a reporter, which
    // are the ones users have.
    expect(() => logger.error('sos', 'Could not send message')).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
  });

  it('replaces a previously registered reporter', () => {
    const first = spyReporter();
    const second = spyReporter();

    setCrashReporter(first.reporter);
    setCrashReporter(second.reporter);
    logger.error('map', 'Tile load failed');

    expect(first.calls).toHaveLength(0);
    expect(second.calls).toHaveLength(1);
  });

  it('stops forwarding once deregistered', () => {
    const { reporter, calls } = spyReporter();
    setCrashReporter(reporter);
    setCrashReporter(null);

    logger.error('map', 'Tile load failed');

    expect(calls).toHaveLength(0);
  });

  it('does not forward warnings', () => {
    const { reporter, calls } = spyReporter();
    setCrashReporter(reporter);

    logger.warn('location', 'Falling back to low accuracy');

    // Only `error` forwards. Warnings are frequent and expected — a degraded
    // location fix, a provider falling back — and sending them would bury the
    // failures worth investigating in noise the app already handles.
    expect(calls).toHaveLength(0);
  });
});

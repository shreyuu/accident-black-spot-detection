/**
 * Jest setup, applied after the test framework is installed.
 *
 * Keep this file small. Per-feature mocks belong next to the tests that need
 * them, not here, so that a test's dependencies stay visible in the test file.
 */

// Silence the Reanimated "reduced motion" warning that fires in the Node test
// environment where there is no native animation driver.
process.env.EXPO_OS = process.env.EXPO_OS ?? 'ios';

// expo-router's imperative navigation touches native modules that do not exist
// under Jest. Individual tests that assert on navigation should mock the pieces
// they use; this keeps a bare import from throwing.
jest.mock('expo-router', () => ({
  ...jest.requireActual('expo-router'),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: jest.fn(() => false),
  }),
}));

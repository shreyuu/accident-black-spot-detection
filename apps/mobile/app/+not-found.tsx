import { useRouter } from 'expo-router';

import { EmptyState, ScreenContainer } from '@/components';

/**
 * Catch-all for unmatched routes. Also the landing point for a malformed deep
 * link, so it always offers a route back into the app rather than dead-ending.
 */
export default function NotFoundScreen() {
  const router = useRouter();

  return (
    <ScreenContainer testID="not-found-screen">
      <EmptyState
        title="Screen not found"
        description="That screen does not exist or the link was mistyped."
        action={{ label: 'Go to the map', onPress: () => router.replace('/(tabs)/map') }}
      />
    </ScreenContainer>
  );
}

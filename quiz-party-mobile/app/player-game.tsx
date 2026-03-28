import { Stack, useLocalSearchParams } from 'expo-router';

import { NativeGameScreen } from '@/features/game';

export default function PlayerGameScreen() {
  const params = useLocalSearchParams<{ room?: string; source?: string }>();
  const roomCode = typeof params.room === 'string' ? params.room : '';
  const isFromHistory = params.source === 'history';

  return (
    <>
      <Stack.Screen
        options={{
          headerShown: false,
          gestureEnabled: isFromHistory,
          fullScreenGestureEnabled: isFromHistory,
        }}
      />
      <NativeGameScreen role="player" roomCode={roomCode} />
    </>
  );
}

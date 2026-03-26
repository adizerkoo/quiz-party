import { useLocalSearchParams } from 'expo-router';

import { NativeGameScreen } from '@/features/game';

export default function PlayerGameScreen() {
  const params = useLocalSearchParams<{ room?: string }>();
  const roomCode = typeof params.room === 'string' ? params.room : '';

  return <NativeGameScreen role="player" roomCode={roomCode} />;
}

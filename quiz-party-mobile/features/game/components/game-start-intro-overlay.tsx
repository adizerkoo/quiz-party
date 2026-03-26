import { useEffect, useMemo, useRef } from 'react';
import { Animated, Modal, StyleSheet, Text, View } from 'react-native';

import { gameTheme } from '@/features/game/theme/game-theme';
import { GameLobbyPlayer } from '@/features/game/types';

type GameStartIntroOverlayProps = {
  players: GameLobbyPlayer[] | null;
  onFinish: () => void;
};

export function GameStartIntroOverlay({ onFinish, players }: GameStartIntroOverlayProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;
  const visiblePlayers = useMemo(() => (players ?? []).filter((player) => !player.is_host), [players]);

  useEffect(() => {
    if (!visiblePlayers.length) {
      return undefined;
    }

    const animation = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 260,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        friction: 8,
        tension: 90,
        useNativeDriver: true,
      }),
    ]);

    animation.start();

    const timeoutId = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }).start(() => {
        scale.setValue(0.94);
        onFinish();
      });
    }, 2400);

    return () => {
      clearTimeout(timeoutId);
      animation.stop();
      opacity.setValue(0);
      scale.setValue(0.94);
    };
  }, [onFinish, opacity, scale, visiblePlayers]);

  if (!visiblePlayers.length) {
    return null;
  }

  return (
    <Modal animationType="none" transparent visible>
      <Animated.View style={[styles.overlay, { opacity }]}>
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          <Text style={styles.title}>Игра начинается!</Text>
          <Text style={styles.subtitle}>Собрались все, кто нужен. Поехали 🚀</Text>

          <View style={styles.playersWrap}>
            {visiblePlayers.map((player) => (
              <View key={`${player.name}-${player.emoji}`} style={styles.playerChip}>
                <Text style={styles.playerEmoji}>{player.emoji ?? '👤'}</Text>
                <Text style={styles.playerName}>{player.name}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.goLabel}>ПОЕХАЛИ!</Text>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    paddingHorizontal: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: gameTheme.colors.introOverlay,
  },
  card: {
    width: '100%',
    maxWidth: 520,
    borderRadius: gameTheme.radius.card,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
  },
  title: {
    color: gameTheme.colors.white,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    color: 'rgba(255,255,255,0.82)',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  playersWrap: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginTop: 18,
  },
  playerChip: {
    minWidth: 112,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: gameTheme.radius.section,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  playerEmoji: {
    fontSize: 28,
  },
  playerName: {
    marginTop: 6,
    color: gameTheme.colors.white,
    fontSize: 13,
    fontWeight: '800',
  },
  goLabel: {
    marginTop: 20,
    color: gameTheme.colors.gold,
    fontSize: 32,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
});

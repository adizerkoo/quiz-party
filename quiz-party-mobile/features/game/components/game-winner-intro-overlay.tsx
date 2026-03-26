import { useEffect, useMemo, useRef } from 'react';
import { Animated, Modal, StyleSheet, Text, View } from 'react-native';

import { gameTheme } from '@/features/game/theme/game-theme';
import { GameResultPlayer } from '@/features/game/types';
import { pluralizePoints } from '@/features/game/utils/game-view';

type GameWinnerIntroOverlayProps = {
  winners: GameResultPlayer[] | null;
  onFinish: () => void;
};

export function GameWinnerIntroOverlay({ onFinish, winners }: GameWinnerIntroOverlayProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  const visibleWinners = useMemo(() => winners ?? [], [winners]);

  useEffect(() => {
    if (!visibleWinners.length) {
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
        friction: 7,
        tension: 88,
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
        scale.setValue(0.9);
        onFinish();
      });
    }, 2600);

    return () => {
      clearTimeout(timeoutId);
      animation.stop();
      opacity.setValue(0);
      scale.setValue(0.9);
    };
  }, [onFinish, opacity, scale, visibleWinners]);

  if (!visibleWinners.length) {
    return null;
  }

  const scoreLabel = `${visibleWinners[0].score} ${pluralizePoints(visibleWinners[0].score)}`;
  const title = visibleWinners.length > 1 ? 'ПОБЕДИТЕЛИ' : 'ПОБЕДИТЕЛЬ';

  return (
    <Modal animationType="none" transparent visible>
      <Animated.View style={[styles.overlay, { opacity }]}>
        <Animated.View style={[styles.card, { transform: [{ scale }] }]}>
          <Text style={styles.kicker}>🏆 {title} 🏆</Text>

          <View style={styles.winnersWrap}>
            {visibleWinners.map((winner) => (
              <View key={`${winner.name}-${winner.score}`} style={styles.winnerChip}>
                <Text style={styles.winnerEmoji}>{winner.emoji ?? '👤'}</Text>
                <Text style={styles.winnerName}>{winner.name}</Text>
              </View>
            ))}
          </View>

          <Text style={styles.score}>{scoreLabel}</Text>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(23, 14, 74, 0.9)',
  },
  card: {
    width: '100%',
    maxWidth: 520,
    borderRadius: gameTheme.radius.card,
    paddingHorizontal: 24,
    paddingVertical: 28,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 216, 107, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 216, 107, 0.24)',
  },
  kicker: {
    color: gameTheme.colors.gold,
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '900',
    textAlign: 'center',
  },
  winnersWrap: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 12,
    marginTop: 18,
  },
  winnerChip: {
    minWidth: 120,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: gameTheme.radius.section,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  winnerEmoji: {
    fontSize: 34,
  },
  winnerName: {
    marginTop: 8,
    color: gameTheme.colors.white,
    fontSize: 15,
    fontWeight: '900',
  },
  score: {
    marginTop: 18,
    color: gameTheme.colors.white,
    fontSize: 20,
    fontWeight: '800',
  },
});

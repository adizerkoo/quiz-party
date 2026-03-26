import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, View } from 'react-native';

import { GameIntroBackdrop, GameIntroParticleBurst, GameIntroShockwaveRing } from '@/features/game/components/game-intro-effects';
import { buildWinnerIntroHapticEvents, scheduleIntroHaptics } from '@/features/game/components/game-intro-haptics';
import { gameTheme } from '@/features/game/theme/game-theme';
import { GameResultPlayer } from '@/features/game/types';
import { pluralizePoints } from '@/features/game/utils/game-view';

type GameWinnerIntroOverlayProps = {
  onFinish: () => void;
  winners: GameResultPlayer[] | null;
};

type WinnerBoltProps = {
  delay: number;
  mirrored?: boolean;
  style: object;
};

type WinnerEmojiProps = {
  delay: number;
  emoji: string;
  size: number;
};

function WinnerBolt({ delay, mirrored = false, style }: WinnerBoltProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scaleY = useRef(new Animated.Value(0.1)).current;

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 110,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.18,
            duration: 220,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(scaleY, {
          toValue: 1,
          duration: 260,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      opacity.stopAnimation();
      scaleY.stopAnimation();
    };
  }, [delay, opacity, scaleY]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.boltWrap,
        style,
        {
          opacity,
          transform: [{ scaleX: mirrored ? -1 : 1 }, { scaleY }],
        },
      ]}>
      <View style={[styles.boltSegment, styles.boltSegmentTop]} />
      <View style={[styles.boltSegment, styles.boltSegmentMiddle]} />
      <View style={[styles.boltSegment, styles.boltSegmentBottom]} />
    </Animated.View>
  );
}

function WinnerEmoji({ delay, emoji, size }: WinnerEmojiProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-720)).current;
  const scale = useRef(new Animated.Value(0.08)).current;
  const rotate = useRef(new Animated.Value(-18)).current;
  const haloScale = useRef(new Animated.Value(0.84)).current;
  const haloOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(translateY, {
            toValue: 18,
            duration: 360,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: -6,
            duration: 120,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 3,
            duration: 90,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: 90,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.12,
            duration: 360,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.94,
            duration: 120,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1.03,
            duration: 90,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 90,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(rotate, {
            toValue: 5,
            duration: 360,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(rotate, {
            toValue: -2,
            duration: 120,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(rotate, {
            toValue: 1,
            duration: 90,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(rotate, {
            toValue: 0,
            duration: 90,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();

      Animated.parallel([
        Animated.sequence([
          Animated.timing(haloOpacity, {
            toValue: 0.65,
            duration: 240,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(haloOpacity, {
            toValue: 0.36,
            duration: 1200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.loop(
          Animated.sequence([
            Animated.timing(haloScale, {
              toValue: 1.14,
              duration: 880,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(haloScale, {
              toValue: 0.9,
              duration: 880,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        ),
      ]).start();
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      opacity.stopAnimation();
      translateY.stopAnimation();
      scale.stopAnimation();
      rotate.stopAnimation();
      haloOpacity.stopAnimation();
      haloScale.stopAnimation();
    };
  }, [delay, haloOpacity, haloScale, opacity, rotate, scale, translateY]);

  return (
    <Animated.View
      style={[
        styles.winnerEmojiWrap,
        {
          opacity,
          transform: [
            { translateY },
            { scale },
            {
              rotate: rotate.interpolate({
                inputRange: [-18, 5],
                outputRange: ['-18deg', '5deg'],
              }),
            },
          ],
        },
      ]}>
      <Animated.View style={[styles.winnerHalo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]} />
      <Text style={[styles.winnerEmoji, { fontSize: size }]}>{emoji}</Text>
    </Animated.View>
  );
}

// Финальное интро повторяет веб-ощущение: тёмный космос, молнии, ударные волны,
// эпичное приземление победителя и поэтапное раскрытие имени, титула и счёта.
export function GameWinnerIntroOverlay({ onFinish, winners }: GameWinnerIntroOverlayProps) {
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const nameOpacity = useRef(new Animated.Value(0)).current;
  const nameTranslateY = useRef(new Animated.Value(18)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleScale = useRef(new Animated.Value(0.7)).current;
  const scoreOpacity = useRef(new Animated.Value(0)).current;
  const scoreTranslateY = useRef(new Animated.Value(12)).current;
  const visibleWinners = useMemo(() => winners ?? [], [winners]);
  const hapticEvents = useMemo(() => buildWinnerIntroHapticEvents(), []);

  useEffect(() => {
    if (!visibleWinners.length) {
      return undefined;
    }

    const timeoutIds: ReturnType<typeof setTimeout>[] = [];
    // Вибро-акценты синхронизируем с теми же таймингами, что и главный победный reveal.
    const hapticTimeouts = scheduleIntroHaptics(hapticEvents);

    Animated.timing(overlayOpacity, {
      toValue: 1,
      duration: 360,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

    timeoutIds.push(
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(nameOpacity, {
            toValue: 1,
            duration: 520,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(nameTranslateY, {
            toValue: 0,
            duration: 520,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]).start();
      }, 1750),
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(titleOpacity, {
            toValue: 0.95,
            duration: 420,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(titleScale, {
              toValue: 1.08,
              duration: 260,
              easing: Easing.out(Easing.back(1.2)),
              useNativeDriver: true,
            }),
            Animated.timing(titleScale, {
              toValue: 1,
              duration: 120,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        ]).start();
      }, 2150),
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(scoreOpacity, {
            toValue: 1,
            duration: 320,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scoreTranslateY, {
            toValue: 0,
            duration: 320,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]).start();
      }, 2480),
      setTimeout(() => {
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 900,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }).start(() => {
          nameOpacity.setValue(0);
          nameTranslateY.setValue(18);
          titleOpacity.setValue(0);
          titleScale.setValue(0.7);
          scoreOpacity.setValue(0);
          scoreTranslateY.setValue(12);
          onFinish();
        });
      }, 4500),
    );

    return () => {
      hapticTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
      overlayOpacity.stopAnimation();
      nameOpacity.stopAnimation();
      nameTranslateY.stopAnimation();
      titleOpacity.stopAnimation();
      titleScale.stopAnimation();
      scoreOpacity.stopAnimation();
      scoreTranslateY.stopAnimation();
      overlayOpacity.setValue(0);
      nameOpacity.setValue(0);
      nameTranslateY.setValue(18);
      titleOpacity.setValue(0);
      titleScale.setValue(0.7);
      scoreOpacity.setValue(0);
      scoreTranslateY.setValue(12);
    };
  }, [hapticEvents, nameOpacity, nameTranslateY, onFinish, overlayOpacity, scoreOpacity, scoreTranslateY, titleOpacity, titleScale, visibleWinners]);

  if (!visibleWinners.length) {
    return null;
  }

  const isMulti = visibleWinners.length > 1;
  const titleText = isMulti ? 'ПОБЕДИТЕЛИ' : 'ПОБЕДИТЕЛЬ';
  const namesText = visibleWinners.map((winner) => winner.name).join(' • ');
  const bestScore = visibleWinners[0].score;
  const scoreLabel = `${bestScore} ${pluralizePoints(bestScore)}`;

  return (
    <Modal animationType="none" transparent visible>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <GameIntroBackdrop meteorCount={4} showEnergyRing starCount={28} variant="winner" />

        <WinnerBolt delay={280} style={styles.boltLeft} />
        <WinnerBolt delay={460} mirrored style={styles.boltRight} />
        <WinnerBolt delay={780} style={styles.boltCenterLeft} />
        <WinnerBolt delay={880} mirrored style={styles.boltCenterRight} />

        <GameIntroShockwaveRing color="rgba(255, 215, 0, 0.74)" delay={1080} fromSize={12} strokeWidth={3} toSize={340} />
        <GameIntroShockwaveRing color="rgba(255, 133, 161, 0.52)" delay={1240} fromSize={12} strokeWidth={2.5} toSize={380} />
        <GameIntroShockwaveRing color="rgba(108, 92, 231, 0.44)" delay={1400} fromSize={12} strokeWidth={2} toSize={420} />

        <GameIntroParticleBurst centerStyle={styles.centerBurst} count={20} delay={1100} maxDistance={160} palette={['#ffd86b', '#ff85a1', '#43fff2', '#6c5ce7', '#ffffff']} />
        <GameIntroParticleBurst centerStyle={styles.centerBurst} count={18} delay={1600} maxDistance={180} palette={['#ffd86b', '#ffa500', '#ff85a1', '#ffffff']} />
        <GameIntroParticleBurst centerStyle={styles.fireworkLeftTop} count={16} delay={2000} maxDistance={120} palette={['#ffd86b', '#ff85a1', '#43fff2', '#ffffff']} />
        <GameIntroParticleBurst centerStyle={styles.fireworkRightTop} count={16} delay={2000} maxDistance={120} palette={['#ffd86b', '#6c5ce7', '#43fff2', '#ffffff']} />
        <GameIntroParticleBurst centerStyle={styles.fireworkCenterTop} count={18} delay={2800} maxDistance={130} palette={['#ffd86b', '#ffa500', '#ffffff']} />
        <GameIntroParticleBurst centerStyle={styles.fireworkLeftBottom} count={14} delay={3400} maxDistance={110} palette={['#ffd86b', '#ff85a1', '#ffffff']} />
        <GameIntroParticleBurst centerStyle={styles.fireworkRightBottom} count={14} delay={3400} maxDistance={110} palette={['#ffd86b', '#43fff2', '#ffffff']} />

        <View style={styles.centerContent}>
          {isMulti ? (
            <View style={styles.multiEmojiRow}>
              {visibleWinners.map((winner, index) => (
                <WinnerEmoji
                  delay={1000 + index * 140}
                  emoji={winner.emoji ?? '👤'}
                  key={`${winner.name}-${winner.score}-${index}`}
                  size={72}
                />
              ))}
            </View>
          ) : (
            <WinnerEmoji delay={1000} emoji={visibleWinners[0].emoji ?? '👤'} size={116} />
          )}

          <Animated.Text
            style={[
              styles.winnerName,
              isMulti && styles.winnerNameMulti,
              {
                opacity: nameOpacity,
                transform: [{ translateY: nameTranslateY }],
              },
            ]}>
            {namesText}
          </Animated.Text>

          <Animated.Text
            style={[
              styles.winnerTitle,
              {
                opacity: titleOpacity,
                transform: [{ scale: titleScale }],
              },
            ]}>
            {titleText}
          </Animated.Text>

          <Animated.View
            style={[
              styles.scorePill,
              {
                opacity: scoreOpacity,
                transform: [{ translateY: scoreTranslateY }],
              },
            ]}>
            <Text style={styles.scoreText}>{scoreLabel}</Text>
          </Animated.View>
        </View>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(9, 9, 18, 0.98)',
  },
  centerContent: {
    zIndex: 20,
    width: '100%',
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBurst: {
    left: '50%',
    top: '50%',
  },
  fireworkLeftTop: {
    left: '20%',
    top: '24%',
  },
  fireworkRightTop: {
    left: '78%',
    top: '20%',
  },
  fireworkCenterTop: {
    left: '50%',
    top: '16%',
  },
  fireworkLeftBottom: {
    left: '16%',
    top: '68%',
  },
  fireworkRightBottom: {
    left: '84%',
    top: '64%',
  },
  boltWrap: {
    position: 'absolute',
    width: 34,
    height: 210,
    zIndex: 8,
  },
  boltLeft: {
    left: '8%',
    top: '4%',
  },
  boltRight: {
    right: '8%',
    top: '4%',
  },
  boltCenterLeft: {
    left: '24%',
    top: '8%',
    height: 160,
  },
  boltCenterRight: {
    right: '24%',
    top: '8%',
    height: 160,
  },
  boltSegment: {
    position: 'absolute',
    width: 5,
    borderRadius: 999,
    backgroundColor: '#b8dcff',
    shadowColor: '#b8dcff',
    shadowOpacity: 0.95,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
  },
  boltSegmentTop: {
    left: 14,
    top: 0,
    height: 72,
    transform: [{ rotate: '18deg' }],
  },
  boltSegmentMiddle: {
    left: 6,
    top: 58,
    height: 70,
    transform: [{ rotate: '-18deg' }],
  },
  boltSegmentBottom: {
    left: 18,
    top: 116,
    height: 86,
    transform: [{ rotate: '16deg' }],
  },
  multiEmojiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  winnerEmojiWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  winnerHalo: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 215, 0, 0.24)',
  },
  winnerEmoji: {
    textShadowColor: 'rgba(255, 215, 0, 0.88)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 34,
  },
  winnerName: {
    marginTop: 6,
    color: gameTheme.colors.gold,
    fontSize: 32,
    lineHeight: 36,
    fontWeight: '900',
    letterSpacing: 1.6,
    textAlign: 'center',
    textShadowColor: 'rgba(255, 216, 107, 0.34)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  winnerNameMulti: {
    fontSize: 24,
    lineHeight: 30,
  },
  winnerTitle: {
    marginTop: 10,
    color: gameTheme.colors.gold,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 6,
    textAlign: 'center',
    textShadowColor: 'rgba(255, 216, 107, 0.4)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  scorePill: {
    marginTop: 14,
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 216, 107, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 216, 107, 0.44)',
  },
  scoreText: {
    color: gameTheme.colors.white,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
  },
});

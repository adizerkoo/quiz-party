import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, View } from 'react-native';

import { GameIntroBackdrop, GameIntroParticleBurst, GameIntroShockwaveRing } from '@/features/game/components/game-intro-effects';
import { buildStartIntroHapticEvents, scheduleIntroHaptics } from '@/features/game/components/game-intro-haptics';
import { gameTheme } from '@/features/game/theme/game-theme';
import { GameLobbyPlayer } from '@/features/game/types';

type GameStartIntroOverlayProps = {
  onFinish: () => void;
  players: GameLobbyPlayer[] | null;
};

type StartIntroPlayerCardProps = {
  delay: number;
  emoji: string;
  name: string;
};

function StartIntroPlayerCard({ delay, emoji, name }: StartIntroPlayerCardProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-640)).current;
  const scale = useRef(new Animated.Value(0.3)).current;
  const rotate = useRef(new Animated.Value(-15)).current;
  const haloScale = useRef(new Animated.Value(0.92)).current;
  const haloOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(translateY, {
            toValue: 16,
            duration: 320,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: -8,
            duration: 110,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 4,
            duration: 90,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(translateY, {
            toValue: 0,
            duration: 80,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.15,
            duration: 320,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.95,
            duration: 110,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1.04,
            duration: 90,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1,
            duration: 80,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(rotate, {
            toValue: 4,
            duration: 320,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(rotate, {
            toValue: -2,
            duration: 110,
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
            duration: 80,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 220,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ]).start();

      Animated.parallel([
        Animated.sequence([
          Animated.timing(haloOpacity, {
            toValue: 0.55,
            duration: 220,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(haloOpacity, {
            toValue: 0.26,
            duration: 920,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.loop(
          Animated.sequence([
            Animated.timing(haloScale, {
              toValue: 1.14,
              duration: 760,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(haloScale, {
              toValue: 0.96,
              duration: 760,
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
        styles.playerCard,
        {
          opacity,
          transform: [
            { translateY },
            { scale },
            {
              rotate: rotate.interpolate({
                inputRange: [-15, 4],
                outputRange: ['-15deg', '4deg'],
              }),
            },
          ],
        },
      ]}>
      <View style={styles.playerEmojiWrap}>
        <Animated.View style={[styles.playerHalo, { opacity: haloOpacity, transform: [{ scale: haloScale }] }]} />
        <GameIntroParticleBurst count={10} delay={delay + 360} maxDistance={44} centerStyle={styles.playerBurstCenter} />
        <GameIntroShockwaveRing color="rgba(108, 92, 231, 0.62)" delay={delay + 360} fromSize={10} toSize={86} />
        <Text style={styles.playerEmoji}>{emoji}</Text>
      </View>

      <Text numberOfLines={1} style={styles.playerName}>
        {name}
      </Text>
    </Animated.View>
  );
}

// Стартовое интро повторяет веб-сценарий: космический фон, поочерёдное падение игроков,
// ударные вспышки и финальный клич "ПОЕХАЛИ!" перед показом игрового экрана.
export function GameStartIntroOverlay({ onFinish, players }: GameStartIntroOverlayProps) {
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleScale = useRef(new Animated.Value(0.74)).current;
  const titleTranslateY = useRef(new Animated.Value(22)).current;
  const goOpacity = useRef(new Animated.Value(0)).current;
  const goScale = useRef(new Animated.Value(0.3)).current;
  const visiblePlayers = useMemo(() => (players ?? []).filter((player) => !player.is_host), [players]);
  const firstSlamDelay = 800;
  const delayPerPlayer = Math.min(350, 2000 / Math.max(visiblePlayers.length, 1));
  const slamDuration = 600;
  const lastSlamEnd = firstSlamDelay + (visiblePlayers.length - 1) * delayPerPlayer + slamDuration;
  const goDelay = lastSlamEnd + 300;
  const hapticEvents = useMemo(
    () => buildStartIntroHapticEvents(visiblePlayers.length, firstSlamDelay, delayPerPlayer, goDelay),
    [delayPerPlayer, goDelay, visiblePlayers.length],
  );

  useEffect(() => {
    if (!visiblePlayers.length) {
      return undefined;
    }

    const fadeOutDelay = goDelay + 1050;
    const timeoutIds: ReturnType<typeof setTimeout>[] = [];
    const hapticTimeouts = scheduleIntroHaptics(hapticEvents);

    Animated.parallel([
      Animated.timing(overlayOpacity, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(titleOpacity, {
          toValue: 1,
          duration: 620,
          delay: 260,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.spring(titleScale, {
          toValue: 1,
          friction: 7,
          tension: 84,
          useNativeDriver: true,
        }),
        Animated.timing(titleTranslateY, {
          toValue: 0,
          duration: 620,
          delay: 260,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    timeoutIds.push(
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(goOpacity, {
            toValue: 1,
            duration: 420,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(goScale, {
              toValue: 1.16,
              duration: 280,
              easing: Easing.out(Easing.back(1.4)),
              useNativeDriver: true,
            }),
            Animated.timing(goScale, {
              toValue: 1,
              duration: 180,
              easing: Easing.out(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        ]).start();
      }, goDelay),
      setTimeout(() => {
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 760,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }).start(() => {
          titleOpacity.setValue(0);
          titleScale.setValue(0.74);
          titleTranslateY.setValue(22);
          goOpacity.setValue(0);
          goScale.setValue(0.3);
          onFinish();
        });
      }, fadeOutDelay),
    );

    return () => {
      hapticTimeouts.forEach((timeoutId) => clearTimeout(timeoutId));
      timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId));
      overlayOpacity.stopAnimation();
      titleOpacity.stopAnimation();
      titleScale.stopAnimation();
      titleTranslateY.stopAnimation();
      goOpacity.stopAnimation();
      goScale.stopAnimation();
      overlayOpacity.setValue(0);
      titleOpacity.setValue(0);
      titleScale.setValue(0.74);
      titleTranslateY.setValue(22);
      goOpacity.setValue(0);
      goScale.setValue(0.3);
    };
  }, [goDelay, goOpacity, goScale, hapticEvents, onFinish, overlayOpacity, titleOpacity, titleScale, titleTranslateY, visiblePlayers]);

  if (!visiblePlayers.length) {
    return null;
  }

  return (
    <Modal animationType="none" transparent visible>
      <Animated.View style={[styles.overlay, { opacity: overlayOpacity }]}>
        <GameIntroBackdrop meteorCount={3} starCount={20} variant="start" />

        <Animated.View
          style={[
            styles.titleWrap,
            {
              opacity: titleOpacity,
              transform: [{ scale: titleScale }, { translateY: titleTranslateY }],
            },
          ]}>
          <Text style={styles.title}>ИГРА НАЧИНАЕТСЯ!</Text>
        </Animated.View>

        <View style={styles.playersContainer}>
          {visiblePlayers.map((player, index) => (
            <StartIntroPlayerCard
              delay={firstSlamDelay + index * delayPerPlayer}
              emoji={player.emoji ?? '👤'}
              key={`${player.name}-${player.emoji ?? 'player'}-${index}`}
              name={player.name}
            />
          ))}
        </View>

        <GameIntroParticleBurst
          centerStyle={styles.goBurstCenter}
          count={22}
          delay={goDelay + 70}
          maxDistance={136}
          palette={['#6c5ce7', '#ff85a1', '#ffd86b', '#43fff2', '#ffffff']}
        />

        <Animated.Text
          style={[
            styles.goText,
            {
              opacity: goOpacity,
              transform: [{ scale: goScale }],
            },
          ]}>
          ПОЕХАЛИ! 🚀
        </Animated.Text>
      </Animated.View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(10, 10, 21, 0.96)',
  },
  titleWrap: {
    zIndex: 20,
    paddingHorizontal: 16,
  },
  title: {
    color: gameTheme.colors.gold,
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '900',
    letterSpacing: 2.8,
    textAlign: 'center',
    textShadowColor: 'rgba(255, 216, 107, 0.72)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },
  playersContainer: {
    zIndex: 20,
    width: '100%',
    maxWidth: 600,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 10,
    marginTop: 30,
  },
  playerCard: {
    width: 90,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  playerEmojiWrap: {
    width: 78,
    height: 78,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerHalo: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 999,
    backgroundColor: 'rgba(108, 92, 231, 0.32)',
  },
  playerBurstCenter: {
    left: '50%',
    top: '50%',
  },
  playerEmoji: {
    fontSize: 54,
    textShadowColor: 'rgba(255, 216, 107, 0.55)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 18,
  },
  playerName: {
    marginTop: 4,
    maxWidth: 88,
    color: 'rgba(255,255,255,0.96)',
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  goBurstCenter: {
    left: '50%',
    top: '76%',
  },
  goText: {
    position: 'absolute',
    bottom: '13%',
    zIndex: 20,
    color: gameTheme.colors.gold,
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: 3.2,
    textAlign: 'center',
    textShadowColor: 'rgba(255, 216, 107, 0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 22,
  },
});

import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, ViewStyle } from 'react-native';

import { gameTheme } from '@/features/game/theme/game-theme';

type IntroVariant = 'start' | 'winner';
type PercentValue = `${number}%`;

type GameIntroBackdropProps = {
  variant: IntroVariant;
  meteorCount?: number;
  showEnergyRing?: boolean;
  starCount?: number;
};

type GameIntroParticleBurstProps = {
  centerStyle?: ViewStyle;
  count?: number;
  delay?: number;
  maxDistance?: number;
  palette?: string[];
};

type GameIntroShockwaveRingProps = {
  color: string;
  delay?: number;
  duration?: number;
  fromSize?: number;
  strokeWidth?: number;
  toSize?: number;
};

type StarConfig = {
  delay: number;
  left: PercentValue;
  size: number;
  top: PercentValue;
};

type MeteorConfig = {
  delay: number;
  duration: number;
  left: PercentValue;
  rotate: string;
  top: PercentValue;
};

type BurstParticleConfig = {
  color: string;
  delay: number;
  dx: number;
  dy: number;
  duration: number;
  size: number;
};

function buildStarConfigs(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    delay: Math.random() * 1800,
    left: `${Math.random() * 100}%` as PercentValue,
    size: 1.2 + Math.random() * 2.4,
    top: `${Math.random() * 100}%` as PercentValue,
  }));
}

function buildMeteorConfigs(count: number, variant: IntroVariant) {
  return Array.from({ length: count }, (_, index) => ({
    delay: 350 + index * 260 + Math.random() * 220,
    duration: 680 + Math.random() * 340,
    left: `${12 + Math.random() * 76}%` as PercentValue,
    rotate: variant === 'winner' ? '32deg' : '35deg',
    top: `${-5 - Math.random() * 6}%` as PercentValue,
  }));
}

function buildBurstParticles(count: number, palette: string[], maxDistance: number) {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    const distance = maxDistance * (0.45 + Math.random() * 0.75);

    return {
      color: palette[Math.floor(Math.random() * palette.length)],
      delay: Math.random() * 140,
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance,
      duration: 420 + Math.random() * 260,
      size: 2 + Math.random() * 4,
    };
  });
}

function IntroStar({ delay, left, size, top }: StarConfig) {
  const opacity = useRef(new Animated.Value(0.15)).current;
  const scale = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0.8,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 1.15,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(opacity, {
            toValue: 0.2,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.75,
            duration: 900,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    animation.start();

    return () => {
      animation.stop();
      opacity.stopAnimation();
      scale.stopAnimation();
    };
  }, [delay, opacity, scale]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.star,
        {
          left,
          top,
          width: size,
          height: size,
          opacity,
          transform: [{ scale }],
        },
      ]}
    />
  );
}

function IntroMeteor({ delay, duration, left, rotate, top }: MeteorConfig) {
  const progress = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.92,
            duration: 120,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: duration - 120,
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(progress, {
          toValue: 1,
          duration,
          easing: Easing.in(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      opacity.stopAnimation();
      progress.stopAnimation();
    };
  }, [delay, duration, opacity, progress]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.meteor,
        {
          left,
          top,
          opacity,
          transform: [
            { rotate },
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 760],
              }),
            },
            {
              translateX: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, 140],
              }),
            },
          ],
        },
      ]}
    />
  );
}

function IntroParticle({ color, delay, dx, dy, duration, size }: BurstParticleConfig) {
  const opacity = useRef(new Animated.Value(0)).current;
  const progress = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.65)).current;

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 1,
            duration: 80,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: Math.max(160, duration - 80),
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(progress, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(scale, {
            toValue: 1.08,
            duration: 160,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(scale, {
            toValue: 0.25,
            duration: Math.max(160, duration - 160),
            easing: Easing.in(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ]).start();
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      opacity.stopAnimation();
      progress.stopAnimation();
      scale.stopAnimation();
    };
  }, [delay, duration, opacity, progress, scale]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.spark,
        {
          backgroundColor: color,
          width: size,
          height: size,
          opacity,
          transform: [
            {
              translateX: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, dx],
              }),
            },
            {
              translateY: progress.interpolate({
                inputRange: [0, 1],
                outputRange: [0, dy],
              }),
            },
            { scale },
          ],
        },
      ]}
    />
  );
}

// Общий фон интро повторяет веб-сцену: тёмный космический overlay, туманности,
// звёзды, метеоры, вспышки и электрическую рамку.
export function GameIntroBackdrop({
  meteorCount = 3,
  showEnergyRing = false,
  starCount = 24,
  variant,
}: GameIntroBackdropProps) {
  const primaryFlashOpacity = useRef(new Animated.Value(0)).current;
  const secondaryFlashOpacity = useRef(new Animated.Value(0)).current;
  const borderOpacity = useRef(new Animated.Value(0)).current;
  const borderPulse = useRef(new Animated.Value(0.24)).current;
  const nebulaScale = useRef(new Animated.Value(1)).current;
  const nebulaDrift = useRef(new Animated.Value(0)).current;
  const energyRingOpacity = useRef(new Animated.Value(0)).current;
  const energyRingScale = useRef(new Animated.Value(0.32)).current;
  const energyRingRotate = useRef(new Animated.Value(0)).current;
  const stars = useMemo(() => buildStarConfigs(starCount), [starCount]);
  const meteors = useMemo(() => buildMeteorConfigs(meteorCount, variant), [meteorCount, variant]);

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(borderPulse, {
          toValue: 0.78,
          duration: 520,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(borderPulse, {
          toValue: 0.26,
          duration: 520,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    const nebulaLoop = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(nebulaScale, {
            toValue: 1.08,
            duration: 2200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(nebulaDrift, {
            toValue: 1,
            duration: 2200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(nebulaScale, {
            toValue: 1,
            duration: 2200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(nebulaDrift, {
            toValue: 0,
            duration: 2200,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
      ]),
    );

    Animated.timing(borderOpacity, {
      toValue: 1,
      duration: 280,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();

    Animated.sequence([
      Animated.delay(variant === 'winner' ? 240 : 180),
      Animated.timing(primaryFlashOpacity, {
        toValue: 0.52,
        duration: 70,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(primaryFlashOpacity, {
        toValue: 0,
        duration: 180,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.delay(variant === 'winner' ? 180 : 120),
      Animated.timing(primaryFlashOpacity, {
        toValue: variant === 'winner' ? 0.4 : 0.32,
        duration: 70,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(primaryFlashOpacity, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();

    Animated.sequence([
      Animated.delay(variant === 'winner' ? 620 : 460),
      Animated.timing(secondaryFlashOpacity, {
        toValue: variant === 'winner' ? 0.28 : 0.2,
        duration: 60,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.timing(secondaryFlashOpacity, {
        toValue: 0,
        duration: 150,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start();

    pulseLoop.start();
    nebulaLoop.start();

    if (showEnergyRing) {
      Animated.parallel([
        Animated.sequence([
          Animated.delay(980),
          Animated.timing(energyRingOpacity, {
            toValue: 0.8,
            duration: 180,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(energyRingOpacity, {
            toValue: 0,
            duration: 1400,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.delay(980),
          Animated.timing(energyRingScale, {
            toValue: 1.9,
            duration: 1500,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.loop(
          Animated.timing(energyRingRotate, {
            toValue: 1,
            duration: 2400,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
        ),
      ]).start();
    }

    return () => {
      pulseLoop.stop();
      nebulaLoop.stop();
      primaryFlashOpacity.stopAnimation();
      secondaryFlashOpacity.stopAnimation();
      borderOpacity.stopAnimation();
      borderPulse.stopAnimation();
      nebulaScale.stopAnimation();
      nebulaDrift.stopAnimation();
      energyRingOpacity.stopAnimation();
      energyRingScale.stopAnimation();
      energyRingRotate.stopAnimation();
    };
  }, [
    borderOpacity,
    borderPulse,
    energyRingOpacity,
    energyRingRotate,
    energyRingScale,
    nebulaDrift,
    nebulaScale,
    primaryFlashOpacity,
    secondaryFlashOpacity,
    showEnergyRing,
    variant,
  ]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.overlayBase, variant === 'winner' ? styles.overlayWinner : styles.overlayStart]} />

      <Animated.View style={[styles.nebulaOrb, styles.nebulaLeft, {
        transform: [
          { translateX: nebulaDrift.interpolate({ inputRange: [0, 1], outputRange: [-12, 10] }) },
          { translateY: nebulaDrift.interpolate({ inputRange: [0, 1], outputRange: [4, -12] }) },
          { scale: nebulaScale },
        ],
      }]}
      />
      <Animated.View style={[styles.nebulaOrb, styles.nebulaRight, {
        transform: [
          { translateX: nebulaDrift.interpolate({ inputRange: [0, 1], outputRange: [10, -14] }) },
          { translateY: nebulaDrift.interpolate({ inputRange: [0, 1], outputRange: [-8, 12] }) },
          { scale: nebulaScale.interpolate({ inputRange: [1, 1.08], outputRange: [1.04, 0.98] }) },
        ],
      }]}
      />
      <Animated.View style={[styles.nebulaOrb, styles.nebulaCenter, {
        transform: [
          { translateY: nebulaDrift.interpolate({ inputRange: [0, 1], outputRange: [-6, 8] }) },
          { scale: nebulaScale.interpolate({ inputRange: [1, 1.08], outputRange: [0.96, 1.06] }) },
        ],
      }]}
      />

      {stars.map((star, index) => (
        <IntroStar key={`intro-star-${index}`} {...star} />
      ))}

      {meteors.map((meteor, index) => (
        <IntroMeteor key={`intro-meteor-${index}`} {...meteor} />
      ))}

      <Animated.View style={[styles.flashLayer, { opacity: primaryFlashOpacity }]} />
      <Animated.View style={[styles.flashLayer, styles.flashSecondary, { opacity: secondaryFlashOpacity }]} />

      <Animated.View style={[styles.borderWrap, { opacity: borderOpacity }]}>
        <Animated.View style={[styles.electricBorderOuter, { opacity: borderPulse }]} />
        <Animated.View style={[styles.electricBorderInner, { opacity: borderPulse.interpolate({ inputRange: [0.24, 0.78], outputRange: [0.18, 0.52] }) }]} />
      </Animated.View>

      {showEnergyRing ? (
        <Animated.View
          style={[
            styles.energyRing,
            {
              opacity: energyRingOpacity,
              transform: [
                { scale: energyRingScale },
                {
                  rotate: energyRingRotate.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '360deg'],
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}
    </View>
  );
}

// Универсальный burst нужен для стартовых ударов карточек, искр победителя и небольших фейерверков.
export function GameIntroParticleBurst({
  centerStyle,
  count = 14,
  delay = 0,
  maxDistance = 78,
  palette = ['#6c5ce7', '#ff85a1', '#ffd86b', '#43fff2', '#ffffff'],
}: GameIntroParticleBurstProps) {
  const particles = useMemo(() => buildBurstParticles(count, palette, maxDistance), [count, maxDistance, palette]);

  return (
    <View pointerEvents="none" style={[styles.burstCenter, centerStyle]}>
      {particles.map((particle, index) => (
        <IntroParticle
          key={`burst-${index}`}
          {...particle}
          delay={particle.delay + delay}
        />
      ))}
    </View>
  );
}

// Расходящееся кольцо повторяет веб-эффект ударной волны после slam-анимации.
export function GameIntroShockwaveRing({
  color,
  delay = 0,
  duration = 620,
  fromSize = 10,
  strokeWidth = 2,
  toSize = 96,
}: GameIntroShockwaveRingProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.18)).current;

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      Animated.parallel([
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.7,
            duration: 70,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: Math.max(160, duration - 70),
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(scale, {
          toValue: 1,
          duration,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    }, delay);

    return () => {
      clearTimeout(timeoutId);
      opacity.stopAnimation();
      scale.stopAnimation();
    };
  }, [delay, duration, opacity, scale]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.shockwaveRing,
        {
          borderColor: color,
          borderWidth: strokeWidth,
          width: toSize,
          height: toSize,
          marginLeft: -toSize / 2,
          marginTop: -toSize / 2,
          opacity,
          transform: [
            {
              scale: scale.interpolate({
                inputRange: [0.18, 1],
                outputRange: [fromSize / toSize, 1],
              }),
            },
          ],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  overlayBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0a0a15',
  },
  overlayStart: {},
  overlayWinner: {
    backgroundColor: '#090912',
  },
  flashLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ffffff',
  },
  flashSecondary: {
    backgroundColor: '#fff6d5',
  },
  borderWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  electricBorderOuter: {
    ...StyleSheet.absoluteFillObject,
    borderWidth: 2,
    borderColor: 'rgba(120, 180, 255, 0.34)',
  },
  electricBorderInner: {
    ...StyleSheet.absoluteFillObject,
    top: 5,
    left: 5,
    right: 5,
    bottom: 5,
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.24)',
  },
  nebulaOrb: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.9,
  },
  nebulaLeft: {
    width: 300,
    height: 300,
    left: -80,
    top: '24%',
    backgroundColor: 'rgba(108, 92, 231, 0.24)',
  },
  nebulaRight: {
    width: 280,
    height: 280,
    right: -70,
    top: '32%',
    backgroundColor: 'rgba(255, 133, 161, 0.18)',
  },
  nebulaCenter: {
    width: 220,
    height: 220,
    alignSelf: 'center',
    top: '12%',
    backgroundColor: 'rgba(67, 255, 242, 0.12)',
  },
  star: {
    position: 'absolute',
    borderRadius: 999,
    backgroundColor: '#ffffff',
  },
  meteor: {
    position: 'absolute',
    width: 3,
    height: 44,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.92)',
    shadowColor: '#ffffff',
    shadowOpacity: 0.45,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  energyRing: {
    position: 'absolute',
    alignSelf: 'center',
    top: '38%',
    width: 220,
    height: 220,
    marginLeft: -110,
    marginTop: -110,
    borderRadius: 999,
    borderWidth: 2.5,
    borderTopColor: gameTheme.colors.gold,
    borderRightColor: gameTheme.colors.pink,
    borderBottomColor: gameTheme.colors.cyan,
    borderLeftColor: gameTheme.colors.purple,
  },
  burstCenter: {
    position: 'absolute',
    left: '50%',
    top: '50%',
  },
  spark: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderRadius: 999,
  },
  shockwaveRing: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    borderRadius: 999,
  },
});

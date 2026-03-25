import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { menuTheme } from '@/features/menu/theme/menu-theme';

export function MenuBackground() {
  const pinkFloat = useRef(new Animated.Value(0)).current;
  const yellowFloat = useRef(new Animated.Value(0)).current;
  const lilacFloat = useRef(new Animated.Value(0)).current;
  const gradientShift = useRef(new Animated.Value(0)).current;
  const gradientPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const pinkLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pinkFloat, {
          toValue: 1,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pinkFloat, {
          toValue: 0,
          duration: 3000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    const yellowLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(yellowFloat, {
          toValue: 1,
          duration: 3200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(yellowFloat, {
          toValue: 0,
          duration: 3200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    const lilacLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(lilacFloat, {
          toValue: 1,
          duration: 3400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(lilacFloat, {
          toValue: 0,
          duration: 3400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    const gradientLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(gradientShift, {
          toValue: 1,
          duration: 4800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(gradientShift, {
          toValue: 0,
          duration: 4800,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(gradientPulse, {
          toValue: 1,
          duration: 5200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(gradientPulse, {
          toValue: 0,
          duration: 5200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    pinkLoop.start();
    yellowLoop.start();
    lilacLoop.start();
    gradientLoop.start();
    pulseLoop.start();

    return () => {
      pinkLoop.stop();
      yellowLoop.stop();
      lilacLoop.stop();
      gradientLoop.stop();
      pulseLoop.stop();
    };
  }, [gradientPulse, gradientShift, lilacFloat, pinkFloat, yellowFloat]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.base} />

      <Animated.View
        style={[
          styles.washPink,
          {
            opacity: gradientPulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0.16, 0.28],
            }),
            transform: [
              {
                translateX: gradientPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-24, 22],
                }),
              },
            ],
          },
        ]}
      />

      <Animated.View
        style={[
          styles.washPurple,
          {
            opacity: gradientPulse.interpolate({
              inputRange: [0, 1],
              outputRange: [0.14, 0.24],
            }),
            transform: [
              {
                translateX: gradientPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [18, -18],
                }),
              },
              {
                translateY: gradientPulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 14],
                }),
              },
            ],
          },
        ]}
      />

      <View style={styles.topFade} />
      <View style={styles.middleFade} />

      <Animated.View
        style={[
          styles.gradientBlob,
          styles.gradientBlobPink,
          {
            transform: [
              {
                translateX: gradientShift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-18, 16],
                }),
              },
              {
                translateY: gradientShift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -10],
                }),
              },
            ],
          },
        ]}
      />

      <Animated.View
        style={[
          styles.gradientBlob,
          styles.gradientBlobLilac,
          {
            transform: [
              {
                translateX: gradientShift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [14, -20],
                }),
              },
              {
                translateY: gradientShift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 12],
                }),
              },
            ],
          },
        ]}
      />

      <Animated.View
        style={[
          styles.gradientBlob,
          styles.gradientBlobWhite,
          {
            opacity: gradientShift.interpolate({
              inputRange: [0, 1],
              outputRange: [0.16, 0.3],
            }),
          },
        ]}
      />

      <View style={styles.titleGlow} />
      <View style={styles.bottomGlow} />

      <Animated.View
        style={[
          styles.balloon,
          styles.balloonPink,
          {
            transform: [
              {
                translateY: pinkFloat.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -20],
                }),
              },
            ],
          },
        ]}
      />

      <Animated.View
        style={[
          styles.balloon,
          styles.balloonYellow,
          {
            transform: [
              {
                translateY: yellowFloat.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -18],
                }),
              },
            ],
          },
        ]}
      />

      <Animated.View
        style={[
          styles.balloon,
          styles.balloonLilac,
          {
            transform: [
              {
                translateY: lilacFloat.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -22],
                }),
              },
            ],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: menuTheme.colors.screenBottom,
  },
  // Анимированные полноэкранные цветовые слои создают ощущение живого градиента.
  washPink: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 165, 196, 0.22)',
  },
  washPurple: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(135, 118, 255, 0.18)',
  },
  topFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '45%',
    backgroundColor: 'rgba(255,255,255,0.52)',
  },
  middleFade: {
    position: 'absolute',
    top: '36%',
    left: 0,
    right: 0,
    height: '22%',
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  gradientBlob: {
    position: 'absolute',
    borderRadius: 999,
  },
  gradientBlobPink: {
    top: 82,
    left: -80,
    width: 290,
    height: 230,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  gradientBlobLilac: {
    top: 220,
    right: -90,
    width: 330,
    height: 270,
    backgroundColor: 'rgba(162, 155, 254, 0.24)',
  },
  gradientBlobWhite: {
    bottom: 72,
    alignSelf: 'center',
    width: 380,
    height: 230,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  titleGlow: {
    position: 'absolute',
    top: 115,
    alignSelf: 'center',
    width: 320,
    height: 180,
    borderRadius: 999,
    backgroundColor: 'rgba(108, 92, 231, 0.09)',
  },
  bottomGlow: {
    position: 'absolute',
    bottom: 120,
    alignSelf: 'center',
    width: 360,
    height: 180,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.09)',
  },
  balloon: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.38,
  },
  balloonPink: {
    width: 80,
    height: 100,
    backgroundColor: menuTheme.colors.balloonPink,
    top: '15%',
    left: 18,
  },
  balloonYellow: {
    width: 60,
    height: 80,
    backgroundColor: menuTheme.colors.balloonYellow,
    top: '50%',
    right: 18,
  },
  balloonLilac: {
    width: 90,
    height: 110,
    backgroundColor: menuTheme.colors.balloonLilac,
    bottom: '10%',
    left: 28,
  },
});

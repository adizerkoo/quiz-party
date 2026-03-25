import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { createTheme } from '@/features/create/theme/create-theme';

// Декоративный анимированный фон экрана создания.
// Он повторяет живой web-градиент не через CSS, а через несколько
// полупрозрачных слоёв и плавающих цветовых пятен.
export function CreateBackground() {
  const drift = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const driftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 12000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 12000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 7000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 7000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    driftLoop.start();
    pulseLoop.start();

    return () => {
      driftLoop.stop();
      pulseLoop.stop();
    };
  }, [drift, pulse]);

  const pinkBlobStyle = {
    transform: [
      {
        translateX: drift.interpolate({
          inputRange: [0, 1],
          outputRange: [-18, 26],
        }),
      },
      {
        translateY: drift.interpolate({
          inputRange: [0, 1],
          outputRange: [-16, 12],
        }),
      },
      {
        scale: pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [0.96, 1.06],
        }),
      },
    ],
  } as const;

  const blueBlobStyle = {
    transform: [
      {
        translateX: drift.interpolate({
          inputRange: [0, 1],
          outputRange: [20, -28],
        }),
      },
      {
        translateY: drift.interpolate({
          inputRange: [0, 1],
          outputRange: [12, -20],
        }),
      },
      {
        scale: pulse.interpolate({
          inputRange: [0, 1],
          outputRange: [1.04, 0.96],
        }),
      },
    ],
  } as const;

  return (
    <View pointerEvents="none" style={styles.root}>
      <View style={styles.baseGradient} />
      <Animated.View style={[styles.blob, styles.pinkBlob, pinkBlobStyle]} />
      <Animated.View style={[styles.blob, styles.blueBlob, blueBlobStyle]} />
      <View style={styles.softOverlay} />
    </View>
  );
}

const styles = StyleSheet.create({
  // Корневой слой занимает весь экран и лежит под контентом.
  root: {
    ...StyleSheet.absoluteFillObject,
  },

  // Базовый светлый фон, который задаёт основную атмосферу страницы.
  baseGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: createTheme.colors.screenTop,
  },

  // Общие параметры больших цветовых пятен.
  blob: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.82,
  },

  // Розовый слой в верхней части экрана.
  pinkBlob: {
    top: -90,
    right: -50,
    width: 280,
    height: 260,
    backgroundColor: createTheme.colors.overlayPink,
  },

  // Голубой слой в нижней части экрана.
  blueBlob: {
    bottom: -120,
    left: -80,
    width: 340,
    height: 300,
    backgroundColor: createTheme.colors.overlayBlue,
  },

  // Финальный мягкий слой, чтобы фон выглядел ближе к web-версии.
  softOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: createTheme.colors.screenBottom,
    opacity: 0.46,
  },
});

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { gameTheme } from '@/features/game/theme/game-theme';

export function GameBackground() {
  const drift = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const driftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, {
          toValue: 1,
          duration: 11000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(drift, {
          toValue: 0,
          duration: 11000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 7200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 7200,
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

  return (
    <View pointerEvents="none" style={styles.root}>
      <View style={styles.base} />

      <Animated.View
        style={[
          styles.blob,
          styles.pinkBlob,
          {
            transform: [
              {
                translateX: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-22, 24],
                }),
              },
              {
                translateY: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-12, 14],
                }),
              },
              {
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.96, 1.06],
                }),
              },
            ],
          },
        ]}
      />

      <Animated.View
        style={[
          styles.blob,
          styles.purpleBlob,
          {
            transform: [
              {
                translateX: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [28, -20],
                }),
              },
              {
                translateY: drift.interpolate({
                  inputRange: [0, 1],
                  outputRange: [12, -18],
                }),
              },
              {
                scale: pulse.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1.04, 0.94],
                }),
              },
            ],
          },
        ]}
      />

      <View style={styles.cyanWash} />
      <View style={styles.softOverlay} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
  },
  base: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: gameTheme.colors.screenTop,
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
  },
  pinkBlob: {
    top: -80,
    right: -70,
    width: 300,
    height: 250,
    backgroundColor: gameTheme.colors.overlayPink,
    opacity: 0.88,
  },
  purpleBlob: {
    left: -90,
    bottom: -120,
    width: 360,
    height: 310,
    backgroundColor: gameTheme.colors.overlayPurple,
    opacity: 0.86,
  },
  cyanWash: {
    position: 'absolute',
    top: '35%',
    alignSelf: 'center',
    width: 380,
    height: 200,
    borderRadius: 999,
    backgroundColor: gameTheme.colors.overlayCyan,
  },
  softOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: gameTheme.colors.screenBottom,
    opacity: 0.54,
  },
});

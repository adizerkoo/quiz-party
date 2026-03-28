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
  balloon: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.38,
  },
  balloonPink: {
    width: 80,
    height: 100,
    backgroundColor: menuTheme.colors.balloonPink,
    top: '75%',
    left: '68%',
  },
  balloonLilac: {
    width: 90,
    height: 110,
    backgroundColor: menuTheme.colors.balloonLilac,
    bottom: '10%',
    left: 28,
  },
});

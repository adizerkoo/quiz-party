import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
} from 'react-native';

import { menuTheme } from '@/features/menu/theme/menu-theme';

// Верхний логотип "QUIZ PARTY".
// Файл отвечает только за декоративную верхнюю часть меню:
// заголовок, линию под ним и мягкие анимации.
export function MenuLogo() {
  // Анимация "дыхания" свечения на фоне логотипа.
  const glowAnim = useRef(new Animated.Value(0)).current;

  // Анимация лёгкого отклика на нажатие по логотипу.
  const pressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Делаем плавное, бесконечное свечение.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 2000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();

    return () => {
      loop.stop();
    };
  }, [glowAnim]);

  // Управляет прозрачностью и масштабом светящегося овала за логотипом.
  const haloStyle = useMemo(
    () => ({
      opacity: glowAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.12, 0.22],
      }),
      transform: [
        {
          scale: glowAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.08],
          }),
        },
      ],
    }),
    [glowAnim],
  );

  // Чуть увеличивает сам текст при удержании.
  const titleStyle = useMemo(
    () => ({
      transform: [
        {
          scale: pressAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.03],
          }),
        },
      ],
    }),
    [pressAnim],
  );

  // Анимированная линия под заголовком:
  // при нажатии она становится шире и чуть меняет цвет.
  const underlineStyle = useMemo(
    () => ({
      width: pressAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [60, 140],
      }),
      backgroundColor: pressAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [menuTheme.colors.titleSoft, menuTheme.colors.createBorder],
      }),
    }),
    [pressAnim],
  );

  function handlePressIn() {
    Animated.spring(pressAnim, {
      toValue: 1,
      friction: 7,
      tension: 90,
      useNativeDriver: false,
    }).start();
  }

  function handlePressOut() {
    Animated.spring(pressAnim, {
      toValue: 0,
      friction: 7,
      tension: 90,
      useNativeDriver: false,
    }).start();
  }

  return (
    <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} style={styles.wrap}>
      <Animated.View pointerEvents="none" style={[styles.halo, haloStyle]} />

      <Animated.Text style={[styles.title, titleStyle]}>QUIZ PARTY</Animated.Text>
      <Animated.View style={[styles.underline, underlineStyle]} />
      <Text style={styles.subtitle}>Твой праздник, твои правила!</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Внешняя зона логотипа.
  // marginBottom отвечает за расстояние до карточек меню снизу.
  // paddingVertical — за "воздух" внутри самого логотипного блока.
  wrap: {
    width: '100%',
    alignItems: 'center',
    marginTop: 80,
    marginBottom: 40,
    paddingVertical: 30,
  },

  // Светящийся овал за текстом.
  // width/height меняют размер свечения,
  // top двигает его выше/ниже относительно текста.
  halo: {
    position: 'absolute',
    top: 8,
    width: 320,
    height: 160,
    borderRadius: 999,
    backgroundColor: 'rgb(255, 255, 255)',
  },

  // Главный логотип.
  // fontSize и letterSpacing сильнее всего влияют на общий характер заголовка.
  title: {
    fontSize: 40,
    lineHeight: 54,
    color: menuTheme.colors.title,
    fontWeight: '800',
    letterSpacing: 3,
    textAlign: 'center',
    textTransform: 'uppercase',
    textShadowColor: 'rgba(30, 0, 255, 0.15)',
    textShadowRadius: 25,
  },

  // Полоска под логотипом.
  // Её ширина анимируется, а высоту можно менять вручную.
  underline: {
    height: 4,
    borderRadius: 10,
    marginTop: 8,
  },

  // Подзаголовок под QUIZ PARTY.
  subtitle: {
    marginTop: 15,
    textAlign: 'center',
    fontSize: 17,
    lineHeight: 22,
    color: menuTheme.colors.subtitle,
    opacity: 0.8,
    fontWeight: '600',
  },
});

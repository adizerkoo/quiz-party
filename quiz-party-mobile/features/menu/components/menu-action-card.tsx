import { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { menuTheme } from '@/features/menu/theme/menu-theme';

type MenuActionCardProps = {
  icon: string;
  title: string;
  description: string;
  tone: 'create' | 'join';
  onPress: () => void;
  onInfoPress: () => void;
};

// Карточка действия в главном меню:
// "Я организатор" или "Я игрок".
export function MenuActionCard({
  icon,
  title,
  description,
  tone,
  onPress,
  onInfoPress,
}: MenuActionCardProps) {
  const isCreate = tone === 'create';

  // Небольшой анимированный подпрыгивающий отклик иконки при нажатии.
  const iconBounce = useRef(new Animated.Value(0)).current;

  function handlePressIn() {
    Animated.sequence([
      Animated.timing(iconBounce, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
      Animated.timing(iconBounce, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }),
    ]).start();
  }

  function handleLongPress() {
    // Мягкая вибрация на долгий тап по карточке меню.
    // Работает и для "Я организатор", и для "Я игрок".
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  return (
    <Pressable
      accessibilityRole="button"
      delayLongPress={260}
      onLongPress={handleLongPress}
      onPress={onPress}
      onPressIn={handlePressIn}
      style={({ pressed }) => [
        styles.card,
        isCreate ? styles.createCard : styles.joinCard,
        pressed && styles.cardPressed,
      ]}>
      {/* Полупрозрачный блик поверх карточки. */}
      <View style={styles.gloss} />

      <Animated.View
        style={[
          styles.iconWrap,
          isCreate ? styles.createIcon : styles.joinIcon,
          {
            transform: [
              {
                translateY: iconBounce.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0, -4, 0],
                }),
              },
              {
                rotate: iconBounce.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: ['0deg', isCreate ? '-8deg' : '8deg', '0deg'],
                }),
              },
              {
                scale: iconBounce.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [1, 1.1, 1],
                }),
              },
            ],
          },
        ]}>
        {/* Светлая верхняя часть иконки, чтобы был псевдо-градиент. */}
        <View
          style={[
            styles.iconGradientTop,
            isCreate ? styles.createIconTop : styles.joinIconTop,
          ]}
        />
        <Text style={styles.icon}>{icon}</Text>
      </Animated.View>

      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>

      <Pressable
        accessibilityLabel={`Информация: ${title}`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={(event) => {
          event.stopPropagation();
          onInfoPress();
        }}
        style={({ pressed }) => [
          styles.infoButton,
          pressed && styles.infoButtonPressed,
        ]}>
        <Text style={styles.infoText}>!</Text>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Основа карточки.
  // paddingHorizontal отвечает за ширину внутренних отступов.
  // paddingVertical сильнее всего влияет на высоту карточки.
  // Если хочешь сделать карточки ниже, уменьшай paddingVertical.
  card: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    borderWidth: 2,
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    overflow: 'hidden',
  },

  // Розовая карточка организатора.
  createCard: {
    borderColor: menuTheme.colors.createBorder,
  },

  // Фиолетовая карточка игрока.
  joinCard: {
    borderColor: menuTheme.colors.joinBorder,
  },

  // Лёгкое ужатие всей карточки при нажатии.
  cardPressed: {
    transform: [{ scale: 0.98 }],
  },

  // Полупрозрачный диагональный блик.
  // left и width можно крутить, если хочешь изменить его положение.
  gloss: {
    position: 'absolute',
    top: 0,
    left: -80,
    width: 140,
    height: '100%',
    backgroundColor: 'rgba(255, 146, 146, 0.18)',
    transform: [{ skewX: '-18deg' }],
  },

  // Квадрат с эмодзи слева.
  // width/height регулируют его размер,
  // marginRight — расстояние до текста справа.
  iconWrap: {
    width: 60,
    height: 60,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
    overflow: 'hidden',
  },

  // Цветовой блок иконки для организатора.
  createIcon: {
    backgroundColor: menuTheme.colors.create,
    shadowColor: menuTheme.colors.createBorder,
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },

  // Цветовой блок иконки для игрока.
  joinIcon: {
    backgroundColor: menuTheme.colors.join,
    shadowColor: menuTheme.colors.joinBorder,
    shadowOpacity: 0.3,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 5 },
    elevation: 5,
  },

  // Верхний светлый слой на иконке.
  iconGradientTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '58%',
    opacity: 0.34,
  },

  createIconTop: {
    backgroundColor: '#ff85a1',
  },

  joinIconTop: {
    backgroundColor: '#a29bfe',
  },

  // Сам эмодзи внутри квадратной иконки.
  icon: {
    fontSize: 28,
    color: '#ffffff',
    textShadowColor: 'rgba(0,0,0,0.2)',
    textShadowRadius: 5,
  },

  // Правая текстовая часть карточки.
  copy: {
    flex: 1,
    paddingRight: 10,
  },

  // Главный текст карточки.
  title: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '800',
    color: menuTheme.colors.text,
  },

  // Описание под заголовком.
  description: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    color: menuTheme.colors.text,
    opacity: 0.6,
  },
  // Маленькая кнопка справа для открытия справки по игре.
  infoButton: {
    width: 32,
    height: 32,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(108, 92, 231, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.16)',
  },
  infoButtonPressed: {
    transform: [{ scale: 0.95 }],
    backgroundColor: 'rgba(108, 92, 231, 0.18)',
  },
  infoText: {
    fontSize: 18,
    lineHeight: 20,
    fontWeight: '900',
    color: menuTheme.colors.joinBorder,
  },
});

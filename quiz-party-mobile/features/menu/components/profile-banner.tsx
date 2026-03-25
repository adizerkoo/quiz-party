import { Pressable, StyleSheet, Text, View } from 'react-native';

import { menuTheme } from '@/features/menu/theme/menu-theme';
import { MenuProfile } from '@/features/menu/types';

type ProfileBannerProps = {
  profile: MenuProfile | null;
  onPress: () => void;
};

// Верхний компактный баннер профиля.
// Появляется только после создания профиля.
export function ProfileBanner({ profile, onPress }: ProfileBannerProps) {
  if (!profile) {
    return null;
  }

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
        <View style={styles.emojiWrap}>
          <Text style={styles.emoji}>{profile.emoji}</Text>
        </View>

        <View style={styles.copy}>
          <Text numberOfLines={1} style={styles.name}>
            {profile.name}
          </Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Внешняя зона баннера по ширине экрана.
  // alignItems: 'flex-start' прижимает баннер к левому краю.
  wrap: {
    width: '100%',
    paddingHorizontal: 16,
    alignItems: 'flex-start',
  },

  // Карточка баннера.
  // maxWidth ограничивает ширину на длинных экранах.
  // padding управляет "толщиной" баннера.
  card: {
    maxWidth: 420,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.88)',
    shadowColor: menuTheme.colors.joinBorder,
    shadowOpacity: 0.14,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 18 },
    elevation: 4,
  },

  // Лёгкое сжатие баннера при нажатии.
  cardPressed: {
    transform: [{ scale: 0.985 }],
  },

  // Жёлтый блок с эмодзи.
  emojiWrap: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: menuTheme.colors.bannerYellow,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Размер эмодзи в баннере.
  emoji: {
    fontSize: 22,
  },

  // Текстовая зона.
  // minWidth: 0 нужен, чтобы текст корректно обрезался внутри flex-контейнера.
  copy: {
    minWidth: 0,
  },

  // Имя пользователя в баннере.
  name: {
    fontSize: 15,
    lineHeight: 19,
    color: menuTheme.colors.text,
    fontWeight: '800',
  },
});

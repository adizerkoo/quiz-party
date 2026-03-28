import { Pressable, StyleSheet, Text, View } from 'react-native';

import { menuTheme } from '@/features/menu/theme/menu-theme';
import { MenuProfile } from '@/features/menu/types';

type ProfileBannerProps = {
  profile: MenuProfile | null;
  onPress: () => void;
  align?: 'left' | 'right';
};

// Верхний компактный баннер профиля.
// Появляется только после создания профиля.
export function ProfileBanner({ profile, onPress, align = 'left' }: ProfileBannerProps) {
  if (!profile) {
    return null;
  }

  return (
    <View style={[styles.wrap, align === 'right' ? styles.wrapRight : styles.wrapLeft]}>
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
  // Дополнительный горизонтальный padding здесь не нужен,
  // потому что баннер уже живёт внутри menuContent с собственными отступами.
  // Так правый край баннера визуально совпадает с карточками меню.
  wrap: {
    width: '100%',
  },

  // Баннер можно прижать к левому краю для стандартного режима.
  wrapLeft: {
    alignItems: 'flex-start',
  },

  // Для главного меню используем правое выравнивание,
  // чтобы баннер жил над карточками и не спорил с логотипом по центру.
  wrapRight: {
    alignItems: 'flex-end',
  },

  // Карточка баннера.
  // maxWidth ограничивает ширину на длинных экранах.
  // padding управляет "толщиной" баннера. Уменьшаем его,
  // чтобы карточка стала немного компактнее по высоте.
  card: {
    maxWidth: 420,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 18,
    borderColor: menuTheme.colors.joinBorder,
    borderWidth: 2,
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
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: menuTheme.colors.bannerYellow,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Размер эмодзи в баннере.
  emoji: {
    fontSize: 20,
  },

  // Текстовая зона.
  // minWidth: 0 нужен, чтобы текст корректно обрезался внутри flex-контейнера.
  copy: {
    minWidth: 0,
  },

  // Имя пользователя в баннере.
  name: {
    fontSize: 14,
    lineHeight: 18,
    color: menuTheme.colors.text,
    fontWeight: '800',
  },
});

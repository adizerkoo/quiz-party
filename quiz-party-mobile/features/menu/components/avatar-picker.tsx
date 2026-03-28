import { Pressable, StyleSheet, Text, View } from 'react-native';

import { menuTheme } from '@/features/menu/theme/menu-theme';

type AvatarPickerProps = {
  avatars: string[];
  selectedAvatar: string;
  onSelect: (emoji: string) => void;
};

const PICKER_TITLE = 'Выбери аватар';

export function AvatarPicker({
  avatars,
  selectedAvatar,
  onSelect,
}: AvatarPickerProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{PICKER_TITLE}</Text>
      <View style={styles.grid}>
        {avatars.map((emoji) => {
          const isSelected = emoji === selectedAvatar;

          return (
            <Pressable
              key={emoji}
              accessibilityRole="button"
              onPress={() => onSelect(emoji)}
              style={({ pressed }) => [
                styles.avatar,
                isSelected && styles.avatarSelected,
                pressed && styles.avatarPressed,
              ]}>
              <Text style={styles.emoji}>{emoji}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 6,
  },
  title: {
    marginBottom: 10,
    fontSize: 13,
    fontWeight: '800',
    color: menuTheme.colors.joinBorder,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    columnGap: 10,
    rowGap: 10,
  },
  avatar: {
    width: 56,
    aspectRatio: 1,
    borderWidth: 2,
    borderColor: 'transparent',
    borderRadius: 16,
    backgroundColor: '#f1ebff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarSelected: {
    backgroundColor: '#ffffff',
    borderColor: menuTheme.colors.joinBorder,
    shadowColor: menuTheme.colors.joinBorder,
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
  avatarPressed: {
    transform: [{ scale: 0.97 }],
  },
  emoji: {
    fontSize: 35,
  },
});

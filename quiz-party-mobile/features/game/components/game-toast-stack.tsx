import { StyleSheet, Text, View } from 'react-native';

import { gameTheme } from '@/features/game/theme/game-theme';
import { GameToastItem } from '@/features/game/types';

type GameToastStackProps = {
  items: GameToastItem[];
};

export function GameToastStack({ items }: GameToastStackProps) {
  if (!items.length) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.container}>
      {items.map((item) => (
        <View key={item.id} style={styles.toast}>
          <Text style={styles.toastText}>{item.message}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 12,
    left: 14,
    right: 14,
    zIndex: 50,
    gap: 8,
  },
  toast: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: gameTheme.colors.toastBackground,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  toastText: {
    color: gameTheme.colors.toastText,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    textAlign: 'center',
  },
});

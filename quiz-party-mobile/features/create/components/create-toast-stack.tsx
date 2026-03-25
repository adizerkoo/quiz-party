import { StyleSheet, Text, View } from 'react-native';

import { CreateToastItem } from '@/features/create/types';
import { createTheme } from '@/features/create/theme/create-theme';

type CreateToastStackProps = {
  items: CreateToastItem[];
};

// Небольшой стек всплывающих сообщений в верхней части экрана.
export function CreateToastStack({ items }: CreateToastStackProps) {
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
  // Контейнер тостов закреплён сверху и не мешает нажимать на основной UI.
  container: {
    position: 'absolute',
    top: 10,
    left: 14,
    right: 14,
    zIndex: 50,
    gap: 8,
  },

  // Внешний вид одного уведомления.
  toast: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: createTheme.colors.toastBackground,
    shadowColor: '#000000',
    shadowOpacity: 0.16,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },

  toastText: {
    color: createTheme.colors.toastText,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '700',
    textAlign: 'center',
  },
});

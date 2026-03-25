import { FontAwesome6 } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { createTheme } from '@/features/create/theme/create-theme';

type CreateIdeaBannerProps = {
  ideaText: string;
  onInsert: () => void;
  onRefresh: () => void;
};

// Плашка со случайной идеей вопроса и кнопкой обновления.
export function CreateIdeaBanner({ ideaText, onInsert, onRefresh }: CreateIdeaBannerProps) {
  return (
    <View style={styles.row}>
      <Pressable onPress={onInsert} style={({ pressed }) => [
        styles.ideaCard,
        pressed && styles.ideaCardPressed,
      ]}>
        <FontAwesome6 color="#f1c40f" iconStyle="solid" name="lightbulb" size={14} />
        <Text style={styles.ideaPrefix}>Идея:</Text>
        <Text numberOfLines={3} style={styles.ideaText}>
          {ideaText}
        </Text>
      </Pressable>

      <Pressable onPress={onRefresh} style={({ pressed }) => [
        styles.refreshButton,
        pressed && styles.refreshButtonPressed,
      ]}>
        <FontAwesome6 color={createTheme.colors.purple} iconStyle="solid" name="rotate-right" size={15} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Ряд с плашкой идеи и квадратной кнопкой обновления справа.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    // Держим блок идеи чуть ниже, чтобы он не наползал на input сверху.
    marginTop: 15,
    marginBottom: 10,
  },

  // Кликабельный контейнер случайной идеи.
  ideaCard: {
    flex: 1,
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(108, 92, 231, 0.12)',
    gap: 6,
  },

  ideaCardPressed: {
    backgroundColor: 'rgba(108, 92, 231, 0.18)',
    transform: [{ scale: 0.985 }],
  },

  ideaPrefix: {
    color: createTheme.colors.purple,
    fontSize: 11,
    fontWeight: '700',
  },

  // Сам текст идеи занимает оставшееся место и переносится на новые строки.
  ideaText: {
    flex: 1,
    color: createTheme.colors.purple,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '600',
  },

  // Компактная кнопка обновления идеи.
  refreshButton: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: createTheme.colors.white,
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.20)',
  },

  refreshButtonPressed: {
    transform: [{ scale: 0.92 }],
  },
});

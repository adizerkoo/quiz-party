import * as Haptics from 'expo-haptics';
import { ReactNode, useRef } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { createTheme } from '@/features/create/theme/create-theme';

type CreateSwipeDeleteProps = {
  children: ReactNode;
  onDelete: () => void;
  label?: string;
  disabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  childrenContainerStyle?: StyleProp<ViewStyle>;
};

// Универсальная обёртка для удаления свайпом влево.
// Когда пользователь дотягивает свайп до порога, срабатывает вибрация и элемент удаляется.
export function CreateSwipeDelete({
  children,
  onDelete,
  label = 'Удалить',
  disabled = false,
  containerStyle,
  childrenContainerStyle,
}: CreateSwipeDeleteProps) {
  const swipeableRef = useRef<Swipeable | null>(null);

  function handleOpen(direction: 'left' | 'right') {
    if (direction !== 'right') {
      return;
    }

    // Сначала даём мягкую вибрацию, затем закрываем свайп и удаляем элемент.
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    swipeableRef.current?.close();
    onDelete();
  }

  function renderRightActions() {
    return (
      <View style={styles.action}>
        <Text style={styles.actionText}>{label}</Text>
      </View>
    );
  }

  if (disabled) {
    return <>{children}</>;
  }

  return (
    <Swipeable
      ref={swipeableRef}
      containerStyle={containerStyle}
      childrenContainerStyle={childrenContainerStyle}
      dragOffsetFromRightEdge={18}
      friction={1.8}
      onSwipeableOpen={handleOpen}
      overshootRight={false}
      renderRightActions={renderRightActions}
      rightThreshold={72}>
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  // Красная зона, которая появляется справа при свайпе влево.
  action: {
    width: 116,
    marginBottom: 10,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: createTheme.colors.danger,
  },

  actionText: {
    color: createTheme.colors.white,
    fontSize: 14,
    fontWeight: '800',
    textAlign: 'center',
  },
});

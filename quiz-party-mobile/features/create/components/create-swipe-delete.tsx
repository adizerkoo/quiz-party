import * as Haptics from 'expo-haptics';
import { FontAwesome6 } from '@expo/vector-icons';
import { ReactNode, useRef } from 'react';
import {
  Animated,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';

import { createTheme } from '@/features/create/theme/create-theme';

type CreateSwipeDeleteProps = {
  children: ReactNode;
  onDelete?: () => void;
  disabled?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  childrenContainerStyle?: StyleProp<ViewStyle>;
};

// Компактная обёртка удаления свайпом влево для строк create-экрана.
// Делает тот же жест, что и у карточек вопросов:
// 1. показывает иконку корзины за элементом;
// 2. даёт haptic при достижении порога;
// 3. после полного свайпа закрывает элемент и вызывает удаление.
export function CreateSwipeDelete({
  children,
  onDelete,
  disabled = false,
  containerStyle,
  childrenContainerStyle,
}: CreateSwipeDeleteProps) {
  const swipeableRef = useRef<Swipeable | null>(null);
  const hapticPlayedRef = useRef(false);

  function handleWillOpen(direction: 'left' | 'right') {
    // Для этой обёртки реагируем только на свайп влево, который открывает правое действие.
    if (direction !== 'right' || hapticPlayedRef.current || !onDelete) {
      return;
    }

    hapticPlayedRef.current = true;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  }

  function handleOpen(direction: 'left' | 'right') {
    if (direction !== 'right' || !onDelete) {
      swipeableRef.current?.close();
      return;
    }

    swipeableRef.current?.close();
    onDelete();
  }

  function handleClose() {
    hapticPlayedRef.current = false;
  }

  function renderRightActions(
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>,
  ) {
    if (!onDelete) {
      return null;
    }

    const translateX = dragX.interpolate({
      inputRange: [-92, 0],
      outputRange: [0, 18],
      extrapolate: 'clamp',
    });

    const opacity = dragX.interpolate({
      inputRange: [-92, -24, 0],
      outputRange: [1, 0.7, 0],
      extrapolate: 'clamp',
    });

    return (
      <View style={styles.rightRail}>
        <Animated.View
          style={[
            styles.iconBubble,
            { opacity, transform: [{ translateX }] },
          ]}>
          <FontAwesome6 color={createTheme.colors.white} iconStyle="solid" name="trash" size={16} />
        </Animated.View>
      </View>
    );
  }

  if (disabled || !onDelete) {
    return <>{children}</>;
  }

  return (
    <Swipeable
      ref={swipeableRef}
      containerStyle={containerStyle}
      childrenContainerStyle={childrenContainerStyle}
      dragOffsetFromLeftEdge={18}
      dragOffsetFromRightEdge={18}
      friction={1.8}
      onSwipeableClose={handleClose}
      onSwipeableOpen={handleOpen}
      onSwipeableWillOpen={handleWillOpen}
      overshootLeft={false}
      overshootRight={false}
      renderRightActions={renderRightActions}
      rightThreshold={72}>
      {children}
    </Swipeable>
  );
}

const styles = StyleSheet.create({
  // Правая зона действия живёт за элементом во время свайпа влево.
  rightRail: {
    flex: 1,
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingRight: 14,
  },

  // Круглая кнопка удаления визуально совпадает со свайпом карточки вопроса.
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: createTheme.colors.danger,
  },
});

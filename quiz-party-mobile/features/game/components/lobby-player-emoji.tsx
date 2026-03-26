import * as Haptics from 'expo-haptics';
import { useEffect } from 'react';
import { Pressable, StyleSheet, StyleProp, TextStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

type LobbyPlayerEmojiProps = {
  emoji: string;
  idleDelay?: number;
  isInteractive?: boolean;
  isOffline?: boolean;
  style?: StyleProp<TextStyle>;
};

// Этот компонент отвечает за "живой" эмодзи участника в комнате ожидания:
// он поддерживает фоновую idle-анимацию, анимацию на тап и лёгкую вибрацию.
export function LobbyPlayerEmoji({
  emoji,
  idleDelay = 0,
  isInteractive = true,
  isOffline = false,
  style,
}: LobbyPlayerEmojiProps) {
  const idleTranslateY = useSharedValue(0);
  const idleRotate = useSharedValue(0);
  const idleScale = useSharedValue(1);
  const tapTranslateY = useSharedValue(0);
  const tapRotate = useSharedValue(0);
  const tapScale = useSharedValue(1);

  useEffect(() => {
    if (isOffline) {
      idleTranslateY.value = withTiming(0, { duration: 180 });
      idleRotate.value = withTiming(0, { duration: 180 });
      idleScale.value = withTiming(1, { duration: 180 });
      return;
    }

    idleTranslateY.value = withDelay(
      idleDelay,
      withRepeat(
        withSequence(
          withTiming(-5, { duration: 650, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 650, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );

    idleRotate.value = withDelay(
      idleDelay,
      withRepeat(
        withSequence(
          withTiming(-4, { duration: 420, easing: Easing.inOut(Easing.ease) }),
          withTiming(4, { duration: 420, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 420, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );

    idleScale.value = withDelay(
      idleDelay,
      withRepeat(
        withSequence(
          withTiming(1.05, { duration: 520, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 520, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        false,
      ),
    );
  }, [idleDelay, idleRotate, idleScale, idleTranslateY, isOffline]);

  // Эта функция запускает отклик на нажатие эмодзи:
  // короткую вибрацию и "jelly"-анимацию, похожую на веб-реакцию по клику.
  function handlePress() {
    if (isOffline || !isInteractive) {
      return;
    }

    void Haptics.selectionAsync();

    tapScale.value = withSequence(
      withTiming(1.22, { duration: 120, easing: Easing.out(Easing.ease) }),
      withTiming(0.94, { duration: 120, easing: Easing.inOut(Easing.ease) }),
      withTiming(1, { duration: 180, easing: Easing.out(Easing.ease) }),
    );

    tapRotate.value = withSequence(
      withTiming(10, { duration: 110, easing: Easing.out(Easing.ease) }),
      withTiming(-8, { duration: 120, easing: Easing.inOut(Easing.ease) }),
      withTiming(0, { duration: 160, easing: Easing.out(Easing.ease) }),
    );

    tapTranslateY.value = withSequence(
      withTiming(-6, { duration: 100, easing: Easing.out(Easing.ease) }),
      withTiming(0, { duration: 180, easing: Easing.out(Easing.ease) }),
    );
  }

  // Итоговый стиль объединяет idle-анимацию и реакцию на тап в один трансформ.
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: idleTranslateY.value + tapTranslateY.value },
      { rotate: `${idleRotate.value + tapRotate.value}deg` },
      { scale: idleScale.value * tapScale.value },
    ],
  }));

  return (
    <Pressable
      disabled={isOffline || !isInteractive}
      hitSlop={8}
      onPress={handlePress}
      style={styles.pressable}>
      <Animated.Text style={[style, animatedStyle]}>{emoji}</Animated.Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

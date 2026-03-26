import { ReactNode, useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { menuTheme } from '@/features/menu/theme/menu-theme';

type MenuModalShellProps = {
  visible: boolean;
  icon: string;
  title: string;
  subtitle?: string;
  iconPosition?: 'top' | 'left';
  cardOffsetY?: number;
  locked?: boolean;
  onRequestClose: () => void;
  children: ReactNode;
};

export function MenuModalShell({
  visible,
  icon,
  title,
  subtitle,
  iconPosition = 'top',
  cardOffsetY = 0,
  locked = false,
  onRequestClose,
  children,
}: MenuModalShellProps) {
  const hasIcon = Boolean(icon);
  const cardAnim = useRef(new Animated.Value(0)).current;
  const heroAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      cardAnim.setValue(0);
      heroAnim.setValue(0);
      return;
    }

    Animated.timing(cardAnim, {
      toValue: 1,
      duration: 320,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();

    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(heroAnim, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(heroAnim, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ]),
    );

    loop.start();
    return () => loop.stop();
  }, [cardAnim, heroAnim, visible]);

  const animatedCardStyle = useMemo(
    () => ({
      opacity: cardAnim,
      transform: [
        {
          translateY: cardAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [22 + cardOffsetY, cardOffsetY],
          }),
        },
        {
          scale: cardAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.98, 1],
          }),
        },
      ],
    }),
    [cardAnim, cardOffsetY],
  );

  const animatedIconStyle = useMemo(
    () => ({
      transform: [
        {
          translateY: heroAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -4],
          }),
        },
        {
          rotate: heroAnim.interpolate({
            inputRange: [0, 1],
            outputRange: ['-2deg', '2deg'],
          }),
        },
      ],
    }),
    [heroAnim],
  );

  return (
    <Modal
      animationType="fade"
      onRequestClose={onRequestClose}
      transparent
      visible={visible}>
      <View style={styles.overlay}>
        <Pressable
          disabled={locked}
          onPress={locked ? undefined : onRequestClose}
          style={styles.backgroundTapArea}
        />

        <Animated.View style={[styles.card, animatedCardStyle]}>
          <View style={styles.cardHighlight} />

          <ScrollView
            bounces={false}
            contentContainerStyle={styles.content}
            keyboardDismissMode="none"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={[styles.header, !hasIcon && styles.headerWithoutIcon]}>
              {hasIcon && iconPosition === 'left' ? (
                <View style={styles.titleRow}>
                  <Animated.Text style={[styles.inlineIcon, animatedIconStyle]}>
                    {icon}
                  </Animated.Text>
                  <Text style={styles.titleLeft}>{title}</Text>
                </View>
              ) : hasIcon ? (
                <>
                  <Animated.Text style={[styles.heroIcon, animatedIconStyle]}>
                    {icon}
                  </Animated.Text>
                  <Text style={styles.title}>{title}</Text>
                </>
              ) : (
                <Text style={styles.title}>{title}</Text>
              )}

              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>

            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: menuTheme.colors.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  backgroundTapArea: {
    ...StyleSheet.absoluteFillObject,
  },
  // Карточка держится по центру и больше не подпрыгивает из-за KeyboardAvoidingView.
  card: {
    width: '100%',
    maxWidth: 480,
    maxHeight: '82%',
    backgroundColor: menuTheme.colors.card,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    shadowColor: menuTheme.colors.joinBorder,
    shadowOpacity: 0.18,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
    overflow: 'hidden',
  },
  cardHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 88,
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  content: {
    paddingHorizontal: 28,
    paddingTop: 24,
    paddingBottom: 28,
    gap: 16,
  },
  header: {
    alignItems: 'center',
    marginBottom: 8,
  },
  headerWithoutIcon: {
    marginBottom: 4,
  },
  titleRow: {
    // Контейнер на всю ширину нужен, чтобы заголовок оставался по центру модалки,
    // даже если слева есть иконка и она визуально "весит" больше текста.
    width: '100%',
    minHeight: 34,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  heroIcon: {
    fontSize: 44,
    marginBottom: 6,
    textShadowColor: 'rgba(108, 92, 231, 0.25)',
    textShadowRadius: 12,
  },
  inlineIcon: {
    fontSize: 28,
    lineHeight: 32,
    textShadowColor: 'rgba(108, 92, 231, 0.24)',
    textShadowRadius: 10,
    position: 'absolute',
    left: 0,
    top: 1,
  },
  title: {
    textAlign: 'center',
    fontSize: 24,
    lineHeight: 30,
    color: menuTheme.colors.title,
    fontWeight: '800',
  },
  titleLeft: {
    width: '100%',
    fontSize: 24,
    lineHeight: 30,
    color: menuTheme.colors.title,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    textAlign: 'center',
    fontSize: 13,
    lineHeight: 18,
    color: menuTheme.colors.hint,
    fontWeight: '500',
  },
});

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { gameTheme } from '@/features/game/theme/game-theme';
import { GameBlockedState } from '@/features/game/types';

type GameBlockedScreenProps = {
  blockedState: GameBlockedState;
  onBackToMenu: () => void;
};

export function GameBlockedScreen({ blockedState, onBackToMenu }: GameBlockedScreenProps) {
  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Text style={styles.icon}>{blockedState.icon}</Text>
        <Text style={styles.title}>{blockedState.title}</Text>
        <Text style={styles.subtitle}>{blockedState.subtitle}</Text>

        <Pressable onPress={onBackToMenu} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
          <Text style={styles.buttonText}>В главное меню</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  card: {
    borderRadius: gameTheme.radius.card,
    paddingHorizontal: 22,
    paddingVertical: 28,
    alignItems: 'center',
    backgroundColor: gameTheme.colors.panelStrong,
    shadowColor: gameTheme.colors.shadow,
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  icon: {
    fontSize: 50,
  },
  title: {
    marginTop: 14,
    color: gameTheme.colors.purpleDark,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '900',
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 10,
    color: gameTheme.colors.textSoft,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  button: {
    minHeight: 54,
    marginTop: 24,
    paddingHorizontal: 22,
    borderRadius: gameTheme.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: gameTheme.colors.purple,
  },
  buttonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  buttonText: {
    color: gameTheme.colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
});

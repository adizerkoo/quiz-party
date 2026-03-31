import { StyleSheet, Text, View } from 'react-native';

import { gameTheme } from '@/features/game/theme/game-theme';

type GameLobbyRosterHeaderProps = {
  count: number;
  label: string;
};

// Компактный центрированный заголовок блока участников.
export function GameLobbyRosterHeader({ count, label }: GameLobbyRosterHeaderProps) {
  return (
    <View style={styles.header}>
      <Text style={styles.label}>{label}</Text>

      <View style={styles.countBadge}>
        <Text style={styles.countValue}>{count}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 18,
    marginBottom: 12,
  },
  label: {
    color: gameTheme.colors.textMuted,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1.3,
    textTransform: 'uppercase',
  },
  countBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: 11,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(108, 92, 231, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.16)',
  },
  countValue: {
    color: gameTheme.colors.purpleDark,
    fontSize: 13,
    fontWeight: '900',
    textAlign: 'center',
  },
});

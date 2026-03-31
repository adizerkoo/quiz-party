import { FontAwesome6 } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LobbyPlayerEmoji } from '@/features/game/components/lobby-player-emoji';
import { gameTheme } from '@/features/game/theme/game-theme';

type GameLobbyPlayerTileProps = {
  emoji: string;
  idleDelay?: number;
  isMe?: boolean;
  isOffline?: boolean;
  name: string;
  onKick?: () => void;
};

function resolveStatusLabel({ isMe, isOffline }: { isMe: boolean; isOffline: boolean }) {
  if (isOffline) {
    return 'offline';
  }

  if (isMe) {
    return 'вы';
  }

  return 'в игре';
}

// Универсальная широкая карточка участника для mobile lobby.
export function GameLobbyPlayerTile({
  emoji,
  idleDelay = 0,
  isMe = false,
  isOffline = false,
  name,
  onKick,
}: GameLobbyPlayerTileProps) {
  const statusLabel = resolveStatusLabel({ isMe, isOffline });

  return (
    <View style={[styles.card, isMe && styles.cardMe, isOffline && styles.cardOffline]}>
      <View
        pointerEvents="none"
        style={[
          styles.accent,
          isMe && styles.accentMe,
          isOffline && styles.accentOffline,
        ]}
      />

      <View
        style={[
          styles.avatarWrap,
          isMe && styles.avatarWrapMe,
          isOffline && styles.avatarWrapOffline,
        ]}>
        <View
          style={[
            styles.avatarInner,
            isMe && styles.avatarInnerMe,
            isOffline && styles.avatarInnerOffline,
          ]}>
          <LobbyPlayerEmoji
            emoji={emoji}
            idleDelay={idleDelay}
            isOffline={isOffline}
            style={[styles.playerEmoji, isOffline && styles.playerEmojiOffline]}
          />
        </View>
      </View>

      <View style={styles.copy}>
        <Text numberOfLines={1} style={styles.playerName}>
          {name}
        </Text>

        <View
          style={[
            styles.statusChip,
            isMe && styles.statusChipMe,
            isOffline && styles.statusChipOffline,
          ]}>
          <View
            style={[
              styles.statusDot,
              isMe && styles.statusDotMe,
              isOffline && styles.statusDotOffline,
            ]}
          />
          <Text
            numberOfLines={1}
            style={[
              styles.statusChipText,
              isMe && styles.statusChipTextMe,
              isOffline && styles.statusChipTextOffline,
            ]}>
            {statusLabel}
          </Text>
        </View>
      </View>

      {onKick ? (
        <Pressable onPress={onKick} style={({ pressed }) => [
          styles.kickButton,
          pressed && styles.kickButtonPressed,
        ]}>
          <FontAwesome6 color={gameTheme.colors.danger} iconStyle="solid" name="xmark" size={12} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    minHeight: 72,
    overflow: 'hidden',
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 22,
    paddingLeft: 16,
    paddingRight: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.96)',
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.12)',
    shadowColor: gameTheme.colors.shadow,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  cardMe: {
    borderColor: 'rgba(255, 133, 161, 0.32)',
    backgroundColor: 'rgba(255, 246, 249, 0.98)',
  },
  cardOffline: {
    borderColor: 'rgba(164, 168, 191, 0.20)',
    backgroundColor: 'rgba(245, 246, 250, 0.98)',
  },
  accent: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 12,
    width: 4,
    borderRadius: 999,
    backgroundColor: gameTheme.colors.purple,
  },
  accentMe: {
    backgroundColor: gameTheme.colors.pinkDark,
  },
  accentOffline: {
    backgroundColor: gameTheme.colors.offline,
  },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.16)',
  },
  avatarWrapMe: {
    borderColor: 'rgba(255, 133, 161, 0.24)',
  },
  avatarWrapOffline: {
    backgroundColor: 'rgba(229, 232, 239, 0.96)',
    borderColor: 'rgba(164, 168, 191, 0.22)',
  },
  avatarInner: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(108, 92, 231, 0.08)',
  },
  avatarInnerMe: {
    backgroundColor: 'rgba(255, 133, 161, 0.10)',
  },
  avatarInnerOffline: {
    backgroundColor: 'rgba(177, 182, 196, 0.22)',
  },
  playerEmoji: {
    fontSize: 27,
  },
  playerEmojiOffline: {
    opacity: 0.3,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  playerName: {
    color: gameTheme.colors.text,
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
  },
  statusChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 7,
    borderRadius: gameTheme.radius.pill,
    paddingHorizontal: 9,
    paddingVertical: 5,
    backgroundColor: 'rgba(108, 92, 231, 0.10)',
  },
  statusChipMe: {
    backgroundColor: 'rgba(255, 133, 161, 0.16)',
  },
  statusChipOffline: {
    backgroundColor: 'rgba(164, 168, 191, 0.16)',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: gameTheme.colors.purple,
  },
  statusDotMe: {
    backgroundColor: gameTheme.colors.pinkDark,
  },
  statusDotOffline: {
    backgroundColor: gameTheme.colors.offline,
  },
  statusChipText: {
    color: gameTheme.colors.purpleDark,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
  },
  statusChipTextMe: {
    color: gameTheme.colors.pinkDark,
  },
  statusChipTextOffline: {
    color: gameTheme.colors.offline,
  },
  kickButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 118, 117, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255, 118, 117, 0.18)',
  },
  kickButtonPressed: {
    backgroundColor: 'rgba(255, 118, 117, 0.18)',
    transform: [{ scale: 0.94 }],
  },
});

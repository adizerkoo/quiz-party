import { FontAwesome6 } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { gameTheme } from '@/features/game/theme/game-theme';

type GameLobbyHeroProps = {
  integrated?: boolean;
  onBackPress?: () => void;
  title: string;
};

// Единый верхний hero-блок lobby с названием вечеринки.
export function GameLobbyHero({ integrated = false, onBackPress, title }: GameLobbyHeroProps) {
  const normalizedTitle = title.trim() || 'Вечеринка без названия';

  if (integrated) {
    return (
      <View style={[styles.hero, styles.heroIntegrated]}>
        <View pointerEvents="none" style={[styles.decorOrb, styles.decorOrbPink, styles.decorOrbIntegratedPink]} />
        <View pointerEvents="none" style={[styles.decorOrb, styles.decorOrbBlue, styles.decorOrbIntegratedBlue]} />
        <View pointerEvents="none" style={[styles.decorLine, styles.decorLineLeft, styles.decorLineIntegratedLeft]} />

        <View style={styles.integratedTopRow}>
          {onBackPress ? (
            <Pressable onPress={onBackPress} style={({ pressed }) => [
              styles.backButton,
              styles.backButtonIntegrated,
              pressed && styles.backButtonPressed,
            ]}>
              <FontAwesome6 color={gameTheme.colors.purple} iconStyle="solid" name="chevron-left" size={16} />
              <Text style={styles.backButtonText}>Назад</Text>
            </Pressable>
          ) : (
            <View />
          )}

          <View style={[styles.heroChip, styles.heroChipIntegrated]}>
            <View style={styles.heroChipDot} />
            <Text style={styles.heroChipText}>Комната ожидания</Text>
          </View>
        </View>

        <View style={styles.integratedCopy}>
          <Text numberOfLines={2} style={[styles.heroTitle, styles.heroTitleIntegrated]}>
            {normalizedTitle}
          </Text>

          <Text style={[styles.heroHint, styles.heroHintIntegrated]}>
            Подключай друзей и запускай игру, когда все на месте.
          </Text>

          <View style={[styles.heroAccent, styles.heroAccentIntegrated]} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.hero}>
      <View pointerEvents="none" style={[styles.decorOrb, styles.decorOrbPink]} />
      <View pointerEvents="none" style={[styles.decorOrb, styles.decorOrbBlue]} />
      <View pointerEvents="none" style={[styles.decorLine, styles.decorLineLeft]} />
      <View pointerEvents="none" style={[styles.decorLine, styles.decorLineRight]} />

      {onBackPress ? (
        <Pressable onPress={onBackPress} style={({ pressed }) => [
          styles.backButton,
          pressed && styles.backButtonPressed,
        ]}>
          <FontAwesome6 color={gameTheme.colors.purple} iconStyle="solid" name="chevron-left" size={16} />
          <Text style={styles.backButtonText}>Назад</Text>
        </Pressable>
      ) : null}

      <View style={styles.heroChip}>
        <View style={styles.heroChipDot} />
        <Text style={styles.heroChipText}>Комната ожидания</Text>
      </View>

      <Text numberOfLines={2} style={styles.heroTitle}>
        {normalizedTitle}
      </Text>

      <Text style={styles.heroHint}>
        Собираем компанию перед стартом игры
      </Text>
      <View style={styles.heroAccent} />
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    marginBottom: 16,
    borderRadius: 30,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.82)',
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.12)',
    shadowColor: gameTheme.colors.shadow,
    shadowOpacity: 0.16,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  heroIntegrated: {
    marginBottom: 18,
    alignItems: 'stretch',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 16,
    backgroundColor: 'rgba(108, 92, 231, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.10)',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  decorOrb: {
    position: 'absolute',
    borderRadius: 999,
  },
  decorOrbPink: {
    top: -34,
    right: -16,
    width: 124,
    height: 124,
    backgroundColor: 'rgba(255, 133, 161, 0.16)',
  },
  decorOrbIntegratedPink: {
    top: -42,
    right: -24,
    width: 112,
    height: 112,
    backgroundColor: 'rgba(255, 133, 161, 0.12)',
  },
  decorOrbBlue: {
    left: -20,
    bottom: -24,
    width: 112,
    height: 112,
    backgroundColor: 'rgba(108, 92, 231, 0.12)',
  },
  decorOrbIntegratedBlue: {
    left: -18,
    bottom: -34,
    width: 94,
    height: 94,
    backgroundColor: 'rgba(108, 92, 231, 0.08)',
  },
  decorLine: {
    position: 'absolute',
    width: 78,
    height: 78,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.08)',
  },
  decorLineLeft: {
    top: 24,
    left: -30,
    transform: [{ rotate: '18deg' }],
  },
  decorLineIntegratedLeft: {
    top: 44,
    left: -22,
    width: 62,
    height: 62,
  },
  decorLineRight: {
    right: -26,
    bottom: 18,
    transform: [{ rotate: '-18deg' }],
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: gameTheme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.74)',
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.10)',
  },
  backButtonPressed: {
    opacity: 0.86,
    transform: [{ scale: 0.97 }],
  },
  backButtonIntegrated: {
    position: 'relative',
    top: 0,
    left: 0,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.86)',
  },
  backButtonText: {
    color: gameTheme.colors.purple,
    fontSize: 14,
    fontWeight: '800',
  },
  heroChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderRadius: gameTheme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
  },
  heroChipIntegrated: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.86)',
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.08)',
  },
  heroChipDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: gameTheme.colors.pinkDark,
  },
  heroChipText: {
    color: gameTheme.colors.purpleDark,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  heroTitle: {
    marginTop: 14,
    paddingHorizontal: 16,
    color: gameTheme.colors.purpleDark,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '900',
    textAlign: 'center',
  },
  heroTitleIntegrated: {
    marginTop: 2,
    paddingHorizontal: 0,
    fontSize: 27,
    lineHeight: 32,
    textAlign: 'center',
  },
  heroHint: {
    marginTop: 8,
    color: gameTheme.colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  heroHintIntegrated: {
    maxWidth: 280,
    textAlign: 'center',
  },
  heroAccent: {
    width: 84,
    height: 4,
    marginTop: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(255, 133, 161, 0.42)',
  },
  heroAccentIntegrated: {
    width: 68,
    marginTop: 10,
    alignSelf: 'center',
  },
  integratedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  integratedCopy: {
    marginTop: 14,
    paddingHorizontal: 2,
    alignItems: 'center',
  },
});

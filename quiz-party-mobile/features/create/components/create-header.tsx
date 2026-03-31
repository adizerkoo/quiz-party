import { FontAwesome6 } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { createTheme } from '@/features/create/theme/create-theme';

type CreateHeaderProps = {
  onBackPress: () => void;
  badgeLabel?: string;
};

// Премиальная шапка create-экрана с лёгким party-настроением.
export function CreateHeader({ onBackPress, badgeLabel }: CreateHeaderProps) {
  return (
    <View style={styles.header}>
      <View style={styles.topRow}>
        <Pressable onPress={onBackPress} style={({ pressed }) => [
          styles.backButton,
          pressed && styles.backButtonPressed,
        ]}>
          <FontAwesome6 color={createTheme.colors.purple} iconStyle="solid" name="chevron-left" size={16} />
          <Text style={styles.backButtonText}>Назад</Text>
        </Pressable>

        {badgeLabel ? (
          <View style={styles.badge}>
            <View style={styles.badgeDot} />
            <Text numberOfLines={1} style={styles.badgeText}>{badgeLabel}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.heroCard}>
        <View pointerEvents="none" style={[styles.decorOrb, styles.decorOrbPink]} />
        <View pointerEvents="none" style={[styles.decorOrb, styles.decorOrbBlue]} />
        <View pointerEvents="none" style={[styles.decorLine, styles.decorLineLeft]} />
        <View pointerEvents="none" style={[styles.decorLine, styles.decorLineRight]} />

        <View style={styles.partyChip}>
          <FontAwesome6 color={createTheme.colors.purpleDark} iconStyle="solid" name="star" size={11} />
          <Text style={styles.partyChipText}>PARTY MODE</Text>
        </View>

        <Text adjustsFontSizeToFit minimumFontScale={0.78} numberOfLines={1} style={styles.title}>
          QUIZ PARTY
        </Text>
        <Text style={styles.subtitle}>Зови друзей, поднимай градус и запускай шумную игру.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: 16,
  },

  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 14,
  },

  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: createTheme.radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.66)',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  backButtonPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.97 }],
  },

  backButtonText: {
    color: createTheme.colors.purple,
    fontSize: 15,
    fontWeight: '700',
  },

  badge: {
    maxWidth: '52%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: createTheme.radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.52)',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },

  badgeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: createTheme.colors.success,
  },

  badgeText: {
    flexShrink: 1,
    color: createTheme.colors.purple,
    fontSize: 12,
    fontWeight: '800',
  },

  heroCard: {
    position: 'relative',
    overflow: 'hidden',
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.10)',
    backgroundColor: 'rgba(255, 255, 255, 0.78)',
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 18,
    shadowColor: 'rgba(108, 92, 231, 0.18)',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },

  decorOrb: {
    position: 'absolute',
    borderRadius: 999,
  },

  decorOrbPink: {
    top: -26,
    right: -14,
    width: 116,
    height: 116,
    backgroundColor: 'rgba(255, 133, 161, 0.18)',
  },

  decorOrbBlue: {
    bottom: -34,
    left: -12,
    width: 124,
    height: 124,
    backgroundColor: 'rgba(108, 92, 231, 0.12)',
  },

  decorLine: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.08)',
  },

  decorLineLeft: {
    top: 22,
    left: -30,
    transform: [{ rotate: '18deg' }],
  },

  decorLineRight: {
    right: -22,
    bottom: 18,
    transform: [{ rotate: '-18deg' }],
  },

  partyChip: {
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: createTheme.radius.pill,
    backgroundColor: 'rgba(255, 255, 255, 0.68)',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },

  partyChipText: {
    color: createTheme.colors.purpleDark,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 0.7,
  },

  title: {
    marginTop: 12,
    paddingHorizontal: 8,
    fontSize: 34,
    lineHeight: 36,
    fontWeight: '900',
    color: createTheme.colors.purpleDark,
    letterSpacing: -1.4,
    textAlign: 'center',
  },

  subtitle: {
    marginTop: 8,
    color: createTheme.colors.textSoft,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
});

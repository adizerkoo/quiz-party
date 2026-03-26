import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { gameTheme } from '@/features/game/theme/game-theme';

type GameDialogProps = {
  visible: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel?: () => void;
};

export function GameDialog({
  cancelLabel,
  confirmLabel,
  description,
  onCancel,
  onConfirm,
  title,
  visible,
}: GameDialogProps) {
  return (
    <Modal animationType="fade" transparent visible={visible}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>

          <View style={styles.actions}>
            {cancelLabel ? (
              <Pressable onPress={onCancel} style={({ pressed }) => [styles.secondaryButton, pressed && styles.secondaryButtonPressed]}>
                <Text style={styles.secondaryButtonText}>{cancelLabel}</Text>
              </Pressable>
            ) : null}

            <Pressable onPress={onConfirm} style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryButtonPressed]}>
              <Text style={styles.primaryButtonText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: gameTheme.colors.overlay,
  },
  card: {
    width: '100%',
    maxWidth: 430,
    borderRadius: gameTheme.radius.card,
    paddingHorizontal: 22,
    paddingVertical: 22,
    backgroundColor: gameTheme.colors.panelStrong,
    shadowColor: gameTheme.colors.shadow,
    shadowOpacity: 0.22,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  title: {
    color: gameTheme.colors.purpleDark,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
    textAlign: 'center',
  },
  description: {
    marginTop: 10,
    color: gameTheme.colors.textSoft,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
  },
  primaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: gameTheme.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: gameTheme.colors.purple,
  },
  primaryButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  primaryButtonText: {
    color: gameTheme.colors.white,
    fontSize: 15,
    fontWeight: '800',
  },
  secondaryButton: {
    flex: 1,
    minHeight: 52,
    borderRadius: gameTheme.radius.control,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: gameTheme.colors.chip,
  },
  secondaryButtonPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.98 }],
  },
  secondaryButtonText: {
    color: gameTheme.colors.text,
    fontSize: 15,
    fontWeight: '800',
  },
});

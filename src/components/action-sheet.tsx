import { Modal, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Colors, Fonts, MinTapTarget } from '@/constants/theme';

export type SheetAction = { label: string; onPress: () => void; destructive?: boolean };

/** A bottom sheet of secondary actions, e.g. from a card's three-dot button. */
export function ActionSheet({
  visible,
  title,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu">
        <Pressable style={[styles.sheet, { paddingBottom: 12 + insets.bottom }]} onPress={() => {}}>
          {title ? (
            <Text maxFontSizeMultiplier={1.3} style={styles.title} numberOfLines={2}>
              {title}
            </Text>
          ) : null}
          {actions.map((a) => (
            <Pressable
              key={a.label}
              accessibilityRole="button"
              onPress={() => {
                onClose();
                a.onPress();
              }}
              style={({ pressed }) => [styles.action, pressed && styles.pressed]}>
              <Text maxFontSizeMultiplier={1.3} style={[styles.label, a.destructive && styles.destructive]}>
                {a.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [styles.action, styles.cancel, pressed && styles.pressed]}>
            <Text maxFontSizeMultiplier={1.3} style={styles.cancelText}>
              Cancel
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(21, 33, 28, 0.45)',
  },
  sheet: {
    gap: 4,
    paddingTop: 16,
    paddingHorizontal: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    backgroundColor: Colors.white,
  },
  title: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Colors.inkMuted,
    paddingHorizontal: 8,
    paddingBottom: 6,
  },
  action: {
    minHeight: MinTapTarget,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderRadius: 14,
  },
  pressed: {
    backgroundColor: Colors.paper,
  },
  label: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 17,
    color: Colors.ink,
  },
  destructive: {
    color: Colors.error,
  },
  cancel: {
    marginTop: 4,
    backgroundColor: Colors.paper,
    alignItems: 'center',
  },
  cancelText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 17,
    color: Colors.ink,
  },
});

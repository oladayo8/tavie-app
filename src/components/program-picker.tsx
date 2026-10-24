import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { Colors, Fonts } from '@/constants/theme';
import type { Dashboard } from '@/lib/dashboard';

/** Chips for the creator's published programs. Shown only when there's more than one. */
export function ProgramPicker({
  programs,
  selected,
  onSelect,
  busy,
}: {
  programs: Dashboard['programs'];
  selected: string;
  onSelect: (id: string) => void;
  busy: boolean;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.picker}>
      {programs.map((p) => {
        const on = p.id === selected;
        return (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            accessibilityState={{ selected: on, busy: on && busy }}
            onPress={() => onSelect(p.id)}
            style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && styles.pressed]}>
            <Text maxFontSizeMultiplier={1.3} style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
              {p.title}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  picker: {
    gap: 8,
  },
  chip: {
    maxWidth: 220,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.white,
  },
  chipOn: {
    backgroundColor: Colors.ink,
    borderColor: Colors.ink,
  },
  chipText: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 14,
    color: Colors.ink,
  },
  chipTextOn: {
    color: Colors.white,
  },
  pressed: {
    opacity: 0.7,
  },
});

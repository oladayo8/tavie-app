import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { Label } from '@/components/text';
import { Colors, Fonts, MinTapTarget, Radius } from '@/constants/theme';

type Props = TextInputProps & { label: string };

export function TextField({ label, style, ...props }: Props) {
  return (
    <View style={styles.wrap}>
      <Label>{label}</Label>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={Colors.inkMuted}
        style={[styles.input, style]}
        {...props}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
  },
  input: {
    minHeight: MinTapTarget,
    borderRadius: Radius.button,
    borderWidth: 1.5,
    borderColor: Colors.ink,
    backgroundColor: Colors.white,
    paddingHorizontal: 16,
    fontFamily: Fonts.body,
    fontSize: 17,
    color: Colors.ink,
  },
});

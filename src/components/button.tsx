import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps } from 'react-native';

import { Colors, Fonts, MinTapTarget, Radius } from '@/constants/theme';

type Variant = 'primary' | 'secondary' | 'link';

type Props = Omit<PressableProps, 'children'> & {
  title: string;
  variant?: Variant;
  loading?: boolean;
};

/**
 * `primary` is the green action button. `secondary` is an Ink outline.
 * `link` is plain underlined text that still has a full-size tap target.
 */
export function Button({ title, variant = 'primary', loading, disabled, style, ...props }: Props) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      style={(state) => [
        styles.base,
        styles[variant],
        state.pressed && styles.pressed,
        isDisabled && styles.disabled,
        typeof style === 'function' ? style(state) : style,
      ]}
      {...props}>
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? Colors.white : Colors.ink} />
      ) : (
        <Text maxFontSizeMultiplier={1.3} style={[styles.text, textStyles[variant]]}>
          {title}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MinTapTarget,
    borderRadius: Radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primary: {
    backgroundColor: Colors.emerald,
  },
  secondary: {
    borderWidth: 1.5,
    borderColor: Colors.ink,
  },
  link: {
    minHeight: 44,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 17,
  },
});

const textStyles = StyleSheet.create({
  primary: { color: Colors.white },
  secondary: { color: Colors.ink },
  link: { color: Colors.ink, textDecorationLine: 'underline', fontFamily: Fonts.bodyMedium, fontSize: 15 },
});

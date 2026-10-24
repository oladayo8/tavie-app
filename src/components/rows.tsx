import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import { Body, Label } from '@/components/text';
import { Colors, Fonts, MinTapTarget, Radius, Spacing } from '@/constants/theme';

/** A white card row. Pressable when `onPress` is given. `trailing` sits at the right edge (e.g. reorder arrows). */
export function Row({
  title,
  detail,
  badge,
  warning,
  onPress,
  accessibilityLabel,
  trailing,
  children,
}: {
  title: string;
  detail?: string;
  badge?: string;
  warning?: string;
  onPress?: () => void;
  accessibilityLabel?: string;
  trailing?: ReactNode;
  children?: ReactNode;
}) {
  const text = (
    <>
      <View style={styles.rowTop}>
        <Text style={styles.rowTitle}>{title}</Text>
        {badge ? <Label style={badge === 'Live' ? styles.live : undefined}>{badge}</Label> : null}
      </View>
      {detail ? <Body muted>{detail}</Body> : null}
      {warning ? <Body style={styles.warning}>⚠ {warning}</Body> : null}
      {children}
    </>
  );
  const content = trailing ? (
    <View style={styles.withTrailing}>
      <View style={styles.rowText}>{text}</View>
      {trailing}
    </View>
  ) : (
    text
  );
  if (!onPress) return <View style={styles.row}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {content}
    </Pressable>
  );
}

export function SwitchRow({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.switchRow}>
      <Body style={styles.flex}>{label}</Body>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onValueChange}
        trackColor={{ true: Colors.emerald, false: Colors.line }}
      />
    </View>
  );
}

/** A list of radio choices, each a full-width tap target. */
export function Choices<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <View style={styles.choices} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Label>{label}</Label>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={o.label}
            onPress={() => onChange(o.value)}
            style={[styles.choice, selected && styles.choiceSelected]}>
            <View style={[styles.dot, selected && styles.dotSelected]} />
            <View style={styles.flex}>
              <Text style={styles.choiceText}>{o.label}</Text>
              {o.hint ? <Body muted>{o.hint}</Body> : null}
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small up and down arrows for reordering, stacked at the right edge of a row. */
export function MoveButtons({
  name,
  canUp,
  canDown,
  onMove,
}: {
  name: string;
  canUp: boolean;
  canDown: boolean;
  onMove: (delta: -1 | 1) => void;
}) {
  return (
    <View style={styles.move}>
      <Arrow up label={`Move ${name} up`} disabled={!canUp} onPress={() => onMove(-1)} />
      <Arrow label={`Move ${name} down`} disabled={!canDown} onPress={() => onMove(1)} />
    </View>
  );
}

function Arrow({
  up,
  label,
  disabled,
  onPress,
}: {
  up?: boolean;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={{ left: 8, right: 8 }}
      style={({ pressed }) => [styles.arrow, pressed && styles.pressed, disabled && styles.disabled]}>
      <View style={{ transform: [{ rotate: up ? '-90deg' : '90deg' }] }}>
        <Icon name="chevron" color={Colors.forest} size={16} />
      </View>
    </Pressable>
  );
}

export function SmallButton({
  label,
  accessibilityLabel,
  disabled,
  onPress,
}: {
  label: string;
  accessibilityLabel?: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.small, pressed && styles.pressed, disabled && styles.disabled]}>
      <Text style={styles.smallText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.card,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
  },
  rowTitle: {
    flex: 1,
    fontFamily: Fonts.bodySemiBold,
    fontSize: 17,
    lineHeight: 24,
    color: Colors.ink,
  },
  live: {
    color: Colors.emerald,
  },
  warning: {
    color: Colors.error,
    fontSize: 15,
  },
  pressed: {
    opacity: 0.8,
  },
  disabled: {
    opacity: 0.35,
  },
  flex: {
    flex: 1,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: MinTapTarget,
  },
  choices: {
    gap: Spacing.two,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: MinTapTarget,
    padding: Spacing.three,
    borderRadius: Radius.button,
    borderWidth: 1.5,
    borderColor: Colors.line,
    backgroundColor: Colors.white,
  },
  choiceSelected: {
    borderColor: Colors.ink,
  },
  choiceText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 17,
    color: Colors.ink,
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: Colors.inkMuted,
  },
  dotSelected: {
    borderColor: Colors.emerald,
    backgroundColor: Colors.emerald,
  },
  withTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
    gap: Spacing.one,
  },
  move: {
    gap: 6,
  },
  arrow: {
    width: 40,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: Colors.paper,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  small: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Radius.button,
    borderWidth: 1.5,
    borderColor: Colors.ink,
    paddingHorizontal: Spacing.two,
  },
  smallText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 17,
    color: Colors.ink,
  },
});

import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ActionSheet } from '@/components/action-sheet';
import { Icon } from '@/components/icons';
import { Colors, Fonts } from '@/constants/theme';
import type { ProgramSummary } from '@/lib/builder';
import { joinUrl } from '@/lib/program';

/** A live (or paused) program on the Execution Paths screen. Every number comes from the database. */
export function PathCard({ program: p, students }: { program: ProgramSummary; students: number }) {
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  // On small phones (iPhone SE) the button labels need the room more than the icons do.
  const icons = useWindowDimensions().width >= 385;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const live = p.status === 'live';
  const go = (
    pathname:
      | '/creator/programs/[id]'
      | '/creator/programs/[id]/milestones'
      | '/creator/programs/[id]/preview'
      | '/creator/programs/[id]/share',
  ) => router.push({ pathname, params: { id: p.id } });

  const copy = async () => {
    await Clipboard.setStringAsync(joinUrl(p.slug));
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={[styles.card, live ? styles.cardLive : styles.cardPaused]}>
      <View style={styles.top}>
        <View style={[styles.pill, live ? styles.pillLive : styles.pillPaused]}>
          <Text maxFontSizeMultiplier={1.2} style={[styles.pillText, !live && styles.pillTextPaused]}>
            {live ? 'Active path' : 'Paused'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`More for ${p.title}`}
          onPress={() => setMenu(true)}
          hitSlop={10}
          style={({ pressed }) => [styles.dots, pressed && styles.pressed]}>
          <Icon name="dots" color={Colors.inkMuted} size={20} />
        </Pressable>
      </View>

      <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.title}>
        {p.title}
      </Text>

      {p.goal.trim() !== p.title.trim() ? (
        <View style={styles.goal}>
          <Text maxFontSizeMultiplier={1.2} style={styles.goalLabel}>
            Core goal:
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={styles.goalText}>
            “{p.goal}”
          </Text>
        </View>
      ) : (
        <Text maxFontSizeMultiplier={1.3} style={styles.length}>
          {p.duration_weeks}-week path
        </Text>
      )}

      <View style={styles.stats}>
        <Stat value={p.milestoneCount} label={p.milestoneCount === 1 ? 'Milestone' : 'Milestones'} />
        <Stat value={p.taskCount} label={p.taskCount === 1 ? 'Task' : 'Tasks'} />
        <Stat value={students} label={students === 1 ? 'Student' : 'Students'} accent />
      </View>

      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={() => go('/creator/programs/[id]/milestones')}
          style={({ pressed }) => [styles.button, styles.edit, pressed && styles.pressed]}>
          {icons && <Icon name="edit" color={Colors.forest} size={17} />}
          <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={styles.editText}>
            Edit Milestones
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copied ? 'Link copied' : `Copy the join link for ${p.title}`}
          onPress={copy}
          style={({ pressed }) => [styles.button, styles.copy, pressed && styles.pressed]}>
          {(icons || copied) && <Icon name={copied ? 'check' : 'link'} color={Colors.mint} size={17} />}
          <Text maxFontSizeMultiplier={1.2} numberOfLines={1} style={styles.copyText}>
            {copied ? 'Copied' : 'Copy Link'}
          </Text>
        </Pressable>
      </View>

      <ActionSheet
        visible={menu}
        title={p.title}
        onClose={() => setMenu(false)}
        actions={[
          { label: 'Path details and publishing', onPress: () => go('/creator/programs/[id]') },
          { label: 'Preview as a student', onPress: () => go('/creator/programs/[id]/preview') },
          { label: 'Share link', onPress: () => go('/creator/programs/[id]/share') },
        ]}
      />
    </View>
  );
}

function Stat({ value, label, accent }: { value: number; label: string; accent?: boolean }) {
  return (
    <View style={styles.stat} accessible accessibilityLabel={`${value} ${label}`}>
      <Text maxFontSizeMultiplier={1.2} style={[styles.statValue, accent && styles.statAccent]}>
        {value}
      </Text>
      <Text maxFontSizeMultiplier={1.2} style={styles.statLabel}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
    padding: 18,
    borderRadius: 24,
    backgroundColor: Colors.white,
    borderWidth: 2,
    shadowColor: Colors.ink,
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  cardLive: {
    borderColor: Colors.emerald,
  },
  cardPaused: {
    borderColor: Colors.line,
  },
  top: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  pillLive: {
    backgroundColor: 'rgba(95, 216, 160, 0.45)',
  },
  pillPaused: {
    backgroundColor: Colors.paper,
  },
  pillText: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: Colors.forest,
  },
  pillTextPaused: {
    color: Colors.inkMuted,
  },
  dots: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
  },
  pressed: {
    opacity: 0.7,
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: 23,
    lineHeight: 27,
    letterSpacing: -0.4,
    color: Colors.ink,
  },
  goal: {
    gap: 4,
    padding: 14,
    borderRadius: 14,
    backgroundColor: Colors.paper,
  },
  goalLabel: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: Colors.emerald,
  },
  goalText: {
    fontFamily: Fonts.body,
    fontSize: 15,
    lineHeight: 21,
    color: Colors.ink,
  },
  length: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Colors.inkMuted,
    marginTop: -6,
  },
  stats: {
    flexDirection: 'row',
    gap: 8,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: Colors.paper,
  },
  statValue: {
    fontFamily: Fonts.mono,
    fontSize: 16,
    color: Colors.ink,
  },
  statAccent: {
    color: Colors.emerald,
  },
  statLabel: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    color: Colors.inkMuted,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  button: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  edit: {
    backgroundColor: Colors.paper,
    borderWidth: 1.5,
    borderColor: Colors.line,
  },
  editText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: Colors.ink,
  },
  copy: {
    backgroundColor: Colors.forest,
  },
  copyText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: Colors.white,
  },
});

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Label } from '@/components/text';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { studentButton, type CompletionType, type ResourceType } from '@/lib/program';

export type TodayCardTask = {
  title: string;
  why: string | null;
  completion_type: CompletionType;
  unit: string | null;
  target_count: number | null;
  is_optional: boolean;
  est_minutes?: number | null;
};

const RESOURCE_KIND: Record<ResourceType, string> = { youtube: 'Video', link: 'Link', file: 'PDF' };

/** "~30 min", "~2 hr", "~1.5 hr". */
export function estimate(minutes: number | null | undefined): string | null {
  if (!minutes || minutes <= 0) return null;
  if (minutes < 60) return `~${minutes} min`;
  const hours = Math.round((minutes / 60) * 2) / 2;
  return `~${hours} hr`;
}

/**
 * The student's one task for today (spec section 3). The creator preview and the student
 * Today screen both use it, so the preview can't drift.
 */
export function TodayCard({
  task,
  milestoneNumber,
  milestoneCount,
  milestoneTitle,
  resources,
  loggedSoFar = 0,
  onPrimary,
  onStuck,
  onSkip,
  onResource,
  notice,
  actions,
  showPowered = true,
  showMilestone = true,
  stuck = false,
}: {
  task: TodayCardTask;
  milestoneNumber: number;
  milestoneCount: number;
  milestoneTitle: string;
  resources: { id: string; title: string; type: ResourceType }[];
  loggedSoFar?: number;
  onPrimary?: () => void;
  onStuck?: () => void;
  onSkip?: () => void;
  onResource?: (id: string) => void;
  /** Shown under the title, e.g. "You said you're stuck". */
  notice?: ReactNode;
  /** Replaces the buttons, e.g. with the check-in questions. */
  actions?: ReactNode;
  showPowered?: boolean;
  /** The Today screen shows the milestone in its header instead. */
  showMilestone?: boolean;
  /** Already stuck: hides "I'm stuck" (the notice offers "I figured it out"). */
  stuck?: boolean;
}) {
  const target = task.completion_type === 'count' ? task.target_count : null;
  const time = estimate(task.est_minutes);
  return (
    <View style={styles.wrap}>
      {showMilestone ? (
        <Label numberOfLines={1}>
          Milestone {milestoneNumber} of {milestoneCount} · {milestoneTitle}
        </Label>
      ) : null}
      <View style={styles.card}>
        <View style={styles.meta}>
          <Label style={styles.today}>Today’s task</Label>
          <View style={styles.chips}>
            {task.is_optional ? <Chip text="Optional" /> : null}
            {time ? <Chip text={time} /> : null}
          </View>
        </View>
        <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.title}>
          {task.title}
        </Text>
        {task.why ? (
          <Text maxFontSizeMultiplier={1.3} style={styles.why}>
            {task.why}
          </Text>
        ) : null}
        {target ? (
          <View
            style={styles.count}
            accessible
            accessibilityLabel={`${loggedSoFar} of ${target} ${task.unit ?? ''} logged`}>
            <View style={styles.countRow}>
              <Text maxFontSizeMultiplier={1.3} style={styles.countNumber}>
                {loggedSoFar}
                <Text style={styles.countOf}>
                  {' '}
                  / {target} {task.unit ?? ''}
                </Text>
              </Text>
              <Text maxFontSizeMultiplier={1.3} style={styles.countLeft}>
                {Math.max(0, target - loggedSoFar)} to go
              </Text>
            </View>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${Math.min(100, (loggedSoFar / target) * 100)}%` }]} />
            </View>
          </View>
        ) : null}
        {notice}
        {resources.length ? (
          <View style={styles.resources}>
            {resources.map((r, i) => (
              <Pressable
                key={r.id}
                accessibilityRole="link"
                accessibilityLabel={`Open ${r.title}`}
                onPress={() => onResource?.(r.id)}
                style={({ pressed }) => [styles.resource, i > 0 && styles.divider, pressed && styles.pressed]}>
                <View style={styles.kind}>
                  <Text maxFontSizeMultiplier={1.2} style={styles.kindText}>
                    {RESOURCE_KIND[r.type]}
                  </Text>
                </View>
                <Text maxFontSizeMultiplier={1.3} style={styles.resourceTitle} numberOfLines={2}>
                  {r.title}
                </Text>
                <Text style={styles.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {actions ?? (
          <View style={styles.actions}>
            <Button title={studentButton(task.completion_type, task.unit)} onPress={onPrimary} />
            {stuck ? null : <Button variant="secondary" title="I’m stuck" onPress={onStuck ?? onPrimary} />}
            {task.is_optional ? <Button variant="link" title="Skip this one" onPress={onSkip ?? onPrimary} /> : null}
          </View>
        )}
      </View>
      {showPowered ? <Label style={styles.powered}>Powered by Tavie</Label> : null}
    </View>
  );
}

function Chip({ text }: { text: string }) {
  return (
    <View style={styles.chip}>
      <Text maxFontSizeMultiplier={1.2} style={styles.chipText}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: Spacing.two,
  },
  card: {
    gap: 14,
    padding: 20,
    borderRadius: 20,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.line,
    shadowColor: Colors.ink,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  today: {
    color: Colors.emerald,
    fontSize: 11,
  },
  chips: {
    flexDirection: 'row',
    gap: 6,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: Colors.paper,
  },
  chipText: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: Colors.inkMuted,
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.5,
    color: Colors.ink,
  },
  why: {
    fontFamily: Fonts.body,
    fontSize: 15,
    lineHeight: 22,
    color: Colors.inkMuted,
  },
  count: {
    gap: 6,
  },
  countRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  countNumber: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 20,
    color: Colors.ink,
  },
  countOf: {
    fontFamily: Fonts.body,
    fontSize: 15,
    color: Colors.inkMuted,
  },
  countLeft: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Colors.inkMuted,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.paper,
    overflow: 'hidden',
  },
  fill: {
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.emerald,
  },
  resources: {
    borderRadius: Radius.button,
    borderWidth: 1,
    borderColor: Colors.line,
    overflow: 'hidden',
  },
  resource: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  kind: {
    width: 46,
    paddingVertical: 3,
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: Colors.paper,
  },
  kindText: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: Colors.forest,
  },
  resourceTitle: {
    flex: 1,
    fontFamily: Fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 20,
    color: Colors.ink,
  },
  chevron: {
    fontSize: 22,
    lineHeight: 24,
    color: Colors.inkMuted,
  },
  pressed: {
    opacity: 0.7,
  },
  actions: {
    gap: 10,
    paddingTop: 2,
  },
  powered: {
    textAlign: 'center',
  },
});

import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Body, Headline, Label } from '@/components/text';
import { Colors, Fonts, MinTapTarget, Radius, Spacing } from '@/constants/theme';
import { studentButton, type CompletionType, type ResourceType } from '@/lib/program';

export type TodayCardTask = {
  title: string;
  why: string | null;
  completion_type: CompletionType;
  unit: string | null;
  target_count: number | null;
  is_optional: boolean;
};

const RESOURCE_KIND: Record<ResourceType, string> = { youtube: 'YouTube', link: 'Link', file: 'PDF' };

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
  /** Already stuck: hides "I'm stuck" (the notice offers "I figured it out"). */
  stuck?: boolean;
}) {
  const target = task.completion_type === 'count' ? task.target_count : null;
  return (
    <View style={styles.card}>
      <Label>
        Today · Milestone {milestoneNumber} of {milestoneCount} · {milestoneTitle}
      </Label>
      <Headline style={styles.title}>{task.title}</Headline>
      {target ? (
        <View style={styles.progress}>
          <Body muted>
            {loggedSoFar} of {target} {task.unit ?? ''} logged
          </Body>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.min(100, (loggedSoFar / target) * 100)}%` }]} />
          </View>
        </View>
      ) : null}
      {notice}
      {task.why ? <Body>{task.why}</Body> : null}
      {resources.length ? (
        <View style={styles.resources}>
          <Label>What you need</Label>
          {resources.map((r) => (
            <Pressable
              key={r.id}
              accessibilityRole="link"
              accessibilityLabel={`Open ${r.title}`}
              onPress={() => onResource?.(r.id)}
              style={({ pressed }) => [styles.resource, pressed && styles.pressed]}>
              <Text style={styles.resourceTitle} numberOfLines={2}>
                {r.title} <Text style={styles.kind}>({RESOURCE_KIND[r.type]})</Text>
              </Text>
              <Text style={styles.open}>Open</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      {actions ?? (
        <>
          <Button title={studentButton(task.completion_type, task.unit)} onPress={onPrimary} />
          <View style={styles.escapes}>
            {stuck ? null : <Button variant="link" title="I’m stuck" onPress={onStuck ?? onPrimary} />}
            {task.is_optional ? <Button variant="link" title="Skip this one" onPress={onSkip ?? onPrimary} /> : null}
          </View>
        </>
      )}
      {showPowered ? <Label style={styles.powered}>Powered by Tavie</Label> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.three,
  },
  title: {
    fontSize: 28,
    lineHeight: 32,
  },
  progress: {
    gap: Spacing.one,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.line,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    backgroundColor: Colors.emerald,
  },
  resources: {
    gap: Spacing.two,
  },
  resource: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: MinTapTarget,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.button,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  resourceTitle: {
    flex: 1,
    fontFamily: Fonts.bodyMedium,
    fontSize: 16,
    color: Colors.ink,
  },
  kind: {
    color: Colors.inkMuted,
  },
  open: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: Colors.ink,
    textDecorationLine: 'underline',
  },
  pressed: {
    opacity: 0.8,
  },
  escapes: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.four,
  },
  powered: {
    textAlign: 'center',
  },
});

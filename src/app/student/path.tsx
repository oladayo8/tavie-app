import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ErrorState, Loading } from '@/components/states';
import { Label } from '@/components/text';
import { Colors, Fonts } from '@/constants/theme';
import { getPath, type StudentPath } from '@/lib/student';
import { useLoad } from '@/lib/use-load';

type PathTask = StudentPath['milestones'][number]['tasks'][number];

/**
 * My Path: the whole plan in the creator's order. Read only. Nothing here can finish, skip, or
 * reorder a task; that only happens through check-ins on Today.
 */
export default function PathScreen() {
  const load = useCallback(() => getPath(), []);
  const { data, loading, error, retry } = useLoad(load);

  return (
    <Screen tab>
      <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.title}>
        My Path
      </Text>
      {data ? (
        <Path path={data} />
      ) : error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : loading ? (
        <Loading label="Loading your path" />
      ) : (
        <View style={styles.card}>
          <Text maxFontSizeMultiplier={1.3} style={styles.body}>
            Open your coach’s link to start your plan.
          </Text>
        </View>
      )}
    </Screen>
  );
}

function Path({ path }: { path: StudentPath }) {
  const tasks = path.milestones.flatMap((m) => m.tasks);
  const done = tasks.filter((t) => t.state === 'done' || t.state === 'skipped').length;
  const coach = [path.creator.first_name, path.creator.last_name].filter(Boolean).join(' ');
  return (
    <View style={styles.content}>
      <View style={styles.summary}>
        <Text maxFontSizeMultiplier={1.3} style={styles.program} numberOfLines={2}>
          {path.program.title}
        </Text>
        <Text maxFontSizeMultiplier={1.3} style={styles.muted}>
          with {coach}
        </Text>
        <View style={styles.progressRow} accessible accessibilityLabel={`${done} of ${tasks.length} tasks done`}>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }]} />
          </View>
          <Text maxFontSizeMultiplier={1.2} style={styles.count}>
            {done}/{tasks.length} tasks
          </Text>
        </View>
      </View>

      {path.finished ? (
        <Note text={`You finished ${path.creator.first_name}’s path.`} />
      ) : path.program.status === 'paused' ? (
        <Note text={`${path.creator.first_name} has paused this program. Your progress is saved.`} />
      ) : null}

      {path.milestones.map((m) => {
        const finished = m.tasks.filter((t) => t.state === 'done' || t.state === 'skipped').length;
        const here = m.tasks.some((t) => t.state === 'current');
        return (
          <View key={m.number} style={[styles.card, here && styles.cardCurrent]}>
            <View style={styles.milestoneHead}>
              <Label style={here ? styles.currentLabel : undefined}>Milestone {m.number}</Label>
              <Label>
                {finished}/{m.tasks.length}
              </Label>
            </View>
            <Text maxFontSizeMultiplier={1.3} style={styles.milestoneTitle}>
              {m.title}
            </Text>
            <View style={styles.tasks}>
              {m.tasks.map((t, i) => (
                <TaskLine key={i} t={t} />
              ))}
            </View>
          </View>
        );
      })}

      <Text maxFontSizeMultiplier={1.3} style={styles.footnote}>
        Your coach set this order. Check in on Today to move to the next task.
      </Text>
    </View>
  );
}

function TaskLine({ t }: { t: PathTask }) {
  const count =
    t.completion_type === 'count' && t.target_count
      ? `${t.count_so_far}/${t.target_count} ${t.unit ?? ''}`.trim()
      : null;
  const detail =
    t.state === 'done'
      ? t.done_at
        ? `Done ${new Date(t.done_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
        : 'Done'
      : t.state === 'skipped'
        ? 'Skipped'
        : t.state === 'current'
          ? [t.stuck ? 'You said you’re stuck' : 'Today', t.count_so_far ? count : null].filter(Boolean).join(' · ')
          : t.is_optional
            ? 'Optional'
            : null;
  return (
    <View
      style={styles.task}
      accessible
      accessibilityLabel={`${t.title}. ${t.state === 'upcoming' ? 'Coming up' : (detail ?? '')}`}>
      <View
        style={[
          styles.dot,
          t.state === 'done' && styles.dotDone,
          t.state === 'current' && (t.stuck ? styles.dotStuck : styles.dotCurrent),
        ]}>
        {t.state === 'done' ? <Text style={styles.check}>✓</Text> : null}
      </View>
      <View style={styles.flex}>
        <Text
          maxFontSizeMultiplier={1.3}
          style={[
            styles.taskTitle,
            t.state === 'current' && styles.taskCurrent,
            (t.state === 'upcoming' || t.state === 'skipped') && styles.muted,
            t.state === 'skipped' && styles.strike,
          ]}>
          {t.title}
        </Text>
        {detail ? (
          <Text maxFontSizeMultiplier={1.3} style={[styles.detail, t.stuck && t.state === 'current' && styles.stuck]}>
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function Note({ text }: { text: string }) {
  return (
    <View style={styles.note}>
      <Text maxFontSizeMultiplier={1.3} style={styles.noteText}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: Fonts.display,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.5,
    color: Colors.ink,
    paddingBottom: 16,
  },
  content: {
    gap: 12,
    paddingBottom: 16,
  },
  summary: {
    gap: 4,
    paddingBottom: 4,
  },
  program: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 17,
    lineHeight: 22,
    color: Colors.ink,
  },
  muted: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Colors.inkMuted,
  },
  body: {
    fontFamily: Fonts.body,
    fontSize: 15,
    lineHeight: 21,
    color: Colors.ink,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
  },
  track: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.line,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    backgroundColor: Colors.emerald,
  },
  count: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: Colors.inkMuted,
  },
  card: {
    gap: 6,
    padding: 16,
    borderRadius: 16,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  cardCurrent: {
    borderColor: Colors.emerald,
    borderWidth: 1.5,
  },
  milestoneHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  currentLabel: {
    color: Colors.emerald,
  },
  milestoneTitle: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 16,
    lineHeight: 21,
    color: Colors.ink,
  },
  tasks: {
    gap: 10,
    paddingTop: 6,
  },
  task: {
    flexDirection: 'row',
    gap: 10,
  },
  dot: {
    width: 20,
    height: 20,
    marginTop: 1,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: Colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: {
    borderColor: Colors.emerald,
    backgroundColor: Colors.emerald,
  },
  dotCurrent: {
    borderColor: Colors.emerald,
    borderWidth: 6,
  },
  dotStuck: {
    borderColor: Colors.error,
    borderWidth: 6,
  },
  check: {
    color: Colors.white,
    fontSize: 12,
    lineHeight: 14,
    fontFamily: Fonts.bodySemiBold,
  },
  flex: {
    flex: 1,
  },
  taskTitle: {
    fontFamily: Fonts.body,
    fontSize: 15,
    lineHeight: 21,
    color: Colors.ink,
  },
  taskCurrent: {
    fontFamily: Fonts.bodySemiBold,
  },
  strike: {
    textDecorationLine: 'line-through',
  },
  detail: {
    fontFamily: Fonts.body,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.inkMuted,
  },
  stuck: {
    color: Colors.error,
  },
  note: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(95, 216, 160, 0.22)',
  },
  noteText: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 14,
    color: Colors.forest,
  },
  footnote: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.inkMuted,
    textAlign: 'center',
  },
});

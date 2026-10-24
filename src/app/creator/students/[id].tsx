import { useLocalSearchParams } from 'expo-router';
import { useCallback, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/screen';
import { StatusPill } from '@/components/student-row';
import { ErrorState, Loading } from '@/components/states';
import { Label } from '@/components/text';
import { TopBar } from '@/components/top-bar';
import { Colors, Fonts } from '@/constants/theme';
import {
  ago,
  attentionLine,
  getStudent,
  reportSummary,
  resolvedLine,
  when,
  type PathTask,
  type ReportedCheckIn,
  type StudentRecord,
} from '@/lib/dashboard';
import { useLoad } from '@/lib/use-load';

/**
 * One student's record, read only: where they are, the path, and every check-in exactly as they
 * reported it. Tavie records reports; it doesn't verify them, and the screen says so.
 */
export default function StudentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => getStudent(id), [id]);
  const { data, error, retry } = useLoad(load);

  return (
    <Screen>
      <TopBar parent="/creator/students" label="Students" />
      {data ? <Record s={data} /> : error ? <ErrorState message={error} onRetry={retry} /> : <Loading />}
    </Screen>
  );
}

function Record({ s }: { s: StudentRecord }) {
  const reason = attentionLine(s);
  return (
    <View style={styles.content}>
      <View style={styles.head}>
        <View style={styles.nameRow}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.name} numberOfLines={2}>
            {s.name}
          </Text>
          <StatusPill status={s.status} attention={s.attention} />
        </View>
        {s.name !== s.email ? <Small>{s.email}</Small> : null}
        <Small>
          {s.program.title} · Joined {when(s.joined_at)}
        </Small>
      </View>

      <View style={styles.facts}>
        <Fact label="Tasks done" value={`${s.progress.done}/${s.progress.total}`} />
        <Fact label="Last active" value={ago(s.last_activity_at)} />
        <Fact
          label="Milestone"
          value={
            s.status === 'completed' ? 'Done' : s.milestone ? `${s.milestone.number} of ${s.milestone.count}` : '–'
          }
        />
      </View>

      {s.attention === 'blocker' && s.blocker ? (
        <View style={[styles.box, styles.blockerBox]}>
          <Label style={styles.blockerLabel}>Open blocker</Label>
          <Text maxFontSizeMultiplier={1.3} style={styles.boxTitle}>
            {s.blocker.reason}
          </Text>
          {s.blocker.note ? <Quote>{s.blocker.note}</Quote> : null}
          <Small>
            On “{s.task?.title}” · reported {when(s.blocker.reported_at)}
          </Small>
        </View>
      ) : reason ? (
        <View style={[styles.box, styles.inactiveBox]}>
          <Text maxFontSizeMultiplier={1.3} style={styles.boxTitle}>
            {reason}
          </Text>
          <Small>Last activity {when(s.last_activity_at)}</Small>
        </View>
      ) : null}

      {s.task && s.milestone ? (
        <View style={styles.box}>
          <Label>
            Now on · Milestone {s.milestone.number} · {s.milestone.title}
          </Label>
          <Text maxFontSizeMultiplier={1.3} style={styles.boxTitle}>
            {s.task.title}
          </Text>
          {s.task.completion_type === 'count' && s.task.target_count ? (
            <Count so={s.task.count_so_far} target={s.task.target_count} unit={s.task.unit} />
          ) : null}
        </View>
      ) : null}

      <View style={styles.section}>
        <Label>Path</Label>
        <View style={styles.group}>
          {s.path.map((m, mi) => (
            <View key={m.number} style={[styles.milestone, mi > 0 && styles.divider]}>
              <Text maxFontSizeMultiplier={1.3} style={styles.milestoneTitle}>
                {m.number}. {m.title}
              </Text>
              {m.tasks.map((t) => (
                <PathLine key={t.id} t={t} />
              ))}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Label>Check-ins</Label>
        <Small>Reported by the student. Tavie records what they say; it doesn’t verify it.</Small>
        {s.check_ins.length ? (
          <View style={styles.group}>
            {s.check_ins.map((c, i) => (
              <CheckInLine key={c.id} c={c} first={i === 0} />
            ))}
          </View>
        ) : (
          <View style={styles.box}>
            <Small>No check-ins yet. They joined {ago(s.joined_at)}.</Small>
          </View>
        )}
      </View>
    </View>
  );
}

const MARK: Record<PathTask['state'], string> = {
  done: '✓',
  skipped: '–',
  current: '●',
  in_progress: '●',
  stuck: '!',
  not_started: '○',
};

function PathLine({ t }: { t: PathTask }) {
  const detail =
    t.state === 'done'
      ? t.done_at
        ? `Done ${when(t.done_at)}`
        : 'Done'
      : t.state === 'skipped'
        ? 'Skipped (optional)'
        : t.state === 'stuck'
          ? 'Stuck'
          : t.current
            ? 'Current'
            : null;
  const count =
    t.completion_type === 'count' && t.target_count && t.state !== 'not_started'
      ? `${t.count_so_far}/${t.target_count} ${t.unit ?? ''}`.trim()
      : null;
  return (
    <View style={styles.pathLine}>
      <Text
        style={[
          styles.mark,
          t.state === 'done' && styles.markDone,
          t.state === 'stuck' && styles.markStuck,
          t.current && t.state !== 'stuck' && styles.markCurrent,
        ]}>
        {MARK[t.state]}
      </Text>
      <View style={styles.flex}>
        <Text
          maxFontSizeMultiplier={1.3}
          style={[styles.pathTitle, t.state === 'not_started' && styles.muted, t.current && styles.bold]}>
          {t.title}
        </Text>
        {detail || count ? (
          <Text maxFontSizeMultiplier={1.3} style={styles.pathDetail}>
            {[detail, count].filter(Boolean).join(' · ')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function CheckInLine({ c, first }: { c: ReportedCheckIn; first: boolean }) {
  const resolved = resolvedLine(c.resolved_by);
  return (
    <View style={[styles.checkIn, !first && styles.divider]}>
      <View style={styles.checkInTop}>
        <Text maxFontSizeMultiplier={1.3} style={[styles.checkInKind, c.kind === 'stuck' && styles.reasonBlocker]}>
          {reportSummary(c)}
        </Text>
        <Text maxFontSizeMultiplier={1.2} style={styles.time}>
          {when(c.created_at)}
        </Text>
      </View>
      <Small>{c.task_title}</Small>
      {c.kind === 'complete' && c.completion_type === 'yes_no' ? <Small>Answered: Yes</Small> : null}
      {c.reason ? <Small>Reason: {c.reason}</Small> : null}
      {c.value_text ? <Quote>{c.value_text}</Quote> : null}
      {c.follow_up_answer ? (
        <Small>
          {c.follow_up_question ?? 'Follow-up'} {c.follow_up_answer}
        </Small>
      ) : null}
      {c.kind === 'stuck' ? (
        <Text maxFontSizeMultiplier={1.3} style={[styles.resolution, resolved ? styles.resolved : styles.unresolved]}>
          {resolved ? `Resolved · ${resolved}, ${when(c.resolved_at!)}` : 'Not resolved yet'}
        </Text>
      ) : null}
    </View>
  );
}

function Count({ so, target, unit }: { so: number; target: number; unit: string | null }) {
  return (
    <View style={styles.count}>
      <Text maxFontSizeMultiplier={1.3} style={styles.countText}>
        {so} / {target} {unit ?? ''}
      </Text>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(100, (so / target) * 100)}%` }]} />
      </View>
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.fact}>
      <Text maxFontSizeMultiplier={1.2} style={styles.factValue} numberOfLines={1}>
        {value}
      </Text>
      <Text maxFontSizeMultiplier={1.2} style={styles.factLabel}>
        {label}
      </Text>
    </View>
  );
}

function Small({ children }: { children: ReactNode }) {
  return (
    <Text maxFontSizeMultiplier={1.3} style={styles.small}>
      {children}
    </Text>
  );
}

function Quote({ children }: { children: ReactNode }) {
  return (
    <View style={styles.quote}>
      <Text maxFontSizeMultiplier={1.3} style={styles.quoteText}>
        {children}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
    paddingTop: 12,
  },
  head: {
    gap: 4,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  name: {
    flex: 1,
    fontFamily: Fonts.display,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.4,
    color: Colors.ink,
  },
  small: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.inkMuted,
  },
  facts: {
    flexDirection: 'row',
    gap: 8,
  },
  fact: {
    flex: 1,
    padding: 10,
    borderRadius: 12,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.line,
    gap: 2,
  },
  factValue: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 16,
    color: Colors.ink,
  },
  factLabel: {
    fontFamily: Fonts.mono,
    fontSize: 9,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: Colors.inkMuted,
  },
  box: {
    gap: 6,
    padding: 14,
    borderRadius: 14,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  blockerBox: {
    borderColor: Colors.error,
    backgroundColor: '#FDF3F2',
  },
  blockerLabel: {
    color: Colors.error,
  },
  inactiveBox: {
    borderColor: Colors.ink,
  },
  boxTitle: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 16,
    lineHeight: 21,
    color: Colors.ink,
  },
  count: {
    gap: 6,
  },
  countText: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 14,
    color: Colors.ink,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.paper,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    backgroundColor: Colors.emerald,
  },
  section: {
    gap: 8,
  },
  group: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.white,
    overflow: 'hidden',
  },
  divider: {
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  milestone: {
    gap: 8,
    padding: 14,
  },
  milestoneTitle: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: Colors.ink,
  },
  pathLine: {
    flexDirection: 'row',
    gap: 10,
  },
  mark: {
    width: 16,
    textAlign: 'center',
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.inkMuted,
  },
  markDone: {
    color: Colors.emerald,
  },
  markCurrent: {
    color: Colors.mint,
  },
  markStuck: {
    color: Colors.error,
  },
  flex: {
    flex: 1,
  },
  pathTitle: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.ink,
  },
  muted: {
    color: Colors.inkMuted,
  },
  bold: {
    fontFamily: Fonts.bodySemiBold,
  },
  pathDetail: {
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.inkMuted,
  },
  checkIn: {
    gap: 4,
    padding: 14,
  },
  checkInTop: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  checkInKind: {
    flex: 1,
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: Colors.ink,
  },
  reasonBlocker: {
    color: Colors.error,
  },
  time: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: Colors.inkMuted,
  },
  quote: {
    marginTop: 2,
    paddingLeft: 10,
    borderLeftWidth: 3,
    borderLeftColor: Colors.line,
  },
  quoteText: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.ink,
  },
  resolution: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 13,
    paddingTop: 2,
  },
  resolved: {
    color: Colors.emerald,
  },
  unresolved: {
    color: Colors.error,
  },
});

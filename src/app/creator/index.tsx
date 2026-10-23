import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Row } from '@/components/rows';
import { Screen } from '@/components/screen';
import { StudentRowCard } from '@/components/student-row';
import { ErrorState, Loading } from '@/components/states';
import { Body, Headline, Label } from '@/components/text';
import { Wordmark } from '@/components/wordmark';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { signOut } from '@/lib/auth';
import { listPrograms } from '@/lib/builder';
import { attentionLine, getDashboard, type Dashboard } from '@/lib/dashboard';
import { useLoad } from '@/lib/use-load';

/**
 * Creator home. With a published program it opens on who needs help: four counts, then
 * "Needs attention" (blockers first, then inactive), then everyone. All programs, drafts
 * included, stay below for building.
 */
export default function CreatorHome() {
  const [programId, setProgramId] = useState<string | null>(null);
  const load = useCallback(
    async () => ({ dashboard: await getDashboard(programId), programs: await listPrograms() }),
    [programId],
  );
  const { data, loading, error, retry } = useLoad(load);

  const header = (
    <View style={styles.bar}>
      <Wordmark size={24} />
      <Pressable
        accessibilityRole="button"
        onPress={signOut}
        hitSlop={8}
        style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
        <Text maxFontSizeMultiplier={1.3} style={styles.signOutText}>
          Sign out
        </Text>
      </Pressable>
    </View>
  );

  if (!data) {
    return (
      <Screen>
        {header}
        {error ? <ErrorState message={error} onRetry={retry} /> : <Loading />}
      </Screen>
    );
  }

  const { dashboard, programs } = data;
  const selected = dashboard.programs.find((p) => p.id === dashboard.program_id) ?? null;

  return (
    <Screen>
      {header}
      {selected ? (
        <View style={styles.dashboard}>
          {dashboard.programs.length > 1 ? (
            <ProgramPicker
              programs={dashboard.programs}
              selected={selected.id}
              onSelect={(id) => setProgramId(id)}
              busy={loading}
            />
          ) : null}
          <View style={styles.titleBlock}>
            <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.title} numberOfLines={2}>
              {selected.title}
            </Text>
            <Text maxFontSizeMultiplier={1.3} style={styles.subtitle}>
              {selected.status === 'paused' ? 'Paused' : 'Live'} · {selected.enrolled}{' '}
              {selected.enrolled === 1 ? 'student' : 'students'}
            </Text>
          </View>
          <Students dashboard={dashboard} programId={selected.id} />
        </View>
      ) : null}

      <View style={styles.section}>
        <Label>Your programs</Label>
        {programs.length ? (
          programs.map((p) => (
            <Row
              key={p.id}
              title={p.goal}
              badge={p.status === 'live' ? 'Live' : p.status === 'paused' ? 'Paused' : 'Draft'}
              detail={`${p.milestoneCount} ${p.milestoneCount === 1 ? 'milestone' : 'milestones'} · ${p.taskCount} ${p.taskCount === 1 ? 'task' : 'tasks'}`}
              onPress={() => router.push({ pathname: '/creator/programs/[id]', params: { id: p.id } })}
            />
          ))
        ) : (
          <View style={styles.empty}>
            <Headline>Build your first path.</Headline>
            <Body muted>It takes about 45 minutes. You can stop any time; everything saves as you go.</Body>
          </View>
        )}
        <Button
          variant={selected ? 'secondary' : 'primary'}
          title="New program"
          onPress={() => router.push('/creator/new')}
        />
      </View>
    </Screen>
  );
}

function Students({ dashboard, programId }: { dashboard: Dashboard; programId: string }) {
  const counts = dashboard.counts!;
  const attention = dashboard.students.filter((s) => s.status === 'needs_attention');
  const open = (id: string) => router.push({ pathname: '/creator/students/[id]', params: { id } });

  if (!counts.enrolled) {
    return (
      <View style={styles.card}>
        <Text maxFontSizeMultiplier={1.3} style={styles.cardTitle}>
          No one has joined yet.
        </Text>
        <Body muted style={styles.small}>
          Send your link to your students. They’ll show up here as soon as they join.
        </Body>
        <Button
          variant="secondary"
          title="Share your link"
          onPress={() => router.push({ pathname: '/creator/programs/[id]/share', params: { id: programId } })}
        />
      </View>
    );
  }

  return (
    <>
      <View style={styles.stats}>
        <Stat label="Enrolled" value={counts.enrolled} />
        <Stat label="Progressing" value={counts.progressing} />
        <Stat label="Needs attention" value={counts.needs_attention} alert={counts.needs_attention > 0} />
        <Stat label="Completed" value={counts.completed} />
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Label style={attention.length ? styles.alertLabel : undefined}>Needs attention</Label>
          {attention.length ? <Label>{attention.length}</Label> : null}
        </View>
        {attention.length ? (
          <View style={styles.list}>
            {attention.map((s) => (
              <Pressable
                key={s.enrollment_id}
                accessibilityRole="button"
                accessibilityLabel={`${s.name}. ${attentionLine(s)}`}
                onPress={() => open(s.enrollment_id)}
                style={({ pressed }) => [
                  styles.attention,
                  s.attention === 'blocker' ? styles.blocker : styles.inactive,
                  pressed && styles.pressed,
                ]}>
                <View style={styles.attentionTop}>
                  <Text maxFontSizeMultiplier={1.3} style={styles.name} numberOfLines={1}>
                    {s.name}
                  </Text>
                  <Text
                    maxFontSizeMultiplier={1.2}
                    style={[styles.kind, s.attention === 'blocker' && styles.reasonBlocker]}>
                    {s.attention === 'blocker' ? 'Blocker' : 'Inactive'}
                  </Text>
                </View>
                <Text
                  maxFontSizeMultiplier={1.3}
                  style={[styles.reason, s.attention === 'blocker' && styles.reasonBlocker]}
                  numberOfLines={1}>
                  {attentionLine(s)}
                </Text>
                {s.attention === 'blocker' && s.blocker?.note ? (
                  <Text maxFontSizeMultiplier={1.3} style={styles.note} numberOfLines={2}>
                    “{s.blocker.note}”
                  </Text>
                ) : null}
                {s.task ? (
                  <Text maxFontSizeMultiplier={1.3} style={styles.meta} numberOfLines={1}>
                    On: {s.task.title}
                  </Text>
                ) : null}
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.allClear}>
            <Text maxFontSizeMultiplier={1.3} style={styles.allClearText}>
              ✓ No one needs you right now.
            </Text>
          </View>
        )}
      </View>

      <View style={styles.section}>
        <View style={styles.sectionHead}>
          <Label>All students</Label>
          <Label>{counts.enrolled}</Label>
        </View>
        <View style={styles.group}>
          {dashboard.students.map((s, i) => (
            <StudentRowCard key={s.enrollment_id} student={s} first={i === 0} onPress={() => open(s.enrollment_id)} />
          ))}
        </View>
        <Body muted style={styles.footnote}>
          Inactive means no check-in for {dashboard.inactive_days ?? 3} days. Everything here is what students reported.
        </Body>
      </View>
    </>
  );
}

function ProgramPicker({
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

function Stat({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <View style={[styles.stat, alert && styles.statAlert]} accessible accessibilityLabel={`${value} ${label}`}>
      <Text maxFontSizeMultiplier={1.2} style={[styles.statValue, alert && styles.statValueAlert]}>
        {value}
      </Text>
      <Text maxFontSizeMultiplier={1.2} style={styles.statLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  signOut: {
    minHeight: 36,
    justifyContent: 'center',
  },
  signOutText: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 14,
    color: Colors.inkMuted,
  },
  pressed: {
    opacity: 0.7,
  },
  dashboard: {
    gap: 16,
    paddingTop: 20,
  },
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
  titleBlock: {
    gap: 2,
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.4,
    color: Colors.ink,
  },
  subtitle: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Colors.inkMuted,
  },
  stats: {
    flexDirection: 'row',
    gap: 8,
  },
  stat: {
    flex: 1,
    minHeight: 76,
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 14,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.line,
    alignItems: 'center',
    gap: 2,
  },
  statAlert: {
    borderColor: Colors.error,
    backgroundColor: '#FDF3F2',
  },
  statValue: {
    fontFamily: Fonts.display,
    fontSize: 24,
    lineHeight: 28,
    color: Colors.ink,
  },
  statValueAlert: {
    color: Colors.error,
  },
  statLabel: {
    fontFamily: Fonts.mono,
    fontSize: 9,
    lineHeight: 12,
    textAlign: 'center',
    textTransform: 'uppercase',
    color: Colors.inkMuted,
  },
  kind: {
    fontFamily: Fonts.mono,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Colors.ink,
  },
  section: {
    gap: 10,
    paddingTop: 20,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  alertLabel: {
    color: Colors.error,
  },
  list: {
    gap: 8,
  },
  attention: {
    gap: 4,
    padding: 14,
    borderRadius: 14,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  blocker: {
    borderColor: Colors.line,
    borderLeftColor: Colors.error,
  },
  inactive: {
    borderColor: Colors.line,
    borderLeftColor: Colors.ink,
  },
  attentionTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  name: {
    flex: 1,
    fontFamily: Fonts.bodySemiBold,
    fontSize: 16,
    color: Colors.ink,
  },
  reason: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 14,
    color: Colors.ink,
  },
  reasonBlocker: {
    color: Colors.error,
  },
  note: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.inkMuted,
  },
  meta: {
    fontFamily: Fonts.body,
    fontSize: 13,
    color: Colors.inkMuted,
  },
  allClear: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(95, 216, 160, 0.22)',
  },
  allClearText: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 15,
    color: Colors.forest,
  },
  group: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.white,
    overflow: 'hidden',
  },
  footnote: {
    fontSize: 13,
    lineHeight: 18,
  },
  card: {
    gap: 10,
    padding: 20,
    borderRadius: 20,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  cardTitle: {
    fontFamily: Fonts.display,
    fontSize: 20,
    lineHeight: 24,
    color: Colors.ink,
  },
  small: {
    fontSize: 15,
    lineHeight: 21,
  },
  empty: {
    gap: Spacing.three,
  },
});

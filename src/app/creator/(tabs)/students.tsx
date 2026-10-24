import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { ProgramPicker } from '@/components/program-picker';
import { Screen } from '@/components/screen';
import { ErrorState, Loading } from '@/components/states';
import { Colors, Fonts } from '@/constants/theme';
import { ago, attentionLine, getDashboard, studentLabel, type StudentRow, type StudentStatus } from '@/lib/dashboard';
import { useSelectedProgram } from '@/lib/selected-program';
import { useLoad } from '@/lib/use-load';

type Filter = 'all' | StudentStatus;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'needs_attention', label: 'Needs attention' },
  { key: 'progressing', label: 'Progressing' },
  { key: 'completed', label: 'Completed' },
];

/** Students tab, the roster: everyone in the selected path, needs-attention first, with filters. */
export default function StudentsScreen() {
  const { programId, setProgramId } = useSelectedProgram();
  const load = useCallback(() => getDashboard(programId), [programId]);
  const { data, loading, error, retry } = useLoad(load);
  const [filter, setFilter] = useState<Filter>('all');
  const selected = data?.programs.find((p) => p.id === data.program_id) ?? null;
  const count = (f: Filter) => (data ? data.students.filter((s) => f === 'all' || s.status === f).length : 0);
  const shown = data?.students.filter((s) => filter === 'all' || s.status === filter) ?? [];

  return (
    <Screen tab>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text maxFontSizeMultiplier={1.2} style={styles.eyebrow}>
            Roster
          </Text>
          <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.title}>
            Student Execution
          </Text>
        </View>
        {data && selected ? (
          <Text maxFontSizeMultiplier={1.2} style={styles.total}>
            {data.students.length} Total
          </Text>
        ) : null}
      </View>

      {!data ? (
        error ? (
          <ErrorState message={error} onRetry={retry} />
        ) : (
          <Loading label="Loading students" />
        )
      ) : !selected ? (
        <Empty text="Publish a path and share its link. Everyone who joins is listed here." />
      ) : (
        <View style={styles.content}>
          {data.programs.length > 1 ? (
            <ProgramPicker programs={data.programs} selected={selected.id} onSelect={setProgramId} busy={loading} />
          ) : null}
          {data.students.length ? (
            <>
              {/* Two by two, so every filter is visible on a small phone without sideways scrolling. */}
              <View style={styles.filters} accessibilityRole="tablist">
                {FILTERS.map((f) => {
                  const on = f.key === filter;
                  return (
                    <Pressable
                      key={f.key}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`${f.label}, ${count(f.key)}`}
                      onPress={() => setFilter(f.key)}
                      style={({ pressed }) => [styles.filter, on && styles.filterOn, pressed && styles.pressed]}>
                      <Text
                        maxFontSizeMultiplier={1.2}
                        style={[styles.filterText, on && styles.filterTextOn]}
                        numberOfLines={1}>
                        {f.label}
                      </Text>
                      <Text maxFontSizeMultiplier={1.2} style={[styles.filterCount, on && styles.filterCountOn]}>
                        {count(f.key)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {shown.length ? (
                shown.map((s) => (
                  <RosterRow
                    key={s.enrollment_id}
                    s={s}
                    onPress={() => router.push({ pathname: '/creator/students/[id]', params: { id: s.enrollment_id } })}
                  />
                ))
              ) : (
                <Empty text="No students here right now." />
              )}
              <Text maxFontSizeMultiplier={1.3} style={styles.footnote}>
                Needs attention means stuck, or no check-in for {data.inactive_days ?? 3} days. Everything here is what
                students reported.
              </Text>
            </>
          ) : (
            <Empty text="No one has joined yet. Share your link from Execution Paths." />
          )}
        </View>
      )}
    </Screen>
  );
}

function RosterRow({ s, onPress }: { s: StudentRow; onPress: () => void }) {
  const tone =
    s.status === 'completed'
      ? 'forest'
      : s.status === 'progressing'
        ? 'mint'
        : s.attention === 'blocker'
          ? 'alert'
          : 'quiet';
  const dot = s.status === 'needs_attention' ? (s.attention === 'blocker' ? Colors.error : '#D98A1B') : Colors.emerald;
  const where =
    s.status === 'completed'
      ? 'Finished the path'
      : s.milestone
        ? `M${s.milestone.number}: ${s.milestone.title}`
        : 'Not started';
  const reason = attentionLine(s);
  const actions = s.check_ins ?? 0;
  const label = studentLabel(s);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${reason ?? s.status}. ${where}. ${actions} check-ins. Last active ${ago(s.last_activity_at)}.`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <Avatar name={s.name} tone={tone} size={46} />
      <View style={styles.flex}>
        <View style={styles.nameRow}>
          <Text
            maxFontSizeMultiplier={1.3}
            style={styles.name}
            numberOfLines={1}
            ellipsizeMode={s.name ? 'tail' : 'middle'}>
            {label}
          </Text>
          <View style={[styles.dot, { backgroundColor: dot }]} />
          <Text maxFontSizeMultiplier={1.2} style={styles.time} numberOfLines={1}>
            {ago(s.last_activity_at)}
          </Text>
        </View>
        <Text maxFontSizeMultiplier={1.2} style={styles.where} numberOfLines={1}>
          {where}
        </Text>
        {reason ? (
          <Text
            maxFontSizeMultiplier={1.3}
            style={[styles.reason, s.attention === 'blocker' && styles.red]}
            numberOfLines={2}>
            {reason}
          </Text>
        ) : null}
        <Text maxFontSizeMultiplier={1.2} style={styles.actions}>
          {actions} {actions === 1 ? 'check-in' : 'check-ins'}
        </Text>
      </View>
    </Pressable>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text maxFontSizeMultiplier={1.3} style={styles.emptyText}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingBottom: 14,
  },
  flex: {
    flex: 1,
    minWidth: 0,
  },
  eyebrow: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Colors.emerald,
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.6,
    color: Colors.ink,
  },
  total: {
    fontFamily: Fonts.mono,
    fontSize: 14,
    color: Colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.line,
    overflow: 'hidden',
    marginBottom: 2,
  },
  content: {
    gap: 12,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filter: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 14,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  filterOn: {
    backgroundColor: Colors.emerald,
    borderColor: Colors.emerald,
  },
  filterText: {
    flexShrink: 1,
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: Colors.ink,
  },
  filterTextOn: {
    color: Colors.white,
  },
  filterCount: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    color: Colors.inkMuted,
  },
  filterCountOn: {
    color: Colors.mint,
  },
  pressed: {
    opacity: 0.75,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 22,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  name: {
    flexShrink: 1,
    fontFamily: Fonts.bodySemiBold,
    fontSize: 16,
    color: Colors.ink,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  where: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.inkMuted,
    paddingTop: 2,
  },
  reason: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 12,
    color: '#8A5A12',
    paddingTop: 2,
  },
  red: {
    color: Colors.error,
  },
  actions: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.emerald,
    paddingTop: 4,
  },
  time: {
    flexShrink: 0,
    marginLeft: 'auto',
    paddingLeft: 8,
    fontFamily: Fonts.body,
    fontSize: 12,
    color: Colors.inkMuted,
  },
  footnote: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.inkMuted,
  },
  empty: {
    padding: 20,
    borderRadius: 22,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderStyle: 'dashed',
  },
  emptyText: {
    fontFamily: Fonts.body,
    fontSize: 15,
    lineHeight: 21,
    color: Colors.inkMuted,
  },
});

import { router } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icons';
import { ProgramPicker } from '@/components/program-picker';
import { Screen } from '@/components/screen';
import { ErrorState, Loading } from '@/components/states';
import { Colors, Fonts } from '@/constants/theme';
import { signOut } from '@/lib/auth';
import {
  ago,
  attentionLine,
  feedLine,
  getDashboard,
  getMyName,
  shortName,
  trend,
  type Dashboard,
  type StudentRow,
} from '@/lib/dashboard';
import { useSelectedProgram } from '@/lib/selected-program';
import { useLoad } from '@/lib/use-load';

/**
 * Overview tab, the creator's home. Who needs help comes first, then how the program is moving:
 * check-ins in the last 24 hours, progressing vs needs attention, and the latest reports. Every
 * number is counted from what students reported.
 */
export default function OverviewScreen() {
  const { programId, setProgramId } = useSelectedProgram();
  const load = useCallback(async () => {
    const [dashboard, me] = await Promise.all([getDashboard(programId), getMyName()]);
    return { dashboard, me };
  }, [programId]);
  const { data, loading, error, retry } = useLoad(load);

  if (!data) {
    return (
      <Screen tab>
        {error ? <ErrorState message={error} onRetry={retry} /> : <Loading label="Loading overview" />}
      </Screen>
    );
  }

  const { dashboard, me } = data;
  const myName = me ? [me.first_name, me.last_name].filter(Boolean).join(' ') : '';
  const selected = dashboard.programs.find((p) => p.id === dashboard.program_id) ?? null;

  return (
    <Screen tab>
      <View style={styles.head}>
        <Avatar name={myName || 'Tavie'} size={52} ring />
        <View style={styles.flex}>
          <Text maxFontSizeMultiplier={1.2} style={styles.headLabel} numberOfLines={1}>
            {selected?.title ?? 'Tavie'}
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={styles.headName} numberOfLines={1}>
            {myName}
          </Text>
        </View>
        {selected ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push({ pathname: '/creator/programs/[id]/share', params: { id: selected.id } })}
            style={({ pressed }) => [styles.share, pressed && styles.pressed]}>
            <Icon name="share" color={Colors.emerald} size={15} />
            <Text maxFontSizeMultiplier={1.2} style={styles.shareText}>
              Share Link
            </Text>
          </Pressable>
        ) : null}
      </View>

      {selected && dashboard.programs.length > 1 ? (
        <View style={styles.picker}>
          <ProgramPicker programs={dashboard.programs} selected={selected.id} onSelect={setProgramId} busy={loading} />
        </View>
      ) : null}

      {selected ? (
        <Program dashboard={dashboard} programId={selected.id} />
      ) : (
        <View style={styles.card}>
          <Text maxFontSizeMultiplier={1.3} style={styles.cardTitle}>
            Your students will show up here.
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={styles.muted}>
            Build and publish a path, then share its link. You’ll see who joined, what they did, and who needs you.
          </Text>
          <DarkButton title="Go to Execution Paths" onPress={() => router.navigate('/creator/programs')} />
        </View>
      )}

      <Pressable accessibilityRole="button" onPress={signOut} style={styles.signOut} hitSlop={6}>
        <Text maxFontSizeMultiplier={1.2} style={styles.signOutText}>
          Sign out
        </Text>
      </Pressable>
    </Screen>
  );
}

function Program({ dashboard, programId }: { dashboard: Dashboard; programId: string }) {
  const counts = dashboard.counts!;
  const attention = dashboard.students.filter((s) => s.status === 'needs_attention');
  const activity = dashboard.activity ?? { last_24h: 0, previous_24h: 0 };
  const change = trend(activity.last_24h, activity.previous_24h);
  const active = counts.enrolled - counts.completed;
  const pct = (n: number) => (active ? Math.round((n / active) * 100) : 0);
  const open = (id: string) => router.push({ pathname: '/creator/students/[id]', params: { id } });

  return (
    <View style={styles.content}>
      <View style={styles.hero} accessible accessibilityLabel={`${activity.last_24h} check-ins in the last 24 hours`}>
        <Text maxFontSizeMultiplier={1.2} style={styles.heroLabel}>
          Check-ins · last 24 h
        </Text>
        <View style={styles.heroRow}>
          <Text maxFontSizeMultiplier={1.1} style={styles.heroNumber}>
            {activity.last_24h}
          </Text>
          {change ? (
            <Text maxFontSizeMultiplier={1.2} style={styles.heroChange}>
              {change}
            </Text>
          ) : null}
        </View>
        <View style={styles.heroRule} />
        <View style={styles.heroFoot}>
          <View style={styles.heroStat}>
            <Icon name="users" color={Colors.mint} size={17} />
            <Text maxFontSizeMultiplier={1.2} style={styles.heroFootText}>
              {counts.enrolled} {counts.enrolled === 1 ? 'student' : 'students'}
            </Text>
          </View>
          <Text maxFontSizeMultiplier={1.2} style={styles.heroDone}>
            {counts.completed} completed
          </Text>
        </View>
      </View>

      {counts.enrolled ? (
        <>
          <View style={styles.tiles}>
            <Tile
              icon="check"
              color={Colors.emerald}
              label="On track"
              value={counts.progressing}
              pct={pct(counts.progressing)}
            />
            <Tile
              icon="alert"
              color={counts.needs_attention ? Colors.error : Colors.inkMuted}
              label="Needs attention"
              value={counts.needs_attention}
              pct={pct(counts.needs_attention)}
            />
          </View>

          {attention.length ? (
            <View style={styles.card}>
              <View style={styles.cardHead}>
                <Text maxFontSizeMultiplier={1.3} style={styles.cardTitle}>
                  Needs you
                </Text>
                <Text maxFontSizeMultiplier={1.2} style={styles.alertPill}>
                  {attention.length}
                </Text>
              </View>
              {attention.map((s) => (
                <AttentionRow key={s.enrollment_id} s={s} onPress={() => open(s.enrollment_id)} />
              ))}
            </View>
          ) : (
            <View style={styles.allClear}>
              <Icon name="check" color={Colors.emerald} size={18} />
              <Text maxFontSizeMultiplier={1.3} style={styles.allClearText}>
                No one needs you right now.
              </Text>
            </View>
          )}

          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text maxFontSizeMultiplier={1.3} style={styles.cardTitle}>
                Latest check-ins
              </Text>
              <Text maxFontSizeMultiplier={1.2} style={styles.latestPill}>
                Reported
              </Text>
            </View>
            {dashboard.recent?.length ? (
              dashboard.recent.map((c) => (
                <Pressable
                  key={c.id}
                  accessibilityRole="button"
                  onPress={() => open(c.enrollment_id)}
                  style={({ pressed }) => [styles.feedRow, pressed && styles.pressed]}>
                  <Avatar name={c.name} size={34} tone={c.kind === 'stuck' ? 'alert' : 'forest'} />
                  <Text maxFontSizeMultiplier={1.3} style={styles.feedText} numberOfLines={2}>
                    {feedLine(c)}
                  </Text>
                  <Text maxFontSizeMultiplier={1.2} style={styles.feedTime}>
                    {ago(c.created_at)}
                  </Text>
                </Pressable>
              ))
            ) : (
              <Text maxFontSizeMultiplier={1.3} style={styles.muted}>
                No check-ins yet. They’ll appear here as students report.
              </Text>
            )}
          </View>
        </>
      ) : (
        <View style={styles.card}>
          <Text maxFontSizeMultiplier={1.3} style={styles.cardTitle}>
            No one has joined yet.
          </Text>
          <Text maxFontSizeMultiplier={1.3} style={styles.muted}>
            Send your link to your students. They’ll show up here as soon as they join.
          </Text>
          <DarkButton
            title="Share your link"
            onPress={() => router.push({ pathname: '/creator/programs/[id]/share', params: { id: programId } })}
          />
        </View>
      )}

      <DarkButton title="Create New Program Path" icon onPress={() => router.push('/creator/new')} />
    </View>
  );
}

function AttentionRow({ s, onPress }: { s: StudentRow; onPress: () => void }) {
  const blocker = s.attention === 'blocker';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${shortName(s.name)}. ${attentionLine(s)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.attention, pressed && styles.pressed]}>
      <Avatar name={s.name} size={38} tone={blocker ? 'alert' : 'quiet'} />
      <View style={styles.flex}>
        <Text maxFontSizeMultiplier={1.3} style={styles.attentionName} numberOfLines={1}>
          {shortName(s.name)}
        </Text>
        <Text maxFontSizeMultiplier={1.3} style={[styles.attentionWhy, blocker && styles.red]} numberOfLines={2}>
          {attentionLine(s)}
          {blocker && s.blocker?.note ? ` · “${s.blocker.note}”` : ''}
        </Text>
      </View>
      <Icon name="chevron" color={Colors.inkMuted} size={14} />
    </Pressable>
  );
}

function Tile({
  icon,
  color,
  label,
  value,
  pct,
}: {
  icon: 'check' | 'alert';
  color: string;
  label: string;
  value: number;
  pct: number;
}) {
  return (
    <View style={styles.tile} accessible accessibilityLabel={`${label}: ${value}, ${pct} percent`}>
      <View style={styles.tileHead}>
        <Icon name={icon} color={color} size={18} />
        <Text maxFontSizeMultiplier={1.2} style={[styles.tileLabel, { color }]} numberOfLines={2}>
          {label}
        </Text>
      </View>
      <Text maxFontSizeMultiplier={1.2} style={styles.tileValue}>
        {value} <Text style={styles.tilePct}>({pct}%)</Text>
      </Text>
    </View>
  );
}

function DarkButton({ title, onPress, icon }: { title: string; onPress: () => void; icon?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.dark, pressed && styles.pressed]}>
      {icon ? <Icon name="plus" color={Colors.white} size={17} /> : null}
      <Text maxFontSizeMultiplier={1.2} style={styles.darkText}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 16,
  },
  flex: {
    flex: 1,
  },
  headLabel: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.inkMuted,
  },
  headName: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 18,
    color: Colors.ink,
  },
  share: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 40,
    borderRadius: 999,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  shareText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: Colors.ink,
  },
  pressed: {
    opacity: 0.75,
  },
  picker: {
    paddingBottom: 14,
  },
  content: {
    gap: 14,
  },
  hero: {
    padding: 22,
    borderRadius: 24,
    backgroundColor: Colors.forest,
    gap: 6,
  },
  heroLabel: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: Colors.mint,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    columnGap: 12,
  },
  heroNumber: {
    fontFamily: Fonts.display,
    fontSize: 60,
    lineHeight: 66,
    letterSpacing: -1.5,
    color: Colors.mint,
  },
  heroChange: {
    fontFamily: Fonts.body,
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
  },
  heroRule: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
    marginVertical: 8,
  },
  heroFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  heroFootText: {
    fontFamily: Fonts.body,
    fontSize: 15,
    color: 'rgba(255,255,255,0.85)',
  },
  heroDone: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: Colors.mint,
  },
  tiles: {
    flexDirection: 'row',
    gap: 12,
  },
  tile: {
    flex: 1,
    justifyContent: 'space-between',
    gap: 8,
    padding: 14,
    borderRadius: 22,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  tileHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tileLabel: {
    flexShrink: 1,
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
  },
  tileValue: {
    fontFamily: Fonts.display,
    fontSize: 28,
    lineHeight: 32,
    color: Colors.ink,
  },
  tilePct: {
    fontFamily: Fonts.body,
    fontSize: 15,
    color: Colors.inkMuted,
  },
  card: {
    gap: 10,
    padding: 18,
    borderRadius: 22,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.line,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitle: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 17,
    color: Colors.ink,
  },
  muted: {
    fontFamily: Fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.inkMuted,
  },
  alertPill: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.error,
    backgroundColor: '#FBE4E1',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  latestPill: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    color: Colors.forest,
    backgroundColor: 'rgba(95, 216, 160, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
  },
  attention: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 16,
    backgroundColor: Colors.paper,
  },
  attentionName: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: Colors.ink,
  },
  attentionWhy: {
    fontFamily: Fonts.body,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.ink,
  },
  red: {
    color: Colors.error,
  },
  allClear: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 14,
    borderRadius: 18,
    backgroundColor: 'rgba(95, 216, 160, 0.22)',
  },
  allClearText: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 15,
    color: Colors.forest,
  },
  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 16,
    backgroundColor: Colors.paper,
  },
  feedText: {
    flex: 1,
    fontFamily: Fonts.body,
    fontSize: 15,
    lineHeight: 20,
    color: Colors.ink,
  },
  feedTime: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: Colors.inkMuted,
  },
  dark: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 54,
    borderRadius: 18,
    backgroundColor: Colors.forest,
    marginTop: 4,
  },
  darkText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 16,
    color: Colors.white,
  },
  signOut: {
    alignSelf: 'center',
    paddingVertical: 18,
  },
  signOutText: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 14,
    color: Colors.inkMuted,
    textDecorationLine: 'underline',
  },
});

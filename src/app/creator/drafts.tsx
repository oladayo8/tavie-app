import { router } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import { Screen } from '@/components/screen';
import { ErrorState, Loading } from '@/components/states';
import { TopBar } from '@/components/top-bar';
import { Colors, Fonts } from '@/constants/theme';
import { listPrograms } from '@/lib/builder';
import { useLoad } from '@/lib/use-load';

/** Every unpublished program. Tapping one opens the builder where it left off. */
export default function DraftsScreen() {
  const load = useCallback(async () => (await listPrograms()).filter((p) => p.status === 'draft'), []);
  const { data, error, retry } = useLoad(load);

  return (
    <Screen>
      <TopBar parent="/creator/programs" label="Execution Paths" />
      <Text maxFontSizeMultiplier={1.2} style={styles.eyebrow}>
        Not published
      </Text>
      <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.title}>
        Drafts
      </Text>
      {data ? (
        data.length ? (
          <View style={styles.list}>
            {data.map((p) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                accessibilityLabel={`Continue editing ${p.title}`}
                onPress={() => router.push({ pathname: '/creator/programs/[id]', params: { id: p.id } })}
                style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
                <View style={styles.flex}>
                  <Text maxFontSizeMultiplier={1.3} style={styles.cardTitle}>
                    {p.title}
                  </Text>
                  <Text maxFontSizeMultiplier={1.2} style={styles.meta}>
                    {p.milestoneCount} {p.milestoneCount === 1 ? 'milestone' : 'milestones'} · {p.taskCount}{' '}
                    {p.taskCount === 1 ? 'task' : 'tasks'} · edited{' '}
                    {new Date(p.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </Text>
                  <Text maxFontSizeMultiplier={1.2} style={styles.continue}>
                    Continue editing
                  </Text>
                </View>
                <Icon name="chevron" color={Colors.inkMuted} size={16} />
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.empty}>
            <Text maxFontSizeMultiplier={1.3} style={styles.emptyTitle}>
              No drafts.
            </Text>
            <Text maxFontSizeMultiplier={1.3} style={styles.emptyBody}>
              A path you start waits here until you publish it.
            </Text>
          </View>
        )
      ) : error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : (
        <Loading />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: {
    fontFamily: Fonts.mono,
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: Colors.emerald,
    paddingTop: 8,
  },
  title: {
    fontFamily: Fonts.display,
    fontSize: 28,
    lineHeight: 32,
    letterSpacing: -0.6,
    color: Colors.ink,
    paddingBottom: 16,
  },
  list: {
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 18,
    borderRadius: 20,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.line,
  },
  pressed: {
    opacity: 0.75,
  },
  flex: {
    flex: 1,
    gap: 4,
  },
  cardTitle: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 17,
    lineHeight: 22,
    color: Colors.ink,
  },
  meta: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: Colors.inkMuted,
  },
  continue: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 14,
    color: Colors.emerald,
    paddingTop: 4,
  },
  empty: {
    gap: 8,
    padding: 22,
    borderRadius: 24,
    backgroundColor: Colors.white,
    borderWidth: 1.5,
    borderColor: Colors.line,
    borderStyle: 'dashed',
  },
  emptyTitle: {
    fontFamily: Fonts.display,
    fontSize: 20,
    color: Colors.ink,
  },
  emptyBody: {
    fontFamily: Fonts.body,
    fontSize: 15,
    lineHeight: 21,
    color: Colors.inkMuted,
  },
});

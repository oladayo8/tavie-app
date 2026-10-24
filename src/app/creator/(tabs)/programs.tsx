import { router } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Icon } from '@/components/icons';
import { PathCard } from '@/components/path-card';
import { Screen } from '@/components/screen';
import { ErrorState, Loading } from '@/components/states';
import { Colors, Fonts } from '@/constants/theme';
import { listPrograms } from '@/lib/builder';
import { getDashboard } from '@/lib/dashboard';
import { useLoad } from '@/lib/use-load';

/**
 * Programs tab, "Execution Paths": the creator's published programs as cards. Drafts live on their
 * own screen. Every count comes from the database; nothing on a card is sample data.
 */
export default function ExecutionPathsScreen() {
  const load = useCallback(async () => {
    const [programs, dashboard] = await Promise.all([listPrograms(), getDashboard(null)]);
    const enrolled = Object.fromEntries(dashboard.programs.map((p) => [p.id, p.enrolled]));
    return {
      published: programs.filter((p) => p.status !== 'draft'),
      drafts: programs.filter((p) => p.status === 'draft').length,
      enrolled,
    };
  }, []);
  const { data, error, retry } = useLoad(load);

  return (
    <Screen tab>
      <View style={styles.head}>
        <View style={styles.flex}>
          <Text maxFontSizeMultiplier={1.2} style={styles.eyebrow}>
            Programs
          </Text>
          <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.title}>
            Execution Paths
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New path"
          onPress={() => router.push('/creator/new')}
          style={({ pressed }) => [styles.newPath, pressed && styles.pressed]}>
          <Icon name="plus" color={Colors.white} size={16} />
          <Text maxFontSizeMultiplier={1.2} style={styles.newPathText}>
            New Path
          </Text>
        </Pressable>
      </View>

      {data ? (
        <View style={styles.content}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/creator/drafts')}
            style={({ pressed }) => [styles.drafts, pressed && styles.pressed]}>
            <Text maxFontSizeMultiplier={1.2} style={styles.draftsText}>
              Drafts ({data.drafts})
            </Text>
            <Icon name="chevron" color={Colors.inkMuted} size={14} />
          </Pressable>

          {data.published.length ? (
            data.published.map((p) => <PathCard key={p.id} program={p} students={data.enrolled[p.id] ?? 0} />)
          ) : (
            <View style={styles.empty}>
              <Text maxFontSizeMultiplier={1.3} style={styles.emptyTitle}>
                No live paths yet.
              </Text>
              <Text maxFontSizeMultiplier={1.3} style={styles.emptyBody}>
                {data.drafts
                  ? 'Finish a draft and publish it, and it shows up here with its join link.'
                  : 'Build your first path in about 45 minutes. Everything saves as you go.'}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(data.drafts ? '/creator/drafts' : '/creator/new')}
                style={({ pressed }) => [styles.emptyButton, pressed && styles.pressed]}>
                <Text maxFontSizeMultiplier={1.2} style={styles.emptyButtonText}>
                  {data.drafts ? 'Open drafts' : 'Build a path'}
                </Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={retry} />
      ) : (
        <Loading />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    paddingBottom: 16,
  },
  flex: {
    flex: 1,
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
  newPath: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    minHeight: 42,
    borderRadius: 999,
    backgroundColor: Colors.emerald,
    marginBottom: 2,
  },
  newPathText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: Colors.white,
  },
  pressed: {
    opacity: 0.75,
  },
  content: {
    gap: 16,
  },
  drafts: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    minHeight: 36,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: Colors.line,
    backgroundColor: Colors.white,
  },
  draftsText: {
    fontFamily: Fonts.mono,
    fontSize: 13,
    color: Colors.ink,
  },
  empty: {
    gap: 10,
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
    lineHeight: 24,
    color: Colors.ink,
  },
  emptyBody: {
    fontFamily: Fonts.body,
    fontSize: 15,
    lineHeight: 21,
    color: Colors.inkMuted,
  },
  emptyButton: {
    alignSelf: 'flex-start',
    marginTop: 4,
    paddingHorizontal: 18,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: Colors.forest,
  },
  emptyButtonText: {
    fontFamily: Fonts.bodySemiBold,
    fontSize: 15,
    color: Colors.white,
  },
});

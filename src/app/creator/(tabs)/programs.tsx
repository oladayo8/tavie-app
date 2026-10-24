import { router } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Row } from '@/components/rows';
import { Screen } from '@/components/screen';
import { ErrorState, Loading } from '@/components/states';
import { Body, Headline } from '@/components/text';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { listPrograms } from '@/lib/builder';
import { useLoad } from '@/lib/use-load';

/** Programs tab: every program, newest first, and New program. Opens the existing builder. */
export default function ProgramsScreen() {
  const load = useCallback(() => listPrograms(), []);
  const { data, loading, error, retry } = useLoad(load);

  return (
    <Screen tab>
      <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.title}>
        Programs
      </Text>
      <View style={styles.content}>
        {error && !data ? (
          <ErrorState message={error} onRetry={retry} />
        ) : loading && !data ? (
          <Loading />
        ) : data?.length ? (
          data.map((p) => (
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
          variant={data?.length ? 'secondary' : 'primary'}
          title="New program"
          onPress={() => router.push('/creator/new')}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    fontFamily: Fonts.display,
    fontSize: 26,
    lineHeight: 30,
    letterSpacing: -0.5,
    color: Colors.ink,
    paddingBottom: 12,
  },
  content: {
    gap: Spacing.three,
  },
  empty: {
    gap: Spacing.three,
  },
});

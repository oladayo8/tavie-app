import { router } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Row } from '@/components/rows';
import { Screen } from '@/components/screen';
import { ErrorState, Loading } from '@/components/states';
import { Body, Headline, Label } from '@/components/text';
import { Wordmark } from '@/components/wordmark';
import { Spacing } from '@/constants/theme';
import { signOut } from '@/lib/auth';
import { listPrograms } from '@/lib/builder';
import { useLoad } from '@/lib/use-load';

/** Creator home: every program, newest first. */
export default function ProgramsScreen() {
  const load = useCallback(() => listPrograms(), []);
  const { data, loading, error, retry } = useLoad(load);

  return (
    <Screen
      footer={
        <>
          <Button title="New program" onPress={() => router.push('/creator/new')} />
          <Button variant="link" title="Sign out" onPress={signOut} />
        </>
      }>
      <Wordmark size={28} />
      <View style={styles.content}>
        <Label>Your programs</Label>
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
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: Spacing.three,
    paddingTop: Spacing.five,
  },
  empty: {
    gap: Spacing.three,
  },
});

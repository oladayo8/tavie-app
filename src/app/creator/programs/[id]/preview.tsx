import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { JoinCard } from '@/components/join-card';
import { Screen } from '@/components/screen';
import { ErrorState, Loading } from '@/components/states';
import { Body, Label } from '@/components/text';
import { TodayCard } from '@/components/today-card';
import { TopBar } from '@/components/top-bar';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { loadProgram, resourceUrl } from '@/lib/builder';
import { suggestedAgentName } from '@/lib/program';
import { useLoad } from '@/lib/use-load';

/** "See what your students see." Only reads; nothing here writes to the database. */
export default function PreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => loadProgram(id), [id]);
  const { data, error, retry } = useLoad(load);
  // 0 is the join screen; 1..n are the tasks in path order.
  const [step, setStep] = useState(0);
  const parent = { pathname: '/creator/programs/[id]', params: { id } } as const;

  if (!data) {
    return (
      <Screen>
        <TopBar parent={parent} />
        {error ? <ErrorState message={error} onRetry={retry} /> : <Loading />}
      </Screen>
    );
  }

  const milestones = data.milestones.filter((m) => !m.archived_at);
  const cards = milestones.flatMap((m, mi) =>
    data.tasks
      .filter((t) => t.milestone_id === m.id && !t.archived_at)
      .map((task) => ({ task, milestone: m, milestoneNumber: mi + 1 })),
  );
  const last = cards.length;
  const current = Math.min(step, last);
  const card = current > 0 ? cards[current - 1] : null;
  const next = () => setStep(Math.min(current + 1, last));

  const openResource = async (resourceId: string) => {
    const resource = data.resources.find((r) => r.id === resourceId);
    if (!resource) return;
    try {
      const url = await resourceUrl(resource);
      if (url) await Linking.openURL(url);
    } catch {
      // A preview can't fail in a way that matters; the creator can try the link again.
    }
  };

  return (
    <Screen
      footer={
        <View style={styles.nav}>
          <Button
            variant="secondary"
            title="Back"
            onPress={() => setStep(Math.max(0, current - 1))}
            disabled={current === 0}
            style={styles.flex}
          />
          <Button variant="secondary" title="Next" onPress={next} disabled={current === last} style={styles.flex} />
        </View>
      }>
      <TopBar parent={parent} label="Done" />
      <View style={styles.banner}>
        <Body style={styles.bannerText}>Preview. Nothing is saved.</Body>
      </View>
      <Label style={styles.step}>{current === 0 ? 'Join screen' : `Task ${current} of ${last}`}</Label>
      <View style={styles.phone}>
        {card ? (
          <TodayCard
            task={card.task}
            milestoneNumber={card.milestoneNumber}
            milestoneCount={milestones.length}
            milestoneTitle={card.milestone.title}
            resources={(data.links[card.task.id] ?? [])
              .map((rid) => data.resources.find((r) => r.id === rid))
              .filter((r) => !!r)}
            onPrimary={next}
            onResource={openResource}
          />
        ) : (
          <JoinCard
            creatorName={`${data.creatorFirstName} ${data.creatorLastName}`.trim()}
            agentName={data.agentName ?? suggestedAgentName(data.creatorFirstName)}
            goal={data.program.goal}
            onStart={next}
          />
        )}
      </View>
      {last === 0 ? <Body muted>Add tasks to see their cards here.</Body> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  banner: {
    padding: Spacing.two,
    borderRadius: Radius.button,
    backgroundColor: Colors.forest,
  },
  bannerText: {
    color: Colors.white,
    textAlign: 'center',
  },
  step: {
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  phone: {
    padding: Spacing.four,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: Colors.ink,
    backgroundColor: Colors.paper,
  },
  nav: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  flex: {
    flex: 1,
  },
});

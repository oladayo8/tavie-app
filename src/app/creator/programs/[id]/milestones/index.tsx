import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { MoveButtons, Row } from '@/components/rows';
import { Screen } from '@/components/screen';
import { ErrorState, ErrorText, Loading } from '@/components/states';
import { Body, Headline, Label } from '@/components/text';
import { TextField } from '@/components/text-field';
import { LiveEditNotice } from '@/components/live-edit-notice';
import { goBackOr, TopBar } from '@/components/top-bar';
import { Spacing } from '@/constants/theme';
import { addMilestone, loadProgram, reorderMilestones } from '@/lib/builder';
import { dataErrorMessage } from '@/lib/errors';
import { LIMITS, moveId } from '@/lib/program';
import { useLoad } from '@/lib/use-load';

/** "What are the big stages on the way there?" Add, reorder, and open each milestone. */
export default function MilestonesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => loadProgram(id), [id]);
  const { data, error, retry, reload } = useLoad(load);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!data) {
    return (
      <Screen>
        <TopBar parent={{ pathname: '/creator/programs/[id]', params: { id } }} />
        {error ? <ErrorState message={error} onRetry={retry} /> : <Loading />}
      </Screen>
    );
  }

  const active = data.milestones.filter((m) => !m.archived_at);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setActionError(null);
    try {
      await work();
      await reload();
      return true;
    } catch (e) {
      setActionError(dataErrorMessage(e as { message?: string }));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onAdd = async () => {
    const trimmed = title.trim();
    if (!trimmed || trimmed.length > LIMITS.milestoneTitle) return;
    if (await run(() => addMilestone(id, data.milestones, trimmed))) setTitle('');
  };

  const onMove = (index: number, delta: -1 | 1) =>
    run(() =>
      reorderMilestones(
        id,
        moveId(
          active.map((m) => m.id),
          index,
          delta,
        ),
        data.milestones,
      ),
    );

  return (
    <Screen
      footer={<Button title="Done" onPress={() => goBackOr({ pathname: '/creator/programs/[id]', params: { id } })} />}>
      <TopBar parent={{ pathname: '/creator/programs/[id]', params: { id } }} />
      <LiveEditNotice status={data.program.status} />
      <View style={styles.content}>
        <Label>Milestones</Label>
        <Headline>What are the big stages on the way there?</Headline>
        <Body muted>Most paths have 4 to 10. Open one to add its tasks.</Body>
        {active.map((m, i) => {
          const count = data.tasks.filter((t) => t.milestone_id === m.id && !t.archived_at).length;
          return (
            <Row
              key={m.id}
              title={`${i + 1}. ${m.title}`}
              detail={`${count} ${count === 1 ? 'task' : 'tasks'}${m.requires_review ? ' · You review before they move on' : ''}`}
              warning={count ? undefined : 'Add at least one task'}
              onPress={() =>
                router.push({ pathname: '/creator/programs/[id]/milestones/[mid]', params: { id, mid: m.id } })
              }
              accessibilityLabel={`Open milestone ${m.title}`}>
              <MoveButtons
                name={m.title}
                canUp={i > 0 && !busy}
                canDown={i < active.length - 1 && !busy}
                onMove={(delta) => onMove(i, delta)}
              />
            </Row>
          );
        })}
        <TextField
          label="New milestone"
          value={title}
          onChangeText={setTitle}
          placeholder="Find your first motivated seller"
          maxLength={LIMITS.milestoneTitle}
          returnKeyType="done"
          onSubmitEditing={onAdd}
        />
        <Button variant="secondary" title="Add milestone" onPress={onAdd} loading={busy} disabled={!title.trim()} />
        <ErrorText message={actionError} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
    paddingTop: Spacing.three,
  },
});

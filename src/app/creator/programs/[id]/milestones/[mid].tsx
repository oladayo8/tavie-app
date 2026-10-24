import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { MoveButtons, Row, SwitchRow } from '@/components/rows';
import { Screen } from '@/components/screen';
import { ErrorState, ErrorText, Loading } from '@/components/states';
import { Body, Headline, Label } from '@/components/text';
import { TextField } from '@/components/text-field';
import { LiveEditNotice } from '@/components/live-edit-notice';
import { goBackOr, TopBar } from '@/components/top-bar';
import { Spacing } from '@/constants/theme';
import { loadProgram, reorderTasks, updateMilestone } from '@/lib/builder';
import { confirm } from '@/lib/confirm';
import { dataErrorMessage } from '@/lib/errors';
import { LIMITS, moveId, REPORT_TYPES, taskWarnings } from '@/lib/program';
import { useLoad } from '@/lib/use-load';

/** One milestone: its name, the review switch, and its tasks in order. */
export default function MilestoneScreen() {
  const { id, mid } = useLocalSearchParams<{ id: string; mid: string }>();
  const load = useCallback(() => loadProgram(id), [id]);
  const { data, error, retry, reload } = useLoad(load);
  const [title, setTitle] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const parent = { pathname: '/creator/programs/[id]/milestones', params: { id } } as const;
  const milestone = data?.milestones.find((m) => m.id === mid);

  if (!data || !milestone) {
    return (
      <Screen>
        <TopBar parent={parent} />
        {error ? (
          <ErrorState message={error} onRetry={retry} />
        ) : data ? (
          <Body muted>This milestone isn’t here any more.</Body>
        ) : (
          <Loading />
        )}
      </Screen>
    );
  }

  const tasks = data.tasks.filter((t) => t.milestone_id === mid && !t.archived_at);
  const titleText = title ?? milestone.title;
  const titleChanged = titleText.trim() !== milestone.title;
  const number = data.milestones.filter((m) => !m.archived_at).findIndex((m) => m.id === mid) + 1;

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

  const onRename = async () => {
    const trimmed = titleText.trim();
    if (!trimmed) return;
    if (await run(() => updateMilestone(mid, { title: trimmed }))) setTitle(null);
  };

  const onArchive = async () => {
    const ok = await confirm(
      'Remove this milestone?',
      `"${milestone.title}" and its tasks will be hidden from your path.`,
      'Remove',
    );
    if (ok && (await run(() => updateMilestone(mid, { archived_at: new Date().toISOString() })))) {
      goBackOr(parent);
    }
  };

  const openTask = (tid: string) =>
    router.push({ pathname: '/creator/programs/[id]/tasks/[tid]', params: { id, tid, milestone: mid } });

  return (
    <Screen footer={<Button title="Add task" onPress={() => openTask('new')} />}>
      <TopBar parent={parent} label="Milestones" />
      <LiveEditNotice status={data.program.status} />
      <View style={styles.content}>
        <Label>Milestone {number}</Label>
        <Headline>{milestone.title}</Headline>
        <TextField label="Name" value={titleText} onChangeText={setTitle} maxLength={LIMITS.milestoneTitle} />
        {titleChanged ? (
          <Button
            variant="secondary"
            title="Save name"
            onPress={onRename}
            loading={busy}
            disabled={!titleText.trim()}
          />
        ) : null}
        <SwitchRow
          label="I review before students move on"
          value={milestone.requires_review}
          onValueChange={(value) => run(() => updateMilestone(mid, { requires_review: value }))}
        />

        <Label style={styles.section}>Tasks</Label>
        {tasks.length === 0 ? <Body muted>No tasks yet. Add the first thing students should do.</Body> : null}
        {tasks.map((t, i) => {
          const warnings = taskWarnings(t);
          return (
            <Row
              key={t.id}
              title={`${i + 1}. ${t.title}`}
              detail={`${REPORT_TYPES.find((r) => r.type === t.completion_type)?.label} · ${t.est_minutes} min${t.is_optional ? ' · Optional' : ''}`}
              warning={warnings.length ? warnings.join(' · ') : undefined}
              onPress={() => openTask(t.id)}
              accessibilityLabel={`Edit task ${t.title}`}>
              <MoveButtons
                name={t.title}
                canUp={i > 0 && !busy}
                canDown={i < tasks.length - 1 && !busy}
                onMove={(delta) =>
                  run(() =>
                    reorderTasks(
                      mid,
                      moveId(
                        tasks.map((x) => x.id),
                        i,
                        delta,
                      ),
                      data.tasks,
                    ),
                  )
                }
              />
            </Row>
          );
        })}
        <ErrorText message={actionError} />
        <Button variant="link" title="Remove this milestone" onPress={onArchive} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
    paddingTop: Spacing.three,
  },
  section: {
    paddingTop: Spacing.three,
  },
});

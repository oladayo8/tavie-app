import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Row } from '@/components/rows';
import { Screen } from '@/components/screen';
import { ErrorState, ErrorText, Loading } from '@/components/states';
import { Body, Headline, Label } from '@/components/text';
import { TextField } from '@/components/text-field';
import { TopBar } from '@/components/top-bar';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { loadProgram, publishProgram, updateProgram } from '@/lib/builder';
import { dataErrorMessage } from '@/lib/errors';
import { goalIsValid, LIMITS, parseWeeks, programProblems, taskWarnings } from '@/lib/program';
import { useLoad } from '@/lib/use-load';

/** The hub the creator returns to: goal, length, the whole path, and what publishing still needs. */
export default function ProgramOverviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => loadProgram(id), [id]);
  const { data, error, retry, reload } = useLoad(load);

  const [goal, setGoal] = useState<string | null>(null);
  const [weeks, setWeeks] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refused, setRefused] = useState<string[]>([]);

  if (!data) {
    return (
      <Screen>
        <TopBar parent="/creator/programs" label="Programs" />
        {error ? <ErrorState message={error} onRetry={retry} /> : <Loading />}
      </Screen>
    );
  }

  const { program, milestones, tasks, agentName } = data;
  const goalText = goal ?? program.goal;
  const weeksText = weeks ?? String(program.duration_weeks);
  const parsedWeeks = parseWeeks(weeksText);
  const changed = goalText.trim() !== program.goal || parsedWeeks !== program.duration_weeks;
  const active = milestones.filter((m) => !m.archived_at);
  const problems = programProblems(milestones, tasks, agentName);
  const isLive = program.status !== 'draft';

  const onSave = async () => {
    if (!goalIsValid(goalText) || !parsedWeeks) return;
    setSaving(true);
    setActionError(null);
    try {
      await updateProgram(program.id, { goal: goalText.trim(), duration_weeks: parsedWeeks });
      await reload();
      setGoal(null);
      setWeeks(null);
    } catch (e) {
      setActionError(dataErrorMessage(e as { message?: string }));
    }
    setSaving(false);
  };

  const onPublish = async () => {
    setPublishing(true);
    setActionError(null);
    setRefused([]);
    try {
      const result = await publishProgram(program.id);
      if (result.ok) {
        await reload();
        router.push({ pathname: '/creator/programs/[id]/share', params: { id: program.id } });
      } else {
        setRefused(result.problems.map((p) => p.message));
      }
    } catch (e) {
      setActionError(dataErrorMessage(e as { message?: string }));
    }
    setPublishing(false);
  };

  const go = (
    pathname:
      | '/creator/programs/[id]/generate'
      | '/creator/programs/[id]/milestones'
      | '/creator/programs/[id]/agent'
      | '/creator/programs/[id]/preview'
      | '/creator/programs/[id]/share',
  ) => router.push({ pathname, params: { id: program.id } });

  return (
    <Screen
      footer={
        <>
          {isLive ? (
            <Button title="Share" onPress={() => go('/creator/programs/[id]/share')} />
          ) : (
            <Button title="Publish" onPress={onPublish} loading={publishing} />
          )}
          <Button variant="secondary" title="Preview" onPress={() => go('/creator/programs/[id]/preview')} />
        </>
      }>
      <TopBar parent="/creator/programs" label="Programs" />
      <View style={styles.content}>
        <Label style={isLive ? styles.live : undefined}>{isLive ? 'Live' : 'Draft'}</Label>
        <Headline>{program.goal}</Headline>

        <TextField label="Goal" value={goalText} onChangeText={setGoal} maxLength={LIMITS.goal.max} multiline />
        <TextField
          label="Weeks"
          value={weeksText}
          onChangeText={(t) => setWeeks(t.replace(/\D/g, '').slice(0, 2))}
          keyboardType="number-pad"
          maxLength={2}
        />
        {changed ? (
          <Button
            variant="secondary"
            title="Save changes"
            onPress={onSave}
            loading={saving}
            disabled={!goalIsValid(goalText) || !parsedWeeks}
          />
        ) : null}

        <View style={styles.section}>
          <Label>Path</Label>
          {active.length === 0 ? (
            <Body muted>No milestones yet. Add the big stages on the way to the goal.</Body>
          ) : null}
          {active.map((m, i) => {
            const own = tasks.filter((t) => t.milestone_id === m.id && !t.archived_at);
            return (
              <Row
                key={m.id}
                title={`${i + 1}. ${m.title}`}
                detail={
                  own.length
                    ? own.map((t) => `• ${t.title}${taskWarnings(t).length ? ' ⚠' : ''}`).join('\n')
                    : undefined
                }
                warning={own.length ? undefined : 'No tasks yet'}
                onPress={() =>
                  router.push({
                    pathname: '/creator/programs/[id]/milestones/[mid]',
                    params: { id: program.id, mid: m.id },
                  })
                }
              />
            );
          })}
          <Button variant="secondary" title="Edit milestones" onPress={() => go('/creator/programs/[id]/milestones')} />
          {!isLive ? (
            <Button variant="secondary" title="Plan with Tavie" onPress={() => go('/creator/programs/[id]/generate')} />
          ) : null}
        </View>

        <View style={styles.section}>
          <Label>Agent name</Label>
          <Body>{agentName ?? 'Not set yet'}</Body>
          <Button variant="secondary" title="Name your agent" onPress={() => go('/creator/programs/[id]/agent')} />
        </View>

        {!isLive && (refused.length || problems.length) ? (
          <View style={styles.problems} accessibilityRole="summary">
            <Label>Before you can publish</Label>
            {(refused.length ? refused : problems).map((p) => (
              <Body key={p}>• {p}</Body>
            ))}
          </View>
        ) : null}
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
  live: {
    color: Colors.emerald,
  },
  section: {
    gap: Spacing.two,
    paddingTop: Spacing.three,
  },
  problems: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: Colors.error,
    backgroundColor: Colors.white,
  },
});

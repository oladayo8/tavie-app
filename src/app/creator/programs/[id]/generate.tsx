import { router, useLocalSearchParams, useNavigation, usePreventRemove } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { SmallButton } from '@/components/rows';
import { Screen } from '@/components/screen';
import { ErrorState, ErrorText, Loading } from '@/components/states';
import { Body, Headline, Label } from '@/components/text';
import { TextField } from '@/components/text-field';
import { goBackOr, TopBar } from '@/components/top-bar';
import { Colors, Fonts, Radius, Spacing } from '@/constants/theme';
import { importPlan, suggestPlan } from '@/lib/ai';
import { loadProgram, type ProgramDetail } from '@/lib/builder';
import { confirm } from '@/lib/confirm';
import { dataErrorMessage } from '@/lib/errors';
import { AI_LIMITS, cleanTask, type SuggestedMilestone, type SuggestedTask } from '@/lib/plan-rules';
import { LIMITS, REPORT_TYPES } from '@/lib/program';
import { useLoad } from '@/lib/use-load';

/**
 * Goal to execution plan. The creator can paste what they already teach, Tavie suggests milestones
 * and tasks, and the creator edits them. Nothing is saved until they tap "Add to my program", and
 * the program stays a draft until they publish it themselves.
 */
export default function GeneratePlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const load = useCallback(() => loadProgram(id), [id]);
  const { data, error, retry } = useLoad(load);
  const parent = { pathname: '/creator/programs/[id]', params: { id } } as const;

  if (!data) {
    return (
      <Screen>
        <TopBar parent={parent} />
        {error ? <ErrorState message={error} onRetry={retry} /> : <Loading />}
      </Screen>
    );
  }
  if (data.program.status !== 'draft') {
    return (
      <Screen>
        <TopBar parent={parent} />
        <Body muted>This program is live. Edit its milestones and tasks instead.</Body>
      </Screen>
    );
  }
  return <Generator detail={data} />;
}

type Editable = Omit<SuggestedMilestone, 'tasks'> & { key: number; tasks: (SuggestedTask & { key: number })[] };

function Generator({ detail }: { detail: ProgramDetail }) {
  const { program } = detail;
  const parent = { pathname: '/creator/programs/[id]', params: { id: program.id } } as const;
  const [phase, setPhase] = useState<'input' | 'working' | 'review'>('input');
  const [outline, setOutline] = useState('');
  const [plan, setPlan] = useState<Editable[]>([]);
  const [isDraft, setIsDraft] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const leaving = useRef(false);
  const navigation = useNavigation();

  const hasExisting = detail.milestones.some((m) => !m.archived_at);
  const tooLong = outline.length > AI_LIMITS.inputChars;

  const dirty = phase === 'review' || (phase === 'input' && !!outline.trim());
  usePreventRemove(dirty, ({ data }) => {
    if (leaving.current) {
      navigation.dispatch(data.action);
      return;
    }
    const message =
      phase === 'review' ? 'This plan hasn’t been added to your program.' : 'What you pasted will be lost.';
    confirm('Leave without saving?', message, 'Leave').then((ok) => {
      if (ok) navigation.dispatch(data.action);
    });
  });

  const leaveTo = (go: () => void) => {
    leaving.current = true;
    go();
  };

  const onGenerate = async () => {
    if (tooLong) return;
    setPhase('working');
    setError(null);
    const result = await suggestPlan(program.goal, program.duration_weeks, outline);
    if (!result.ok) {
      // Back to the form with everything they pasted still there.
      setError(result.message);
      setPhase('input');
      return;
    }
    let key = 0;
    setPlan(
      result.value.plan.milestones.map((m) => ({
        ...m,
        key: key++,
        tasks: m.tasks.map((t) => ({ ...t, key: key++ })),
      })),
    );
    setIsDraft(result.value.draft);
    setEditing(null);
    setPhase('review');
  };

  const buildMyself = () =>
    leaveTo(() => router.replace({ pathname: '/creator/programs/[id]/milestones', params: { id: program.id } }));

  const setMilestone = (key: number, change: Partial<Editable> | null) =>
    setPlan((all) =>
      change ? all.map((m) => (m.key === key ? { ...m, ...change } : m)) : all.filter((m) => m.key !== key),
    );

  const setTask = (key: number, change: Partial<SuggestedTask> | null) =>
    setPlan((all) =>
      all.map((m) => ({
        ...m,
        tasks: change
          ? m.tasks.map((t) => (t.key === key ? { ...t, ...change } : t))
          : m.tasks.filter((t) => t.key !== key),
      })),
    );

  const problems = reviewProblems(plan);

  const onAdd = async () => {
    if (problems.length) {
      setError(problems[0]);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const milestones = plan.map(({ title, description, tasks }) => ({
        title: title.trim(),
        description,
        tasks: tasks.map(({ key: _key, ...t }) => cleanTask(t)!),
      }));
      await importPlan(program.id, milestones);
      leaveTo(() => goBackOr(parent));
    } catch (e) {
      // The plan stays on screen, so they can try again.
      setError(dataErrorMessage(e as { message?: string }));
      setSaving(false);
    }
  };

  if (phase === 'working') {
    return (
      <Screen>
        <View style={styles.working} accessibilityLiveRegion="polite">
          <ActivityIndicator color={Colors.emerald} size="large" />
          <Headline style={styles.center}>Tavie is writing your plan</Headline>
          <Body muted style={styles.center}>
            This usually takes under a minute. Nothing is saved until you approve it.
          </Body>
        </View>
      </Screen>
    );
  }

  if (phase === 'input') {
    return (
      <Screen
        footer={
          <>
            <Button title="Generate my plan" onPress={onGenerate} disabled={tooLong} />
            <Button variant="link" title="Build it myself" onPress={buildMyself} />
          </>
        }>
        <TopBar parent={parent} />
        <View style={styles.content}>
          <Label>Plan with Tavie</Label>
          <Headline>Already have a course or mentorship plan?</Headline>
          <Body muted>
            Paste your outline, lesson list, or how you run your mentorship. Tavie turns it into steps your students act
            on. Leave it empty and Tavie suggests a starter plan for you to review.
          </Body>
          <TextField
            label="Your course (optional)"
            value={outline}
            onChangeText={setOutline}
            placeholder={'Week 1: Pick your market\nWeek 2: Build your buyers list\n…'}
            multiline
            style={styles.outline}
          />
          <Body muted style={[styles.counter, tooLong && styles.warn]}>
            {outline.length.toLocaleString('en-US')} / {AI_LIMITS.inputChars.toLocaleString('en-US')} characters
          </Body>
          {hasExisting ? <Body muted>New milestones go after the ones you already have.</Body> : null}
          <ErrorText message={error} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen
      footer={
        <>
          <Button title="Add to my program" onPress={onAdd} loading={saving} disabled={plan.length === 0} />
          <Button variant="link" title="Generate again" onPress={() => setPhase('input')} />
          <Button variant="link" title="Build it myself" onPress={buildMyself} />
        </>
      }>
      <TopBar parent={parent} />
      <View style={styles.content}>
        <Label>Review your plan</Label>
        <Headline>{program.goal}</Headline>
        {isDraft ? (
          <View style={styles.banner} accessibilityRole="summary">
            <Label>Draft starter plan</Label>
            <Body>
              Tavie suggested this without your course. Review every step and change anything that isn’t how you teach.
            </Body>
          </View>
        ) : (
          <Body muted>Built from your course. Change anything, remove what you don’t need.</Body>
        )}
        <Body muted>Nothing is saved or shown to students until you add it and publish.</Body>

        {plan.map((m, i) => (
          <View key={m.key} style={styles.milestone}>
            <View style={styles.rowTop}>
              <Label>Milestone {i + 1}</Label>
              <SmallButton
                label="Remove"
                accessibilityLabel={`Remove milestone ${m.title}`}
                onPress={() => setMilestone(m.key, null)}
              />
            </View>
            <TextField
              label="Name"
              value={m.title}
              onChangeText={(t) => setMilestone(m.key, { title: t })}
              maxLength={LIMITS.milestoneTitle}
            />
            {m.tasks.map((t) =>
              editing === t.key ? (
                <TaskFields key={t.key} task={t} onChange={(c) => setTask(t.key, c)} onDone={() => setEditing(null)} />
              ) : (
                <View key={t.key} style={styles.task}>
                  <Body style={styles.taskTitle}>{t.title}</Body>
                  {t.why ? <Body muted>{t.why}</Body> : null}
                  <Body muted style={styles.meta}>
                    {reportLine(t)} · about {t.est_minutes} min
                  </Body>
                  <View style={styles.inline}>
                    <SmallButton
                      label="Edit"
                      accessibilityLabel={`Edit ${t.title}`}
                      onPress={() => setEditing(t.key)}
                    />
                    <SmallButton
                      label="Remove"
                      accessibilityLabel={`Remove ${t.title}`}
                      onPress={() => setTask(t.key, null)}
                    />
                  </View>
                </View>
              ),
            )}
            {m.tasks.length === 0 ? (
              <Body style={styles.warn}>Add tasks to this milestone after you save it.</Body>
            ) : null}
          </View>
        ))}
        {plan.length === 0 ? <Body muted>You removed everything. Generate again, or build it yourself.</Body> : null}
        <Body muted>After adding, you can reorder, add resources, and change anything in the builder.</Body>
        <ErrorText message={error} />
      </View>
    </Screen>
  );
}

/** The fields a creator most often changes. Everything else is in the full task editor after saving. */
function TaskFields({
  task,
  onChange,
  onDone,
}: {
  task: SuggestedTask;
  onChange: (change: Partial<SuggestedTask>) => void;
  onDone: () => void;
}) {
  return (
    <View style={styles.task}>
      <TextField
        label="Action"
        value={task.title}
        onChangeText={(t) => onChange({ title: t })}
        maxLength={LIMITS.taskTitle}
        multiline
      />
      <TextField
        label="Why it matters"
        value={task.why ?? ''}
        onChangeText={(t) => onChange({ why: t })}
        maxLength={LIMITS.why}
        multiline
      />
      {task.completion_type === 'count' ? (
        <TextField
          label={`Target${task.unit ? ` (${task.unit})` : ''}`}
          value={task.target_count ? String(task.target_count) : ''}
          onChangeText={(t) => {
            const n = Number(t.replace(/\D/g, '').slice(0, 5));
            onChange({ target_count: n || null });
          }}
          keyboardType="number-pad"
        />
      ) : null}
      {task.completion_type !== 'done' ? (
        <TextField
          label="Question they answer"
          value={task.check_in_question ?? ''}
          onChangeText={(t) => onChange({ check_in_question: t })}
          maxLength={LIMITS.question}
        />
      ) : null}
      <Button variant="secondary" title="Done" onPress={onDone} />
    </View>
  );
}

function reportLine(t: SuggestedTask) {
  const label = REPORT_TYPES.find((r) => r.type === t.completion_type)?.label ?? '';
  if (t.completion_type === 'count') return `${label}: ${t.target_count ?? '?'} ${t.unit ?? ''}`.trim();
  return label;
}

/** What would stop the approved plan from saving, in the creator's words. */
function reviewProblems(plan: Editable[]): string[] {
  const problems: string[] = [];
  plan.forEach((m, i) => {
    if (!m.title.trim()) problems.push(`Name milestone ${i + 1}.`);
    for (const t of m.tasks) {
      if (!t.title.trim()) problems.push(`A task in milestone ${i + 1} needs an action.`);
      else if (t.completion_type === 'count' && !t.target_count) problems.push(`Set a target for "${t.title}".`);
    }
  });
  return problems;
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
    paddingTop: Spacing.three,
  },
  working: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.six,
  },
  center: {
    textAlign: 'center',
  },
  outline: {
    minHeight: 200,
  },
  counter: {
    fontSize: 14,
    textAlign: 'right',
  },
  warn: {
    color: Colors.error,
    fontSize: 15,
  },
  banner: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: Colors.ink,
    backgroundColor: Colors.white,
  },
  milestone: {
    gap: Spacing.two,
    paddingTop: Spacing.three,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  task: {
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.white,
  },
  taskTitle: {
    fontFamily: Fonts.bodySemiBold,
  },
  meta: {
    fontSize: 14,
  },
  inline: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
});

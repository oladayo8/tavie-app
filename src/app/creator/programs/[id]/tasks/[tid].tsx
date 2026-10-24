import * as DocumentPicker from 'expo-document-picker';
import { useLocalSearchParams, usePreventRemove } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Choices, Row, SmallButton, SwitchRow } from '@/components/rows';
import { Screen } from '@/components/screen';
import { ErrorState, ErrorText, Loading } from '@/components/states';
import { Body, Headline, Label } from '@/components/text';
import { TextField } from '@/components/text-field';
import { goBackOr, TopBar } from '@/components/top-bar';
import { Colors, Radius, Spacing } from '@/constants/theme';
import {
  addFileResource,
  addLinkResource,
  archiveTask,
  loadProgram,
  resourceUrl,
  saveTask,
  type ProgramDetail,
} from '@/lib/builder';
import { suggestTask } from '@/lib/ai';
import { confirm } from '@/lib/confirm';
import { dataErrorMessage } from '@/lib/errors';
import {
  classifyLink,
  defaultQuestion,
  draftFromSuggestion,
  draftFromTask,
  LIMITS,
  REPORT_TYPES,
  validateTaskDraft,
  type CompletionType,
  type Resource,
  type TaskDraft,
} from '@/lib/program';
import { useLoad } from '@/lib/use-load';

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const DETAIL_FIELDS: (keyof TaskDraft)[] = ['follow_up_question', 'follow_up_options', 'est_minutes'];

/** Loads the program. The editor copies the task into its own state once, so a refresh never wipes typing. */
export default function TaskEditorScreen() {
  const { id, tid, milestone } = useLocalSearchParams<{ id: string; tid: string; milestone?: string }>();
  const load = useCallback(() => loadProgram(id), [id]);
  const { data: detail, error, retry } = useLoad(load);

  const parent = useMemo(
    () =>
      milestone
        ? ({ pathname: '/creator/programs/[id]/milestones/[mid]', params: { id, mid: milestone } } as const)
        : ({ pathname: '/creator/programs/[id]', params: { id } } as const),
    [id, milestone],
  );

  if (!detail) {
    return (
      <Screen>
        <TopBar parent={parent} />
        {error ? <ErrorState message={error} onRetry={retry} /> : <Loading />}
      </Screen>
    );
  }
  const task = tid === 'new' ? null : (detail.tasks.find((t) => t.id === tid) ?? null);
  const milestoneId = task?.milestone_id ?? milestone;
  if ((tid !== 'new' && !task) || !milestoneId) {
    return (
      <Screen>
        <TopBar parent={parent} />
        <Body muted>This task isn’t here any more.</Body>
      </Screen>
    );
  }
  return <TaskEditor detail={detail} taskId={task?.id ?? null} milestoneId={milestoneId} parent={parent} />;
}

function TaskEditor({
  detail,
  taskId,
  milestoneId,
  parent,
}: {
  detail: ProgramDetail;
  taskId: string | null;
  milestoneId: string;
  parent: Parameters<typeof TopBar>[0]['parent'];
}) {
  const task = taskId ? (detail.tasks.find((t) => t.id === taskId) ?? null) : null;
  const [initial] = useState(() => draftFromTask(task, task ? (detail.links[task.id] ?? []) : []));
  const [draft, setDraft] = useState<TaskDraft>(initial);
  const [resources, setResources] = useState<Resource[]>(detail.resources);
  const [savedId, setSavedId] = useState<string | null>(taskId);
  const [saving, setSaving] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Follow-up, minutes, and skipping sit behind "Edit details" unless this task already uses them.
  const [showDetails, setShowDetails] = useState(initial.follow_up !== 'none' || initial.is_optional);
  const [sentence, setSentence] = useState('');
  const [suggesting, setSuggesting] = useState(false);
  const [suggestion, setSuggestion] = useState<{ ok: boolean; message: string } | null>(null);
  // Set just before leaving after a save or remove, so the unsaved-changes question is skipped.
  const leaving = useRef(false);

  const leave = () => {
    leaving.current = true;
    goBackOr(parent);
  };

  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  // repeat() turns the guard off before navigating; dispatching with the guard on would loop.
  usePreventRemove(dirty, ({ repeat }) => {
    if (leaving.current) {
      repeat();
      return;
    }
    confirm('Discard changes?', 'Your changes to this task haven’t been saved.', 'Discard').then((ok) => {
      if (ok) repeat();
    });
  });

  const errors = validateTaskDraft(draft);
  const errorFor = (field: keyof TaskDraft) =>
    showErrors ? (errors.find((e) => e.field === field)?.message ?? null) : null;
  const set = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const setType = (type: CompletionType) =>
    setDraft((d) => {
      const keepQuestion =
        d.check_in_question.trim() && d.check_in_question !== defaultQuestion(d.completion_type, d.unit);
      return {
        ...d,
        completion_type: type,
        check_in_question: keepQuestion ? d.check_in_question : defaultQuestion(type, d.unit),
      };
    });

  const setUnit = (unit: string) =>
    setDraft((d) => {
      const followDefault = !d.check_in_question.trim() || d.check_in_question === defaultQuestion('count', d.unit);
      return { ...d, unit, check_in_question: followDefault ? defaultQuestion('count', unit) : d.check_in_question };
    });

  const onSuggest = async () => {
    if (sentence.trim().length < 3) return;
    setSuggesting(true);
    setSuggestion(null);
    const milestoneTitle = detail.milestones.find((m) => m.id === milestoneId)?.title ?? '';
    const result = await suggestTask(detail.program.goal, milestoneTitle, sentence);
    setSuggesting(false);
    if (!result.ok) {
      setSuggestion({ ok: false, message: result.message });
      return;
    }
    // Fills the form only. Nothing is saved until they tap Save task.
    setDraft((d) => draftFromSuggestion(result.value, d));
    if (result.value.follow_up_question || result.value.is_optional) setShowDetails(true);
    setSuggestion({ ok: true, message: 'Tavie filled this in. Check it and change anything, then save.' });
  };

  const onSave = async () => {
    setShowErrors(true);
    if (errors.length) {
      if (errors.some((e) => DETAIL_FIELDS.includes(e.field))) setShowDetails(true);
      setError('Fix the highlighted fields, then save again.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const id = await saveTask(draft, { taskId: savedId, milestoneId, siblings: detail.tasks }, setSavedId);
      setSavedId(id);
      leave();
    } catch (e) {
      // Keep everything typed; a retry updates the same task instead of adding another.
      setError(dataErrorMessage(e as { message?: string }));
      setSaving(false);
    }
  };

  const onArchive = async () => {
    if (!savedId) return;
    if (!(await confirm('Remove this task?', 'It will be hidden from your path.', 'Remove'))) return;
    try {
      await archiveTask(savedId);
      leave();
    } catch (e) {
      setError(dataErrorMessage(e as { message?: string }));
    }
  };

  const selected = draft.resource_ids
    .map((rid) => resources.find((r) => r.id === rid))
    .filter((r): r is Resource => !!r);
  const reusable = resources.filter((r) => !draft.resource_ids.includes(r.id));
  const full = draft.resource_ids.length >= LIMITS.resourcesPerTask;

  return (
    <Screen
      footer={
        <>
          <Button title="Save task" onPress={onSave} loading={saving} />
          {savedId ? <Button variant="link" title="Remove this task" onPress={onArchive} /> : null}
        </>
      }>
      <TopBar parent={parent} />
      <View style={styles.content}>
        <Label>{taskId ? 'Edit task' : 'New task'}</Label>
        <Headline size="compact">What should they do?</Headline>
        {!savedId ? (
          <View style={styles.box}>
            <TextField
              label="Describe it in one sentence"
              value={sentence}
              onChangeText={setSentence}
              placeholder="Have them call 50 sellers from their list this week"
              maxLength={300}
              multiline
              autoFocus
            />
            <Button
              variant="secondary"
              title="Suggest the rest"
              onPress={onSuggest}
              loading={suggesting}
              disabled={sentence.trim().length < 3}
            />
            {suggestion ? (
              <Body accessibilityRole="alert" style={suggestion.ok ? undefined : styles.warn}>
                {suggestion.message}
              </Body>
            ) : (
              <Body muted>Tavie suggests the task. Or fill it in yourself below.</Body>
            )}
          </View>
        ) : null}
        <TextField
          label="Action"
          value={draft.title}
          onChangeText={(t) => set('title', t)}
          placeholder="Call 50 sellers from your list"
          maxLength={LIMITS.taskTitle}
          multiline
        />
        <ErrorText message={errorFor('title')} />

        <TextField
          label="Why does it matter?"
          value={draft.why}
          onChangeText={(t) => set('why', t)}
          placeholder="Deals come from conversations."
          maxLength={LIMITS.why}
          multiline
        />
        {!draft.why.trim() ? (
          <Body style={styles.warn}>Needed before you publish. Students see it on the task.</Body>
        ) : null}

        <Choices
          label="How do they report it?"
          options={REPORT_TYPES.map((r) => ({ value: r.type, label: r.label, hint: r.hint }))}
          value={draft.completion_type}
          onChange={setType}
        />
        {draft.completion_type === 'count' ? (
          <>
            <TextField
              label="Target"
              value={draft.target_count}
              onChangeText={(t) => set('target_count', t.replace(/\D/g, '').slice(0, 5))}
              placeholder="50"
              keyboardType="number-pad"
            />
            <ErrorText message={errorFor('target_count')} />
            <TextField
              label="Unit"
              value={draft.unit}
              onChangeText={setUnit}
              placeholder="calls"
              maxLength={LIMITS.unit}
            />
          </>
        ) : null}
        {draft.completion_type !== 'done' ? (
          <>
            <TextField
              label="Question they answer"
              value={draft.check_in_question}
              onChangeText={(t) => set('check_in_question', t)}
              maxLength={LIMITS.question}
            />
            {!draft.check_in_question.trim() ? <Body style={styles.warn}>Needed before you publish.</Body> : null}
            <ErrorText message={errorFor('check_in_question')} />
          </>
        ) : null}

        <Label style={styles.section}>What do they need?</Label>
        {selected.map((r) => (
          <Row key={r.id} title={r.title} detail={r.type === 'file' ? 'PDF' : (r.url ?? '')}>
            <View style={styles.inline}>
              <SmallButton label="Open" accessibilityLabel={`Open ${r.title}`} onPress={() => openResource(r)} />
              <SmallButton
                label="Remove"
                accessibilityLabel={`Remove ${r.title} from this task`}
                onPress={() =>
                  set(
                    'resource_ids',
                    draft.resource_ids.filter((x) => x !== r.id),
                  )
                }
              />
            </View>
          </Row>
        ))}
        {full ? (
          <Body muted>Three resources is the most a task can have.</Body>
        ) : (
          <AddResource
            programId={detail.program.id}
            reusable={reusable}
            onPick={(r) => {
              setResources((all) => (all.some((x) => x.id === r.id) ? all : [...all, r]));
              setDraft((d) => ({ ...d, resource_ids: [...d.resource_ids, r.id] }));
            }}
          />
        )}

        {showDetails ? (
          <>
            <Label style={styles.section}>Details</Label>
            {draft.follow_up === 'none' ? (
              <Button variant="link" title="Add a follow-up question" onPress={() => set('follow_up', 'choices')} />
            ) : (
              <View style={styles.box}>
                <Label>Follow-up question</Label>
                <Body muted>Records how it went. It never decides whether the task is done.</Body>
                <TextField
                  label="Question"
                  value={draft.follow_up_question}
                  onChangeText={(t) => set('follow_up_question', t)}
                  placeholder="How did it go?"
                  maxLength={LIMITS.question}
                />
                <ErrorText message={errorFor('follow_up_question')} />
                <Choices
                  label="They answer with"
                  options={[
                    { value: 'choices', label: 'Tap a choice' },
                    { value: 'text', label: 'A short written answer' },
                  ]}
                  value={draft.follow_up === 'text' ? 'text' : 'choices'}
                  onChange={(v) => set('follow_up', v)}
                />
                {draft.follow_up === 'choices'
                  ? [0, 1, 2, 3].map((i) => (
                      <TextField
                        key={i}
                        label={`Choice ${i + 1}${i > 0 ? ' (optional)' : ''}`}
                        value={draft.follow_up_options[i] ?? ''}
                        onChangeText={(t) => {
                          const options = [...draft.follow_up_options];
                          options[i] = t;
                          set('follow_up_options', options);
                        }}
                        maxLength={40}
                      />
                    ))
                  : null}
                <ErrorText message={errorFor('follow_up_options')} />
                <Button
                  variant="link"
                  title="Remove follow-up question"
                  onPress={() =>
                    setDraft((d) => ({ ...d, follow_up: 'none', follow_up_question: '', follow_up_options: [] }))
                  }
                />
              </View>
            )}

            <TextField
              label="About how many minutes?"
              value={draft.est_minutes}
              onChangeText={(t) => set('est_minutes', t.replace(/\D/g, '').slice(0, 4))}
              keyboardType="number-pad"
            />
            <ErrorText message={errorFor('est_minutes')} />
            <SwitchRow
              label="Students can skip this"
              value={draft.is_optional}
              onValueChange={(v) => set('is_optional', v)}
            />
            <Button variant="link" title="Hide details" onPress={() => setShowDetails(false)} />
          </>
        ) : (
          <Button
            variant="link"
            title="Edit details"
            accessibilityHint="Follow-up question, minutes, and whether students can skip it"
            onPress={() => setShowDetails(true)}
          />
        )}
        {!showDetails ? (
          <Body muted>
            About {draft.est_minutes || '?'} min · {draft.is_optional ? 'Students can skip it' : 'Required'} ·{' '}
            {draft.follow_up === 'none' ? 'No follow-up question' : 'Has a follow-up question'}
          </Body>
        ) : null}
        <ErrorText message={error} />
      </View>
    </Screen>
  );
}

async function openResource(resource: Resource) {
  try {
    const url = await resourceUrl(resource);
    if (url) await Linking.openURL(url);
  } catch {
    // Opening is a convenience in the builder; a failure leaves the editor as it was.
  }
}

/** Adds a YouTube or web link, uploads a PDF, or reuses one of this program's resources. */
function AddResource({
  programId,
  reusable,
  onPick,
}: {
  programId: string;
  reusable: Resource[];
  onPick: (resource: Resource) => void;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'link' | 'file'>('link');
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return <Button variant="secondary" title="Add a resource" onPress={() => setOpen(true)} />;

  const linkType = classifyLink(url);
  const reset = () => {
    setTitle('');
    setUrl('');
    setError(null);
    setOpen(false);
  };

  const onAddLink = async () => {
    if (!linkType || !title.trim()) {
      setError(
        !title.trim() ? 'Give it a title students will recognise.' : 'Paste a full link that starts with https://',
      );
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onPick(await addLinkResource(programId, linkType, title, url));
      reset();
    } catch (e) {
      setError(dataErrorMessage(e as { message?: string }));
    }
    setBusy(false);
  };

  const onPickPdf = async () => {
    setError(null);
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (result.canceled || !result.assets[0]) return;
    const file = result.assets[0];
    if (file.size && file.size > MAX_PDF_BYTES) {
      setError('That PDF is over 20 MB. Try a smaller file.');
      return;
    }
    setBusy(true);
    try {
      const name = title.trim() || file.name.replace(/\.pdf$/i, '').slice(0, LIMITS.resourceTitle);
      onPick(await addFileResource(programId, file, name || 'PDF'));
      reset();
    } catch (e) {
      setError(dataErrorMessage(e as { message?: string }));
    }
    setBusy(false);
  };

  return (
    <View style={styles.box}>
      <Choices
        label="Add a resource"
        options={[
          { value: 'link', label: 'A link', hint: 'YouTube, Skool, Whop, Google Doc, or any https link' },
          { value: 'file', label: 'A PDF', hint: 'Up to 20 MB' },
        ]}
        value={kind}
        onChange={setKind}
      />
      <TextField
        label={kind === 'file' ? 'Title (optional)' : 'Title'}
        value={title}
        onChangeText={setTitle}
        placeholder={kind === 'file' ? 'Seller call script' : 'Lesson 4: Cold calling'}
        maxLength={LIMITS.resourceTitle}
      />
      {kind === 'link' ? (
        <>
          <TextField
            label="Link"
            value={url}
            onChangeText={setUrl}
            placeholder="https://"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Button variant="secondary" title="Add link" onPress={onAddLink} loading={busy} />
        </>
      ) : (
        <Button variant="secondary" title="Choose PDF" onPress={onPickPdf} loading={busy} />
      )}
      <ErrorText message={error} />
      {reusable.length ? (
        <>
          <Label style={styles.section}>Or reuse one from this program</Label>
          {reusable.map((r) => (
            <Row key={r.id} title={r.title} detail={r.type === 'file' ? 'PDF' : (r.url ?? '')}>
              <View style={styles.inline}>
                <SmallButton
                  label="Use"
                  accessibilityLabel={`Use ${r.title}`}
                  onPress={() => {
                    onPick(r);
                    reset();
                  }}
                />
              </View>
            </Row>
          ))}
        </>
      ) : null}
      <Button variant="link" title="Cancel" onPress={reset} />
    </View>
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
  warn: {
    color: Colors.error,
    fontSize: 15,
  },
  box: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.white,
  },
  inline: {
    flexDirection: 'row',
    gap: Spacing.two,
    paddingTop: Spacing.one,
  },
});

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { Choices } from '@/components/rows';
import { Screen } from '@/components/screen';
import { ErrorState, ErrorText, Loading } from '@/components/states';
import { Body, Headline, Label } from '@/components/text';
import { TextField } from '@/components/text-field';
import { TodayCard } from '@/components/today-card';
import { Colors, Radius, Spacing } from '@/constants/theme';
import { getArrival } from '@/lib/arrival';
import { signOut } from '@/lib/auth';
import { confirm } from '@/lib/confirm';
import { dataErrorMessage } from '@/lib/errors';
import {
  getToday,
  joinProgram,
  NOT_YET_REASONS,
  openableUrl,
  STUCK_REASONS,
  submitCheckIn,
  TEXT_ANSWER,
  type CheckIn,
  type TodayCard as Card,
  type TodayTask,
} from '@/lib/student';
import { afterCheckIn, newRequestId } from '@/lib/today';

/**
 * Student home: the one task for today. Joining from a coach's link enrolls them here.
 * Student-facing screens carry the creator's brand; Tavie is only "Powered by Tavie".
 */
export default function StudentHome() {
  const [card, setCard] = useState<Card | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const arrival = await getArrival();
      if (arrival?.role === 'student' && arrival.slug) {
        try {
          // Safe to repeat: someone already enrolled just gets their current task back.
          setCard(await joinProgram(arrival.slug));
          return;
        } catch (e) {
          const code = (e as { code?: string }).code;
          if (code !== 'P0002') throw e;
          setJoinError('That link isn’t active any more. Ask your coach for a new one.');
        }
      }
      setCard(await getToday());
    } catch (e) {
      setError(dataErrorMessage(e as { message?: string }));
    }
  }, []);

  useEffect(() => {
    // Loading starts here; the state updates arrive after the requests finish.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const footer = (
    <>
      {card?.progress.total ? <PathProgress done={card.progress.done} total={card.progress.total} /> : null}
      <Button variant="link" title="Sign out" onPress={signOut} />
      <Label style={styles.powered}>Powered by Tavie</Label>
    </>
  );

  if (card === undefined) {
    return (
      <Screen footer={footer}>
        {error ? <ErrorState message={error} onRetry={load} /> : <Loading label="Loading your task" />}
      </Screen>
    );
  }

  if (card === null) {
    return (
      <Screen footer={footer}>
        <View style={styles.center}>
          <Label>Today</Label>
          <Headline>You’re signed in.</Headline>
          <Body muted>{joinError ?? 'Open your coach’s link to start your plan.'}</Body>
        </View>
      </Screen>
    );
  }

  const coach = card.creator.first_name;
  const header = (
    <Label>
      {[card.creator.first_name, card.creator.last_name].filter(Boolean).join(' ')} · {card.program.title}
    </Label>
  );

  if (card.program.status !== 'live') {
    return (
      <Screen footer={footer}>
        <View style={styles.center}>
          {header}
          <Headline>{coach} has paused this program.</Headline>
          <Body muted>Your progress is saved. You’ll be able to pick up where you left off.</Body>
        </View>
      </Screen>
    );
  }

  if (!card.task) {
    return (
      <Screen footer={footer}>
        <View style={styles.center}>
          {header}
          <Headline>You finished {coach}’s path.</Headline>
          <Body muted>{card.program.goal}</Body>
        </View>
      </Screen>
    );
  }

  return (
    <Screen footer={footer}>
      <View style={styles.content}>
        {header}
        {message ? (
          <Body accessibilityRole="alert" style={styles.message}>
            {message}
          </Body>
        ) : null}
        <TaskToday
          key={card.task.id}
          card={card}
          task={card.task}
          onSaved={(next, note) => {
            setCard(next);
            setMessage(note);
          }}
        />
      </View>
    </Screen>
  );
}

type Mode = 'idle' | 'report' | 'not_yet' | 'stuck';

/** The task card plus its check-in questions. Answers are kept until they save. */
function TaskToday({
  card,
  task,
  onSaved,
}: {
  card: Card;
  task: TodayTask;
  onSaved: (next: Card, note: string | null) => void;
}) {
  const [mode, setMode] = useState<Mode>('idle');
  const [number, setNumber] = useState('');
  const [yes, setYes] = useState(false);
  const [text, setText] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // One id per answer, kept across retries so a retry never counts twice.
  const requestId = useRef<string | null>(null);

  const coach = card.creator.first_name;
  const hasFollowUp = !!task.follow_up_question;

  const open = (next: Mode) => {
    setError(null);
    requestId.current = null;
    setMode(next);
  };

  const send = async (answer: CheckIn) => {
    setSaving(true);
    setError(null);
    requestId.current ??= newRequestId();
    try {
      const result = await submitCheckIn(card, task.id, answer, requestId.current);
      requestId.current = null;
      const note = answer.kind === 'unstuck' ? 'Great. Keep going.' : afterCheckIn(result, task);
      onSaved(result.today, note);
      setMode('idle');
      setNumber('');
      setText('');
      setFollowUp('');
      setReason('');
      setNote('');
      setYes(false);
    } catch (e) {
      // The sheet stays open with everything they typed.
      const message = (e as { message?: string }).message ?? '';
      setError((e as { code?: string }).code === '22023' && message ? message : 'Didn’t save. Try again.');
    }
    setSaving(false);
  };

  const followUpAnswer = () => (hasFollowUp && followUp.trim() ? followUp.trim() : undefined);

  const onPrimary = () => {
    if (task.completion_type === 'done' && !hasFollowUp) {
      send({ kind: 'complete' });
      return;
    }
    open('report');
  };

  const onSkip = async () => {
    if (await confirm('Skip this task?', 'It’s optional, so you can move on without it.', 'Skip')) {
      send({ kind: 'skip' });
    }
  };

  const followUpField = hasFollowUp ? (
    task.follow_up_options ? (
      <Choices
        label={`${task.follow_up_question} (optional)`}
        options={task.follow_up_options.map((o) => ({ value: o, label: o }))}
        value={followUp}
        onChange={setFollowUp}
      />
    ) : (
      <TextField
        label={`${task.follow_up_question} (optional)`}
        value={followUp}
        onChangeText={setFollowUp}
        maxLength={160}
      />
    )
  ) : null;

  const cancel = <Button variant="link" title="Cancel" onPress={() => open('idle')} />;

  let actions: ReactNode = undefined;
  if (mode === 'report') {
    const question = task.check_in_question || (task.completion_type === 'done' ? 'How did it go?' : 'Check in');
    if (task.completion_type === 'count') {
      const value = /^\d{1,3}$/.test(number) ? Number(number) : null;
      actions = (
        <View style={styles.sheet}>
          <TextField
            label={question}
            value={number}
            onChangeText={(t) => setNumber(t.replace(/\D/g, '').slice(0, 3))}
            keyboardType="number-pad"
            placeholder="0"
            autoFocus
          />
          {followUpField}
          <ErrorText message={error} />
          <Button
            title={`Log ${task.unit ?? 'it'}`}
            onPress={() => value !== null && send({ kind: 'progress', number: value, followUp: followUpAnswer() })}
            loading={saving}
            disabled={value === null}
          />
          {cancel}
        </View>
      );
    } else if (task.completion_type === 'yes_no') {
      actions = (
        <View style={styles.sheet}>
          <Label>{question}</Label>
          {yes ? (
            <>
              {followUpField}
              <ErrorText message={error} />
              <Button
                title="Save"
                onPress={() => send({ kind: 'complete', yes: true, followUp: followUpAnswer() })}
                loading={saving}
              />
            </>
          ) : (
            <>
              <Button
                title="Yes"
                onPress={() => (hasFollowUp ? setYes(true) : send({ kind: 'complete', yes: true }))}
                loading={saving}
              />
              <Button variant="secondary" title="Not yet" onPress={() => open('not_yet')} />
              <ErrorText message={error} />
            </>
          )}
          {cancel}
        </View>
      );
    } else if (task.completion_type === 'text') {
      const length = text.trim().length;
      actions = (
        <View style={styles.sheet}>
          <TextField
            label={question}
            value={text}
            onChangeText={setText}
            maxLength={TEXT_ANSWER.max}
            multiline
            autoFocus
          />
          <Body muted style={styles.counter}>
            {length < TEXT_ANSWER.min ? `At least ${TEXT_ANSWER.min} characters` : `${length} / ${TEXT_ANSWER.max}`}
          </Body>
          {followUpField}
          <ErrorText message={error} />
          <Button
            title="Send my answer"
            onPress={() => send({ kind: 'complete', text, followUp: followUpAnswer() })}
            loading={saving}
            disabled={length < TEXT_ANSWER.min}
          />
          {cancel}
        </View>
      );
    } else {
      actions = (
        <View style={styles.sheet}>
          {followUpField}
          <ErrorText message={error} />
          <Button
            title="Mark done"
            onPress={() => send({ kind: 'complete', followUp: followUpAnswer() })}
            loading={saving}
          />
          {cancel}
        </View>
      );
    }
  } else if (mode === 'not_yet') {
    actions = (
      <View style={styles.sheet}>
        <Choices
          label="What got in the way?"
          options={[...NOT_YET_REASONS, 'I’m stuck'].map((r) => ({ value: r, label: r }))}
          value={reason}
          onChange={(r) => (r === 'I’m stuck' ? (setReason(''), open('stuck')) : setReason(r))}
        />
        <ErrorText message={error} />
        <Button
          title="Save"
          onPress={() => send({ kind: 'not_yet', yes: false, reason })}
          loading={saving}
          disabled={!reason}
        />
        {cancel}
      </View>
    );
  } else if (mode === 'stuck') {
    actions = (
      <View style={styles.sheet}>
        <Choices
          label="What’s in the way?"
          options={STUCK_REASONS.map((r) => ({ value: r, label: r }))}
          value={reason}
          onChange={setReason}
        />
        <TextField
          label="Anything else? (optional)"
          value={note}
          onChangeText={setNote}
          maxLength={TEXT_ANSWER.max}
          multiline
        />
        <Body muted>{coach} will see this.</Body>
        <ErrorText message={error} />
        <Button
          title="Tell my coach"
          onPress={() => send({ kind: 'stuck', reason, text: note })}
          loading={saving}
          disabled={!reason}
        />
        {cancel}
      </View>
    );
  }

  const stuckNotice =
    task.state === 'stuck' ? (
      <View style={styles.notice}>
        <Body>You said you’re stuck on this. {coach} can see it.</Body>
        <Button
          variant="secondary"
          title="I figured it out"
          onPress={() => send({ kind: 'unstuck' })}
          loading={saving}
        />
      </View>
    ) : null;

  return (
    <>
      <TodayCard
        task={task}
        milestoneNumber={card.milestone?.number ?? 1}
        milestoneCount={card.milestone?.count ?? 1}
        milestoneTitle={card.milestone?.title ?? ''}
        resources={card.resources ?? []}
        loggedSoFar={task.count_so_far}
        onPrimary={onPrimary}
        onStuck={() => open('stuck')}
        onSkip={onSkip}
        onResource={(id) => openResource(card, id)}
        notice={stuckNotice}
        stuck={task.state === 'stuck'}
        actions={actions}
        showPowered={false}
      />
      {mode === 'idle' ? <ErrorText message={error} /> : null}
    </>
  );
}

async function openResource(card: Card, id: string) {
  const resource = card.resources?.find((r) => r.id === id);
  if (!resource) return;
  try {
    const url = await openableUrl(resource);
    if (url) await Linking.openURL(url);
  } catch {
    // Opening is best effort; the task itself stays on screen.
  }
}

function PathProgress({ done, total }: { done: number; total: number }) {
  return (
    <View style={styles.progress} accessibilityLabel={`${done} of ${total} tasks done`}>
      <Body muted style={styles.progressText}>
        {done} of {total} tasks
      </Body>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.min(100, (done / total) * 100)}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: Spacing.three,
    paddingTop: Spacing.three,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    gap: Spacing.three,
  },
  message: {
    color: Colors.emerald,
  },
  sheet: {
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: Colors.ink,
    backgroundColor: Colors.white,
  },
  notice: {
    gap: Spacing.two,
    padding: Spacing.three,
    borderRadius: Radius.card,
    borderWidth: 1.5,
    borderColor: Colors.error,
    backgroundColor: Colors.white,
  },
  counter: {
    fontSize: 14,
    textAlign: 'right',
  },
  progress: {
    gap: Spacing.one,
  },
  progressText: {
    fontSize: 14,
    textAlign: 'center',
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.line,
    overflow: 'hidden',
  },
  fill: {
    height: 6,
    backgroundColor: Colors.emerald,
  },
  powered: {
    textAlign: 'center',
    paddingTop: Spacing.two,
  },
});

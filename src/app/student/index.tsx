import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/button';
import { Choices } from '@/components/rows';
import { Screen } from '@/components/screen';
import { ErrorState, ErrorText, Loading } from '@/components/states';
import { Body, Headline, Label } from '@/components/text';
import { TextField } from '@/components/text-field';
import { TodayCard } from '@/components/today-card';
import { Wordmark } from '@/components/wordmark';
import { Colors, Fonts, Spacing } from '@/constants/theme';
import { getArrival } from '@/lib/arrival';
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
 * A compact Tavie bar on top, then the program, then one task card. Built for a phone screen.
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

  if (card === undefined) {
    return (
      <Screen tab>
        <TodayHeader />
        {error ? <ErrorState message={error} onRetry={load} /> : <Loading label="Loading your task" />}
      </Screen>
    );
  }

  if (card === null) {
    return (
      <Screen tab>
        <TodayHeader />
        <View style={styles.stateCard}>
          <Headline style={styles.stateTitle}>You’re signed in.</Headline>
          <Body muted>{joinError ?? 'Open your coach’s link to start your plan.'}</Body>
        </View>
        <Powered />
      </Screen>
    );
  }

  const coach = card.creator.first_name;

  if (card.program.status !== 'live') {
    return (
      <Screen tab>
        <TodayHeader card={card} />
        <View style={styles.stateCard}>
          <Headline style={styles.stateTitle}>{coach} has paused this program.</Headline>
          <Body muted>Your progress is saved. You’ll be able to pick up where you left off.</Body>
        </View>
        <Powered />
      </Screen>
    );
  }

  if (!card.task) {
    return (
      <Screen tab>
        <TodayHeader card={card} />
        <View style={styles.stateCard}>
          <Headline style={styles.stateTitle}>You finished {coach}’s path.</Headline>
          <Body muted>{card.program.goal}</Body>
        </View>
        <Powered />
      </Screen>
    );
  }

  return (
    <Screen tab>
      <TodayHeader card={card} />
      <View style={styles.content}>
        {message ? (
          <View style={styles.message} accessibilityRole="alert">
            <Body style={styles.messageText}>{message}</Body>
          </View>
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
      <Powered />
    </Screen>
  );
}

/** Compact top: Tavie, then the program, its coach, and where they are on the path. */
function TodayHeader({ card }: { card?: Card }) {
  const coachName = card ? [card.creator.first_name, card.creator.last_name].filter(Boolean).join(' ') : '';
  const milestone = card?.milestone;
  return (
    <View style={styles.header}>
      <View style={styles.bar}>
        <Wordmark size={24} />
      </View>
      {card ? (
        <View style={styles.program}>
          <Text accessibilityRole="header" maxFontSizeMultiplier={1.3} style={styles.programTitle} numberOfLines={2}>
            {card.program.title}
          </Text>
          {coachName ? (
            <Text maxFontSizeMultiplier={1.3} style={styles.coach}>
              with {coachName}
            </Text>
          ) : null}
          {milestone && card.progress.total ? (
            <PathProgress
              milestone={milestone}
              done={card.progress.done}
              total={card.progress.total}
              finished={!card.task}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function Powered() {
  return <Label style={styles.powered}>Powered by Tavie</Label>;
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
        <Body style={styles.noticeText}>You said you’re stuck on this. {coach} can see it.</Body>
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
        showMilestone={false}
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
/** One segment per milestone, then where they are in words. */
function PathProgress({
  milestone,
  done,
  total,
  finished,
}: {
  milestone: { number: number; count: number; title: string };
  done: number;
  total: number;
  finished: boolean;
}) {
  const segments = Array.from({ length: milestone.count }, (_, i) =>
    finished || i < milestone.number - 1 ? 'done' : i === milestone.number - 1 ? 'current' : 'later',
  );
  return (
    <View
      style={styles.progress}
      accessible
      accessibilityLabel={`Milestone ${milestone.number} of ${milestone.count}, ${milestone.title}. ${done} of ${total} tasks done.`}>
      <View style={styles.segments}>
        {segments.map((kind, i) => (
          <View key={i} style={[styles.segment, styles[kind]]} />
        ))}
      </View>
      <View style={styles.progressRow}>
        <Text maxFontSizeMultiplier={1.3} style={styles.progressText} numberOfLines={1}>
          {finished ? 'Path complete' : `Milestone ${milestone.number} of ${milestone.count} · ${milestone.title}`}
        </Text>
        <Text maxFontSizeMultiplier={1.2} style={styles.progressCount}>
          {done}/{total} tasks
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 20,
    paddingBottom: 20,
  },
  bar: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
  },
  program: {
    gap: 4,
  },
  programTitle: {
    fontFamily: Fonts.display,
    fontSize: 22,
    lineHeight: 26,
    letterSpacing: -0.4,
    color: Colors.ink,
  },
  coach: {
    fontFamily: Fonts.body,
    fontSize: 14,
    color: Colors.inkMuted,
  },
  progress: {
    gap: 8,
    paddingTop: 12,
  },
  segments: {
    flexDirection: 'row',
    gap: 4,
  },
  segment: {
    flex: 1,
    height: 6,
    borderRadius: 3,
  },
  done: {
    backgroundColor: Colors.emerald,
  },
  current: {
    backgroundColor: Colors.mint,
  },
  later: {
    backgroundColor: Colors.line,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  progressText: {
    flex: 1,
    fontFamily: Fonts.bodyMedium,
    fontSize: 13,
    color: Colors.ink,
  },
  progressCount: {
    fontFamily: Fonts.mono,
    fontSize: 11,
    color: Colors.inkMuted,
  },
  content: {
    gap: 12,
  },
  stateCard: {
    gap: Spacing.two,
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.line,
    backgroundColor: Colors.white,
  },
  stateTitle: {
    fontSize: 24,
    lineHeight: 28,
    letterSpacing: -0.5,
  },
  message: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(95, 216, 160, 0.22)',
  },
  messageText: {
    fontFamily: Fonts.bodyMedium,
    fontSize: 15,
    lineHeight: 21,
    color: Colors.forest,
  },
  sheet: {
    gap: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: Colors.line,
  },
  notice: {
    gap: 10,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.error,
    backgroundColor: '#FDF3F2',
  },
  noticeText: {
    fontSize: 15,
    lineHeight: 21,
  },
  counter: {
    fontSize: 13,
    textAlign: 'right',
  },
  powered: {
    marginTop: 'auto',
    paddingTop: Spacing.four,
    textAlign: 'center',
    fontSize: 10,
  },
});

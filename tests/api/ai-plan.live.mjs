// Live check of the deployed `generate` Edge Function on a TEST project. It calls Claude, so it
// costs a few cents. It creates a throwaway creator, asks for a plan and a task suggestion,
// checks their shape, prints them for a human to judge, and deletes the creator.
//
//   TAVIE_TEST_SUPABASE_URL=... TAVIE_TEST_SUPABASE_ANON_KEY=... \
//   TAVIE_TEST_SUPABASE_SERVICE_ROLE_KEY=... node tests/api/ai-plan.live.mjs [outline-file]

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { createClient } from '@supabase/supabase-js';

const URL_ = process.env.TAVIE_TEST_SUPABASE_URL;
const ANON = process.env.TAVIE_TEST_SUPABASE_ANON_KEY;
const SERVICE = process.env.TAVIE_TEST_SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) throw new Error('Set the TAVIE_TEST_SUPABASE_* variables.');

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, SERVICE, options);
const email = `tavie-ai-${randomUUID().slice(0, 8)}@example.com`;
const password = `T-${randomUUID()}`;
const outline = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : '';

const { data: created, error: createError } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});
if (createError) throw createError;
try {
  const c = createClient(URL_, ANON, options);
  assert.equal((await c.auth.signInWithPassword({ email, password })).error, null);
  assert.equal((await c.rpc('register_creator', { first_name: 'Live', last_name: 'Test' })).error, null);

  const goal = 'Help students close their first wholesale deal';
  let t = Date.now();
  const plan = await c.functions.invoke('generate', { body: { mode: 'plan', goal, weeks: 8, outline } });
  if (plan.error) throw new Error(`plan: ${await plan.error.context?.text?.()}`);
  console.log(`Plan in ${((Date.now() - t) / 1000).toFixed(1)}s, draft=${plan.data.draft}`);
  const ms = plan.data.plan.milestones;
  assert.ok(ms.length >= 1 && ms.length <= 10, '1 to 10 milestones');
  for (const m of ms) {
    assert.ok(m.tasks.length <= 5, 'up to 5 tasks');
    console.log(`\n## ${m.title}\n${m.description ?? ''}`);
    for (const k of m.tasks) {
      const how = k.completion_type === 'count' ? `count ${k.target_count} ${k.unit ?? ''}` : k.completion_type;
      console.log(`- ${k.title}  [${how}; ${k.est_minutes} min${k.is_optional ? '; optional' : ''}]`);
      console.log(`    why: ${k.why}`);
      if (k.check_in_question) console.log(`    asks: ${k.check_in_question}`);
      if (k.follow_up_question)
        console.log(
          `    then: ${k.follow_up_question} ${k.follow_up_options ? JSON.stringify(k.follow_up_options) : ''}`,
        );
    }
  }

  t = Date.now();
  const task = await c.functions.invoke('generate', {
    body: { mode: 'task', goal, milestone: ms[0].title, sentence: 'have them call 50 motivated sellers this week' },
  });
  if (task.error) throw new Error(`task: ${await task.error.context?.text?.()}`);
  console.log(`\nTask in ${((Date.now() - t) / 1000).toFixed(1)}s:`, JSON.stringify(task.data.task, null, 2));

  // Nothing was saved by either call.
  assert.deepEqual((await c.from('programs').select('id')).data, []);
  console.log('\nOK: nothing saved, shapes valid.');
} finally {
  await admin.auth.admin.deleteUser(created.user.id);
}

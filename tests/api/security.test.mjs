// End-to-end security tests against a real Supabase project, through the same
// HTTP APIs the app uses (REST, RPC, Storage) with real signed-in users.
//
// Use a TEST project only. It creates and deletes users and data.
//
//   TAVIE_TEST_SUPABASE_URL=... TAVIE_TEST_SUPABASE_ANON_KEY=... \
//   TAVIE_TEST_SUPABASE_SERVICE_ROLE_KEY=... npm run test:api

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';

import { createClient } from '@supabase/supabase-js';

const URL_ = process.env.TAVIE_TEST_SUPABASE_URL;
const ANON = process.env.TAVIE_TEST_SUPABASE_ANON_KEY;
const SERVICE = process.env.TAVIE_TEST_SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) {
  throw new Error('Set TAVIE_TEST_SUPABASE_URL, TAVIE_TEST_SUPABASE_ANON_KEY and TAVIE_TEST_SUPABASE_SERVICE_ROLE_KEY.');
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, SERVICE, options);
const anon = createClient(URL_, ANON, options);
const run = randomUUID().slice(0, 8);
const password = `T-${randomUUID()}`;
const users = {};
const ids = {};

async function makeUser(key, metadata = {}) {
  const email = `tavie-test-${run}-${key}@example.com`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: metadata });
  if (error) throw error;
  const client = createClient(URL_, ANON, options);
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  users[key] = { id: data.user.id, email, client };
  return users[key];
}

/** Expects a refusal: an error, or (for filtered reads and writes) no rows. */
function refused({ error, data }, message) {
  assert.ok(error || (Array.isArray(data) && data.length === 0) || data === null, message);
}

before(async () => {
  await makeUser('A');
  await makeUser('B');
  await makeUser('S');
  await makeUser('N', { role: 'creator' }); // tampered metadata, no row

  for (const [key, first, last] of [
    ['A', 'Marcus', `Reed ${run}`],
    ['B', 'Ana', `Diaz ${run}`],
  ]) {
    const { error } = await users[key].client.rpc('register_creator', { first_name: first, last_name: last });
    if (error) throw error;
  }
  const s = await users.S.client.rpc('register_student');
  if (s.error) throw s.error;

  const pa = await users.A.client.rpc('create_program', { goal: 'Get your first property under contract', duration_weeks: 8 });
  if (pa.error) throw pa.error;
  ids.progA = pa.data.id;
  ids.slugA = pa.data.slug;
  const pb = await users.B.client.rpc('create_program', { goal: 'Make your first sale', duration_weeks: 6 });
  if (pb.error) throw pb.error;
  ids.progB = pb.data.id;
  ids.slugB = pb.data.slug;

  const mB = await users.B.client.from('milestones').insert({ program_id: ids.progB, position: 0, title: 'B milestone' }).select().single();
  if (mB.error) throw mB.error;
  ids.mB = mB.data.id;
  const tB = await users.B.client.from('tasks').insert({ milestone_id: ids.mB, position: 0, title: 'B task', why: 'B why' }).select().single();
  if (tB.error) throw tB.error;
  ids.tB = tB.data.id;
  const mA = await users.A.client.from('milestones').insert({ program_id: ids.progA, position: 0, title: 'A milestone' }).select().single();
  if (mA.error) throw mA.error;
  ids.mA = mA.data.id;
});

after(async () => {
  for (const u of Object.values(users)) {
    const { data } = await admin.storage.from('program-files').list(u.id, { limit: 100 });
    for (const folder of data ?? []) {
      const inner = await admin.storage.from('program-files').list(`${u.id}/${folder.name}`, { limit: 100 });
      const paths = (inner.data ?? []).map((f) => `${u.id}/${folder.name}/${f.name}`);
      if (paths.length) await admin.storage.from('program-files').remove(paths);
    }
    // Deleting the login deletes the creator or student row and everything under it.
    await admin.auth.admin.deleteUser(u.id);
  }
});

describe('logged-out callers', () => {
  for (const table of ['creators', 'students', 'programs', 'milestones', 'tasks', 'resources', 'task_resources']) {
    test(`cannot read ${table}`, async () => {
      refused(await anon.from(table).select('*').limit(1), `anon read ${table}`);
    });
  }

  test('cannot call any function except get_join_info', async () => {
    assert.ok((await anon.rpc('register_creator', { first_name: 'Eve', last_name: '' })).error);
    assert.ok((await anon.rpc('register_student')).error);
    assert.ok((await anon.rpc('create_program', { goal: 'Sneaky goal', duration_weeks: 4 })).error);
    assert.ok((await anon.rpc('publish_program', { program_id: ids.progB })).error);
    assert.ok((await anon.rpc('reorder_milestones', { program_id: ids.progB, ids: [ids.mB] })).error);
  });

  test('cannot reach the private helper functions', async () => {
    assert.ok((await anon.schema('private').rpc('require_user')).error);
    assert.ok((await users.A.client.schema('private').rpc('owns_program_folder', { object_name: 'x' })).error);
  });
});

describe('roles', () => {
  test('a signed-in user with "creator" in their metadata but no row gets nothing', async () => {
    const n = users.N.client;
    assert.deepEqual((await n.from('creators').select('*')).data, []);
    assert.deepEqual((await n.from('programs').select('*')).data, []);
    assert.ok((await n.rpc('create_program', { goal: 'Sneaky goal', duration_weeks: 4 })).error);
    assert.ok((await n.from('creators').insert({ id: users.N.id, first_name: 'Eve', email: users.N.email })).error);
  });

  test('a creator cannot change their own email', async () => {
    assert.ok((await users.A.client.from('creators').update({ email: 'x@example.com' }).eq('id', users.A.id)).error);
  });

  test('a student cannot create a program or read creator data', async () => {
    const s = users.S.client;
    assert.ok((await s.rpc('create_program', { goal: 'Student goal', duration_weeks: 4 })).error);
    assert.deepEqual((await s.from('creators').select('*')).data, []);
    assert.deepEqual((await s.from('programs').select('*')).data, []);
  });
});

describe('creator isolation', () => {
  test('creator A sees only their own program', async () => {
    const { data } = await users.A.client.from('programs').select('id');
    assert.deepEqual(
      data.map((r) => r.id),
      [ids.progA],
    );
  });

  test("creator A cannot change or delete creator B's program", async () => {
    refused(await users.A.client.from('programs').update({ title: 'Hijacked' }).eq('id', ids.progB).select());
    refused(await users.A.client.from('programs').delete().eq('id', ids.progB).select());
    const still = await admin.from('programs').select('title').eq('id', ids.progB).single();
    assert.equal(still.data.title, 'Make your first sale');
  });

  test('a program cannot be made live by editing it', async () => {
    assert.ok((await users.A.client.from('programs').update({ status: 'live' }).eq('id', ids.progA)).error);
    assert.ok((await users.A.client.from('programs').update({ creator_id: users.B.id }).eq('id', ids.progA)).error);
  });

  test("creator A cannot add to or read creator B's milestones and tasks", async () => {
    assert.ok((await users.A.client.from('milestones').insert({ program_id: ids.progB, position: 5, title: 'Sneaky' })).error);
    assert.ok((await users.A.client.from('tasks').insert({ milestone_id: ids.mB, position: 5, title: 'Sneaky' })).error);
    assert.deepEqual((await users.A.client.from('milestones').select('*').eq('id', ids.mB)).data, []);
    assert.deepEqual((await users.A.client.from('tasks').select('*').eq('id', ids.tB)).data, []);
    refused(await users.A.client.from('tasks').update({ title: 'Hijacked' }).eq('id', ids.tB).select());
  });

  test("creator A cannot reorder or publish creator B's program", async () => {
    assert.ok((await users.A.client.rpc('reorder_milestones', { program_id: ids.progB, ids: [ids.mB] })).error);
    assert.ok((await users.A.client.rpc('publish_program', { program_id: ids.progB })).error);
  });
});

describe('publishing and join links', () => {
  test('publish refuses an incomplete program and lists what is missing', async () => {
    const { data, error } = await users.A.client.rpc('publish_program', { program_id: ids.progA });
    assert.equal(error, null);
    assert.equal(data.ok, false);
    assert.ok(data.problems.some((p) => p.code === 'agent_name'));
    assert.ok(data.problems.some((p) => p.code === 'empty_milestone'));
  });

  test('a draft is invisible through its join link', async () => {
    const { data } = await anon.rpc('get_join_info', { slug: ids.slugA });
    assert.deepEqual(data, []);
  });

  test('a complete program goes live and its join link shows only public fields', async () => {
    await users.B.client.from('creators').update({ agent_name: "Ana's agent" }).eq('id', users.B.id);
    const pub = await users.B.client.rpc('publish_program', { program_id: ids.progB });
    assert.equal(pub.error, null);
    assert.equal(pub.data.ok, true);
    const { data } = await anon.rpc('get_join_info', { slug: ids.slugB });
    assert.equal(data.length, 1);
    assert.deepEqual(Object.keys(data[0]).sort(), ['agent_name', 'creator_first_name', 'creator_last_name', 'goal', 'title']);
  });
});

describe('file storage', () => {
  const pdf = new Blob(['%PDF-1.4\n%test\n'], { type: 'application/pdf' });

  test("a creator can upload a PDF into their own program's folder", async () => {
    const { error } = await users.A.client.storage.from('program-files').upload(`${users.A.id}/${ids.progA}/script.pdf`, pdf, {
      contentType: 'application/pdf',
    });
    assert.equal(error, null);
  });

  test("a creator cannot upload into another creator's folder or program", async () => {
    const bucket = users.A.client.storage.from('program-files');
    assert.ok((await bucket.upload(`${users.B.id}/${ids.progB}/x.pdf`, pdf, { contentType: 'application/pdf' })).error);
    assert.ok((await bucket.upload(`${users.A.id}/${ids.progB}/x.pdf`, pdf, { contentType: 'application/pdf' })).error);
    assert.ok((await bucket.upload(`${users.B.id}/${ids.progA}/x.pdf`, pdf, { contentType: 'application/pdf' })).error);
  });

  test('only PDFs are accepted', async () => {
    const html = new Blob(['<script>alert(1)</script>'], { type: 'text/html' });
    const { error } = await users.A.client.storage
      .from('program-files')
      .upload(`${users.A.id}/${ids.progA}/page.html`, html, { contentType: 'text/html' });
    assert.ok(error);
  });

  test('other creators, students, and logged-out users cannot read the file', async () => {
    const path = `${users.A.id}/${ids.progA}/script.pdf`;
    assert.ok((await users.B.client.storage.from('program-files').download(path)).error);
    assert.ok((await users.S.client.storage.from('program-files').download(path)).error);
    assert.ok((await anon.storage.from('program-files').download(path)).error);
    assert.equal((await users.A.client.storage.from('program-files').download(path)).error, null);
  });

  test('the bucket has no public links', async () => {
    const { data } = anon.storage.from('program-files').getPublicUrl(`${users.A.id}/${ids.progA}/script.pdf`);
    const res = await fetch(data.publicUrl);
    assert.notEqual(res.status, 200);
  });

  test('another creator cannot delete the file', async () => {
    const path = `${users.A.id}/${ids.progA}/script.pdf`;
    await users.B.client.storage.from('program-files').remove([path]);
    assert.equal((await users.A.client.storage.from('program-files').download(path)).error, null);
  });
});

// The creator builder's calls (src/lib/builder.ts), end to end, as a fresh creator.
describe('creator builder', () => {
  let c;
  let progId;
  const m = {};

  before(async () => {
    c = (await makeUser('C')).client;
    const reg = await c.rpc('register_creator', { first_name: 'Cara', last_name: `Builder ${run}` });
    if (reg.error) throw reg.error;
  });

  test('creates a program, milestones, and every kind of task', async () => {
    const p = await c.rpc('create_program', { goal: 'Get your first property under contract', duration_weeks: 8 });
    assert.equal(p.error, null);
    progId = p.data.id;
    for (const [key, position, title] of [
      ['m1', 0, 'Find a market'],
      ['m2', 1, 'Make offers'],
      ['m3', 2, 'Spare'],
    ]) {
      const r = await c.from('milestones').insert({ program_id: progId, position, title }).select('id').single();
      assert.equal(r.error, null);
      m[key] = r.data.id;
    }
    const tasks = await c
      .from('tasks')
      .insert(
        [
        { milestone_id: m.m1, position: 0, title: 'Watch lesson 1', why: 'Basics first.', completion_type: 'done' },
        {
          milestone_id: m.m1,
          position: 1,
          title: 'Call 50 sellers',
          why: 'Deals come from conversations.',
          completion_type: 'count',
          check_in_question: 'How many calls did you make?',
          target_count: 50,
          unit: 'calls',
          follow_up_question: 'How did it go?',
          follow_up_options: ['Wants to sell', 'Not motivated'],
          est_minutes: 90,
        },
        { milestone_id: m.m2, position: 0, title: 'Submit an offer', why: 'Offers make deals.', completion_type: 'yes_no', check_in_question: 'Did you submit it?' },
        { milestone_id: m.m2, position: 1, title: 'Pick a zip', why: 'Focus wins.', completion_type: 'text', check_in_question: 'Which zip and why?', is_optional: true },
        ],
        // Rows list different columns; let missing ones take their defaults instead of null.
        { defaultToNull: false },
      )
      .select('id, completion_type');
    assert.equal(tasks.error, null);
    m.tasks = tasks.data;
    const noTarget = await c.from('tasks').insert({ milestone_id: m.m2, position: 5, title: 'Bad', completion_type: 'count' });
    assert.ok(noTarget.error, 'a number task needs a target');
  });

  test('attaches resources to a task and replaces them on save', async () => {
    const r = await c
      .from('resources')
      .insert({ program_id: progId, type: 'youtube', title: 'Lesson 4', url: 'https://youtu.be/abc' })
      .select('id')
      .single();
    assert.equal(r.error, null);
    const taskId = m.tasks[0].id;
    assert.equal((await c.from('task_resources').delete().eq('task_id', taskId)).error, null);
    assert.equal((await c.from('task_resources').insert([{ task_id: taskId, resource_id: r.data.id, position: 0 }])).error, null);
    const links = await c.from('task_resources').select('resource_id').eq('task_id', taskId);
    assert.deepEqual(links.data, [{ resource_id: r.data.id }]);
  });

  test('reorders and archives milestones, and the order sticks', async () => {
    assert.equal((await c.from('milestones').update({ archived_at: new Date().toISOString() }).eq('id', m.m3)).error, null);
    const re = await c.rpc('reorder_milestones', { program_id: progId, ids: [m.m2, m.m1, m.m3] });
    assert.equal(re.error, null);
    const rows = await c.from('milestones').select('id').eq('program_id', progId).order('position');
    assert.deepEqual(
      rows.data.map((x) => x.id),
      [m.m2, m.m1, m.m3],
    );
  });

  test('the programs list counts only active milestones and tasks', async () => {
    const { data, error } = await c
      .from('programs')
      .select('id, status, milestones(id, archived_at, tasks(id, archived_at))')
      .order('updated_at', { ascending: false });
    assert.equal(error, null);
    assert.equal(data.length, 1);
    const active = data[0].milestones.filter((x) => !x.archived_at);
    assert.equal(active.length, 2);
    assert.equal(active.reduce((n, x) => n + x.tasks.length, 0), 4);
  });

  test("another creator can't see or change any of it", async () => {
    const b = users.B.client;
    assert.deepEqual((await b.from('milestones').select('id').eq('program_id', progId)).data, []);
    refused(await b.from('tasks').update({ title: 'Hijacked' }).eq('id', m.tasks[0].id).select());
    refused(await b.from('programs').update({ goal: 'Hijacked goal' }).eq('id', progId).select());
    assert.ok((await b.rpc('publish_program', { program_id: progId })).error);
  });

  test('publishes once the agent is named, and the join link shows it', async () => {
    const first = await c.rpc('publish_program', { program_id: progId });
    assert.equal(first.data.ok, false);
    assert.deepEqual(
      first.data.problems.map((p) => p.code),
      ['agent_name'],
    );
    assert.equal((await c.from('creators').update({ agent_name: "Cara's agent" }).eq('id', users.C.id)).error, null);
    const pub = await c.rpc('publish_program', { program_id: progId });
    assert.equal(pub.data.ok, true);
    const slug = (await c.from('programs').select('slug').eq('id', progId).single()).data.slug;
    const join = await anon.rpc('get_join_info', { slug });
    assert.equal(join.data[0].agent_name, "Cara's agent");
  });
});

describe('AI plan generator limits and plan import', () => {
  let d; // creator D, so other tests' limits and programs aren't touched
  let progId;
  const plan = [
    {
      title: 'Find your market',
      description: 'Pick where you will buy.',
      tasks: [
        { title: 'Pick one zip code', why: 'Focus wins.', completion_type: 'text', check_in_question: 'Which zip and why?', est_minutes: 45 },
        {
          title: 'Call 50 sellers',
          why: 'Deals come from conversations.',
          completion_type: 'count',
          check_in_question: 'How many calls did you make?',
          target_count: 50,
          unit: 'calls',
          follow_up_question: 'How did it go?',
          follow_up_options: ['Wants to sell', 'Not motivated'],
          est_minutes: 120,
          is_optional: false,
        },
      ],
    },
    { title: 'Make offers', tasks: [{ title: 'Submit one offer', why: 'Offers make deals.', completion_type: 'yes_no', check_in_question: 'Did you submit it?' }] },
  ];

  before(async () => {
    d = (await makeUser('D')).client;
    assert.equal((await d.rpc('register_creator', { first_name: 'Dee', last_name: `Cole ${run}` })).error, null);
    const p = await d.rpc('create_program', { goal: 'Help students close their first wholesale deal', duration_weeks: 8 });
    assert.equal(p.error, null);
    progId = p.data.id;
  });

  test('logged-out users and students cannot start an AI request', async () => {
    assert.ok((await anon.rpc('start_ai_request', { kind: 'plan' })).error);
    assert.equal((await users.S.client.rpc('start_ai_request', { kind: 'plan' })).error?.code, '42501');
    assert.equal((await users.N.client.rpc('start_ai_request', { kind: 'plan' })).error?.code, '42501');
  });

  test('one request at a time, failed requests are free, and 5 plans a day', async () => {
    const first = await d.rpc('start_ai_request', { kind: 'plan' });
    assert.equal(first.error, null);
    assert.equal((await d.rpc('start_ai_request', { kind: 'task' })).error?.code, '55P03');
    // Another creator can't finish it for them.
    assert.equal((await users.A.client.rpc('finish_ai_request', { request_id: first.data, reached_ai: false })).error, null);
    assert.equal((await d.rpc('start_ai_request', { kind: 'task' })).error?.code, '55P03');
    assert.equal((await d.rpc('finish_ai_request', { request_id: first.data, reached_ai: false })).error, null);

    for (let i = 0; i < 5; i++) {
      const r = await d.rpc('start_ai_request', { kind: 'plan' });
      assert.equal(r.error, null, `plan ${i + 1}`);
      assert.equal((await d.rpc('finish_ai_request', { request_id: r.data, reached_ai: true })).error, null);
    }
    assert.equal((await d.rpc('start_ai_request', { kind: 'plan' })).error?.code, '54000');
    // Task suggestions have their own limit.
    const t = await d.rpc('start_ai_request', { kind: 'task' });
    assert.equal(t.error, null);
    await d.rpc('finish_ai_request', { request_id: t.data, reached_ai: true });
  });

  test('parallel requests cannot slip past the one-at-a-time rule', async () => {
    const results = await Promise.all(Array.from({ length: 5 }, () => d.rpc('start_ai_request', { kind: 'task' })));
    const started = results.filter((r) => !r.error);
    assert.equal(started.length, 1);
    assert.ok(results.filter((r) => r.error).every((r) => r.error.code === '55P03'));
    await d.rpc('finish_ai_request', { request_id: started[0].data, reached_ai: true });
  });

  test('the usage table is closed to everyone but those functions', async () => {
    refused(await d.from('ai_requests').select('*'));
    assert.ok((await d.from('ai_requests').insert({ creator_id: users.D.id, kind: 'plan' })).error);
  });

  test('an approved plan saves into the creator’s own draft, and the program stays a draft', async () => {
    const r = await d.rpc('import_plan', { program_id: progId, milestones: plan });
    assert.equal(r.error, null);
    assert.equal(r.data, 3);
    const ms = await d.from('milestones').select('title, position, tasks(title, completion_type, target_count, follow_up_options)').eq('program_id', progId).order('position');
    assert.deepEqual(ms.data.map((m) => [m.title, m.tasks.length]), [['Find your market', 2], ['Make offers', 1]]);
    const calls = ms.data[0].tasks.find((t) => t.title === 'Call 50 sellers');
    assert.deepEqual(calls.follow_up_options, ['Wants to sell', 'Not motivated']);
    assert.equal((await d.from('programs').select('status').eq('id', progId).single()).data.status, 'draft');
  });

  test("a plan can't go into another creator's program, and bad plans save nothing", async () => {
    assert.ok((await users.A.client.rpc('import_plan', { program_id: progId, milestones: plan })).error);
    assert.ok((await users.S.client.rpc('import_plan', { program_id: progId, milestones: plan })).error);
    const tooMany = Array.from({ length: 11 }, (_, i) => ({ title: `M${i}`, tasks: [] }));
    assert.equal((await d.rpc('import_plan', { program_id: progId, milestones: tooMany })).error?.code, '22023');
    const bad = [{ title: 'Bad', tasks: [{ title: 'Count with no target', completion_type: 'count' }] }];
    assert.ok((await d.rpc('import_plan', { program_id: progId, milestones: bad })).error);
    assert.deepEqual((await d.from('milestones').select('id').eq('title', 'Bad')).data, []);
  });
});

describe('students: invite, enrollment, Today, and check-ins', () => {
  let e; // creator with a live program
  let j; // student who joins
  let slug;
  let enrollment;
  const t = {};

  before(async () => {
    e = (await makeUser('E')).client;
    assert.equal((await e.rpc('register_creator', { first_name: 'Eve', last_name: `Stone ${run}` })).error, null);
    assert.equal((await e.from('creators').update({ agent_name: "Eve's agent" }).eq('id', users.E.id)).error, null);
    const p = await e.rpc('create_program', { goal: 'Close your first wholesale deal', duration_weeks: 8 });
    assert.equal(p.error, null);
    slug = p.data.slug;
    const m = await e.from('milestones').insert({ program_id: p.data.id, position: 0, title: 'Get started' }).select().single();
    assert.equal(m.error, null);
    const rows = [
      { milestone_id: m.data.id, position: 0, title: 'Watch the welcome lesson', why: 'It shows the path.' },
      {
        milestone_id: m.data.id,
        position: 1,
        title: 'Call 50 sellers',
        why: 'Deals come from conversations.',
        completion_type: 'count',
        target_count: 50,
        unit: 'calls',
        check_in_question: 'How many calls?',
      },
    ];
    const tasks = await e.from('tasks').insert(rows, { defaultToNull: false }).select('id, position').order('position');
    assert.equal(tasks.error, null);
    [t.first, t.count] = tasks.data.map((x) => x.id);
    const pub = await e.rpc('publish_program', { program_id: p.data.id });
    assert.equal(pub.data?.ok, true, JSON.stringify(pub));

    j = (await makeUser('J')).client;
    assert.equal((await j.rpc('register_student')).error, null);
  });

  test('the invite shows the program title and creator before sign-in', async () => {
    const info = await anon.rpc('get_join_info', { slug });
    assert.equal(info.error, null);
    assert.equal(info.data[0].title, 'Close your first wholesale deal');
    assert.equal(info.data[0].creator_first_name, 'Eve');
  });

  test('joining creates one enrollment linked to that program and shows the first task', async () => {
    const r = await j.rpc('join_program', { slug });
    assert.equal(r.error, null);
    enrollment = r.data.enrollment_id;
    assert.equal(r.data.task.id, t.first);
    assert.equal(r.data.program.title, 'Close your first wholesale deal');
    const row = await admin.from('enrollments').select('student_id, program_id, programs(slug)').eq('id', enrollment).single();
    assert.equal(row.data.student_id, users.J.id);
    assert.equal(row.data.programs.slug, slug);
    assert.equal((await j.rpc('join_program', { slug })).data.enrollment_id, enrollment);
    assert.equal((await admin.from('enrollments').select('id').eq('student_id', users.J.id)).data.length, 1);
  });

  test('check-ins save, partial counts persist, and done moves to the next task', async () => {
    const done = await j.rpc('submit_check_in', { enrollment_id: enrollment, task_id: t.first, kind: 'complete', client_request_id: randomUUID() });
    assert.equal(done.error, null);
    assert.equal(done.data.today.task.id, t.count);
    const part = await j.rpc('submit_check_in', { enrollment_id: enrollment, task_id: t.count, kind: 'progress', value_number: 20, client_request_id: randomUUID() });
    assert.equal(part.data.today.task.count_so_far, 20);
    // A fresh read (like reopening the app) shows the same saved progress.
    const today = await j.rpc('get_today');
    assert.equal(today.data.task.id, t.count);
    assert.equal(today.data.task.count_so_far, 20);
    const stuck = await j.rpc('submit_check_in', { enrollment_id: enrollment, task_id: t.count, kind: 'stuck', reason: "I don't know how" });
    assert.equal(stuck.data.today.task.state, 'stuck');
    const rest = await j.rpc('submit_check_in', { enrollment_id: enrollment, task_id: t.count, kind: 'progress', value_number: 30 });
    assert.equal(rest.data.state, 'done');
    assert.equal(rest.data.today.task, null);
    const log = await admin.from('check_ins').select('kind').eq('enrollment_id', enrollment).order('id');
    assert.deepEqual(
      log.data.map((x) => x.kind),
      ['complete', 'progress', 'stuck', 'progress'],
    );
  });

  test("other students and creators can't see or change this student's progress", async () => {
    for (const client of [users.S.client, users.A.client, e]) {
      refused(await client.from('enrollments').select('*'));
      refused(await client.from('check_ins').select('*'));
      refused(await client.from('task_progress').select('*'));
      assert.ok((await client.rpc('submit_check_in', { enrollment_id: enrollment, task_id: t.count, kind: 'progress', value_number: 1 })).error);
    }
    refused(await anon.from('enrollments').select('*'));
    // Joining doesn't open the program tables to the student.
    assert.deepEqual((await j.from('tasks').select('id')).data ?? [], []);
    assert.deepEqual((await j.from('creators').select('email')).data ?? [], []);
  });
});

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
    assert.deepEqual(Object.keys(data[0]).sort(), ['agent_name', 'creator_first_name', 'creator_last_name', 'goal']);
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

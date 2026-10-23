// Database security tests for the PR 1 migration.
//
// Runs every migration in supabase/migrations on a throwaway Postgres database,
// then acts as each kind of caller (logged out, two creators, a student, a
// signed-in user with no role) and checks what the database allows.
//
//   DATABASE_URL=postgres://postgres@127.0.0.1:54329/postgres npm run test:db

import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, before, describe, test } from 'node:test';

import pg from 'pg';

const ROOT = new URL('../../', import.meta.url).pathname;
const ADMIN_URL = process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:54329/postgres';
const TEST_DB = 'tavie_security_test';

const A = { id: randomUUID(), email: 'marcus@example.com' }; // creator
const B = { id: randomUUID(), email: 'ana@example.com' }; // another creator
const S = { id: randomUUID(), email: 'jasmine@example.com' }; // student
const N = { id: randomUUID(), email: 'nobody@example.com', meta: { role: 'creator' } }; // no role, tampered metadata
const X = { id: randomUUID(), email: null, anonymous: true }; // anonymous sign-in

let db;
const ids = {};

/** Runs SQL as a caller, inside a transaction that is rolled back unless `commit`. */
async function as(who, sql, params = [], { commit = false } = {}) {
  await db.query('begin');
  try {
    if (who === 'anon') {
      await db.query('set local role anon');
    } else if (who !== 'postgres') {
      await db.query('set local role authenticated');
      const claims = {
        sub: who.id,
        role: 'authenticated',
        email: who.email,
        is_anonymous: Boolean(who.anonymous),
        user_metadata: who.meta ?? {},
      };
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify(claims)]);
    }
    const result = await db.query(sql, params);
    await db.query(commit ? 'commit' : 'rollback');
    return result;
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}

const denied = (promise) => assert.rejects(promise, (e) => e.code === '42501', 'expected a permission refusal');
// A link across creators may be stopped by the same-program check or by the policy; either way it is refused.
const refused = (promise) =>
  assert.rejects(promise, (e) => e.code === '42501' || e.code === '23514', 'expected the database to refuse');
const invalid = (promise, code = '23514') => assert.rejects(promise, (e) => e.code === code, `expected error ${code}`);

before(async () => {
  const admin = new pg.Client({ connectionString: ADMIN_URL });
  await admin.connect();
  await admin.query(`drop database if exists ${TEST_DB} with (force)`);
  await admin.query(`create database ${TEST_DB}`);
  await admin.end();

  const url = new URL(ADMIN_URL);
  url.pathname = `/${TEST_DB}`;
  db = new pg.Client({ connectionString: url.toString() });
  await db.connect();

  await db.query(readFileSync(join(ROOT, 'tests/db/supabase-stub.sql'), 'utf8'));
  const dir = join(ROOT, 'supabase/migrations');
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.query(readFileSync(join(dir, file), 'utf8'));
  }

  for (const u of [A, B, S, N, X]) {
    await db.query('insert into auth.users (id, email, is_anonymous, raw_user_meta_data) values ($1, $2, $3, $4)', [
      u.id,
      u.email,
      Boolean(u.anonymous),
      JSON.stringify(u.meta ?? {}),
    ]);
  }

  // Fixtures, created through the same calls the app will use.
  await as(A, "select public.register_creator('Marcus', 'Reed')", [], { commit: true });
  await as(B, "select public.register_creator('Ana', 'Diaz')", [], { commit: true });
  await as(S, 'select public.register_student()', [], { commit: true });

  const pa = await as(A, "select * from public.create_program('Get your first property under contract', 8)", [], { commit: true });
  ids.progA = pa.rows[0].id;
  ids.slugA = pa.rows[0].slug;
  const pa2 = await as(A, "select * from public.create_program('Second program goal', 4)", [], { commit: true });
  ids.progA2 = pa2.rows[0].id;
  ids.slugA2 = pa2.rows[0].slug;
  const pb = await as(B, "select * from public.create_program('Make your first sale', 6)", [], { commit: true });
  ids.progB = pb.rows[0].id;
  ids.slugB = pb.rows[0].slug;

  const insertMilestone = (who, prog, position, title) =>
    as(who, 'insert into public.milestones (program_id, position, title) values ($1, $2, $3) returning id', [prog, position, title], {
      commit: true,
    }).then((r) => r.rows[0].id);
  ids.mA1 = await insertMilestone(A, ids.progA, 0, 'Understand wholesaling fundamentals');
  ids.mA2 = await insertMilestone(A, ids.progA, 1, 'Identify a target market');
  ids.mA2x = await insertMilestone(A, ids.progA2, 0, 'Other program milestone');
  ids.mB1 = await insertMilestone(B, ids.progB, 0, 'B milestone');

  const insertTask = (who, milestone, position, title, extra = '') =>
    as(
      who,
      `insert into public.tasks (milestone_id, position, title${extra ? ', why' : ''}) values ($1, $2, $3${extra ? ', $4' : ''}) returning id`,
      extra ? [milestone, position, title, extra] : [milestone, position, title],
      { commit: true },
    ).then((r) => r.rows[0].id);
  ids.tA1 = await insertTask(A, ids.mA1, 0, 'Watch the welcome lesson');
  ids.tA2 = await insertTask(A, ids.mA1, 1, 'Explain how a wholesaler gets paid', 'So you can explain it to a seller.');
  ids.tA2x = await insertTask(A, ids.mA2x, 0, 'Task in second program', 'Why');
  ids.tB1 = await insertTask(B, ids.mB1, 0, 'B task', 'B why');

  const insertLink = (who, prog, title) =>
    as(who, "insert into public.resources (program_id, type, title, url) values ($1, 'link', $2, 'https://example.com/a') returning id", [prog, title], {
      commit: true,
    }).then((r) => r.rows[0].id);
  ids.rA = await insertLink(A, ids.progA, 'Seller script');
  ids.rA2 = await insertLink(A, ids.progA2, 'Other program resource');
  ids.rB = await insertLink(B, ids.progB, 'B resource');
  await as(B, 'insert into public.task_resources (task_id, resource_id, position) values ($1, $2, 0)', [ids.tB1, ids.rB], { commit: true });
});

after(async () => {
  await db?.end();
});

describe('database defaults', () => {
  test('every table in public has row-level security on', async () => {
    const { rows } = await as(
      'postgres',
      "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity",
    );
    assert.deepEqual(rows, []);
  });

  test('logged-out users have no privilege on any public table', async () => {
    const { rows } = await as(
      'postgres',
      "select table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' and grantee = 'anon'",
    );
    assert.deepEqual(rows, []);
  });

  test('a table added later starts with no access for anon or signed-in users', async () => {
    await db.query('create table public.zz_probe (id int)');
    try {
      const { rows } = await as(
        'postgres',
        "select grantee from information_schema.role_table_grants where table_name = 'zz_probe' and grantee in ('anon', 'authenticated')",
      );
      assert.deepEqual(rows, []);
    } finally {
      await db.query('drop table public.zz_probe');
    }
  });

  test('a function added later is not executable by anon or signed-in users', async () => {
    await db.query('create function public.zz_probe() returns int language sql as $$ select 1 $$');
    try {
      const { rows } = await as(
        'postgres',
        "select has_function_privilege('anon', 'public.zz_probe()', 'execute') as anon, has_function_privilege('authenticated', 'public.zz_probe()', 'execute') as authed",
      );
      assert.deepEqual(rows[0], { anon: false, authed: false });
    } finally {
      await db.query('drop function public.zz_probe()');
    }
  });

  test('logged-out users can execute only get_join_info', async () => {
    const { rows } = await as(
      'postgres',
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'private') and has_function_privilege('anon', p.oid, 'execute') order by 1`,
    );
    assert.deepEqual(
      rows.map((r) => r.proname),
      ['get_join_info'],
    );
  });

  test('every function with extra rights has a fixed search_path', async () => {
    const { rows } = await as(
      'postgres',
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('public', 'private') and p.prosecdef
          and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')`,
    );
    assert.deepEqual(rows, []);
  });

  test('signed-in users cannot write protected columns', async () => {
    const cases = [
      ['public.creators', 'id'],
      ['public.creators', 'email'],
      ['public.students', 'email'],
      ['public.programs', 'status'],
      ['public.programs', 'slug'],
      ['public.programs', 'creator_id'],
      ['public.programs', 'published_at'],
      ['public.milestones', 'program_id'],
      ['public.tasks', 'milestone_id'],
      ['public.resources', 'program_id'],
      ['public.resources', 'type'],
      ['public.resources', 'file_path'],
      ['public.task_resources', 'task_id'],
      ['public.task_resources', 'resource_id'],
    ];
    for (const [table, column] of cases) {
      const { rows } = await as('postgres', "select has_column_privilege('authenticated', $1, $2, 'UPDATE') as ok", [table, column]);
      assert.equal(rows[0].ok, false, `${table}.${column} should not be updatable`);
    }
    for (const table of ['public.creators', 'public.students', 'public.programs']) {
      const { rows } = await as('postgres', "select has_table_privilege('authenticated', $1, 'INSERT') as ok", [table]);
      assert.equal(rows[0].ok, false, `${table} should not allow direct inserts`);
    }
  });
});

describe('roles come from the database, not metadata', () => {
  test('a signed-in user with no role sees no creator or program data', async () => {
    assert.equal((await as(N, 'select * from public.creators')).rowCount, 0);
    assert.equal((await as(N, 'select * from public.programs')).rowCount, 0);
    assert.equal((await as(N, 'select * from public.milestones')).rowCount, 0);
  });

  test('metadata saying "creator" does not let a user make a program', async () => {
    await denied(as(N, "select public.create_program('A goal here', 4)"));
  });

  test('nobody can insert a creators row directly', async () => {
    await denied(as(N, "insert into public.creators (id, first_name, email) values ($1, 'Eve', 'eve@example.com')", [N.id]));
    await denied(as(N, "insert into public.students (id, email) values ($1, 'eve@example.com')", [N.id]));
  });

  test('logged-out and anonymous sessions cannot register', async () => {
    await denied(as('anon', "select public.register_creator('Eve', '')"));
    await denied(as('anon', 'select public.register_student()'));
    await denied(as(X, "select public.register_creator('Eve', '')"));
    await denied(as(X, 'select public.register_student()'));
  });

  test('register_creator uses the login email and is safe to repeat', async () => {
    const { rows } = await as(N, "select * from public.register_creator('Nina', 'Bell')");
    assert.equal(rows[0].id, N.id);
    assert.equal(rows[0].email, N.email);
    const again = await as(A, "select * from public.register_creator('Marcus', 'Reed')");
    assert.equal(again.rows[0].id, A.id);
    const count = await as('postgres', 'select count(*)::int as n from public.creators where id = $1', [A.id]);
    assert.equal(count.rows[0].n, 1);
  });

  test('register_creator rejects a blank name', async () => {
    await invalid(as(N, "select public.register_creator('   ', '')"));
  });

  test('a creator cannot change their email or id', async () => {
    await denied(as(A, "update public.creators set email = 'other@example.com' where id = $1", [A.id]));
    await denied(as(A, 'update public.creators set id = $2 where id = $1', [A.id, randomUUID()]));
  });

  test('a creator can edit their own name and agent name only', async () => {
    const own = await as(A, "update public.creators set agent_name = 'Marcus''s agent' where id = $1", [A.id]);
    assert.equal(own.rowCount, 1);
    const other = await as(A, "update public.creators set agent_name = 'Hijacked' where id = $1", [B.id]);
    assert.equal(other.rowCount, 0);
  });

  test('creators cannot see each other', async () => {
    const { rows } = await as(A, 'select id from public.creators');
    assert.deepEqual(
      rows.map((r) => r.id),
      [A.id],
    );
  });

  test('a student cannot make a program or see creator data', async () => {
    await denied(as(S, "select public.create_program('Student goal', 4)"));
    assert.equal((await as(S, 'select * from public.creators')).rowCount, 0);
    assert.equal((await as(S, 'select * from public.programs')).rowCount, 0);
    assert.equal((await as(S, 'select * from public.tasks')).rowCount, 0);
    assert.equal((await as(S, 'select * from public.resources')).rowCount, 0);
  });

  test('a student can edit their own first name but not their email', async () => {
    assert.equal((await as(S, "update public.students set first_name = 'Jasmine' where id = $1", [S.id])).rowCount, 1);
    await denied(as(S, "update public.students set email = 'x@example.com' where id = $1", [S.id]));
    assert.equal((await as(A, "update public.students set first_name = 'X' where id = $1", [S.id])).rowCount, 0);
  });
});

describe('programs', () => {
  test('slugs come from the creator name and stay unique', async () => {
    assert.equal(ids.slugA, 'marcus-reed');
    assert.equal(ids.slugA2, 'marcus-reed-2');
    assert.equal(ids.slugB, 'ana-diaz');
  });

  test('a creator sees only their own programs', async () => {
    const { rows } = await as(A, 'select id from public.programs order by created_at');
    assert.deepEqual(
      rows.map((r) => r.id).sort(),
      [ids.progA, ids.progA2].sort(),
    );
  });

  test('programs cannot be inserted directly', async () => {
    await denied(
      as(A, "insert into public.programs (creator_id, title, goal, duration_weeks, slug) values ($1, 't', 'goal', 4, 'sneaky')", [A.id]),
    );
  });

  test('status, slug, and owner cannot be changed directly', async () => {
    await denied(as(A, "update public.programs set status = 'live' where id = $1", [ids.progA]));
    await denied(as(A, "update public.programs set slug = 'taken' where id = $1", [ids.progA]));
    await denied(as(A, 'update public.programs set creator_id = $2 where id = $1', [ids.progA, B.id]));
  });

  test("a creator can edit their own program but not another creator's", async () => {
    assert.equal((await as(A, "update public.programs set title = 'New title' where id = $1", [ids.progA])).rowCount, 1);
    assert.equal((await as(A, "update public.programs set title = 'Hijacked' where id = $1", [ids.progB])).rowCount, 0);
  });

  test("a creator cannot delete another creator's program", async () => {
    assert.equal((await as(A, 'delete from public.programs where id = $1', [ids.progB])).rowCount, 0);
    assert.equal((await as('postgres', 'select 1 from public.programs where id = $1', [ids.progB])).rowCount, 1);
  });

  test('create_program checks its inputs', async () => {
    await invalid(as(A, "select public.create_program('ab', 4)"));
    await invalid(as(A, "select public.create_program('A fine goal', 0)"));
    await invalid(as(A, "select public.create_program('A fine goal', 53)"));
    await invalid(as(A, 'select public.create_program(null, 4)'));
  });
});

describe('milestones, tasks, and resources', () => {
  test("a creator cannot add a milestone to another creator's program", async () => {
    await denied(as(A, "insert into public.milestones (program_id, position, title) values ($1, 5, 'Sneaky')", [ids.progB]));
  });

  test("a creator cannot read or change another creator's milestones", async () => {
    assert.equal((await as(A, 'select * from public.milestones where id = $1', [ids.mB1])).rowCount, 0);
    assert.equal((await as(A, "update public.milestones set title = 'Hijacked' where id = $1", [ids.mB1])).rowCount, 0);
    assert.equal((await as(A, 'delete from public.milestones where id = $1', [ids.mB1])).rowCount, 0);
  });

  test('a milestone cannot be moved to another program', async () => {
    await denied(as(A, 'update public.milestones set program_id = $2 where id = $1', [ids.mA1, ids.progB]));
  });

  test("a creator cannot add a task to another creator's milestone", async () => {
    await denied(as(A, "insert into public.tasks (milestone_id, position, title) values ($1, 5, 'Sneaky')", [ids.mB1]));
  });

  test("a creator cannot read or change another creator's tasks", async () => {
    assert.equal((await as(A, 'select * from public.tasks where id = $1', [ids.tB1])).rowCount, 0);
    assert.equal((await as(A, "update public.tasks set title = 'Hijacked' where id = $1", [ids.tB1])).rowCount, 0);
    assert.equal((await as(A, 'delete from public.tasks where id = $1', [ids.tB1])).rowCount, 0);
  });

  test('a task cannot be moved to another milestone', async () => {
    await denied(as(A, 'update public.tasks set milestone_id = $2 where id = $1', [ids.tA1, ids.mB1]));
  });

  test('task report settings are checked', async () => {
    await invalid(as(A, "insert into public.tasks (milestone_id, position, title, completion_type) values ($1, 9, 'Calls', 'count')", [ids.mA1]));
    await invalid(
      as(A, "insert into public.tasks (milestone_id, position, title, follow_up_options) values ($1, 9, 'X', array['Yes','No'])", [ids.mA1]),
    );
    await invalid(
      as(
        A,
        "insert into public.tasks (milestone_id, position, title, follow_up_question, follow_up_options) values ($1, 9, 'X', 'How?', array['a','b','c','d','e'])",
        [ids.mA1],
      ),
    );
    await invalid(as(A, "insert into public.tasks (milestone_id, position, title, completion_type) values ($1, 9, 'X', 'photo')", [ids.mA1]));
    const ok = await as(
      A,
      "insert into public.tasks (milestone_id, position, title, completion_type, target_count, unit, check_in_question) values ($1, 9, 'Call 50 sellers', 'count', 50, 'calls', 'How many calls did you make?')",
      [ids.mA1],
    );
    assert.equal(ok.rowCount, 1);
  });

  test('two items cannot share a position', async () => {
    // Positions are checked at commit so reorders can swap; force the check now.
    await invalid(
      as(A, `set constraints all immediate; insert into public.milestones (program_id, position, title) values ('${ids.progA}', 0, 'Clash')`),
      '23505',
    );
  });

  test("a creator cannot add a resource to another creator's program", async () => {
    await denied(
      as(A, "insert into public.resources (program_id, type, title, url) values ($1, 'link', 'Sneaky', 'https://example.com')", [ids.progB]),
    );
    assert.equal((await as(A, 'select * from public.resources where id = $1', [ids.rB])).rowCount, 0);
  });

  test('resource links are checked', async () => {
    await invalid(
      as(A, "insert into public.resources (program_id, type, title, url) values ($1, 'youtube', 'Not YouTube', 'https://evil.example.com/watch')", [
        ids.progA,
      ]),
    );
    await invalid(as(A, "insert into public.resources (program_id, type, title, url) values ($1, 'link', 'Plain http', 'http://example.com')", [ids.progA]));
    await invalid(as(A, "insert into public.resources (program_id, type, title, url) values ($1, 'link', 'Script', 'javascript:alert(1)')", [ids.progA]));
    const yt = await as(
      A,
      "insert into public.resources (program_id, type, title, url) values ($1, 'youtube', 'Lesson 4', 'https://www.youtube.com/watch?v=abc')",
      [ids.progA],
    );
    assert.equal(yt.rowCount, 1);
  });

  test("a file resource must point into the creator's own folder for that program", async () => {
    const insertFile = (path) =>
      as(A, "insert into public.resources (program_id, type, title, file_path) values ($1, 'file', 'PDF', $2)", [ids.progA, path]);
    await denied(insertFile(`${B.id}/${ids.progA}/script.pdf`));
    await denied(insertFile(`${A.id}/${ids.progA2}/script.pdf`));
    await denied(insertFile('script.pdf'));
    assert.equal((await insertFile(`${A.id}/${ids.progA}/script.pdf`)).rowCount, 1);
  });

  test("a creator cannot link another creator's resource to their task", async () => {
    await refused(as(A, 'insert into public.task_resources (task_id, resource_id, position) values ($1, $2, 0)', [ids.tA1, ids.rB]));
  });

  test("a creator cannot link a resource to another creator's task", async () => {
    await refused(as(A, 'insert into public.task_resources (task_id, resource_id, position) values ($1, $2, 1)', [ids.tB1, ids.rA]));
  });

  test("a task can only use resources from its own program", async () => {
    await invalid(as(A, 'insert into public.task_resources (task_id, resource_id, position) values ($1, $2, 0)', [ids.tA1, ids.rA2]));
  });

  test('a task holds at most three resources', async () => {
    await invalid(as(A, 'insert into public.task_resources (task_id, resource_id, position) values ($1, $2, 3)', [ids.tA1, ids.rA]));
    assert.equal(
      (await as(A, 'insert into public.task_resources (task_id, resource_id, position) values ($1, $2, 0)', [ids.tA1, ids.rA])).rowCount,
      1,
    );
  });

  test("a creator cannot see another creator's task links", async () => {
    assert.equal((await as(A, 'select * from public.task_resources where task_id = $1', [ids.tB1])).rowCount, 0);
  });
});

describe('reordering', () => {
  test('a creator can reorder their own milestones and tasks', async () => {
    await db.query('begin');
    try {
      await db.query('set local role authenticated');
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: A.id, role: 'authenticated' })]);
      await db.query('select public.reorder_milestones($1, $2)', [ids.progA, [ids.mA2, ids.mA1]]);
      await db.query('select public.reorder_tasks($1, $2)', [ids.mA1, [ids.tA2, ids.tA1]]);
      const m = await db.query('select id, position from public.milestones where program_id = $1 order by position', [ids.progA]);
      assert.deepEqual(
        m.rows.map((r) => r.id),
        [ids.mA2, ids.mA1],
      );
      const t = await db.query('select id from public.tasks where milestone_id = $1 order by position', [ids.mA1]);
      assert.deepEqual(
        t.rows.map((r) => r.id),
        [ids.tA2, ids.tA1],
      );
    } finally {
      await db.query('rollback');
    }
  });

  test('a reorder must list every item exactly once', async () => {
    await invalid(as(A, 'select public.reorder_milestones($1, $2)', [ids.progA, [ids.mA1]]), '22023');
    await invalid(as(A, 'select public.reorder_milestones($1, $2)', [ids.progA, [ids.mA1, ids.mA1]]), '22023');
    await invalid(as(A, 'select public.reorder_milestones($1, $2)', [ids.progA, [ids.mA1, ids.mA2, ids.mB1]]), '22023');
  });

  test("a creator cannot reorder another creator's items", async () => {
    await invalid(as(A, 'select public.reorder_milestones($1, $2)', [ids.progB, [ids.mB1]]), '22023');
    await invalid(as(A, 'select public.reorder_tasks($1, $2)', [ids.mB1, [ids.tB1]]), '22023');
  });

  test('logged-out users cannot reorder', async () => {
    await denied(as('anon', 'select public.reorder_milestones($1, $2)', [ids.progA, [ids.mA1, ids.mA2]]));
  });
});

describe('publishing', () => {
  test("a creator cannot publish another creator's program, or one that doesn't exist", async () => {
    await assert.rejects(as(A, 'select public.publish_program($1)', [ids.progB]), (e) => e.code === '42501' && /not found/.test(e.message));
    await assert.rejects(as(A, 'select public.publish_program($1)', [randomUUID()]), (e) => e.code === '42501' && /not found/.test(e.message));
  });

  test('publish refuses an incomplete program and says what is missing', async () => {
    const { rows } = await as(B, 'select public.publish_program($1) as r', [ids.progB]);
    assert.equal(rows[0].r.ok, false);
    assert.equal(rows[0].r.status, 'draft');
    assert.deepEqual(
      rows[0].r.problems.map((p) => p.code),
      ['agent_name'],
    );

    const a = await as(A, 'select public.publish_program($1) as r', [ids.progA2]);
    assert.equal(a.rows[0].r.ok, false);
    const codes = a.rows[0].r.problems.map((p) => p.code);
    assert.ok(codes.includes('agent_name'));

    await db.query('begin');
    try {
      await db.query('set local role authenticated');
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: A.id, role: 'authenticated' })]);
      await db.query("update public.creators set agent_name = 'Marcus''s agent' where id = $1", [A.id]);
      await db.query("insert into public.milestones (program_id, position, title) values ($1, 1, 'Empty milestone')", [ids.progA2]);
      await db.query(
        "insert into public.tasks (milestone_id, position, title, why, completion_type) values ($1, 1, 'Yes/no without a question', 'Because', 'yes_no')",
        [ids.mA2x],
      );
      await db.query("insert into public.tasks (milestone_id, position, title) values ($1, 2, 'No why')", [ids.mA2x]);
      const r = (await db.query('select public.publish_program($1) as r', [ids.progA2])).rows[0].r;
      assert.equal(r.ok, false);
      assert.deepEqual(r.problems.map((p) => p.code).sort(), ['empty_milestone', 'missing_question', 'missing_why']);
    } finally {
      await db.query('rollback');
    }
  });

  test('publish makes a complete program live, and only then', async () => {
    await as(B, "update public.creators set agent_name = 'Ana''s agent' where id = $1", [B.id], { commit: true });
    const { rows } = await as(B, 'select public.publish_program($1) as r', [ids.progB], { commit: true });
    assert.equal(rows[0].r.ok, true);
    const p = await as('postgres', 'select status, published_at from public.programs where id = $1', [ids.progB]);
    assert.equal(p.rows[0].status, 'live');
    assert.ok(p.rows[0].published_at);
  });

  test('a live program cannot be deleted', async () => {
    assert.equal((await as(B, 'delete from public.programs where id = $1', [ids.progB])).rowCount, 0);
  });

  test('a draft program can be deleted by its creator', async () => {
    assert.equal((await as(A, 'delete from public.programs where id = $1', [ids.progA2])).rowCount, 1);
  });
});

describe('join links', () => {
  test('logged-out users cannot read programs or creators directly', async () => {
    await denied(as('anon', 'select * from public.programs'));
    await denied(as('anon', 'select * from public.creators'));
    await denied(as('anon', 'select * from public.tasks'));
  });

  test('get_join_info shows only the public fields of a live program', async () => {
    const { rows, fields } = await as('anon', 'select * from public.get_join_info($1)', [ids.slugB]);
    assert.equal(rows.length, 1);
    assert.deepEqual(
      fields.map((f) => f.name),
      ['creator_first_name', 'creator_last_name', 'agent_name', 'goal'],
    );
    assert.equal(rows[0].goal, 'Make your first sale');
    assert.equal((await as('anon', 'select * from public.get_join_info($1)', [ids.slugB.toUpperCase()])).rowCount, 1);
  });

  test('get_join_info returns nothing for drafts, unknown slugs, or junk', async () => {
    assert.equal((await as('anon', 'select * from public.get_join_info($1)', [ids.slugA])).rowCount, 0);
    assert.equal((await as('anon', 'select * from public.get_join_info($1)', ['no-such-coach'])).rowCount, 0);
    assert.equal((await as('anon', 'select * from public.get_join_info($1)', ['x'.repeat(5000)])).rowCount, 0);
    assert.equal((await as('anon', 'select * from public.get_join_info($1)', ["' or 1=1 --"])).rowCount, 0);
  });

  test('a student cannot read a live program directly yet', async () => {
    assert.equal((await as(S, 'select * from public.programs where id = $1', [ids.progB])).rowCount, 0);
    assert.equal((await as(S, 'select * from public.tasks where id = $1', [ids.tB1])).rowCount, 0);
  });
});

describe('file storage', () => {
  const put = (who, bucket, name) => as(who, 'insert into storage.objects (bucket_id, name) values ($1, $2)', [bucket, name]);

  test('the bucket is private, PDF only, 20 MB', async () => {
    const { rows } = await as('postgres', "select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'program-files'");
    assert.deepEqual(rows[0], { public: false, file_size_limit: '20971520', allowed_mime_types: ['application/pdf'] });
  });

  test("a creator can upload only into their own program's folder", async () => {
    assert.equal((await put(A, 'program-files', `${A.id}/${ids.progA}/script.pdf`)).rowCount, 1);
    await denied(put(A, 'program-files', `${B.id}/${ids.progB}/script.pdf`));
    await denied(put(A, 'program-files', `${A.id}/${ids.progB}/script.pdf`));
    await denied(put(A, 'program-files', `${B.id}/${ids.progA}/script.pdf`));
    await denied(put(A, 'program-files', `${A.id}/script.pdf`));
    await denied(put(A, 'program-files', `${A.id}/${randomUUID()}/script.pdf`));
  });

  test('students, no-role users, and logged-out users cannot upload', async () => {
    await denied(put(S, 'program-files', `${S.id}/${ids.progA}/x.pdf`));
    await denied(put(N, 'program-files', `${N.id}/${ids.progA}/x.pdf`));
    await denied(put('anon', 'program-files', `${A.id}/${ids.progA}/x.pdf`));
  });

  test("files are visible only to the creator who owns them", async () => {
    await as('postgres', 'insert into storage.objects (bucket_id, name, owner) values ($1, $2, $3)', [
      'program-files',
      `${B.id}/${ids.progB}/b.pdf`,
      B.id,
    ], { commit: true });
    assert.equal((await as(B, "select * from storage.objects where bucket_id = 'program-files'")).rowCount, 1);
    assert.equal((await as(A, "select * from storage.objects where bucket_id = 'program-files'")).rowCount, 0);
    assert.equal((await as(S, "select * from storage.objects where bucket_id = 'program-files'")).rowCount, 0);
    assert.equal((await as('anon', "select * from storage.objects where bucket_id = 'program-files'")).rowCount, 0);
    assert.equal((await as(A, "delete from storage.objects where bucket_id = 'program-files'")).rowCount, 0);
  });
});

// The exact writes the creator builder makes (src/lib/builder.ts), as the owning creator.
describe('creator builder writes', () => {
  test('a creator can save every report type with the fields the task editor sends', async () => {
    const r = await as(
      A,
      `insert into public.tasks (milestone_id, position, title, why, completion_type, check_in_question, target_count, unit,
                                 follow_up_question, follow_up_options, est_minutes, is_optional)
       values ($1, 10, 'Call 50 sellers', 'Deals come from conversations.', 'count', 'How many calls did you make?', 50, 'calls',
               'How did it go?', array['Wants to sell', 'Not motivated'], 90, false),
              ($1, 11, 'Submit an offer', 'Offers make deals.', 'yes_no', 'Did you submit it?', null, null, null, null, 30, false),
              ($1, 12, 'Pick a zip code', 'Focus wins.', 'text', 'Which zip and why?', null, null, 'Confident?', null, 20, true),
              ($1, 13, 'Watch lesson 2', 'Basics first.', 'done', null, null, null, null, null, 15, false)
       returning completion_type`,
      [ids.mA2],
    );
    assert.deepEqual(
      r.rows.map((x) => x.completion_type),
      ['count', 'yes_no', 'text', 'done'],
    );
  });

  test('a creator can edit every task field the editor changes', async () => {
    const r = await as(
      A,
      `update public.tasks set title = 'Call 60 sellers', why = 'More calls, more deals.', completion_type = 'count',
              check_in_question = 'How many?', target_count = 60, unit = 'calls', follow_up_question = null,
              follow_up_options = null, est_minutes = 120, is_optional = true
        where id = $1 returning target_count`,
      [ids.tA1],
    );
    assert.equal(r.rows[0].target_count, 60);
  });

  test("saving a task's resources replaces its links, up to three", async () => {
    const r1 = await as(
      A,
      `with gone as (delete from public.task_resources where task_id = '${ids.tA2}')
       insert into public.task_resources (task_id, resource_id, position) values ($1, $2, 0) returning position`,
      [ids.tA2, ids.rA],
    );
    assert.equal(r1.rowCount, 1);
    await invalid(
      as(A, 'insert into public.task_resources (task_id, resource_id, position) values ($1, $2, 3)', [ids.tA2, ids.rA]),
    );
  });

  test('archiving hides a milestone and a task from publishing checks', async () => {
    const r = await as(
      A,
      `with m as (update public.milestones set archived_at = now() where id = '${ids.mA2}' returning 1),
            t as (update public.tasks set archived_at = now() where id = '${ids.tA1}' returning 1)
       select (select count(*) from m) + (select count(*) from t) as changed`,
    );
    assert.equal(Number(r.rows[0].changed), 2);
    // Another creator's archive matches no rows, so nothing changes.
    const other = await as(B, 'update public.milestones set archived_at = now() where id = $1', [ids.mA1]);
    assert.equal(other.rowCount, 0);
  });

  test('a reorder that keeps archived milestones at the end succeeds', async () => {
    await db.query('begin');
    try {
      await db.query('set local role authenticated');
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: A.id, role: 'authenticated' })]);
      await db.query('update public.milestones set archived_at = now() where id = $1', [ids.mA1]);
      await db.query('select public.reorder_milestones($1, $2)', [ids.progA, [ids.mA2, ids.mA1]]);
      await db.query('set constraints all immediate');
      const r = await db.query('select id from public.milestones where program_id = $1 order by position', [ids.progA]);
      assert.deepEqual(
        r.rows.map((x) => x.id),
        [ids.mA2, ids.mA1],
      );
    } finally {
      await db.query('rollback');
    }
  });

  test("a creator can change their program's goal, title, and length, within limits", async () => {
    const r = await as(
      A,
      "update public.programs set goal = 'Close your first wholesale deal', title = 'Close your first wholesale deal', duration_weeks = 10 where id = $1 returning duration_weeks",
      [ids.progA],
    );
    assert.equal(r.rows[0].duration_weeks, 10);
    await invalid(as(A, 'update public.programs set duration_weeks = 53 where id = $1', [ids.progA]));
    await invalid(as(A, "update public.programs set goal = 'x' where id = $1", [ids.progA]));
  });
});

// The AI plan generator's server side (20261023170000_ai_plan_generator.sql).
describe('AI usage cap and plan import', () => {
  const plan = [
    {
      title: 'Find your market',
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
        },
      ],
    },
    { title: 'Make offers', tasks: [{ title: 'Submit one offer', why: 'Offers make deals.', completion_type: 'yes_no', check_in_question: 'Did you submit it?' }] },
  ];

  // Runs SQL as creator A inside one transaction (rolled back), so start and finish calls see each other.
  const loop = (body) => `do $$ declare i int; begin ${body} end $$`;

  test('only signed-in creators can use AI', async () => {
    await assert.rejects(as('anon', "select public.start_ai_request('plan')"));
    await denied(as(S, "select public.start_ai_request('plan')"));
    await denied(as(N, "select public.start_ai_request('plan')"));
    await denied(as(X, "select public.start_ai_request('plan')"));
    await as(A, "select public.start_ai_request('plan')");
    await invalid(as(A, "select public.start_ai_request('other')"), '22023');
    await assert.rejects(as('anon', 'select public.finish_ai_request(1, true)'));
  });

  test('a creator can run only one AI request at a time', async () => {
    await invalid(as(A, loop("perform public.start_ai_request('task'); perform public.start_ai_request('plan');")), '55P03');
    await as(A, loop("perform public.finish_ai_request(public.start_ai_request('task'), true); perform public.start_ai_request('plan');"));
  });

  test('a creator gets 5 plans and 30 task suggestions a day, then is refused', async () => {
    const plans = "for i in 1..5 loop perform public.finish_ai_request(public.start_ai_request('plan'), true); end loop;";
    const tasks = "for i in 1..30 loop perform public.finish_ai_request(public.start_ai_request('task'), true); end loop;";
    await as(A, loop(plans + tasks));
    await invalid(as(A, loop(plans + "perform public.start_ai_request('plan');")), '54000');
    await invalid(as(A, loop(tasks + "perform public.start_ai_request('task');")), '54000');
    // The limits are per creator.
    await as(A, loop(plans + "perform set_config('request.jwt.claims', '" + JSON.stringify({ sub: B.id, role: 'authenticated' }) + "', true); perform public.start_ai_request('plan');"));
  });

  test('requests that never reached Claude do not count, and one that died stops blocking', async () => {
    const failed = "for i in 1..5 loop perform public.finish_ai_request(public.start_ai_request('plan'), false); end loop;";
    const done = "for i in 1..5 loop perform public.finish_ai_request(public.start_ai_request('plan'), true); end loop;";
    await as(A, loop(failed + done));
    await invalid(as(A, loop(failed + done + "perform public.start_ai_request('plan');")), '54000');

    await db.query('begin');
    try {
      await db.query("insert into public.ai_requests (creator_id, kind, created_at) values ($1, 'plan', now() - interval '5 minutes')", [A.id]);
      await db.query('set local role authenticated');
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: A.id, role: 'authenticated' })]);
      await db.query("select public.start_ai_request('task')");
    } finally {
      await db.query('rollback');
    }
  });

  test("a creator cannot finish someone else's request", async () => {
    const asB = "perform set_config('request.jwt.claims', '" + JSON.stringify({ sub: B.id, role: 'authenticated' }) + "', true);";
    const asA = "perform set_config('request.jwt.claims', '" + JSON.stringify({ sub: A.id, role: 'authenticated' }) + "', true);";
    await invalid(
      as(A, loop(`i := public.start_ai_request('plan'); ${asB} perform public.finish_ai_request(i, true); ${asA} perform public.start_ai_request('plan');`)),
      '55P03',
    );
  });

  test('nobody can read or write the usage table directly', async () => {
    await denied(as(A, 'select * from public.ai_requests'));
    await denied(as(A, "insert into public.ai_requests (creator_id, kind) values ($1, 'plan')", [A.id]));
    await denied(as(A, "update public.ai_requests set status = 'failed'"));
  });

  test("a creator can import an approved plan into their own draft, after what's there", async () => {
    await db.query('begin');
    try {
      await db.query('set local role authenticated');
      await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: A.id, role: 'authenticated' })]);
      const before = await db.query('select max(position) as p from public.milestones where program_id = $1', [ids.progA]);
      const r = await db.query('select public.import_plan($1, $2) as saved', [ids.progA, JSON.stringify(plan)]);
      assert.equal(r.rows[0].saved, 3);
      const added = await db.query(
        `select m.title, m.position, count(t.id)::int as tasks
           from public.milestones m left join public.tasks t on t.milestone_id = m.id
          where m.program_id = $1 and m.position > $2 group by m.id order by m.position`,
        [ids.progA, before.rows[0].p],
      );
      assert.deepEqual(
        added.rows.map((x) => [x.title, x.tasks]),
        [
          ['Find your market', 2],
          ['Make offers', 1],
        ],
      );
      const count = await db.query("select target_count, follow_up_options from public.tasks where title = 'Call 50 sellers'");
      assert.deepEqual(count.rows[0], { target_count: 50, follow_up_options: ['Wants to sell', 'Not motivated'] });
    } finally {
      await db.query('rollback');
    }
  });

  test("a plan cannot go into another creator's program or a live one", async () => {
    await denied(as(A, 'select public.import_plan($1, $2)', [ids.progB, JSON.stringify(plan)]));
    await denied(as(B, 'select public.import_plan($1, $2)', [ids.progB, JSON.stringify(plan)])); // live
    await denied(as(S, 'select public.import_plan($1, $2)', [ids.progA, JSON.stringify(plan)]));
  });

  test('an invalid task stops the whole import', async () => {
    const bad = [{ title: 'Bad', tasks: [{ title: 'Count with no target', completion_type: 'count' }] }];
    await invalid(as(A, 'select public.import_plan($1, $2)', [ids.progA, JSON.stringify(bad)]));
    const empty = await as(A, "select count(*)::int as n from public.milestones where title = 'Bad'");
    assert.equal(empty.rows[0].n, 0);
    await invalid(as(A, 'select public.import_plan($1, $2)', [ids.progA, '[]']), '22023');
    const many = Array.from({ length: 11 }, (_, i) => ({ title: `M${i}`, tasks: [] }));
    await invalid(as(A, 'select public.import_plan($1, $2)', [ids.progA, JSON.stringify(many)]), '22023');
    const task = { title: 'Do it', why: 'Because.', completion_type: 'done' };
    const crowded = [{ title: 'Busy', tasks: Array.from({ length: 6 }, () => task) }];
    await invalid(as(A, 'select public.import_plan($1, $2)', [ids.progA, JSON.stringify(crowded)]), '22023');
  });
});

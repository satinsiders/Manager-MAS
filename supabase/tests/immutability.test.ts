import assert from 'node:assert/strict';
import { Client } from 'pg';
import { promises as fs } from 'fs';
import path from 'path';
import { execSync } from 'child_process';

(async () => {
  // Ensure postgres cluster is running
  try {
    execSync('pg_ctlcluster 16 main start');
  } catch {}

  const admin = new Client({ user: 'postgres', password: 'postgres', host: 'localhost', port: 5432, database: 'postgres' });
  await admin.connect();

  // Reset schema
  await admin.query('drop schema public cascade; create schema public; grant all on schema public to postgres; grant all on schema public to public;');

  // Ensure required roles exist
  await admin.query("drop role if exists anon; drop role if exists authenticated; drop role if exists service_role;");
  await admin.query("create role anon login password 'anon';");
  await admin.query('create role authenticated;');
  await admin.query('create role service_role;');

  // Run migrations
  const migrationsDir = path.join(process.cwd(), 'supabase', 'migrations');
  const files = (await fs.readdir(migrationsDir)).sort();
  for (const file of files) {
    const sql = await fs.readFile(path.join(migrationsDir, file), 'utf8');
    await admin.query(sql);
  }

  // Seed required data
  const studentId = '00000000-0000-0000-0000-000000000001';
  await admin.query("insert into students(id, name, timezone) values ($1, 'Test', 'UTC')", [studentId]);

  // Grant privileges to anon
  await admin.query('grant usage on schema public to anon;');
  await admin.query('grant select, insert, update, delete on all tables in schema public to anon;');
  await admin.end();

  const anon = new Client({ user: 'anon', password: 'anon', host: 'localhost', port: 5432, database: 'postgres' });
  await anon.connect();

  const lessonId = '00000000-0000-0000-0000-000000000101';
  const performanceId = '00000000-0000-0000-0000-000000000201';
  const assignmentId = '00000000-0000-0000-0000-000000000301';

  // Insert initial records
  await anon.query('insert into lessons(id, topic, difficulty) values ($1, $2, 1)', [lessonId, 'Topic']);
  await anon.query("insert into curricula(version, student_id, curriculum) values (1, $1, '{}'::jsonb)", [studentId]);
  await anon.query('insert into performances(id, student_id, lesson_id, score) values ($1, $2, $3, 0)', [performanceId, studentId, lessonId]);
  await anon.query("insert into assignments(id, lesson_id, student_id, questions_json, generated_by) values ($1, $2, $3, '{}'::jsonb, 'gpt')", [assignmentId, lessonId, studentId]);
  await anon.query("insert into curricula_drafts(student_id, version, curriculum) values ($1, 1, '{}'::jsonb)", [studentId]);

  // Immutable tables should ignore updates and deletes
  let res = await anon.query("update lessons set topic='New' where id=$1", [lessonId]);
  assert.equal(res.rowCount, 0);
  res = await anon.query('delete from lessons where id=$1', [lessonId]);
  assert.equal(res.rowCount, 0);

  res = await anon.query('update performances set score=1 where id=$1', [performanceId]);
  assert.equal(res.rowCount, 0);
  res = await anon.query('delete from performances where id=$1', [performanceId]);
  assert.equal(res.rowCount, 0);

  res = await anon.query("update assignments set generated_by='test' where id=$1", [assignmentId]);
  assert.equal(res.rowCount, 0);
  res = await anon.query('delete from assignments where id=$1', [assignmentId]);
  assert.equal(res.rowCount, 0);

  res = await anon.query("update curricula set curriculum='{}'::jsonb where student_id=$1 and version=1", [studentId]);
  assert.equal(res.rowCount, 0);
  res = await anon.query('delete from curricula where student_id=$1 and version=1', [studentId]);
  assert.equal(res.rowCount, 0);

  // Drafts remain mutable
  await anon.query("update curricula_drafts set curriculum='{\"updated\":true}'::jsonb where student_id=$1 and version=1", [studentId]);
  await anon.query('delete from curricula_drafts where student_id=$1 and version=1', [studentId]);

  await anon.end();
})();

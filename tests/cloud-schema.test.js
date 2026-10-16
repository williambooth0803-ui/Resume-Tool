import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
test("Supabase schema enforces per-user access and rejects stale or invalid revisions in PostgreSQL", async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec(`create role anon; create role authenticated;
 create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
 grant usage on schema public,auth to authenticated,anon;
 insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');`);
  const schema = await readFile(
    new URL("../supabase/schema.sql", import.meta.url),
    "utf8",
  );
  await db.exec(schema);
  await db.exec(schema); // Migration is repeatable.
  const a = "11111111-1111-4111-8111-111111111111",
    b = "22222222-2222-4222-8222-222222222222";
  await db.exec(
    `set role authenticated;select set_config('request.jwt.claim.sub','${a}',false);`,
  );
  await db.query(
    "insert into public.resume_workspaces(user_id,data) values ($1,$2)",
    [a, JSON.stringify({ profile: { name: "Account A" } })],
  );
  assert.equal(
    (await db.query("select * from public.resume_workspaces")).rows.length,
    1,
  );
  await assert.rejects(
    () =>
      db.query(
        "insert into public.resume_workspaces(user_id,data) values ($1,$2)",
        [b, "{}"],
      ),
    /row-level security/i,
  );
  await db.exec(`select set_config('request.jwt.claim.sub','${b}',false);`);
  assert.equal(
    (await db.query("select * from public.resume_workspaces")).rows.length,
    0,
  );
  assert.equal(
    (
      await db.query(
        "update public.resume_workspaces set revision=revision+1 where user_id=$1 returning *",
        [a],
      )
    ).rows.length,
    0,
  );
  await db.query(
    "insert into public.resume_workspaces(user_id,data) values ($1,$2)",
    [b, "{}"],
  );
  await db.exec(`select set_config('request.jwt.claim.sub','${a}',false);`);
  assert.equal(
    (
      await db.query(
        "update public.resume_workspaces set revision=2 where user_id=$1 and revision=1 returning *",
        [a],
      )
    ).rows.length,
    1,
  );
  assert.equal(
    (
      await db.query(
        "update public.resume_workspaces set revision=2 where user_id=$1 and revision=1 returning *",
        [a],
      )
    ).rows.length,
    0,
  );
  await assert.rejects(
    () =>
      db.query(
        "update public.resume_workspaces set revision=1 where user_id=$1",
        [a],
      ),
    /Invalid workspace revision/,
  );
  await db.exec("reset role;set role anon;");
  await assert.rejects(
    () => db.query("select * from public.resume_workspaces"),
    /permission denied/i,
  );
});

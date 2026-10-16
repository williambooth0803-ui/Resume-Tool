import test from "node:test";
import assert from "node:assert/strict";
import { createResumeServer, publicCloudConfig } from "../server/index.js";
import { blankProfile } from "../src/model.js";
const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_test",
  RESUME_AI_API_KEY: "test-not-a-real-key",
};
async function serve(t, options = {}) {
  const server = createResumeServer(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}
test("public configuration never returns service-role or provider secret keys", async (t) => {
  assert.equal(
    publicCloudConfig({ ...env, SUPABASE_ANON_KEY: "sb_secret_not-public" }),
    null,
  );
  const jwt = `header.${Buffer.from(JSON.stringify({ role: "service_role" })).toString("base64url")}.sig`;
  assert.equal(publicCloudConfig({ ...env, SUPABASE_ANON_KEY: jwt }), null);
  const base = await serve(t, { env });
  const config = await (await fetch(base + "/api/config")).json();
  assert.deepEqual(config, {
    supabaseUrl: env.SUPABASE_URL,
    supabaseAnonKey: env.SUPABASE_ANON_KEY,
  });
  assert.ok(!JSON.stringify(config).includes(env.RESUME_AI_API_KEY));
});
test("AI rejects anonymous and expired sessions before calling the provider", async (t) => {
  let calls = 0;
  const base = await serve(t, {
    env,
    fetchImpl: async () => {
      calls++;
      return new Response("{}", { status: 401 });
    },
  });
  let response = await fetch(base + "/api/recommend", { method: "POST" });
  assert.equal(response.status, 401);
  assert.equal(calls, 0);
  response = await fetch(base + "/api/recommend", {
    method: "POST",
    headers: { Authorization: "Bearer expired" },
  });
  assert.equal(response.status, 401);
  assert.equal(calls, 1);
});
test("AI validates inputs, verifies identity, limits usage and preserves review-only suggestions", async (t) => {
  let providerCalls = 0;
  const base = await serve(t, {
    env,
    fetchImpl: async (url, options) => {
      if (url.endsWith("/auth/v1/user")) return Response.json({ id: "user-a" });
      providerCalls++;
      const body = JSON.parse(options.body);
      assert.match(body.messages[0].content, /Never invent/);
      return Response.json({
        choices: [
          { message: { content: "Use existing SQL skills (Skills section)." } },
        ],
      });
    },
  });
  const request = (data) =>
    fetch(base + "/api/recommend", {
      method: "POST",
      headers: {
        Authorization: "Bearer valid",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
  assert.equal((await request({ profile: {}, job: "Analyst" })).status, 400);
  assert.equal(providerCalls, 0);
  for (let i = 0; i < 10; i++) {
    const response = await request({ profile: blankProfile(), job: "Analyst" });
    assert.equal(response.status, 200);
    assert.match((await response.json()).advice, /SQL/);
  }
  assert.equal(
    (await request({ profile: blankProfile(), job: "Analyst" })).status,
    429,
  );
  assert.equal(providerCalls, 10);
});
test("manual app remains usable with cloud and AI unconfigured", async (t) => {
  const base = await serve(t, { env: {} });
  assert.deepEqual(await (await fetch(base + "/api/health")).json(), {
    ok: true,
    aiAvailable: false,
    cloudAvailable: false,
  });
  assert.equal(
    (await fetch(base + "/api/recommend", { method: "POST" })).status,
    503,
  );
});

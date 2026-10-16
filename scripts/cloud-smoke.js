// Browser contract test with a simulated Supabase Auth/PostgREST service.
// No live credentials or remote database changes are used.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
const browser = await chromium.launch({
  headless: true,
  ...(existsSync("/usr/bin/chromium")
    ? { executablePath: "/usr/bin/chromium" }
    : {}),
});
const base = process.env.RESUME_TEST_URL || "http://127.0.0.1:5173";
let releaseAI;
const users = {
    "ada@example.com": "11111111-1111-4111-8111-111111111111",
    "beta@example.com": "22222222-2222-4222-8222-222222222222",
  },
  rows = new Map(),
  errors = [];
function authResponse(email) {
  const user = {
    id: users[email],
    email,
    aud: "authenticated",
    role: "authenticated",
    created_at: new Date().toISOString(),
  };
  const access_token = [
    Buffer.from('{"alg":"HS256","typ":"JWT"}').toString("base64url"),
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        exp: Math.floor(Date.now() / 1000) + 3600,
        aud: "authenticated",
        role: "authenticated",
      }),
    ).toString("base64url"),
    "fixture-signature",
  ].join(".");
  return {
    access_token,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "fixture-refresh",
    user,
  };
}
async function newDevice() {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/api/health", (r) =>
    r.fulfill({ json: { ok: true, aiAvailable: true, cloudAvailable: true } }),
  );
  await page.route("**/api/recommend", async (r) => {
    await new Promise((resolve) => (releaseAI = resolve));
    await r.fulfill({ json: { advice: "Private account-only advice" } });
  });
  await page.route("**/api/config", (r) =>
    r.fulfill({
      json: {
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "sb_publishable_test",
      },
    }),
  );
  await page.route("https://example.supabase.co/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      method = req.method();
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    };
    const reply = (status, json) =>
      route.fulfill({
        status,
        headers,
        contentType: "application/json",
        body: JSON.stringify(json),
      });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (url.pathname === "/auth/v1/token") {
      const body = req.postDataJSON();
      return users[body.email]
        ? reply(200, authResponse(body.email))
        : reply(400, { msg: "Invalid login credentials" });
    }
    if (url.pathname === "/auth/v1/signup")
      return reply(200, {
        id: users["ada@example.com"],
        email: "ada@example.com",
        identities: [],
      });
    if (url.pathname === "/auth/v1/logout")
      return route.fulfill({ status: 204, headers });
    if (url.pathname === "/auth/v1/recover") return reply(200, {});
    if (url.pathname === "/rest/v1/resume_workspaces") {
      const token = req.headers().authorization?.split(" ")[1];
      const userId = JSON.parse(
        Buffer.from(token.split(".")[1], "base64url").toString(),
      ).sub;
      const row = rows.get(userId);
      if (method === "GET")
        return reply(200, row ? [structuredClone(row)] : []);
      const body = req.postDataJSON();
      if (body.user_id && body.user_id !== userId)
        return reply(403, { message: "RLS denied" });
      if (method === "POST") {
        if (row) return reply(409, { message: "Duplicate workspace" });
        rows.set(userId, { revision: 1, data: body.data });
        return reply(201, [{ revision: 1 }]);
      }
      if (method === "PATCH") {
        const revision = Number(
          url.searchParams.get("revision")?.replace("eq.", ""),
        );
        if (!row || row.revision !== revision) return reply(200, []);
        rows.set(userId, { revision: body.revision, data: body.data });
        return reply(200, [{ revision: body.revision }]);
      }
    }
    return reply(404, { error: "Unexpected simulated endpoint" });
  });
  await page.goto(base);
  return page;
}
const nav = (p, id) => p.locator(`[data-page="${id}"]`).first().click();
const saved = (p) => p.locator('#save-state[data-phase="saved"]').waitFor();
async function signin(p, email) {
  await nav(p, "account");
  await p.locator("#account-email").fill(email);
  await p.locator("#account-password").fill("example-long-password");
  await p.getByRole("button", { name: "Sign in", exact: true }).click();
  await p.getByRole("button", { name: "Load cloud status" }).waitFor();
}
async function accept(p, button) {
  p.once("dialog", (d) => d.accept());
  await p.locator(button).click();
}
try {
  const a = await newDevice();
  await a.getByLabel("Name", { exact: true }).fill("Guest Profile");
  await saved(a);
  await a
    .getByRole("button", { name: "Create a resume", exact: false })
    .click();
  await a.locator("#job").fill("Account-only target job");
  await saved(a);
  await signin(a, "ada@example.com");
  await accept(a, "#copy-guest");
  await nav(a, "profile");
  assert.equal(
    await a.getByLabel("Name", { exact: true }).inputValue(),
    "Guest Profile",
  );
  await a.getByLabel("Name", { exact: true }).fill("Account A");
  await saved(a);
  await nav(a, "account");
  await a.locator("#load-cloud").click();
  await a.locator("#use-local").waitFor();
  await a.locator("#use-local").click();
  await a
    .locator("#cloud-state")
    .filter({ hasText: "Synced to your account" })
    .waitFor();
  assert.equal(
    rows.get(users["ada@example.com"]).data.profile.name,
    "Account A",
  );
  // Loading status cancels pending automatic sync until a copy is explicitly chosen.
  await nav(a, "profile");
  await a.getByLabel("Name", { exact: true }).fill("Awaiting explicit choice");
  await saved(a);
  await nav(a, "account");
  await a.locator("#load-cloud").click();
  await a.locator("#use-cloud").waitFor();
  await a.waitForTimeout(1000);
  assert.equal(
    rows.get(users["ada@example.com"]).data.profile.name,
    "Account A",
  );
  await accept(a, "#use-cloud");
  assert.ok(
    !JSON.stringify(rows.get(users["ada@example.com"])).includes(
      "fixture-signature",
    ),
  );
  const b = await newDevice();
  await signin(b, "ada@example.com");
  await b.locator("#load-cloud").click();
  await b.locator("#use-cloud").waitFor();
  await accept(b, "#use-cloud");
  await nav(b, "profile");
  assert.equal(
    await b.getByLabel("Name", { exact: true }).inputValue(),
    "Account A",
  );
  await b.getByLabel("Name", { exact: true }).fill("Changed on device B");
  await saved(b);
  await nav(b, "account");
  await b
    .locator("#cloud-state")
    .filter({ hasText: "Synced to your account" })
    .waitFor();
  assert.equal(
    rows.get(users["ada@example.com"]).data.profile.name,
    "Changed on device B",
  );
  // The stale device must not silently overwrite the newer revision.
  await nav(a, "profile");
  await a.getByLabel("Name", { exact: true }).fill("Stale device A edit");
  await saved(a);
  await nav(a, "account");
  await a
    .locator("#cloud-state")
    .filter({ hasText: "Cloud changed or could not be saved" })
    .waitFor();
  assert.equal(
    rows.get(users["ada@example.com"]).data.profile.name,
    "Changed on device B",
  );
  await a.locator("#load-cloud").click();
  await a.locator("#use-cloud").waitFor();
  await accept(a, "#use-cloud");
  await nav(a, "profile");
  assert.equal(
    await a.getByLabel("Name", { exact: true }).inputValue(),
    "Changed on device B",
  );
  await nav(a, "account");
  await a.locator("#signout").click();
  await a.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  await nav(a, "profile");
  assert.equal(
    await a.getByLabel("Name", { exact: true }).inputValue(),
    "Guest Profile",
  );
  await signin(a, "beta@example.com");
  await nav(a, "profile");
  assert.equal(await a.getByLabel("Name", { exact: true }).inputValue(), "");
  await nav(a, "account");
  await a.locator("#load-cloud").click();
  await a.locator("#use-local").waitFor();
  assert.equal(await a.locator("#use-cloud").count(), 0);
  assert.equal(rows.has(users["beta@example.com"]), false);
  // Results started under an account must not land in a guest workspace with matching version IDs.
  await a.locator("#signout").click();
  await a.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  await signin(a, "ada@example.com");
  await nav(a, "versions");
  const started = a.waitForRequest("**/api/recommend");
  await a
    .getByRole("button", { name: "Get AI recommendations", exact: false })
    .click();
  await started;
  await a.evaluate(() => {
    const original = File.prototype.text;
    File.prototype.text = function () {
      if (this.name === "late.txt")
        return new Promise(
          (resolve) =>
            (window.releaseImport = () =>
              resolve("Account-only imported content")),
        );
      return original.call(this);
    };
  });
  await nav(a, "imports");
  await a
    .locator("#upload")
    .setInputFiles({
      name: "late.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("delayed"),
    });
  await a.waitForFunction(() => typeof window.releaseImport === "function");
  await nav(a, "account");
  await a.locator("#signout").click();
  await a.getByRole("button", { name: "Sign in", exact: true }).waitFor();
  const response = a.waitForResponse("**/api/recommend");
  releaseAI();
  await (await response).finished();
  await a.evaluate(() => {
    window.releaseImport();
    return new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );
  });
  const guest = await a.evaluate(() =>
    JSON.parse(localStorage.getItem("resume-studio-v1")),
  );
  assert.equal(guest.versions[0].recommendations, undefined);
  assert.equal(guest.imports.length, 0);
  assert.deepEqual(errors, []);
  console.log(
    "Cloud browser contract checks passed (simulated Auth/database): sign-in/out, guest/account separation, explicit upload/download, cross-device sync, stale-write conflict protection, account isolation, and discarded late AI/import results after sign-out. Live Supabase schema and authentication still require deployment configuration.",
  );
} catch (e) {
  throw e;
} finally {
  await browser.close();
}

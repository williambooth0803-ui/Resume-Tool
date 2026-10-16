import { chromium } from "playwright";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
const browser = await chromium.launch({
  headless: true,
  ...(existsSync("/usr/bin/chromium")
    ? { executablePath: "/usr/bin/chromium" }
    : {}),
});
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
let checks = 0;
const diagnosis = {
  ok: false,
  code: "key_rejected",
  projectHost: "example.supabase.co",
  message:
    "Supabase rejected the public API key for example.supabase.co. Replace SUPABASE_ANON_KEY in Render. This error occurs before your email and password are checked.",
};
try {
  await page.route("**/api/config", (r) =>
    r.fulfill({
      json: {
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "sb_publishable_fixture",
      },
    }),
  );
  await page.route("**/api/cloud-check", (r) => {
    checks++;
    return r.fulfill({ json: diagnosis });
  });
  await page.route("https://example.supabase.co/**", (route) => {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
    };
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204, headers });
    return route.fulfill({
      status: 401,
      headers,
      json: { message: "Invalid API key", msg: "Invalid API key" },
    });
  });
  await page.goto(process.env.RESUME_TEST_URL || "http://127.0.0.1:5173");
  await page.locator('[data-page="account"]').click();
  await page.locator("#account-email").fill("person@example.com");
  await page.locator("#account-password").fill("not-a-real-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page
    .locator("#notice")
    .filter({ hasText: "This error occurs before your email and password" })
    .waitFor();
  assert.equal(checks, 1);
  assert.equal(
    await page.locator("#account-email").inputValue(),
    "person@example.com",
  );
  const checked = page.waitForResponse("**/api/cloud-check");
  await page.getByRole("button", { name: "Check Supabase connection" }).click();
  await (await checked).finished();
  assert.equal(checks, 2);
  await page.route("**/api/config", (r) =>
    r.fulfill({ json: { supabaseUrl: null, supabaseAnonKey: null } }),
  );
  await page.reload();
  await page.locator('[data-page="account"]').click();
  await page.getByRole("button", { name: "Check Supabase connection" }).click();
  await page
    .locator("#notice")
    .filter({ hasText: "Supabase rejected" })
    .waitFor();
  assert.deepEqual(errors, []);
  console.log(
    "Connection browser checks passed: invalid-key sign-in automatically shows sanitized diagnosis, credentials remain editable, and manual diagnostics work without a configured client.",
  );
} finally {
  await browser.close();
}

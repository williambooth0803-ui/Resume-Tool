import { chromium } from "playwright";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import mammoth from "mammoth";
import { parseResume } from "../src/importer.js";
const browser = await chromium.launch({
  headless: true,
  ...(existsSync("/usr/bin/chromium")
    ? { executablePath: "/usr/bin/chromium" }
    : {}),
});
const page = await browser.newPage({ acceptDownloads: true }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const base = process.env.RESUME_TEST_URL || "http://127.0.0.1:5173",
  fixture = await readFile(
    new URL("../tests/fixtures/messy-resume.txt", import.meta.url),
    "utf8",
  );
const nav = (id) => page.locator(`[data-page="${id}"]`).first().click();
const snapshot = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("resume-studio-v1")));
async function categoryText(page, category) {
  return page
    .locator(`[data-item-category="${category}"] [data-item-text]`)
    .evaluateAll((rows) => rows.map((row) => row.value).join("\n"));
}
async function wordText() {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export").click(),
  ]);
  return (
    await mammoth.extractRawText({
      buffer: await readFile(await download.path()),
    })
  ).value;
}
try {
  await page.goto(base);
  await nav("imports");
  await page.locator("#paste-resume").fill(fixture);
  await page.locator("#organize-paste").click();
  assert.ok(await page.locator("#parsed-review").isVisible());
  assert.match(
    await categoryText(page, "education"),
    /BM: Church Music - Voice/,
  );
  assert.match(await categoryText(page, "references"), /DAN EXAMPLE/);
  assert.equal((await snapshot()).profile.experience, "");
  await page.locator("#apply-parsed").click();
  let state = await snapshot();
  assert.equal(
    (state.profile.experience.match(/MUSIC MINISTRY INTERN/g) || []).length,
    3,
  );
  assert.equal(state.profile.email, "applicant@example.com");
  assert.match(state.profile.skills, /Basic audio engineering/);
  assert.match(state.profile.references, /PARKER TEST/);
  await page.locator("#apply-parsed").click();
  assert.equal((await snapshot()).profile.experience, state.profile.experience);
  await nav("profile");
  await page
    .getByRole("button", { name: "Create a resume", exact: false })
    .click();
  assert.equal(
    await page.locator('[data-include="references"]').isChecked(),
    false,
  );
  let exported = await wordText();
  assert.ok(!exported.includes("DAN EXAMPLE"));
  assert.ok(exported.includes("BM: Church Music - Voice"));
  await page.locator('[data-include="references"]').check();
  exported = await wordText();
  assert.ok(exported.includes("DAN EXAMPLE"));
  await nav("profile");
  await page
    .getByLabel("Education", { exact: true })
    .fill("Legacy mixed information");
  await nav("imports");
  await page.locator("#import-mode").selectOption("replace");
  page.once("dialog", (d) => d.accept());
  await page.locator("#apply-parsed").click();
  assert.ok(
    !(await snapshot()).profile.education.includes("Legacy mixed information"),
  );
  await page.locator("#undo").click();
  assert.equal(
    (await snapshot()).profile.education,
    "Legacy mixed information",
  );
  await page.locator("#redo").click();
  assert.match((await snapshot()).profile.education, /EXAMPLE UNIVERSITY/);
  // Exercise actual PDF geometry from an aligned two-column document.
  const sourcePage = await browser.newPage();
  await sourcePage.setContent(
    `<style>*{font:12px/24px Arial;margin:0;padding:0}aside{position:absolute;left:30px;top:40px;width:190px}main{position:absolute;left:310px;top:40px;width:450px}</style><aside>${["SKILLS", "ProPresenter", "Basic audio engineering", "REFERENCES", "Robin Example", "(202) 555-0199", "robin@example.com"].map((s) => `<p>${s}</p>`).join("")}</aside><main>${["EXPERIENCE", "Example Church - Waco, TX", "August 2025 - December 2025", "MUSIC MINISTRY INTERN", "Plan and lead worship", "EDUCATION", "Example University", "BM: Church Music - Voice", "May 2027"].map((s) => `<p>${s}</p>`).join("")}</main>`,
  );
  const pdf = await sourcePage.pdf({ format: "Letter" });
  await sourcePage.close();
  await page.locator("#upload").setInputFiles({
    name: "two-columns.pdf",
    mimeType: "application/pdf",
    buffer: pdf,
  });
  await page
    .locator("#notice")
    .filter({ hasText: "1 document imported." })
    .waitFor();
  assert.match(await categoryText(page, "experience"), /Plan and lead worship/);
  assert.match(
    await categoryText(page, "education"),
    /BM: Church Music - Voice/,
  );
  assert.match(await categoryText(page, "references"), /robin@example.com/);
  assert.equal(await page.locator('[data-item-category="email"]').count(), 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  // Item corrections, splits, reassignment and choices must survive a reload.
  const edits = await browser.newPage();
  edits.on("pageerror", (e) => errors.push(e.message));
  await edits.goto(base);
  await edits.locator('[data-page="imports"]').first().click();
  await edits
    .locator("#paste-resume")
    .fill(`Available on weekends\n${fixture}`);
  await edits.locator("#organize-paste").click();
  assert.equal(await edits.locator("[data-item-id]").count(), 54);
  async function rowFor(text) {
    const id = await edits
      .locator("[data-item-text]")
      .evaluateAll(
        (rows, text) =>
          rows.find((row) => row.value === text)?.closest("[data-item-id]")
            .dataset.itemId,
        text,
      );
    assert.ok(id, `Missing item: ${text}`);
    return edits.locator(`[data-item-id="${id}"]`);
  }
  let row = await rowFor("ProPresenter");
  await row
    .locator("[data-item-text]")
    .fill("Lighting operation\nAudio mixing");
  await row.locator("summary").click();
  await row.locator("[data-item-split]").click();
  assert.equal(await edits.locator("[data-item-id]").count(), 55);
  row = await rowFor("Available on weekends");
  assert.equal(await row.locator("[data-item-selected]").isEnabled(), false);
  await row.locator("[data-item-move]").selectOption("skills");
  row = await rowFor("Lighting operation");
  await row.locator("[data-item-move]").selectOption("experience");
  row = await rowFor("Lighting operation");
  await row.locator("summary").click();
  await row.locator("[data-item-group]").selectOption("job-2");
  row = await rowFor("Serve on frontline praise team");
  await row.locator("[data-item-selected]").uncheck();
  await edits.reload();
  await edits.locator('[data-page="imports"]').first().click();
  await edits.locator("[data-import]").first().click();
  row = await rowFor("Serve on frontline praise team");
  assert.equal(await row.locator("[data-item-selected]").isChecked(), false);
  row = await rowFor("Lighting operation");
  assert.equal(
    await row.locator("[data-item-move]").inputValue(),
    "experience",
  );
  assert.equal(await row.locator("[data-item-group]").inputValue(), "job-2");
  await edits.locator("#apply-parsed-top").click();
  let edited = await edits.evaluate(() =>
    JSON.parse(localStorage.getItem("resume-studio-v1")),
  );
  assert.match(edited.profile.skills, /Audio mixing/);
  assert.match(edited.profile.skills, /Available on weekends/);
  assert.doesNotMatch(
    edited.profile.experience,
    /Serve on frontline praise team/,
  );
  assert.doesNotMatch(
    edited.profile.experience.split("\n\n")[0],
    /Lighting operation/,
  );
  assert.match(
    edited.profile.experience.split("\n\n")[1],
    /Lighting operation/,
  );
  assert.equal(
    edited.imports[0].text,
    `Available on weekends\n${fixture}`.trim(),
  );
  await edits.locator("#undo").click();
  edited = await edits.evaluate(() =>
    JSON.parse(localStorage.getItem("resume-studio-v1")),
  );
  assert.equal(edited.profile.experience, "");
  assert.ok(
    edited.imports[0].organization.items.some(
      (item) => item.text === "Audio mixing",
    ),
  );
  await edits.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await edits.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await edits
    .locator('[data-review-category="experience"]')
    .scrollIntoViewIfNeeded();
  await edits.screenshot({ path: "/tmp/resume-items-mobile.png" });
  await edits.close();
  // Authenticated AI organization is explicit and does not apply or alter source text on its own.
  const ai = await browser.newPage();
  ai.on("pageerror", (e) => errors.push(e.message));
  let fail = false;
  await ai.route("**/api/config", (r) =>
    r.fulfill({
      json: {
        supabaseUrl: "https://example.supabase.co",
        supabaseAnonKey: "sb_publishable_fixture",
      },
    }),
  );
  await ai.route("**/api/health", (r) =>
    r.fulfill({ json: { ok: true, aiAvailable: true, cloudAvailable: true } }),
  );
  const user = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "person@example.com",
    aud: "authenticated",
    role: "authenticated",
  };
  const token = [
    "eyJhbGciOiJIUzI1NiJ9",
    Buffer.from(
      JSON.stringify({
        sub: user.id,
        exp: Math.floor(Date.now() / 1000) + 3600,
      }),
    ).toString("base64url"),
    "fixture",
  ].join(".");
  await ai.route("https://example.supabase.co/**", (r) => {
    const headers = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    };
    if (r.request().method() === "OPTIONS")
      return r.fulfill({ status: 204, headers });
    return r.fulfill({
      headers,
      json: {
        access_token: token,
        refresh_token: "fixture",
        expires_in: 3600,
        token_type: "bearer",
        user,
      },
    });
  });
  await ai.route("**/api/organize", (r) => {
    assert.ok(r.request().headers().authorization.startsWith("Bearer "));
    const text = r.request().postDataJSON().text;
    return r.fulfill({
      status: fail ? 502 : 200,
      json: fail
        ? { error: "Organization unavailable; source preserved." }
        : { organized: { ...parseResume(text), source: "ai" } },
    });
  });
  await ai.goto(base);
  await ai.locator('[data-page="account"]').click();
  await ai.locator("#account-email").fill("person@example.com");
  await ai.locator("#account-password").fill("fixture-password");
  await ai.getByRole("button", { name: "Sign in", exact: true }).click();
  await ai.locator("#signout").waitFor();
  await ai.locator('[data-page="imports"]').click();
  await ai.locator("#paste-resume").fill("SKILLS\nSQL");
  await ai.locator("#organize-paste").click();
  ai.once("dialog", (d) => d.accept());
  await ai.locator("#ai-organize").click();
  await ai.getByText("Organized with AI; verify", { exact: false }).waitFor();
  assert.equal(
    await ai.evaluate(
      () =>
        JSON.parse(
          localStorage.getItem(
            "resume-studio-v1:account:11111111-1111-4111-8111-111111111111",
          ),
        ).profile.skills,
    ),
    "",
  );
  fail = true;
  ai.once("dialog", (d) => d.accept());
  await ai.locator("#ai-organize").click();
  await ai
    .locator("#notice")
    .filter({ hasText: "Organization unavailable; source preserved." })
    .waitFor();
  assert.match(await categoryText(ai, "skills"), /SQL/);
  assert.deepEqual(errors, []);
  console.log(
    "Import browser checks passed: individual items, automatic paste/upload sorting, intact job groups, separated contacts/references, selective import, split/edit/move with autosaved reload recovery, merge deduplication, replacement and undo, reference export opt-in, real two-column PDF, mobile layout, explicit AI preview, and failure recovery.",
  );
} catch (e) {
  console.log(await page.locator("body").innerText());
  throw e;
} finally {
  await browser.close();
}

import { chromium } from "playwright";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
const browser = await chromium.launch({
  headless: true,
  ...(existsSync("/usr/bin/chromium")
    ? { executablePath: "/usr/bin/chromium" }
    : {}),
});
const page = await browser.newPage({ acceptDownloads: true }),
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const nav = (id) => page.locator(`[data-page="${id}"]`).first().click();
const saved = () => page.locator('#save-state[data-phase="saved"]').waitFor();
const data = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem("resume-studio-v1")));
try {
  await page.goto(process.env.RESUME_TEST_URL || "http://127.0.0.1:5173");
  await page.getByLabel("Name", { exact: true }).fill("Ada Example");
  await saved();
  await page.getByLabel("Name", { exact: true }).fill("Ada Changed");
  await saved();
  await page.locator("#undo").click();
  assert.equal(
    await page.getByLabel("Name", { exact: true }).inputValue(),
    "Ada Example",
  );
  await page.locator("#redo").click();
  assert.equal(
    await page.getByLabel("Name", { exact: true }).inputValue(),
    "Ada Changed",
  );
  await page.locator("#undo").click();
  await page.getByLabel("Skills", { exact: true }).fill("SQL");
  await saved();
  await nav("imports");
  await page.locator("#upload").setInputFiles({
    name: "structured.txt",
    mimeType: "text/plain",
    buffer: Buffer.from(
      "Ada Example\nada@example.com\nWORK EXPERIENCE\nBuilt reporting tools in 2021–2025\nEDUCATION\nExample University\nSKILLS\nSQL\nPython\nSQL",
    ),
  });
  await page
    .locator("#notice")
    .filter({ hasText: "1 document imported." })
    .waitFor();
  await page.locator("#parse-import").click();
  assert.equal(
    await page.locator('[data-item-category="experience"] [data-item-text]').inputValue(),
    "Built reporting tools in 2021–2025",
  );
  await page.locator("#apply-parsed").click();
  let state = await data();
  assert.equal(state.profile.email, "ada@example.com");
  assert.equal(
    state.profile.skills.split(/\s+/).filter((x) => x === "SQL").length,
    1,
  );
  assert.match(state.profile.skills, /Python/);
  // Applying the same source twice does not duplicate section lines.
  await page.locator("#parse-import").click();
  await page.locator("#apply-parsed").click();
  assert.equal((await data()).profile.skills, state.profile.skills);
  await nav("profile");
  await page
    .getByRole("button", { name: "Create a resume", exact: false })
    .click();
  await page.locator("#template").selectOption("modern");
  assert.equal((await data()).versions[0].template, "modern");
  assert.equal(await page.locator(".paper.template-modern").count(), 1);
  await page
    .getByLabel("Experience", { exact: true })
    .fill("Engineer 2025–2020");
  await saved();
  assert.match(
    await page.locator("#quality-results").innerText(),
    /ends before/,
  );
  await page
    .getByLabel("Experience", { exact: true })
    .fill("Built reporting tools in 2021–2025");
  await page.locator("#job").fill("SQL reporting analyst with Python");
  await page.locator("#find-relevant").click();
  assert.ok(await page.locator('[data-tailor="skills"]').isVisible());
  const [pdf] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("#export-pdf").click(),
  ]);
  const pdfBytes = await readFile(await pdf.path());
  assert.equal(pdfBytes.subarray(0, 5).toString(), "%PDF-");
  await page.locator("#track-version").click();
  await page.getByLabel("Application company").fill("Example Employer");
  await page.getByLabel("Application role").fill("Data Analyst");
  await page.getByLabel("Application status").selectOption("Applied");
  await page.getByLabel("Application date").fill("2026-10-15");
  await page.getByLabel("Application notes").fill("Follow up next week");
  await saved();
  state = await data();
  assert.equal(state.applications[0].status, "Applied");
  assert.equal(
    state.applications[0].resumeSnapshot.profile.name,
    "Ada Example",
  );
  await nav("versions");
  await page.getByLabel("Name", { exact: true }).fill("Edited After Applying");
  await saved();
  assert.equal(
    (await data()).applications[0].resumeSnapshot.profile.name,
    "Ada Example",
  );
  await page.getByRole("button", { name: "Duplicate", exact: true }).click();
  await page.getByLabel("Summary", { exact: true }).fill("Different summary");
  await saved();
  await nav("compare");
  assert.match(
    await page.locator(".comparison-section").innerText(),
    /Summary/,
  );
  assert.match(
    await page.locator(".compare-grid").innerText(),
    /Different summary/,
  );
  await nav("versions");
  page.once("dialog", (d) => d.accept());
  await page.locator("#delete-version").click();
  assert.equal((await data()).versions.length, 1);
  await page.locator("#undo").click();
  assert.equal((await data()).versions.length, 2);
  await nav("history");
  assert.ok((await page.locator("[data-restore-history]").count()) > 0);
  const historyId = (await data()).history.at(-1).id;
  page.once("dialog", (d) => d.accept());
  await page.locator(`[data-restore-history="${historyId}"]`).click();
  assert.ok(
    (await data()).history.some((h) => h.label === "Before restoring history"),
  );
  await nav("imports");
  await page.locator("#upload").setInputFiles({
    name: "exported.pdf",
    mimeType: "application/pdf",
    buffer: pdfBytes,
  });
  await page
    .locator("#notice")
    .filter({ hasText: "1 document imported." })
    .waitFor();
  assert.match(await page.locator("#import-text").inputValue(), /Ada Example/);
  assert.match(
    await page.locator("#import-text").inputValue(),
    /Built reporting tools/,
  );
  await nav("account");
  assert.match(await page.locator("main").innerText(), /SUPABASE_ANON_KEY/);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  assert.deepEqual(errors, []);
  console.log(
    "Feature browser checks passed: undo/redo, structured import/deduplication, layouts, PDF content round trip, quality checks, manual tailoring, application snapshots, comparisons, deletion recovery, history restore, and mobile account screen.",
  );
} catch (e) {
  console.log(await page.locator("body").innerText());
  await page.screenshot({ path: "/tmp/features-error.png", fullPage: true });
  throw e;
} finally {
  await browser.close();
}

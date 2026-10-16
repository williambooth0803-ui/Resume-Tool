import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, createVersion, validateState } from "../src/model.js";
import {
  coreState,
  checkpoint,
  undo,
  redo,
  restoreCheckpoint,
  boundedHistory,
  parseResume,
  mergeLines,
  qualityChecks,
  tailorRecommendations,
  compareVersions,
  createApplication,
} from "../src/workspace.js";
test("history recovers edited profiles, deleted resumes, and application snapshots without nesting history", () => {
  const state = emptyState(),
    before = coreState(state);
  state.profile.name = "Ada";
  const v = createVersion(state.profile, "Analyst");
  state.versions.push(v);
  checkpoint(state, before, "Create");
  const previous = coreState(state);
  state.versions = [];
  checkpoint(state, previous, "Delete");
  assert.ok(undo(state));
  assert.equal(state.versions.length, 1);
  assert.ok(redo(state));
  assert.equal(state.versions.length, 0);
  restoreCheckpoint(state, state.history.at(-1).id);
  assert.equal(state.versions.length, 1);
  assert.ok(!("history" in state.history[0].data));
  assert.doesNotThrow(() => validateState(JSON.parse(JSON.stringify(state))));
});
test("new edits after undo clear redo and history is capped at 20", () => {
  const state = emptyState();
  for (let i = 0; i < 25; i++) {
    const before = coreState(state);
    state.profile.name = String(i);
    checkpoint(state, before);
  }
  assert.equal(state.history.length, 20);
  undo(state);
  const before = coreState(state);
  state.profile.name = "new";
  checkpoint(state, before);
  assert.equal(state.future.length, 0);
});
test("structured import recognizes headings, preserves unknown text and skips normalized duplicate lines", () => {
  const parsed = parseResume(
    "Ada Example\nada@example.com\nTown unknown\nWORK EXPERIENCE\n• Built reports\nEDUCATION\nExample University\nSKILLS\nSQL\nPython",
  );
  assert.equal(parsed.profile.name, "Ada Example");
  assert.equal(parsed.profile.email, "ada@example.com");
  assert.match(parsed.unassigned, /Town unknown/);
  assert.match(parsed.profile.experience, /Built reports/);
  const merged = mergeLines(
    "Built reports.\nSQL",
    "• Built reports\n sql \nPython\nPython",
  );
  assert.equal(merged.added, 1);
  assert.equal(merged.duplicates, 3);
  assert.match(merged.text, /Python/);
});
test("quality checks flag invalid contacts, reversed dates, long text and inconsistent date formats", () => {
  const v = createVersion(emptyState().profile, "Test");
  v.profile.experience =
    "Engineer 2025–2020\n01/2020 and Jan 2021\n" + "word ".repeat(800);
  const messages = qualityChecks(v)
    .issues.map((i) => i.message)
    .join(" ");
  assert.match(messages, /name/);
  assert.match(messages, /valid contact email/);
  assert.match(messages, /ends before/);
  assert.match(messages, /shortening/);
  assert.match(messages, /consistent date/);
});
test("manual tailoring uses existing facts, highlights missing terms and comparisons include section exclusion", () => {
  const state = emptyState();
  state.profile.skills = "SQL";
  state.profile.experience = "Built accessible web applications";
  const rec = tailorRecommendations(state.profile, "SQL analyst with Tableau");
  assert.ok(rec.ranked[0].matches.includes("sql"));
  assert.ok(rec.missing.includes("tableau"));
  const a = createVersion(state.profile, "A"),
    b = structuredClone(a);
  b.included = b.included.filter((s) => s !== "skills");
  assert.equal(compareVersions(a, b)[0].field, "skills");
  const app = createApplication(a);
  a.profile.skills = "Changed";
  assert.equal(app.resumeSnapshot.profile.skills, "SQL");
  state.versions = [];
  assert.equal(app.resumeSnapshot.title, "A");
});
test("old backups migrate without losing data and invalid history and applications are rejected", () => {
  const old = { profile: emptyState().profile, versions: [], imports: [] };
  const migrated = validateState(old);
  assert.deepEqual(migrated.history, []);
  assert.deepEqual(migrated.applications, []);
  assert.throws(() =>
    validateState({
      ...migrated,
      history: [
        { id: "x", at: "now", label: "Invalid", data: { ...old, history: [] } },
      ],
    }),
  );
  assert.throws(() =>
    validateState({ ...migrated, applications: [{ id: "bad" }] }),
  );
});

test("large history snapshots cannot crowd out smaller recovery points or block ordinary saves", () => {
  const state = emptyState(),
    small = { id: "small", at: "now", label: "Small", data: coreState(state) };
  const huge = structuredClone(small);
  huge.id = "huge";
  huge.data.profile.experience = "x".repeat(1000001);
  assert.deepEqual(
    boundedHistory([small, huge]).map((x) => x.id),
    ["small"],
  );
});

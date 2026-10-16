import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  extractResumeItems,
  itemsToProfile,
  itemGroups,
  moveItem,
  splitItem,
} from "../src/import-items.js";
import { emptyState, validateState } from "../src/model.js";

const fixture = await readFile(
  new URL("fixtures/messy-resume.txt", import.meta.url),
  "utf8",
);

test("messy resume becomes individual facts with distinct jobs and private reference contacts", () => {
  const organization = extractResumeItems(fixture);
  const { items } = organization;
  assert.equal(items.length, 53);
  assert.equal(items.filter((row) => row.category === "skills").length, 6);
  assert.equal(items.filter((row) => row.kind === "duty").length, 17);
  assert.equal(itemGroups(items, "experience").length, 3);
  assert.equal(itemGroups(items, "references").length, 4);
  assert.equal(items.filter((row) => row.category === "references").length, 12);
  assert.ok(items.some((row) => row.text === "Basic audio engineering"));
  const event = items.find((row) =>
    row.text.includes("2,000 college students"),
  );
  assert.match(event.text, /College Collab Night/);
  assert.equal(event.group, "job-1");
  const profile = itemsToProfile(items);
  assert.equal(profile.email, "applicant@example.com");
  assert.match(profile.education, /Major GPA: 4.0/);
  assert.doesNotMatch(profile.experience, /GPA|dan@example/);
  assert.equal(
    (profile.experience.match(/MUSIC MINISTRY INTERN/g) || []).length,
    3,
  );
});

test("inline bullets, skill separators and completed responsibilities are separate items while wrapped text stays together", () => {
  const organization = extractResumeItems(`SKILLS
SQL, Python | Excel; ProPresenter
Worship leading in both traditional
and contemporary styles
EXPERIENCE
Example Company - Waco, TX
May 2024 - August 2025
PROGRAM COORDINATOR
• Facilitate youth rehearsals • Oversee event planning
Provide training for volunteers. Collaborate with the production team.
Plan and lead a worship event with
over 200 students
REFERENCES
Robin Example
(202) 555-0199
Sam Example
sam@example.com`);
  assert.deepEqual(
    organization.items
      .filter((row) => row.category === "skills")
      .map((row) => row.text),
    [
      "SQL",
      "Python",
      "Excel",
      "ProPresenter",
      "Worship leading in both traditional and contemporary styles",
    ],
  );
  const duties = organization.items.filter((row) => row.kind === "duty");
  assert.equal(duties.length, 5);
  assert.match(duties.at(-1).text, /event with over 200 students/);
  assert.equal(itemGroups(organization.items, "references").length, 2);
  assert.doesNotMatch(itemsToProfile(organization.items).phone, /0199/);
});

test("corrections, selection, splitting and reassignment survive workspace validation and retain their associations", () => {
  const state = emptyState();
  state.profile.email = "keep@example.com";
  const organization = extractResumeItems(fixture, state.profile);
  const email = organization.items.find((row) => row.category === "email");
  assert.equal(email.selected, false);
  const duty = organization.items.find((row) => row.kind === "duty");
  duty.text = "Prepare equipment\nLead rehearsals";
  assert.equal(splitItem(organization.items, duty.id), true);
  const parts = organization.items.filter((row) =>
    ["Prepare equipment", "Lead rehearsals"].includes(row.text),
  );
  assert.equal(parts.length, 2);
  assert.ok(parts.every((row) => row.group === "job-1"));
  parts[0].selected = false;
  moveItem(parts[1], "skills");
  const skill = organization.items.find((row) => row.text === "ProPresenter");
  moveItem(skill, "experience");
  assert.equal(skill.group, "unassigned-experience");
  skill.group = "job-2";
  // A moved responsibility can precede its destination record in source order.
  organization.items.splice(organization.items.indexOf(skill), 1);
  organization.items.unshift(skill);
  state.imports.push({
    id: "import",
    name: "Resume",
    text: fixture,
    organization,
  });
  const restored = validateState(JSON.parse(JSON.stringify(state)));
  const result = itemsToProfile(restored.imports[0].organization.items);
  assert.equal(result.email, "");
  assert.doesNotMatch(result.experience, /Prepare equipment|Lead rehearsals/);
  assert.match(result.skills, /Lead rehearsals/);
  const secondJob = result.experience.split("\n\n")[1];
  assert.match(secondJob, /^First Baptist Church Example/);
  assert.ok(secondJob.includes(skill.text));
  assert.equal(restored.imports[0].text, fixture);
  delete restored.imports[0].organization.items[0].selected;
  assert.throws(() => validateState(restored), /Invalid document/);
});

test("uncertain lines remain editable and excluded until assigned; schools and references remain separate groups", () => {
  const organization = extractResumeItems(`Available on weekends
EDUCATION
Example University
BS Computer Science
May 2025
Example College
Associate's degree
May 2022`);
  const unknown = organization.items.find(
    (row) => row.category === "unassigned",
  );
  assert.equal(unknown.text, "Available on weekends");
  assert.equal(unknown.selected, false);
  assert.equal(itemGroups(organization.items, "education").length, 2);
  moveItem(unknown, "summary");
  assert.equal(
    itemsToProfile(organization.items).summary,
    "Available on weekends",
  );
  moveItem(unknown, "unassigned");
  assert.equal(itemsToProfile(organization.items).summary, "");
});

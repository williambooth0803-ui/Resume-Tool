import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  parseResume,
  normalizeResumeText,
  organizeSourceSegments,
} from "../src/importer.js";
import { mergeProfileField } from "../src/workspace.js";
import { pdfPageText } from "../src/pdf-layout.js";
import {
  blankProfile,
  createVersion,
  emptyState,
  validateState,
} from "../src/model.js";
const fixture = await readFile(
  new URL("fixtures/messy-resume.txt", import.meta.url),
  "utf8",
);
test("flattened multi-column resume is sorted without mixing references or education into jobs", () => {
  const result = parseResume(fixture),
    p = result.profile;
  assert.equal(result.jobs.length, 3);
  assert.equal(p.name, "");
  assert.equal(p.email, "applicant@example.com");
  assert.equal(p.phone, "(202) 555-0101");
  assert.equal(p.location, "Amarillo, TX 79109");
  assert.match(p.skills, /Basic audio engineering/);
  assert.match(
    p.skills,
    /Worship leading in both traditional and contemporary styles/,
  );
  assert.match(p.skills, /Mission trip planning/);
  assert.equal(p.skills.split("\n").length, 6);
  assert.match(p.education, /EXAMPLE UNIVERSITY/);
  assert.match(p.education, /BM: Church Music - Voice/);
  assert.match(p.education, /May 2027/);
  assert.match(p.education, /GPA: 3.96/);
  assert.match(p.education, /Major GPA: 4.0/);
  assert.match(p.education, /Dean's List/);
  assert.doesNotMatch(p.education, /college students|MUSIC MINISTRY INTERN/);
  assert.doesNotMatch(p.experience, /GPA|BM:|DAN EXAMPLE|art@example/);
  assert.match(result.jobs[0].dates[0], /August 2025 – December 2025/);
  assert.match(
    result.jobs[0].bullets.at(-1),
    /College Collab Night.*2,000 college students/,
  );
  assert.match(result.jobs[1].bullets[0], /midweek youth worship services/);
  assert.match(
    result.jobs[2].dates[0],
    /June 2024 – July 2024, June 2025 – August 2025/,
  );
  assert.match(p.experience, /lyric and scripture visuals/);
  assert.match(
    p.experience,
    /Kansas City and New York City.*communicating with mission partners, leading worship/,
  );
  for (const name of ["DAN EXAMPLE", "ART SAMPLE", "ANDY DEMO", "PARKER TEST"])
    assert.match(p.references, new RegExp(name));
  assert.equal((p.references.match(/@example.com/g) || []).length, 4);
  assert.doesNotMatch(p.references, /applicant@example.com/);
  assert.equal(result.unassigned, "");
});
test("single-column resumes preserve applicant identity, role, unknown text and reference relationships", () => {
  const result = parseResume(
    "Jane Example\nSoftware Engineer\nExample City, TX 79109\njane@example.com\nUnknown note\nEXPERIENCE\nExample Company - Austin, TX\nJanuary 2020 - May 2024\nSOFTWARE ENGINEER\nBuilt reporting tools\nfor a support team\nREFERENCES\nRobin Person\nSenior Pastor\nExample Church\n(202) 555-0105\nrobin@example.com",
  );
  assert.equal(result.profile.name, "Jane Example");
  assert.equal(result.profile.headline, "Software Engineer");
  assert.equal(result.profile.email, "jane@example.com");
  assert.match(result.profile.references, /Example Church/);
  assert.doesNotMatch(
    result.profile.experience,
    /Robin Person|robin@example.com/,
  );
  assert.match(
    result.profile.experience,
    /Built reporting tools for a support team/,
  );
  assert.match(result.unassigned, /Unknown note/);
});
test("normalization repairs known OCR spacing without blindly joining names or inventing applicant names", () => {
  assert.match(
    normalizeResumeText(
      "B asic audio engineering\nW orship planning\nAmar illo\nJohn Smith",
    ),
    /Basic audio engineering\nWorship planning\nAmarillo\nJohn Smith/,
  );
  assert.equal(
    parseResume("ProPresenter\nBasic audio engineering").profile.name,
    "",
  );
});
test("AI source spans must be supported and omitted text remains available for review", () => {
  const source = "SKILLS\nSQL\nPython\nEXPERIENCE\nBuilt reports";
  const result = organizeSourceSegments(source, [
    { category: "skills", text: "SQL" },
  ]);
  assert.match(result.profile.skills, /SQL/);
  assert.match(result.unassigned, /Python/);
  assert.match(result.unassigned, /Built reports/);
  assert.throws(
    () =>
      organizeSourceSegments(source, [
        { category: "experience", text: "Increased revenue by 50%" },
      ]),
    /not supported/,
  );
  assert.throws(() =>
    organizeSourceSegments(source, [{ category: "secret", text: "SQL" }]),
  );
});
test("adding references migrates legacy backups, histories and application snapshots while keeping references out of exports by default", () => {
  const old = emptyState();
  const v = createVersion(old.profile, "Resume");
  old.versions.push(v);
  old.applications.push({
    id: "app",
    company: "",
    role: "",
    url: "",
    status: "Applied",
    date: "",
    notes: "",
    resumeId: v.id,
    resumeSnapshot: structuredClone(v),
    created: "now",
  });
  delete old.profile.references;
  delete old.versions[0].profile.references;
  delete old.applications[0].resumeSnapshot.profile.references;
  for (const category of ["history", "future"]) {
    old[category].push({
      id: category,
      at: "now",
      label: "Legacy workspace",
      data: structuredClone({
        profile: old.profile,
        versions: old.versions,
        imports: old.imports,
        applications: old.applications,
      }),
    });
  }
  const migrated = validateState(old);
  assert.equal(migrated.profile.references, "");
  assert.equal(migrated.versions[0].profile.references, "");
  assert.equal(migrated.applications[0].resumeSnapshot.profile.references, "");
  for (const category of ["history", "future"]) {
    assert.equal(migrated[category][0].data.profile.references, "");
    assert.equal(migrated[category][0].data.versions[0].profile.references, "");
    assert.equal(
      migrated[category][0].data.applications[0].resumeSnapshot.profile.references,
      "",
    );
  }
  assert.ok(
    !createVersion(
      { ...blankProfile(), references: "Reference Person" },
      "Private",
    ).included.includes("references"),
  );
});
const item = (str, x, y, width = str.length * 5) => ({
  str,
  transform: [10, 0, 0, 10, x, y],
  width,
  height: 10,
});
test("PDF words are joined by geometry and visually ordered even when drawing order is shuffled", () => {
  const text = pdfPageText(
    [
      item("audio", 80, 700),
      item("asic", 15, 700, 18),
      item("B", 10, 700, 5),
      item("engineering", 115, 700),
      item("Next line", 10, 680),
    ],
    612,
  );
  assert.equal(text, "Basic audio engineering\nNext line");
});
test("PDF gutters are read column by column while right-aligned dates remain on their row", () => {
  const twoColumns = [
    item("Skills", 40, 700, 40),
    item("Experience", 270, 700, 80),
    item("ProPresenter", 40, 680, 80),
    item("First Company", 270, 680, 130),
    item("Audio engineering", 40, 660, 100),
    item("Built useful applications", 270, 660, 150),
    item("Worship planning", 40, 640, 100),
    item("Managed a support team", 270, 640, 150),
  ];
  const text = pdfPageText(twoColumns, 612);
  assert.ok(text.indexOf("Worship planning") < text.indexOf("Experience"));
  const dates = [
    item("Company A", 40, 700, 100),
    item("2020 – 2021", 420, 700, 100),
    item("Company B", 40, 680, 100),
    item("2021 – 2022", 420, 680, 100),
    item("Company C", 40, 660, 100),
    item("2022 – 2023", 420, 660, 100),
  ];
  assert.equal(pdfPageText(dates, 612).split("\n")[0], "Company A 2020 – 2021");
});

test("merging preserves repeated role titles and duties under different employers while deduplicating repeated resumes", () => {
  const parsed = parseResume(fixture),
    first = mergeProfileField("", parsed.profile.experience, "experience");
  assert.equal((first.text.match(/MUSIC MINISTRY INTERN/g) || []).length, 3);
  assert.equal(
    mergeProfileField(first.text, parsed.profile.experience, "experience").text,
    first.text,
  );
  const extra = parsed.profile.experience.replace(
    "Serve on frontline praise team",
    "Serve on frontline praise team\n• Lead rehearsals",
  );
  const merged = mergeProfileField(first.text, extra, "experience");
  assert.equal((merged.text.match(/MUSIC MINISTRY INTERN/g) || []).length, 3);
  assert.match(merged.text, /Lead rehearsals/);
});

test("compound headings stay intact and employer names without suffixes are grouped by neighboring dates and titles", () => {
  const result = parseResume(
    "WORK EXPERIENCE\nAcme\nJanuary 2020 - May 2024\nSOFTWARE ENGINEER\nBuilt a useful service",
  );
  assert.equal(result.jobs[0].employer, "Acme");
  assert.match(result.profile.experience, /SOFTWARE ENGINEER/);
  assert.equal(result.unassigned, "");
  assert.equal(
    normalizeResumeText("PROFESSIONAL EXPERIENCE"),
    "PROFESSIONAL EXPERIENCE",
  );
});

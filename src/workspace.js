import { sections, resumeText } from "./model.js";
export const templates = {
  classic: { name: "Classic", font: "Georgia", color: "#263e38" },
  modern: { name: "Modern", font: "Arial", color: "#245b47" },
  compact: { name: "Compact", font: "Arial", color: "#333333" },
};
export const applicationStatuses = [
  "Interested",
  "Applied",
  "Interviewing",
  "Offer",
  "Closed",
];
export function coreState(state) {
  return structuredClone({
    profile: state.profile,
    versions: state.versions,
    imports: state.imports,
    applications: state.applications || [],
  });
}
export function boundedHistory(entries) {
  const list = entries
    .filter((entry) => JSON.stringify(entry).length <= 1000000)
    .slice(-20);
  while (list.length && JSON.stringify(list).length > 1000000) list.shift();
  return list;
}
export function checkpoint(state, previous, label = "Workspace edit") {
  if (JSON.stringify(coreState(state)) === JSON.stringify(previous))
    return false;
  state.history = boundedHistory([
    ...(state.history || []),
    {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      label,
      data: structuredClone(previous),
    },
  ]);
  state.future = [];
  return true;
}
export function undo(state) {
  const entry = state.history?.pop();
  if (!entry) return false;
  state.future = boundedHistory([
    ...(state.future || []),
    {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      label: entry.label,
      data: coreState(state),
    },
  ]);
  Object.assign(state, structuredClone(entry.data));
  return true;
}
export function redo(state) {
  const entry = state.future?.pop();
  if (!entry) return false;
  state.history = boundedHistory([
    ...(state.history || []),
    {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      label: entry.label,
      data: coreState(state),
    },
  ]);
  Object.assign(state, structuredClone(entry.data));
  return true;
}
export function restoreCheckpoint(state, id) {
  const entry = state.history.find((x) => x.id === id);
  if (!entry) return false;
  const before = coreState(state);
  Object.assign(state, structuredClone(entry.data));
  checkpoint(state, before, "Before restoring history");
  return true;
}
export function normalized(line) {
  return line
    .normalize("NFKC")
    .replace(/^[\s•*\-–]+/u, "")
    .replace(/\s+/g, " ")
    .replace(/[.,;:]+$/, "")
    .trim()
    .toLowerCase();
}
export function mergeLines(existing, incoming) {
  const seen = new Set(existing.split("\n").map(normalized).filter(Boolean));
  let duplicates = 0;
  const added = [];
  for (const line of incoming.split("\n")) {
    const token = normalized(line);
    if (!token) continue;
    if (seen.has(token)) {
      duplicates++;
      continue;
    }
    seen.add(token);
    added.push(line.trim());
  }
  return {
    text: [existing.trim(), added.join("\n")].filter(Boolean).join("\n\n"),
    added: added.length,
    duplicates,
  };
}
import { formatExperience } from "./importer.js";
export { parseResume } from "./importer.js";
export function mergeProfileField(existing, incoming, field) {
  if (!["experience", "education", "references"].includes(field))
    return mergeLines(existing, incoming);
  const blocks = existing
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  let added = 0,
    duplicates = 0;
  const identity = (block) => {
    if (field === "references") return normalized(block.split("\n")[0]);
    if (field !== "experience") return null;
    const jobs = formatExperience(block.split("\n")).jobs;
    if (jobs.length !== 1 || !jobs[0].employer) return null;
    const j = jobs[0];
    return [j.employer, j.role, ...j.dates].map(normalized).join("|");
  };
  for (const block of incoming
    .split(/\n\s*\n/)
    .map((s) => s.trim())
    .filter(Boolean)) {
    const exact = blocks.findIndex((b) => normalized(b) === normalized(block));
    if (exact >= 0) {
      duplicates += block.split("\n").filter(Boolean).length;
      continue;
    }
    const key = identity(block),
      index = key ? blocks.findIndex((b) => identity(b) === key) : -1;
    if (index >= 0) {
      const merged = mergeLines(blocks[index], block);
      blocks[index] = merged.text.replace(/\n\n/g, "\n");
      added += merged.added;
      duplicates += merged.duplicates;
    } else {
      blocks.push(block);
      added += block.split("\n").filter(Boolean).length;
    }
  }
  return { text: blocks.join("\n\n"), added, duplicates };
}

export function qualityChecks(version) {
  const p = version.profile,
    text = resumeText(version),
    issues = [];
  if (!p.name.trim())
    issues.push({ level: "warning", message: "Add your name." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email))
    issues.push({ level: "warning", message: "Add a valid contact email." });
  if (!version.included.includes("experience") || !p.experience.trim())
    issues.push({
      level: "suggestion",
      message:
        "Include relevant experience or explain your experience through projects.",
    });
  if (!p.education.trim())
    issues.push({
      level: "suggestion",
      message: "Consider adding education or relevant training.",
    });
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words > 750)
    issues.push({
      level: "warning",
      message: `This resume has about ${words} words. Consider shortening it for readability.`,
    });
  const ranges = [
    ...text.matchAll(/\b((?:19|20)\d{2})\s*[-–—]\s*((?:19|20)\d{2})\b/g),
  ];
  if (ranges.some((m) => +m[1] > +m[2]))
    issues.push({
      level: "warning",
      message: "A date range ends before it starts. Review your dates.",
    });
  if (
    /\b\d{1,2}\/\d{4}\b/.test(text) &&
    /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\b/i.test(
      text,
    )
  )
    issues.push({
      level: "suggestion",
      message: "Use a consistent date format across sections.",
    });
  if (
    /\b(?:responsible for|hard worker|team player|detail[- ]oriented)\b/i.test(
      text,
    )
  )
    issues.push({
      level: "suggestion",
      message: "Replace broad claims with specific examples of what you did.",
    });
  if (text.split("\n").some((line) => line.length > 650))
    issues.push({
      level: "suggestion",
      message: "Break long paragraphs into shorter statements or bullets.",
    });
  if (!issues.length)
    issues.push({
      level: "good",
      message:
        "No basic issues found. Proofread and verify all facts before submitting.",
    });
  return { words, issues };
}
const stop = new Set(
  "about after again also and are been being could from have into more most must need other our role should that their them there these they this those through using very were what when where which will with work would your years experience skills ability required requirements job team company responsibilities looking position candidate strong excellent including knowledge".split(
    " ",
  ),
);
export function jobKeywords(job) {
  return [
    ...new Set(
      (job.toLowerCase().match(/[a-z][a-z0-9+#.-]{2,}/g) || [])
        .map((x) => x.replace(/[.-]+$/, ""))
        .filter((x) => !stop.has(x)),
    ),
  ].slice(0, 40);
}
export function tailorRecommendations(profile, job) {
  const keywords = jobKeywords(job);
  const ranked = sections
    .filter((s) => s !== "references")
    .map((section) => {
      const text = profile[section];
      const matches = keywords.filter((k) => text.toLowerCase().includes(k));
      return { section, text, matches };
    })
    .filter((x) => x.text.trim())
    .sort((a, b) => b.matches.length - a.matches.length);
  const present = keywords.filter((k) =>
    ranked.some((r) => r.matches.includes(k)),
  );
  return {
    ranked,
    present,
    missing: keywords.filter((k) => !present.includes(k)),
  };
}
export function compareVersions(left, right) {
  return [
    "name",
    "headline",
    "email",
    "phone",
    "location",
    "links",
    ...sections,
  ]
    .map((field) => ({
      field,
      left: left.profile[field],
      right: right.profile[field],
      leftIncluded: !sections.includes(field) || left.included.includes(field),
      rightIncluded:
        !sections.includes(field) || right.included.includes(field),
    }))
    .filter(
      (row) => row.left !== row.right || row.leftIncluded !== row.rightIncluded,
    );
}
export function createApplication(version) {
  return {
    id: crypto.randomUUID(),
    company: "",
    role: "",
    url: "",
    status: "Interested",
    date: "",
    notes: "",
    resumeId: version?.id || "",
    resumeSnapshot: version ? structuredClone(version) : null,
    created: new Date().toISOString(),
  };
}

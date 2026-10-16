import { blankProfile, sections, resumeText } from "./model.js";
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
const headings = {
  summary: [
    "summary",
    "professional summary",
    "profile",
    "objective",
    "about me",
    "career summary",
  ],
  experience: [
    "experience",
    "work experience",
    "employment",
    "employment history",
    "professional experience",
    "work history",
  ],
  education: ["education", "academic background", "qualifications"],
  skills: [
    "skills",
    "technical skills",
    "core competencies",
    "competencies",
    "expertise",
  ],
  projects: [
    "projects",
    "selected projects",
    "personal projects",
    "certifications",
    "certificates",
    "awards",
  ],
};
export function parseResume(text) {
  const profile = blankProfile(),
    unassigned = [];
  let active = null;
  const lines = text.replace(/\r/g, "").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    const heading = normalized(line.replace(/:$/, ""));
    const section = sections.find((s) => headings[s].includes(heading));
    if (section) {
      active = section;
      continue;
    }
    if (active) profile[active] += (profile[active] ? "\n" : "") + line;
    else unassigned.push(line);
  }
  const intro = unassigned.join("\n");
  profile.email =
    (intro.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0] || "";
  profile.phone =
    (intro.match(
      /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\b\d{3})[ .-]\d{3}[ .-]\d{4}\b/,
    ) || [])[0] || "";
  profile.links = (
    intro.match(
      /(?:https?:\/\/|www\.)[^\s|]+|(?:linkedin\.com|github\.com)\/[^\s|]+/gi,
    ) || []
  ).join(" · ");
  const first = unassigned[0] || "";
  if (
    /^[\p{L} .'-]{3,70}$/u.test(first) &&
    first.split(/\s+/).length >= 2 &&
    first.split(/\s+/).length <= 5
  )
    profile.name = first;
  // Preserve ambiguous material for explicit user review instead of guessing its section.
  return {
    profile,
    unassigned: unassigned.filter((line) => line !== profile.name).join("\n"),
  };
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

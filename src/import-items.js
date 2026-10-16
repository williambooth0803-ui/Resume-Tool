import { blankProfile } from "./model.js";
import { parseResume } from "./importer.js";

export const itemCategories = [...Object.keys(blankProfile()), "unassigned"];
export const groupedCategories = ["experience", "education", "references"];
const clean = (text) => text.replace(/^\s*[•*–-]\s*/u, "").trim();

// A wrapped sentence is one item; explicit bullets, list separators and completed
// sentences are boundaries. Never split the commas within a responsibility.
export function splitLineItems(text, category) {
  return text
    .split(/\n|[•●▪◦‣]/u)
    .flatMap((line) =>
      category === "skills"
        ? line.split(/\s*[;|,]\s*/)
        : category === "experience"
          ? line.split(/;\s+|(?<=[.!?])\s+(?=[A-Z][a-z]+\s)/)
          : [line],
    )
    .map(clean)
    .filter(Boolean);
}

export function organizationFromParsed(
  sourceText,
  parsed,
  currentProfile = blankProfile(),
) {
  const items = [];
  let next = 0;
  const add = (category, text, group = "", kind = "text") => {
    for (const part of splitLineItems(
      text,
      category === "experience" && kind !== "duty" ? "text" : category,
    )) {
      items.push({
        id: `item-${++next}`,
        category,
        text: part,
        group,
        kind,
        selected:
          category !== "unassigned" &&
          (groupedCategories.includes(category) ||
            ![
              "name",
              "headline",
              "email",
              "phone",
              "location",
              "links",
            ].includes(category) ||
            !currentProfile[category]?.trim()),
      });
    }
  };
  for (const category of itemCategories) {
    if (category === "experience") {
      for (const [index, job] of (parsed.jobs || []).entries()) {
        const group = `job-${index + 1}`;
        add(category, job.employer, group, "employer");
        add(category, job.role, group, "role");
        job.dates.forEach((date) => add(category, date, group, "date"));
        job.bullets.forEach((duty) => add(category, duty, group, "duty"));
      }
      if (!parsed.jobs?.length && parsed.profile.experience)
        add(category, parsed.profile.experience, "job-1", "duty");
    } else if (groupedCategories.includes(category)) {
      for (const [index, block] of parsed.profile[category]
        .split(/\n\s*\n/)
        .entries())
        add(category, block, `${category}-${index + 1}`);
    } else
      add(
        category,
        category === "unassigned"
          ? parsed.unassigned
          : parsed.profile[category],
      );
  }
  return {
    sourceText,
    method: parsed.source || "automatic",
    warnings: parsed.warnings || [],
    items,
  };
}

export function extractResumeItems(text, profile) {
  return organizationFromParsed(text, parseResume(text), profile);
}

export function itemGroups(items, category) {
  const groups = new Map();
  for (const item of items.filter((item) => item.category === category)) {
    if (!groups.has(item.group)) groups.set(item.group, []);
    groups.get(item.group).push(item);
  }
  const result = [...groups].map(([id, rows], index) => ({
    id,
    label: id.startsWith("unassigned-")
      ? "No associated record — choose a group"
      : rows.find((row) => row.kind === "employer")?.text ||
        rows[0]?.text ||
        `Group ${index + 1}`,
    items: rows,
  }));
  if (category === "experience") {
    const anchor = (group) =>
      items.indexOf(
        group.items.find((row) => row.kind === "employer") ||
          group.items.find((row) => row.kind === "role") ||
          group.items[0],
      );
    result.sort((a, b) => anchor(a) - anchor(b));
  }
  return result;
}

export function moveItem(item, category) {
  if (!itemCategories.includes(category)) throw Error("Invalid item category.");
  if (item.category === category) return;
  item.category = category;
  item.group = groupedCategories.includes(category)
    ? `unassigned-${category}`
    : "";
  item.kind = category === "experience" ? "duty" : "text";
  item.selected = category !== "unassigned";
}

export function splitItem(items, id) {
  const index = items.findIndex((row) => row.id === id);
  if (index < 0) return false;
  const item = items[index];
  const parts = splitLineItems(item.text, item.category);
  if (parts.length < 2) return false;
  items.splice(
    index,
    1,
    ...parts.map((text) => ({
      ...item,
      id: crypto.randomUUID(),
      text,
    })),
  );
  return true;
}

export function itemsToProfile(items) {
  const profile = blankProfile();
  const selected = items.filter((row) => row.selected && row.text.trim());
  for (const category of Object.keys(profile)) {
    const rows = selected.filter((row) => row.category === category);
    const format = (row) =>
      category === "skills" ||
      (category === "experience" && row.kind === "duty")
        ? splitLineItems(row.text, category)
            .map((text) => `• ${text}`)
            .join("\n")
        : row.text.trim();
    profile[category] = groupedCategories.includes(category)
      ? itemGroups(rows, category)
          .map((group) => {
            const ordered = [...group.items];
            if (category === "experience") {
              const rank = { employer: 0, role: 1, date: 2, duty: 3, text: 3 };
              ordered.sort((a, b) => rank[a.kind] - rank[b.kind]);
            }
            return ordered.map(format).join("\n");
          })
          .join("\n\n")
      : rows.map(format).join(category === "links" ? " · " : "\n");
  }
  return profile;
}

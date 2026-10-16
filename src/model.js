export const sections = [
  "summary",
  "experience",
  "education",
  "skills",
  "projects",
  "references",
];
export const blankProfile = () => ({
  name: "",
  headline: "",
  email: "",
  phone: "",
  location: "",
  links: "",
  ...Object.fromEntries(sections.map((s) => [s, ""])),
});
export const emptyState = () => ({
  profile: blankProfile(),
  versions: [],
  imports: [],
  applications: [],
  history: [],
  future: [],
});
export function createVersion(profile, title, id = crypto.randomUUID()) {
  return {
    id,
    title: title.trim() || "Untitled resume",
    updated: new Date().toISOString(),
    job: "",
    template: "classic",
    profile: { ...blankProfile(), ...profile },
    included: sections.filter((s) => s !== "references"),
  };
}
export function validateState(value) {
  const validProfile = (p) => {
    if (p && typeof p === "object" && p.references === undefined)
      p.references = "";
    return (
      p && Object.keys(blankProfile()).every((k) => typeof p[k] === "string")
    );
  };
  if (
    !value ||
    !validProfile(value.profile) ||
    !Array.isArray(value.versions) ||
    !Array.isArray(value.imports)
  )
    throw new Error("Invalid backup file.");
  if (
    !value.versions.every(
      (v) =>
        (v.template === undefined ||
          ["classic", "modern", "compact"].includes(v.template)) &&
        (v.recommendationsJob === undefined ||
          typeof v.recommendationsJob === "string") &&
        (v.recommendations === undefined ||
          typeof v.recommendations === "string") &&
        typeof v.id === "string" &&
        typeof v.title === "string" &&
        typeof v.updated === "string" &&
        typeof v.job === "string" &&
        validProfile(v.profile) &&
        Array.isArray(v.included) &&
        v.included.every((s) => sections.includes(s)),
    )
  )
    throw new Error("Invalid resume in backup.");
  if (
    !value.imports.every(
      (i) =>
        typeof i.id === "string" &&
        typeof i.name === "string" &&
        typeof i.text === "string",
    )
  )
    throw new Error("Invalid document in backup.");
  if (
    value.applications !== undefined &&
    (!Array.isArray(value.applications) ||
      !value.applications.every(
        (a) =>
          a &&
          [
            "id",
            "company",
            "role",
            "url",
            "status",
            "date",
            "notes",
            "resumeId",
            "created",
          ].every((k) => typeof a[k] === "string") &&
          ["Interested", "Applied", "Interviewing", "Offer", "Closed"].includes(
            a.status,
          ) &&
          (a.resumeSnapshot === null || validVersion(a.resumeSnapshot)),
      ))
  )
    throw new Error("Invalid applications in backup.");
  for (const name of ["history", "future"])
    if (
      value[name] !== undefined &&
      (!Array.isArray(value[name]) ||
        value[name].length > 20 ||
        !value[name].every(
          (h) =>
            h &&
            typeof h.id === "string" &&
            typeof h.at === "string" &&
            typeof h.label === "string" &&
            h.data &&
            !("history" in h.data) &&
            !("future" in h.data) &&
            validateCore(h.data),
        ))
    )
      throw new Error("Invalid history in backup.");
  value.applications ??= [];
  value.history ??= [];
  value.future ??= [];
  return value;
}
export function resumeText(version) {
  const p = version.profile;
  return [
    p.name,
    p.headline,
    [p.email, p.phone, p.location, p.links].filter(Boolean).join(" | "),
    ...sections
      .filter((s) => version.included.includes(s) && p[s].trim())
      .flatMap((s) => [s.toUpperCase(), p[s]]),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function validVersion(v) {
  try {
    validateState({ profile: blankProfile(), versions: [v], imports: [] });
    return true;
  } catch {
    return false;
  }
}
function validateCore(data) {
  try {
    validateState(data);
    delete data.history;
    delete data.future;
    return true;
  } catch {
    return false;
  }
}

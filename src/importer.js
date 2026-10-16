import { blankProfile, sections } from "./model.js";
const aliases = {
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
  references: ["references", "professional references", "referees"],
  contact: [
    "contact",
    "contact information",
    "contact details",
    "personal details",
  ],
};
const headingEntries = Object.entries(aliases).flatMap(([category, names]) =>
  names.map((name) => ({ category, name })),
);
const repairedWords = [
  "basic",
  "worship",
  "mission",
  "design",
  "midweek",
  "scripture",
  "amarillo",
  "engineering",
  "planning",
  "preparation",
  "contemporary",
  "traditional",
  "ministry",
  "experience",
  "education",
  "references",
  "contact",
  "skills",
  "university",
  "college",
  "management",
  "communication",
];
const month =
  "(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan\\.?|Feb\\.?|Mar\\.?|Apr\\.?|Jun\\.?|Jul\\.?|Aug\\.?|Sep(?:t)?\\.?|Oct\\.?|Nov\\.?|Dec\\.?)";
const monthYear = `${month}\\s+(?:19|20)\\d{2}`;
const range = `${monthYear}\\s*[-–—]\\s*(?:${monthYear}|Present|Current)`;
const datePattern = new RegExp(
  `(?:${range})(?:[ \\t]*,[ \\t]*(?:${range}))*|${monthYear}`,
  "gi",
);
const dateOnly = new RegExp(
  `^(?:(?:${range})(?:\\s*,\\s*${range})*|${monthYear}|(?:19|20)\\d{2}\\s*[-–—]\\s*(?:(?:19|20)\\d{2}|Present|Current))$`,
  "i",
);
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const phonePattern =
  /(?:\+\d{1,3}[ .-]?)?(?:\(\d{3}\)|\b\d{3})[ .-]?\d{3}[ .-]\d{4}\b/;
const rolePattern =
  /\b(?:intern|engineer|developer|manager|director|assistant|coordinator|specialist|teacher|pastor|leader|designer|analyst|consultant|musician|volunteer|nurse|supervisor|administrator|technician|associate|officer)\b/i;
const actionPattern =
  /^(?:[•*\-]\s*)?(?:serve[ds]?|plan(?:ned)?|lead|led|set up|represent(?:ed)?|manage[ds]?|assist(?:ed)?|direct(?:ed)?|play(?:ed)?|design(?:ed)?|organize[ds]?|create[ds]?|carry|carried|build|built|develop(?:ed)?|implement(?:ed)?|support(?:ed)?|coordinate[ds]?|prepare[ds]?|execute[ds]?|maintain(?:ed)?|improve[ds]?|deliver(?:ed)?|achieve[ds]?|train(?:ed)?|teach|taught|conduct(?:ed)?|perform(?:ed)?|work(?:ed)?|research(?:ed)?|write|wrote|establish(?:ed)?|motivate[ds]?|communicate[ds]?|increas(?:e|ed)|reduc(?:e|ed))\b/i;
const institutionPattern =
  /\b(?:university|college|conservatory|institute|academy|high school)\b/i;
const educationPattern =
  /^(?:B\.?\s?M\.?\s*[:–-]|B\.?[AS]\.?\s|BSc\b|BA\b|BS\b|MA\b|MS\b|MBA\b|Ph\.?D\b|Bachelor|Master|Doctor|Associate(?:'s)? degree|GPA\b|Major GPA\b|Dean['’]s List\b|Honors?\b|Graduat(?:ion|ed)|Expected\b|Diploma\b)/i;
const employerPattern = /\s[-–—|]\s+[\p{L} .'-]+,\s*[A-Z]{2}\b/u;
const skillPattern =
  /\b(?:skills?|ProPresenter|audio engineering|worship|planning|leadership|management|communication|Python|SQL|JavaScript|TypeScript|Excel|PowerPoint|Microsoft|Adobe|React|HTML|CSS|CPR|guitar|piano|singing|voice|engineering)\b/i;
const headingFor = (line) =>
  headingEntries.find(
    (h) => h.name === line.toLowerCase().replace(/:$/, "").trim(),
  )?.category;
const cleanBullet = (line) => line.replace(/^[\s•*\-–]+/u, "").trim();
const unique = (lines) => {
  const seen = new Set();
  return lines.filter((line) => {
    const key = cleanBullet(line).toLowerCase().replace(/\s+/g, " ");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
export function normalizeResumeText(input) {
  let text = String(input)
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00ad/g, "")
    .replace(/[\u200b\ufeff]/g, "")
    .replace(/\u00a0/g, " ");
  for (const word of repairedWords) {
    const re = new RegExp(`\\b${word.split("").join("[ \\t]*")}\\b`, "gi");
    text = text.replace(re, (match) => match.replace(/[ \t]/g, ""));
  }
  // One replacement pass avoids splitting WORK EXPERIENCE into WORK + EXPERIENCE.
  const headingPatterns = [...headingEntries]
    .sort((a, b) => b.name.length - a.name.length)
    .map(({ name }) =>
      name
        .toUpperCase()
        .split("")
        .map((c) => (c === " " ? "[ \\t]+" : c))
        .join("[ \\t]*"),
    );
  text = text.replace(
    new RegExp(
      `(?<![\\p{L}])(?:${headingPatterns.join("|")})(?![\\p{L}])`,
      "gu",
    ),
    (match) => {
      const compact = match.replace(/[ \t]/g, "").toLowerCase();
      const entry = headingEntries.find(
        (h) => h.name.replace(/ /g, "") === compact,
      );
      return "\n" + entry.name.toUpperCase() + "\n";
    },
  );
  text = text.replace(
    /\b(?:B\.?M\.?|B\.?[AS]\.?|M\.?[AS]\.?|Ph\.?D\.?)\s*[:–-]/g,
    (match) => "\n" + match,
  );
  text = text.replace(
    datePattern,
    (match) =>
      `\n${match
        .replace(/\s*[-–—]\s*/g, " – ")
        .replace(/[ \t]+/g, " ")
        .trim()}\n`,
  );
  // Separate employer/location headers and titles that were flattened into bullets.
  text = text.replace(
    /\b(?:[A-Z][\p{L}'&.]*[ \t]+){1,12}[-–—][ \t]+[A-Z][\p{L} .'-]*,[ \t]*[A-Z]{2}\b/gu,
    (match) => `\n${match}\n`,
  );
  text = text.replace(
    /\b(?:[A-Z][A-Z/&-]*[ \t]+){0,4}(?:INTERN|ENGINEER|MANAGER|DIRECTOR|ASSISTANT|COORDINATOR|DEVELOPER|SPECIALIST|TEACHER|PASTOR|ANALYST|DESIGNER|VOLUNTEER)\b/g,
    (match) => `\n${match}\n`,
  );
  text = text.replace(
    /\b(?:[A-Z][A-Z.'&-]*[ \t]+){1,6}(?:UNIVERSITY|COLLEGE|CONSERVATORY|INSTITUTE)\b/g,
    (match) => `\n${match}\n`,
  );
  text = text
    .replace(new RegExp(emailPattern.source, "gi"), (match) => `\n${match}\n`)
    .replace(new RegExp(phonePattern.source, "g"), (match) => `\n${match}\n`);
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}
function isRole(line) {
  return (
    line.length < 100 &&
    rolePattern.test(line) &&
    !actionPattern.test(line) &&
    !employerPattern.test(line) &&
    !institutionPattern.test(line)
  );
}
function isName(line) {
  return (
    line
      .split(/\s+/)
      .every(
        (word) =>
          /^[\p{Lu}]/u.test(word) ||
          /^(?:de|del|la|van|von|da|di)$/i.test(word),
      ) &&
    /^[\p{L}][\p{L} .'-]{2,65}$/u.test(line) &&
    line.split(/\s+/).length >= 2 &&
    line.split(/\s+/).length <= 5 &&
    !rolePattern.test(line) &&
    !skillPattern.test(line) &&
    !institutionPattern.test(line) &&
    !headingFor(line)
  );
}
function isInstitution(line) {
  return (
    institutionPattern.test(line) &&
    !actionPattern.test(line) &&
    line.length < 140 &&
    !/[()]/.test(line) &&
    (/\b(?:University|College|Conservatory|Institute|Academy|High School)\b/.test(
      line,
    ) ||
      line === line.toUpperCase())
  );
}
function isEmployerHeader(line, next = "", allowGeneric = true) {
  if (
    employerPattern.test(line) ||
    (/\b(?:Church|Company|Corporation|Hospital|Ministries|LLC|Inc\.?)\b/.test(
      line,
    ) &&
      !actionPattern.test(line) &&
      line.length < 130)
  )
    return true;
  return (
    allowGeneric &&
    line.length < 100 &&
    /^[\p{Lu}0-9]/u.test(line) &&
    !actionPattern.test(line) &&
    !educationPattern.test(line) &&
    !dateOnly.test(line) &&
    !isInstitution(line) &&
    !isRole(line) &&
    (dateOnly.test(next) || isRole(next))
  );
}
export function formatExperience(lines) {
  const jobs = [];
  let job = { employer: "", role: "", dates: [], bullets: [] };
  const finish = () => {
    if (job.employer || job.role || job.dates.length || job.bullets.length)
      jobs.push(job);
    job = { employer: "", role: "", dates: [], bullets: [] };
  };
  for (let i = 0; i < lines.length; i++) {
    const line = cleanBullet(lines[i]);
    if (!line) continue;
    const employer = isEmployerHeader(line, lines[i + 1] || "");
    if (employer) {
      if (job.employer || job.role || job.bullets.length) finish();
      job.employer = line;
    } else if (dateOnly.test(line)) {
      if (
        job.bullets.length &&
        isEmployerHeader(lines[i + 1] || "", lines[i + 2] || "")
      )
        finish();
      job.dates.push(line);
    } else if (isRole(line)) {
      if (job.role && job.bullets.length) finish();
      job.role = line;
    } else if (
      job.bullets.length &&
      !actionPattern.test(lines[i]) &&
      !/^[•*\-]/.test(lines[i])
    )
      job.bullets[job.bullets.length - 1] += " " + line;
    else job.bullets.push(line);
  }
  finish();
  return {
    jobs,
    text: jobs
      .map((j) =>
        [
          j.employer,
          j.role,
          ...unique(j.dates),
          ...unique(j.bullets).map((b) => "• " + b),
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n\n"),
  };
}
function formatEducation(lines) {
  const content = unique(lines.map(cleanBullet));
  const schools = content.filter(isInstitution);
  if (schools.length === 1)
    return [schools[0], ...content.filter((x) => x !== schools[0])].join("\n");
  return content.join("\n");
}
export function formatImportProfile(profile) {
  const result = { ...blankProfile(), ...profile };
  const experience = formatExperience(result.experience.split("\n"));
  result.experience = experience.text;
  result.education = formatEducation(result.education.split("\n"));
  result.skills = unique(result.skills.split("\n").map(cleanBullet))
    .map((s) => "• " + s)
    .join("\n");
  return { profile: result, jobs: experience.jobs };
}
export function parseResume(input) {
  const text = normalizeResumeText(input),
    lines = text.split("\n"),
    profile = blankProfile(),
    buckets = Object.fromEntries(sections.map((s) => [s, []])),
    unassigned = [],
    refs = [];
  let active = null,
    currentRef = null,
    seenWork = false,
    seenSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i],
      heading = headingFor(line);
    if (heading) {
      active = heading;
      currentRef = null;
      seenSection = true;
      continue;
    }
    const followingLines = lines.slice(i + 1, i + 7),
      nextHeading = followingLines.findIndex((line) => headingFor(line));
    const following = followingLines
      .slice(0, nextHeading < 0 ? undefined : nextHeading)
      .join("\n");
    const refStart =
      active !== "contact" &&
      isName(line) &&
      !actionPattern.test(line) &&
      (active === "references" || seenWork || !!profile.email) &&
      phonePattern.test(following) &&
      emailPattern.test(following);
    if (refStart) {
      currentRef = { name: line, details: [] };
      refs.push(currentRef);
      active = "references";
      continue;
    }
    if (currentRef && active === "references") {
      currentRef.details.push(line);
      continue;
    }
    if (educationPattern.test(line) || isInstitution(line)) {
      active = "education";
      currentRef = null;
      seenWork = true;
      buckets.education.push(line);
      continue;
    }
    const employer = isEmployerHeader(
      line,
      lines[i + 1] || "",
      active === "experience",
    );
    if (employer) {
      active = "experience";
      currentRef = null;
      seenWork = true;
      buckets.experience.push(line);
      continue;
    }
    if (!seenSection && profile.name && !profile.headline && isRole(line)) {
      profile.headline = line;
      continue;
    }
    if (
      isRole(line) &&
      (active === "experience" ||
        dateOnly.test(lines[i - 1] || "") ||
        employerPattern.test(lines[i - 1] || ""))
    ) {
      active = "experience";
      buckets.experience.push(line);
      continue;
    }
    if (dateOnly.test(line)) {
      const next = lines[i + 1] || "";
      if (isEmployerHeader(next, lines[i + 2] || "")) {
        active = "experience";
        seenWork = true;
      }
      if (active === "experience" || active === "education")
        buckets[active].push(line);
      else unassigned.push(line);
      continue;
    }
    const contactAllowed = active === "contact" || !seenWork;
    const email = line.match(emailPattern)?.[0],
      phone = line.match(phonePattern)?.[0];
    if (contactAllowed && (email || phone)) {
      if (email && !profile.email) profile.email = email;
      if (phone && !profile.phone) profile.phone = phone;
      const rest = line
        .replace(emailPattern, "")
        .replace(phonePattern, "")
        .trim();
      if (rest) unassigned.push(rest);
      continue;
    }
    if (
      contactAllowed &&
      /^[\p{L} .'-]+,\s*[A-Z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/u.test(line)
    ) {
      profile.location = line;
      continue;
    }
    if (
      contactAllowed &&
      /(?:https?:\/\/|www\.|linkedin\.com\/|github\.com\/)/i.test(line)
    ) {
      profile.links = [profile.links, line].filter(Boolean).join(" · ");
      continue;
    }
    if (
      !seenSection &&
      !profile.name &&
      isName(line) &&
      !actionPattern.test(line) &&
      i < 4 &&
      (phonePattern.test(following) || emailPattern.test(following))
    ) {
      profile.name = line;
      continue;
    }
    if (active === "references") {
      if (currentRef) currentRef.details.push(line);
      else buckets.references.push(line);
      continue;
    }
    if (active === "contact") {
      if (!profile.name && isName(line)) profile.name = line;
      else unassigned.push(line);
      continue;
    }
    if (
      active === "skills" ||
      (!active && skillPattern.test(line) && line.length < 120)
    ) {
      if (
        buckets.skills.length &&
        /^(?:and\b|or\b|[a-z])/.test(line) &&
        !skillPattern.test(line)
      )
        buckets.skills[buckets.skills.length - 1] += " " + line;
      else buckets.skills.push(line);
      continue;
    }
    if (active && buckets[active]) buckets[active].push(line);
    else if (buckets.skills.length && /^(?:and|or)\b/.test(line))
      buckets.skills[buckets.skills.length - 1] += " " + line;
    else unassigned.push(line);
  }
  for (const section of sections)
    profile[section] = buckets[section].join("\n");
  profile.references = [
    profile.references,
    ...refs.map((ref) => [ref.name, ...unique(ref.details)].join("\n")),
  ]
    .filter(Boolean)
    .join("\n\n");
  const formatted = formatImportProfile(profile);
  const warnings = [];
  if (unassigned.length)
    warnings.push(
      "Some text could not be assigned confidently. It is preserved below for review.",
    );
  return {
    ...formatted,
    unassigned: unassigned.join("\n"),
    warnings,
    source: "automatic",
  };
}
// AI may choose source spans, but cannot introduce new facts into the organized result.
export function organizeSourceSegments(source, segments) {
  if (!Array.isArray(segments) || segments.length > 200)
    throw Error("Invalid organized response.");
  const normalized = normalizeResumeText(source);
  const canonical = (text) =>
    text.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  const haystack = canonical(normalized);
  const profile = blankProfile(),
    unassigned = [];
  for (const segment of segments) {
    if (
      !segment ||
      typeof segment.text !== "string" ||
      !segment.text.trim() ||
      segment.text.length > 12000 ||
      ![...Object.keys(profile), "unassigned"].includes(segment.category) ||
      !haystack.includes(canonical(segment.text))
    )
      throw Error(
        "The organizer returned information not supported by the source.",
      );
    if (segment.category === "unassigned") unassigned.push(segment.text);
    else
      profile[segment.category] +=
        (profile[segment.category] ? "\n" : "") + segment.text.trim();
  }
  for (const line of normalized.split("\n"))
    if (
      !headingFor(line) &&
      !segments.some((segment) =>
        canonical(segment.text).includes(canonical(line)),
      )
    )
      unassigned.push(line);
  for (const field of [
    "name",
    "headline",
    "email",
    "phone",
    "location",
    "links",
  ])
    profile[field] = unique(profile[field].split("\n")).join(
      field === "links" ? " · " : " ",
    );
  return {
    ...formatImportProfile(profile),
    unassigned: unique(unassigned).join("\n"),
    warnings: [
      "AI organization must be reviewed for correct grouping before adding it.",
    ],
    source: "ai",
  };
}

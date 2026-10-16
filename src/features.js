import { sections, resumeText } from "./model.js";
import {
  templates,
  parseResume,
  mergeProfileField,
  qualityChecks,
  tailorRecommendations,
  compareVersions,
  createApplication,
  applicationStatuses,
} from "./workspace.js";
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const label = (s) => s[0].toUpperCase() + s.slice(1);
export const featurePages = {
  history: [
    "History & undo",
    "Restore a previous workspace or recover a deleted resume.",
  ],
  applications: [
    "Application tracker",
    "Keep the role, status, notes, and exact resume sent to each employer.",
  ],
  compare: [
    "Compare resumes",
    "Review the differences between two resume versions.",
  ],
  account: [
    "Account & cloud sync",
    "Keep a local workspace or connect a private account to sync across devices.",
  ],
};
export function createFeatures(ctx) {
  let parsed = null,
    parsedId = null,
    parsedSource = null,
    organizing = false,
    organizeRun = 0,
    appId = null,
    leftId = null,
    rightId = null;
  const state = () => ctx.getState();
  function importReview(item) {
    if (!item) return "";
    if (parsedId !== item.id || parsedSource !== item.text || !parsed) {
      parsed = parseResume(item.text);
      parsedId = item.id;
      parsedSource = item.text;
    }
    const fields = Object.entries(parsed.profile).filter(([, text]) =>
      text.trim(),
    );
    return `<section class="card organized-import"><span class="eyebrow">AUTOMATICALLY ORGANIZED</span><h2>Your information, sorted</h2><p class="muted">Contact details, experience, education, skills, and references are separated below. Review the result, then add the selected information in one step. Matching lines are skipped and existing contact details are kept unless you choose to replace them.</p><div class="actions wrap"><button class="secondary" id="parse-import">Reorganize document</button><button class="secondary" id="ai-organize" ${organizing || !ctx.canAIOrganize() ? "disabled" : ""}>${organizing ? "Organizing…" : "Improve organization with AI"}</button></div><p class="small muted">${parsed.source === "ai" ? "Organized with AI; verify that each fact is under the right person and role." : "Organized locally in your browser. AI is optional and requires sign-in."}</p>${parsed.warnings?.length ? `<p class="import-warning">${parsed.warnings.map(esc).join(" ")}</p>` : ""}<div id="parsed-review"><label class="field spaced">How to add organized categories<select id="import-mode"><option value="merge">Merge with existing information</option><option value="replace">Replace selected categories with this document</option></select></label><p class="small muted">Use Replace to clean up a resume that was previously added with mixed formatting. The previous profile is kept in history when it fits the storage limit.</p>${fields
      .map(([field, text]) => {
        const merged = sections.includes(field)
          ? mergeProfileField(state().profile[field], text, field)
          : null;
        const checked = sections.includes(field)
          ? merged.added > 0
          : !state().profile[field];
        return `<div class="parsed-field"><label class="check"><input type="checkbox" data-approve="${field}" ${checked ? "checked" : ""}> Add ${label(field)} ${merged ? `(${merged.duplicates} matching lines already in profile)` : state().profile[field] ? "(replaces current value)" : ""}</label><textarea aria-label="Review ${label(field)}" data-parsed="${field}" rows="${field === "experience" ? 12 : field === "references" ? 8 : 3}">${esc(text)}</textarea></div>`;
      })
      .join(
        "",
      )}${!fields.length ? "<p>No categories could be identified confidently. Try AI organization or use the source text below.</p>" : ""}${parsed.unassigned ? `<details open class="unassigned"><summary>Needs review — preserved source text</summary><p class="prewrap">${esc(parsed.unassigned)}</p></details>` : ""}<button class="primary" id="apply-parsed" ${fields.length ? "" : "disabled"}>Add approved information</button></div></section>`;
  }
  function pasteForm() {
    return `<section class="card"><h2>Already have extracted text?</h2><label class="field">Paste a resume<textarea id="paste-resume" rows="5" placeholder="Paste the full resume, even if headings and spacing are messy."></textarea></label><button class="secondary spaced" id="organize-paste">Organize pasted resume</button></section>`;
  }
  function versionTools(v) {
    const check = qualityChecks(v),
      tailored = tailorRecommendations(state().profile, v.job);
    return `<section class="card"><div class="section-top"><h2>Layout & quality</h2><button class="secondary" id="track-version">Track application</button></div><label class="field">Resume template<select id="template">${Object.entries(
      templates,
    )
      .map(
        ([id, t]) =>
          `<option value="${id}" ${v.template === id ? "selected" : ""}>${t.name}</option>`,
      )
      .join(
        "",
      )}</select></label><p class="muted">All layouts use a single column and selectable text. Basic checks are guidance; hiring systems differ.</p><div id="quality-results">${qualityHTML(check)}</div></section><section class="card"><span class="eyebrow">MANUAL TAILORING · NO AI REQUIRED</span><h2>Relevant experience from your profile</h2><button class="secondary" id="find-relevant">Find relevant content</button>${v.job.trim() ? `<p class="muted">Matches use words in the job description. Read the context before adding anything; a keyword is not evidence of a qualification.</p>${tailored.ranked.map((r) => `<div class="tailor-row"><strong>${label(r.section)}</strong><p class="small">${r.matches.length ? `Matching terms: ${esc(r.matches.join(", "))}` : "No keyword matches; consider whether this section is relevant."}</p><details><summary>View existing information</summary><p class="prewrap">${esc(r.text)}</p></details><button class="secondary" data-tailor="${r.section}">Add existing ${r.section}</button></div>`).join("")}${tailored.missing.length ? `<p class="muted">Not found in your profile: ${esc(tailored.missing.join(", "))}. Add only qualifications you actually have.</p>` : ""}` : '<p class="muted">Add a target job description above to see relevant sections and missing terms. These recommendations work without an AI account.</p>'}</section>`;
  }
  function qualityHTML(result) {
    return `<p class="small muted">About ${result.words} words</p><ul class="quality-list">${result.issues.map((i) => `<li class="quality-${i.level}">${esc(i.message)}</li>`).join("")}</ul>`;
  }
  function historyPage() {
    return `<div class="card"><h2>Undo, redo, and restore</h2><p class="muted">Up to 20 recent saved workspace snapshots are retained within a storage budget, including deleted documents, resumes, and application records. Restoring replaces the workspace; the current workspace is saved in history first.</p><div class="actions"><button class="secondary" id="history-undo" ${!state().history.length ? "disabled" : ""}>Undo last change</button><button class="secondary" id="history-redo" ${!state().future.length ? "disabled" : ""}>Redo</button><button class="secondary" id="checkpoint">Save named checkpoint</button></div></div>${
      [...state().history]
        .reverse()
        .map(
          (h) =>
            `<section class="card history-row"><div><h2>${esc(h.label)}</h2><p class="muted">${esc(new Date(h.at).toLocaleString())} · ${h.data.versions.length} resumes · ${h.data.imports.length} documents</p></div><button class="secondary" data-restore-history="${esc(h.id)}">Restore snapshot</button></section>`,
        )
        .join("") ||
      '<div class="card"><p class="muted">Your first edit creates a recoverable snapshot automatically.</p></div>'
    }`;
  }
  function applicationsPage() {
    let app = state().applications.find((a) => a.id === appId);
    return `<button class="primary" id="new-application">＋ Add application</button><div class="application-grid"><section class="card"><h2>Applications (${state().applications.length})</h2>${
      state()
        .applications.map(
          (a) =>
            `<button class="application-row ${appId === a.id ? "chosen" : ""}" data-app="${esc(a.id)}"><strong>${esc(a.role || "Untitled role")}</strong><span>${esc(a.company || "Company")} · ${esc(a.status)}</span></button>`,
        )
        .join("") ||
      '<p class="muted">Save an opportunity or use “Track application” on a resume.</p>'
    }</section><section class="card">${
      app
        ? `<h2>Application details</h2><div class="fields">${["company", "role", "url", "date"].map((f) => `<label class="field">${label(f)}<input aria-label="Application ${f}" data-app-field="${f}" type="${f === "date" ? "date" : "text"}" value="${esc(app[f])}"></label>`).join("")}<label class="field">Status<select aria-label="Application status" data-app-field="status">${applicationStatuses.map((s) => `<option ${app.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></label><label class="field">Attach resume version<select id="application-resume"><option value="">Choose a resume</option>${state()
            .versions.map(
              (v) =>
                `<option value="${esc(v.id)}" ${app.resumeId === v.id ? "selected" : ""}>${esc(v.title)}</option>`,
            )
            .join(
              "",
            )}</select></label></div><label class="field spaced">Notes<textarea aria-label="Application notes" data-app-field="notes" rows="5">${esc(app.notes)}</textarea></label><p class="muted">Attaching a resume saves an independent copy, so later edits or deletion of the source resume do not change your application record. Reattach to replace it.</p>${app.resumeSnapshot ? `<details><summary>Saved resume: ${esc(app.resumeSnapshot.title)}</summary><p class="prewrap">${esc(resumeText(app.resumeSnapshot))}</p></details><div class="actions spaced"><button class="secondary" id="application-word">Download attached Word</button><button class="secondary" id="application-pdf">Download attached PDF</button></div>` : ""}<button class="danger spaced" id="delete-application">Delete application</button>`
        : '<h2>Select an application</h2><p class="muted">Record where you applied, what you sent, and what happens next.</p>'
    }</section></div>`;
  }
  function comparePage() {
    const versions = state().versions;
    leftId = versions.some((v) => v.id === leftId) ? leftId : versions[0]?.id;
    rightId = versions.some((v) => v.id === rightId)
      ? rightId
      : versions[1]?.id;
    const a = versions.find((v) => v.id === leftId),
      b = versions.find((v) => v.id === rightId);
    return `<section class="card"><div class="fields">${[
      ["left", leftId],
      ["right", rightId],
    ]
      .map(
        ([side, id]) =>
          `<label class="field">${label(side)} resume<select id="compare-${side}"><option value="">Choose a resume</option>${versions.map((v) => `<option value="${esc(v.id)}" ${id === v.id ? "selected" : ""}>${esc(v.title)}</option>`).join("")}</select></label>`,
      )
      .join("")}</div></section>${
      a && b
        ? `<div class="card"><p class="muted">Left: ${esc(a.title)} · ${esc(a.template || "classic")} layout &nbsp; | &nbsp; Right: ${esc(b.title)} · ${esc(b.template || "classic")} layout</p>${
            compareVersions(a, b)
              .map(
                (r) =>
                  `<section class="comparison-section"><h2>${label(r.field)}</h2><div class="compare-grid"><div class="${r.leftIncluded ? "" : "excluded"}"><small>${r.leftIncluded ? "Included" : "Excluded from export"}</small><p class="prewrap">${esc(r.left || "(empty)")}</p></div><div class="${r.rightIncluded ? "" : "excluded"}"><small>${r.rightIncluded ? "Included" : "Excluded from export"}</small><p class="prewrap">${esc(r.right || "(empty)")}</p></div></div></section>`,
              )
              .join("") || "<p>The content and included sections match.</p>"
          }</div>`
        : '<div class="card"><p class="muted">Create at least two versions and choose them above to compare their content and included sections.</p></div>'
    }`;
  }
  function bind() {
    const on = (id, event, fn) =>
      document.getElementById(id)?.addEventListener(event, fn);
    on("parse-import", "click", () => {
      const item = ctx.currentImport();
      if (item) {
        parsed = parseResume(item.text);
        parsedId = item.id;
        parsedSource = item.text;
        ctx.render();
      }
    });
    on("organize-paste", "click", () => {
      const text = document.getElementById("paste-resume").value.trim();
      if (!text) return ctx.toast("Paste your resume text first.", true);
      if (text.length > 100000)
        return ctx.toast(
          "Paste at most 100,000 characters per document.",
          true,
        );
      ctx.addImport("Pasted resume", text);
    });
    document.querySelectorAll("[data-parsed]").forEach((el) =>
      el.addEventListener("input", () => {
        parsed.profile[el.dataset.parsed] = el.value;
      }),
    );
    on("ai-organize", "click", async () => {
      const item = ctx.currentImport();
      if (!item || organizing) return;
      if (
        !confirm(
          "Send this document’s extracted text, including any reference contact details, to OpenAI for organization? Your master profile will stay unchanged until you approve the result.",
        )
      )
        return;
      const id = item.id,
        source = item.text,
        run = ++organizeRun;
      organizing = true;
      ctx.render();
      let failure;
      try {
        const result = await ctx.organizeImport(item);
        if (!result || run !== organizeRun) return;
        if (
          ctx.currentImport()?.id !== id ||
          ctx.currentImport()?.text !== source
        )
          throw Error(
            "The document changed. Run organization again on the updated source.",
          );
        parsed = result;
        parsedId = id;
        parsedSource = source;
      } catch (error) {
        failure = error.message;
      } finally {
        if (run === organizeRun) {
          organizing = false;
          ctx.render();
          if (failure) ctx.toast(failure, true);
        }
      }
    });
    on("import-mode", "change", (e) => {
      if (e.target.value === "replace")
        document.querySelectorAll("[data-approve]").forEach((box) => {
          if (sections.includes(box.dataset.approve)) box.checked = true;
        });
    });
    on("apply-parsed", "click", () => {
      if (parsedSource !== ctx.currentImport()?.text) {
        parsed = parseResume(ctx.currentImport().text);
        parsedSource = ctx.currentImport().text;
        ctx.render();
        return ctx.toast(
          "Categories were updated from your edited source. Review and approve them.",
        );
      }
      const replace =
        document.getElementById("import-mode").value === "replace";
      if (
        replace &&
        [...document.querySelectorAll("[data-approve]:checked")].some(
          (box) =>
            sections.includes(box.dataset.approve) &&
            state().profile[box.dataset.approve].trim(),
        ) &&
        !confirm(
          "Replace the selected profile categories with this organized document? Other fields stay unchanged.",
        )
      )
        return;
      let count = 0;
      document.querySelectorAll("[data-approve]:checked").forEach((box) => {
        const field = box.dataset.approve,
          text = document
            .querySelector(`[data-parsed="${field}"]`)
            .value.trim();
        if (!text) return;
        const old = state().profile[field];
        state().profile[field] =
          sections.includes(field) && !replace
            ? mergeProfileField(old, text, field).text
            : text;
        if (old !== state().profile[field]) count++;
      });
      ctx.save({ label: "Approved structured import" });
      parsed = null;
      ctx.render();
      ctx.toast(
        `${count} profile fields updated. Duplicate lines were skipped.`,
      );
    });
    on("find-relevant", "click", () => ctx.render());
    on("template", "change", (e) => {
      ctx.current().template = e.target.value;
      ctx.save({ label: "Changed resume template" });
      ctx.render();
    });
    on("track-version", "click", () => {
      const app = createApplication(ctx.current());
      state().applications.unshift(app);
      appId = app.id;
      ctx.save({ label: "Tracked application" });
      ctx.navigate("applications");
    });
    document.querySelectorAll("[data-tailor]").forEach(
      (b) =>
        (b.onclick = () => {
          const s = b.dataset.tailor;
          ctx.current().profile[s] = mergeProfileField(
            ctx.current().profile[s],
            state().profile[s],
            s,
          ).text;
          if (!ctx.current().included.includes(s))
            ctx.current().included.push(s);
          ctx.save({ label: "Added relevant profile information" });
          ctx.render();
          ctx.toast(
            "Existing profile information added. Review its relevance before submitting.",
          );
        }),
    );
    on("history-undo", "click", ctx.undo);
    on("history-redo", "click", ctx.redo);
    on("checkpoint", "click", () => {
      const name = prompt("Checkpoint name");
      if (name?.trim()) ctx.checkpoint(name.trim());
    });
    document.querySelectorAll("[data-restore-history]").forEach(
      (b) =>
        (b.onclick = () => {
          if (
            confirm(
              "Restore this workspace snapshot? Your current workspace will be kept in history.",
            )
          )
            ctx.restoreHistory(b.dataset.restoreHistory);
        }),
    );
    on("new-application", "click", () => {
      const a = createApplication();
      state().applications.unshift(a);
      appId = a.id;
      ctx.save({ label: "Added application" });
      ctx.render();
    });
    document.querySelectorAll("[data-app]").forEach(
      (b) =>
        (b.onclick = () => {
          appId = b.dataset.app;
          ctx.render();
        }),
    );
    document.querySelectorAll("[data-app-field]").forEach((el) =>
      el.addEventListener(el.tagName === "SELECT" ? "change" : "input", () => {
        const a = state().applications.find((a) => a.id === appId);
        a[el.dataset.appField] = el.value;
        const row = [...document.querySelectorAll("[data-app]")].find(
          (b) => b.dataset.app === appId,
        );
        if (row) {
          row.querySelector("strong").textContent = a.role || "Untitled role";
          row.querySelector("span").textContent =
            `${a.company || "Company"} · ${a.status}`;
        }
        ctx.save({
          defer: el.tagName !== "SELECT",
          label: "Edited application",
        });
      }),
    );
    on("application-resume", "change", (e) => {
      const a = state().applications.find((a) => a.id === appId),
        v = state().versions.find((v) => v.id === e.target.value);
      a.resumeId = v?.id || "";
      a.resumeSnapshot = v ? structuredClone(v) : null;
      ctx.save({ label: "Attached application resume" });
      ctx.render();
    });
    on("application-word", "click", () =>
      ctx.exportVersion(
        state().applications.find((a) => a.id === appId).resumeSnapshot,
        "docx",
      ),
    );
    on("application-pdf", "click", () =>
      ctx.exportVersion(
        state().applications.find((a) => a.id === appId).resumeSnapshot,
        "pdf",
      ),
    );
    on("delete-application", "click", () => {
      if (
        !confirm("Delete this application? It can be recovered from history.")
      )
        return;
      state().applications = state().applications.filter((a) => a.id !== appId);
      appId = null;
      ctx.save({ label: "Deleted application" });
      ctx.render();
    });
    for (const side of ["left", "right"])
      on(`compare-${side}`, "change", (e) => {
        if (side === "left") leftId = e.target.value;
        else rightId = e.target.value;
        ctx.render();
      });
  }
  return {
    reset: () => {
      parsed = null;
      parsedId = null;
      parsedSource = null;
      organizing = false;
      organizeRun++;
      appId = null;
      leftId = null;
      rightId = null;
    },
    importReview,
    pasteForm,
    updateAIAvailability: () => {
      const button = document.getElementById("ai-organize");
      if (button) button.disabled = organizing || !ctx.canAIOrganize();
    },
    versionTools,
    historyPage,
    applicationsPage,
    comparePage,
    bind,
    updateQuality: () => {
      const el = document.querySelector("#quality-results");
      if (el && ctx.current())
        el.innerHTML = qualityHTML(qualityChecks(ctx.current()));
    },
  };
}

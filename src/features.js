import { sections, resumeText } from "./model.js";
import {
  templates,
  mergeProfileField,
  qualityChecks,
  tailorRecommendations,
  compareVersions,
  createApplication,
  applicationStatuses,
} from "./workspace.js";
import { createImportReview } from "./import-review.js";
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
  const imports = createImportReview(ctx);
  let appId = null,
    leftId = null,
    rightId = null;
  const state = () => ctx.getState();
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
    imports.bind();
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
      imports.reset();
      appId = null;
      leftId = null;
      rightId = null;
    },
    importReview: imports.render,
    pasteForm: imports.pasteForm,
    updateAIAvailability: imports.updateAIAvailability,
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

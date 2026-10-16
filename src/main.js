import "./style.css";
import { createAutosave } from "./autosave.js";
import { sections, emptyState, createVersion, validateState } from "./model.js";
import {
  coreState,
  checkpoint,
  undo,
  redo,
  restoreCheckpoint,
  boundedHistory,
} from "./workspace.js";
import { createFeatures, featurePages } from "./features.js";
import { wordBlob, pdfBlob, exportName } from "./exports.js";
import { createCloud } from "./cloud.js";
import { pdfPageText } from "./pdf-layout.js";
const key = "resume-studio-v1";
let state = emptyState(),
  page = "profile",
  selected = null,
  importId = null,
  advice = "",
  busy = false,
  aiAvailable = false,
  storageFailed = false;
try {
  const raw = localStorage.getItem(key);
  if (raw) state = validateState(JSON.parse(raw));
} catch {
  storageFailed = true;
}
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const label = (s) => s[0].toUpperCase() + s.slice(1);
const current = () => state.versions.find((v) => v.id === selected);
let storageKey = key,
  lastCore = coreState(state),
  changeLabel = "Workspace edit",
  skipHistory = false,
  workspaceEpoch = 0,
  recommendRequest = 0;
const unsavedWorkspaces = new Map();
const features = createFeatures({
  getState: () => state,
  current,
  currentImport: () => state.imports.find((i) => i.id === importId),
  canAIOrganize: () => aiAvailable && cloud.signedIn(),
  organizeImport,
  addImport: (name, text) => {
    const item = { id: crypto.randomUUID(), name, text };
    state.imports.push(item);
    importId = item.id;
    save({ label: "Imported pasted resume" });
    render();
  },
  save,
  render,
  toast,
  navigate,
  exportVersion,
  undo: () => historyAction("undo"),
  redo: () => historyAction("redo"),
  checkpoint: addCheckpoint,
  restoreHistory,
});
const cloud = createCloud({
  getState: () => state,
  page: () => page,
  render,
  toast,
  switchAccount,
  replaceWorkspace,
  copyGuest: () => {
    const raw = localStorage.getItem(key);
    if (!raw) throw Error("No saved guest workspace found.");
    replaceWorkspace(validateState(JSON.parse(raw)));
  },
  flush: () => autosave.flush(),
  isDirty: () => autosave.getStatus().dirty,
  backup: downloadBackup,
});
const autosave = createAutosave({
  getState: () => state,
  savedAt:
    typeof state.savedAt === "string" &&
    Number.isFinite(Date.parse(state.savedAt))
      ? state.savedAt
      : null,
  persist: (snapshot) => {
    if (storageFailed) throw Error("Storage recovery required");
    if (!skipHistory) checkpoint(snapshot, lastCore, changeLabel);
    localStorage.setItem(storageKey, JSON.stringify(snapshot));
    state.history = snapshot.history;
    state.future = snapshot.future;
    state.savedAt = snapshot.savedAt;
    lastCore = coreState(state);
    skipHistory = false;
    cloud.queue();
  },
  onStatus: updateSaveStatus,
});
function updateSaveStatus() {
  const status = autosave.getStatus(),
    el = document.querySelector("#save-state");
  if (!el) return;
  el.dataset.phase = storageFailed ? "error" : status.phase;
  el.textContent =
    storageFailed || status.phase === "error"
      ? "Not saved — download a backup"
      : status.phase === "pending"
        ? "Saving…"
        : status.savedAt
          ? `Autosaved at ${new Date(status.savedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}`
          : "Autosave on · this browser";
  el.title = status.savedAt
    ? `Last saved in this browser: ${new Date(status.savedAt).toLocaleString()}`
    : "Changes are automatically saved in this browser.";
  for (const [id, list] of [
    ["undo", state.history],
    ["redo", state.future],
  ]) {
    const button = document.getElementById(id);
    if (button) button.disabled = !list.length;
  }
  const notice = document.querySelector("#notice");
  if (status.phase === "saved" && notice?.dataset.autosaveError) {
    notice.hidden = true;
    delete notice.dataset.autosaveError;
  }
  if (status.phase === "error") {
    toast(
      "Autosave could not save your changes. Browser storage may be full or unavailable. Your edits are still open here; download a backup to keep them.",
      true,
    );
    notice.dataset.autosaveError = "true";
  }
}
function save(options = {}) {
  changeLabel =
    options.label ||
    {
      profile: "Edited master profile",
      imports: "Edited resume library",
      versions: "Edited resume version",
      applications: "Edited application",
    }[page] ||
    "Workspace edit";
  if (options.history === false) skipHistory = true;
  if (page === "versions" && current())
    current().updated = new Date().toISOString();
  autosave.changed(options);
}
function navigate(next) {
  page = next;
  if (page === "versions" && !current()) selected = state.versions[0]?.id;
  render();
}
function downloadBackup(data = state) {
  download(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
    "resume-studio-backup.json",
  );
}
function replaceWorkspace(data) {
  const next = validateState(structuredClone(data));
  next.savedAt = new Date().toISOString();
  localStorage.setItem(storageKey, JSON.stringify(next));
  workspaceEpoch++;
  recommendRequest++;
  busy = false;
  features.reset();
  state = next;
  storageFailed = false;
  lastCore = coreState(state);
  skipHistory = false;
  autosave.reset(next.savedAt);
  selected = null;
  importId = null;
  render();
}
function switchAccount(userId) {
  workspaceEpoch++;
  recommendRequest++;
  busy = false;
  features.reset();
  autosave.flush();
  if (autosave.getStatus().dirty)
    unsavedWorkspaces.set(storageKey, structuredClone(state));
  else unsavedWorkspaces.delete(storageKey);
  storageKey = userId ? `${key}:account:${userId}` : key;
  storageFailed = false;
  try {
    const raw = localStorage.getItem(storageKey);
    state =
      unsavedWorkspaces.get(storageKey) ||
      (raw ? validateState(JSON.parse(raw)) : emptyState());
  } catch {
    state = emptyState();
    storageFailed = true;
  }
  lastCore = coreState(state);
  skipHistory = false;
  autosave.reset(state.savedAt || null);
  selected = null;
  importId = null;
  page = "account";
  render();
  if (unsavedWorkspaces.has(storageKey)) save({ history: false });
}
function historyAction(action) {
  autosave.flush();
  if (!(action === "undo" ? undo(state) : redo(state))) return;
  selected = current()?.id || state.versions[0]?.id;
  save({ history: false, label: action === "undo" ? "Undo" : "Redo" });
  render();
}
function addCheckpoint(name) {
  const entry = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    label: name,
    data: coreState(state),
  };
  if (JSON.stringify(entry).length > 1000000)
    return toast(
      "This workspace is too large for a history checkpoint. Download a backup instead.",
      true,
    );
  state.history = boundedHistory([...state.history, entry]);
  save({ history: false });
  render();
}
function restoreHistory(id) {
  if (restoreCheckpoint(state, id)) {
    selected = null;
    save({ history: false });
    render();
  }
}
// Flush before actions, when leaving fields, and when the page goes into the background.
// Capture runs before navigation handlers replace the editor DOM.
document.addEventListener("click", () => autosave.flush(), true);
document.addEventListener("focusout", () => autosave.flush());
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") autosave.flush();
});
window.addEventListener("pagehide", () => autosave.flush());
window.addEventListener("beforeunload", (event) => {
  autosave.flush();
  if (autosave.getStatus().dirty) {
    event.preventDefault();
    event.returnValue = "";
  }
});
function toast(message, error = false) {
  const box = document.querySelector("#notice");
  delete box.dataset.autosaveError;
  box.textContent = message;
  box.className = error ? "notice error" : "notice";
  box.hidden = false;
}
function field(name, value, multiline = false) {
  return `<label class="field">${label(name)}${multiline ? `<textarea aria-label="${label(name)}" data-field="${name}" rows="${name === "summary" ? 4 : 6}" placeholder="${{ summary: "A concise introduction to your experience and strengths.", experience: "Role · Company · Dates\nDescribe your responsibilities and accomplishments.", education: "Degree · School · Year", skills: "Add the skills you want employers to see.", projects: "Project name\nWhat you built, contributed, or achieved.", references: "Name\nRole or relationship\nContact details (include in exports only when needed)." }[name] || ""}">${esc(value)}</textarea>` : `<input aria-label="${label(name)}" data-field="${name}" value="${esc(value)}" placeholder="${{ name: "Your full name", headline: "Your role or professional focus", email: "you@example.com", phone: "Phone number", location: "City, State", links: "Portfolio or LinkedIn URL" }[name] || ""}">`}</label>`;
}
function profileEditor(p, version) {
  return `<div class="card"><div class="card-heading"><div><span class="eyebrow">THE ESSENTIALS</span><h2>Personal details</h2></div><span class="pill">${version ? "This version only" : "Master profile"}</span></div><div class="fields">${["name", "headline", "email", "phone", "location", "links"].map((s) => field(s, p[s])).join("")}</div></div>${sections.map((s) => `<section class="card"><div class="section-top"><h2>${label(s)}</h2>${version ? `<label class="check"><input type="checkbox" data-include="${s}" ${version.included.includes(s) ? "checked" : ""}> Include in export</label>` : ""}</div>${s === "references" ? '<p class="privacy-note">Reference contacts are stored separately and excluded from new resumes unless you choose to include them.</p>' : ""}${field(s, p[s], true)}</section>`).join("")}`;
}
function preview(v) {
  const p = v.profile;
  return `<article class="paper template-${esc(v.template || "classic")}"><h2>${esc(p.name || "Your name")}</h2><p class="paper-role">${esc(p.headline || "Professional headline")}</p><p class="contact">${[p.email, p.phone, p.location, p.links].filter(Boolean).map(esc).join(" · ")}</p>${sections
    .filter((s) => v.included.includes(s) && p[s].trim())
    .map((s) => `<section><h3>${label(s)}</h3><p>${esc(p[s])}</p></section>`)
    .join("")}</article>`;
}
function render() {
  const v = current();
  advice = v?.recommendations || "";
  document.querySelector("#app").innerHTML =
    `<aside class="sidebar"><a class="brand" href="#" aria-label="Resume Studio home"><span class="brand-icon">R</span><span>Resume<span class="brand-light"> Studio</span></span></a><p class="nav-label">YOUR WORKSPACE</p><nav>${[
      ["profile", "◈", "Master profile"],
      ["imports", "⇧", "Resume library"],
      ["versions", "▤", "Resume versions"],
      ["applications", "◎", "Applications"],
      ["compare", "⇄", "Compare resumes"],
      ["history", "↶", "History & undo"],
      ["account", "○", "Account & sync"],
    ]
      .map(
        ([id, icon, title]) =>
          `<button class="nav-item ${page === id ? "active" : ""}" data-page="${id}"><span>${icon}</span>${title}${id === "versions" ? `<small>${state.versions.length}</small>` : ""}</button>`,
      )
      .join(
        "",
      )}</nav><div class="sidebar-bottom"><div class="privacy-icon">⌂</div><strong>Your story, in your hands.</strong><p>Saved in this browser. Back up your workspace to keep a portable copy.</p><button class="secondary full" id="backup">Download backup</button><label class="restore">Restore a backup<input type="file" id="restore" accept=".json" hidden></label></div></aside><main><header><span>WORKSPACE <span class="crumb">/ ${page === "profile" ? "Master profile" : page === "imports" ? "Resume library" : featurePages[page]?.[0] || "Resume versions"}</span></span><span id="save-state" class="saved" role="status" aria-live="polite" aria-atomic="true"></span></header><div class="content"><div id="notice" role="status" hidden></div><div class="page-heading"><div><span class="eyebrow">${page === "profile" ? "START WITH YOUR STORY" : page === "imports" ? "BRING IT ALL TOGETHER" : "MAKE YOUR NEXT MOVE"}</span><h1>${page === "profile" ? "Your master profile" : page === "imports" ? "Your resume library" : featurePages[page]?.[0] || "Your resume versions"}</h1><p>${page === "profile" ? "One home for your experience. A starting point for every opportunity." : page === "imports" ? "Bring in past resumes, review the text, and build a fuller picture." : featurePages[page]?.[1] || "Choose your strongest experience and shape it for the role ahead."}</p></div>${["profile", "versions"].includes(page) ? '<button id="new-version" class="primary">＋ Create a resume</button>' : ""}</div><div class="history-controls"><button class="secondary" id="undo" ${state.history.length ? "" : "disabled"}>↶ Undo</button><button class="secondary" id="redo" ${state.future.length ? "" : "disabled"}>↷ Redo</button><span class="muted small">Recent saved changes are recoverable in History.</span><span id="cloud-summary" class="muted small" aria-live="polite"></span></div>
 ${page === "profile" ? `<div class="info-banner"><span>✦</span><div><strong>A foundation you can keep building.</strong><p>Add your details below, or import a previous resume from your library. New resumes start as independent copies of this profile.</p></div></div><div class="editor-grid"><div>${profileEditor(state.profile)}</div><aside class="tips card"><span class="eyebrow">A LITTLE GUIDANCE</span><h2>Make it yours.</h2><div class="tip"><b>01</b><div><strong>Gather your experience</strong><p>Include past roles, projects, education, and the skills you’ve built.</p></div></div><div class="tip"><b>02</b><div><strong>Keep the full story</strong><p>Your master profile can be longer than a resume. Choose what fits when creating a version.</p></div></div><div class="tip"><b>03</b><div><strong>Keep it factual</strong><p>Use real accomplishments and add numbers only when you can verify them.</p></div></div><button class="secondary full" data-page="imports">Import a past resume ↗</button></aside></div>` : ""}
 ${
   page === "imports"
     ? `<section class="upload card"><span class="upload-icon">⇧</span><h2>Your experience adds up.</h2><p>Upload PDF, Word (.docx), or plain text files. Review extracted text before adding it to your profile.</p><label class="primary file-button">Choose resumes<input type="file" id="upload" accept=".pdf,.docx,.txt" multiple hidden></label><small>Up to 10 MB per file · Text extraction stays in your browser<br>Scanned PDFs require OCR elsewhere before importing.</small></section>${features.pasteForm()}${features.importReview(state.imports.find((i) => i.id === importId))}<div class="library-grid"><div class="card"><h2>Imported documents <span class="count">${state.imports.length}</span></h2>${state.imports.length ? state.imports.map((i) => `<div class="document-row"><button data-import="${esc(i.id)}">▤ &nbsp; ${esc(i.name)}</button><button class="icon-button" data-delete-import="${esc(i.id)}" aria-label="Delete ${esc(i.name)}">×</button></div>`).join("") : '<p class="muted">Your imported resumes will appear here.</p>'}</div><div class="card">${(() => {
         const i = state.imports.find((x) => x.id === importId);
         return i
           ? `<h2>${esc(i.name)}</h2><p class="muted">Source text is preserved for comparison. Use the categorized items above to add your information.</p><details id="source-details"><summary>Original text and manual import tools</summary><label class="field">Extracted text<textarea id="import-text" rows="15">${esc(i.text)}</textarea></label><div class="import-actions"><label class="field">Add reviewed text to<select id="import-section">${sections.map((s) => `<option value="${s}">${label(s)}</option>`).join("")}</select></label><button class="primary" id="append-import">Append to profile</button></div></details>`
           : '<h2>Review your source material</h2><p class="muted">Select an imported document to review its text. You control what gets added to the master profile.</p>';
       })()}</div></div>`
     : ""
 }
 ${page === "versions" ? `<div class="version-tabs">${state.versions.map((x) => `<button class="${x.id === selected ? "chosen" : ""}" data-version="${esc(x.id)}">${esc(x.title)}</button>`).join("")}</div>${v ? `<div class="version-toolbar"><label class="field">Version name<input id="version-title" value="${esc(v.title)}"></label><div class="actions"><button class="secondary" id="duplicate">Duplicate</button><button class="primary" id="export">Download Word ↗</button><button class="secondary" id="export-pdf">Download PDF</button><button class="danger" id="delete-version">Delete</button></div></div><div class="version-grid"><div><div class="card ai-card"><span class="eyebrow">OPTIONAL ASSISTANCE</span><h2>A second pair of eyes.</h2><p class="muted">Paste a job description to get AI recommendations. Nothing changes until you edit it yourself.</p><label class="field">Target job description<textarea id="job" rows="5" placeholder="Paste the job description, or describe the role…">${esc(v.job)}</textarea></label><p class="privacy-note">Only when you request recommendations, this version and job description are sent to OpenAI. Imported documents are not sent.</p><button class="secondary" id="recommend" ${busy || !aiAvailable ? "disabled" : ""}>${busy ? "Getting recommendations…" : aiAvailable ? "✦ Get AI recommendations" : "AI not configured"}</button>${!aiAvailable ? '<p class="muted small">AI is optional. See the README for server configuration.</p>' : ""}${advice ? `<div class="advice" role="status">${v.recommendationsJob && v.recommendationsJob !== v.job ? '<p class="muted">The target job has changed since these suggestions were generated. Request updated recommendations before using them.</p>' : ""}${esc(advice)}</div>` : ""}</div>${features.versionTools(v)}${profileEditor(v.profile, v)}</div><aside class="preview"><div class="preview-label"><span>DOCUMENT PREVIEW</span><span>Word export</span></div>${preview(v)}<p class="small muted">Preview is approximate. Word exports remain fully editable.</p></aside></div>` : `<div class="empty card"><span class="upload-icon">▤</span><h2>A new opportunity starts here.</h2><p>Create your first resume from your master profile, then tailor it to the role.</p><button class="primary" id="first-version">Create your first resume</button></div>`}` : ""}
 ${page === "history" ? features.historyPage() : page === "applications" ? features.applicationsPage() : page === "compare" ? features.comparePage() : page === "account" ? cloud.html() : ""}
 <footer>RESUME STUDIO <span>Built around your experience.</span></footer></div></main>`;
  bind();
  features.bind();
  cloud.bind();
  cloud.updateStatus();
  updateSaveStatus();
  if (storageFailed)
    toast(
      "Existing browser data could not be loaded. Download a backup before restoring or clearing browser storage. Changes cannot be saved until storage is recovered.",
      true,
    );
}
function newVersion() {
  state.versions.unshift(
    createVersion(state.profile, `Resume ${state.versions.length + 1}`),
  );
  selected = state.versions[0].id;
  page = "versions";
  advice = "";
  render();
  save();
}
function bind() {
  document.querySelector(".brand").onclick = (e) => {
    e.preventDefault();
    page = "profile";
    render();
  };
  document.querySelectorAll("[data-page]").forEach(
    (b) =>
      (b.onclick = () => {
        page = b.dataset.page;
        if (page === "versions" && !current()) selected = state.versions[0]?.id;
        advice = "";
        render();
      }),
  );
  document
    .querySelectorAll("#new-version,#first-version")
    .forEach((b) => (b.onclick = newVersion));
  document.querySelectorAll("[data-field]").forEach(
    (el) =>
      (el.oninput = () => {
        const v = page === "versions" ? current() : null;
        (v ? v.profile : state.profile)[el.dataset.field] = el.value;
        if (v) v.updated = new Date().toISOString();
        save({ defer: true });
        updatePreview();
      }),
  );
  document.querySelectorAll("[data-include]").forEach(
    (el) =>
      (el.onchange = () => {
        const v = current();
        v.included = sections.filter((s) =>
          s === el.dataset.include ? el.checked : v.included.includes(s),
        );
        save();
        updatePreview();
      }),
  );
  document.querySelectorAll("[data-version]").forEach(
    (b) =>
      (b.onclick = () => {
        selected = b.dataset.version;
        advice = "";
        render();
      }),
  );
  document.querySelectorAll("[data-import]").forEach(
    (b) =>
      (b.onclick = () => {
        importId = b.dataset.import;
        render();
      }),
  );
  document.querySelectorAll("[data-delete-import]").forEach(
    (b) =>
      (b.onclick = () => {
        if (
          !confirm(
            "Remove this imported document? Your profile and versions will stay saved.",
          )
        )
          return;
        state.imports = state.imports.filter(
          (i) => i.id !== b.dataset.deleteImport,
        );
        render();
        save();
      }),
  );
  on("backup", "click", () => downloadBackup());
  on("undo", "click", () => historyAction("undo"));
  on("redo", "click", () => historyAction("redo"));
  on("restore", "change", async (e) => {
    const epoch = workspaceEpoch;
    try {
      const file = e.target.files[0];
      if (!file) return;
      if (file.size > 20000000) throw Error("Backup is too large.");
      const data = validateState(JSON.parse(await file.text()));
      if (epoch !== workspaceEpoch) return;
      if (
        !confirm(
          "Replace this workspace with the backup? Download a backup first if you want to keep your current work.",
        )
      )
        return;
      data.history.push({
        id: crypto.randomUUID(),
        at: new Date().toISOString(),
        label: "Before backup restore",
        data: coreState(state),
      });
      data.history = boundedHistory(data.history);
      replaceWorkspace(data);
      cloud.queue();
      toast("Backup restored.");
    } catch (e) {
      toast(e.message, true);
    }
  });
  on("version-title", "input", (e) => {
    current().title = e.target.value;
    const tab = document.querySelector(".version-tabs .chosen");
    if (tab) tab.textContent = e.target.value;
    save({ defer: true });
  });
  on("job", "input", (e) => {
    current().job = e.target.value;
    save({ defer: true });
  });
  on("duplicate", "click", () => {
    const old = current(),
      v = createVersion(old.profile, old.title + " (copy)");
    v.included = [...old.included];
    v.job = old.job;
    v.template = old.template || "classic";
    if (old.recommendations) v.recommendations = old.recommendations;
    if (old.recommendationsJob) v.recommendationsJob = old.recommendationsJob;
    state.versions.unshift(v);
    selected = v.id;
    advice = "";
    render();
    save();
  });
  on("delete-version", "click", () => {
    if (!confirm("Delete this resume version?")) return;
    state.versions = state.versions.filter((v) => v.id !== selected);
    selected = state.versions[0]?.id;
    advice = "";
    render();
    save();
  });
  on("export", "click", () => exportVersion(current(), "docx"));
  on("export-pdf", "click", () => exportVersion(current(), "pdf"));
  on("recommend", "click", recommend);
  on("upload", "change", upload);
  on("import-text", "input", (e) => {
    state.imports.find((i) => i.id === importId).text = e.target.value;
    save({ defer: true });
  });
  on("append-import", "click", () => {
    const section = document.querySelector("#import-section").value,
      text = document.querySelector("#import-text").value.trim();
    if (!text) return toast("Select or enter some text first.", true);
    state.profile[section] = [state.profile[section], text]
      .filter(Boolean)
      .join("\n\n");
    save();
    toast(
      `Text added to your master profile’s ${section} section. Review it there before making a resume.`,
    );
  });
}
function on(id, event, handler) {
  document.getElementById(id)?.addEventListener(event, handler);
}
function updatePreview() {
  const el = document.querySelector(".paper");
  if (el) el.outerHTML = preview(current());
  features.updateQuality();
}
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function exportVersion(version, format) {
  const epoch = workspaceEpoch,
    snapshot = structuredClone(version);
  try {
    const blob = await (format === "pdf"
      ? pdfBlob(snapshot)
      : wordBlob(snapshot));
    if (epoch !== workspaceEpoch) return;
    download(blob, exportName(snapshot, format));
    toast(`${format === "pdf" ? "PDF" : "Editable Word"} document downloaded.`);
  } catch {
    if (epoch === workspaceEpoch)
      toast("Could not export this resume. Please try again.", true);
  }
}
async function recommend() {
  const v = current();
  if (!v.job.trim()) return toast("Add a job description first.", true);
  const id = v.id,
    epoch = workspaceEpoch,
    request = ++recommendRequest,
    profile = { ...structuredClone(v.profile), references: "" },
    job = v.job;
  busy = true;
  render();
  let error;
  try {
    const token = await cloud.token();
    if (epoch !== workspaceEpoch) return;
    const response = await fetch("/api/recommend", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ profile, job }),
    });
    const data = await response.json();
    if (epoch !== workspaceEpoch) return;
    if (!response.ok) throw Error(data.error || "Recommendations failed.");
    const target = state.versions.find((item) => item.id === id);
    if (target) {
      target.recommendations = data.advice;
      target.recommendationsJob = job;
      target.updated = new Date().toISOString();
      save();
    }
  } catch (e) {
    error = e.message;
  } finally {
    if (epoch === workspaceEpoch && request === recommendRequest) {
      busy = false;
      render();
      if (error) toast(error, true);
    }
  }
}
async function organizeImport(item) {
  const epoch = workspaceEpoch,
    source = item.text;
  const token = await cloud.token();
  if (epoch !== workspaceEpoch) return null;
  if (!token)
    throw Error(
      "Sign in to use AI organization. Automatic sorting works without an account.",
    );
  const response = await fetch("/api/organize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ text: source }),
  });
  const result = await response.json();
  if (epoch !== workspaceEpoch) return null;
  if (!response.ok)
    throw Error(
      result.error ||
        "AI organization failed. Your original text is preserved.",
    );
  return result.organized;
}
async function upload(e) {
  const epoch = workspaceEpoch;
  const files = Array.from(e.target.files);
  const errors = [];
  let added = 0;
  for (const file of files) {
    try {
      if (file.size > 10 * 1024 * 1024) throw Error("exceeds 10 MB");
      const ext = file.name.split(".").pop().toLowerCase();
      let text = "";
      if (ext === "txt") text = await file.text();
      else if (ext === "docx") {
        const mammoth = await import("mammoth/mammoth.browser");
        text = (
          await mammoth.extractRawText({
            arrayBuffer: await file.arrayBuffer(),
          })
        ).value;
      } else if (ext === "pdf") {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          "pdfjs-dist/build/pdf.worker.min.mjs",
          import.meta.url,
        ).href;
        const pdf = await pdfjs.getDocument({
          data: await file.arrayBuffer(),
          isEvalSupported: false,
        }).promise;
        try {
          for (let n = 1; n <= pdf.numPages; n++) {
            const page = await pdf.getPage(n),
              content = await page.getTextContent();
            text +=
              pdfPageText(content.items, page.getViewport({ scale: 1 }).width) +
              "\n\n";
          }
        } finally {
          await pdf.destroy();
        }
      } else throw Error("unsupported format");
      if (!text.trim())
        throw Error("no readable text found; scanned PDFs need OCR");
      if (epoch !== workspaceEpoch) return;
      const item = {
        id: crypto.randomUUID(),
        name: file.name,
        text: text.trim(),
      };
      state.imports.push(item);
      importId = item.id;
      save();
      added++;
    } catch (error) {
      if (epoch !== workspaceEpoch) return;
      errors.push(`${file.name}: ${error.message}`);
    }
  }
  if (epoch !== workspaceEpoch) return;
  render();
  save();
  toast(
    `${added} document${added === 1 ? "" : "s"} imported.${errors.length ? " " + errors.join("; ") : " Your information has been automatically sorted into categories below."}`,
    errors.length > 0,
  );
}
render();
void cloud.init();
fetch("/api/health")
  .then((r) => r.json())
  .then((data) => {
    aiAvailable = data.aiAvailable === true;
    features.updateAIAvailability();
    if (page === "versions") render();
  })
  .catch(() => {});

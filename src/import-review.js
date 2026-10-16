import { sections } from "./model.js";
import { mergeProfileField } from "./workspace.js";
import {
  extractResumeItems,
  organizationFromParsed,
  itemCategories,
  groupedCategories,
  itemGroups,
  moveItem,
  splitItem,
  itemsToProfile,
} from "./import-items.js";

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const title = (category) =>
  category === "unassigned"
    ? "Needs review"
    : category[0].toUpperCase() + category.slice(1);
const contact = itemCategories.filter(
  (category) => !sections.includes(category) && category !== "unassigned",
);

export function createImportReview(ctx) {
  let organizing = false,
    run = 0,
    mode = "merge";
  const current = () => ctx.currentImport();
  const save = (defer = false) =>
    ctx.save({ defer, label: "Edited extracted resume items" });
  function review(item) {
    if (!item.organization || item.organization.sourceText !== item.text) {
      item.organization = extractResumeItems(item.text, ctx.getState().profile);
      const organization = item.organization;
      queueMicrotask(() => {
        if (current() === item && item.organization === organization)
          save(true);
      });
    }
    return item.organization;
  }
  function rowHTML(row, organization) {
    const number = organization.items.indexOf(row) + 1;
    return `<div class="import-item" data-item-id="${esc(row.id)}" data-item-category="${row.category}">
      <label class="check item-select"><input type="checkbox" data-item-selected ${row.selected ? "checked" : ""} ${row.category === "unassigned" ? "disabled" : ""} aria-label="Include item ${number}"><span>${row.category === "unassigned" ? "Choose a category to include" : `Include item ${number}`}</span></label>
      <label class="field item-content"><span>${title(row.category)}${row.kind !== "text" ? ` · ${title(row.kind)}` : ""}</span><textarea data-item-text rows="2" aria-label="${title(row.category)} item ${number}">${esc(row.text)}</textarea></label>
      <div class="item-controls"><label class="field">Category<select data-item-move aria-label="Category for item ${number}">${itemCategories.map((category) => `<option value="${category}" ${category === row.category ? "selected" : ""}>${contact.includes(category) ? "Contact · " : ""}${title(category)}</option>`).join("")}</select></label>
      <details class="item-options"><summary>Item options</summary>${
        groupedCategories.includes(row.category)
          ? `<label class="field">${row.category === "experience" ? "Job" : row.category === "education" ? "Education record" : "Reference"}<select data-item-group aria-label="Group for item ${number}">${itemGroups(
              organization.items,
              row.category,
            )
              .map(
                (group) =>
                  `<option value="${esc(group.id)}" ${group.id === row.group ? "selected" : ""}>${esc(group.label)}</option>`,
              )
              .join(
                "",
              )}<option value="__new__">Start a separate record</option></select></label>`
          : ""
      }
      ${row.category === "experience" ? `<label class="field">Item type<select data-item-kind aria-label="Type for item ${number}">${["employer", "role", "date", "duty"].map((kind) => `<option ${kind === row.kind ? "selected" : ""}>${kind}</option>`).join("")}</select></label>` : ""}
      <div class="actions wrap"><button class="text-button" data-item-split>Split into items</button><button class="text-button" data-item-join>Join previous</button></div></details></div></div>`;
  }
  function render(item) {
    if (!item) return "";
    const organization = review(item);
    const selected = organization.items.filter(
      (row) => row.selected && row.category !== "unassigned",
    ).length;
    const groups = [
      { id: "contact", name: "Contact details", categories: contact },
      ...[...sections, "unassigned"].map((category) => ({
        id: category,
        name: title(category),
        categories: [category],
      })),
    ];
    return `<section class="card organized-import"><span class="eyebrow">EXTRACTED LINE ITEMS</span><h2>Each detail, in its place</h2><p class="muted">Skills and responsibilities are individual items. Job duties stay with their employer; school details and reference contacts stay together. Edit an item or change its category below. Your review is saved automatically.</p>
      <div class="actions wrap"><button class="secondary" id="parse-import">Re-extract items</button><button class="secondary" id="ai-organize" ${organizing || !ctx.canAIOrganize() ? "disabled" : ""}>${organizing ? "Organizing…" : "Improve organization with AI"}</button></div>
      <p class="small muted">${organization.method === "ai" ? "Organized with AI; verify that each fact is under the right person and role." : "Sorted locally. AI is optional and requires sign-in."}</p>
      ${organization.warnings.length ? `<p class="import-warning">${organization.warnings.map(esc).join(" ")}</p>` : ""}
      <div id="parsed-review"><label class="field spaced">How to add selected items<select id="import-mode"><option value="merge" ${mode === "merge" ? "selected" : ""}>Merge with existing information</option><option value="replace" ${mode === "replace" ? "selected" : ""}>Replace selected categories with this document</option></select></label><p class="small muted">Matching items are skipped when merging. Replace can clean up categories that were previously imported with mixed formatting. Existing contact values change only if you select their items.</p>
      <div class="item-totals" role="status">${organization.items.length} items extracted · ${selected} selected${organization.items.some((row) => row.category === "unassigned") ? " · Some items need a category" : ""}</div>
      <button class="primary" id="apply-parsed-top" ${!selected ? "disabled" : ""}>Add selected items to profile</button>
      ${groups
        .map((section) => {
          const rows = organization.items.filter((row) =>
            section.categories.includes(row.category),
          );
          if (!rows.length) return "";
          return `<section class="item-category" data-review-category="${section.id}"><div class="section-top"><h3>${section.name} <span class="count">${rows.length}</span></h3>${section.id !== "unassigned" ? `<label class="check"><input type="checkbox" data-item-section="${section.id}" ${rows.every((row) => row.selected) ? "checked" : ""}> Include all ${section.name.toLowerCase()} items</label>` : ""}</div>
          ${
            groupedCategories.includes(section.id)
              ? itemGroups(rows, section.id)
                  .map(
                    (group) =>
                      `<div class="item-record"><h4>${esc(group.label)}</h4>${group.items.map((row) => rowHTML(row, organization)).join("")}</div>`,
                  )
                  .join("")
              : rows.map((row) => rowHTML(row, organization)).join("")
          }</section>`;
        })
        .join("")}
      <button class="primary" id="apply-parsed" ${!selected ? "disabled" : ""}>Add selected items to profile</button></div></section>`;
  }
  const pasteForm = () =>
    `<section class="card"><h2>Already have extracted text?</h2><label class="field">Paste a resume<textarea id="paste-resume" rows="5" placeholder="Paste the full resume, even if headings and spacing are messy."></textarea></label><button class="secondary spaced" id="organize-paste">Extract and sort items</button></section>`;

  function bind() {
    const on = (id, event, fn) =>
      document.getElementById(id)?.addEventListener(event, fn);
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
    on("parse-import", "click", () => {
      const item = current();
      if (!item) return;
      run++;
      organizing = false;
      item.organization = extractResumeItems(item.text, ctx.getState().profile);
      save();
      ctx.render();
      ctx.toast(
        "Items extracted again. Previous corrections are available in history.",
      );
    });
    document.querySelectorAll("[data-item-id]").forEach((el) => {
      const organization = current().organization;
      const item = organization.items.find(
        (row) => row.id === el.dataset.itemId,
      );
      const changed = () => {
        save();
        ctx.render();
      };
      el.querySelector("[data-item-text]").addEventListener("input", (e) => {
        item.text = e.target.value;
        e.target.style.height = "auto";
        e.target.style.height = `${e.target.scrollHeight}px`;
        save(true);
      });
      el.querySelector("[data-item-selected]").addEventListener(
        "change",
        (e) => {
          item.selected = e.target.checked;
          changed();
        },
      );
      el.querySelector("[data-item-move]").addEventListener("change", (e) => {
        moveItem(item, e.target.value);
        changed();
      });
      el.querySelector("[data-item-group]")?.addEventListener("change", (e) => {
        item.group =
          e.target.value === "__new__" ? crypto.randomUUID() : e.target.value;
        changed();
      });
      el.querySelector("[data-item-kind]")?.addEventListener("change", (e) => {
        item.kind = e.target.value;
        changed();
      });
      el.querySelector("[data-item-split]").addEventListener("click", () => {
        if (splitItem(organization.items, item.id)) changed();
        else
          ctx.toast(
            "Put each desired item on its own line, then click Split into items.",
          );
      });
      el.querySelector("[data-item-join]").addEventListener("click", () => {
        const index = organization.items.indexOf(item);
        const previous = organization.items
          .slice(0, index)
          .findLast(
            (row) => row.category === item.category && row.group === item.group,
          );
        if (!previous)
          return ctx.toast("There is no preceding item in this group.");
        previous.text = `${previous.text.trim()} ${item.text.trim()}`;
        previous.selected ||= item.selected;
        organization.items.splice(index, 1);
        changed();
      });
    });
    document.querySelectorAll("[data-item-section]").forEach((box) =>
      box.addEventListener("change", () => {
        const categories =
          box.dataset.itemSection === "contact"
            ? contact
            : [box.dataset.itemSection];
        current()
          .organization.items.filter((row) => categories.includes(row.category))
          .forEach((row) => {
            row.selected = box.checked;
          });
        save();
        ctx.render();
      }),
    );
    on("import-mode", "change", (e) => {
      mode = e.target.value;
    });
    on("apply-parsed-top", "click", () =>
      document.getElementById("apply-parsed").click(),
    );
    on("apply-parsed", "click", () => {
      const item = current();
      if (!item || item.organization.sourceText !== item.text) {
        ctx.render();
        return ctx.toast(
          "The source changed. Review the newly extracted items before adding them.",
        );
      }
      const incoming = itemsToProfile(item.organization.items),
        profile = ctx.getState().profile;
      if (
        mode === "replace" &&
        sections.some((field) => incoming[field] && profile[field].trim()) &&
        !confirm(
          "Replace the selected profile categories with these items? The previous profile is kept in history when it fits the storage limit.",
        )
      )
        return;
      let count = 0;
      for (const [field, text] of Object.entries(incoming)) {
        if (!text.trim()) continue;
        const next =
          sections.includes(field) && mode !== "replace"
            ? mergeProfileField(profile[field], text, field).text
            : text;
        if (next !== profile[field]) {
          profile[field] = next;
          count++;
        }
      }
      ctx.save({ label: "Added selected resume items" });
      ctx.render();
      ctx.toast(
        `${count} profile fields updated from selected items. Matching items were skipped when merging.`,
      );
    });
    on("ai-organize", "click", async () => {
      const item = current();
      if (
        !item ||
        organizing ||
        !confirm(
          "Send this document’s extracted text, including any reference contact details, to OpenAI to categorize its items? This replaces the current item review; previous corrections remain in history. Your master profile changes only when you add selected items.",
        )
      )
        return;
      const source = item.text,
        request = ++run;
      organizing = true;
      ctx.render();
      let failure;
      try {
        const result = await ctx.organizeImport(item);
        if (!result || request !== run) return;
        if (current() !== item || item.text !== source)
          throw Error(
            "The document changed. Run organization again on the updated source.",
          );
        item.organization = organizationFromParsed(
          source,
          result,
          ctx.getState().profile,
        );
        save();
      } catch (error) {
        failure = error.message;
      } finally {
        if (request === run) {
          organizing = false;
          ctx.render();
          if (failure) ctx.toast(failure, true);
        }
      }
    });
  }
  return {
    render,
    pasteForm,
    bind,
    reset: () => {
      run++;
      organizing = false;
      mode = "merge";
    },
    updateAIAvailability: () => {
      const button = document.getElementById("ai-organize");
      if (button) button.disabled = organizing || !ctx.canAIOrganize();
    },
  };
}

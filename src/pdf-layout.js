// PDF text order follows drawing operations, not necessarily columns or words.
export function pdfPageText(items, pageWidth = 612) {
  const usable = items
    .filter(
      (item) =>
        typeof item.str === "string" &&
        item.str.trim() &&
        Array.isArray(item.transform),
    )
    .map((item) => ({
      ...item,
      x: item.transform[4],
      y: item.transform[5],
      font: Math.max(
        1,
        Math.hypot(item.transform[2], item.transform[3]) || item.height || 10,
      ),
    }));
  if (!usable.length) return "";
  const rows = [];
  for (const item of [...usable].sort((a, b) => b.y - a.y || a.x - b.x)) {
    let row = rows.find(
      (row) =>
        Math.abs(row.y - item.y) <=
        Math.max(2, Math.min(row.font, item.font) * 0.23),
    );
    if (!row) {
      row = { y: item.y, font: item.font, items: [] };
      rows.push(row);
    }
    row.items.push(item);
  }
  rows.sort((a, b) => b.y - a.y);
  rows.forEach((r) => r.items.sort((a, b) => a.x - b.x));
  const gaps = [];
  for (const row of rows)
    for (let i = 1; i < row.items.length; i++) {
      const left = row.items[i - 1],
        right = row.items[i],
        end = left.x + (left.width || 0);
      if (right.x - end > Math.max(35, pageWidth * 0.065))
        gaps.push({ start: end + 6, end: right.x - 6, row });
    }
  let split = null,
    best = 0;
  for (const gap of gaps) {
    const candidate = (gap.start + gap.end) / 2;
    if (candidate < pageWidth * 0.18 || candidate > pageWidth * 0.8) continue;
    const supporting = gaps.filter(
      (g) => candidate >= g.start && candidate <= g.end,
    );
    const support = new Set(supporting.map((g) => g.row)).size;
    if (support < 3 || support <= best) continue;
    const right = rows
      .map((r) =>
        r.items
          .filter((i) => i.x > candidate)
          .map((i) => i.str)
          .join(" "),
      )
      .filter(Boolean);
    if (
      right.length < 3 ||
      right.filter((t) =>
        /^(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+)?\d{4}\b/.test(
          t,
        ),
      ).length /
        right.length >
        0.6
    )
      continue;
    split = candidate;
    best = support;
  }
  function rowText(entries) {
    let text = "",
      previous = null;
    for (const item of entries) {
      if (previous) {
        const gap = item.x - (previous.x + (previous.width || 0));
        if (
          !/\s$/.test(text) &&
          !/^\s/.test(item.str) &&
          gap > Math.min(item.font, previous.font) * 0.18
        )
          text += " ";
      }
      text += item.str;
      previous = item;
    }
    return text.trim();
  }
  if (split === null)
    return rows
      .map((r) => rowText(r.items))
      .filter(Boolean)
      .join("\n");
  const spanning = rows.filter((r) =>
    r.items.some((i) => i.x < split && i.x + (i.width || 0) > split),
  );
  const firstColumns =
    rows.find(
      (r) =>
        r.items.some((i) => i.x < split) && r.items.some((i) => i.x > split),
    )?.y ?? Infinity;
  const headers = new Set(spanning.filter((r) => r.y > firstColumns));
  const footer = new Set(spanning.filter((r) => r.y <= firstColumns));
  const body = rows.filter((r) => !headers.has(r) && !footer.has(r));
  return [
    ...[...headers].map((r) => rowText(r.items)),
    ...body.map((r) => rowText(r.items.filter((i) => i.x < split))),
    ...body.map((r) => rowText(r.items.filter((i) => i.x >= split))),
    ...[...footer].map((r) => rowText(r.items)),
  ]
    .filter(Boolean)
    .join("\n");
}

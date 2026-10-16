import { sections } from "./model.js";
import { templates } from "./workspace.js";
export function exportName(version, extension) {
  return (
    (version.title.replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "Resume") +
    "." +
    extension
  );
}
export async function wordBlob(version) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import(
    "docx"
  );
  const p = version.profile,
    t = templates[version.template] || templates.classic,
    compact = version.template === "compact";
  const color = t.color.slice(1),
    font = version.template === "classic" ? "Georgia" : "Calibri";
  const children = [
    new Paragraph({ text: p.name, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: p.headline, heading: HeadingLevel.SUBTITLE }),
    new Paragraph({
      text: [p.email, p.phone, p.location, p.links].filter(Boolean).join(" | "),
    }),
  ];
  for (const section of sections.filter(
    (s) => version.included.includes(s) && p[s].trim(),
  ))
    children.push(
      new Paragraph({
        text: section[0].toUpperCase() + section.slice(1),
        heading: HeadingLevel.HEADING_1,
      }),
      ...p[section]
        .split("\n")
        .map(
          (text) =>
            new Paragraph({
              children: [new TextRun(text)],
              spacing: { after: compact ? 60 : 100 },
            }),
        ),
    );
  return Packer.toBlob(
    new Document({
      styles: {
        default: { document: { run: { font, size: compact ? 20 : 22 } } },
        paragraphStyles: [
          {
            id: "Title",
            name: "Title",
            basedOn: "Normal",
            run: { font, size: 48, color, bold: true },
          },
          {
            id: "Heading1",
            name: "Heading 1",
            basedOn: "Normal",
            run: { font, size: 24, color, bold: true },
            paragraph: { spacing: { before: 220, after: 100 }, keepNext: true },
          },
        ],
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: compact ? 720 : 1080,
                bottom: compact ? 720 : 1080,
                left: 1080,
                right: 1080,
              },
            },
          },
          children,
        },
      ],
    }),
  );
}
export async function pdfBlob(version) {
  const [{ default: pdfmake }, { default: fonts }] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);
  pdfmake.addVirtualFileSystem(fonts);
  const p = version.profile,
    t = templates[version.template] || templates.classic,
    compact = version.template === "compact";
  const alignment = version.template === "classic" ? "center" : "left";
  const content = [
    {
      text: p.name,
      fontSize: compact ? 21 : 25,
      bold: true,
      color: t.color,
      alignment,
    },
    {
      text: p.headline,
      fontSize: 12,
      color: t.color,
      alignment,
      margin: [0, 4, 0, 6],
    },
    {
      text: [p.email, p.phone, p.location, p.links].filter(Boolean).join(" | "),
      fontSize: 9,
      alignment,
      margin: [0, 0, 0, 14],
    },
  ];
  for (const section of sections.filter(
    (s) => version.included.includes(s) && p[s].trim(),
  ))
    content.push(
      {
        text: section.toUpperCase(),
        fontSize: 11,
        bold: true,
        color: t.color,
        margin: [0, 14, 0, 6],
        headlineLevel: 1,
      },
      { text: p[section], margin: [0, 0, 0, compact ? 4 : 8] },
    );
  return pdfmake
    .createPdf({
      pageSize: "LETTER",
      pageMargins: [50, compact ? 35 : 50, 50, compact ? 35 : 50],
      defaultStyle: {
        font: "Roboto",
        fontSize: compact ? 10 : 11,
        lineHeight: compact ? 1.1 : 1.2,
      },
      content,
      info: { title: version.title, author: p.name },
    })
    .getBlob();
}

// @vitest-environment node
import { deflateRawSync, crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { MAX_FILE_BYTES, MAX_PDF_PAGES, extractDocumentText, itemsToLines, sniffDocument } from "./extract-text";
import { documentXmlToText } from "./docx";
import { parseSyllabus } from "./parse";

// Real files built in memory: a minimal PDF with standard-font text, and a
// minimal .docx (a ZIP holding word/document.xml).

function pdfEscape(text: string): string {
  return text.replace(/[\\()]/g, (c) => `\\${c}`);
}

export function makePdf(pages: string[][]): Uint8Array {
  const objects: string[] = [];
  const pageIds: number[] = [];
  // 1: catalog, 2: pages, 3: font, then a page + content object per page.
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  let next = 4;
  for (const lines of pages) {
    const pageId = next++;
    const contentId = next++;
    pageIds.push(pageId);
    // One positioned run per line; a tab in a line becomes a wide gap, like a table column.
    const stream = ["BT", "/F1 11 Tf"]
      .concat(
        lines.flatMap((line, i) => {
          const y = 740 - i * 14;
          return line.split("\t").map((cell, c) => `1 0 0 1 ${72 + c * 200} ${y} Tm (${pdfEscape(cell)}) Tj`);
        }),
      )
      .concat(["ET"])
      .join("\n");
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
  }
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = Buffer.byteLength(body, "latin1");
    body += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) body += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, "latin1"));
}

interface ZipFile {
  name: string;
  data: Buffer;
  deflate?: boolean;
  /** Lie about the uncompressed size, to test the inflate limit. */
  claimedSize?: number;
}

export function makeZip(files: ZipFile[]): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const data = file.deflate ? deflateRawSync(file.data) : file.data;
    const crc = crc32(file.data);
    const size = file.claimedSize ?? file.data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(file.deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(file.deflate ? 8 : 0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, data);
    centrals.push(central, name);
    offset += local.length + name.length + data.length;
  }
  const centralBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, centralBuf, eocd]));
}

function docxXml(paragraphs: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paragraphs}</w:body></w:document>`;
}
const p = (text: string, list = false) =>
  `<w:p>${list ? '<w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>' : ""}<w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;
const row = (...cells: string[]) => `<w:tr>${cells.map((c) => `<w:tc><w:p><w:r><w:t>${c}</w:t></w:r></w:p></w:tc>`).join("")}</w:tr>`;

function makeDocx(body: string, deflate = true): Uint8Array {
  return makeZip([
    { name: "[Content_Types].xml", data: Buffer.from("<Types/>") },
    { name: "word/document.xml", data: Buffer.from(docxXml(body)), deflate },
  ]);
}

describe("sniffing the real file type", () => {
  it("goes by the bytes, not the name", () => {
    expect(sniffDocument(makePdf([["Hello"]]))).toBe("pdf");
    expect(sniffDocument(makeDocx(p("Hello")))).toBe("docx");
    expect(sniffDocument(new TextEncoder().encode("Week 1: Limits"))).toBe("text");
    expect(sniffDocument(makeZip([{ name: "a.txt", data: Buffer.from("x") }]))).toMatchObject({ unsupported: expect.stringMatching(/ZIP/) });
    expect(sniffDocument(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toMatchObject({ unsupported: expect.stringMatching(/image/) });
    expect(sniffDocument(new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0]))).toMatchObject({ unsupported: expect.stringMatching(/\.doc/) });
    expect(sniffDocument(new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe, 0x00, 0x10]))).toMatchObject({ unsupported: expect.any(String) });
  });
});

describe("extractDocumentText", () => {
  it("reads a PDF's lines in order, keeping table columns apart", async () => {
    const pdf = makePdf([
      ["CHEM 101: General Chemistry", "Fall 2026", "Instructor: Dr. Lee"],
      ["Schedule", "Week 1 (Aug 31 - Sep 4)\tAtoms and elements", "Quiz 1 due Sept 11"],
    ]);
    const result = await extractDocumentText(pdf);
    if (!result.ok) throw new Error(result.error);
    expect(result).toMatchObject({ kind: "pdf", pages: 2, truncated: false });
    const lines = result.text.split("\n").filter(Boolean);
    expect(lines[0]).toBe("CHEM 101: General Chemistry");
    expect(lines).toContain("Week 1 (Aug 31 - Sep 4)\tAtoms and elements");
    const draft = parseSyllabus(result.text, { today: "2026-10-23" });
    expect(draft.course.code?.value).toBe("CHEM 101");
    expect(draft.assessments[0]).toMatchObject({ title: "Quiz 1", date: "2026-09-11" });
    expect(draft.topics[0]).toMatchObject({ title: "Atoms and elements", week: 1 });
  });

  it("refuses PDFs over the page limit and PDFs without text", async () => {
    const long = makePdf(Array.from({ length: MAX_PDF_PAGES + 1 }, (_, i) => [`Page ${i + 1}`]));
    const tooLong = await extractDocumentText(long);
    expect(tooLong).toMatchObject({ ok: false, error: expect.stringMatching(/41 pages/) });
    const blank = await extractDocumentText(makePdf([[]]));
    expect(blank).toMatchObject({ ok: false, error: expect.stringMatching(/no selectable text/) });
    const broken = await extractDocumentText(new TextEncoder().encode("%PDF-1.7\nthis is not really a pdf"));
    expect(broken.ok).toBe(false);
  });

  it("reads a .docx with lists and a schedule table", async () => {
    const docx = makeDocx(
      p("HIST 220 &amp; Society") +
        p("Learning Objectives") +
        p("Analyze primary sources", true) +
        `<w:tbl>${row("Week 2", "Industrial revolution", "Response paper due Sept 11, 2026")}</w:tbl>`,
    );
    const result = await extractDocumentText(docx);
    if (!result.ok) throw new Error(result.error);
    expect(result.kind).toBe("docx");
    expect(result.text.split("\n")).toEqual([
      "HIST 220 & Society",
      "Learning Objectives",
      "• Analyze primary sources",
      "Week 2\tIndustrial revolution\tResponse paper due Sept 11, 2026",
    ]);
    const draft = parseSyllabus(result.text, { today: "2026-10-23" });
    expect(draft.objectives[0].text).toBe("Analyze primary sources");
    expect(draft.assessments[0]).toMatchObject({ title: "Response paper", date: "2026-09-11", confidence: "high" });
  });

  it("stops a ZIP bomb instead of inflating it", async () => {
    const bomb = makeZip([{ name: "word/document.xml", data: Buffer.alloc(20_000_000, 0x41), deflate: true, claimedSize: 1000 }]);
    expect(bomb.length).toBeLessThan(MAX_FILE_BYTES);
    const result = await extractDocumentText(bomb);
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/too large or damaged/) });
  });

  it("checks size and emptiness first, and reads plain and UTF-16 text", async () => {
    expect(await extractDocumentText(new Uint8Array())).toMatchObject({ ok: false });
    expect(await extractDocumentText(new Uint8Array(MAX_FILE_BYTES + 1).fill(0x41))).toMatchObject({ ok: false, error: expect.stringMatching(/3.5 MB/) });
    const utf16 = new Uint8Array([0xff, 0xfe, ...Buffer.from("Midterm exam: October 14, 2026", "utf16le")]);
    expect(await extractDocumentText(utf16)).toMatchObject({ ok: true, kind: "text", text: "Midterm exam: October 14, 2026" });
  });
});

describe("docx and pdf text shaping", () => {
  it("joins table cells with tabs and keeps line breaks in cells inside the cell", () => {
    const xml = docxXml(`<w:tbl>${row("Week 1", "Intro")}<w:tr><w:tc><w:p><w:r><w:t>A</w:t><w:br/><w:t>B</w:t></w:r></w:p></w:tc></w:tr></w:tbl>`);
    expect(documentXmlToText(xml)).toBe("Week 1\tIntro\nA B");
  });

  it("groups positioned PDF text into lines top to bottom", () => {
    const item = (str: string, x: number, y: number, width = str.length * 5) => ({ str, transform: [10, 0, 0, 10, x, y], width, height: 10 });
    expect(itemsToLines([item("World", 102, 700), item("Hello", 72, 700), item("Next line", 72, 686), item("Far column", 400, 686)])).toBe(
      "Hello World\nNext line\tFar column",
    );
  });
});

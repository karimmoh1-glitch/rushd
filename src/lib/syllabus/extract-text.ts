import "server-only";
import { DocxError, docxToText, isDocx } from "./docx";
import { MAX_SYLLABUS_CHARS, normalizeSyllabusText } from "./parse";

// Turns an uploaded syllabus into plain text, in memory. The file's real type
// comes from its bytes (never its name or the browser's Content-Type), it is
// size-, page- and time-limited, and it is never written anywhere: only the
// extracted text survives, and only if the student confirms the import.

export const MAX_FILE_BYTES = 3_500_000; // under the 4 MB server-action body limit
export const MAX_PDF_PAGES = 40;
export const EXTRACT_TIMEOUT_MS = 15_000;
const MAX_DOCX_XML_BYTES = 12_000_000;

export type SourceKind = "pdf" | "docx" | "text";

export type ExtractResult =
  | { ok: true; kind: SourceKind; text: string; pages: number | null; truncated: boolean }
  | { ok: false; error: string };

function startsWith(bytes: Uint8Array, signature: number[], offset = 0): boolean {
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
const ZIP = [0x50, 0x4b, 0x03, 0x04];
const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // old .doc / .xls
const RTF = [0x7b, 0x5c, 0x72, 0x74, 0x66]; // {\rtf
const PNG = [0x89, 0x50, 0x4e, 0x47];
const JPEG = [0xff, 0xd8, 0xff];
const GIF = [0x47, 0x49, 0x46, 0x38];

export type Sniffed = SourceKind | { unsupported: string };

/** What the bytes really are. */
export function sniffDocument(bytes: Uint8Array): Sniffed {
  // The PDF header may follow a little junk; the spec allows it in the first 1 KB.
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (startsWith(bytes, PDF) || head.includes("%PDF-")) return "pdf";
  if (startsWith(bytes, ZIP)) {
    return isDocx(bytes) ? "docx" : { unsupported: "That's a ZIP file, not a Word document. Upload a PDF or .docx, or paste the text." };
  }
  if (startsWith(bytes, OLE)) return { unsupported: "Older .doc files can't be read. Save it as .docx or PDF, or paste the text." };
  if (startsWith(bytes, RTF)) return { unsupported: "RTF files can't be read. Save it as .docx or PDF, or paste the text." };
  if (startsWith(bytes, PNG) || startsWith(bytes, JPEG) || startsWith(bytes, GIF)) {
    return { unsupported: "That's an image. Rushd reads PDF, .docx, and text — or paste the syllabus text." };
  }
  if (decodeText(bytes) !== null) return "text";
  return { unsupported: "Rushd can't read that file type. Upload a PDF, .docx, or .txt, or paste the text." };
}

/** UTF-8 (or BOM-marked UTF-16) text without binary control characters, else null. */
export function decodeText(bytes: Uint8Array): string | null {
  let text: string;
  try {
    if (startsWith(bytes, [0xff, 0xfe])) text = new TextDecoder("utf-16le", { fatal: true }).decode(bytes.subarray(2));
    else if (startsWith(bytes, [0xfe, 0xff])) text = new TextDecoder("utf-16be", { fatal: true }).decode(bytes.subarray(2));
    else text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  let control = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code === 0) return null;
    if (code < 32 && code !== 9 && code !== 10 && code !== 13 && code !== 12) control += 1;
  }
  if (control > Math.max(4, text.length / 200)) return null;
  return text;
}

class TimeoutError extends Error {}

async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

interface PdfTextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  hasEOL?: boolean;
}

/** Rebuilds lines from positioned text: same baseline = same line, wide gaps = table columns. */
export function itemsToLines(items: PdfTextItem[]): string {
  const usable = items.filter((item) => typeof item.str === "string" && Array.isArray(item.transform));
  const rows: { y: number; size: number; items: PdfTextItem[] }[] = [];
  for (const item of usable) {
    const y = item.transform[5];
    const size = Math.max(1, Math.hypot(item.transform[2], item.transform[3]) || item.height || 10);
    const row = rows.find((r) => Math.abs(r.y - y) <= Math.max(2, Math.min(r.size, size) * 0.45));
    if (row) row.items.push(item);
    else rows.push({ y, size, items: [item] });
  }
  rows.sort((a, b) => b.y - a.y);
  const lines: string[] = [];
  let previous: { y: number; size: number } | null = null;
  for (const row of rows) {
    if (previous && previous.y - row.y > Math.max(previous.size, row.size) * 1.9) lines.push("");
    row.items.sort((a, b) => a.transform[4] - b.transform[4]);
    let line = "";
    let lastEnd: number | null = null;
    for (const item of row.items) {
      const x = item.transform[4];
      // PDF.js reports a gap as a whitespace item as wide as the gap.
      if (item.str && !item.str.trim()) {
        const wide = (item.width || 0) > row.size * 1.6;
        if (wide && !line.endsWith("\t")) line = `${line.trimEnd()}\t`;
        else if (!wide && !/\s$/.test(line)) line += " ";
        lastEnd = x + (item.width || 0);
        continue;
      }
      if (lastEnd !== null && item.str) {
        const gap = x - lastEnd;
        if (gap > row.size * 1.6) line += "\t";
        else if (gap > row.size * 0.12 && !/\s$/.test(line) && !/^\s/.test(item.str)) line += " ";
      }
      line += item.str;
      if (item.str) lastEnd = x + (item.width || 0);
    }
    lines.push(line.replace(/[ ]{2,}/g, " ").trimEnd());
    previous = row;
  }
  return lines.join("\n");
}

async function pdfToText(bytes: Uint8Array): Promise<{ text: string; pages: number } | { error: string }> {
  // Loaded only here, on the server: the PDF reader never reaches a browser bundle.
  const { getDocumentProxy } = await import("unpdf");
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | null = null;
  try {
    pdf = await getDocumentProxy(new Uint8Array(bytes), {
      disableFontFace: true,
      useSystemFonts: false,
      stopAtErrors: false,
      verbosity: 0,
    });
    if (pdf.numPages > MAX_PDF_PAGES) return { error: `That PDF has ${pdf.numPages} pages. Rushd reads syllabi up to ${MAX_PDF_PAGES} pages — upload just the syllabus part, or paste the text.` };
    const pages: string[] = [];
    let chars = 0;
    for (let n = 1; n <= pdf.numPages && chars < MAX_SYLLABUS_CHARS; n++) {
      const page = await pdf.getPage(n);
      const content = await page.getTextContent();
      const text = itemsToLines(content.items.flatMap((item) => ("str" in item ? [item] : [])));
      pages.push(text);
      chars += text.length;
      page.cleanup();
    }
    return { text: pages.join("\n\n"), pages: pdf.numPages };
  } catch (error) {
    const name = (error as Error)?.name ?? "";
    if (name === "PasswordException") return { error: "That PDF is password-protected. Remove the password or paste the text." };
    return { error: "Rushd couldn't read that PDF. Try another copy, or paste the text." };
  } finally {
    await pdf?.loadingTask.destroy().catch(() => {});
  }
}

/** Reads a syllabus file into normalized text. Never throws. */
export async function extractDocumentText(bytes: Uint8Array): Promise<ExtractResult> {
  if (bytes.length === 0) return { ok: false, error: "That file is empty." };
  if (bytes.length > MAX_FILE_BYTES) return { ok: false, error: "That file is over the 3.5 MB limit. Upload just the syllabus, or paste the text." };
  const kind = sniffDocument(bytes);
  if (typeof kind !== "string") return { ok: false, error: kind.unsupported };

  try {
    let raw: string;
    let pages: number | null = null;
    if (kind === "pdf") {
      const result = await withTimeout(pdfToText(bytes), EXTRACT_TIMEOUT_MS);
      if ("error" in result) return { ok: false, error: result.error };
      raw = result.text;
      pages = result.pages;
    } else if (kind === "docx") {
      raw = docxToText(bytes, MAX_DOCX_XML_BYTES);
    } else {
      raw = decodeText(bytes) ?? "";
    }
    const text = normalizeSyllabusText(raw);
    if (text.replace(/\s/g, "").length < 20) {
      return {
        ok: false,
        error: kind === "pdf" ? "That PDF has no selectable text (it may be a scan). Copy the text out of it and paste it instead." : "There's no readable text in that file.",
      };
    }
    return { ok: true, kind, text, pages, truncated: raw.trim().length > MAX_SYLLABUS_CHARS };
  } catch (error) {
    if (error instanceof TimeoutError) return { ok: false, error: "Reading that file took too long. Paste the text instead." };
    if (error instanceof DocxError) return { ok: false, error: `Rushd couldn't read that Word file: ${error.message}` };
    return { ok: false, error: "Rushd couldn't read that file. Paste the text instead." };
  }
}

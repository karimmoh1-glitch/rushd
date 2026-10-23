import "server-only";
import { inflateRawSync } from "node:zlib";

// Reads the text of a .docx (a ZIP of XML parts) without a dependency: find
// word/document.xml in the ZIP's central directory, inflate it with a hard
// output limit (so a ZIP bomb fails instead of filling memory), and turn the
// paragraph, tab, list, and table markup into lines the syllabus parser reads.

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

export class DocxError extends Error {}

function u16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}
function u32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

/** The uncompressed bytes of one ZIP entry, or null when the archive has no such entry. */
export function readZipEntry(bytes: Uint8Array, name: string, maxBytes: number): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-central-directory record sits in the last 64 KB + 22 bytes.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (u32(view, i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new DocxError("Not a readable ZIP archive.");
  const entries = u16(view, eocd + 10);
  let offset = u32(view, eocd + 16);
  if (entries === 0xffff || offset === 0xffffffff) throw new DocxError("ZIP64 archives aren't supported.");
  if (entries > 2000) throw new DocxError("Too many parts in this document.");

  for (let i = 0; i < entries; i++) {
    if (offset + 46 > bytes.length || u32(view, offset) !== CENTRAL_SIG) throw new DocxError("Damaged ZIP directory.");
    const method = u16(view, offset + 10);
    const compressedSize = u32(view, offset + 20);
    const size = u32(view, offset + 24);
    const nameLength = u16(view, offset + 28);
    const extraLength = u16(view, offset + 30);
    const commentLength = u16(view, offset + 32);
    const localOffset = u32(view, offset + 42);
    const entryName = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (entryName !== name) continue;

    if (size > maxBytes) throw new DocxError("This document is too large to read.");
    if (localOffset + 30 > bytes.length || u32(view, localOffset) !== LOCAL_SIG) throw new DocxError("Damaged ZIP entry.");
    const dataStart = localOffset + 30 + u16(view, localOffset + 26) + u16(view, localOffset + 28);
    const data = bytes.subarray(dataStart, dataStart + compressedSize);
    if (data.length !== compressedSize) throw new DocxError("Damaged ZIP entry.");
    if (method === 0) return data;
    if (method === 8) {
      try {
        return inflateRawSync(data, { maxOutputLength: maxBytes });
      } catch {
        throw new DocxError("This document is too large or damaged to read.");
      }
    }
    throw new DocxError("Unsupported compression in this document.");
  }
  return null;
}

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    const lower = entity.toLowerCase();
    if (lower === "amp") return "&";
    if (lower === "lt") return "<";
    if (lower === "gt") return ">";
    if (lower === "quot") return '"';
    if (lower === "apos") return "'";
    const code = lower.startsWith("#x") ? parseInt(lower.slice(2), 16) : parseInt(lower.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : "";
  });
}

/** WordprocessingML → plain text: paragraphs are lines, list items get a bullet, table cells a tab. */
export function documentXmlToText(xml: string): string {
  const out: string[] = [];
  let paragraph = "";
  let listItem = false;
  let inText = false;
  let cellDepth = 0;
  let rowCells: string[] | null = null;
  let cell = "";

  const emit = (text: string) => {
    if (cellDepth > 0) cell += text;
    else paragraph += text;
  };

  const tokens = xml.match(/<[^>]+>|[^<]+/g) ?? [];
  for (const token of tokens) {
    if (token[0] !== "<") {
      if (inText) emit(decodeEntities(token));
      continue;
    }
    const tag = token.match(/^<\/?([\w:]+)/)?.[1] ?? "";
    const closing = token.startsWith("</");
    const selfClosing = token.endsWith("/>");
    switch (tag) {
      case "w:t":
        inText = !closing && !selfClosing;
        break;
      case "w:tab":
        if (!closing) emit("\t");
        break;
      case "w:br":
      case "w:cr":
        if (!closing) emit(cellDepth > 0 ? " " : "\n");
        break;
      case "w:numPr":
        if (!closing) listItem = true;
        break;
      case "w:p":
        if (closing || selfClosing) {
          if (cellDepth > 0) {
            cell += " ";
          } else {
            out.push(`${listItem && paragraph.trim() ? "• " : ""}${paragraph}`);
            paragraph = "";
          }
          listItem = false;
        }
        break;
      case "w:tr":
        if (!closing && !selfClosing) rowCells = [];
        else if (closing && rowCells) {
          out.push(rowCells.map((c) => c.replace(/\s+/g, " ").trim()).join("\t"));
          rowCells = null;
        }
        break;
      case "w:tc":
        if (!closing && !selfClosing) {
          cellDepth += 1;
          cell = "";
        } else if (closing) {
          cellDepth = Math.max(0, cellDepth - 1);
          rowCells?.push(cell);
          cell = "";
        }
        break;
    }
  }
  if (paragraph) out.push(paragraph);
  return out.join("\n");
}

/** Plain text of a .docx file. */
export function docxToText(bytes: Uint8Array, maxXmlBytes: number): string {
  const entry = readZipEntry(bytes, "word/document.xml", maxXmlBytes);
  if (!entry) throw new DocxError("This ZIP file isn't a Word document.");
  return documentXmlToText(new TextDecoder().decode(entry));
}

/** True when a ZIP archive contains a Word document body. */
export function isDocx(bytes: Uint8Array): boolean {
  try {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
      if (u32(view, i) !== EOCD_SIG) continue;
      const entries = u16(view, i + 10);
      let offset = u32(view, i + 16);
      for (let n = 0; n < Math.min(entries, 2000); n++) {
        if (offset + 46 > bytes.length || u32(view, offset) !== CENTRAL_SIG) return false;
        const nameLength = u16(view, offset + 28);
        const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
        if (name === "word/document.xml") return true;
        offset += 46 + nameLength + u16(view, offset + 30) + u16(view, offset + 32);
      }
      return false;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Test-only reader for the first worksheet of an .xlsx file: ours (stored) or one re-saved by a spreadsheet
 * program (deflated, shared strings). It reports each cell's stored type and whether it holds a formula, so tests
 * can check what a spreadsheet will actually do with the cell, not just the text.
 */

import { inflateRawSync } from 'node:zlib';

export interface ReadCell {
  ref: string;
  /** The cell's `t` attribute: 's' shared string, 'inlineStr', 'str' (formula text result), 'n' or '' number, 'b', 'e'. */
  type: string;
  formula: boolean;
  value: string | number | null;
}

export interface ReadSheet {
  /** Every zip entry, decompressed, by name. */
  files: Map<string, string>;
  cells: ReadCell[];
  /** Rows of values by column index; missing cells are null. */
  rows: (string | number | null)[][];
}

export function unzip(data: Uint8Array): Map<string, string> {
  const buf = Buffer.from(data);
  const files = new Map<string, string>();
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  if (end < 0) throw new Error('not a zip file');
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error('bad central directory');
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const offset = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    const localStart = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28);
    const raw = buf.subarray(localStart, localStart + size);
    const content = method === 0 ? raw : method === 8 ? inflateRawSync(raw) : null;
    if (!content) throw new Error(`unsupported zip method ${method}`);
    files.set(name, content.toString('utf8'));
    at += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

/** XML entities and character references, then the OOXML `_xHHHH_` escape. */
export function decodeText(xml: string): string {
  const entities = xml.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e]!;
  });
  return entities.replace(/_x([0-9A-Fa-f]{4})_/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

/** All text runs of one <si> or <is>, joined (rich text keeps its runs in <r><t>). */
const runs = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)].map((m) => decodeText(m[1] ?? '')).join('');

const columnIndex = (ref: string) => [...ref.replace(/\d+$/, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;

export function readXlsx(data: Uint8Array): ReadSheet {
  const files = unzip(data);
  const shared = [...(files.get('xl/sharedStrings.xml') ?? '').matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => runs(m[1]!));
  const sheet = files.get('xl/worksheets/sheet1.xml');
  if (!sheet) throw new Error('no xl/worksheets/sheet1.xml');
  const cells: ReadCell[] = [];
  const rows: (string | number | null)[][] = [];
  for (const m of sheet.matchAll(/<c\s([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const attrs = m[1]!;
    const body = m[2] ?? '';
    const ref = /\br="([A-Z]+\d+)"/.exec(attrs)![1]!;
    const type = /\bt="(\w+)"/.exec(attrs)?.[1] ?? '';
    const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
    let value: string | number | null = null;
    if (type === 's') value = shared[Number(v)]!;
    else if (type === 'inlineStr') value = runs(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? '');
    else if (type === 'str') value = v === undefined ? null : decodeText(v);
    else if (v !== undefined) value = type === '' || type === 'n' ? Number(v) : decodeText(v);
    cells.push({ ref, type, formula: /<f[\s>/]/.test(body), value });
    const r = Number(/\d+$/.exec(ref)![0]) - 1;
    (rows[r] ??= [])[columnIndex(ref)] = value;
  }
  const width = Math.max(0, ...rows.map((r) => r?.length ?? 0));
  return { files, cells, rows: Array.from(rows, (r) => Array.from({ length: width }, (_, i) => r?.[i] ?? null)) };
}

/** Rows below the header as records keyed by the header row. */
export function records(sheet: ReadSheet): Record<string, string | number | null>[] {
  const [head, ...body] = sheet.rows;
  return body.map((r) => Object.fromEntries(head!.map((h, i) => [String(h), r[i] ?? null])));
}

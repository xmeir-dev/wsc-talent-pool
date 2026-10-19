/**
 * A small, dependency-free Excel (.xlsx, Office Open XML) writer for the person-facing downloads.
 *
 * Why not CSV: a spreadsheet opening a CSV guesses each cell's type, so a value such as `=1+2`, `+1+2`,
 * `-1+2` or `@SUM(1,2)` can become a formula. Quoting a CSV cell only escapes commas; it does not stop that.
 * Here every cell's type is written explicitly:
 * - text (every value that came from a file or a person) is an inline string cell (`t="inlineStr"`) with the
 *   Text number format (`@`), so it is shown and kept as the literal text. No cell is ever a formula (`<f>`),
 *   and no text is auto-typed or altered (no added apostrophes or prefixes).
 * - counts and ranks are numeric cells (`<v>3</v>`), so they sort and add up as numbers.
 * The column decides the type, never the look of a value: "007" in a text column stays the text "007".
 *
 * Verified by opening and re-saving in LibreOffice (tests/xlsx-libreoffice.test.ts; docs/export-formats.md
 * names the version). This is not a claim about every spreadsheet program.
 *
 * Output is deterministic: the same rows give the same bytes (fixed zip timestamps, no compression).
 */

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export type XlsxCell = string | number | null | undefined;

export interface XlsxColumn {
  /** Header text; also the key into each row. */
  name: string;
  /** 'number' cells are numeric when the value is a finite number, blank when null. Everything else is text. */
  type?: 'text' | 'number';
}

const STYLE_TEXT = 1;
const STYLE_HEADER = 2;

/**
 * Text as XML character data that a reader turns back into exactly the same string:
 * XML special characters are escaped; tab, line feed and carriage return are character references (so they are
 * not normalised away); other control characters, which XML cannot hold, use the OOXML `_xHHHH_` escape; a
 * literal `_xHHHH_` in the text is itself escaped (`_x005F_`) so it is not decoded. A lone surrogate (not valid
 * Unicode) becomes U+FFFD.
 */
export function cellText(value: string): string {
  let out = '';
  const s = value.replace(/_x([0-9A-Fa-f]{4})_/g, '_x005F_x$1_');
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      out += s[i]! + s[i + 1]!;
      i++;
    } else if (c >= 0xd800 && c <= 0xdfff) out += '�';
    else if (c === 0x26) out += '&amp;';
    else if (c === 0x3c) out += '&lt;';
    else if (c === 0x3e) out += '&gt;';
    else if (c === 0x22) out += '&quot;';
    else if (c === 0x09 || c === 0x0a || c === 0x0d) out += `&#${c};`;
    else if (c < 0x20 || c === 0xfffe || c === 0xffff) out += `_x${c.toString(16).toUpperCase().padStart(4, '0')}_`;
    else out += s[i]!;
  }
  return out;
}

function columnLetter(index: number): string {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const textCell = (ref: string, value: string, style: number) =>
  `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${cellText(value)}</t></is></c>`;

function cell(ref: string, value: XlsxCell, type: XlsxColumn['type']): string {
  if (value === null || value === undefined || value === '') return '';
  if (type === 'number' && typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}"><v>${value}</v></c>`;
  return textCell(ref, String(value), STYLE_TEXT);
}

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const MAIN = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships';

/** One worksheet: a bold header row (frozen) and one row per record. */
export function toXlsx(
  sheetName: string,
  columns: readonly XlsxColumn[],
  rows: ReadonlyArray<Record<string, XlsxCell>>,
): Uint8Array {
  const widths = columns.map((c) => Math.min(60, Math.max(8, c.name.length + 2, ...rows.map((r) => String(r[c.name] ?? '').length + 2))));
  const header = `<row r="1">${columns.map((c, i) => textCell(`${columnLetter(i)}1`, c.name, STYLE_HEADER)).join('')}</row>`;
  const body = rows
    .map((r, ri) => {
      const n = ri + 2;
      return `<row r="${n}">${columns.map((c, ci) => cell(`${columnLetter(ci)}${n}`, r[c.name], c.type)).join('')}</row>`;
    })
    .join('');
  const sheet =
    `${XML}<worksheet xmlns="${MAIN}" xmlns:r="${REL}">` +
    '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
    `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` +
    `<sheetData>${header}${body}</sheetData></worksheet>`;
  const safeName = sheetName.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31) || 'Sheet1';
  const files: [string, string][] = [
    [
      '[Content_Types].xml',
      `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>',
    ],
    [
      '_rels/.rels',
      `${XML}<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ],
    [
      'xl/workbook.xml',
      `${XML}<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="${cellText(safeName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
    ],
    [
      'xl/_rels/workbook.xml.rels',
      `${XML}<Relationships xmlns="${PKG_REL}">` +
        `<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>` +
        `<Relationship Id="rId2" Type="${REL}/styles" Target="styles.xml"/></Relationships>`,
    ],
    [
      'xl/styles.xml',
      // xf 0 General (numbers), xf 1 Text "@" (every text cell), xf 2 Text "@" + bold (header).
      `${XML}<styleSheet xmlns="${MAIN}">` +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
        '<xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        '</styleSheet>',
    ],
    ['xl/worksheets/sheet1.xml', sheet],
  ];
  return zipStored(files.map(([name, text]) => [name, new TextEncoder().encode(text)]));
}

// ---------- A minimal zip container (stored, no compression) ----------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of data) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** 1980-01-01 00:00, the zip format's earliest date, so the bytes never depend on the clock. */
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

function zipStored(files: [string, Uint8Array][]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nameBytes = new TextEncoder().encode(name);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(6, 0, true);
    local.setUint16(8, 0, true);
    local.setUint16(10, DOS_TIME, true);
    local.setUint16(12, DOS_DATE, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    local.setUint16(28, 0, true);
    chunks.push(new Uint8Array(local.buffer), nameBytes, data);

    const dir = new DataView(new ArrayBuffer(46));
    dir.setUint32(0, 0x02014b50, true);
    dir.setUint16(4, 20, true);
    dir.setUint16(6, 20, true);
    dir.setUint16(8, 0, true);
    dir.setUint16(10, 0, true);
    dir.setUint16(12, DOS_TIME, true);
    dir.setUint16(14, DOS_DATE, true);
    dir.setUint32(16, crc, true);
    dir.setUint32(20, data.length, true);
    dir.setUint32(24, data.length, true);
    dir.setUint16(28, nameBytes.length, true);
    dir.setUint32(42, offset, true);
    central.push(new Uint8Array(dir.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  const all = [...chunks, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of all) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

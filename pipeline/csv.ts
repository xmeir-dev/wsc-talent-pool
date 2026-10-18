/**
 * Minimal RFC 4180 CSV reader/writer. No dependencies, works in Node and the browser.
 */

export type CsvRecord = Record<string, string>;

export interface ParsedCsv {
  header: string[];
  records: CsvRecord[];
}

/** Parse CSV text into header + records keyed by header name. Trims a UTF-8 BOM. */
export function parseCsv(text: string): ParsedCsv {
  const rows = parseRows(text.replace(/^﻿/, ''));
  const nonEmpty = rows.filter((r) => !(r.length === 1 && r[0]!.trim() === ''));
  const [headerRow, ...dataRows] = nonEmpty;
  if (!headerRow) return { header: [], records: [] };
  const header = headerRow.map((h) => h.trim());
  const records = dataRows.map((row) => {
    const rec: CsvRecord = {};
    header.forEach((h, i) => {
      rec[h] = row[i] ?? '';
    });
    return rec;
  });
  return { header, records };
}

function parseRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize rows to CSV with a header line. Line endings are \n; output ends with a newline. */
export function toCsv(columns: readonly string[], rows: ReadonlyArray<Record<string, string | number | null>>): string {
  const lines = [columns.map(escapeCell).join(',')];
  for (const row of rows) lines.push(columns.map((c) => escapeCell(row[c])).join(','));
  return lines.join('\n') + '\n';
}

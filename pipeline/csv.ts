/**
 * Strict RFC 4180 CSV reader and exact writer. No dependencies, works in Node and the browser.
 *
 * The reader rejects a file whose structure is broken instead of guessing: a quote that is never closed,
 * a quote in the middle of an unquoted value, text after a closing quote, a row with more or fewer cells
 * than the header, and a header with a blank, repeated or case-only-different column name. Each problem
 * names the line and column, so a person can find it. It keeps what is valid: quoted commas, line breaks
 * and doubled quotes inside quotes, a UTF-8 byte order mark, and CRLF, LF or CR line endings.
 *
 * The writer is the exact interchange format (CLI output, CRM import, source tables): values go out as
 * they are, only quoted where CSV punctuation needs it. It never alters a value to make it "safe" for a
 * spreadsheet; the person-facing download is a typed Excel file instead (see xlsx.ts).
 */

import { DataValidationError } from './errors';

export type CsvRecord = Record<string, string>;

export interface ParsedCsv {
  header: string[];
  records: CsvRecord[];
  /** The physical line (1-based) each record starts on, parallel to `records`. A quoted line break makes a record span lines. */
  lines: number[];
}

/** A file that is not valid CSV. `problems` name the line and column of each one. */
export class CsvFormatError extends DataValidationError {
  constructor(problems: string[]) {
    super(problems);
    this.name = 'CsvFormatError';
  }
}

/** At most this many row-width problems are listed; the rest are counted. */
const MAX_LISTED = 10;

interface Row {
  cells: string[];
  line: number;
}

const where = (line: number, column: number) => `line ${line}, column ${column}`;

/** Parse CSV text into header + records keyed by header name. Throws CsvFormatError when the structure is broken. */
export function parseCsv(text: string): ParsedCsv {
  const rows = parseRows(text.replace(/^﻿/, ''));
  // Blank lines (nothing on them at all) are skipped; they hold no cells.
  const nonEmpty = rows.filter((r) => !(r.cells.length === 1 && r.cells[0] === ''));
  const [headerRow, ...dataRows] = nonEmpty;
  if (!headerRow) return { header: [], records: [], lines: [] };
  const header = headerRow.cells.map((h) => h.trim());
  const problems = headerProblems(header, headerRow.line);
  const wrongWidth = dataRows.filter((r) => r.cells.length !== header.length);
  for (const r of wrongWidth.slice(0, MAX_LISTED)) {
    problems.push(
      `line ${r.line}: ${r.cells.length} ${r.cells.length === 1 ? 'value' : 'values'} but the header has ${header.length} columns; ` +
        'check for a missing or extra comma, or a value with a comma that is not in quotes',
    );
  }
  if (wrongWidth.length > MAX_LISTED) problems.push(`…and ${wrongWidth.length - MAX_LISTED} more rows with the wrong number of values`);
  if (problems.length > 0) throw new CsvFormatError(problems);
  const records = dataRows.map((row) => {
    const rec: CsvRecord = {};
    header.forEach((h, i) => {
      rec[h] = row.cells[i]!;
    });
    return rec;
  });
  return { header, records, lines: dataRows.map((r) => r.line) };
}

function headerProblems(header: string[], line: number): string[] {
  const problems: string[] = [];
  const seen = new Map<string, number>();
  header.forEach((h, i) => {
    if (h === '') {
      problems.push(`${where(line, i + 1)}: the header has a column with no name`);
      return;
    }
    const key = h.toLowerCase();
    const first = seen.get(key);
    if (first === undefined) seen.set(key, i);
    else
      problems.push(
        header[first] === h
          ? `line ${line}: column "${h}" appears twice (columns ${first + 1} and ${i + 1}); it is unclear which one to use`
          : `line ${line}: columns ${first + 1} ("${header[first]}") and ${i + 1} ("${h}") differ only in capitals; it is unclear which one to use`,
      );
  });
  return problems;
}

function parseRows(text: string): Row[] {
  const rows: Row[] = [];
  let cells: string[] = [];
  let field = '';
  let line = 1;
  let rowLine = 1;
  let inQuotes = false;
  let quoteLine = 0;
  let quoteColumn = 0;
  /** The current field was quoted and its closing quote has been read: only a comma or a line end may follow. */
  let closed = false;
  const fail = (message: string): never => {
    throw new CsvFormatError([message]);
  };
  const endField = () => {
    cells.push(field);
    field = '';
    closed = false;
  };
  const endRow = () => {
    endField();
    rows.push({ cells, line: rowLine });
    cells = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
          closed = true;
        }
      } else {
        if (c === '\n' || (c === '\r' && text[i + 1] !== '\n')) line++;
        field += c;
      }
    } else if (c === ',') {
      endField();
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
      line++;
      rowLine = line;
    } else if (closed) {
      fail(`${where(line, cells.length + 1)}: unexpected text after a closing quote; a quote inside a quoted value must be doubled ("")`);
    } else if (c === '"') {
      if (field !== '')
        fail(
          `${where(line, cells.length + 1)}: a quote in the middle of a value that does not start with one; ` +
            'put the whole value in quotes and double any quote inside it',
        );
      inQuotes = true;
      quoteLine = line;
      quoteColumn = cells.length + 1;
    } else {
      field += c;
    }
  }
  if (inQuotes) {
    fail(
      `${where(quoteLine, quoteColumn)}: a quoted value starts here and is never closed, so everything after it ` +
        '(including any later rows) would be read into this one value',
    );
  }
  if (field !== '' || cells.length > 0 || closed) endRow();
  return rows;
}

function escapeCell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize rows to CSV with a header line. Line endings are \n; output ends with a newline. Values are written exactly. */
export function toCsv(columns: readonly string[], rows: ReadonlyArray<Record<string, string | number | null>>): string {
  const lines = [columns.map(escapeCell).join(',')];
  for (const row of rows) lines.push(columns.map((c) => escapeCell(row[c])).join(','));
  return lines.join('\n') + '\n';
}

/**
 * A CSV table with more records appended, every value kept. Columns the new records bring that the table
 * lacks are added at the end (only those in `allowed`, when given); existing rows get them blank.
 */
export function appendRecords(base: string, added: readonly CsvRecord[], allowed?: readonly string[]): string {
  const { header, records } = parseCsv(base);
  const extra: string[] = [];
  for (const r of added)
    for (const k of Object.keys(r)) if (!header.includes(k) && !extra.includes(k) && (!allowed || allowed.includes(k))) extra.push(k);
  return toCsv([...header, ...extra], [...records, ...added]);
}

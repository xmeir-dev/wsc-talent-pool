/**
 * F14 (model): the person-facing download is a typed Excel file; the CRM/CLI CSV keeps every value exactly.
 * The real-spreadsheet check (open, save, reopen in LibreOffice) is tests/xlsx-libreoffice.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { NUMERIC_OUTPUT_COLUMNS, OUTPUT_COLUMNS, parseCsv, splitName, toOutputRows, toXlsx, XLSX_MIME } from '../pipeline';
import { cellText, fitCell, XLSX_MAX_CELL_CHARS } from '../pipeline/xlsx';
import { assessmentDownloads, attendeesDownload, FORMULA_LIKE, LEADING_VARIANTS, payloadPool, variantsDownload } from './formula-payloads';
import { decodeText, readXlsx, records } from './xlsx-read';

const { pool, imported, assessment } = payloadPool();

describe('Excel cells are typed by column, never by how a value looks', () => {
  it('formula-like text is an inline text cell with the Text format; no cell is a formula', () => {
    const file = attendeesDownload(pool);
    expect(file.type).toBe(XLSX_MIME);
    expect(file.fileName).toBe('attendees_formula-check-meetup.xlsx');
    const sheet = readXlsx(file.data);
    expect(sheet.files.get('xl/worksheets/sheet1.xml')).not.toMatch(/<f[\s>/]/);
    const rows = records(sheet);
    expect(imported).toEqual(expect.arrayContaining([...FORMULA_LIKE]));
    expect(rows.map((r) => r.full_name).sort()).toEqual([...imported].sort());
    for (const r of rows) {
      expect(r.company).toBe(r.full_name);
      expect(r.firstname).toBe(splitName(String(r.full_name)).firstname);
    }
    // Every cell, payload or not, is stored as text (style 1 = number format 49 "@").
    expect(sheet.cells.every((c) => c.type === 'inlineStr' && !c.formula)).toBe(true);
    expect(sheet.files.get('xl/worksheets/sheet1.xml')).toMatch(/<c r="A2" s="1" t="inlineStr">/);
    expect(sheet.files.get('xl/styles.xml')).toMatch(/<xf numFmtId="49"[^>]*applyNumberFormat="1"\/>/);
  });

  it('leading whitespace and control characters come back exactly from the file', () => {
    const { file } = variantsDownload(pool);
    const rows = records(readXlsx(file.data));
    expect(rows.map((r) => r.full_name)).toEqual([...LEADING_VARIANTS]);
    expect(rows.map((r) => r.company)).toEqual([...LEADING_VARIANTS]);
  });

  it('XML text escaping round-trips, including a literal _xHHHH_ and characters XML cannot hold', () => {
    for (const v of ['a&b<c>"d"', '_x0041_ stays literal', '\u0000\u0008\u001f', '\t\n\r', 'é 中 😀', '\ud800 lone']) {
      const expected = v.replace(/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g, '�');
      expect(decodeText(cellText(v))).toBe(expected);
    }
  });

  it('a number column holds numbers; a number-looking string in a text column stays text', () => {
    const sheet = readXlsx(toXlsx('T', [{ name: 'id' }, { name: 'n', type: 'number' }], [{ id: '007', n: 3 }, { id: '1e3', n: null }]));
    expect(sheet.cells.map((c) => [c.ref, c.type, c.value])).toEqual([
      ['A1', 'inlineStr', 'id'],
      ['B1', 'inlineStr', 'n'],
      ['A2', 'inlineStr', '007'],
      ['B2', '', 3],
      ['A3', 'inlineStr', '1e3'],
    ]);
  });

  it('text over the 32,767-character cell limit is cut visibly, never silently; shorter text is untouched', () => {
    const long = 'x'.repeat(40_000);
    const sheet = readXlsx(toXlsx('T', [{ name: 'notes' }], [{ notes: long }, { notes: 'y'.repeat(XLSX_MAX_CELL_CHARS) }]));
    const cut = String(sheet.rows[1]![0]);
    expect(cut).toHaveLength(XLSX_MAX_CELL_CHARS);
    expect(cut).toBe(fitCell(long));
    expect(cut.endsWith(' … [truncated: 40000 characters in total; the CRM import CSV has the full text]')).toBe(true);
    expect(sheet.rows[2]![0]).toBe('y'.repeat(XLSX_MAX_CELL_CHARS));
    // A surrogate pair at the cut is never split.
    const emoji = '😀'.repeat(20_000);
    expect(fitCell(emoji).replace(/ … \[truncated.*$/, '')).toMatch(/^(😀)+$/);
  });

  it('is deterministic: the same rows give the same bytes', () => {
    expect(attendeesDownload(pool).data).toEqual(attendeesDownload(pool).data);
  });
});

describe('acceptance: exact CRM/CLI export and human download of the same assessment', () => {
  const { csv, xlsx, cli } = assessmentDownloads(assessment);

  it('the CRM CSV is the CLI text byte for byte and keeps every original string, unprefixed', () => {
    expect(csv.data).toBe(cli);
    expect(csv.fileName).toBe('candidates_JOB001.csv');
    const rows = parseCsv(csv.data as string).records;
    for (const v of imported) {
      const row = rows.find((r) => r.full_name === v)!;
      expect(row.current_company).toBe(v);
      expect(row.firstname).toBe(splitName(v).firstname);
    }
  });

  it('the Excel download has the same columns, people, decisions and values; counts and ranks are numbers', () => {
    expect(xlsx.fileName).toBe('candidates_JOB001.xlsx');
    expect(xlsx.type).toBe(XLSX_MIME);
    const sheet = readXlsx(xlsx.data as Uint8Array);
    expect(sheet.rows[0]).toEqual([...OUTPUT_COLUMNS]);
    const expected = toOutputRows(assessment);
    const got = records(sheet);
    expect(got).toHaveLength(expected.length);
    got.forEach((row, i) => {
      for (const col of OUTPUT_COLUMNS) {
        const want = expected[i]![col];
        expect(row[col]).toBe(want === '' ? null : want);
      }
    });
    const numericRefs = new Set(NUMERIC_OUTPUT_COLUMNS.map((c) => OUTPUT_COLUMNS.indexOf(c)));
    for (const c of sheet.cells) {
      const col = [...c.ref.replace(/\d+$/, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const header = c.ref.endsWith('1') && /^[A-Z]+1$/.test(c.ref);
      expect(c.formula).toBe(false);
      if (!header && numericRefs.has(col)) expect([c.ref, typeof c.value, c.type]).toEqual([c.ref, 'number', '']);
      else expect([c.ref, c.type]).toEqual([c.ref, 'inlineStr']);
    }
    // The shortlist's ranks are numbers, in order.
    expect(got.filter((r) => r.recommendation === 'shortlist').map((r) => r.shortlist_rank)).toEqual(
      expected.filter((r) => r.recommendation === 'shortlist').map((r) => r.shortlist_rank),
    );
    expect(typeof got[0]!.shortlist_rank).toBe('number');
  });
});

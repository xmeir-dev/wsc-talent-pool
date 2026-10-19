/**
 * F14 (real spreadsheet reader): the Excel downloads, made by the app's real export code, are opened and saved by
 * LibreOffice Calc (headless), then the saved file is opened again and converted to CSV. Every formula-like name and
 * company must still be the literal text (no formula, no computed 3), and counts/ranks must still be numbers.
 *
 * Needs LibreOffice. Without it the check is skipped with a message, so a fresh checkout still passes `npm test`;
 * set XLSX_READER_REQUIRED=1 to make a missing LibreOffice fail instead. Point SOFFICE at the binary if it is not
 * on the usual paths. Supported reader and tested format: docs/export-formats.md.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NUMERIC_OUTPUT_COLUMNS, OUTPUT_COLUMNS, parseCsv, toOutputRows } from '../pipeline';
import { fitCell } from '../pipeline/xlsx';
import { assessmentDownloads, attendeesDownload, LEADING_VARIANTS, payloadPool, variantsDownload } from './formula-payloads';
import { readXlsx, records } from './xlsx-read';

function findSoffice(): string | null {
  // SOFFICE, when set, is the only place looked at (SOFFICE=none forces the skip).
  if (process.env.SOFFICE) return existsSync(process.env.SOFFICE) ? process.env.SOFFICE : null;
  const candidates = [
    '/opt/homebrew/bin/soffice',
    '/usr/local/bin/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
    '/usr/bin/soffice',
    '/usr/bin/libreoffice',
  ];
  for (const p of candidates) if (existsSync(p)) return p;
  const which = spawnSync('which', ['soffice'], { encoding: 'utf8' });
  return which.status === 0 && which.stdout.trim() ? which.stdout.trim() : null;
}

const soffice = findSoffice();
if (!soffice) {
  const message =
    'LibreOffice (soffice) not found: skipping the real-spreadsheet check of the Excel downloads. ' +
    'Install LibreOffice or set SOFFICE=/path/to/soffice to run it.';
  if (process.env.XLSX_READER_REQUIRED) throw new Error(message);
  process.stderr.write(`\n${message}\n`);
}

/**
 * LibreOffice Calc normalises a CRLF inside a cell to LF on open (a line-break convention, not a type change).
 * Every other variant must come back byte for byte.
 */
const CRLF_VARIANT = '\r\n=1+2';

const TITLE = soffice
  ? 'LibreOffice opens, saves and reopens the Excel downloads as literal text'
  : 'SKIPPED (LibreOffice not installed): real-spreadsheet check of the Excel downloads';

describe.skipIf(!soffice)(TITLE, () => {
  let dir: string;
  const run = (args: string[]) =>
    execFileSync(soffice!, [`-env:UserInstallation=${pathToFileURL(join(dir, 'profile')).href}`, '--headless', ...args], {
      encoding: 'utf8',
      timeout: 240_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  const { pool, imported, assessment } = payloadPool();
  const sources = {
    attendees: attendeesDownload(pool).data,
    variants: variantsDownload(pool).file.data,
    // A CRLF variant in its own file, so its documented normalisation does not mix with the exact ones.
    crlf: variantsDownload(pool, [CRLF_VARIANT]).file.data,
    assessment: assessmentDownloads(assessment).xlsx.data as Uint8Array,
    // Over the cell limit: our marker must survive, rather than LibreOffice cutting it silently.
    long: variantsDownload(pool, ['=' + 'x'.repeat(40_000)]).file.data,
  };
  const saved: Record<string, ReturnType<typeof readXlsx>> = {};
  const reopened: Record<string, Record<string, string>[]> = {};
  let version = '';

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'wsc-xlsx-lo-'));
    version = run(['--version']).trim();
    console.info(`Real-spreadsheet check with ${version}`);
    const files = sources;
    for (const [name, data] of Object.entries(files)) writeFileSync(join(dir, `${name}.xlsx`), data);
    // Control: the exact CRM CSV, opened directly. It is not the person download, and this shows why.
    writeFileSync(join(dir, 'crm.csv'), assessmentDownloads(assessment).csv.data);
    // (a) open + save: Calc reads our file and writes its own .xlsx.
    run(['--convert-to', 'xlsx', '--outdir', join(dir, 'saved'), ...Object.keys(files).map((n) => join(dir, `${n}.xlsx`)), join(dir, 'crm.csv')]);
    saved.crm = readXlsx(readFileSync(join(dir, 'saved', 'crm.xlsx')));
    // (b) reopen the saved file: read its XML, and convert it to UTF-8 CSV to see the values Calc holds.
    run(['--convert-to', 'csv:Text - txt - csv (StarCalc):44,34,76,1', '--outdir', join(dir, 'csv'), ...Object.keys(files).map((n) => join(dir, 'saved', `${n}.xlsx`))]);
    for (const name of Object.keys(files)) {
      saved[name] = readXlsx(readFileSync(join(dir, 'saved', `${name}.xlsx`)));
      reopened[name] = parseCsv(readFileSync(join(dir, 'csv', `${name}.csv`), 'utf8')).records;
    }
  }, 300_000);

  afterAll(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  const noFormulas = (name: string) => {
    const xml = saved[name]!.files.get('xl/worksheets/sheet1.xml')!;
    expect(xml).toMatch(/<sheetData>/);
    expect(xml).not.toMatch(/<f[\s>/]/);
    expect(saved[name]!.cells.filter((c) => c.formula)).toEqual([]);
  };

  it('imported names and companies (=1+2, +1+2, -1+2, @SUM(1,2), \\u0001=1+2) stay literal text after save and reopen', () => {
    noFormulas('attendees');
    const sheet = saved.attendees!;
    const textTypes = new Set(sheet.cells.map((c) => c.type));
    expect([...textTypes].every((t) => t === 's' || t === 'inlineStr')).toBe(true);
    const rows = records(sheet);
    expect(rows.map((r) => r.full_name).sort()).toEqual([...imported].sort());
    for (const r of rows) expect(r.company).toBe(r.full_name);
    expect(reopened.attendees!.map((r) => r.full_name).sort()).toEqual([...imported].sort());
    for (const r of reopened.attendees!) expect(r.company).toBe(r.full_name);
  });

  it('leading space, tab, CR, LF, vertical tab, U+0001 and no-break space variants stay exactly as written', () => {
    noFormulas('variants');
    const rows = records(saved.variants!);
    expect(rows.map((r) => r.full_name)).toEqual([...LEADING_VARIANTS]);
    expect(rows.map((r) => r.company)).toEqual([...LEADING_VARIANTS]);
    expect(saved.variants!.cells.every((c) => c.type === 's' || c.type === 'inlineStr')).toBe(true);
    expect(reopened.variants!.map((r) => r.full_name)).toEqual([...LEADING_VARIANTS]);
    expect(reopened.variants!.map((r) => r.company)).toEqual([...LEADING_VARIANTS]);
  });

  it('a CRLF inside a cell stays text, not a formula; Calc stores the line break as LF (its convention)', () => {
    noFormulas('crlf');
    const [row] = records(saved.crlf!);
    expect([row!.full_name, row!.company]).toEqual(['\n=1+2', '\n=1+2']);
    expect(saved.crlf!.cells.every((c) => c.type === 's')).toBe(true);
  });

  it('the full assessment keeps text as text and counts/ranks as numbers after save and reopen', () => {
    noFormulas('assessment');
    const sheet = saved.assessment!;
    expect(sheet.rows[0]).toEqual([...OUTPUT_COLUMNS]);
    const expected = toOutputRows(assessment);
    const got = records(sheet);
    expect(got).toHaveLength(expected.length);
    const numeric = new Set<string>(NUMERIC_OUTPUT_COLUMNS);
    got.forEach((row, i) => {
      for (const col of OUTPUT_COLUMNS) {
        const want = expected[i]![col];
        expect([col, row[col]]).toEqual([col, want === '' ? null : want]);
      }
    });
    const header = sheet.rows[0]!.map(String);
    for (const c of sheet.cells) {
      if (/^[A-Z]+1$/.test(c.ref)) continue;
      const col = header[[...c.ref.replace(/\d+$/, '')].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1]!;
      if (numeric.has(col)) expect([col, c.type, typeof c.value]).toEqual([col, 'n', 'number']);
      else expect([col, c.type]).toEqual([col, 's']);
    }
    for (const v of imported) {
      const row = reopened.assessment!.find((r) => r.full_name === v)!;
      expect([row.current_company, row.firstname]).toEqual([v, v]);
    }
  });

  it('control: the same values in the exact CRM CSV, opened directly, do become a formula (so the check can see one)', () => {
    const formulas = saved.crm!.cells.filter((c) => c.formula);
    expect(formulas.length).toBeGreaterThan(0);
    expect(saved.crm!.files.get('xl/worksheets/sheet1.xml')).toMatch(/<f[^>]*>1\+2<\/f><v>3<\/v>/);
  });

  it('text over the cell limit opens as our visibly truncated text, not a silent cut', () => {
    noFormulas('long');
    const [row] = records(saved.long!);
    expect(row!.full_name).toBe(fitCell('=' + 'x'.repeat(40_000)));
    expect(String(row!.full_name)).toMatch(/ … \[truncated: 40001 characters in total; the CRM import CSV has the full text\]$/);
    expect(reopened.long![0]!.full_name).toBe(row!.full_name);
  });

  it('records the reader version', () => {
    expect(version).toMatch(/^LibreOffice \d+\.\d+/);
  });
});

/**
 * A broken CSV is rejected with its line and column instead of silently swallowing or shifting people.
 * Valid CSV (quoted commas, line breaks and quotes, BOM, CRLF/LF/CR) still reads exactly. Synthetic data only.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSources } from '../../cli/load-sources';
import { buildDataset, CsvFormatError, DataValidationError, parseCsv, toCsv } from '../../pipeline';
import { previewImport } from '../../integration-demo/sources';
import { importAttendeeList } from '../../view/importList';
import { FIXTURE_DIR, ROOT } from '../helpers';

const HEADER = 'hubspot_id,full_name,email,company,title,conference_name,conference_domain,conference_date,source,notes,linkedin_url';
const ADA_BROKEN = 'HS901,Ada Broken,ada@example.test,Synth,Engineer,Parse Summit,Sports Technology,2026-05-01,Badge,"Met at the booth,linkedin.com/in/ada-broken';
const ADA_FIXED = 'HS901,Ada Broken,ada@example.test,Synth,Engineer,Parse Summit,Sports Technology,2026-05-01,Badge,"Met at the booth",linkedin.com/in/ada-broken';
const BOB = 'HS902,Bob Valid,bob@example.test,Synth,Engineer,Parse Summit,Sports Technology,2026-05-01,Badge,,linkedin.com/in/bob-valid';
const file = (...lines: string[]) => [HEADER, ...lines].join('\n') + '\n';

const problemsOf = (fn: () => unknown): string[] => {
  try {
    fn();
  } catch (err) {
    if (err instanceof DataValidationError) return err.problems;
    throw err;
  }
  throw new Error('expected a DataValidationError');
};

describe('acceptance: Ada opens a quote and never closes it, Bob follows', () => {
  const broken = file(ADA_BROKEN, BOB);

  it('the parser refuses it and names where the quote opened', () => {
    expect(() => parseCsv(broken)).toThrow(CsvFormatError);
    expect(problemsOf(() => parseCsv(broken))).toEqual([
      expect.stringMatching(/^line 2, column 10: a quoted value starts here and is never closed/),
    ]);
  });

  it('the pipeline (CLI and both apps) imports no one from it; the corrected file imports both', () => {
    const sources = loadSources(FIXTURE_DIR);
    const problems = problemsOf(() => buildDataset({ ...sources, attendees: broken }));
    expect(problems[0]).toMatch(/^attendees: line 2, column 10: a quoted value starts here and is never closed/);

    const fixed = buildDataset({ ...sources, attendees: file(ADA_FIXED, BOB) });
    expect(fixed.candidates.map((c) => c.fullName).sort()).toEqual(['Ada Broken', 'Bob Valid']);
    expect(fixed.candidates.find((c) => c.fullName === 'Ada Broken')!.attendances[0]!.notes).toBe('Met at the booth');
  });

  it('both importers report it and change nothing; the corrected file adds both people', () => {
    const sources = loadSources(FIXTURE_DIR);
    const before = buildDataset(sources).candidates.length;

    const recruiter = importAttendeeList(sources, broken);
    expect(recruiter.ok).toBe(false);
    if (!recruiter.ok) expect(recruiter.problems[0]).toMatch(/^This list: line 2, column 10: a quoted value starts here and is never closed/);
    const recruiterFixed = importAttendeeList(sources, file(ADA_FIXED, BOB));
    expect(recruiterFixed.ok && recruiterFixed.dataset.candidates.length - before).toBe(2);

    const demoBroken = [
      'full_name,email,conference_name,conference_date,notes,linkedin_url',
      'Ada Broken,ada@example.test,Parse Summit,2026-05-01,"Met at the booth,linkedin.com/in/ada-broken',
      'Bob Valid,bob@example.test,Parse Summit,2026-05-01,,linkedin.com/in/bob-valid',
    ].join('\n');
    const demo = previewImport(demoBroken, sources);
    expect(demo.ok).toBe(false);
    if (!demo.ok) expect(demo.problems[0]).toMatch(/^Line 2, column 5: a quoted value starts here and is never closed/);
    const demoFixed = previewImport(demoBroken.replace('"Met at the booth,', '"Met at the booth",'), sources);
    expect(demoFixed.ok && demoFixed.created).toBe(2);
  });

  it('the CLI rejects the malformed file with an unsuccessful exit and the line', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wsc-csv-'));
    try {
      cpSync(FIXTURE_DIR, join(dir, 'data'), { recursive: true });
      writeFileSync(join(dir, 'data', 'conference_attendees.csv'), broken);
      const run = spawnSync(process.execPath, ['--import', 'tsx', join(ROOT, 'cli', 'run-pipeline.ts'), '--all', '--data', join(dir, 'data'), '--out', join(dir, 'out')], {
        cwd: ROOT,
        encoding: 'utf8',
      });
      expect(run.status).toBe(1);
      expect(run.stderr).toMatch(/attendees: line 2, column 10: a quoted value starts here and is never closed/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 60_000);
});

describe('a header-only attendee file is refused everywhere', () => {
  it('the CLI exits 1 with a clear message, like both importers', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wsc-csv-'));
    try {
      cpSync(FIXTURE_DIR, join(dir, 'data'), { recursive: true });
      writeFileSync(join(dir, 'data', 'conference_attendees.csv'), HEADER + '\n');
      const run = spawnSync(process.execPath, ['--import', 'tsx', join(ROOT, 'cli', 'run-pipeline.ts'), '--all', '--data', join(dir, 'data'), '--out', join(dir, 'out')], {
        cwd: ROOT,
        encoding: 'utf8',
      });
      expect(run.status).toBe(1);
      expect(run.stderr).toMatch(/attendees: the file has a header but no attendee rows/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    const sources = loadSources(FIXTURE_DIR);
    expect(importAttendeeList(sources, HEADER + '\n')).toEqual({ ok: false, problems: ['This list has no attendees.'] });
    expect(previewImport(HEADER + '\n', sources)).toEqual({ ok: false, problems: ['The file has no rows.'] });
  }, 60_000);
});

describe('acceptance: valid quoting round-trips; broken structure never shifts fields', () => {
  it('keeps quoted commas, line breaks, doubled quotes, a BOM and every line ending exactly', () => {
    const values = [
      { a: 'comma, inside', b: 'line\nbreak', c: 'say "hi"' },
      { a: 'crlf\r\ninside', b: '', c: ' padded ' },
      { a: '=1+2', b: '"quoted"', c: 'é ü 中' },
    ];
    const text = toCsv(['a', 'b', 'c'], values);
    for (const eol of ['\n', '\r\n', '\r']) {
      // Change only the row endings, never the content inside quotes.
      const parts = text.split('\n');
      const withEol = '﻿' + rejoin(parts, eol);
      expect(parseCsv(withEol).records).toEqual(values);
    }
    expect(parseCsv(text).lines).toEqual([2, 4, 6]);
  });

  it('a row with more or fewer values than the header is an error naming its line', () => {
    const text = 'a,b,c\n1,2,3\n4,5\n6,7,8,9\n';
    expect(problemsOf(() => parseCsv(text))).toEqual([
      expect.stringMatching(/^line 3: 2 values but the header has 3 columns/),
      expect.stringMatching(/^line 4: 4 values but the header has 3 columns/),
    ]);
  });

  it('a quote in the middle of a value, or text after a closing quote, is an error', () => {
    expect(problemsOf(() => parseCsv('a,b\nx"y,2\n'))[0]).toMatch(/^line 2, column 1: a quote in the middle of a value/);
    expect(problemsOf(() => parseCsv('a,b\n1,"y"z\n'))[0]).toMatch(/^line 2, column 2: unexpected text after a closing quote/);
  });

  it('duplicate, case-only duplicate and blank headers are ambiguous and refused', () => {
    expect(problemsOf(() => parseCsv('email,name,email\n1,2,3\n'))[0]).toMatch(/column "email" appears twice \(columns 1 and 3\)/);
    expect(problemsOf(() => parseCsv('Email,name,email\n1,2,3\n'))[0]).toMatch(/columns 1 \("Email"\) and 3 \("email"\) differ only in capitals/);
    expect(problemsOf(() => parseCsv('a,,c\n1,2,3\n'))[0]).toMatch(/^line 1, column 2: the header has a column with no name/);
  });

  it('missing optional data (no LinkedIn URL, no optional columns) still imports', () => {
    const sources = loadSources(FIXTURE_DIR);
    const minimal = 'full_name,email,conference_name,conference_date\nNo Link,nolink@example.test,Parse Summit,2026-05-01\n';
    const result = importAttendeeList(sources, minimal);
    expect(result.ok && result.added).toBe(1);
    const demo = previewImport(minimal, sources);
    expect(demo.ok && demo.created).toBe(1);
  });

  it('a conference date that is not YYYY-MM-DD is refused with its line', () => {
    const sources = loadSources(FIXTURE_DIR);
    const bad = 'full_name,email,conference_name,conference_date\nOk Row,ok@example.test,Parse Summit,2026-05-01\nBad Date,bad@example.test,Parse Summit,14/11/2026\n';
    const recruiter = importAttendeeList(sources, bad);
    expect(!recruiter.ok && recruiter.problems).toEqual(['Line 3: conference_date "14/11/2026" is not a date (use YYYY-MM-DD).']);
    const demo = previewImport(bad, sources);
    expect(!demo.ok && demo.problems).toEqual(['Line 3: conference_date "14/11/2026" is not a date (use YYYY-MM-DD).']);
    expect(problemsOf(() => buildDataset({ ...sources, attendees: bad }))).toContainEqual(expect.stringMatching(/^attendees: line 3, conference_date: "14\/11\/2026" is not a date/));
  });

  it('the supplied data still reads, unchanged', () => {
    for (const f of ['conference_attendees.csv', 'linkedin_profiles.csv', 'wsc_employees.csv', 'job_openings.csv']) {
      expect(() => parseCsv(readFileSync(join(ROOT, 'data', f), 'utf8'))).not.toThrow();
    }
  });
});

/** Rejoin rows split on "\n", using `eol` only where "\n" ended a row (outside quotes). */
function rejoin(parts: string[], eol: string): string {
  let out = '';
  let open = false;
  parts.forEach((p, i) => {
    out += p;
    open = (p.split('"').length - 1) % 2 === 1 ? !open : open;
    if (i < parts.length - 1) out += open ? '\n' : eol;
  });
  return out;
}

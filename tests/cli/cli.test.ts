import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadSources } from '../../cli/load-sources';
import { cleanForTerminal, formatReport } from '../../cli/report';
import { assessJob, assessmentToCsv, buildDataset, outputFileName, outputXlsxFileName, parseCsv, toCsv, type CandidateAssessment } from '../../pipeline';
import { DATA_DIR, FIXTURE_DIR, ROOT } from '../helpers';

const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);

let work: string;
beforeAll(() => {
  work = mkdtempSync(join(tmpdir(), 'wsc-cli-'));
});
afterAll(() => rmSync(work, { recursive: true, force: true }));

function cli(args: string[]) {
  const run = spawnSync(process.execPath, ['--import', 'tsx', join(ROOT, 'cli', 'run-pipeline.ts'), ...args], { cwd: ROOT, encoding: 'utf8' });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

/** The report block of one person: from their heading line to the blank line after it. */
function block(stdout: string, a: CandidateAssessment): string {
  const heading = a.recommendation === 'shortlist' ? `  #${a.shortlistRank} ${a.candidate.fullName}` : `  - ${a.candidate.fullName}`;
  const start = stdout.split('\n').findIndex((l) => l === heading || l.startsWith(`${heading}  (`));
  expect(start, `${a.candidate.fullName} is in the report`).toBeGreaterThanOrEqual(0);
  const rest = stdout.split('\n').slice(start);
  const end = rest.findIndex((l, i) => i > 0 && l === '');
  return rest.slice(0, end < 0 ? undefined : end).join('\n');
}

function jobResult(dataDir: string, jobId: string) {
  return assessJob(buildDataset(loadSources(dataDir)), jobId);
}

describe('both candidate groups are shown', () => {
  it('JOB001 lists six shortlisted and six needing review, in assessment order with ties kept', () => {
    const run = cli(['JOB001', '--out', join(work, 'real')]);
    expect(run.status).toBe(0);
    const result = jobResult(DATA_DIR, 'JOB001');
    expect(run.stdout).toMatch(/^JOB001 {2}Senior ML Engineer\n6 shortlisted, 6 need review, 63 not recommended for this role \(75 people\)/);
    expect(run.stdout).toContain('SHORTLIST (6)');
    expect(run.stdout).toContain('NEEDS REVIEW (6)');
    expect(run.stdout).toContain('Not recommended for this role: 63');

    const shown = result.candidates.filter((c) => c.recommendation !== 'not_recommended_for_role');
    expect(shown).toHaveLength(12);
    const positions = shown.map((a) => run.stdout.indexOf(`${a.recommendation === 'shortlist' ? `#${a.shortlistRank} ` : '- '}${a.candidate.fullName}`));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((x, y) => x - y));
    expect(run.stdout.indexOf('NEEDS REVIEW')).toBeGreaterThan(positions[5]!);

    // Tied people share a rank and the report says so.
    expect(run.stdout).toMatch(/#2 Chiara Russo {2}\(tied/);
    expect(run.stdout).toMatch(/#2 Lucas Evans {2}\(tied/);
    for (const a of result.candidates.filter((c) => c.recommendation === 'not_recommended_for_role')) expect(run.stdout).not.toContain(a.candidate.fullName);
  }, 60_000);

  it('JOB003 has no shortlist but still shows its five review candidates', () => {
    const run = cli(['JOB003', '--out', join(work, 'real')]);
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('0 shortlisted, 5 need review, 70 not recommended');
    expect(run.stdout).toContain('SHORTLIST (0)');
    expect(run.stdout).toContain('No one meets every shortlist condition; see Needs review below.');
    expect(run.stdout).toContain('NEEDS REVIEW (5)');
    for (const a of jobResult(DATA_DIR, 'JOB003').candidates.filter((c) => c.recommendation === 'needs_review')) expect(run.stdout).toContain(`- ${a.candidate.fullName}`);
  }, 60_000);

  it('--all prints every job', () => {
    const run = cli(['--all', '--out', join(work, 'all')]);
    expect(run.status).toBe(0);
    for (const id of ['JOB001', 'JOB002', 'JOB003', 'JOB004']) expect(run.stdout).toContain(`${id}  `);
    expect(readdirSync(join(work, 'all')).sort()).toEqual(['candidates_JOB001.csv', 'candidates_JOB002.csv', 'candidates_JOB003.csv', 'candidates_JOB004.csv']);
  }, 60_000);
});

describe('the explanation matches the assessment', () => {
  it.each(['JOB001', 'JOB002', 'JOB003'])('every shown candidate for %s carries their own evidence (synthetic edge cases)', (jobId) => {
    const run = cli([jobId, '--data', FIXTURE_DIR, '--out', join(work, 'fx')]);
    expect(run.status).toBe(0);
    for (const a of jobResult(FIXTURE_DIR, jobId).candidates.filter((c) => c.recommendation !== 'not_recommended_for_role')) {
      const text = block(run.stdout, a);
      expect(text).toContain(`Next step: ${a.reviewNextStep}`);
      if (!a.candidate.profile) {
        expect(text).toContain('Required skills: Not available');
        expect(text).toContain('Gaps: Not available');
        expect(text).toContain('Experience: Not available');
        expect(text).toContain('WSC references: Not available');
        continue;
      }
      expect(text).toContain(`${a.tally.required} of ${a.tally.requiredTotal} confirmed on the profile (shortlist needs ${a.tally.requiredNeeded})`);
      const required = a.skills.filter((s) => s.kind === 'required');
      const confirmed = text.split('\n').find((l) => l.trim().startsWith('Confirmed:')) ?? '';
      for (const s of required.filter((s) => s.match === 'named')) expect(confirmed).toContain(s.skill);
      for (const s of required.filter((s) => s.match !== 'named')) expect(confirmed).not.toContain(s.skill);
      for (const s of required.filter((s) => s.match === 'equivalent')) expect(text).toContain(`${s.skill} (related skill: ${s.evidence})`);
      for (const s of required.filter((s) => s.match === 'inferred')) expect(text).toContain(`${s.skill} (likely, from ${s.evidence}; to confirm)`);
      for (const gap of a.skillGaps) expect(text).toContain(gap);
      for (const r of a.possibleReferences) expect(text).toContain(`${r.employeeName} (${r.employeeId}): both at ${r.company}`);
      if (a.possibleReferences.length === 0) expect(text).toContain('WSC references: None found');
    }
  }, 60_000);

  it('a shortlisted candidate who lacks a required skill shows the gap instead of implying a full match', () => {
    const a = jobResult(DATA_DIR, 'JOB001').candidates.find((c) => c.recommendation === 'shortlist' && c.tally.required < c.tally.requiredTotal)!;
    const run = cli(['JOB001', '--out', join(work, 'real')]);
    const text = block(run.stdout, a);
    expect(text).toContain(`${a.tally.required} of ${a.tally.requiredTotal} confirmed`);
    expect(text).toMatch(/Gaps: (?!None identified)/);
  }, 60_000);

  it('names role and company when known, and says "Not available" when not', () => {
    const run = cli(['JOB001', '--data', FIXTURE_DIR, '--out', join(work, 'fx')]);
    expect(run.stdout).toContain('Role: ML Engineer at PlayCV');

    // A person with no profile and nothing listed on the badge has no role to show.
    const result = structuredClone(jobResult(FIXTURE_DIR, 'JOB001'));
    const a = result.candidates.find((c) => c.recommendation === 'needs_review' && c.candidate.profile === null)!;
    for (const att of a.candidate.attendances) {
      att.listedTitle = '';
      att.listedCompany = '';
    }
    expect(block(formatReport(result, null), a)).toContain('Role: Not available');
    a.candidate.attendances[0]!.listedTitle = 'Analyst';
    expect(block(formatReport(result, null), a)).toContain('Role: Analyst');
  });

  it('lists connections that are not in the employee roster, like the CSV does', () => {
    const run = cli(['JOB001', '--data', FIXTURE_DIR, '--out', join(work, 'fx')]);
    const a = jobResult(FIXTURE_DIR, 'JOB001').candidates.find((c) => c.candidate.fullName === 'Una Unresolved')!;
    expect(a.connections.unresolvedIds).toEqual(['WSC999']);
    expect(block(run.stdout, a)).toContain('Listed WSC connections: Maya Levi (WSC002, Senior ML Engineer); WSC999 (not in employee roster)');
  }, 60_000);
});

describe('help', () => {
  it.each([['--help'], ['-h'], ['JOB001', '--help', '--out', 'never-created']])('%s prints usage and writes nothing', (...args) => {
    const before = readdirSync(ROOT).sort();
    const run = cli(args);
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/Usage:/);
    for (const word of ['<job_id>', '--all', '--data', '--out', 'overwritten', 'Default']) expect(run.stdout).toContain(word);
    expect(run.stderr).toBe('');
    expect(readdirSync(ROOT).sort()).toEqual(before);
    expect(existsSync(join(ROOT, 'never-created'))).toBe(false);
  }, 60_000);
});

describe('invalid commands fail before writing anything', () => {
  const out = () => join(work, 'invalid-out');
  it.each<[string, string[], RegExp]>([
    ['unknown flag', ['JOB001', '--bogus'], /Unknown option --bogus/],
    ['unknown short flag', ['JOB001', '-x'], /Unknown option -x/],
    ['missing --out value', ['JOB001', '--out'], /--out needs a folder path/],
    ['flag instead of value', ['JOB001', '--data', '--all'], /--data needs a folder path/],
    ['repeated --out', ['JOB001', '--out', 'a', '--out', 'b'], /--out was given more than once/],
    ['repeated --all', ['--all', '--all'], /--all was given more than once/],
    ['--all with a value', ['--all=yes'], /--all takes no value/],
    ['two job IDs', ['JOB001', 'JOB002'], /one job ID/],
    ['job ID with --all', ['JOB001', '--all'], /either a job ID \(JOB001\) or --all/],
    ['nothing at all', [], /Give a job ID/],
  ])('%s', (_name, args, message) => {
    const withOut = args.includes('--out') ? args : [...args, '--out', out()];
    const run = cli(withOut);
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(message);
    expect(run.stderr).toContain('--help');
    expect(run.stdout).toBe('');
    expect(existsSync(out())).toBe(false);
    expect(existsSync(join(ROOT, 'a'))).toBe(false);
  }, 60_000);

  it('an unknown job lists the valid IDs and writes nothing', () => {
    const run = cli(['JOB999', '--out', out()]);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('Unknown job ID "JOB999". Valid job IDs: JOB001, JOB002, JOB003, JOB004.');
    expect(run.stderr).not.toMatch(/\n\s+at /);
    expect(existsSync(out())).toBe(false);
  }, 60_000);

  it('a missing source file gives a clear message, not a stack trace, and writes nothing', () => {
    const dir = join(work, 'missing-data');
    cpSync(FIXTURE_DIR, dir, { recursive: true });
    rmSync(join(dir, 'wsc_employees.csv'));
    const run = cli(['JOB001', '--data', dir, '--out', out()]);
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/Cannot read source file .*missing-data[/\\]wsc_employees\.csv: it does not exist\./);
    expect(run.stderr).not.toMatch(/\n\s+at /);
    expect(existsSync(out())).toBe(false);
  }, 60_000);

  it('a data folder that does not exist is reported', () => {
    const run = cli(['JOB001', '--data', join(work, 'nowhere'), '--out', out()]);
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/Cannot read source file .*nowhere/);
    expect(existsSync(out())).toBe(false);
  }, 60_000);

  it('an output folder that cannot be created is reported without a stack trace', () => {
    const blocker = join(work, 'a-file');
    writeFileSync(blocker, 'x');
    const run = cli(['JOB001', '--out', join(blocker, 'sub')]);
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/Cannot write to output folder .*a-file[/\\]sub: /);
    expect(run.stderr).not.toMatch(/\n\s+at /);
    expect(run.stdout).toBe('');
  }, 60_000);
});

describe('source job IDs cannot redirect or silently replace exports', () => {
  function withJobs(name: string, change: (rows: Record<string, string>[]) => void): string {
    const dir = join(work, name);
    cpSync(DATA_DIR, dir, { recursive: true });
    const filename = join(dir, 'job_openings.csv');
    const { header, records } = parseCsv(readFileSync(filename, 'utf8'));
    change(records);
    writeFileSync(filename, toCsv(header, records));
    return dir;
  }

  it.each([false, true])('rejects traversal before any output is written (all=%s)', (all) => {
    const id = 'x/../../outside-output';
    const dir = withJobs(`unsafe-${all}`, (rows) => { rows[1]!.job_id = id; });
    const out = join(work, `unsafe-output-${all}`);
    const victim = join(work, 'outside-output.csv');
    const sentinel = 'Existing file must survive';
    writeFileSync(victim, sentinel);
    const run = cli([all ? '--all' : id, '--data', dir, '--out', out]);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('job_id');
    expect(run.stderr).toContain('path separators');
    expect(run.stdout).toBe('');
    expect(existsSync(out)).toBe(false);
    expect(readFileSync(victim, 'utf8')).toBe(sentinel);
  }, 60_000);

  it.each(['x/../../outside', 'x\\..\\outside', 'bad\u0000id', 'bad\nid', ''])('rejects unsafe IDs for both export formats: %j', (id) => {
    expect(() => outputFileName(id)).toThrow(/job_id/);
    expect(() => outputXlsxFileName(id)).toThrow(/job_id/);
  });

  it('rejects case-ambiguous job IDs instead of assessing the first role twice', () => {
    const dir = withJobs('case-ambiguous', (rows) => { rows[1]!.job_id = rows[0]!.job_id!.toLowerCase(); });
    const out = join(work, 'case-ambiguous-output');
    const run = cli(['--all', '--data', dir, '--out', out]);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('differs only by letter case');
    expect(run.stdout).toBe('');
    expect(existsSync(out)).toBe(false);
  }, 60_000);
});

describe('paths with spaces and identical CSVs', () => {
  it('reads and writes folders whose names contain spaces; CSVs equal the pipeline output byte for byte', () => {
    const data = join(work, 'my data');
    const out = join(work, 'my output', 'nested');
    cpSync(DATA_DIR, data, { recursive: true });
    const run = cli(['--all', '--data', data, '--out', out]);
    expect(run.status).toBe(0);
    const dataset = buildDataset(loadSources(DATA_DIR));
    for (const job of dataset.jobs) {
      const expected = assessmentToCsv(assessJob(dataset, job.jobId));
      expect(readFileSync(join(out, outputFileName(job.jobId)), 'utf8')).toBe(expected);
    }
    expect(run.stdout).toContain(join(out, 'candidates_JOB001.csv'));
  }, 60_000);

  it('supports --flag=value and overwrites an existing file', () => {
    const out = join(work, 'eq');
    mkdirSync(out);
    writeFileSync(join(out, 'candidates_JOB002.csv'), 'old');
    const run = cli(['JOB002', `--out=${out}`]);
    expect(run.status).toBe(0);
    expect(readFileSync(join(out, 'candidates_JOB002.csv'), 'utf8')).toMatch(/^recommendation,/);
  }, 60_000);
});

describe('terminal control characters in imported text', () => {
  it('are removed from the terminal report only; the CSV keeps the imported text', () => {
    const dir = join(work, 'ctl');
    cpSync(FIXTURE_DIR, dir, { recursive: true });
    const file = join(dir, 'linkedin_profiles.csv');
    const original = readFileSync(file, 'utf8');
    const injected = original.replace('ShopCo', `${ESC}[31mShopCo${ESC}[0m${BEL}${ESC}]0;owned${BEL}`);
    expect(injected).not.toBe(original);
    writeFileSync(file, injected);

    const out = join(work, 'ctl-out');
    const run = cli(['JOB001', '--data', dir, '--out', out]);
    expect(run.status).toBe(0);
    expect(run.stdout).not.toContain(ESC);
    expect(run.stdout).not.toContain(BEL);
    expect(run.stdout).toContain('at ShopCo');
    expect(run.stdout).not.toContain('[31m');
    expect(readFileSync(join(out, 'candidates_JOB001.csv'), 'utf8')).toBe(assessmentToCsv(jobResult(dir, 'JOB001')));
  }, 60_000);
});

describe('cleanForTerminal', () => {
  it('removes escape sequences, controls and direction overrides; line breaks and tabs become spaces', () => {
    expect(cleanForTerminal(`${ESC}[31mred${ESC}[0m`)).toBe('red');
    expect(cleanForTerminal(`a${ESC}]0;window title${BEL}b`)).toBe('ab');
    expect(cleanForTerminal(`a${BEL}b${String.fromCharCode(0, 127, 0x9b)}c`)).toBe('abc');
    expect(cleanForTerminal(`one\r\ntwo\tthree`)).toBe('one two three');
    expect(cleanForTerminal(`x${String.fromCharCode(0x202e)}y`)).toBe('xy');
    expect(cleanForTerminal('Zoë Müller 日本語 · ok')).toBe('Zoë Müller 日本語 · ok');
  });

  it('keeps every report line free of controls even when assessment text carries them', () => {
    const result = jobResult(DATA_DIR, 'JOB001');
    const dirty = structuredClone(result);
    const first = dirty.candidates[0]!;
    first.candidate.fullName = `${ESC}[1mPriya${ESC}[0m\nAnand`;
    first.reviewNextStep = `call${BEL} them\tsoon${ESC}]8;;http://evil.test${BEL}`;
    dirty.job.title = `Role${ESC}[2J`;
    const text = formatReport(dirty, `/tmp/x${ESC}.csv`);
    expect(text).not.toMatch(/[\u0000-\u0009\u000b-\u001f\u007f]/);
    expect(text).toContain('Priya Anand');
    expect(text).toContain('Next step: call them soon');
    expect(text).toContain('Role');
  });
});

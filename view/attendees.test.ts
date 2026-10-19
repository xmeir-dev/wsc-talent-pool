import { describe, expect, it } from 'vitest';
import { buildDataset } from '../pipeline';
import { readXlsx, records } from '../tests/xlsx-read';
import { ATTENDEE_COLUMNS, attendeesTable, attendeesXlsx, attended, bestJobId, buildPool, countryCounts, filterAttendees, filterCounts, jobItems, sortAttendees } from './attendees';
import { placeOf } from './place';
import { fitChecks } from './format';
import { bundledSources } from './data';

const pool = buildPool(buildDataset(bundledSources));
/** The edition key of a conference that has one edition in the supplied data. */
const ed = (name: string) => pool.conferences.find((c) => c.name === name)!.key;
const keyOf = (name: string) => pool.attendees.find((p) => p.candidate.fullName === name)!.candidate.candidateKey;

describe('attendee list model', () => {
  it('lists every attendee once, A–Z, with the four conferences in date order', () => {
    expect(pool.attendees).toHaveLength(75);
    const names = pool.attendees.map((p) => p.candidate.fullName);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'en')));
    expect(pool.conferences.map((c) => c.name)).toEqual([
      'SportsTech Innovation Summit',
      'Broadcast & Streaming Technology Expo',
      'Data & AI Summit Europe',
      'DevOps World 2025',
    ]);
  });

  it('a job lists its shortlist then needs review, in pipeline order', () => {
    const job1 = jobItems(pool, 'JOB001', []);
    expect(job1).toHaveLength(12);
    expect(job1.map(({ a }) => a.recommendation)).toEqual([...Array(6).fill('shortlist'), ...Array(6).fill('needs_review')]);
    expect(job1[0]!.a.candidate.fullName).toBe('Priya Anand');
    expect(jobItems(pool, 'JOB003', []).map(({ a }) => a.recommendation)).toEqual(Array(5).fill('needs_review'));
    expect(jobItems(pool, 'JOB001', [ed('DevOps World 2025')])).toHaveLength(0);
    expect(jobItems(pool, 'JOB001', [ed('Data & AI Summit Europe')])).toHaveLength(4);
  });

  it('several conferences keep anyone at any of them; several jobs keep anyone relevant for any of them', () => {
    const two = filterAttendees(pool, [ed('SportsTech Innovation Summit'), ed('Data & AI Summit Europe')], []);
    const either = pool.attendees.filter(
      (p) => attended(p.candidate, [ed('SportsTech Innovation Summit')]) || attended(p.candidate, [ed('Data & AI Summit Europe')]),
    );
    expect(two).toEqual(either);
    expect(two.length).toBeGreaterThan(40);

    const union = new Set([...jobItems(pool, 'JOB001', []), ...jobItems(pool, 'JOB003', [])].map(({ a }) => a.candidate.candidateKey));
    const both = filterAttendees(pool, [], ['JOB001', 'JOB003']);
    expect(both.map((p) => p.candidate.candidateKey).sort()).toEqual([...union].sort());
    expect(filterAttendees(pool, [], [])).toHaveLength(75);
  });

  it('counts attendees per conference and shortlist + needs review per job', () => {
    const counts = filterCounts(pool);
    expect(counts.conferences.get(ed('SportsTech Innovation Summit'))).toBe(40);
    expect(counts.conferences.get(ed('Data & AI Summit Europe'))).toBe(12);
    expect(counts.jobs.get('JOB001')).toBe(12);
    expect(counts.jobs.get('JOB003')).toBe(5);
  });

  it('a profile opens on the best job: shortlist, then needs review, then points', () => {
    expect(bestJobId(pool, keyOf('Mason Young'))).toBe('JOB001');
    expect(bestJobId(pool, keyOf('Alex Turner'))).toBe('JOB003'); // needs review for JOB003 only
    // Several jobs chosen: the best among them.
    expect(bestJobId(pool, keyOf('Mason Young'), ['JOB002', 'JOB004'])).toMatch(/^JOB00[24]$/);
    expect(bestJobId(pool, keyOf('Alex Turner'), ['JOB001', 'JOB002'])).not.toBe('JOB003');
  });
});

describe('attendees export', () => {
  it('writes the filtered rows in list order, with the jobs each person is relevant for', () => {
    const rows = pool.attendees.filter((p) => attended(p.candidate, [ed('Data & AI Summit Europe')]));
    const table = attendeesTable(rows, ['Data & AI Summit Europe']);
    expect(table.baseName).toBe('attendees_data-ai-summit-europe');
    expect(table.rows).toHaveLength(12);
    expect(table.rows.map((r) => r.full_name)).toEqual(rows.map((p) => p.candidate.fullName));
    expect(table.rows.every((r) => r.conference_name === 'Data & AI Summit Europe')).toBe(true);
    expect(table.rows[0]).toEqual({
      full_name: 'Adaora Okafor',
      firstname: 'Adaora',
      lastname: 'Okafor',
      email: 'a.okafor@mediasports.ng',
      company: 'MediaSports Africa',
      title: 'Head of Technology',
      conference_name: 'Data & AI Summit Europe',
      conference_date: '2025-03-21',
      linkedin_url: 'linkedin.com/in/adaora-okafor-tech',
      relevant_for: 'JOB001 needs review',
    });
    // The download is that table as an Excel file: same header, same rows, every cell a text cell.
    const file = attendeesXlsx(rows, ['Data & AI Summit Europe']);
    expect(file.fileName).toBe('attendees_data-ai-summit-europe.xlsx');
    const sheet = readXlsx(file.data);
    expect(sheet.rows[0]).toEqual([...ATTENDEE_COLUMNS]);
    expect(records(sheet)).toEqual(table.rows.map((r) => Object.fromEntries(ATTENDEE_COLUMNS.map((c) => [c, r[c] || null]))));
    expect(sheet.cells.every((c) => c.type === 'inlineStr' && !c.formula)).toBe(true);
  });

  it('names every relevant job and leaves the cell empty when there is none', () => {
    const table = attendeesTable(pool.attendees);
    expect(table.baseName).toBe('attendees');
    expect(attendeesTable([], ['DevOps World 2025', 'Data & AI Summit Europe'], ['JOB001', 'JOB003']).baseName).toBe(
      'attendees_devops-world-2025_data-ai-summit-europe_job001_job003',
    );
    expect(table.rows).toHaveLength(75);
    const multi = table.rows.find((r) => r.relevant_for.includes(';'));
    expect(multi?.relevant_for).toMatch(/^JOB00\d (shortlist|needs review); JOB00\d (shortlist|needs review)/);
    expect(table.rows.find((r) => r.full_name === 'Alexei Volkov')!.relevant_for).toBe('');
  });

  it('reads where people are based, and filters by country', () => {
    const at = (location: string) => placeOf({ profile: { location } } as Parameters<typeof placeOf>[0]);
    expect(at('Tel Aviv IL')).toMatchObject({ code: 'IL', country: 'Israel', city: 'Tel Aviv' });
    expect(at('Chicago IL')).toMatchObject({ code: 'US' });
    expect(at('Austin TX')).toMatchObject({ code: 'US' });
    expect(at('London UK')).toMatchObject({ code: 'GB', country: 'United Kingdom' });
    expect(at('Dubai UAE')).toMatchObject({ code: 'AE' });
    expect(at('')).toBeNull();

    const counts = countryCounts(pool);
    expect(counts.map((c) => c.country)).toEqual([...counts.map((c) => c.country)].sort((a, b) => a.localeCompare(b, 'en')));
    const gb = counts.find((c) => c.code === 'GB')!;
    expect(filterAttendees(pool, [], [], ['GB'])).toHaveLength(gb.count);
    expect(filterAttendees(pool, [], [], ['GB']).every((p) => placeOf(p.candidate)?.code === 'GB')).toBe(true);
    expect(jobItems(pool, 'JOB001', [], ['GB']).every(({ a }) => placeOf(a.candidate)?.code === 'GB')).toBe(true);
    expect(attendeesTable(filterAttendees(pool, [], [], ['GB']), [], [], ['GB']).baseName).toBe('attendees_gb');
  });

  it('sorts the attendee list by a column header, ties in name order', () => {
    const all = pool.attendees;
    const asc = (columnId: string) => sortAttendees(all, { columnId, direction: 'asc' }, pool.jobs);
    expect(sortAttendees(all, null, pool.jobs)).toBe(all);
    expect(asc('candidate')).toEqual(all);
    expect(sortAttendees(all, { columnId: 'candidate', direction: 'desc' }, pool.jobs)[0]).toBe(all.at(-1));

    const byJob = asc('relevant');
    expect(byJob[0]!.relevantFor.find((r) => r.outcome === 'shortlist')?.job.jobId).toBe('JOB001');
    expect(byJob.at(-1)!.relevantFor).toEqual([]);

    const byConf = asc('conference').map((p) => p.candidate.attendances[0]!.conferenceDate);
    expect(byConf).toEqual([...byConf].sort());
  });
});

describe('job fit checks', () => {
  const pool = buildPool(buildDataset(bundledSources));
  it('all three pass exactly when the person is shortlisted, for every attendee and job', () => {
    const items = pool.attendees.flatMap((p) => p.relevantFor);
    expect(items.length).toBeGreaterThan(30);
    for (const { job, outcome, a } of items) {
      expect(fitChecks(a, job).every((c) => c.ok), `${a.candidate.fullName} for ${job.jobId}`).toBe(outcome === 'shortlist');
    }
  });

  it('says what each check found', () => {
    const alex = pool.attendees.find((p) => p.candidate.fullName === 'Alex Turner')!.relevantFor[0]!;
    expect(fitChecks(alex.a, alex.job).map((c) => [c.ok, c.tip])).toEqual([
      [false, 'Must-have skills: missing Sports Analytics'],
      [false, 'Required skills: 2 of 4 on the profile (needs 3), 2 likely'],
      [true, 'Experience: 8 years (needs 5)'],
    ]);
  });
});

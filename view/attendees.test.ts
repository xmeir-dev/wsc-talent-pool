import { describe, expect, it } from 'vitest';
import { buildDataset, parseCsv } from '../pipeline';
import { attendeesCsv, attended, bestJobId, buildPool, jobItems } from './attendees';
import { bundledSources } from './data';

const pool = buildPool(buildDataset(bundledSources));
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
    const job1 = jobItems(pool, 'JOB001', null);
    expect(job1).toHaveLength(12);
    expect(job1.map(({ a }) => a.recommendation)).toEqual([...Array(7).fill('shortlist'), ...Array(5).fill('needs_review')]);
    expect(job1[0]!.a.candidate.fullName).toBe('Priya Anand');
    expect(jobItems(pool, 'JOB003', null).map(({ a }) => a.recommendation)).toEqual(Array(5).fill('needs_review'));
    expect(jobItems(pool, 'JOB001', 'DevOps World 2025')).toHaveLength(0);
  });

  it('a profile opens on the best job: shortlist, then needs review, then points', () => {
    expect(bestJobId(pool, keyOf('Mason Young'))).toBe('JOB001');
    expect(bestJobId(pool, keyOf('Alex Turner'))).toBe('JOB003'); // needs review for JOB003 only
  });
});

describe('attendees export', () => {
  it('writes the filtered rows in list order, with the jobs each person is relevant for', () => {
    const rows = pool.attendees.filter((p) => attended(p.candidate, 'Data & AI Summit Europe'));
    const { fileName, text } = attendeesCsv(rows, 'Data & AI Summit Europe');
    expect(fileName).toBe('attendees_data-ai-summit-europe.csv');
    const csv = parseCsv(text);
    expect(csv.header).toEqual([
      'full_name',
      'firstname',
      'lastname',
      'email',
      'company',
      'title',
      'conference_name',
      'conference_date',
      'linkedin_url',
      'relevant_for',
    ]);
    expect(csv.records).toHaveLength(12);
    expect(csv.records.map((r) => r.full_name)).toEqual(rows.map((p) => p.candidate.fullName));
    expect(csv.records.every((r) => r.conference_name === 'Data & AI Summit Europe')).toBe(true);
    expect(csv.records[0]).toEqual({
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
  });

  it('names every relevant job and leaves the cell empty when there is none', () => {
    const csv = parseCsv(attendeesCsv(pool.attendees, null).text);
    expect(attendeesCsv(pool.attendees, null).fileName).toBe('attendees.csv');
    expect(csv.records).toHaveLength(75);
    const multi = csv.records.find((r) => r.relevant_for?.includes(';'));
    expect(multi?.relevant_for).toMatch(/^JOB00\d (shortlist|needs review); JOB00\d (shortlist|needs review)/);
    expect(csv.records.find((r) => r.full_name === 'Alexei Volkov')!.relevant_for).toBe('');
  });
});

/** The CSV contract, the real JOB001 result, and determinism. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assessmentToCsv, OUTPUT_COLUMNS, parseCsv, splitName, toCsv } from '../../pipeline';
import { assessJob, byName, fixtureDataset, realDataset, ROOT, shortlistNames } from '../helpers';

describe('CSV reader/writer', () => {
  it('round-trips commas, quotes and newlines', () => {
    const rows = [{ a: 'plain', b: 'has, comma', c: 'has "quotes"\nand a newline' }];
    const text = toCsv(['a', 'b', 'c'], rows);
    expect(parseCsv(text).records).toEqual(rows);
  });

  it('handles a BOM and CRLF line endings', () => {
    expect(parseCsv('﻿x,y\r\n1,2\r\n').records).toEqual([{ x: '1', y: '2' }]);
  });
});

describe('output contract', () => {
  const result = assessJob(fixtureDataset(), 'JOB001');
  const parsed = parseCsv(assessmentToCsv(result));

  it('has every defined column, one row per person', () => {
    expect(parsed.header).toEqual([...OUTPUT_COLUMNS]);
    expect(parsed.records).toHaveLength(result.candidates.length);
  });

  it('fills required fields and uses the agreed empty markers', () => {
    for (const r of parsed.records) {
      for (const col of ['candidate_key', 'job_id', 'job_title', 'assessment_version', 'recommendation', 'connection_status', 'profile_status', 'review_next_step']) {
        expect(r[col], col).not.toBe('');
      }
      expect(r.comeet_status).toBe('unknown');
      expect(r.job_interest).toBe('unknown');
      expect(r.shortlist_rank === '').toBe(r.recommendation !== 'shortlist');
    }
    const sam = parsed.records.find((r) => r.full_name === 'Sam Strong')!;
    expect(sam.skill_gaps).toBe('none identified');
    expect(sam.data_quality_flags).toBe('none');
    expect(sam.connection_count).toBe('0');
    const mia = parsed.records.find((r) => r.full_name === 'Mia Missing')!;
    expect(mia.connection_count).toBe('');
    expect(mia.required_skills_on_profile).toBe('');
  });
});

describe('HubSpot name columns', () => {
  it('splits full_name into firstname (first word) and lastname (the rest)', () => {
    expect(splitName('Priya Anand')).toEqual({ firstname: 'Priya', lastname: 'Anand' });
    expect(splitName('  Maria  de la Cruz ')).toEqual({ firstname: 'Maria', lastname: 'de la Cruz' });
    expect(splitName('Madonna')).toEqual({ firstname: 'Madonna', lastname: '' });
    expect(splitName('')).toEqual({ firstname: '', lastname: '' });
  });

  it('writes firstname and lastname next to full_name', () => {
    const parsed = parseCsv(assessmentToCsv(assessJob(realDataset(), 'JOB001')));
    const i = parsed.header.indexOf('full_name');
    expect(parsed.header.slice(i, i + 3)).toEqual(['full_name', 'firstname', 'lastname']);
    const mason = parsed.records.find((r) => r.full_name === 'Mason Young')!;
    expect([mason.firstname, mason.lastname]).toEqual(['Mason', 'Young']);
  });
});

describe('recruiter wording', () => {
  const result = assessJob(realDataset(), 'JOB001');

  it('reads once, without repeated words', () => {
    for (const c of result.candidates) expect(c.reviewNextStep).not.toMatch(/\b(\w+) \1\b/);
  });

  it('gives one combined years instruction, never two', () => {
    const fixture = assessJob(fixtureDataset(), 'JOB001');
    for (const c of [...result.candidates, ...fixture.candidates]) {
      const step = c.reviewNextStep;
      expect(step.includes('confirm years in the specialty') && step.includes('non-intern')).toBe(false);
    }
  });

  it('flags intern years on the shortlist reason itself', () => {
    for (const name of ['Nathan Brooks', 'James Thornton']) {
      const c = byName(result, name);
      expect(c.recommendation).toBe('shortlist');
      expect(c.outcomeReasons[0]).toMatch(/years reported; experience needs confirmation$/);
      expect(c.reviewNextStep).toContain('confirm non-intern years');
    }
    expect(byName(result, 'Chiara Russo').outcomeReasons[0]).toBe('Must-haves met · 4/5 listed skills · 7 years reported');
  });
});

describe('real JOB001 result', () => {
  const result = assessJob(realDataset(), 'JOB001');

  it('accounts for all 75 attendees', () => {
    expect(result.candidates).toHaveLength(75);
  });

  it('produces 6 shortlist, 6 needs_review, 63 not_recommended_for_role', () => {
    expect(result.counts).toEqual({ shortlist: 6, needs_review: 6, not_recommended_for_role: 63 });
  });

  it('shortlists the computer-vision engineers, best first', () => {
    expect(shortlistNames(result)).toEqual(['Priya Anand', 'Chiara Russo', 'Lucas Evans', 'Marcus Reid', 'Nathan Brooks', 'James Thornton']);
    expect(byName(result, 'Priya Anand').shortlistRank).toBe(1);
  });

  it('matches the committed output file exactly', () => {
    const committed = readFileSync(join(ROOT, 'output', 'candidates_JOB001.csv'), 'utf8');
    expect(assessmentToCsv(result)).toBe(committed);
  });

  it('is identical across runs', () => {
    expect(assessmentToCsv(assessJob(realDataset(), 'JOB001'))).toBe(assessmentToCsv(result));
  });

  it('runs for every supplied job and matches each committed file', () => {
    const dataset = realDataset();
    for (const job of dataset.jobs) {
      const r = assessJob(dataset, job.jobId);
      expect(r.candidates).toHaveLength(75);
      expect(new Set(r.candidates.map((c) => c.jobId))).toEqual(new Set([job.jobId]));
      // The committed output must be what the current rules produce.
      expect(assessmentToCsv(r)).toBe(readFileSync(join(ROOT, 'output', `candidates_${job.jobId}.csv`), 'utf8'));
    }
  });
});

/** The integration demo's contact history, logged the HubSpot way, and the connection wording shared with the app. */
import { describe, expect, it } from 'vitest';
import { buildAssessmentStore } from '../integration-demo/assessments';
import { buildHandoff, createSimulatedComeet } from '../integration-demo/comeet';
import { lastContacted, outreachStatus, timeline } from '../integration-demo/hubspotActivity';
import { loadedEntries, SEEDED, type Entry } from '../view/activity';
import { connectionPeople, connectionNote, overlapTag } from '../view/format';
import { byName, realDataset } from './helpers';

const BACKEND = { jobId: 'JOB002', title: 'Backend Engineer' };
const DATA = { jobId: 'JOB004', title: 'Data Engineer' };
const base = { candidateKey: 'C-X', by: 'You', simulated: true } as const;
const invite = (id: string, state: 'prepared' | 'sent' | 'confirmed' | 'failed', at: string, channel: 'comeet' | 'copy' | 'email' = 'email'): Entry => ({
  ...base,
  id,
  at,
  kind: 'invite',
  jobId: BACKEND.jobId,
  jobTitle: BACKEND.title,
  channel,
  state,
});
const reference = (id: string, state: 'prepared' | 'sent' | 'confirmed', at: string): Entry => ({
  ...base,
  id,
  at,
  kind: 'reference',
  employeeId: 'WSC003',
  employeeName: 'Noa Shapiro',
  channel: 'slack',
  state,
});

describe('Last contacted follows only communication the candidate received', () => {
  it('drafts, copies and failed sends do not set it', () => {
    const log = [invite('1', 'prepared', '2026-10-10T09:00:00Z', 'copy'), invite('2', 'failed', '2026-10-11T09:00:00Z')];
    expect(lastContacted(log, 'C-X')).toBeNull();
  });

  it('reference requests go to the colleague, not the candidate, so they never set it', () => {
    const log = [reference('1', 'prepared', '2026-10-10T09:00:00Z'), reference('2', 'sent', '2026-10-11T09:00:00Z'), reference('3', 'confirmed', '2026-10-12T09:00:00Z')];
    expect(lastContacted(log, 'C-X')).toBeNull();
  });

  it('a sent or confirmed invite sets it, latest wins', () => {
    const log = [invite('1', 'sent', '2026-10-05T09:00:00Z'), invite('2', 'prepared', '2026-10-15T09:00:00Z'), invite('3', 'confirmed', '2026-10-09T09:00:00Z')];
    expect(lastContacted(log, 'C-X')).toBe('2026-10-09');
  });

  it('seeded: Noah was emailed on 5 Oct; Alex only had a reference prepared', () => {
    expect(lastContacted(SEEDED, 'C-HS029')).toBe('2026-10-05');
    expect(lastContacted(SEEDED, 'C-HS021')).toBeNull();
  });

  it('creating a Comeet record does not log contact', async () => {
    const store = buildAssessmentStore(realDataset());
    const comeet = createSimulatedComeet({ isAvailable: () => true, delayMs: 0 });
    const a = byName(store.result('JOB001'), 'Priya Anand');
    const r = await comeet.handoff(buildHandoff(a, store.result('JOB001').job, store.version, comeet.positionFor('JOB001')!));
    expect(r.kind).toBe('created');
    expect(lastContacted(loadedEntries(), a.candidate.candidateKey)).toBeNull();
  });
});

describe('timeline entries are logged as HubSpot would', () => {
  it('a sent invite is a logged email, a draft or reference request is not', () => {
    const log = [invite('1', 'prepared', '2026-10-10T09:00:00Z', 'copy'), invite('2', 'sent', '2026-10-11T09:00:00Z'), reference('3', 'prepared', '2026-10-12T09:00:00Z')];
    expect(timeline(log, 'C-X').map((x) => [x.type, x.title])).toEqual([
      ['Task', 'Asked Noa Shapiro for a reference · Prepared'],
      ['Logged email', 'Invited to Backend Engineer'],
      ['Note', 'Invited to Backend Engineer · Prepared'],
    ]);
  });

  it('seeded decline shows as a note on Noah, newest first', () => {
    expect(timeline(SEEDED, 'C-HS029').map((x) => [x.type, x.title, x.date])).toEqual([
      ['Note', 'Declined Backend Engineer', '2026-10-08'],
      ['Logged email', 'Invited to Backend Engineer', '2026-10-05'],
    ]);
  });
});

describe('the shortlist status column is per person and role', () => {
  it('Noah declined Backend Engineer; Data Engineer stays untouched', () => {
    expect(outreachStatus(SEEDED, 'C-HS029', BACKEND)).toBe('Declined · 8 Oct');
    expect(outreachStatus(SEEDED, 'C-HS029', DATA)).toBe('--');
  });
});

describe('connections and possible overlaps read honestly', () => {
  it('names the overlap without claiming they worked together', () => {
    expect(overlapTag({ overlapStart: 2019, overlapEnd: 2021 })).toBe('Same company, 2y overlap');
    expect(overlapTag({ overlapStart: 2020, overlapEnd: 2020 })).toBe('Same company, <1y overlap');
  });

  it('one list tells a listed connection from a same-company overlap', () => {
    const store = buildAssessmentStore(realDataset());
    const a = byName(store.result('JOB001'), 'Priya Anand');
    const people = connectionPeople(a, store.dataset.employees);
    const notes = people.map((p) => connectionNote(p));
    expect(notes.some((n) => n.includes('Same company, '))).toBe(true);
    for (const p of people) {
      const note = connectionNote(p);
      expect(note.includes('Connection')).toBe(p.listed);
      expect(note.includes('Same company')).toBe(p.refs.length > 0);
      expect(note).not.toMatch(/worked/i);
    }
  });
});

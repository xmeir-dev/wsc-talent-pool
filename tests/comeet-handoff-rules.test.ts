/** CTO review: shared Comeet history and blocking rules, confirmed-only tags, conflicting identities. */
import { describe, expect, it } from 'vitest';
import { buildAssessmentStore } from '../integration-demo/assessments';
import { buildHandoff, createSimulatedComeet, type ComeetService } from '../integration-demo/comeet';
import { checkInvite, comeetFor, SEEDED } from '../view/activity';
import { byName, realDataset } from './helpers';

const store = buildAssessmentStore(realDataset());
const people = store.dataset.candidates;
const fresh = () => createSimulatedComeet({ isAvailable: () => true, delayMs: 0, people });

function payloadFor(comeet: ComeetService, name: string, jobId: string, override: Record<string, string> = {}) {
  const a = byName(store.result(jobId), name);
  const p = buildHandoff(a, store.result(jobId).job, store.version, comeet.positionFor(jobId)!, SEEDED);
  return { ...p, ...override };
}
const keyOf = (name: string) => byName(store.result('JOB001'), name).candidate.candidateKey;

describe('handoff tags', () => {
  it('tags only skills named on the profile; a related skill stays qualified in evidence and gaps', () => {
    const p = payloadFor(fresh(), 'Priya Anand', 'JOB001');
    expect(p.tags).toEqual(['Python', 'Computer Vision', 'Object Detection', 'AWS']);
    expect(p.customFields.evidence).toContain('PyTorch (related skill: Deep Learning)');
    expect(p.customFields.gaps).toContain('PyTorch: only a related skill (Deep Learning)');
  });
});

describe('conflicting identity', () => {
  it('does not reuse a record whose email matches but whose LinkedIn differs, and creates nothing', async () => {
    const comeet = fresh();
    const priya = payloadFor(comeet, 'Priya Anand', 'JOB001');
    expect((await comeet.handoff(priya)).kind).toBe('created');
    const other = { ...priya, linkedinUrl: 'linkedin.com/in/someone-else', sourceContactId: 'C-HS999', firstName: 'Someone' };

    const lookup = await comeet.find(other, other.positionUid);
    expect(lookup.kind).toBe('conflict');
    if (lookup.kind === 'conflict')
      expect(lookup.message).toBe('Needs review: this email belongs to an existing Comeet candidate with a different LinkedIn profile.');
    expect(comeet.statusFor(other, other.positionUid)).toBeNull();
    expect((await comeet.handoff(other)).kind).toBe('conflict');
    expect(comeet.list(other.positionUid)).toHaveLength(1);
  });

  it('treats a different source contact as a conflict when both are present', async () => {
    const comeet = fresh();
    const priya = payloadFor(comeet, 'Priya Anand', 'JOB001');
    await comeet.handoff(priya);
    expect((await comeet.handoff({ ...priya, sourceContactId: 'C-HS999' })).kind).toBe('conflict');
  });

  it('still reuses the record for the same person', async () => {
    const comeet = fresh();
    const priya = payloadFor(comeet, 'Priya Anand', 'JOB001');
    await comeet.handoff(priya);
    expect((await comeet.handoff(priya)).kind).toBe('existing');
  });
});

describe('shared Comeet history (data/demo_comeet.json)', () => {
  it('seeds Ryan in process for Data Engineer, and no one outside the shared file', () => {
    const comeet = fresh();
    const ryan = payloadFor(comeet, 'Ryan Patel', 'JOB004');
    expect(comeet.statusFor(ryan, ryan.positionUid)).toMatchObject({ status: 'In progress', stage: 'Phone screen' });
    const lucas = payloadFor(comeet, 'Lucas Evans', 'JOB001');
    expect(comeet.statusFor(lucas, lucas.positionUid)).toBeNull();
  });

  it('blocks a handoff of someone in an active process, for any role', async () => {
    const comeet = fresh();
    const key = keyOf('Ryan Patel');
    for (const jobId of ['JOB001', 'JOB004']) expect(comeet.check(key, jobId).block).toMatch(/^Already in process for Data Engineer in Comeet/);
    const r = await comeet.handoff(payloadFor(comeet, 'Ryan Patel', 'JOB001'));
    expect(r.kind).toBe('blocked');
    expect(comeet.list('POS-ML-001')).toHaveLength(0);
  });

  it('does not block an uncontacted lead', async () => {
    const comeet = fresh();
    expect(comeet.check(keyOf('Scarlett Green'), 'JOB001')).toEqual({});
    expect((await comeet.handoff(payloadFor(comeet, 'Scarlett Green', 'JOB001'))).kind).toBe('created');
  });

  it('warns, without blocking, about a rejection for another role', () => {
    const comeet = fresh();
    expect(comeet.check(keyOf('Alex Turner'), 'JOB004')).toEqual({
      warn: 'Rejected after phone screen for Senior Product Manager - Sports Data in Comeet · Mar 2025.',
    });
    const james = comeet.check(keyOf('James Thornton'), 'JOB001');
    expect(james.block).toBeUndefined();
    expect(james.warn).toBe('Rejected after technical interview for Computer Vision Engineer in Comeet · Jan 2024.');
  });

  it('does not warn about a withdrawal, or about a rejection for the same role', () => {
    expect(fresh().check(keyOf('Alex Turner'), 'JOB003')).toEqual({});
  });

  it('matches the recruiter view\'s invite rule where no outreach is recorded for the role: same result, same words', () => {
    const comeet = fresh();
    const jobs = comeet.positions().map((p) => ({ jobId: p.jobId, title: p.name }));
    for (const name of ['Alex Turner', 'James Thornton', 'Ryan Patel', 'Scarlett Green', 'Priya Anand'])
      for (const job of jobs) {
        const key = keyOf(name);
        expect(comeet.check(key, job.jobId)).toEqual(checkInvite(SEEDED, comeetFor(key), key, job, jobs));
      }
  });
});

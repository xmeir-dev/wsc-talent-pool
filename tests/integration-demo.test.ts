/** The integration demo's data layer: assessments keyed by person and role, and the simulated Comeet handoff. */
import { describe, expect, it } from 'vitest';
import { buildAssessmentStore } from '../integration-demo/assessments';
import { buildHandoff, createSimulatedComeet, type ComeetService } from '../integration-demo/comeet';
import { assessJob, byName, realDataset } from './helpers';

const store = buildAssessmentStore(realDataset());

function handoffFor(comeet: ComeetService, name: string, jobId: string) {
  const a = byName(store.result(jobId), name);
  return buildHandoff(a, store.result(jobId).job, store.version, comeet.positionFor(jobId)!);
}

describe('assessment store', () => {
  it('matches the pipeline result for every role', () => {
    for (const job of store.dataset.jobs) {
      const direct = assessJob(store.dataset, job.jobId);
      for (const a of direct.candidates) {
        const stored = store.get(a.candidate.candidateKey, job.jobId)!;
        expect(stored.a.recommendation).toBe(a.recommendation);
        expect(stored.a.shortlistRank).toBe(a.shortlistRank);
      }
    }
  });

  it('keeps a separate assessment per role for the same person', () => {
    const key = byName(store.result('JOB001'), 'Priya Anand').candidate.candidateKey;
    expect(store.get(key, 'JOB001')!.a.recommendation).toBe('shortlist');
    expect(store.get(key, 'JOB002')!.a.recommendation).toBe('not_recommended_for_role');
    expect(store.get(key, 'JOB001')!.a.recommendation).toBe('shortlist');
  });
});

describe('simulated Comeet handoff', () => {
  it('creates a Sourced candidate with the assessment in custom fields', async () => {
    const comeet = createSimulatedComeet({ isAvailable: () => true, delayMs: 0 });
    const r = await comeet.handoff(handoffFor(comeet, 'Priya Anand', 'JOB001'));
    expect(r.kind).toBe('created');
    if (r.kind !== 'created') return;
    expect(r.candidate.status).toBe('Sourced');
    expect(r.candidate.positionName).toBe('Senior ML Engineer');
    expect(r.candidate.customFields?.roleFit).toBe('Shortlist · #1');
    expect(r.candidate.customFields?.assessment).toBe(`JOB001 Senior ML Engineer · ${store.version}`);
    expect(r.candidate.customFields?.possibleReferences).toContain('not endorsements');
  });

  it('returns the existing record on a repeat handoff instead of a duplicate', async () => {
    const comeet = createSimulatedComeet({ isAvailable: () => true, delayMs: 0 });
    const payload = handoffFor(comeet, 'Priya Anand', 'JOB001');
    const first = await comeet.handoff(payload);
    const second = await comeet.handoff(payload);
    expect(second.kind).toBe('existing');
    if (first.kind === 'created' && second.kind === 'existing') expect(second.candidate.uid).toBe(first.candidate.uid);
  });

  it('finds a person already in an active process', async () => {
    const comeet = createSimulatedComeet({ isAvailable: () => true, delayMs: 0 });
    const payload = handoffFor(comeet, 'Lucas Evans', 'JOB001');
    const found = await comeet.find(payload.email, payload.positionUid);
    expect(found.kind === 'found' && found.candidate?.stage).toBe('Phone screen');
    expect((await comeet.handoff(payload)).kind).toBe('existing');
  });

  it('creates nothing while unavailable, and succeeds once it is back', async () => {
    let up = false;
    const comeet = createSimulatedComeet({ isAvailable: () => up, delayMs: 0 });
    const payload = handoffFor(comeet, 'Chiara Russo', 'JOB001');
    expect((await comeet.handoff(payload)).kind).toBe('unavailable');
    up = true;
    expect(await comeet.find(payload.email, payload.positionUid)).toEqual({ kind: 'found', candidate: null });
    expect((await comeet.handoff(payload)).kind).toBe('created');
  });
});

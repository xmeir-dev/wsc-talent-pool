/** QA #004: people without an email must never share one simulated Comeet record. */
import { describe, expect, it } from 'vitest';
import { buildAssessmentStore } from '../integration-demo/assessments';
import { buildHandoff, createSimulatedComeet, type ComeetService } from '../integration-demo/comeet';
import type { CandidateAssessment } from '../pipeline';
import { SEEDED } from '../view/activity';
import { realDataset } from './helpers';

const store = buildAssessmentStore(realDataset());
const JOB = 'JOB004';
const [first, second] = store.result(JOB).candidates;

function payloadFor(comeet: ComeetService, a: CandidateAssessment, override: { email?: string; linkedinUrl?: string }) {
  const candidate = { ...a.candidate, ...override };
  return buildHandoff({ ...a, candidate }, store.result(JOB).job, store.version, comeet.positionFor(JOB)!, SEEDED);
}

function fresh() {
  return createSimulatedComeet({ isAvailable: () => true, delayMs: 0 });
}

describe('simulated Comeet identity without email', () => {
  it('keeps two blank-email people with different LinkedIn URLs as separate records', async () => {
    const comeet = fresh();
    const alpha = payloadFor(comeet, first!, { email: '' });
    const beta = payloadFor(comeet, second!, { email: '' });
    expect(alpha.linkedinUrl).not.toBe(beta.linkedinUrl);

    const a = await comeet.handoff(alpha);
    expect(a.kind).toBe('created');

    const lookup = await comeet.find(beta, beta.positionUid);
    expect(lookup).toEqual({ kind: 'found', candidate: null });
    expect(comeet.statusFor(beta, beta.positionUid)).toBeNull();
    expect(comeet.statusFor('', beta.positionUid)).toBeNull();

    const b = await comeet.handoff(beta);
    expect(b.kind).toBe('created');
    if (a.kind !== 'created' || b.kind !== 'created') return;
    expect(b.candidate.uid).not.toBe(a.candidate.uid);
    expect(b.candidate.firstName).toBe(beta.firstName);
    expect(comeet.list(beta.positionUid).filter((c) => c.email === '')).toHaveLength(2);
  });

  it('reuses the record when the same blank-email person is handed off again', async () => {
    const comeet = fresh();
    const alpha = payloadFor(comeet, first!, { email: '' });
    const one = await comeet.handoff(alpha);
    const again = await comeet.handoff(alpha);
    expect(again.kind).toBe('existing');
    if (one.kind === 'created' && again.kind === 'existing') expect(again.candidate.uid).toBe(one.candidate.uid);
    expect(comeet.statusFor(alpha, alpha.positionUid)?.firstName).toBe(alpha.firstName);
  });

  it('keeps people with neither email nor LinkedIn distinct, and still reuses each one on repeat', async () => {
    const comeet = fresh();
    const alpha = payloadFor(comeet, first!, { email: '', linkedinUrl: '' });
    const beta = payloadFor(comeet, second!, { email: '', linkedinUrl: '' });
    const a = await comeet.handoff(alpha);
    const b = await comeet.handoff(beta);
    expect([a.kind, b.kind]).toEqual(['created', 'created']);
    if (a.kind !== 'created' || b.kind !== 'created') return;
    expect(b.candidate.uid).not.toBe(a.candidate.uid);
    const repeat = await comeet.handoff(beta);
    expect(repeat.kind === 'existing' && repeat.candidate.uid).toBe(b.candidate.uid);
  });
});

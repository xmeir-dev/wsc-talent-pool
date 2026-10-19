/** The integration demo's data layer: assessments keyed by person and role, and the simulated Comeet handoff. */
import { describe, expect, it } from 'vitest';
import { buildAssessmentStore } from '../integration-demo/assessments';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadSources } from '../cli/load-sources';
import { buildHandoff, createSimulatedComeet, type ComeetService } from '../integration-demo/comeet';
import { addRole, applyImport, previewImport, roleProblems } from '../integration-demo/sources';
import { buildDataset } from '../pipeline';
import { SEEDED } from '../view/activity';
import { assessJob, byName, DATA_DIR, realDataset, ROOT } from './helpers';

const store = buildAssessmentStore(realDataset());

function handoffFor(comeet: ComeetService, name: string, jobId: string) {
  const a = byName(store.result(jobId), name);
  return buildHandoff(a, store.result(jobId).job, store.version, comeet.positionFor(jobId)!, SEEDED);
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
    const comeet = createSimulatedComeet({ isAvailable: () => true, delayMs: 0, people: store.dataset.candidates });
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
    const comeet = createSimulatedComeet({ isAvailable: () => true, delayMs: 0, people: store.dataset.candidates });
    const payload = handoffFor(comeet, 'Priya Anand', 'JOB001');
    const first = await comeet.handoff(payload);
    const second = await comeet.handoff(payload);
    expect(second.kind).toBe('existing');
    if (first.kind === 'created' && second.kind === 'existing') expect(second.candidate.uid).toBe(first.candidate.uid);
  });

  it('finds a person already in an active process', async () => {
    const comeet = createSimulatedComeet({ isAvailable: () => true, delayMs: 0, people: store.dataset.candidates });
    const payload = handoffFor(comeet, 'Ryan Patel', 'JOB004');
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

describe('spreadsheet import and new roles', () => {
  const sources = loadSources(DATA_DIR);
  const sample = readFileSync(join(ROOT, 'integration-demo', 'public', 'sample-conference-import.csv'), 'utf8');

  it('previews the sample: four new contacts, one repeat attendee merged', () => {
    const p = previewImport(sample, sources);
    expect(p.ok && { created: p.created, merged: p.merged, conferences: p.conferences }).toEqual({
      created: 4,
      merged: 1,
      conferences: ['Sports Video AI Meetup'],
    });
  });

  it('applies through the same pipeline: new people are scored and the repeat gets a second event', () => {
    const p = previewImport(sample, sources);
    if (!p.ok) throw new Error(p.problems.join('; '));
    const dataset = buildDataset(applyImport(p.rows, sources));
    expect(dataset.candidates).toHaveLength(79);
    const result = assessJob(dataset, 'JOB001');
    expect(byName(result, 'Noa Barak').shortlistRank).toBe(1);
    expect(byName(result, 'James Thornton').candidate.attendances).toHaveLength(2);
    expect(byName(result, 'Yossi Levin').recommendation).toBe('needs_review');
  });

  it('rejects a file with missing columns and changes nothing', () => {
    const p = previewImport('name,phone\nA,1\n', sources);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.problems).toContain('Missing column "full_name".');
  });

  it('adds a role with the next job ID and scores the pool for it', () => {
    const role = {
      title: 'Computer Vision Engineer',
      department: 'AI/ML',
      seniority: 'Mid',
      keyDomains: 'Computer Vision',
      requiredSkills: 'Python, Computer Vision',
      niceToHave: '',
    };
    const { sources: next, jobId } = addRole(role, sources);
    expect(jobId).toBe('JOB005');
    const result = assessJob(buildDataset(next), jobId);
    expect(result.job.requiredSkills).toEqual(['Python', 'Computer Vision']);
    expect(result.counts.shortlist).toBeGreaterThan(0);
    expect(roleProblems({ ...role, title: ' ', requiredSkills: '' })).toEqual([
      'Add a position title.',
      'Add at least one required skill.',
    ]);
  });
});

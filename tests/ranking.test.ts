/** Connections, ties and seniority evidence. */
import { describe, expect, it } from 'vitest';
import { assessJob, byName, fixtureDataset, realDataset, shortlistNames } from './helpers';

const fixture = assessJob(fixtureDataset(), 'JOB001');

describe('connections never decide the outcome or cross a points gap', () => {
  it('ranks an unconnected stronger candidate above a connected weaker one', () => {
    const sam = byName(fixture, 'Sam Strong'); // 10 points, no connection
    const connie = byName(fixture, 'Connie Linked'); // 7 points, 3 connections
    expect(sam.points.total).toBeGreaterThan(connie.points.total);
    expect(sam.shortlistRank!).toBeLessThan(connie.shortlistRank!);
  });

  it('gives the same outcomes when every connection is removed', () => {
    const dataset = fixtureDataset();
    const before = assessJob(dataset, 'JOB001');
    for (const c of dataset.candidates) if (c.profile) c.profile.connectionIds = [];
    const after = assessJob(dataset, 'JOB001');
    const outcomes = (r: typeof before) =>
      Object.fromEntries(r.candidates.map((c) => [c.candidate.candidateKey, [c.recommendation, c.points.total]]));
    expect(outcomes(after)).toEqual(outcomes(before));
  });
});

describe('close ties (identical points)', () => {
  it('ranks a connected person above an unconnected one with the same points, and says why', () => {
    const tia = byName(fixture, 'Tia Tied');
    const ula = byName(fixture, 'Ula Unlinked');
    expect(tia.points.total).toBe(ula.points.total);
    expect(tia.shortlistRank!).toBeLessThan(ula.shortlistRank!);
    expect(tia.tieNote).toContain('ranked above');
    expect(tia.tieNote).toContain('Ula Unlinked');
    expect(ula.tieNote).toContain('only because of a WSC connection');
  });

  it('ignores connection count: 1 connection and 3 connections tie', () => {
    const abe = byName(fixture, 'Abe Also'); // 1 connection
    const tia = byName(fixture, 'Tia Tied'); // 3 connections
    expect(abe.connections.count).toBe(1);
    expect(tia.connections.count).toBe(3);
    expect(abe.shortlistRank).toBe(tia.shortlistRank);
  });

  it('labels connected people with equal points as tied instead of inventing an order', () => {
    const abe = byName(fixture, 'Abe Also');
    expect(abe.tieNote).toContain('tied with Tia Tied');
    expect(abe.tieNote).toContain('not a preference');
  });

  it('labels unconnected people with equal points as tied too', () => {
    const sam = byName(fixture, 'Sam Strong');
    expect(sam.tieNote).toContain('tied with Vic Video');
    expect(sam.tieNote).toContain('none has a WSC connection');
  });

  it('labels the real JOB001 ties', () => {
    const result = assessJob(realDataset(), 'JOB001');
    expect(byName(result, 'Chiara Russo').shortlistRank).toBe(byName(result, 'Lucas Evans').shortlistRank);
    expect(byName(result, 'Chiara Russo').tieNote).toContain('tied with Lucas Evans');
    expect(byName(result, 'Priya Anand').tieNote).toBe('');
  });
});

describe('ordering', () => {
  it('puts shortlist first, then needs_review, then not_recommended_for_role', () => {
    const order = { shortlist: 0, needs_review: 1, not_recommended_for_role: 2 };
    const seq = fixture.candidates.map((c) => order[c.recommendation]);
    expect(seq).toEqual([...seq].sort((a, b) => a - b));
  });

  it('is deterministic across runs', () => {
    expect(shortlistNames(assessJob(fixtureDataset(), 'JOB001'))).toEqual(shortlistNames(fixture));
  });
});

describe('seniority evidence', () => {
  it('gives no points for titles', () => {
    expect(byName(fixture, 'Hal Head').points.total).toBe(byName(fixture, 'Tia Tied').points.total);
  });

  it('flags senior titles "confirm hands-on"', () => {
    const hal = byName(fixture, 'Hal Head');
    expect(hal.seniority.seniorTitleFlag).toContain('confirm hands-on');
    expect(hal.reviewNextStep).toContain('hands-on');
  });

  it('does not flag every "Product Manager"', () => {
    expect(byName(fixture, 'Pam Product').seniority.seniorTitleFlag).toBeNull();
    expect(byName(fixture, 'Sally SportsPM').seniority.seniorTitleFlag).toBeNull();
    const real = assessJob(realDataset(), 'JOB003');
    for (const name of ['Daniel Brown', 'Emma Lewis', 'Elijah Allen', 'Alex Turner', 'Claudia Vogel']) {
      expect(byName(real, name).seniority.seniorTitleFlag).toBeNull();
    }
  });

  it('surfaces internships that inflate total years', () => {
    const ivan = byName(fixture, 'Ivan Intern');
    expect(ivan.seniority.earlyCareerRoles.map((r) => r.title)).toEqual(['ML Intern']);
    expect(ivan.seniority.summary).toContain('relevant years may be lower');
    expect(ivan.reviewNextStep).toContain('non-intern');
  });
});

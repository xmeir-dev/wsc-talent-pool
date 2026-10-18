/** Conference relevance is reported separately and never affects job matching. */
import { describe, expect, it } from 'vitest';
import { assessJob, byName, fixtureDataset, realDataset } from './helpers';

const result = assessJob(fixtureDataset(), 'JOB001');

describe('conference relevance', () => {
  it('marks a DevOps engineer at a DevOps conference as relevant', () => {
    expect(byName(result, 'Devi Ops').events[0]!.relevance).toBe('relevant');
  });

  it('marks an IT manager at the same conference as not relevant', () => {
    expect(byName(result, 'Ian ITManager').events[0]!.relevance).toBe('not_relevant');
  });

  it('is unknown without a profile', () => {
    expect(byName(result, 'Mia Missing').events[0]!.relevance).toBe('unknown');
  });

  it('never excludes anyone from job matching', () => {
    const sam = byName(result, 'Sam Strong'); // CV engineer who attended DevOps World
    expect(sam.events[0]!.relevance).toBe('not_relevant');
    expect(sam.recommendation).toBe('shortlist');
  });

  it('assesses each event of a repeat attendee', () => {
    const tia = byName(result, 'Tia Tied');
    expect(tia.events.map((e) => e.relevance)).toEqual(['relevant', 'relevant']);
  });

  it('assesses every real attendee', () => {
    const real = assessJob(realDataset(), 'JOB001');
    const relevance = real.candidates.flatMap((c) => c.events.map((e) => e.relevance));
    expect(relevance).toHaveLength(75);
    expect(relevance).not.toContain('unknown');
  });
});

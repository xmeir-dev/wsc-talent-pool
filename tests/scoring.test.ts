/** Points, equivalences, essentials and thresholds (approved rules). */
import { describe, expect, it } from 'vitest';
import { matchSkill, minYearsFor, requiredThreshold } from '../pipeline';
import { assessJob, byName, fixtureDataset, realDataset } from './helpers';

const fixture = assessJob(fixtureDataset(), 'JOB001');

describe('skill evidence', () => {
  it('scores a named required skill 2, an accepted equivalent 1, and nothing 0', () => {
    const theo = byName(fixture, 'Theo Tensor');
    const pytorch = theo.skills.find((s) => s.skill === 'PyTorch')!;
    expect(pytorch).toMatchObject({ match: 'equivalent', points: 1, evidence: 'TensorFlow' });
    expect(theo.skills.find((s) => s.skill === 'Python')).toMatchObject({ match: 'named', points: 2 });
    expect(theo.skills.find((s) => s.skill === 'Object Detection')).toMatchObject({ match: 'none', points: 0 });
  });

  it('treats TensorFlow as a PARTIAL match for PyTorch and shows it as a gap', () => {
    const theo = byName(fixture, 'Theo Tensor');
    expect(theo.skillGaps).toContain('PyTorch (only "TensorFlow", partial)');
  });

  it('infers Object Detection from tracking/pose/sports CV for 1 point, labelled "inferred, verify"', () => {
    expect(matchSkill(['Sports Tracking'], 'Object Detection')).toEqual({ match: 'inferred', evidence: 'Sports Tracking' });
    expect(matchSkill(['Sports CV'], 'Object Detection').match).toBe('inferred');
    const pia = byName(fixture, 'Pia Pose');
    const od = pia.skills.find((s) => s.skill === 'Object Detection')!;
    expect(od).toMatchObject({ match: 'inferred', points: 1, evidence: 'Pose Estimation' });
    expect(pia.fitEvidence.join(' ')).toContain('Object Detection (inferred from "Pose Estimation", verify)');
    expect(pia.skillGaps.join(' ')).toContain('inferred from "Pose Estimation", verify');
  });

  it('prefers a named match over an equivalent one', () => {
    expect(matchSkill(['TensorFlow', 'PyTorch'], 'PyTorch')).toEqual({ match: 'named', evidence: 'PyTorch' });
  });

  it('gives +1 per nice-to-have skill', () => {
    const nora = byName(fixture, 'Nora NoVision');
    expect(nora.points.niceToHave).toBe(3); // Sports Analytics, Real-time processing, Docker
  });

  it('matches an unknown job skill by its own name only', () => {
    expect(matchSkill(['TypeScript'], 'TypeScript').match).toBe('named');
    expect(matchSkill(['JavaScript'], 'TypeScript').match).toBe('none');
  });
});

describe('industry bonus (JOB001 only)', () => {
  it('gives +1 for sports/league/media/broadcast/streaming/OTT industry', () => {
    expect(byName(fixture, 'Theo Tensor').points.industryBonus).toBe(1);
  });

  it('does not give it to "Video Technology"', () => {
    const vic = byName(fixture, 'Vic Video');
    expect(vic.points.industryBonus).toBe(0);
    expect(vic.industryBonusEvidence).toContain('Video Technology');
    const priya = byName(assessJob(realDataset(), 'JOB001'), 'Priya Anand');
    expect(priya.points.industryBonus).toBe(0);
  });

  it('is not part of other roles', () => {
    const job3 = assessJob(fixtureDataset(), 'JOB003');
    expect(byName(job3, 'Bob BroadcastPM').points.industryBonus).toBe(0);
    expect(byName(job3, 'Bob BroadcastPM').industryBonusEvidence).toBe('not part of this role');
  });
});

describe('thresholds', () => {
  it('needs 60% of required points, rounded up', () => {
    expect(requiredThreshold(10)).toBe(6);
    expect(requiredThreshold(12)).toBe(8);
    expect(requiredThreshold(8)).toBe(5);
  });

  it('sets minimum years from the job seniority label', () => {
    const jobs = realDataset().jobs;
    expect(jobs.map((j) => [j.jobId, minYearsFor(j)])).toEqual([
      ['JOB001', 5],
      ['JOB002', 4],
      ['JOB003', 5],
      ['JOB004', 3],
    ]);
  });

  it('sends a strong but too-junior person to needs_review', () => {
    const yan = byName(fixture, 'Yan Young');
    expect(yan.points.required).toBe(10);
    expect(yan.recommendation).toBe('needs_review');
    expect(yan.outcomeReasons.join(' ')).toContain('3y, below the 5y minimum');
  });
});

describe('essentials gate the shortlist', () => {
  it('keeps someone with plenty of supporting skills but no computer-vision evidence off the JOB001 shortlist', () => {
    const nora = byName(fixture, 'Nora NoVision');
    expect(nora.points.total).toBeGreaterThan(byName(fixture, 'Ada NoAws').points.total);
    expect(nora.recommendation).toBe('needs_review');
    expect(nora.missingEssentials).toContain('Computer Vision');
  });

  it('never shortlists anyone for JOB001 without computer-vision and deep-learning evidence (real data)', () => {
    const result = assessJob(realDataset(), 'JOB001');
    for (const c of result.candidates.filter((x) => x.recommendation === 'shortlist')) {
      expect(c.skills.find((s) => s.skill === 'Computer Vision')!.points).toBeGreaterThan(0);
      expect(c.skills.find((s) => s.skill === 'PyTorch')!.points).toBeGreaterThan(0);
    }
  });

  it('does not exclude a strong JOB001 candidate for missing AWS alone', () => {
    const ada = byName(fixture, 'Ada NoAws');
    expect(ada.recommendation).toBe('shortlist');
    expect(ada.skillGaps).toContain('AWS (not listed)');
  });

  it('shortlists a strong JOB001 candidate with neither a preferred industry nor any WSC connection', () => {
    const sam = byName(fixture, 'Sam Strong');
    expect(sam.points.industryBonus).toBe(0);
    expect(sam.connections.count).toBe(0);
    expect(sam.recommendation).toBe('shortlist');
    expect(sam.shortlistRank).toBe(1);
  });
});

describe('JOB003 stays strict on Sports Analytics', () => {
  const job3 = assessJob(fixtureDataset(), 'JOB003');

  it('shortlists a PM with named Sports Analytics', () => {
    expect(byName(job3, 'Sally SportsPM').recommendation).toBe('shortlist');
  });

  it('puts sports broadcasting / data-product experience in needs_review, never the shortlist', () => {
    const bob = byName(job3, 'Bob BroadcastPM');
    expect(bob.skills.find((s) => s.skill === 'Sports Analytics')).toMatchObject({ match: 'equivalent', points: 1 });
    expect(bob.recommendation).toBe('needs_review');
    expect(bob.outcomeReasons.join(' ')).toContain('only "Sports Broadcasting", which does not satisfy it');
  });

  it('accepts one (or zero) shortlisted people as a valid result', () => {
    expect(job3.counts.shortlist).toBe(1);
    const real = assessJob(realDataset(), 'JOB003');
    expect(byName(real, 'Alex Turner').recommendation).toBe('needs_review');
    expect(real.counts.shortlist).toBe(0);
  });
});

describe('not_recommended_for_role', () => {
  it('is used only when the role\'s core discipline is absent', () => {
    expect(byName(fixture, 'Nick Network').recommendation).toBe('not_recommended_for_role');
    expect(byName(fixture, 'Nick Network').outcomeReasons[0]).toContain('stays in the pool for other roles');
  });

  it('leaves those people available for other roles', () => {
    const job3 = assessJob(fixtureDataset(), 'JOB003');
    expect(byName(fixture, 'Sally SportsPM').recommendation).toBe('not_recommended_for_role');
    expect(byName(job3, 'Sally SportsPM').recommendation).toBe('shortlist');
  });
});

/** Skill counts, equivalences, essentials and thresholds (approved rules). */
import { describe, expect, it } from 'vitest';
import { matchSkill, minYearsFor, requiredNeeded } from '../../pipeline';
import { assessJob, byName, fixtureDataset, realDataset } from '../helpers';

const fixture = assessJob(fixtureDataset(), 'JOB001');

describe('skill evidence', () => {
  it('counts a named required skill as on the profile, an accepted equivalent as likely, and nothing as missing', () => {
    const theo = byName(fixture, 'Theo Tensor');
    const pytorch = theo.skills.find((s) => s.skill === 'PyTorch')!;
    expect(pytorch).toMatchObject({ match: 'equivalent', evidence: 'TensorFlow' });
    expect(theo.skills.find((s) => s.skill === 'Python')).toMatchObject({ match: 'named' });
    expect(theo.skills.find((s) => s.skill === 'Object Detection')).toMatchObject({ match: 'none' });
    const named = theo.skills.filter((s) => s.kind === 'required' && s.match === 'named').length;
    expect(theo.tally.required).toBe(named);
    expect(theo.tally.requiredLikely).toBe(1);
  });

  it('treats TensorFlow as a PARTIAL match for PyTorch and shows it as a gap', () => {
    const theo = byName(fixture, 'Theo Tensor');
    expect(theo.skillGaps).toContain('PyTorch: only a related skill (TensorFlow)');
  });

  it('infers Object Detection from tracking/pose/sports CV as likely, labelled "please confirm"', () => {
    expect(matchSkill(['Sports Tracking'], 'Object Detection')).toEqual({ match: 'inferred', evidence: 'Sports Tracking' });
    expect(matchSkill(['Sports CV'], 'Object Detection').match).toBe('inferred');
    const pia = byName(fixture, 'Pia Pose');
    const od = pia.skills.find((s) => s.skill === 'Object Detection')!;
    expect(od).toMatchObject({ match: 'inferred', evidence: 'Pose Estimation' });
    expect(pia.fitEvidence.join(' ')).toContain('Object Detection (likely, from Pose Estimation; please confirm)');
    expect(pia.skillGaps).toContain('Object Detection: likely (from Pose Estimation), please confirm');
  });

  it('infers Object Detection from Highlight Detection and Event Detection the same way (likely, confirm)', () => {
    expect(matchSkill(['Highlight Detection'], 'Object Detection')).toEqual({ match: 'inferred', evidence: 'Highlight Detection' });
    expect(matchSkill(['Event Detection'], 'Object Detection')).toEqual({ match: 'inferred', evidence: 'Event Detection' });
    expect(matchSkill(['Action Detection'], 'Object Detection').match).toBe('inferred');
    // A named skill still wins.
    expect(matchSkill(['Highlight Detection', 'YOLO'], 'Object Detection')).toEqual({ match: 'named', evidence: 'YOLO' });

    const mason = byName(assessJob(realDataset(), 'JOB001'), 'Mason Young');
    expect(mason.skills.find((s) => s.skill === 'Object Detection')).toMatchObject({ match: 'inferred', evidence: 'Highlight Detection' });
    // Python and Computer Vision by name; TensorFlow (for PyTorch) and Highlight Detection only likely.
    expect(mason.tally).toMatchObject({ required: 2, requiredLikely: 2, requiredTotal: 5, requiredNeeded: 3 });
    // Likely skills are confirmed in review, never counted for the shortlist.
    expect(mason.recommendation).toBe('needs_review');
    expect(mason.outcomeReasons.join(' ')).toContain('2 of 5 required skills on the profile (needs 3); 2 more likely, please confirm');
    expect(mason.skillGaps).toContain('Object Detection: likely (from Highlight Detection), please confirm');
  });

  it('prefers a named match over an equivalent one', () => {
    expect(matchSkill(['TensorFlow', 'PyTorch'], 'PyTorch')).toEqual({ match: 'named', evidence: 'PyTorch' });
  });

  it('counts each nice-to-have skill', () => {
    const nora = byName(fixture, 'Nora NoVision');
    expect(nora.tally.niceToHave).toBe(3); // Sports Analytics, Real-time processing, Docker
  });

  it('matches an unknown job skill by its own name only', () => {
    expect(matchSkill(['TypeScript'], 'TypeScript').match).toBe('named');
    expect(matchSkill(['JavaScript'], 'TypeScript').match).toBe('none');
  });
});

describe('industry match (JOB001 only, breaks ties)', () => {
  it('matches a sports/league/media/broadcast/streaming/OTT industry', () => {
    expect(byName(fixture, 'Theo Tensor').tally.industryMatch).toBe(true);
  });

  it('does not give it to "Video Technology"', () => {
    const vic = byName(fixture, 'Vic Video');
    expect(vic.tally.industryMatch).toBe(false);
    expect(vic.industryBonusEvidence).toContain('Video Technology');
    const priya = byName(assessJob(realDataset(), 'JOB001'), 'Priya Anand');
    expect(priya.tally.industryMatch).toBe(false);
  });

  it('is not part of other roles', () => {
    const job3 = assessJob(fixtureDataset(), 'JOB003');
    expect(byName(job3, 'Bob BroadcastPM').tally.industryMatch).toBe(false);
    expect(byName(job3, 'Bob BroadcastPM').industryBonusEvidence).toBe('not part of this role');
  });
});

describe('thresholds', () => {
  it('needs 60% of the required skills on the profile, rounded up, for every job', () => {
    expect(requiredNeeded(5)).toBe(3);
    expect(requiredNeeded(6)).toBe(4);
    expect(requiredNeeded(4)).toBe(3);
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
    expect(yan.tally.required).toBe(5);
    expect(yan.recommendation).toBe('needs_review');
    expect(yan.outcomeReasons.join(' ')).toContain("3 years' experience (needs 5)");
  });
});

describe('essentials gate the shortlist', () => {
  it('keeps someone with plenty of supporting skills but no computer-vision evidence off the JOB001 shortlist', () => {
    const nora = byName(fixture, 'Nora NoVision');
    expect(nora.tally.niceToHave).toBeGreaterThan(byName(fixture, 'Ada NoAws').tally.niceToHave);
    expect(nora.recommendation).toBe('needs_review');
    expect(nora.missingEssentials).toContain('Computer Vision');
  });

  it('never shortlists anyone for JOB001 without computer-vision and deep-learning evidence (real data)', () => {
    const result = assessJob(realDataset(), 'JOB001');
    for (const c of result.candidates.filter((x) => x.recommendation === 'shortlist')) {
      expect(c.skills.find((s) => s.skill === 'Computer Vision')!.match).not.toBe('none');
      expect(c.skills.find((s) => s.skill === 'PyTorch')!.match).not.toBe('none');
    }
  });

  it('does not exclude a strong JOB001 candidate for missing AWS alone', () => {
    const ada = byName(fixture, 'Ada NoAws');
    expect(ada.recommendation).toBe('shortlist');
    expect(ada.skillGaps).toContain('AWS: not on profile');
  });

  it('shortlists a strong JOB001 candidate with neither a preferred industry nor any WSC connection', () => {
    const sam = byName(fixture, 'Sam Strong');
    expect(sam.tally.industryMatch).toBe(false);
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
    expect(bob.skills.find((s) => s.skill === 'Sports Analytics')).toMatchObject({ match: 'equivalent' });
    expect(bob.recommendation).toBe('needs_review');
    expect(bob.outcomeReasons.join(' ')).toContain('Sports Analytics (only a related skill, Sports Broadcasting, which is not enough)');
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

/**
 * A role's own criteria (job_openings.csv core_skills / must_have_skills, or the New position dialog): the policy
 * lookup order, the optional columns, and what they decide.
 */
import { describe, expect, it } from 'vitest';
import { loadSources } from '../../cli/load-sources';
import { addRole } from '../../integration-demo/sources';
import { assessmentToCsv, assessJob, buildDataset, parseCsv, policyFor, toCsv, type SourceTexts } from '../../pipeline';
import { byName, DATA_DIR } from '../helpers';

const sources = loadSources(DATA_DIR);

/** The supplied jobs table with extra columns; `fill` gives a row's values for them. */
function withColumns(fill: (jobId: string) => Record<string, string>): SourceTexts {
  const { header, records } = parseCsv(sources.jobs);
  const rows = records.map((r) => ({ ...r, ...fill(r.job_id!) }));
  const extra = Object.keys(fill('JOB001')).filter((k) => !header.includes(k));
  return { ...sources, jobs: toCsv([...header, ...extra], rows) };
}

function newRole(core: string, mustHave: string, required = 'Kubernetes, Terraform, AWS, CI/CD') {
  const { sources: next, jobId } = addRole(
    { title: 'Site Reliability Engineer', department: 'Platform', seniority: 'Mid', keyDomains: '', requiredSkills: required, niceToHave: '', coreSkills: core, mustHaveSkills: mustHave },
    sources,
  );
  const dataset = buildDataset(next);
  return { dataset, job: dataset.jobs.find((j) => j.jobId === jobId)!, result: assessJob(dataset, jobId) };
}

describe('policy lookup order', () => {
  it('a written ROLE_POLICIES entry wins over criteria in the row', () => {
    const dataset = buildDataset(withColumns((id) => (id === 'JOB001' ? { core_skills: 'Kafka', must_have_skills: 'Redis' } : { core_skills: '', must_have_skills: '' })));
    const job = dataset.jobs.find((j) => j.jobId === 'JOB001')!;
    expect(job.policy).toBeDefined();
    const { policy, isDefault } = policyFor(job);
    expect(isDefault).toBe(false);
    expect(policy.essentials.map((e) => e.label)).toEqual(['Computer Vision', 'PyTorch or related deep learning']);
    expect(assessJob(dataset, 'JOB001').counts).toEqual({ shortlist: 6, needs_review: 6, not_recommended_for_role: 63 });
  });

  it('a role without a written entry uses its own criteria, and is not provisional', () => {
    const { job, result } = newRole('Kubernetes; Terraform; CI/CD; Monitoring', 'AWS');
    const { policy, isDefault } = policyFor(job);
    expect(isDefault).toBe(false);
    expect(policy.essentials).toEqual([{ label: 'AWS', anyOf: ['AWS'], allowRelated: false }]);
    expect(policy.coreDiscipline.label).toBe('Kubernetes, Terraform, CI/CD or Monitoring');
    expect(policy.industryBonus).toBeNull();
    const flags = result.candidates.flatMap((c) => c.dataQualityFlags).join(' ');
    expect(flags).not.toContain('provisional');
    expect(flags).not.toContain('no written policy');
  });

  it('a role with neither column keeps the provisional default, flagged as before', () => {
    const { job, result } = newRole('', '');
    expect(job.policy).toBeUndefined();
    expect(policyFor(job).isDefault).toBe(true);
    expect(policyFor(job).policy.essentials).toEqual([]);
    expect(result.candidates[0]!.dataQualityFlags.join(' ')).toContain(`no written policy for ${job.jobId}; provisional default rules applied (no must-haves)`);
  });

  it('must-haves without core skills keep the must-haves; the core falls back to the required skills, flagged', () => {
    const { job, result } = newRole('', 'AWS');
    const { policy, isDefault } = policyFor(job);
    expect(isDefault).toBe(true);
    expect(policy.essentials.map((e) => e.label)).toEqual(['AWS']);
    expect(policy.coreDiscipline.label).toBe('required (Kubernetes, Terraform, AWS, CI/CD)');
    expect(result.candidates[0]!.dataQualityFlags.join(' ')).toContain(`no core skills for ${job.jobId}; provisional default applied`);
  });
});

describe('core_skills and must_have_skills columns', () => {
  it('are optional: absent, or present and empty, leave JOB001–JOB004 byte-identical and add no warning', () => {
    const plain = buildDataset(sources);
    const empty = buildDataset(withColumns(() => ({ core_skills: '', must_have_skills: '' })));
    expect(plain.warnings.join(' ')).not.toContain('core_skills');
    for (const jobId of ['JOB001', 'JOB002', 'JOB003', 'JOB004']) {
      expect(plain.jobs.find((j) => j.jobId === jobId)!.policy).toBeUndefined();
      expect(assessmentToCsv(assessJob(empty, jobId))).toBe(assessmentToCsv(assessJob(plain, jobId)));
    }
  });

  it('are semicolon lists, repeats counted once', () => {
    const { job } = newRole('Kubernetes; kubernetes ;Terraform', 'AWS;AWS');
    expect(job.policy!.coreDiscipline.label).toBe('Kubernetes or Terraform');
    expect(job.policy!.essentials).toHaveLength(1);
  });

  it('a core skill counts by name or accepted alias (OpenCV, Sports CV for Computer Vision); a related skill does not', () => {
    const { job, result } = newRole('Computer Vision', '', 'Python, Computer Vision');
    // Named terms only: Pose Estimation or Video Understanding (related skills) are not core evidence.
    expect(job.policy!.coreDiscipline.terms).toEqual(['computer vision', 'opencv', 'sports cv']);
    expect(byName(result, 'Marcus Reid').recommendation).not.toBe('not_recommended_for_role'); // Sports CV
    const notRec = byName(result, 'Ryan Patel');
    expect(notRec.recommendation).toBe('not_recommended_for_role');
    expect(notRec.outcomeReasons[0]).toBe('No Computer Vision skill on profile; stays in the pool for other roles');
  });

  it('a must-have is checked on the profile even when it is not a required skill, and a related skill is not enough', () => {
    const { result } = newRole('Kubernetes; Terraform; CI/CD; Monitoring', 'AWS', 'Kubernetes, Terraform, CI/CD');
    const mei = byName(result, 'Mei Zhang'); // GCP, no AWS
    expect(mei.recommendation).toBe('needs_review');
    expect(mei.outcomeReasons[0]).toBe('Missing must-have: AWS (only a related skill, GCP, which is not enough)');
    // AWS on the profile, though not a required skill of this role.
    const grace = byName(result, 'Grace Wilson');
    expect(grace.missingEssentials).toEqual([]);
    // ...and shown as evidence (the card's Matched evidence, the handoff's evidence), outside the required tally.
    expect(grace.mustHaveSkills).toEqual([{ skill: 'AWS', kind: 'must_have', match: 'named', evidence: 'AWS' }]);
    expect(grace.fitEvidence[0]).toBe('Must-have: AWS');
    expect(grace.tally.requiredTotal).toBe(3);
  });

  it('a must-have that is also a required skill is not listed twice', () => {
    const { result } = newRole('Kubernetes; Terraform; CI/CD; Monitoring', 'AWS');
    expect(result.candidates.every((c) => c.mustHaveSkills.length === 0)).toBe(true);
    for (const jobId of ['JOB001', 'JOB002', 'JOB003', 'JOB004']) {
      expect(assessJob(buildDataset(sources), jobId).candidates.every((c) => c.mustHaveSkills.length === 0)).toBe(true);
    }
  });

  it('the New position path writes the columns only when criteria were confirmed', () => {
    const withCriteria = addRole(
      { title: 'SRE', department: '', seniority: 'Mid', keyDomains: '', requiredSkills: 'Kubernetes', niceToHave: '', coreSkills: 'Kubernetes, Terraform', mustHaveSkills: 'AWS' },
      sources,
    ).sources.jobs;
    const { header, records } = parseCsv(withCriteria);
    expect(header.slice(-2)).toEqual(['core_skills', 'must_have_skills']);
    expect(records.at(-1)).toMatchObject({ core_skills: 'Kubernetes;Terraform', must_have_skills: 'AWS' });
    expect(records.slice(0, 4).every((r) => r.core_skills === '' && r.must_have_skills === '')).toBe(true);
    const without = addRole({ title: 'SRE', department: '', seniority: 'Mid', keyDomains: '', requiredSkills: 'Kubernetes', niceToHave: '' }, sources).sources.jobs;
    expect(parseCsv(without).header).not.toContain('core_skills');
  });
});

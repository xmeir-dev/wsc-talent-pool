import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import saved from '../../data/skill-variants.json';
import { parseArgs } from '../../cli/args';
import { learnSkillVariants, type AskVariants } from '../../cli/learn-skills';
import { agreedMatches, mergeVariants, planVariantQuestions, readAnswer, type VariantQuestion } from '../../pipeline/learn-variants';
import { canonicalSkill, uniqueSkills } from '../../pipeline/text';
import { useSkillVariants, validateVariants, variantSkill, type SkillVariant, type SkillVariantFile } from '../../pipeline/variants';
import { assessJob, buildDataset, matchSkill, toCsv } from '../../pipeline';
import { byName, realDataset, SYNTHETIC_ATTENDEE_COLUMNS, syntheticPerson } from '../helpers';

const variant = (v: string, skill: string, kind: SkillVariant['kind'] = 'abbreviation'): SkillVariant => ({
  variant: v,
  skill,
  kind,
  model: 'test',
  added: '2026-10-21',
});

const LEARNED = [variant('K8s', 'Kubernetes'), variant('Amazon Web Services', 'AWS', 'full_name'), variant('ML', 'Machine Learning')];

afterEach(() => useSkillVariants(saved as unknown as SkillVariantFile));

/** One person, one role: skills written differently from the job's. */
function variantSources(skills: string) {
  return {
    attendees: toCsv(SYNTHETIC_ATTENDEE_COLUMNS, [
      { ...syntheticPerson('HS901', 'Vera'), full_name: 'Vera Variant', linkedin_url: 'linkedin.com/in/vera-variant' },
    ]),
    profiles: toCsv(['linkedin_url', 'full_name', 'current_company', 'current_title', 'years_experience', 'top_skills', 'industry', 'wsc_mutual_connections'], [
      { linkedin_url: 'linkedin.com/in/vera-variant', full_name: 'Vera Variant', current_company: 'Synthetic', current_title: 'SRE', years_experience: '8', top_skills: skills, industry: 'Software', wsc_mutual_connections: '' },
    ]),
    employees: toCsv(['employee_id', 'full_name', 'title'], []),
    jobs: toCsv(['job_id', 'title', 'seniority', 'required_skills', 'nice_to_have'], [
      { job_id: 'JOB950', title: 'Synthetic SRE', seniority: 'Senior', required_skills: 'Kubernetes;Terraform;AWS;Python', nice_to_have: '' },
    ]),
  };
}

describe('learned skill variants', () => {
  it('ship empty, so the supplied results are unchanged', () => {
    expect(saved.variants).toEqual([]);
    expect(assessJob(realDataset(), 'JOB001').counts).toEqual({ shortlist: 6, needs_review: 6, not_recommended_for_role: 63 });
  });

  it('count exactly like the skill they stand for, on a profile and in a job', () => {
    useSkillVariants({ variants: LEARNED });
    expect(matchSkill(['K8s'], 'Kubernetes')).toEqual({ match: 'named', evidence: 'K8s' });
    expect(matchSkill(['Amazon Web Services'], 'AWS')).toEqual({ match: 'named', evidence: 'Amazon Web Services' });
    expect(matchSkill(['Kubernetes'], 'K8s')).toEqual({ match: 'named', evidence: 'Kubernetes' });
    expect(uniqueSkills(['K8s', 'Kubernetes'])).toEqual(['K8s']);
    expect(canonicalSkill('k8s')).toBe('kubernetes');
  });

  it('inherit the hand-written rule: ML is related to PyTorch, as Machine Learning is, never more', () => {
    useSkillVariants({ variants: LEARNED });
    expect(matchSkill(['ML'], 'PyTorch').match).toBe('equivalent');
    expect(matchSkill(['ML Architecture'], 'PyTorch').match).toBe('none');
  });

  it('move a person from review to the shortlist when only the wording differed', () => {
    const skills = 'K8s;Terraform;Amazon Web Services;Python';
    expect(byName(assessJob(buildDataset(variantSources(skills)), 'JOB950'), 'Vera Variant').recommendation).toBe('needs_review');
    useSkillVariants({ variants: LEARNED });
    const after = byName(assessJob(buildDataset(variantSources(skills)), 'JOB950'), 'Vera Variant');
    expect(after.recommendation).toBe('shortlist');
    expect(after.fitEvidence.join(' ')).toContain('Kubernetes (listed as K8s)');
  });

  it('never override rules.ts, and drop unknown kinds, same names, conflicts and chains', () => {
    const { table, problems } = validateVariants([
      variant('TensorFlow', 'PyTorch', 'spelling'),
      variant('SageMaker', 'AWS'),
      variant('Kubernetes', 'kubernetes', 'spelling'),
      { ...variant('Py', 'Python'), kind: 'related' as SkillVariant['kind'] },
      variant('GKE', 'Kubernetes'),
      variant('GKE', 'Google Cloud'),
      variant('K8', 'K8s'),
      variant('K8s', 'Kubernetes'),
    ]);
    expect([...table]).toEqual([['k8s', 'kubernetes']]);
    expect(problems).toHaveLength(6);
    useSkillVariants({ variants: [variant('TensorFlow', 'PyTorch', 'spelling')] });
    expect(variantSkill('tensorflow')).toBeUndefined();
    expect(matchSkill(['TensorFlow'], 'PyTorch').match).toBe('equivalent');
  });
});

describe('learning variants', () => {
  const empty = (): SkillVariantFile => ({ variants: [], checked: {} });

  it('asks only about words the rules do not know, compared with the job’s skill names', () => {
    const dataset = realDataset();
    const job = assessJob(dataset, 'JOB001').job;
    const questions = planVariantQuestions(dataset, [job], empty());
    const words = questions.flatMap((q) => q.words);
    expect(words).toContain('ml architecture');
    expect(words).not.toContain('pytorch');
    expect(words).not.toContain('tensorflow');
    expect(questions[0]!.skills).toContain('machine learning');
  });

  it('asks a new role’s unfamiliar skill words against the pool', () => {
    const dataset = buildDataset(variantSources('Kubernetes;Python'));
    const sources = variantSources('Kubernetes;Python');
    sources.jobs = toCsv(['job_id', 'title', 'seniority', 'required_skills', 'nice_to_have'], [
      { job_id: 'JOB951', title: 'Synthetic SRE', seniority: 'Senior', required_skills: 'K8s;Python', nice_to_have: '' },
    ]);
    const withJob = buildDataset(sources);
    const questions = planVariantQuestions(withJob, withJob.jobs, empty());
    expect(questions.find((q) => q.words.includes('k8s'))?.skills).toContain('kubernetes');
    expect(dataset.jobs).toHaveLength(1);
  });

  it('never asks the same word about the same skill twice', () => {
    const dataset = realDataset();
    const jobs = [assessJob(dataset, 'JOB001').job];
    const questions = planVariantQuestions(dataset, jobs, empty());
    const merged = mergeVariants(empty(), questions.map((question) => ({ question, matches: [] })), { model: 'test', date: '2026-10-21' });
    expect(planVariantQuestions(dataset, jobs, merged.file)).toEqual([]);
  });

  it('keeps only answers about the question’s own words and skill names, and only matches both answers give', () => {
    const q: VariantQuestion = { words: ['k8s', 'gke'], skills: ['kubernetes', 'python'] };
    const first = readAnswer(q, {
      matches: [
        { word: 'K8s', skill: 'Kubernetes', kind: 'abbreviation' },
        { word: 'gke', skill: 'kubernetes', kind: 'abbreviation' },
        { word: 'rust', skill: 'python', kind: 'spelling' },
        { word: 'k8s', skill: 'go', kind: 'spelling' },
        { word: 'k8s', skill: 'python', kind: 'related' },
      ],
    });
    expect(first).toEqual([
      { word: 'k8s', skill: 'kubernetes', kind: 'abbreviation' },
      { word: 'gke', skill: 'kubernetes', kind: 'abbreviation' },
    ]);
    const second = readAnswer(q, { matches: [{ word: 'k8s', skill: 'kubernetes', kind: 'abbreviation' }] });
    expect(agreedMatches(first, second)).toEqual([{ word: 'k8s', skill: 'kubernetes', kind: 'abbreviation' }]);
    expect(readAnswer(q, 'not json')).toEqual([]);
  });

  it('saves agreed answers, records every word asked, and asks again after a failed call', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'variants-')), 'skill-variants.json');
    writeFileSync(path, JSON.stringify(empty()));
    const dataset = buildDataset(variantSources('K8s;Terraform;Amazon Web Services;Python'));
    const job = dataset.jobs[0]!;
    const answers = { matches: [{ word: 'k8s', skill: 'kubernetes', kind: 'abbreviation' }, { word: 'amazon web services', skill: 'aws', kind: 'full_name' }] };

    let calls = 0;
    const failing: AskVariants = async () => {
      calls++;
      if (calls === 1) throw new Error('network down');
      return answers;
    };
    const failed = await learnSkillVariants(dataset, [job], path, failing, '2026-10-21');
    expect(failed).toMatchObject({ checked: 0, added: [], failures: ['network down'] });
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(empty());

    const result = await learnSkillVariants(dataset, [job], path, async () => answers, '2026-10-21');
    expect(result.added.map((v) => `${v.variant}→${v.skill}`)).toEqual(['k8s→kubernetes', 'amazon web services→aws']);
    const file = JSON.parse(readFileSync(path, 'utf8')) as SkillVariantFile;
    expect(file.variants.map((v) => v.variant)).toEqual(['amazon web services', 'k8s']);
    expect(file.variants[0]).toMatchObject({ model: 'claude-opus-5-5', added: '2026-10-21' });
    expect(Object.keys(file.checked)).toEqual(['amazon web services', 'k8s']);
    expect(byName(assessJob(dataset, job.jobId), 'Vera Variant').recommendation).toBe('shortlist');

    const again = await learnSkillVariants(dataset, [job], path, async () => answers, '2026-10-21');
    expect(again.questions).toBe(0);
  });

  it('does not save a match the two answers disagree on', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'variants-')), 'skill-variants.json');
    writeFileSync(path, JSON.stringify(empty()));
    const dataset = buildDataset(variantSources('K8s;Python'));
    let n = 0;
    const result = await learnSkillVariants(dataset, dataset.jobs, path, async () => (n++ === 0 ? { matches: [{ word: 'k8s', skill: 'kubernetes', kind: 'abbreviation' }] } : { matches: [] }));
    expect(result.added).toEqual([]);
    expect(JSON.parse(readFileSync(path, 'utf8')).checked).toHaveProperty('k8s');
  });
});

describe('--learn-skills', () => {
  it('is off unless given, and takes no value', () => {
    expect(parseArgs(['JOB001'])).toMatchObject({ kind: 'run', learnSkills: false });
    expect(parseArgs(['JOB001', '--learn-skills'])).toMatchObject({ kind: 'run', learnSkills: true });
    expect(parseArgs(['--all', '--learn-skills'])).toMatchObject({ kind: 'run', all: true, learnSkills: true });
    expect(parseArgs(['JOB001', '--learn-skills=yes'])).toMatchObject({ kind: 'error' });
    expect(parseArgs(['JOB001', '--learn-skills', '--learn-skills'])).toMatchObject({ kind: 'error' });
  });
});

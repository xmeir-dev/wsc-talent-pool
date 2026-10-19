/**
 * Input formatting must not change a hiring decision: unknown seniority, repeated job skills
 * and a job skill's own name. Synthetic records only.
 */
import { describe, expect, it } from 'vitest';
import { loadSources } from '../../cli/load-sources';
import { addRole, roleProblems } from '../../integration-demo/sources';
import { assessJob, buildDataset, matchSkill, rules, SUPPORTED_SENIORITIES, toCsv, type SourceTexts } from '../../pipeline';
import { fitChecks } from '../../view/format';
import { byName, DATA_DIR, realDataset } from '../helpers';

const ATTENDEE = ['hubspot_id', 'full_name', 'email', 'conference_name', 'conference_domain', 'conference_date', 'linkedin_url'];
const PROFILE = ['linkedin_url', 'full_name', 'current_company', 'current_title', 'years_experience', 'top_skills', 'industry', 'wsc_mutual_connections'];
const JOB = ['job_id', 'title', 'department', 'key_domains', 'seniority', 'required_skills', 'nice_to_have'];

interface Person {
  name: string;
  years: string;
  skills: string;
}

/** One synthetic role (JOB900) and the given people, each with a profile. */
function sources(job: { seniority: string; required: string; nice?: string }, people: Person[]): SourceTexts {
  const slug = (p: Person) => p.name.toLowerCase().replace(/\s+/g, '-');
  return {
    attendees: toCsv(
      ATTENDEE,
      people.map((p, i) => ({
        hubspot_id: `HS9${String(i).padStart(2, '0')}`,
        full_name: p.name,
        email: `${slug(p)}@example.test`,
        conference_name: 'Synthetic Summit',
        conference_domain: 'Data Engineering & AI/ML',
        conference_date: '2025-01-01',
        linkedin_url: `linkedin.com/in/${slug(p)}`,
      })),
    ),
    profiles: toCsv(
      PROFILE,
      people.map((p) => ({
        linkedin_url: `linkedin.com/in/${slug(p)}`,
        full_name: p.name,
        current_company: 'Example Co',
        current_title: 'Engineer',
        years_experience: p.years,
        top_skills: p.skills,
        industry: 'Software',
        wsc_mutual_connections: '',
      })),
    ),
    employees: toCsv(['employee_id', 'full_name', 'title'], [{ employee_id: 'E1', full_name: 'Erin Employee', title: 'Engineer' }]),
    jobs: toCsv(JOB, [
      { job_id: 'JOB900', title: 'Data Engineer', department: 'Data', key_domains: '', seniority: job.seniority, required_skills: job.required, nice_to_have: job.nice ?? '' },
    ]),
  };
}

const STRONG: Person[] = [
  { name: 'Nora Noyears', years: '', skills: 'Python;SQL;Spark;Airflow;Kafka' },
  { name: 'Vera Veteran', years: '12', skills: 'Python;SQL;Spark;Airflow;Kafka' },
];

describe('unknown seniority never removes the years check', () => {
  for (const seniority of ['Staff', 'Senior-level', 'Senoir', '', '   ']) {
    it(`"${seniority}" keeps qualified people in review, with the reason shown`, () => {
      const r = assessJob(buildDataset(sources({ seniority, required: 'Python;SQL;Spark;Airflow;Kafka' }, STRONG)), 'JOB900');
      expect(r.counts.shortlist).toBe(0);
      for (const name of ['Nora Noyears', 'Vera Veteran']) {
        const a = byName(r, name);
        expect(a.recommendation).toBe('needs_review');
        expect(a.outcomeReasons.join(' ')).toMatch(/minimum years is unknown; not shortlisted until the role's seniority is set/);
        expect(a.dataQualityFlags.join(' ')).toMatch(/minimum years is unknown; no one is shortlisted until it is set/);
        expect(a.reviewNextStep).toContain("set the role's seniority (Junior, Mid, Mid-Senior, Senior)");
        expect(JSON.stringify(a)).not.toContain('null year');
        expect(fitChecks(a, r.job).find((c) => c.key === 'years')?.ok).toBe(false);
      }
    });
  }

  it('supported values still work, ignoring case and spaces', () => {
    for (const [seniority, shortlisted] of [
      ['Senior', ['Vera Veteran']],
      [' mid-senior ', ['Vera Veteran']],
      ['MID', ['Vera Veteran']],
      ['Junior', ['Vera Veteran']],
    ] as const) {
      const r = assessJob(buildDataset(sources({ seniority, required: 'Python;SQL;Spark;Airflow;Kafka' }, STRONG)), 'JOB900');
      expect(r.candidates.filter((a) => a.recommendation === 'shortlist').map((a) => a.candidate.fullName)).toEqual(shortlisted);
      // Missing years and sufficient skills is never a shortlist, whatever the level.
      const nora = byName(r, 'Nora Noyears');
      expect(nora.recommendation).toBe('needs_review');
      expect(nora.outcomeReasons).toContain('Years of experience not on profile');
    }
  });

  it('the demo role form only accepts supported levels', () => {
    const role = { title: 'Role', department: '', keyDomains: '', requiredSkills: 'Python', niceToHave: '' };
    for (const seniority of ['Staff', 'Senior-level', 'Senoir', '']) {
      expect(roleProblems({ ...role, seniority })).toEqual(['Choose a seniority: Junior, Mid, Mid-Senior, Senior.']);
    }
    for (const seniority of [...SUPPORTED_SENIORITIES, 'senior', ' mid-senior ', 'JUNIOR']) expect(roleProblems({ ...role, seniority })).toEqual([]);
  });
});

describe('a repeated job skill is one requirement', () => {
  const person: Person = { name: 'Pia Pair', years: '8', skills: 'Python;SQL' };

  it('Python + SQL stays 2 of 5 and needs review however Python is repeated', () => {
    for (const required of [
      'Python;SQL;Spark;Airflow;Kafka',
      'Python;SQL;Spark;Airflow;Kafka;Python;Python;Python',
      'Python;SQL;Spark;Airflow;Kafka;python; PYTHON ;  Python  ',
    ]) {
      const r = assessJob(buildDataset(sources({ seniority: 'Mid', required }, [person])), 'JOB900');
      expect(r.job.requiredSkills).toEqual(['Python', 'SQL', 'Spark', 'Airflow', 'Kafka']);
      const a = byName(r, 'Pia Pair');
      expect([a.tally.required, a.tally.requiredTotal, a.tally.requiredNeeded]).toEqual([2, 5, 3]);
      expect(a.recommendation).toBe('needs_review');
    }
  });

  it('an accepted alias is the same requirement (Go; Golang), related or distinct skills are not', () => {
    const r = assessJob(
      buildDataset(sources({ seniority: 'Mid', required: 'Go;Golang;Kafka;SQL;Spark;Airflow' }, [{ name: 'Gil Golang', years: '8', skills: 'Golang' }])),
      'JOB900',
    );
    expect(r.job.requiredSkills).toEqual(['Go', 'Kafka', 'SQL', 'Spark', 'Airflow']);
    expect([byName(r, 'Gil Golang').tally.required, byName(r, 'Gil Golang').tally.requiredTotal]).toEqual([1, 5]);
    const d = buildDataset(sources({ seniority: 'Mid', required: 'C;C#;C++;Python;Python Basics;PyTorch;TensorFlow' }, [person]));
    expect(d.jobs[0]!.requiredSkills).toEqual(['C', 'C#', 'C++', 'Python', 'Python Basics', 'PyTorch', 'TensorFlow']);
  });

  it('dedupes nice-to-haves within their own list, keeps distinct skills, and says so', () => {
    const d = buildDataset(sources({ seniority: 'Mid', required: 'Python;SQL', nice: 'Kafka; kafka;Spark Streaming;Spark' }, [person]));
    expect(d.jobs[0]!.niceToHave).toEqual(['Kafka', 'Spark Streaming', 'Spark']);
    expect(d.warnings).toContain('jobs: JOB900 lists a skill more than once; each skill is counted once');
  });

  it('applies to roles created in the demo', () => {
    const { sources: next, jobId } = addRole(
      { title: 'Data Engineer', department: '', seniority: 'Mid', keyDomains: '', requiredSkills: 'Python, SQL, Spark, Airflow, Kafka, python ,  Python', niceToHave: 'Kafka, KAFKA' },
      loadSources(DATA_DIR),
    );
    const job = buildDataset(next).jobs.find((j) => j.jobId === jobId)!;
    expect(job.requiredSkills).toEqual(['Python', 'SQL', 'Spark', 'Airflow', 'Kafka']);
    expect(job.niceToHave).toEqual(['Kafka']);
  });
});

describe("every job skill matches its own name", () => {
  it('every configured and supplied skill, including OTT platforms, Broadcast tech and Sports domain knowledge', () => {
    const skills = new Set([...Object.keys(rules.SKILL_EVIDENCE), ...realDataset().jobs.flatMap((j) => [...j.requiredSkills, ...j.niceToHave])]);
    for (const skill of skills) {
      expect(matchSkill([skill], skill), skill).toEqual({ match: 'named', evidence: skill });
      expect(matchSkill([skill.toUpperCase()], skill).match, skill).toBe('named');
    }
    expect(matchSkill(['Sports domain knowledge'], 'Sports domain knowledge')).toEqual({ match: 'named', evidence: 'Sports domain knowledge' });
  });

  it('related and inferred evidence keeps its level', () => {
    expect(matchSkill(['B2C Streaming'], 'OTT platforms').match).toBe('equivalent');
    expect(matchSkill(['OTT'], 'OTT platforms').match).toBe('named');
    expect(matchSkill(['TensorFlow'], 'PyTorch').match).toBe('equivalent');
    expect(matchSkill(['Kubernetes'], 'Docker').match).toBe('equivalent');
    expect(matchSkill(['Sports Tracking'], 'Object Detection').match).toBe('inferred');
    expect(matchSkill(['Sports Broadcasting'], 'Sports Analytics').match).toBe('equivalent');
    expect(matchSkill(['Broadcast'], 'Broadcast tech').match).toBe('none');
  });
});

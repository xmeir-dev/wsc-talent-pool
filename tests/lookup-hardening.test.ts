/**
 * F7: a spelling variant ("Golang" for Go) is the same requirement in any order, and scores exactly like the skill;
 * a narrower name ("SageMaker" under AWS) is its own requirement, alone or next to its skill, in either order.
 * F6 and free-text skills: names that happen to be JavaScript object properties ("constructor", "__proto__") are
 * ordinary unknown text, never configured policy, and never crash.
 */
import { describe, expect, it } from 'vitest';
import { loadSources } from '../cli/load-sources';
import { addRole } from '../integration-demo/sources';
import { assessEvent, buildDataset, matchSkill, minYearsFor, policyFor, rules, toCsv, type Job, type JobAssessment } from '../pipeline';
import { conferenceShort } from '../view/format';
import { overviewFor } from '../view/Overview';
import { comeetFor } from '../view/activity';
import { assessJob, DATA_DIR } from './helpers';

const sources = loadSources(DATA_DIR);
const OBJECT_NAMES = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', 'isPrototypeOf'];

function roleResult(requiredSkills: string, niceToHave = ''): JobAssessment {
  const { sources: next, jobId } = addRole(
    { title: 'Alias Role', department: 'Engineering', seniority: 'Mid', keyDomains: '', requiredSkills, niceToHave },
    sources,
  );
  return assessJob(buildDataset(next), jobId);
}

/** Everything a decision depends on, per person: outcome, rank and every count. */
function decisions(r: JobAssessment) {
  return {
    counts: r.counts,
    people: r.candidates
      .map((a) => ({ key: a.candidate.candidateKey, rec: a.recommendation, rank: a.shortlistRank, tally: a.tally }))
      .sort((x, y) => x.key.localeCompare(y.key)),
  };
}

const names = (r: JobAssessment, rec: string) =>
  r.candidates.filter((a) => a.recommendation === rec).map((a) => a.candidate.fullName).sort();

/**
 * A Mid role requiring one configured skill or one of its on-profile names, alone, on the supplied data:
 * [name, shortlist, needs review, not recommended] as release 8d66d29 scored it. Spelling variants (Golang,
 * REST API) are the only names that now score as their skill; every other name must not broaden.
 */
const RELEASE_8D66D29: [string, number, number, number][] = [
  ['python', 43, 0, 32],
  ['pytorch', 7, 0, 68],
  ['computer vision', 10, 0, 65],
  ['opencv', 1, 0, 74],
  ['sports cv', 1, 0, 74],
  ['object detection', 1, 0, 74],
  ['yolo', 1, 0, 74],
  ['aws', 32, 0, 43],
  ['sagemaker', 1, 0, 74],
  ['sports analytics', 7, 0, 68],
  ['football analytics', 2, 0, 73],
  ['performance analytics', 1, 0, 74],
  ['real-time processing', 3, 0, 72],
  ['real-time', 1, 0, 74],
  ['docker', 2, 0, 73],
  ['go', 5, 0, 70],
  ['kafka', 10, 0, 65],
  ['microservices', 3, 0, 72],
  ['rest apis', 2, 0, 73],
  ['ffmpeg', 4, 0, 71],
  ['video streaming', 7, 0, 68],
  ['live streaming', 5, 0, 70],
  ['hls', 3, 0, 72],
  ['redis', 0, 0, 75],
  ['product management', 5, 0, 70],
  ['api products', 0, 0, 75],
  ['stakeholder management', 1, 0, 74],
  ['ott platforms', 3, 0, 72],
  ['ott', 3, 0, 72],
  ['broadcast tech', 4, 0, 71],
  ['broadcast apis', 1, 0, 74],
  ['sports broadcasting', 2, 0, 73],
  ['broadcast systems', 1, 0, 74],
  ['sql', 19, 0, 56],
  ['spark', 9, 0, 66],
  ['dbt', 13, 0, 62],
  ['airflow', 10, 0, 65],
  ['sports domain knowledge', 19, 0, 56],
  ['sports', 8, 0, 67],
  ['sports data', 3, 0, 72],
  ['real-time sports data', 1, 0, 74],
  ['sports data feeds', 1, 0, 74],
  ['terraform', 9, 0, 66],
];

describe('F7: spelling variants are one skill in any order; narrower names never broaden', () => {
  it('every configured skill and on-profile name required alone scores as release 8d66d29 did', () => {
    const named = Object.entries(rules.SKILL_EVIDENCE).flatMap(([key, rule]) => [key, ...rule.named]);
    const expected = new Set(RELEASE_8D66D29.map(([n]) => n));
    for (const name of named) if (!Object.hasOwn(rules.SKILL_SYNONYMS, name)) expect(expected, name).toContain(name);
    for (const [name, shortlist, review, notRec] of RELEASE_8D66D29) {
      expect([name, roleResult(name).counts], name).toEqual([
        name,
        { shortlist, needs_review: review, not_recommended_for_role: notRec },
      ]);
    }
  });

  it('the narrow tools the verifier named keep their release counts (SageMaker 1, OpenCV 1, HLS 3)', () => {
    expect(roleResult('SageMaker').counts.shortlist).toBe(1);
    expect(roleResult('OpenCV').counts.shortlist).toBe(1);
    expect(roleResult('HLS').counts.shortlist).toBe(3);
    const adaora = roleResult('SageMaker').candidates.find((a) => a.candidate.fullName.startsWith('Adaora'));
    if (adaora) expect(adaora.recommendation).not.toBe('shortlist');
  });

  it('Go, Golang and Golang, Go give the same shortlist, review and not-recommended sets as Go alone or Golang alone', () => {
    const goFirst = roleResult('Go, Golang');
    const golangFirst = roleResult('Golang, Go');
    expect(names(goFirst, 'shortlist')).toEqual(['Chris Lee', 'Liam Harris', 'Owen Jackson', 'Rachel Kim', 'Sophie Martin']);
    expect(decisions(golangFirst)).toEqual(decisions(goFirst));
    expect(decisions(roleResult('Go'))).toEqual(decisions(goFirst));
    expect(decisions(roleResult('Golang'))).toEqual(decisions(goFirst));
    for (const r of [goFirst, golangFirst]) {
      expect(r.job.requiredSkills).toHaveLength(1);
      const rachel = r.candidates.find((a) => a.candidate.fullName === 'Rachel Kim')!;
      expect(rachel.tally).toMatchObject({ required: 1, requiredTotal: 1 });
      expect(rachel.skills[0]).toMatchObject({ match: 'named', evidence: 'Go' });
    }
  });

  it('every synonym pair gives the same decisions in both orders, and as either spelling alone', () => {
    for (const [variant, key] of Object.entries(rules.SKILL_SYNONYMS)) {
      const base = decisions(roleResult(key));
      expect(decisions(roleResult(variant)), variant).toEqual(base);
      expect(decisions(roleResult(`${key}, ${variant}`)), variant).toEqual(base);
      expect(decisions(roleResult(`${variant}, ${key}`)), variant).toEqual(base);
      expect(decisions(roleResult(`Python, ${variant}`)), variant).toEqual(decisions(roleResult(`${key}, Python`)));
      // As nice-to-haves too.
      expect(decisions(roleResult('Python', `${variant}, ${key}`)), variant).toEqual(decisions(roleResult('Python', key)));
    }
  });

  // A broad skill and a narrower tool listed under it are two requirements, in either order: knowing the tool can
  // support the skill, but knowing the skill does not establish the tool.
  const DISTINCT: [string, string][] = [
    ['AWS', 'SageMaker'],
    ['Computer Vision', 'OpenCV'],
    ['Video Streaming', 'HLS'],
    ['Sports Analytics', 'Football Analytics'],
  ];

  it('Adaora Okafor (AWS, no SageMaker) is 1 of 2 and in review for SageMaker + AWS, in both orders', () => {
    for (const req of ['SageMaker, AWS', 'AWS, SageMaker']) {
      const r = roleResult(req);
      expect(r.job.requiredSkills, req).toHaveLength(2);
      const adaora = r.candidates.find((a) => a.candidate.fullName === 'Adaora Okafor')!;
      expect(adaora.tally, req).toMatchObject({ required: 1, requiredTotal: 2, requiredNeeded: 2 });
      expect(adaora.recommendation, req).toBe('needs_review');
      expect(adaora.skills.find((s) => s.skill === 'SageMaker')!.match, req).toBe('none');
    }
    expect(names(roleResult('AWS, SageMaker'), 'shortlist')).toEqual(names(roleResult('SageMaker'), 'shortlist'));
  });

  for (const [broad, narrow] of DISTINCT) {
    it(`${broad} + ${narrow} stay two requirements in either order; nobody without ${narrow} is shortlisted`, () => {
      const a = roleResult(`${broad}, ${narrow}`);
      const b = roleResult(`${narrow}, ${broad}`);
      expect(a.job.requiredSkills).toEqual([broad, narrow]);
      expect(b.job.requiredSkills).toEqual([narrow, broad]);
      expect(decisions(b)).toEqual(decisions(a));
      const lacking = a.candidates.filter(
        (x) => x.skills.find((s) => s.skill === broad)!.match === 'named' && x.skills.find((s) => s.skill === narrow)!.match === 'none',
      );
      expect(lacking.length, `someone has ${broad} but not ${narrow}`).toBeGreaterThan(0);
      for (const x of lacking) {
        expect(x.tally, x.candidate.fullName).toMatchObject({ required: 1, requiredTotal: 2 });
        expect(x.recommendation, x.candidate.fullName).not.toBe('shortlist');
      }
      // As nice-to-haves too: two separate entries, counted separately, in either order.
      const nice = roleResult('Python', `${narrow}, ${broad}`);
      expect(nice.job.niceToHave).toEqual([narrow, broad]);
      expect(decisions(nice)).toEqual(decisions(roleResult('Python', `${broad}, ${narrow}`)));
      expect(nice.candidates.every((x) => x.tally.niceToHaveTotal === 2)).toBe(true);
    });
  }

  it('two narrower names without their skill are two requirements in either order', () => {
    expect(decisions(roleResult('OpenCV, Sports CV'))).toEqual(decisions(roleResult('Sports CV, OpenCV')));
    expect(roleResult('Sports CV, OpenCV').job.requiredSkills).toHaveLength(2);
    expect(matchSkill(['Performance Analytics'], 'Football Analytics').match).toBe('none');
  });

  it('a synonym matches the skill; a narrower name matches only itself; related evidence keeps its level', () => {
    expect(matchSkill(['Go'], 'Golang')).toEqual({ match: 'named', evidence: 'Go' });
    expect(matchSkill(['golang'], 'Go')).toEqual({ match: 'named', evidence: 'golang' });
    expect(matchSkill(['REST APIs'], 'REST API').match).toBe('named');
    expect(matchSkill(['WebSockets'], 'REST API').match).toBe('equivalent');
    expect(matchSkill(['AWS'], 'SageMaker').match).toBe('none');
    expect(matchSkill(['SageMaker'], 'AWS').match).toBe('named');
    expect(matchSkill(['Computer Vision'], 'OpenCV').match).toBe('none');
    expect(matchSkill(['Pose Estimation'], 'Computer Vision').match).toBe('equivalent');
    // F8: a configured skill still matches its own name first.
    expect(matchSkill(['OTT Platforms'], 'OTT platforms').match).toBe('named');
  });

  it('a supplied policy must-have is met by its spelling variant', () => {
    // JOB002's must-have is "Python or Go"; the source lists Go as Golang and the person has only Go.
    const a = oneJob({ job_id: 'JOB002', seniority: 'Mid-Senior', required_skills: 'Golang;Kafka' }, att, { top_skills: 'Go;Kafka' })
      .candidates[0]!;
    expect(a.missingEssentials).toEqual([]);
    expect(a.recommendation).toBe('shortlist');
  });
});

// A strong synthetic person and a one-job pool, so only the job's seniority decides the outcome.
const att = {
  hubspot_id: 'LK1',
  full_name: 'Lookup Person',
  email: 'lookup@example.test',
  conference_name: 'Review',
  conference_domain: 'Software',
  conference_date: '2026-10-19',
  linkedin_url: 'linkedin.com/in/lookup-person',
};
const prof = {
  linkedin_url: att.linkedin_url,
  full_name: att.full_name,
  current_title: 'Engineer',
  current_company: 'Review Company',
  years_experience: '12',
  top_skills: 'Go',
  industry: 'Software',
  wsc_mutual_connections: '',
};
function oneJob(
  job: Partial<Record<'job_id' | 'seniority' | 'required_skills' | 'nice_to_have', string>>,
  attendee = att,
  profile: Partial<typeof prof> = {},
) {
  const p = { ...prof, ...profile };
  const row = { job_id: 'JOB900', title: 'Generic Engineer', department: 'Engineering', key_domains: '', seniority: 'Mid', required_skills: 'Go', nice_to_have: '', ...job };
  return assessJob(
    buildDataset({
      attendees: toCsv(Object.keys(attendee), [attendee]),
      profiles: toCsv(Object.keys(p), [p]),
      employees: sources.employees,
      jobs: toCsv(Object.keys(row), [row]),
    }),
    row.job_id,
  );
}

describe('F6: object property names are not a seniority', () => {
  it('Mid is a known level and shortlists the strong person (control)', () => {
    expect(oneJob({}).candidates[0]!.recommendation).toBe('shortlist');
  });

  for (const seniority of ['Staff', ...OBJECT_NAMES]) {
    it(`"${seniority}" has no known minimum: review, never shortlist, with the unknown-seniority warning`, () => {
      expect(minYearsFor({ seniority } as Job)).toBeNull();
      const a = oneJob({ seniority }).candidates[0]!;
      expect(a.recommendation).toBe('needs_review');
      expect(a.dataQualityFlags.join(' ')).toContain('not a supported level');
    });
  }
});

describe('free-text names that are object properties never crash', () => {
  for (const name of OBJECT_NAMES) {
    it(`"${name}" as a skill uses the exact-name fallback`, () => {
      expect(matchSkill([name], name)).toEqual({ match: 'named', evidence: name });
      expect(matchSkill(['Go'], name)).toEqual({ match: 'none', evidence: null });
      const required = oneJob({ required_skills: name }).candidates[0]!;
      expect(required.recommendation).toBe('not_recommended_for_role');
      expect(() => oneJob({ required_skills: `Go;${name}`, nice_to_have: name })).not.toThrow();
      expect(() => roleResult(name, name)).not.toThrow();
    });

    it(`"${name}" as a conference domain, job ID or conference name is unknown, not configured`, () => {
      const event = assessEvent(
        { conferenceName: 'X', conferenceDomain: name, conferenceDate: '2026-10-19' } as never,
        { skills: ['Go'], industry: '' } as never,
      );
      expect(event.relevance).toBe('unknown');
      expect(policyFor({ jobId: name, requiredSkills: ['Go'] } as Job).isDefault).toBe(true);
      expect(() => oneJob({}, { ...att, conference_domain: name })).not.toThrow();
      expect(conferenceShort(name)).toBe(name);
      expect(comeetFor(name)).toEqual([]);
      const line = overviewFor({
        attendances: [{ conferenceName: name, conferenceDate: '2026-10-19', notes: 'Met at the booth' }],
        sourceContactIds: [name],
      } as never);
      expect(line?.by).toBeUndefined();
      expect(overviewFor({ attendances: [], sourceContactIds: [name] } as never)).toBeNull();
    });
  }
});

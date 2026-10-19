/**
 * F7: an accepted alias ("Golang" for Go) is the same requirement in any order, and scores exactly like the skill.
 * F6 and free-text skills: names that happen to be JavaScript object properties ("constructor", "__proto__") are
 * ordinary unknown text, never configured policy, and never crash.
 */
import { describe, expect, it } from 'vitest';
import { loadSources } from '../cli/load-sources';
import { addRole } from '../integration-demo/sources';
import { assessEvent, buildDataset, matchSkill, minYearsFor, policyFor, toCsv, type Job, type JobAssessment } from '../pipeline';
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

describe('F7: alias order never changes the decision', () => {
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

  it('another alias pair: Computer Vision and OpenCV, in both orders, score exactly like Computer Vision alone', () => {
    const base = decisions(roleResult('Python, Computer Vision'));
    expect(decisions(roleResult('Python, Computer Vision, OpenCV'))).toEqual(base);
    expect(decisions(roleResult('Python, OpenCV, Computer Vision'))).toEqual(base);
    expect(decisions(roleResult('OpenCV, Python'))).toEqual(base);
  });

  it('REST API and REST APIs are one skill in either order', () => {
    const base = decisions(roleResult('REST APIs, Kafka'));
    expect(decisions(roleResult('REST API, Kafka'))).toEqual(base);
    expect(decisions(roleResult('REST API, REST APIs, Kafka'))).toEqual(base);
  });

  it('nice-to-have aliases count the same in either order', () => {
    const base = decisions(roleResult('Python', 'Go'));
    expect(decisions(roleResult('Python', 'Golang'))).toEqual(base);
    expect(decisions(roleResult('Python', 'Golang, Go'))).toEqual(base);
    expect(base.people.some((p) => p.tally.niceToHave === 1)).toBe(true);
  });

  it('an alias matches the skill and its other names; related evidence keeps its level', () => {
    expect(matchSkill(['Go'], 'Golang')).toEqual({ match: 'named', evidence: 'Go' });
    expect(matchSkill(['golang'], 'Go')).toEqual({ match: 'named', evidence: 'golang' });
    expect(matchSkill(['Computer Vision'], 'OpenCV').match).toBe('named');
    expect(matchSkill(['Pose Estimation'], 'OpenCV').match).toBe('equivalent');
    expect(matchSkill(['Pose Estimation'], 'Computer Vision').match).toBe('equivalent');
    // F8: a configured skill still matches its own name first.
    expect(matchSkill(['OTT Platforms'], 'OTT platforms').match).toBe('named');
  });

  it('a name listed under two different skills is not an alias of either', () => {
    // Football Analytics counts as Sports Analytics and as Sports domain knowledge, so requiring it means itself.
    expect(matchSkill(['Performance Analytics'], 'Football Analytics').match).toBe('none');
    expect(matchSkill(['Football Analytics'], 'Football Analytics').match).toBe('named');
    expect(roleResult('Sports Analytics, Football Analytics').job.requiredSkills).toEqual(['Sports Analytics', 'Football Analytics']);
    expect(roleResult('Football Analytics, Sports Analytics').job.requiredSkills).toEqual(['Football Analytics', 'Sports Analytics']);
  });

  it('a supplied policy must-have is met by its alias spelling', () => {
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

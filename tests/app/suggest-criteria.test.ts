/** The scripted "AI" criteria step of New position: deterministic extraction from the description plus a fixture. */
import { describe, expect, it } from 'vitest';
import { EXAMPLE_POSITION } from '../../integration-demo/NewPositionDialog';
import { addRole } from '../../integration-demo/sources';
import { editRow, skillsIn, suggestCriteria, type CriteriaList, type CriteriaRow } from '../../integration-demo/suggestCriteria';
import { assessJob, buildDataset } from '../../pipeline';
import { loadSources } from '../../cli/load-sources';
import { DATA_DIR } from '../helpers';
import { EDITED_SRE_COUNTS, SRE_DESCRIPTION, SRE_TITLE } from '../role-examples';

const skills = (rows: CriteriaRow[], list: CriteriaList) => rows.filter((r) => r.list === list).map((r) => r.skill);
const joined = (rows: CriteriaRow[], list: CriteriaList) => skills(rows, list).join('; ');

describe('suggestCriteria', () => {
  it('sorts each named skill into a list by the wording of its sentence, quoting the sentence', () => {
    const rows = suggestCriteria('Data Engineer', [
      'You will build pipelines with Spark and Airflow.',
      'Python is a must.',
      'Experience with SQL and dbt is required.',
      'Kafka is a plus.',
    ].join(' '));
    expect(skills(rows, 'core')).toEqual(['Spark', 'Airflow']);
    expect(skills(rows, 'mustHave')).toEqual(['Python']);
    expect(skills(rows, 'required')).toEqual(['SQL', 'dbt']);
    expect(skills(rows, 'niceToHave')).toEqual(['Kafka']);
    expect(rows.find((r) => r.skill === 'dbt')).toMatchObject({ origin: 'description', quote: 'Experience with SQL and dbt is required.' });
  });

  it('is deterministic and ignores text it does not recognise', () => {
    const text = 'We value curiosity. Teamwork matters.';
    expect(suggestCriteria('Analyst', text)).toEqual([]);
    expect(suggestCriteria(SRE_TITLE, SRE_DESCRIPTION)).toEqual(suggestCriteria(SRE_TITLE, SRE_DESCRIPTION));
  });

  it('matches short names by exact case and whole words, and a name inside a longer one once', () => {
    expect(skillsIn('We go live with Go and AWS, not aws-cli magic or Django.')).toEqual(['Go', 'AWS']);
    expect(skillsIn('Strong Sports Analytics and REST APIs.')).toEqual(['Sports Analytics', 'REST APIs']);
    expect(skillsIn('Real-time processing of video streaming')).toEqual(['Real-time processing', 'Video streaming']);
  });

  it('reads a list subject ("X and Y are a plus", "X, Y and Z are required") item by item, known names or not', () => {
    const rows = suggestCriteria('Platform Engineer', [
      'Prometheus and Go are a plus.',
      'Grafana, Datadog and Kubernetes are required.',
      'Linux and AWS are a must.',
    ].join(' '));
    expect(skills(rows, 'niceToHave')).toEqual(['Prometheus', 'Go']);
    expect(skills(rows, 'required')).toEqual(['Grafana', 'Datadog', 'Kubernetes']);
    expect(skills(rows, 'mustHave')).toEqual(['Linux', 'AWS']);
    expect(rows.find((r) => r.skill === 'Prometheus')).toMatchObject({ origin: 'description', quote: 'Prometheus and Go are a plus.' });
    // Known names keep the vocabulary's spelling; a lone unknown word or a soft skill is not a tool.
    expect(skills(suggestCriteria('x', 'Python and computer vision are a must.'), 'mustHave')).toEqual(['Python', 'Computer Vision']);
    for (const text of ['Teamwork is essential.', 'Strong communication skills are a plus.', 'Curiosity and teamwork are a must.']) {
      expect(suggestCriteria('x', text)).toEqual([]);
    }
  });

  it('an edited suggestion becomes the recruiter\'s row: no source label, no quote', () => {
    const [row] = suggestCriteria('x', 'Kafka is a plus.');
    expect(row).toMatchObject({ origin: 'description', quote: 'Kafka is a plus.' });
    expect(editRow(row!, 'Kafka')).toBe(row);
    expect(editRow(row!, 'Kafka Streams')).toEqual({ ...row, skill: 'Kafka Streams', quote: '', origin: 'recruiter' });
  });

  it('skips the opening "we\'re hiring" line, which names the role rather than its requirements', () => {
    expect(suggestCriteria('x', "We're hiring a Computer Vision Engineer. Join our Python team.")).toEqual([]);
  });

  it('adds the example role\'s inferred rows as AI suggestions, each quoting a supporting sentence', () => {
    const rows = suggestCriteria(EXAMPLE_POSITION.title, EXAMPLE_POSITION.description);
    expect(joined(rows, 'core')).toBe('Computer Vision; Object Detection');
    expect(joined(rows, 'mustHave')).toBe('Python; Computer Vision');
    expect(joined(rows, 'required')).toBe('Python; Computer Vision; Object Detection; OpenCV');
    expect(joined(rows, 'niceToHave')).toBe('PyTorch; Real-time processing; Pose Estimation');
    const ai = rows.filter((r) => r.origin === 'ai');
    expect(ai.map((r) => r.skill)).toEqual(['Pose Estimation']);
    expect(ai[0]!.quote).toContain('track players and the ball');
  });

  it('infers SRE criteria the description implies but does not list, and never repeats an explicit row', () => {
    const implied = 'Keep services available during live games and deploy safely many times a day. We run on AWS with Kubernetes and Terraform.';
    const rows = suggestCriteria('Senior Site Reliability Engineer', implied);
    expect(rows.filter((r) => r.origin === 'ai').map((r) => `${r.list}:${r.skill}`)).toEqual([
      'core:Kubernetes', 'core:Terraform', 'core:CI/CD', 'core:Monitoring', 'mustHave:AWS', 'niceToHave:Helm',
    ]);
    const explicit = suggestCriteria(SRE_TITLE, SRE_DESCRIPTION);
    expect(joined(explicit, 'core')).toBe('Kubernetes; Terraform; CI/CD; Monitoring');
    expect(explicit.filter((r) => r.list === 'core').every((r) => r.origin === 'description')).toBe(true);
    // An AI row needs a sentence to stand on: no description, no suggestions.
    expect(suggestCriteria(SRE_TITLE, '')).toEqual([]);
  });
});

describe('confirmed criteria decide the new role (Fix 1 acceptance)', () => {
  const sources = loadSources(DATA_DIR);
  const publish = (title: string, description: string, change: (rows: CriteriaRow[]) => CriteriaRow[] = (r) => r) => {
    const rows = change(suggestCriteria(title, description));
    const { sources: next, jobId } = addRole(
      { title, department: '', seniority: 'Mid', keyDomains: '', coreSkills: joined(rows, 'core'), mustHaveSkills: joined(rows, 'mustHave'), requiredSkills: joined(rows, 'required'), niceToHave: joined(rows, 'niceToHave') },
      sources,
    );
    return assessJob(buildDataset(next), jobId);
  };
  const reviewReasons = (r: ReturnType<typeof publish>) => r.candidates.filter((c) => c.recommendation === 'needs_review').map((c) => c.outcomeReasons.join(' / '));
  /** A required-skills shortfall names the skills: the missing ones, or the likely ones to confirm. */
  const namesTheGap = (reason: string) => {
    for (const part of reason.split(' / ').filter((p) => p.includes('required skills on the profile'))) {
      expect(part).toMatch(/; missing [A-Z]|; \d+ more likely \(.+ for .+\), please confirm/);
    }
  };

  it('the prefilled Computer Vision example, confirmed as-is: a small review queue, each reason a concrete gap', () => {
    const result = publish(EXAMPLE_POSITION.title, EXAMPLE_POSITION.description);
    expect(result.counts).toEqual({ shortlist: 1, needs_review: 9, not_recommended_for_role: 65 });
    for (const reason of reviewReasons(result)) {
      expect(reason).toMatch(/required skills on the profile \(needs \d\)|Missing must-have: /);
      namesTheGap(reason);
    }
    expect(result.candidates.flatMap((c) => c.dataQualityFlags).join(' ')).not.toContain('provisional');
  });

  it('an unrelated role (Site Reliability Engineer) gets its own split', () => {
    const result = publish(SRE_TITLE, SRE_DESCRIPTION);
    expect(result.counts).toEqual({ shortlist: 9, needs_review: 4, not_recommended_for_role: 62 });
    for (const reason of reviewReasons(result)) {
      expect(reason).toMatch(/required skills on the profile \(needs \d\)|Missing must-have: /);
      namesTheGap(reason);
    }
  });

  it('the SRE example as the browser test edits it gives the counts that test expects in HubSpot', () => {
    const result = publish(SRE_TITLE, SRE_DESCRIPTION, (rows) =>
      rows
        .map((r) => (r.list === 'required' && r.skill === 'CI/CD' ? { ...r, skill: 'Docker' } : r))
        .filter((r) => !(r.list === 'niceToHave' && r.skill === 'Go')),
    );
    expect(result.counts).toEqual(EDITED_SRE_COUNTS);
  });
});

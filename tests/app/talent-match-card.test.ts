// @vitest-environment jsdom
/** The HubSpot card shows policy and data warnings, and "Unknown" for missing years. */
import { cleanup, render, screen, within } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSources } from '../../cli/load-sources';
import { buildAssessmentStore } from '../../integration-demo/assessments';
import { buildHandoff, recruiterFor } from '../../integration-demo/comeet';
import { addRole } from '../../integration-demo/sources';
import { SEEDED } from '../../view/activity';
import { TalentMatchCard } from '../../integration-demo/TalentMatchCard';
import { buildDataset } from '../../pipeline';
import { DATA_DIR } from '../helpers';

afterEach(cleanup);

describe('Talent match card', () => {
  it('surfaces an unresolved seniority and missing years instead of hiding them', () => {
    const base = loadSources(DATA_DIR);
    // A role whose seniority is not a supported level, and a person whose years are not on the profile.
    const jobs = base.jobs.replace('JOB004,Data Engineer,Data,Mid,', 'JOB004,Data Engineer,Data,Staff,');
    const profiles = base.profiles.replace(/^(linkedin\.com\/in\/ryan-patel[^,]*,(?:[^,]*,){4})\d+,/m, '$1,');
    expect(jobs).not.toBe(base.jobs);
    expect(profiles).not.toBe(base.profiles);
    const store = buildAssessmentStore(buildDataset({ ...base, jobs, profiles }));
    const a = store.result('JOB004').candidates.find((c) => c.candidate.fullName === 'Ryan Patel')!;
    expect(a.candidate.profile?.yearsExperience).toBeNull();
    const entry = store.get(a.candidate.candidateKey, 'JOB004')!;

    render(
      createElement(TalentMatchCard, {
        store,
        entry,
        jobId: 'JOB004',
        recruiter: 'Amit Sasson',
        onJobChange: () => {},
        comeetRecord: null,
        onHandoff: () => {},
        onOpenComeet: () => {},
      }),
    );
    expect(screen.getByTestId('tm-outcome').textContent).toBe('Needs review');
    expect(screen.getByText('Experience').nextElementSibling?.textContent).toBe('Unknown');
    expect(screen.getByTestId('tm-flags').textContent).toContain('Role seniority "Staff" is not a supported level');
    expect(document.body.textContent).not.toContain('null year');
  });

  it('switching back from a role that lists a skill twice shows only the current role\'s evidence', () => {
    const base = loadSources(DATA_DIR);
    // Role A never mentions AWS; role B lists it as required and as nice-to-have.
    const jobs =
      base.jobs.trimEnd() +
      '\nJOBA,Role A,Data,Mid,,"Python;SQL;Spark;Airflow;Kafka",' +
      '\nJOBB,Role B,Data,Mid,,"AWS","AWS;SageMaker"\n';
    const store = buildAssessmentStore(buildDataset({ ...base, jobs }));
    const key = store.result('JOBA').candidates.find((c) => c.candidate.fullName === 'Adaora Okafor')!.candidate.candidateKey;
    const props = (jobId: string) => ({
      store,
      entry: store.get(key, jobId)!,
      jobId,
      recruiter: recruiterFor(jobId),
      onJobChange: () => {},
      comeetRecord: null,
      onHandoff: () => {},
      onOpenComeet: () => {},
    });
    const evidence = () =>
      within(screen.getByText('Matched evidence').parentElement!)
        .queryAllByRole('term')
        .map((dt) => dt.textContent);

    const { rerender } = render(createElement(TalentMatchCard, props('JOBA')));
    expect(evidence()).toEqual(['Python']);
    rerender(createElement(TalentMatchCard, props('JOBB')));
    expect(evidence()).toEqual(['AWS', 'AWS']);
    rerender(createElement(TalentMatchCard, props('JOBA')));
    expect(evidence()).toEqual(['Python']);
  });

  it('shows a met must-have that is not a required skill under Matched evidence, and sends it as a tag', () => {
    const { sources: next, jobId } = addRole(
      { title: 'Site Reliability Engineer', department: 'Platform', seniority: 'Mid', keyDomains: '', requiredSkills: 'Kubernetes, Terraform, CI/CD', niceToHave: '', coreSkills: 'Kubernetes; Terraform', mustHaveSkills: 'AWS' },
      loadSources(DATA_DIR),
    );
    const store = buildAssessmentStore(buildDataset(next));
    const a = store.result(jobId).candidates.find((c) => c.candidate.fullName === 'Grace Wilson')!;
    render(
      createElement(TalentMatchCard, {
        store,
        entry: store.get(a.candidate.candidateKey, jobId)!,
        jobId,
        recruiter: 'Amit Sasson',
        onJobChange: () => {},
        comeetRecord: null,
        onHandoff: () => {},
        onOpenComeet: () => {},
      }),
    );
    const terms = within(screen.getByText('Matched evidence').parentElement!).queryAllByRole('term').map((dt) => dt.textContent);
    expect(terms[0]).toBe('AWS');
    expect(terms.filter((t) => t === 'AWS')).toHaveLength(1);
    const position = { uid: 'pos-sre', jobId, name: 'Site Reliability Engineer', recruiter: 'Amit Sasson' };
    const payload = buildHandoff(a, store.result(jobId).job, store.version, position, SEEDED);
    expect(payload.tags).toContain('AWS');
    expect(payload.customFields.evidence).toMatch(/^Must-have: AWS/);
  });
});

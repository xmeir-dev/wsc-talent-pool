// @vitest-environment jsdom
/** The HubSpot card shows policy and data warnings, and "Unknown" for missing years (F6). */
import { cleanup, render, screen } from '@testing-library/react';
import { createElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSources } from '../cli/load-sources';
import { buildAssessmentStore } from '../integration-demo/assessments';
import { TalentMatchCard } from '../integration-demo/TalentMatchCard';
import { buildDataset } from '../pipeline';
import { DATA_DIR } from './helpers';

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
});

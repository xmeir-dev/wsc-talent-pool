// @vitest-environment jsdom
/**
 * Recruiter per role (not the HubSpot contact owner), talent contacts kept apart from marketing, and a handed-off
 * person shown as a Sourced prospect in Comeet with every screen agreeing.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSources } from '../../cli/load-sources';
import { App } from '../../integration-demo/App';
import { buildAssessmentStore } from '../../integration-demo/assessments';
import {
  buildHandoff,
  createSimulatedComeet,
  DEFAULT_RECRUITER,
  RECRUITERS,
  recruiterFor,
  type ComeetPosition,
} from '../../integration-demo/comeet';
import { contactProperties, recordIdFor, splitLocation } from '../../integration-demo/contactProperties';
import { applyImport, previewImport } from '../../integration-demo/sources';
import { buildDataset } from '../../pipeline';
import { SEEDED } from '../../view/activity';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { byName, DATA_DIR, realDataset, ROOT } from '../helpers';

afterEach(cleanup);

const store = buildAssessmentStore(realDataset());
const person = (name: string) => byName(store.result('JOB001'), name).candidate;

describe('recruiterFor', () => {
  it('names each seeded position’s recruiter, by Comeet uid or job ID, with at least two different people', () => {
    expect(recruiterFor('POS-ML-001')).toBe('Neta Harel');
    expect(recruiterFor('JOB001')).toBe('Neta Harel');
    expect(recruiterFor('JOB002')).toBe('Gal Ofer');
    expect(recruiterFor('POS-DE-004')).toBe('Amit Sasson');
    expect(RECRUITERS.length).toBeGreaterThanOrEqual(2);
  });

  it('falls back to the signed-in user for a position with no recruiter', () => {
    expect(recruiterFor('JOB099')).toBe(DEFAULT_RECRUITER);
    const blank: ComeetPosition = { uid: 'POS-X', jobId: 'JOB050', name: 'X', recruiter: '' };
    expect(recruiterFor('POS-X', [blank])).toBe(DEFAULT_RECRUITER);
  });

  it('a new position gets the default recruiter or the one chosen for it', () => {
    const comeet = createSimulatedComeet({ isAvailable: () => true, delayMs: 0 });
    expect(comeet.addPosition('JOB005', 'Site Reliability Engineer').recruiter).toBe(DEFAULT_RECRUITER);
    expect(comeet.recruiterFor('JOB005')).toBe(DEFAULT_RECRUITER);
    comeet.addPosition('JOB006', 'Computer Vision Engineer', 'Ronit Sela');
    expect(comeet.recruiterFor('POS-JOB006')).toBe('Ronit Sela');
  });
});

describe('handoff ownership', () => {
  it('the Comeet record is a Sourced prospect owned by the role’s recruiter; the HubSpot contact owner is unchanged', async () => {
    const comeet = createSimulatedComeet({ isAvailable: () => true, delayMs: 0, people: store.dataset.candidates });
    const emily = byName(store.result('JOB001'), 'Emily Carter');
    const before = contactProperties(emily.candidate);
    expect(before.owner).toBe('Marketing · Noa Peretz');

    const payload = buildHandoff(emily, store.result('JOB001').job, store.version, comeet.positionFor('JOB001')!, SEEDED);
    expect(payload.owner).toBe('Neta Harel');
    const r = await comeet.handoff(payload);
    expect(r.kind).toBe('created');
    if (r.kind !== 'created') return;
    expect(r.candidate).toMatchObject({ kind: 'prospect', status: 'Sourced', stage: 'Sourced', owner: 'Neta Harel' });
    expect(r.candidate.nextStep).toBe('Neta reviews the fit and decides on outreach.');
    expect(contactProperties(emily.candidate)).toEqual(before);

    // A repeat handoff returns the same record: no duplicate.
    expect((await comeet.handoff(payload)).kind).toBe('existing');
    expect(comeet.list('POS-ML-001')).toHaveLength(1);
  });

  it('a new position’s handoff is owned by the signed-in user', async () => {
    const comeet = createSimulatedComeet({ isAvailable: () => true, delayMs: 0 });
    const position = comeet.addPosition('JOB001', 'Senior ML Engineer (copy)');
    const priya = byName(store.result('JOB001'), 'Priya Anand');
    const r = await comeet.handoff(buildHandoff(priya, store.result('JOB001').job, store.version, position, SEEDED));
    expect(r.kind === 'created' && [r.candidate.owner, r.candidate.nextStep]).toEqual([DEFAULT_RECRUITER, 'You review the fit and decide on outreach.']);
  });

  it('seeded records are owned by their position’s recruiter; an uncontacted lead is a prospect', () => {
    const comeet = createSimulatedComeet({ isAvailable: () => true, delayMs: 0, people: store.dataset.candidates });
    const de = comeet.list('POS-DE-004');
    expect(de.find((c) => c.firstName === 'Ryan')).toMatchObject({ kind: 'candidate', owner: 'Amit Sasson', status: 'In progress' });
    expect(de.find((c) => c.firstName === 'Ryan')!.nextStep).toBe('Amit is running the phone screen. Check with Amit before contacting Ryan.');
    expect(de.find((c) => c.firstName === 'Scarlett')).toMatchObject({ kind: 'prospect', owner: 'Amit Sasson', status: 'Sourced' });
  });
});

describe('talent contacts and marketing', () => {
  it('pool contacts are non-marketing talent leads that keep their lifecycle stage', () => {
    expect(contactProperties(person('Priya Anand'))).toMatchObject({
      owner: 'Unassigned',
      contactType: 'Talent lead',
      lifecycleStage: 'Lead',
      marketingStatus: 'Non-marketing contact',
    });
  });

  it('the seeded marketing-owned contact keeps marketing status and stage, and is both types', () => {
    expect(contactProperties(person('Emily Carter'))).toMatchObject({
      owner: 'Marketing · Noa Peretz',
      contactType: 'Customer contact · Talent lead',
      lifecycleStage: 'Customer',
      marketingStatus: 'Marketing contact',
    });
  });

  it('imported new contacts default to non-marketing and lifecycle Other; a merged repeat attendee keeps Lead', () => {
    const sources = loadSources(DATA_DIR);
    const sample = readFileSync(join(ROOT, 'integration-demo', 'public', 'sample-conference-import.csv'), 'utf8');
    const p = previewImport(sample, sources);
    if (!p.ok) throw new Error(p.problems.join('; '));
    const people = buildDataset(applyImport(p.rows, sources)).candidates;
    const of = (name: string) => contactProperties(people.find((c) => c.fullName === name)!);
    for (const name of ['Noa Barak', 'Omer Shani', 'Tamar Gold', 'Yossi Levin'])
      expect(of(name)).toMatchObject({ contactType: 'Talent lead', lifecycleStage: 'Other', marketingStatus: 'Non-marketing contact' });
    expect(of('James Thornton')).toMatchObject({ lifecycleStage: 'Lead', marketingStatus: 'Non-marketing contact' });
  });

  it('record ID, source ID, city and country', () => {
    expect(contactProperties(person('Priya Anand'))).toMatchObject({ recordId: '1002', sourceId: 'HS002' });
    expect(recordIdFor('HS068')).toBe('1068');
    expect(splitLocation('Tel Aviv IL')).toEqual({ city: 'Tel Aviv', country: 'Israel' });
    expect(splitLocation('Haifa IL')).toEqual({ city: 'Haifa', country: 'Israel' });
    expect(splitLocation('Chicago IL')).toEqual({ city: 'Chicago', country: 'United States' });
    expect(splitLocation('Austin TX')).toEqual({ city: 'Austin', country: 'United States' });
    expect(splitLocation('London UK')).toEqual({ city: 'London', country: 'United Kingdom' });
    expect(splitLocation('Toronto CA')).toEqual({ city: 'Toronto', country: 'Canada' });
    expect(splitLocation('Somewhere ZZ')).toEqual({ city: 'Somewhere ZZ', country: '' });
    expect(splitLocation('')).toEqual({ city: '', country: '' });
  });
});

describe('the demo app, end to end in one render', () => {
  it('handoff → Comeet Prospects tab with a Sourced record → HubSpot agrees, and the contact owner stays', async () => {
    const user = userEvent.setup();
    render(<App delayMs={0} />);
    await user.click(screen.getByRole('button', { name: 'Close notifications' }));
    await user.click(screen.getByRole('tab', { name: 'Senior ML Engineer' }));
    await user.click(screen.getByRole('button', { name: 'Needs review (6)' }));
    await user.click(screen.getByRole('button', { name: 'Emily Carter' }));

    const card = screen.getByRole('region', { name: 'Talent match' });
    expect(within(card).getByTestId('tm-recruiter').textContent).toBe('Recruiter for this role: Neta Harel');
    await user.selectOptions(within(card).getByRole('combobox', { name: 'Role' }), 'JOB002');
    expect(within(card).getByTestId('tm-recruiter').textContent).toBe('Recruiter for this role: Gal Ofer');
    await user.selectOptions(within(card).getByRole('combobox', { name: 'Role' }), 'JOB001');

    await user.click(within(card).getByRole('button', { name: 'Add to Comeet' }));
    const dialog = screen.getByRole('dialog', { name: 'Add Emily Carter to Comeet' });
    expect(within(dialog).getByTestId('handoff-owner').textContent).toBe('Neta Harel');
    await user.click(await within(dialog).findByRole('button', { name: 'Confirm' }));
    await within(dialog).findByText('Added to Senior ML Engineer as Sourced.');
    await user.click(within(dialog).getByRole('button', { name: 'Open in Comeet' }));

    const prospects = screen.getByRole('tab', { name: 'Prospects (1)' });
    expect(prospects.getAttribute('aria-selected')).toBe('true');
    const column = screen.getByRole('complementary', { name: 'Prospects' });
    expect(within(column).getByRole('heading').textContent).toBe('Prospects · Sourced (1)');
    expect(screen.getByTestId('cm-status').textContent).toBe('Sourced');
    const workflow = screen.getByRole('region', { name: 'Workflow' });
    expect(workflow.textContent).toContain('Sourced');
    expect(workflow.textContent).toContain('Neta reviews the fit and decides on outreach.');
    expect(workflow.textContent).not.toContain('Assign owner');
    expect(screen.getByRole('region', { name: 'Custom fields' }).textContent).toContain('OwnerNeta Harel');

    // The Candidates tab holds no one handed over from HubSpot.
    await user.click(screen.getByRole('tab', { name: 'Candidates' }));
    expect(screen.queryByRole('button', { name: /Emily Carter/ })).toBeNull();
    expect(screen.getByText('0 candidates')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'HubSpot' }));
    expect(screen.getByTestId('tm-comeet').textContent).toBe('In Comeet: Sourced');
    expect(screen.getByTestId('hs-comeet-status').textContent).toBe('Sourced');
    expect(screen.getByTestId('hs-owner').textContent).toBe('Marketing · Noa Peretz');
    expect(screen.getByTestId('hs-marketing').textContent).toBe('Marketing contact');
  });
});

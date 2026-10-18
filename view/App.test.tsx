// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadSources } from '../cli/load-sources';
import { assessmentToCsv, buildDataset } from '../pipeline';
import { FIXTURE_DIR } from '../tests/helpers';
import { App } from './App';
import { buildPool, filterAttendees } from './attendees';
import { bundledSources } from './data';
import { downloadFile } from './download';

vi.mock('./download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./download')>()),
  downloadFile: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.mocked(downloadFile).mockClear();
  window.history.replaceState(null, '', '/');
});

type User = ReturnType<typeof userEvent.setup>;
const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const heading = () => screen.getByRole('heading', { level: 1 }).textContent;

const trigger = (name: 'Conference' | 'Job') => screen.getByRole('button', { name: new RegExp(`^${name}`) });
const value = (name: 'Conference' | 'Job') => trigger(name).querySelector('.filter-value')!.textContent;
const menu = (name: string) => screen.queryByRole('dialog', { name });

/** Toggles chips in a filter menu, opening it first if needed, and leaves it open. */
async function toggle(user: User, name: 'Conference' | 'Job', ...chips: RegExp[]) {
  if (!menu(name)) await user.click(trigger(name));
  for (const chip of chips) await user.click(within(menu(name)!).getByRole('button', { name: chip }));
}

/** Toggles chips, then closes the menu with Escape. */
async function pick(user: User, name: 'Conference' | 'Job', ...chips: RegExp[]) {
  await toggle(user, name, ...chips);
  await user.keyboard('{Escape}');
  await waitFor(() => expect(menu(name)).toBeNull());
}

const pool = buildPool(buildDataset(bundledSources));

describe('recruiter view: list', () => {
  it('opens on every attendee, A–Z, with no top bar or view switcher', () => {
    render(<App />);
    expect(heading()).toBe('All 75 attendees');
    expect(rows()).toHaveLength(75);
    expect(rows()[0]!.textContent).toContain('Adaora Okafor');
    expect(trigger('Conference').textContent).toBe('ConferenceAll');
    expect(trigger('Job').textContent).toBe('JobAll');
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Role' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
  });

  it('shows the jobs each attendee is relevant for and nothing when none', () => {
    render(<App />);
    const adaora = screen.getByRole('row', { name: /Adaora Okafor/ });
    expect(adaora.querySelector('.jobs')?.textContent).toBe('Senior ML Engineer: Needs review');
    const noah = screen.getByRole('row', { name: /Noah Anderson/ });
    expect([...noah.querySelectorAll('.jobs .ml-status-pill')].map((p) => p.textContent)).toEqual([
      'Data Engineer: Shortlist',
      'Backend Engineer: Needs review',
    ]);
    expect(adaora.textContent).not.toContain('JOB001');
    expect(adaora.textContent).toContain('Data & AI Summit Europe');
    expect(adaora.textContent).toContain('21 Mar 2025');
    expect(screen.getByRole('row', { name: /Alexei Volkov/ }).querySelector('.jobs')).toBeNull();
  });

  it("shows the recruiter's note under a name, else a marked AI-written summary", () => {
    render(<App />);
    const adaora = screen.getByRole('row', { name: /Adaora Okafor/ });
    expect(adaora.querySelector('.overview-recruiter')?.textContent).toBe('Building video analytics platform for African leagues');
    const amara = screen.getByRole('row', { name: /Amara Diallo/ });
    expect(amara.querySelector('.overview-recruiter')).toBeNull();
    expect(amara.querySelector('.overview-ai')?.textContent).toContain('telecom network engineer');
    expect(within(amara).getByLabelText('AI-written')).toBeTruthy();
  });

  it('filters by several conferences; the menu stays open while chips toggle, and Clear resets it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await toggle(user, 'Conference', /^Data & AI Summit 12$/);
    expect(heading()).toBe('12 of 75 attendees');
    expect(rows()).toHaveLength(12);
    expect(value('Conference')).toBe('Data & AI Summit');

    await toggle(user, 'Conference', /^SportsTech/);
    const both = filterAttendees(pool, ['SportsTech Innovation Summit', 'Data & AI Summit Europe'], []).length;
    expect(both).toBeGreaterThan(40);
    expect(heading()).toBe(`${both} of 75 attendees`);
    expect(rows()).toHaveLength(both);
    // Chosen chips are pressed; the trigger names the first in list order, plus how many more.
    expect(value('Conference')).toBe('SportsTech +1');
    const chips = within(menu('Conference')!).getAllByRole('button', { pressed: true });
    expect(chips.map((c) => c.textContent)).toEqual(['SportsTech 40', 'Data & AI Summit 12']);

    await user.click(within(menu('Conference')!).getByRole('button', { name: 'Clear' }));
    expect(menu('Conference')).not.toBeNull();
    expect(heading()).toBe('All 75 attendees');
    expect(value('Conference')).toBe('All');
    expect(within(menu('Conference')!).queryAllByRole('button', { pressed: true })).toHaveLength(0);
  });

  it('Escape closes a filter menu and puts focus back on its trigger', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(trigger('Job'));
    expect(menu('Job')).not.toBeNull();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(menu('Job')).toBeNull());
    expect(document.activeElement).toBe(trigger('Job'));
  });

  it('one job shows its shortlist then needs review in rank order, with outcome pills and ties', async () => {
    const user = userEvent.setup();
    render(<App />);
    await pick(user, 'Job', /^Senior ML Engineer 12$/);
    expect(value('Job')).toBe('Senior ML Engineer');
    expect(heading()).toBe('12 of 75 attendees');
    expect(rows()).toHaveLength(12);
    expect(rows()[0]!.textContent).toContain('Priya Anand');
    expect(within(rows()[0]!).getByText('10')).toBeTruthy(); // Score column
    expect(rows().slice(0, 7).every((r) => r.textContent?.includes('Shortlist'))).toBe(true);
    expect(rows().slice(7).every((r) => r.textContent?.includes('Needs review'))).toBe(true);
    const ties = screen.getAllByText('tied');
    expect(ties[0]!.getAttribute('title')).toMatch(/tied with/);
    expect(screen.queryByText('Not recommended')).toBeNull();

    // Swap to another single job.
    await pick(user, 'Job', /^Senior ML Engineer/, /^Senior Product Manager/);
    expect(value('Job')).toBe('Senior PM - Sports Data');
    expect(heading()).toBe('5 of 75 attendees');
    expect(rows()).toHaveLength(5);
    expect(rows().every((r) => r.textContent?.includes('Needs review'))).toBe(true);
  });

  it('two jobs show the attendee list: anyone shortlist or needs review for either', async () => {
    const user = userEvent.setup();
    render(<App />);
    await pick(user, 'Job', /^Senior ML Engineer/, /^Data Engineer/);
    const union = filterAttendees(pool, [], ['JOB001', 'JOB004']);
    expect(union.length).toBeGreaterThan(12);
    expect(value('Job')).toBe('Senior ML Engineer +1');
    expect(heading()).toBe(`${union.length} of 75 attendees`);
    expect(rows()).toHaveLength(union.length);
    expect(rows().map((r) => r.querySelector('.name')!.textContent)).toEqual(union.map((p) => p.candidate.fullName));
    expect(screen.getByRole('table').closest('.attendees')).not.toBeNull();
  });

  it('combines conference and job, and says so when nobody matches', async () => {
    const user = userEvent.setup();
    render(<App />);
    await pick(user, 'Job', /^Senior ML Engineer/);
    await pick(user, 'Conference', /^Data & AI Summit/);
    expect(heading()).toBe('4 of 75 attendees');
    expect(rows()).toHaveLength(4);
    await pick(user, 'Conference', /^Data & AI Summit/, /^DevOps World/);
    expect(heading()).toBe('0 of 75 attendees');
    expect(screen.getByText('No one matches these filters.')).toBeTruthy();
    // The filters stay on screen so the recruiter can widen them.
    expect(trigger('Job')).toBeTruthy();
  });

  it('exports the job CSV for one job, else the attendees shown', async () => {
    const user = userEvent.setup();
    render(<App />);
    const lastExport = async () => {
      await user.click(screen.getByRole('button', { name: 'Export' }));
      return vi.mocked(downloadFile).mock.lastCall![0];
    };
    await pick(user, 'Job', /^Senior ML Engineer/);
    await pick(user, 'Conference', /^Data & AI Summit/);
    const one = await lastExport();
    expect(one.fileName).toBe('candidates_JOB001.csv');
    // The whole job, as the CLI writes it: the conference filter does not trim it.
    expect(one.text).toBe(assessmentToCsv(pool.results.get('JOB001')!));

    await pick(user, 'Job', /^Data Engineer/);
    const several = await lastExport();
    expect(several.fileName).toBe('attendees_data-ai-summit-europe_job001_job004.csv');
    expect(several.text.trim().split('\n')).toHaveLength(Number(heading()!.split(' ')[0]) + 1);
  });
});

describe('recruiter view: profile', () => {
  it('opens from the keyboard; Back and Escape return to the row with the filters kept', async () => {
    const user = userEvent.setup();
    render(<App />);
    await pick(user, 'Job', /^Senior ML Engineer/);
    const row = screen.getByRole('row', { name: /Chiara Russo/ });
    row.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Chiara Russo' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('combobox', { name: 'Assessed for' }).textContent).toMatch(/^JOB001 ·/);
    const main = screen.getByRole('main');
    expect(main.textContent).toContain('tied');
    expect(main.textContent).toContain('Required skills');
    expect(main.textContent).toContain('Nice to have');
    expect(main.textContent).toContain('years of experience');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
    expect(heading()).toBe('12 of 75 attendees');
    expect(value('Job')).toBe('Senior ML Engineer');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('row', { name: /Chiara Russo/ })));

    screen.getByRole('row', { name: /Chiara Russo/ }).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('heading', { level: 1, name: 'Chiara Russo' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
    expect(heading()).toBe('12 of 75 attendees');
  });

  it('with no job chosen, opens on the best job and can switch to any of the four', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(screen.getByRole('row', { name: /Alex Turner/ })).getByText('Alex Turner'));
    await screen.findByRole('heading', { level: 1, name: 'Alex Turner' });
    const picker = () => screen.getByRole('combobox', { name: 'Assessed for' });
    expect(picker().textContent).toMatch(/^JOB003 ·/);
    expect(screen.getByRole('main').textContent).toContain('Needs review');

    await user.click(picker());
    expect(screen.getAllByRole('option')).toHaveLength(4);
    // Escape closes the picker without leaving the profile.
    await user.keyboard('{Escape}');
    expect(screen.getByRole('heading', { level: 1, name: 'Alex Turner' })).toBeTruthy();

    await user.click(picker());
    await user.click(screen.getByRole('option', { name: /^JOB001 ·/ }));
    expect(picker().textContent).toMatch(/^JOB001 ·/);
    expect(screen.getByRole('main').textContent).toContain('Not recommended for this role');
  });

  it('with several jobs chosen, opens on the best of those jobs', async () => {
    const user = userEvent.setup();
    render(<App />);
    // Ingrid Svensson's best job overall is JOB004 (shortlist); among JOB001 and JOB002 it is JOB002 (needs review).
    await pick(user, 'Job', /^Senior ML Engineer/, /^Backend Engineer/);
    await user.click(within(screen.getByRole('row', { name: /Ingrid Svensson/ })).getByText('Ingrid Svensson'));
    await screen.findByRole('heading', { level: 1, name: 'Ingrid Svensson' });
    expect(screen.getByRole('combobox', { name: 'Assessed for' }).textContent).toMatch(/^JOB002 ·/);
  });

  it('labels missing information as unknown, not as a negative finding', async () => {
    const user = userEvent.setup();
    render(<App sources={loadSources(FIXTURE_DIR)} />);
    const mia = rows().find((r) => r.textContent?.includes('Mia Missing'))!;
    expect(mia.textContent).toContain('Unknown');
    await user.click(within(mia).getByText('Mia Missing'));
    await screen.findByRole('heading', { level: 1, name: 'Mia Missing' });
    const main = screen.getByRole('main');
    expect(main.textContent).toContain('Missing information is not a negative finding');
    expect(main.textContent).toContain('Unknown: no profile to read connections from');
  });

  it('shows an error state for invalid source data', () => {
    render(<App sources={{ ...bundledSources, jobs: 'job_id,title\nJOB001,Senior ML Engineer\n' }} />);
    expect(screen.getByRole('alert').textContent).toContain('The source data could not be read');
    expect(screen.queryByRole('table')).toBeNull();
  });
});

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
const heading = () => document.querySelector('.list-count')?.textContent;
/** Pagination shows 12 a page; tests that read the whole list put it on one page. */
const showAll = (user: User) => user.selectOptions(screen.getByRole('combobox', { name: 'Rows per page' }), '96');

const trigger = (name: 'Conference' | 'Job') =>
  within(document.querySelector<HTMLElement>('.filters')!).getByRole('button', { name: new RegExp(`^${name}`) });
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
  it('a row in the Conferences or Open jobs card toggles it in the table filter, several at once', async () => {
    const user = userEvent.setup();
    render(<App />);
    const card = (name: string) => within(screen.getByRole('region', { name }));
    await user.click(card('Conferences').getByRole('button', { name: /See all/ }));
    const devops = card('Conferences').getByRole('button', { name: /DevOps World 2025/ });
    await user.click(devops);
    expect(heading()).toBe('11 of 75 attendees');
    expect(value('Conference')).toBe('DevOps World');
    await user.click(card('Open jobs').getByRole('button', { name: /See all/ }));
    await user.click(card('Open jobs').getByRole('button', { name: /Data Engineer/ }));
    expect(value('Job')).toBe('Data Engineer');
    await user.click(card('Conferences').getByRole('button', { name: /Data & AI Summit/ }));
    expect(heading()).toBe('6 of 75 attendees');
    expect(devops.getAttribute('aria-pressed')).toBe('true');
    await user.click(devops);
    await user.click(card('Conferences').getByRole('button', { name: /Data & AI Summit/ }));
    expect(value('Conference')).toBe('All');
  });

  it('opens on every attendee, A–Z, with no top bar or view switcher', () => {
    render(<App />);
    expect(heading()).toBe('All 75 attendees');
    expect(rows()).toHaveLength(12);
    expect(rows()[0]!.textContent).toContain('Adaora Okafor');
    expect(trigger('Conference').textContent).toBe('ConferenceAll');
    expect(trigger('Job').textContent).toBe('JobAll');
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Role' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeTruthy();
  });

  it('Location puts WSC office countries first, most attendees first; the rest open behind "N more countries"', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(within(document.querySelector<HTMLElement>('.filters')!).getByRole('button', { name: /^Location/ }));
    const panel = menu('Location')!;
    const chips = () => within(panel).getAllByRole('button', { pressed: false }).map((b) => b.textContent);
    expect(chips()).toEqual(['United States 14', 'United Kingdom 12', 'Israel 3', 'Spain 3', 'South Korea 2', 'Australia 1']);
    await user.click(within(panel).getByRole('button', { name: /21 more countries/ }));
    expect(chips()).toHaveLength(27);
    await user.click(within(panel).getByRole('button', { name: /^Germany/ }));
    expect(heading()).toBe('5 of 75 attendees');
  });

  it('pages the list 12 at a time; a filter starts again at page 1', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.getByText('Page 1 of 7')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(screen.getByText('Page 2 of 7')).toBeTruthy();
    expect(rows()).toHaveLength(12);
    expect(rows()[0]!.textContent).not.toContain('Adaora Okafor');
    await pick(user, 'Conference', /^DevOps World/);
    expect(screen.getByText('Page 1 of 1')).toBeTruthy();
    expect(rows()).toHaveLength(11);
  });

  it('shows the jobs each attendee is relevant for and nothing when none', async () => {
    render(<App />);
    await showAll(userEvent.setup());
    const adaora = screen.getByRole('row', { name: /Adaora Okafor/ });
    expect(adaora.querySelector('.jobs')?.textContent).toBe('Senior ML Engineer: Needs review');
    expect([...adaora.querySelectorAll('.fit-check')].map((c) => c.classList.contains('is-ok'))).toEqual([false, true, true]);
    expect(within(adaora).getByRole('img', { name: /^Must-have skills: missing PyTorch/ })).toBeTruthy();
    const noah = screen.getByRole('row', { name: /Noah Anderson/ });
    expect([...noah.querySelectorAll('.jobs .fit')].map((p) => p.textContent)).toEqual([
      'Data Engineer: Shortlist',
      'Backend Engineer: Needs review',
    ]);
    expect(adaora.textContent).not.toContain('JOB001');
    expect(adaora.textContent).toContain('Data & AI Summit Europe');
    expect(adaora.textContent).toContain('21 Mar 2025');
    const alexei = screen.getByRole('row', { name: /Alexei Volkov/ });
    expect(alexei.querySelector('.jobs')).toBeNull();
    expect(alexei.querySelector('.empty-line')).not.toBeNull();
  });

  it("shows the recruiter's note under a name, else a marked AI-written summary", () => {
    render(<App />);
    const adaora = screen.getByRole('row', { name: /Adaora Okafor/ });
    expect(adaora.querySelector('.overview-recruiter')?.textContent).toBe('Building video analytics platform for African leagues');
    const amara = screen.getByRole('row', { name: /Amara Diallo/ });
    expect(amara.querySelector('.overview-recruiter')).toBeNull();
    expect(amara.querySelector('.overview-ai')?.textContent).toBe('Telecom network engineer for 4 years, previously at Sonatel, focused on MPLS and LTE.');
    expect(within(amara).getByLabelText('AI-written')).toBeTruthy();
  });

  it('filters by several conferences; the menu stays open while chips toggle, and Clear resets it', async () => {
    const user = userEvent.setup();
    render(<App />);
    await showAll(user);
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

  it('one job keeps the same columns, in the job rank order: shortlist, then needs review', async () => {
    const user = userEvent.setup();
    render(<App />);
    await pick(user, 'Job', /^Senior ML Engineer 12$/);
    expect(value('Job')).toBe('Senior ML Engineer');
    expect(heading()).toBe('12 of 75 attendees');
    expect(rows()).toHaveLength(12);
    expect(rows()[0]!.textContent).toContain('Priya Anand');
    expect(screen.queryByRole('columnheader', { name: /Score/ })).toBeNull();
    expect(screen.getByRole('columnheader', { name: /Relevant job/ })).toBeTruthy();
    const ml = (r: HTMLElement) => [...r.querySelectorAll('.jobs .fit')].find((p) => p.textContent?.startsWith('Senior ML Engineer'))!;
    expect(rows().slice(0, 6).every((r) => ml(r).textContent?.includes('Shortlist'))).toBe(true);
    expect(rows().slice(6).every((r) => ml(r).textContent?.includes('Needs review'))).toBe(true);

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
    await showAll(user);
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
      await user.click(screen.getByRole('button', { name: 'Download CSV' }));
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
    const main = screen.getByRole('main');
    expect(main.textContent).toContain('Career7 years');
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

  it('shows a card for every job they may fit, each with its checks and its skills', async () => {
    const user = userEvent.setup();
    render(<App />);
    // Ingrid Svensson: shortlisted for Data Engineer, needs review for Backend Engineer, not a fit for the other two.
    await showAll(user);
    await user.click(within(screen.getByRole('row', { name: /Ingrid Svensson/ })).getByText('Ingrid Svensson'));
    await screen.findByRole('heading', { level: 1, name: 'Ingrid Svensson' });
    const jobs = [...document.querySelectorAll('.d-job')].map((e) => e.textContent);
    expect(jobs).toEqual(['Data Engineer', 'Backend Engineer']);
    const cards = [...document.querySelectorAll('.d-job')].map((e) => e.closest('section')!);
    const chips = (card: Element) =>
      [...card.querySelectorAll('.d-chips .d-chip')].map((c) => `${c.textContent} ${c.className.replace('d-chip ', '')}`);
    expect(chips(cards[0]!)).toEqual([
      'Python is-has is-required',
      'Spark is-has is-required',
      'dbt is-has is-required',
      'SQL is-has is-required',
      'AWS is-missing is-required',
      'Airflow is-missing is-required',
      'Sports domain knowledge is-missing is-nice',
      'Kafka is-has is-nice',
      'Terraform is-missing is-nice',
    ]);
    expect(cards[1]!.textContent).toContain('Required skills2/6');
    expect(cards[1]!.textContent).toContain('ExperienceNeeds 45 years');
    // "Python or Go": Python meets it, so Go is not shown as a missing must-have.
    expect(screen.getByLabelText('Go: Required, missing')).toBeTruthy();
    expect(screen.getAllByLabelText('Python: Must-have, has it')).toHaveLength(2);
  });

  it("a job card's title opens the list filtered to that job", async () => {
    const user = userEvent.setup();
    render(<App />);
    await showAll(user);
    await user.click(within(screen.getByRole('row', { name: /Ingrid Svensson/ })).getByText('Ingrid Svensson'));
    await screen.findByRole('heading', { level: 1, name: 'Ingrid Svensson' });
    await user.click(screen.getByRole('button', { name: 'Backend Engineer: see all candidates' }));
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
    expect(value('Job')).toBe('Backend Engineer');
  });

  it('labels missing information as unknown, not as a negative finding', async () => {
    const user = userEvent.setup();
    render(<App sources={loadSources(FIXTURE_DIR)} />);
    await showAll(user);
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

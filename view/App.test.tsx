// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSources } from '../cli/load-sources';
import { FIXTURE_DIR } from '../tests/helpers';
import { App } from './App';
import { bundledSources } from './data';

afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

type User = ReturnType<typeof userEvent.setup>;
const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const heading = () => screen.getByRole('heading', { level: 1 }).textContent;

async function pick(user: User, name: string, option: RegExp | string) {
  await user.click(screen.getByRole('combobox', { name }));
  await user.click(screen.getByRole('option', { name: option }));
}

describe('recruiter view: list', () => {
  it('opens on every attendee, A–Z, with no top bar or view switcher', () => {
    render(<App />);
    expect(heading()).toBe('All 75 attendees');
    expect(rows()).toHaveLength(75);
    expect(rows()[0]!.textContent).toContain('Adaora Okafor');
    expect(screen.getByRole('combobox', { name: 'Conference' }).textContent).toBe('All conferences');
    expect(screen.getByRole('combobox', { name: 'Job' }).textContent).toBe('All jobs');
    expect(screen.queryByRole('tab')).toBeNull();
    expect(screen.queryByRole('combobox', { name: 'Role' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
  });

  it('shows the jobs each attendee is relevant for, and a dash when none', () => {
    render(<App />);
    const adaora = screen.getByRole('row', { name: /Adaora Okafor/ });
    expect(adaora.textContent).toContain('JOB001');
    expect(adaora.textContent).toContain('Senior ML Engineer: Needs review');
    expect(adaora.textContent).toContain('Data & AI Summit Europe');
    expect(adaora.textContent).toContain('21 Mar 2025');
    expect(screen.getByRole('row', { name: /Alexei Volkov/ }).textContent).toContain('—');
  });

  it('filters by conference', async () => {
    const user = userEvent.setup();
    render(<App />);
    await pick(user, 'Conference', 'Data & AI Summit Europe');
    expect(heading()).toBe('12 of 75 attendees');
    expect(rows()).toHaveLength(12);
    await pick(user, 'Conference', 'SportsTech Innovation Summit');
    expect(heading()).toBe('40 of 75 attendees');
    await pick(user, 'Conference', 'All conferences');
    expect(heading()).toBe('All 75 attendees');
  });

  it('a job shows its shortlist then needs review in rank order, with outcome pills and ties', async () => {
    const user = userEvent.setup();
    render(<App />);
    await pick(user, 'Job', /^JOB001 ·/);
    expect(heading()).toBe('12 of 75 attendees');
    expect(rows()).toHaveLength(12);
    expect(rows()[0]!.textContent).toContain('Priya Anand');
    expect(within(rows()[0]!).getByText('10')).toBeTruthy(); // Score column
    expect(rows().slice(0, 7).every((r) => r.textContent?.includes('Shortlist'))).toBe(true);
    expect(rows().slice(7).every((r) => r.textContent?.includes('Needs review'))).toBe(true);
    const ties = screen.getAllByText('tied');
    expect(ties[0]!.getAttribute('title')).toMatch(/tied with/);
    expect(screen.queryByText('Not recommended')).toBeNull();

    await pick(user, 'Job', /^JOB003 ·/);
    expect(heading()).toBe('5 of 75 attendees');
    expect(rows()).toHaveLength(5);
    expect(rows().every((r) => r.textContent?.includes('Needs review'))).toBe(true);
  });

  it('combines conference and job, and says so when nobody matches', async () => {
    const user = userEvent.setup();
    render(<App />);
    await pick(user, 'Job', /^JOB001 ·/);
    await pick(user, 'Conference', 'Data & AI Summit Europe');
    expect(heading()).toBe('4 of 75 attendees');
    expect(rows()).toHaveLength(4);
    await pick(user, 'Conference', 'DevOps World 2025');
    expect(heading()).toBe('0 of 75 attendees');
    expect(screen.getByText('No one matches these filters.')).toBeTruthy();
    // The filters stay on screen so the recruiter can widen them.
    expect(screen.getByRole('combobox', { name: 'Job' })).toBeTruthy();
  });
});

describe('recruiter view: profile', () => {
  it('opens from the keyboard; Back and Escape return to the row with the filters kept', async () => {
    const user = userEvent.setup();
    render(<App />);
    await pick(user, 'Job', /^JOB001 ·/);
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
    expect(screen.getByRole('combobox', { name: 'Job' }).textContent).toMatch(/^JOB001 ·/);
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

    await pick(user, 'Assessed for', /^JOB001 ·/);
    expect(picker().textContent).toMatch(/^JOB001 ·/);
    expect(screen.getByRole('main').textContent).toContain('Not recommended for this role');
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

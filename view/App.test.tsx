// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { loadSources } from '../cli/load-sources';
import { FIXTURE_DIR } from '../tests/helpers';
import { App } from './App';
import { bundledSources } from './data';

afterEach(cleanup);

const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1);
const roleSelect = () => screen.getByRole('combobox', { name: 'Role' });

async function pickRole(user: ReturnType<typeof userEvent.setup>, jobId: string) {
  await user.click(roleSelect());
  await user.click(screen.getByRole('option', { name: new RegExp(`^${jobId} ·`) }));
}

describe('recruiter view', () => {
  it('opens on the JOB001 shortlist in pipeline order, with tie labels', () => {
    render(<App />);
    expect(roleSelect().textContent).toMatch(/^JOB001 ·/);
    expect(rows()).toHaveLength(7);
    expect(rows()[0]!.textContent).toContain('Priya Anand');
    expect(within(rows()[0]!).getByText('10')).toBeTruthy(); // Score column
    const ties = screen.getAllByText('tied');
    expect(ties.length).toBeGreaterThan(0);
    expect(ties[0]!.getAttribute('title')).toMatch(/tied with/);
  });

  it('keeps not-recommended people reachable under All', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('tab', { name: /^All/ }));
    expect(rows()).toHaveLength(75);
    expect(screen.getAllByText('Not recommended').length).toBe(63);
  });

  it('shows a calm empty shortlist for JOB003 that leads to Needs review', async () => {
    const user = userEvent.setup();
    render(<App />);
    await pickRole(user, 'JOB003');
    expect(roleSelect().textContent).toMatch(/^JOB003 ·/);
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('No product management candidate lists Sports Analytics.')).toBeTruthy();
    expect(screen.getByText("5 are worth a recruiter's review.")).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Open Needs review' }));
    expect(rows()).toHaveLength(5);
  });

  it('opens a profile page from the keyboard; Back and Escape return to the row', async () => {
    const user = userEvent.setup();
    render(<App />);
    const row = screen.getByRole('row', { name: /Chiara Russo/ });
    row.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('heading', { level: 1, name: 'Chiara Russo' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    const main = screen.getByRole('main');
    expect(main.textContent).toContain('tied');
    expect(main.textContent).toContain('Required skills');
    expect(main.textContent).toContain('Nice to have');
    expect(main.textContent).toContain('years of experience');
    await user.click(screen.getByRole('button', { name: 'Back' }));
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('row', { name: /Chiara Russo/ })));

    screen.getByRole('row', { name: /Chiara Russo/ }).focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('heading', { level: 1, name: 'Chiara Russo' });
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.getByRole('table')).toBeTruthy());
  });

  it('labels missing information as unknown, not as a negative finding', async () => {
    const user = userEvent.setup();
    render(<App sources={loadSources(FIXTURE_DIR)} />);
    await user.click(screen.getByRole('tab', { name: /^All/ }));
    const mia = rows().find((r) => r.textContent?.includes('Mia Missing'))!;
    expect(mia.textContent).toContain('Unknown: no usable profile');
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

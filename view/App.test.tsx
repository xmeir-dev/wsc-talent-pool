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

describe('recruiter view', () => {
  it('opens on the JOB001 shortlist in pipeline order, with tie labels', () => {
    render(<App />);
    expect(screen.getByRole('combobox')).toHaveProperty('value', 'JOB001');
    expect(rows()).toHaveLength(6);
    expect(rows()[0]!.textContent).toContain('Priya Anand');
    const ties = screen.getAllByText('tied');
    expect(ties.length).toBeGreaterThan(0);
    expect(ties[0]!.getAttribute('title')).toMatch(/tied with/);
  });

  it('keeps not-recommended people reachable under All', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /^All/ }));
    expect(rows()).toHaveLength(75);
    expect(screen.getAllByText('Not recommended for this role').length).toBe(63);
  });

  it('shows a calm empty shortlist for JOB003 that leads to Needs review', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByRole('combobox'), 'JOB003');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText(/No one meets every shortlist condition/)).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Open Needs review' }));
    expect(rows()).toHaveLength(5);
  });

  it('opens and closes the detail from the keyboard, returning focus to the row', async () => {
    const user = userEvent.setup();
    render(<App />);
    const rowButton = screen.getByRole('button', { name: 'Chiara Russo' });
    rowButton.focus();
    await user.keyboard('{Enter}');
    const dialog = screen.getByRole('dialog', { name: 'Chiara Russo' });
    expect(document.activeElement).toBe(within(dialog).getByRole('heading', { name: 'Chiara Russo' }));
    expect(dialog.textContent).toContain('tied with Lucas Evans');
    expect(dialog.textContent).toContain('Possible references');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(rowButton));
  });

  it('closes the open detail when the role changes', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByText('Priya Anand'));
    expect(screen.getByRole('dialog')).toBeTruthy();
    await user.selectOptions(screen.getByRole('combobox'), 'JOB002');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('labels missing information as unknown, not as a negative finding', async () => {
    const user = userEvent.setup();
    render(<App sources={loadSources(FIXTURE_DIR)} />);
    await user.click(screen.getByRole('button', { name: /^All/ }));
    const ula = rows().find((r) => r.textContent?.includes('Mia Missing'))!;
    expect(ula.textContent).toContain('Unknown: no usable profile');
    await user.click(within(ula).getByRole('button', { name: 'Mia Missing' }));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Missing information is not a negative finding');
    expect(dialog.textContent).toContain('Unknown: no profile to read connections from');
  });

  it('shows an error state for invalid source data', () => {
    render(<App sources={{ ...bundledSources, jobs: 'job_id,title\nJOB001,Senior ML Engineer\n' }} />);
    expect(screen.getByRole('alert').textContent).toContain('The source data could not be read');
    expect(screen.queryByRole('table')).toBeNull();
  });
});

// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { referenceSummary, type Entry } from '../../view/activity';
import { resetActivity } from '../../view/actionStore';
import { App } from '../../view/App';

afterEach(async () => {
  cleanup();
  await resetActivity();
  window.history.replaceState(null, '', '/');
});

const ref = (id: string, state: 'prepared' | 'sent' | 'confirmed' | 'failed', at: string, supersedes?: string): Entry => ({
  id,
  at,
  supersedes,
  kind: 'reference',
  candidateKey: 'C-X',
  employeeId: 'E1',
  employeeName: 'Noa Shapiro',
  channel: 'copy',
  state,
  by: 'You',
  simulated: true,
});

describe('reference summary prefers the strongest state', () => {
  it('a confirmed request stays confirmed after a later copy', () => {
    const log = [ref('1', 'prepared', '2026-10-10T09:00:00Z'), ref('2', 'confirmed', '2026-10-11T09:00:00Z', '1'), ref('3', 'prepared', '2026-10-12T09:00:00Z')];
    expect(referenceSummary(log, 'C-X', 'E1')).toMatchObject({ id: '2', state: 'confirmed' });
  });
  it('without a send, the latest request shows', () => {
    const log = [ref('1', 'prepared', '2026-10-10T09:00:00Z'), ref('2', 'failed', '2026-10-11T09:00:00Z')];
    expect(referenceSummary(log, 'C-X', 'E1')?.id).toBe('2');
    expect(referenceSummary([], 'C-X', 'E1')).toBeUndefined();
  });
});

describe('profile: copying again after Mark sent', () => {
  it('keeps Noa confirmed, with no Mark sent and Slack still blocked', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => {} }, configurable: true });
    const user = userEvent.setup();
    render(<App />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Rows per page' }), '96');
    await user.click(within(screen.getByRole('row', { name: /Alex Turner/ })).getByText('Alex Turner'));
    await screen.findByRole('heading', { level: 1, name: 'Alex Turner' });
    const asked = () => document.querySelector('.d-asked')!.textContent;
    expect(asked()).toContain('Prepared');
    await user.click(screen.getByRole('button', { name: 'Mark sent' }));
    await waitFor(() => expect(asked()).toContain('Confirmed'));

    await user.click(screen.getByRole('button', { name: 'Ask Noa Shapiro about Alex Turner' }));
    const panel = await screen.findByRole('dialog', { name: 'Ask Noa Shapiro for a recommendation' });
    expect((within(panel).getByRole('button', { name: /Send in Slack/ }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(within(panel).getByRole('button', { name: 'Copy message' }));
    await user.click(within(panel).getByRole('button', { name: 'Close' }));

    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Ask Noa Shapiro for a recommendation' })).toBeNull());
    expect(asked()).toContain('Confirmed');
    expect(asked()).not.toContain('Prepared');
    expect(screen.queryByRole('button', { name: 'Mark sent' })).toBeNull();
    // The earlier confirmation is still in the history.
    const activity = document.querySelector('.d-activity')!.textContent;
    expect(activity).toContain('Asked Noa Shapiro for a reference');
    expect(activity).not.toContain('Prepared');

    await user.click(screen.getByRole('button', { name: 'Ask Noa Shapiro about Alex Turner' }));
    const again = await screen.findByRole('dialog', { name: 'Ask Noa Shapiro for a recommendation' });
    expect((within(again).getByRole('button', { name: /Send in Slack/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

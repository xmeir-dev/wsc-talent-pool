// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildDataset } from '../../pipeline';
import { AskConnection } from '../../view/AskConnection';
import { buildPool } from '../../view/attendees';
import { BulkActions } from '../../view/BulkActions';
import { bundledSources } from '../../view/data';
import { recordActions, resetActivity, type ActionRequest } from '../../view/actionStore';
import type { Entry } from '../../view/activity';

const REFUSED = 'Could not save. Nothing was recorded.';

// Every save fails: the messages must say so instead of reporting the planned actions as done.
vi.mock('../../view/actionStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../view/actionStore')>()),
  recordActions: vi.fn(async (requests: readonly ActionRequest[]) => requests.map(() => ({ ok: false as const, reason: REFUSED }))),
}));

const pool = buildPool(buildDataset(bundledSources));
const person = (name: string) => pool.attendees.find((p) => p.candidate.fullName === name)!;

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  vi.mocked(recordActions).mockClear();
  await resetActivity();
});

const bulkStatus = () => document.querySelector('.bulk-status')?.textContent ?? '';

describe('action feedback when only some requests are recorded', () => {
  it('bulk Slack counts the colleagues actually messaged and names the refusal', async () => {
    // Priya has two colleagues; the store refuses the first request and records the second.
    vi.mocked(recordActions).mockImplementationOnce(async (requests) =>
      requests.map((_, i) => (i === 0 ? { ok: false as const, reason: 'Already asked.' } : { ok: true as const, entry: {} as Entry })),
    );
    const user = userEvent.setup();
    const priya = person('Priya Anand');
    expect(priya.connections).toHaveLength(2);
    render(<BulkActions selected={[priya]} jobs={pool.jobs} onClear={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Ask WSC connections' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send 2 in Slack' }));
    await waitFor(() => expect(bulkStatus()).toBe('Sent · Simulated: 1 Slack message, one per colleague. 1 not sent: Already asked.'));
  });
});

describe('action feedback when nothing is recorded', () => {
  it('bulk Slack says nothing was sent', async () => {
    const user = userEvent.setup();
    render(<BulkActions selected={[person('Noah Anderson')]} jobs={pool.jobs} onClear={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Ask WSC connections' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /^Send \d+ in Slack$/ }));
    expect(recordActions).toHaveBeenCalledOnce();
    await waitFor(() => expect(bulkStatus()).toBe(`Not sent: ${REFUSED}`));
    expect(bulkStatus()).not.toContain('Sent');
  });

  it('bulk Invite to jobs says nothing was sent', async () => {
    const user = userEvent.setup();
    render(<BulkActions selected={[person('Noah Anderson'), person('Priya Anand')]} jobs={pool.jobs} onClear={() => {}} />);
    await user.click(screen.getByRole('button', { name: 'Invite to jobs' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Send 2 invites' }));
    expect(recordActions).toHaveBeenCalledOnce();
    await waitFor(() => expect(bulkStatus()).toBe(`Not sent: ${REFUSED}`));
    expect(bulkStatus()).not.toContain('Sent');
  });

  async function openAsk() {
    const user = userEvent.setup();
    const noah = person('Noah Anderson');
    const colleague = noah.connections[0]!;
    render(<AskConnection employee={colleague.employee} refs={colleague.refs} ctx={{ candidate: noah.candidate, job: null }} />);
    await user.click(screen.getByRole('button', { name: /^Ask .+ about Noah Anderson$/ }));
    return user;
  }

  it('opening an email says the request was not recorded', async () => {
    const user = await openAsk();
    const email = screen.getByRole('button', { name: /^Email / });
    // jsdom cannot follow a mailto: link.
    email.addEventListener('click', (event) => event.preventDefault());
    await user.click(email);
    expect(recordActions).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(`Not recorded: ${REFUSED}`));
  });

  it('copying the message says the request was not recorded', async () => {
    const user = await openAsk();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    await user.click(screen.getByRole('button', { name: 'Copy message' }));
    expect(writeText).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe(`Not recorded: ${REFUSED}`));
    expect(screen.getByRole('status').textContent).not.toContain('Prepared');
  });
});

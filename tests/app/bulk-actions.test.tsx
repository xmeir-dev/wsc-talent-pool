// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { buildDataset } from '../../pipeline';
import { buildPool } from '../../view/attendees';
import { BulkActions } from '../../view/BulkActions';
import { bundledSources } from '../../view/data';
import { recordActions, resetActivity } from '../../view/actionStore';

const dataset = buildDataset(bundledSources);
const pool = buildPool(dataset);
const person = (name: string) => pool.attendees.find((p) => p.candidate.fullName === name)!;
const jobs = dataset.jobs;

afterEach(async () => {
  cleanup();
  await resetActivity();
});

async function open(label: 'Ask WSC connections' | 'Invite to jobs', names: string[]) {
  const user = userEvent.setup();
  render(<BulkActions selected={names.map(person)} jobs={jobs} onClear={() => {}} />);
  await user.click(screen.getByRole('button', { name: label }));
  return screen.getByRole('dialog');
}

describe('bulk Invite to jobs', () => {
  it('shows the same prior-contact warning as a single invite, against the person, and still invites them', async () => {
    const panel = await open('Invite to jobs', ['Noah Anderson', 'Priya Anand']);
    // Noah's seeded history: declined Backend Engineer on 8 Oct; his bulk invite is for Data Engineer.
    expect(within(panel).getByText('Noah Anderson: Declined Backend Engineer on 8 Oct.')).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Send 2 invites' })).toBeTruthy();
    expect(panel.textContent).not.toMatch(/blocked/);
  });

  it('warns about a past Comeet rejection for another role, with the same words as a single invite', async () => {
    const panel = await open('Invite to jobs', ['James Thornton', 'Priya Anand']);
    expect(within(panel).getByText('James Thornton: Rejected after technical interview for Computer Vision Engineer in Comeet · Jan 2024.')).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Send 2 invites' })).toBeTruthy();
  });

  it('keeps hard blocks as they are', async () => {
    const noah = person('Noah Anderson');
    const best = [...noah.relevantFor].sort((x, y) => (x.outcome === 'shortlist' ? 0 : 1) - (y.outcome === 'shortlist' ? 0 : 1))[0]!;
    await recordActions([{ kind: 'invite', person: noah.candidate, job: best.job, otherJobs: [], channel: 'comeet', state: 'sent' }]);
    const panel = await open('Invite to jobs', ['Noah Anderson', 'Priya Anand']);
    expect(within(panel).getByText('1 blocked:')).toBeTruthy();
    expect(within(panel).getByText(new RegExp(`^Noah Anderson: Already contacted for ${best.job.title}`))).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Send 1 invite' })).toBeTruthy();
  });
});

describe('bulk Ask WSC connections', () => {
  it('reports one Slack message per colleague actually recorded', async () => {
    const user = userEvent.setup();
    expect(person('Priya Anand').connections).toHaveLength(2);
    const panel = await open('Ask WSC connections', ['Priya Anand']);
    await user.click(within(panel).getByRole('button', { name: 'Send 2 in Slack' }));
    await waitFor(() =>
      expect(document.querySelector('.bulk-status')?.textContent).toBe('Sent · Simulated: 2 Slack messages, one per colleague.'),
    );
  });

  it('names a person whose requests were all sent, with the reason, and does not call them unconnected', async () => {
    const noah = person('Noah Anderson');
    const colleagues = noah.connections.map((c) => c.employee);
    expect(colleagues).toHaveLength(2);
    await recordActions(
      colleagues.map((e) => ({
        kind: 'reference' as const,
        person: noah.candidate,
        employeeId: e.employeeId,
        employeeName: e.fullName,
        channel: 'slack' as const,
        state: 'sent' as const,
      })),
    );
    const panel = await open('Ask WSC connections', ['Noah Anderson', 'Priya Anand']);
    expect(panel.textContent).not.toMatch(/no WSC connection/);
    expect(
      within(panel).getByText(`Noah Anderson: requests to ${colleagues[0]!.fullName} and ${colleagues[1]!.fullName} already sent`),
    ).toBeTruthy();
    // Priya's requests are still offered.
    expect(within(panel).getByRole('button', { name: /^Send \d+ in Slack$/ })).toBeTruthy();
    expect(panel.textContent).toContain('Priya Anand');
  });

  it('explains it when everyone selected was already asked', async () => {
    const noah = person('Noah Anderson');
    const colleagues = noah.connections.map((c) => c.employee);
    await recordActions(
      colleagues.map((e) => ({
        kind: 'reference' as const,
        person: noah.candidate,
        employeeId: e.employeeId,
        employeeName: e.fullName,
        channel: 'slack' as const,
        state: 'sent' as const,
      })),
    );
    const panel = await open('Ask WSC connections', ['Noah Anderson']);
    expect(within(panel).getByText(/^Noah Anderson: requests to .+ already sent$/)).toBeTruthy();
    expect(within(panel).queryByRole('button', { name: /in Slack/ })).toBeNull();
  });
});

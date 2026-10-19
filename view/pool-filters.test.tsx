// @vitest-environment jsdom
// Regressions for QA 2026-10-19 #003 (download scope) and #009 (hidden status filter).
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { assessmentToCsv, assessmentToXlsx, buildDataset, XLSX_MIME } from '../pipeline';
import { readXlsx } from '../tests/xlsx-read';
import { App } from './App';
import { buildPool } from './attendees';
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
type Filter = 'Conference' | 'Job' | 'Location' | 'Status';
const pool = buildPool(buildDataset(bundledSources));
const heading = () => document.querySelector('.list-count')!.textContent!;
const shownCount = () => (heading().startsWith('All') ? pool.attendees.length : Number(heading().split(' ')[0]));
const trigger = (name: Filter) =>
  within(document.querySelector<HTMLElement>('.filters')!).getByRole('button', { name: new RegExp(`^${name}`) });
const value = (name: Filter) => trigger(name).querySelector('.filter-value')!.textContent;
const menu = (name: string) => screen.queryByRole('dialog', { name });

async function pick(user: User, name: Filter, ...chips: RegExp[]) {
  if (!menu(name)) await user.click(trigger(name));
  for (const chip of chips) await user.click(within(menu(name)!).getByRole('button', { name: chip }));
  await user.keyboard('{Escape}');
  await waitFor(() => expect(menu(name)).toBeNull());
}

const download = () => screen.getByRole('button', { name: 'Download' });
const lastFile = () => vi.mocked(downloadFile).mock.lastCall![0];
/** People in a downloaded Excel file: its rows below the header. */
const xlsxRows = (data: string | Uint8Array) => readXlsx(data as Uint8Array).rows.length - 1;

describe('#009 status filter stays visible', () => {
  it('keeps a chosen status on the trigger and in the menu when the role has no one in it; Clear resets the label', async () => {
    const user = userEvent.setup();
    render(<App />);
    await pick(user, 'Status', /^Declined/);
    expect(value('Status')).toBe('Declined');
    await pick(user, 'Job', /^Senior ML Engineer/);
    expect(heading()).toBe('0 of 75 attendees');
    // Not "All" while a filter is hiding everyone.
    expect(value('Status')).toBe('Declined');
    await user.click(trigger('Status'));
    const declined = within(menu('Status')!).getByRole('button', { name: /^Declined/ });
    expect(declined.getAttribute('aria-pressed')).toBe('true');
    expect(declined.textContent).toBe('Declined 0');
    await user.click(within(menu('Status')!).getByRole('button', { name: 'Clear' }));
    expect(value('Status')).toBe('All');
    expect(heading()).toBe('12 of 75 attendees');
  });
});

describe('#003 download scope', () => {
  it('with no job chosen, downloads exactly the people shown (every filter, status included)', async () => {
    const user = userEvent.setup();
    render(<App />);
    await pick(user, 'Status', /^Declined/);
    await user.click(download());
    expect(screen.queryByRole('menu')).toBeNull();
    expect(lastFile().fileName).toMatch(/\.xlsx$/);
    expect(xlsxRows(lastFile().data)).toBe(shownCount());
  });

  it('with one job chosen, offers the people shown and the full assessment as Excel, and the exact CRM CSV, as named choices', async () => {
    const user = userEvent.setup();
    render(<App />);
    await pick(user, 'Job', /^Senior ML Engineer/);
    await pick(user, 'Conference', /^Data & AI Summit/);
    const shown = shownCount();
    const all = pool.results.get('JOB001')!;
    expect(shown).toBeLessThan(all.candidates.length);

    await user.click(download());
    const items = within(screen.getByRole('menu')).getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      `Attendees shown (${shown}), Excel`,
      `Full JOB001 assessment (${all.candidates.length}), Excel`,
      'CRM import CSV, full JOB001 assessment',
    ]);

    await user.click(items[0]!);
    expect(lastFile().fileName).toBe('attendees_data-ai-summit-europe_job001.xlsx');
    expect(lastFile().type).toBe(XLSX_MIME);
    expect(xlsxRows(lastFile().data)).toBe(shown);

    await user.click(download());
    await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /^Full JOB001/ }));
    expect(lastFile().fileName).toBe('candidates_JOB001.xlsx');
    expect(lastFile().data).toEqual(assessmentToXlsx(all));

    await user.click(download());
    await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /^CRM import CSV/ }));
    expect(lastFile().fileName).toBe('candidates_JOB001.csv');
    // Byte-identical to the CLI output.
    expect(lastFile().data).toBe(assessmentToCsv(all));
  });

  it('the shown download honours a status that empties the role', async () => {
    const user = userEvent.setup();
    render(<App />);
    await pick(user, 'Status', /^Declined/);
    await pick(user, 'Job', /^Senior ML Engineer/);
    await user.click(download());
    expect(within(screen.getByRole('menu')).getByRole('menuitem', { name: /^Attendees shown/ }).textContent).toBe(
      'Attendees shown (0), Excel',
    );
    await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: /^Attendees shown/ }));
    expect(xlsxRows(lastFile().data)).toBe(0);
  });
});

// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'wsc-activity-v1';
const good = {
  id: 'a-1',
  kind: 'reference',
  candidateKey: 'C-HS021',
  employeeId: 'WSC003',
  employeeName: 'Noa Shapiro',
  channel: 'copy',
  state: 'confirmed',
  simulated: true,
  by: 'You',
  at: '2026-10-18T10:00:00Z',
};

/** activity.ts reads storage once, when the module loads. */
async function loadWith(raw: string | null) {
  vi.resetModules();
  window.localStorage.clear();
  if (raw !== null) window.localStorage.setItem(KEY, raw);
  return import('./activity');
}

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe('saved activity that is valid JSON but the wrong shape', () => {
  it.each([['{}'], ['null'], ['42'], ['"text"'], ['[1, "x", null]'], ['[{"kind":"reference"}]']])('%s does not crash startup; seeded examples stay', async (raw) => {
    const m = await loadWith(raw);
    expect(m.loadedEntries()).toEqual(m.SEEDED);
    expect(m.historyUnreadable).toBe(true);
  });

  it('keeps the valid entries next to broken ones', async () => {
    const m = await loadWith(JSON.stringify([good, { kind: 'invite' }, 'junk']));
    expect(m.loadedEntries()).toEqual([...m.SEEDED, good]);
    expect(m.historyUnreadable).toBe(true);
  });

  it('keeps an unreadable copy so a later save does not erase it', async () => {
    const raw = JSON.stringify([good, { kind: 'invite' }]);
    const m = await loadWith(raw);
    m.record({ kind: 'do_not_contact', candidateKey: 'C-X' });
    expect(window.localStorage.getItem(`${KEY}-unreadable`)).toBe(raw);
    const saved = JSON.parse(window.localStorage.getItem(KEY)!);
    expect(saved).toHaveLength(2);
    expect(saved[0]).toEqual(good);
  });

  it('a valid history loads as before, with no notice', async () => {
    const m = await loadWith(JSON.stringify([good]));
    expect(m.loadedEntries()).toEqual([...m.SEEDED, good]);
    expect(m.historyUnreadable).toBe(false);
  });

  it('no saved history and unparseable JSON behave as before', async () => {
    expect((await loadWith(null)).historyUnreadable).toBe(false);
    const broken = await loadWith('{not json');
    expect(broken.loadedEntries()).toEqual(broken.SEEDED);
    expect(broken.historyUnreadable).toBe(true);
  });
});

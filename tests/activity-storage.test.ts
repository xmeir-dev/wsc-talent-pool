// @vitest-environment jsdom
/**
 * Upgrading saved history from the v1 localStorage list (F1/F2). jsdom has no IndexedDB, so this runs the
 * store's in-memory backend, which shares the migration and decision code with the IndexedDB one.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildDataset, type Candidate } from '../pipeline';
import { actionGate, heldFor } from '../view/activity';
import { bundledSources } from '../view/data';

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
const invite = (id: string, candidateKey: string, jobId = 'JOB001') => ({
  id,
  kind: 'invite',
  candidateKey,
  jobId,
  jobTitle: 'Senior ML Engineer',
  channel: 'comeet',
  state: 'sent',
  simulated: true,
  by: 'You',
  at: '2026-10-18T11:00:00Z',
});

/** The store reads the v1 list once, when it starts. */
async function loadWith(raw: string | null) {
  vi.resetModules();
  window.localStorage.clear();
  if (raw !== null) window.localStorage.setItem(KEY, raw);
  const m = await import('../view/actionStore');
  const s = await m.refreshActivity();
  return { m, s, seeded: (await import('../view/activity')).SEEDED };
}

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

const pool = buildDataset(bundledSources);
const someone = (name: string) => pool.candidates.find((c) => c.fullName === name)!;
/** An imported person the old app would have keyed C-HS076 (the next free HubSpot ID). */
const imported = (name: string, id: string): Candidate => ({ ...someone('Priya Anand'), candidateKey: id, fullName: name, sourceContactIds: ['HS076'] });

describe('saved v1 history that is valid JSON but the wrong shape', () => {
  it.each([['{}'], ['null'], ['42'], ['"text"'], ['[1, "x", null]'], ['[{"kind":"reference"}]']])('%s does not crash startup; seeded examples stay', async (raw) => {
    const { s, seeded } = await loadWith(raw);
    expect(s.entries).toEqual(seeded);
    expect(s.unreadable).toBe(true);
  });

  it('keeps the valid entries next to broken ones, and an untouched copy of the original', async () => {
    const raw = JSON.stringify([good, { kind: 'invite' }, 'junk']);
    const { s, seeded } = await loadWith(raw);
    expect(s.entries).toEqual([...seeded, expect.objectContaining(good)]);
    expect(s.unreadable).toBe(true);
    expect(window.localStorage.getItem(`${KEY}-unreadable`)).toBe(raw);
  });

  it('no saved history and unparseable JSON', async () => {
    expect((await loadWith(null)).s.unreadable).toBe(false);
    const broken = await loadWith('{not json');
    expect(broken.s.entries).toEqual(broken.seeded);
    expect(broken.s.unreadable).toBe(true);
  });
});

describe('migration: unambiguous owners move, ambiguous ones are held', () => {
  it("moves history under a supplied person's published ID as is, and leaves the v1 list in place", async () => {
    const raw = JSON.stringify([good]);
    const { s } = await loadWith(raw);
    expect(s.entries.filter((e) => e.id === 'a-1')).toEqual([expect.objectContaining(good)]);
    expect(s.held).toEqual([]);
    expect(window.localStorage.getItem(KEY)).toBe(raw);
  });

  it('holds history under a key two people could have had (C-HS076, a name slug) and blocks only them', async () => {
    const { s } = await loadWith(JSON.stringify([invite('a-2', 'C-HS076'), invite('a-3', 'C-alex-review')]));
    expect(s.entries.some((e) => e.id === 'a-2' || e.id === 'a-3')).toBe(false);
    expect(s.held.map((h) => h.legacyKey).sort()).toEqual(['C-HS076', 'C-alex-review']);
    const alex = imported('Alex Review', 'P-0000000000000001');
    expect(heldFor(s, alex).map((h) => h.legacyKey)).toEqual(['C-HS076']);
    expect(actionGate(s, alex)).toMatch(/earlier version may belong to this person/);
    // No source ID and the same name: the name-based key may be theirs too, so it is held for them as well.
    expect(heldFor(s, { ...alex, sourceContactIds: [] }).map((h) => h.legacyKey)).toEqual(['C-alex-review']);
    // Anyone it cannot belong to is unaffected.
    expect(actionGate(s, someone('Priya Anand'))).toBeUndefined();
  });

  it('a recruiter review settles it: "not theirs" unblocks them; "theirs" moves it into their history', async () => {
    const { m } = await loadWith(JSON.stringify([invite('a-2', 'C-HS076')]));
    const alex = imported('Alex Review', 'P-0000000000000001');
    const held = m.activitySnapshot().held[0]!;
    await m.reviewHeld(held.id, alex, false);
    expect(actionGate(m.activitySnapshot(), alex)).toBeUndefined();
    const bob = imported('Bob Review', 'P-0000000000000002');
    expect(actionGate(m.activitySnapshot(), bob)).toBeDefined();
    await m.reviewHeld(held.id, bob, true);
    const after = m.activitySnapshot();
    expect(after.entries.filter((e) => e.candidateKey === bob.candidateKey).map((e) => e.id)).toEqual(['a-2']);
    expect(actionGate(after, bob)).toBeUndefined();
  });

  it('keeps every duplicate send the old store allowed, but counts the invite once', async () => {
    const { m, s } = await loadWith(JSON.stringify([invite('a-4', 'C-HS001'), invite('a-5', 'C-HS001')]));
    expect(s.entries.filter((e) => e.candidateKey === 'C-HS001').map((e) => e.id)).toEqual(['a-4', 'a-5']);
    const james = someone('James Thornton');
    expect(james.candidateKey).toBe('C-HS001');
    const [r] = await m.recordActions([
      { kind: 'invite', person: james, job: { jobId: 'JOB001', title: 'Senior ML Engineer' }, otherJobs: [], channel: 'comeet', state: 'sent' },
    ]);
    expect(r).toMatchObject({ ok: false, reason: expect.stringMatching(/^Already contacted for Senior ML Engineer/) });
  });
});

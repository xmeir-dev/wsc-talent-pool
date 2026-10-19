/**
 * The import preview must report what the import actually does to the pool.
 * Synthetic fixtures only.
 */
import { describe, expect, it } from 'vitest';
import { assessJob, buildDataset, identityBlock, toCsv, type CsvRecord } from '../../pipeline';
import { loadSources } from '../../cli/load-sources';
import { applyImport, previewImport } from '../../integration-demo/sources';
import { importAttendeeList } from '../../view/importList';
import { FIXTURE_DIR, SYNTHETIC_ATTENDEE_COLUMNS, syntheticPerson, syntheticSources } from '../helpers';

const HEADER = 'full_name,email,company,title,conference_name,conference_date,linkedin_url,top_skills';
const sources = loadSources(FIXTURE_DIR);
const before = buildDataset(sources).candidates.length;

function run(...lines: string[]) {
  const p = previewImport([HEADER, ...lines].join('\n') + '\n', sources);
  if (!p.ok) throw new Error(p.problems.join('; '));
  const after = buildDataset(applyImport(p.rows, sources));
  return { p, after, added: after.candidates.length - before };
}

describe('preview agrees with the pool after import', () => {
  it('an existing email without a LinkedIn URL is the same person: an added event, not a new contact', () => {
    const { p, added } = run('Tia Tied,tia@leaguevision.test,LeagueVision,ML Engineer,QA Meetup,2026-10-17,,');
    expect(added).toBe(0);
    expect({ created: p.created, merged: p.merged }).toEqual({ created: 0, merged: 1 });
    expect(p.uncertain).toEqual([]);
  });

  it('two rows for one new person preview as one new contact', () => {
    const { p, added } = run(
      'Nia New,nia@new.test,NewCo,ML Engineer,QA Meetup,2026-10-17,linkedin.com/in/nia-new,Python',
      'Nia New,nia@new.test,NewCo,ML Engineer,QA Meetup 2,2026-10-18,linkedin.com/in/nia-new,Python',
    );
    expect(added).toBe(1);
    expect(p.created).toBe(1);
    expect(p.merged).toBe(1);
    expect(p.uncertain).toEqual([]);
  });

  it('a repeat attendee by LinkedIn URL is matched and adds no contact', () => {
    const { p, added } = run('Tia Tied,tia@leaguevision.test,LeagueVision,ML Engineer,QA Meetup,2026-10-17,linkedin.com/in/tia-tied,');
    expect(added).toBe(0);
    expect({ created: p.created, merged: p.merged }).toEqual({ created: 0, merged: 1 });
    expect(p.uncertain).toEqual([]);
  });

  it('a known LinkedIn URL under a different name is explained and held for review', () => {
    const { p, after, added } = run('Someone Different,different@example.test,ElseCo,Analyst,QA Meetup,2026-10-17,linkedin.com/in/tia-tied,');
    expect(added).toBe(0);
    expect(p.merged).toBe(1);
    expect(p.uncertain).toHaveLength(1);
    expect(p.uncertain[0]).toMatch(/Someone Different/);
    const held = assessJob(after, 'JOB001').candidates.find((c) => c.candidate.linkedinUrl === 'linkedin.com/in/tia-tied')!;
    expect(held.recommendation).toBe('needs_review');
  });
});

describe('a repeat import with new information is not a retry', () => {
  const alice = syntheticPerson('A-1', 'Alice');
  const before = syntheticSources([alice]);
  const importRow = (row: CsvRecord) => {
    const csv = toCsv(SYNTHETIC_ATTENDEE_COLUMNS, [row]);
    const imported = importAttendeeList(before, csv);
    if (!imported.ok) throw new Error(imported.problems.join('; '));
    const preview = previewImport(csv, before);
    if (!preview.ok) throw new Error(preview.problems.join('; '));
    return { imported, preview };
  };

  it('a changed name and new notes are kept and raise the same conflict as a direct build', () => {
    const changed = { ...alice, full_name: 'Bob', notes: 'New evidence that should be preserved' };
    const { imported, preview } = importRow(changed);
    expect({ added: imported.added, alreadyRecorded: imported.alreadyRecorded }).toEqual({ added: 1, alreadyRecorded: 0 });
    expect(imported.sources).not.toBe(before);
    const held = imported.dataset.candidates[0]!;
    expect(held.identity.status).toBe('conflict');
    expect(held.attendances[0]!.notes).toContain(changed.notes);
    expect(preview.rows).toHaveLength(1);
    expect(preview.alreadyRecorded).toBe(0);
    expect(preview.uncertain).toHaveLength(1);
    expect(preview.uncertain[0]).toMatch(/different name/);
    const direct = buildDataset({ ...before, attendees: toCsv(SYNTHETIC_ATTENDEE_COLUMNS, [alice, changed]) });
    expect(direct.candidates[0]!.identity.status).toBe('conflict');
    expect(direct.candidates[0]!.attendances[0]!.notes).toBe(held.attendances[0]!.notes);
  });

  it('the exact same row again is still a harmless retry', () => {
    const { imported, preview } = importRow(alice);
    expect({ added: imported.added, alreadyRecorded: imported.alreadyRecorded }).toEqual({ added: 0, alreadyRecorded: 1 });
    expect(imported.sources).toBe(before);
    expect({ rows: preview.rows.length, alreadyRecorded: preview.alreadyRecorded }).toEqual({ rows: 0, alreadyRecorded: 1 });
  });

  it('the same row with only a new note is kept and the identity stays resolved', () => {
    const { imported } = importRow({ ...alice, notes: 'Asked about open roles' });
    expect(imported.added).toBe(1);
    const c = imported.dataset.candidates[0]!;
    expect(c.identity.status).toBe('resolved');
    expect(c.attendances[0]!.notes).toContain('Asked about open roles');
  });

  it('a different source ID on an otherwise identical row is kept, so a shared ID is flagged on this route too', () => {
    // The pool has Alice (A-1) and Bob (Z-2); Alice's list arrives again with Bob's ID on her row.
    const pool = syntheticSources([alice, syntheticPerson('Z-2', 'Bob')]);
    const imported = importAttendeeList(pool, toCsv(SYNTHETIC_ATTENDEE_COLUMNS, [{ ...alice, hubspot_id: 'Z-2' }]));
    if (!imported.ok) throw new Error(imported.problems.join('; '));
    expect({ added: imported.added, alreadyRecorded: imported.alreadyRecorded }).toEqual({ added: 1, alreadyRecorded: 0 });
    expect(imported.dataset.candidates).toHaveLength(2);
    for (const c of imported.dataset.candidates) {
      expect(c.identity.status).toBe('possible_duplicate');
      expect(identityBlock(c.identity)).toBeDefined();
    }
  });
});

/**
 * F11: a conference name can have several editions. Person, edition and attendance (person + edition) are separate
 * identities: another edition imports, a later batch adds only new attendance, a retried file changes nothing.
 * Synthetic data only.
 */
import { describe, expect, it } from 'vitest';
import { loadSources } from '../cli/load-sources';
import { assessJob, assessmentToCsv, assignEditions, attendanceIdFor, buildDataset, parseCsv, toCsv, type SourceTexts } from '../pipeline';
import { applyImport, previewImport } from '../integration-demo/sources';
import { attendeesTable, buildPool, filterAttendees, filterCounts } from '../view/attendees';
import { importAttendeeList } from '../view/importList';
import { FIXTURE_DIR, realDataset } from './helpers';

const SUMMIT = 'SportsTech Innovation Summit';
const LIST = 'full_name,email,company,title,conference_name,conference_domain,conference_date,linkedin_url';
const row = (name: string, date: string, conf = SUMMIT) =>
  `${name},${name.toLowerCase().replace(/ /g, '.')}@example.test,Synth,Engineer,${conf},Sports Technology & Analytics,${date},linkedin.com/in/${name.toLowerCase().replace(/ /g, '-')}`;
const list = (...rows: string[]) => [LIST, ...rows].join('\n') + '\n';

/** Fixtures plus a 2024 edition of the summit, as in the supplied data. */
function base(): SourceTexts {
  const s = loadSources(FIXTURE_DIR);
  const r = importAttendeeList(s, list(row('Ana Early', '2024-11-14'), row('Ben Early', '2024-11-15')));
  if (!r.ok) throw new Error(r.problems.join('; '));
  return r.sources;
}

describe('edition keys', () => {
  it('a two-day run is one edition; next year is another; undated is its own; event IDs win', () => {
    const { keys, editions } = assignEditions([
      { conference_name: SUMMIT, conference_date: '2024-11-14' },
      { conference_name: SUMMIT, conference_date: '2024-11-15' },
      { conference_name: 'sportstech  INNOVATION summit', conference_date: '2026-11-14' },
      { conference_name: SUMMIT, conference_date: '' },
      { conference_name: 'Meetup', conference_date: '2026-01-10', event_id: 'M-1' },
      { conference_name: 'Meetup', conference_date: '2026-01-10', event_id: 'M-2' },
    ]);
    expect(keys.slice(0, 4)).toEqual([
      'event:sportstech innovation summit|2024-11-14',
      'event:sportstech innovation summit|2024-11-14',
      'event:sportstech innovation summit|2026-11-14',
      'event:sportstech innovation summit|undated',
    ]);
    expect(keys.slice(4)).toEqual(['id:M-1', 'id:M-2']);
    expect(editions.map((e) => e.label)).toEqual([
      'SportsTech Innovation Summit (2024)',
      'Meetup (2026-01-10, M-1)',
      'Meetup (2026-01-10, M-2)',
      // Each edition keeps its own spelling; the name is matched case- and space-insensitively.
      'sportstech  INNOVATION summit (2026)',
      'SportsTech Innovation Summit (date unknown)',
    ]);
    expect(editions[0]).toMatchObject({ startDate: '2024-11-14', endDate: '2024-11-15' });
  });

  it('the supplied data keeps its four conferences (multi-day events stay one edition each), labelled by name alone', () => {
    const d = realDataset();
    expect(d.editions.map((e) => e.label)).toEqual([
      SUMMIT,
      'Broadcast & Streaming Technology Expo',
      'Data & AI Summit Europe',
      'DevOps World 2025',
    ]);
    // An attendance is one person at one edition.
    for (const c of d.candidates)
      for (const a of c.attendances) expect(a.attendanceId).toBe(attendanceIdFor(c.candidateKey, `edition:${a.editionKey}`));
  });
});

describe('acceptance: SportsTech Innovation Summit 2024 and 2026-11-14, then a later 2026 batch', () => {
  it('both editions import and are separate filter choices with their own counts and labels', () => {
    const s = base();
    const r = importAttendeeList(s, list(row('Cara New', '2026-11-14'), row('Ana Early', '2026-11-14')));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.added).toBe(2);
    const pool = buildPool(r.dataset);
    const editions = pool.conferences.filter((c) => c.name === SUMMIT);
    expect(editions.map((c) => c.label)).toEqual([`${SUMMIT} (2024)`, `${SUMMIT} (2026)`]);
    const [y2024, y2026] = editions.map((c) => c.key);
    expect(r.editions).toEqual([y2026]);
    const counts = filterCounts(pool).conferences;
    // The fixtures already had 23 people at the 2024 summit; the two added here make 25.
    expect([counts.get(y2024!), counts.get(y2026!)]).toEqual([25, 2]);
    expect(filterAttendees(pool, [y2026!], []).map((p) => p.candidate.fullName).sort()).toEqual(['Ana Early', 'Cara New']);
    // Ana is one person who attended both editions, not a duplicate.
    const ana = r.dataset.candidates.filter((c) => c.fullName === 'Ana Early');
    expect(ana).toHaveLength(1);
    expect(ana[0]!.attendances.map((a) => a.editionLabel)).toEqual([`${SUMMIT} (2024)`, `${SUMMIT} (2026)`]);
    // The download names each edition, so the two runs stay apart there too.
    const ana2 = attendeesTable(filterAttendees(pool, [y2026!], []), [`${SUMMIT} (2026)`]);
    expect(ana2.baseName).toBe('attendees_sportstech-innovation-summit-2026');
    expect(ana2.rows.find((x) => x.full_name === 'Ana Early')!.conference_name).toBe(`${SUMMIT} (2024); ${SUMMIT} (2026)`);
  });

  it('a later batch adds only new attendance; the exact same file again changes nothing (recruiter view)', () => {
    const first = importAttendeeList(base(), list(row('Cara New', '2026-11-14')));
    if (!first.ok) throw new Error(first.problems.join('; '));
    const later = importAttendeeList(first.sources, list(row('Cara New', '2026-11-15'), row('Dev Later', '2026-11-15')));
    if (!later.ok) throw new Error(later.problems.join('; '));
    // Cara is already recorded for the 2026 edition (day two of the same run); Dev is new.
    expect({ added: later.added, alreadyRecorded: later.alreadyRecorded }).toEqual({ added: 1, alreadyRecorded: 1 });
    const cara = later.dataset.candidates.filter((c) => c.fullName === 'Cara New');
    expect(cara).toHaveLength(1);
    expect(cara[0]!.attendances).toHaveLength(1);

    const retry = importAttendeeList(later.sources, list(row('Cara New', '2026-11-15'), row('Dev Later', '2026-11-15')));
    expect(retry.ok && { added: retry.added, alreadyRecorded: retry.alreadyRecorded, same: retry.sources === later.sources }).toEqual({
      added: 0,
      alreadyRecorded: 2,
      same: true,
    });
  });

  it('the integration demo import does the same: new edition accepted, retry skipped, no duplicate person', () => {
    const s = base();
    const text = list(row('Cara New', '2026-11-14'), row('Ana Early', '2026-11-14'));
    const p = previewImport(text, s);
    if (!p.ok) throw new Error(p.problems.join('; '));
    expect({ created: p.created, merged: p.merged, alreadyRecorded: p.alreadyRecorded }).toEqual({ created: 1, merged: 1, alreadyRecorded: 0 });
    expect(p.conferences).toEqual([`${SUMMIT} (2026)`]);
    const after = applyImport(p.rows, s);
    const again = previewImport(text, after);
    expect(again.ok && { rows: again.rows.length, alreadyRecorded: again.alreadyRecorded }).toEqual({ rows: 0, alreadyRecorded: 2 });
    const d = buildDataset(after);
    expect(d.candidates.filter((c) => c.fullName === 'Ana Early')).toHaveLength(1);
    expect(d.editions.filter((e) => e.name === SUMMIT)).toHaveLength(2);
  });

  it('retry detection groups people exactly as the build does: an email-only attendee re-sent with a LinkedIn URL is already recorded', () => {
    const first = importAttendeeList(base(), list(row('Eli Email', '2026-11-14').replace(/linkedin\.com\/in\/eli-email$/, '')));
    if (!first.ok) throw new Error(first.problems.join('; '));
    const again = importAttendeeList(first.sources, list(row('Eli Email', '2026-11-14')));
    expect(again.ok && { added: again.added, alreadyRecorded: again.alreadyRecorded }).toEqual({ added: 0, alreadyRecorded: 1 });
  });

  it('an undated row is its own edition, never folded into a dated one, and says so', () => {
    const r = importAttendeeList(base(), list(row('Una Dated', '')));
    if (!r.ok) throw new Error(r.problems.join('; '));
    const una = r.dataset.candidates.find((c) => c.fullName === 'Una Dated')!;
    expect(una.attendances[0]!.editionLabel).toBe(`${SUMMIT} (date unknown)`);
    expect(r.dataset.warnings).toContain(`attendees: ${SUMMIT} (date unknown) has no date; kept as its own edition, not combined with any dated one`);
    const p = previewImport(list(row('Una Dated', '')), base());
    expect(p.ok && p.uncertain).toEqual([`Line 2: no conference date, so it is kept as a separate "date unknown" edition of ${SUMMIT}.`]);
  });
});

describe('attendance is person + edition, separate from person identity', () => {
  it('two source rows for one person at one edition are one attendance, flagged, notes kept', () => {
    const s = loadSources(FIXTURE_DIR);
    const a = parseCsv(s.attendees);
    const extra = (id: string, date: string, notes: string) => ({
      hubspot_id: id,
      full_name: 'Rae Twice',
      email: 'rae@example.test',
      conference_name: 'Twice Expo',
      conference_domain: 'Sports Technology',
      conference_date: date,
      notes,
      linkedin_url: 'linkedin.com/in/rae-twice',
    });
    const d = buildDataset({ ...s, attendees: toCsv(a.header, [...a.records, extra('HS801', '2026-02-01', 'Day one'), extra('HS802', '2026-02-02', 'Day two')]) });
    const rae = d.candidates.find((c) => c.fullName === 'Rae Twice')!;
    expect(rae.sourceContactIds).toEqual(['HS801', 'HS802']);
    expect(rae.attendances).toHaveLength(1);
    expect(rae.attendances[0]!.notes).toBe('Day one / Day two');
    expect(rae.dataQualityFlags).toContain('2 records for Twice Expo (HS801, HS802); combined into one attendance');
  });

  it('a supplied event ID decides the edition and is carried into the CRM row', () => {
    const s = loadSources(FIXTURE_DIR);
    const a = parseCsv(s.attendees);
    const rows = ['E-26A', 'E-26B'].map((id, i) => ({
      hubspot_id: `HS81${i}`,
      full_name: `Evan ${id}`,
      email: `evan${i}@example.test`,
      conference_name: 'Same Name Expo',
      conference_domain: 'Sports Technology',
      conference_date: '2026-02-01',
      linkedin_url: '',
      event_id: id,
    }));
    const d = buildDataset({ ...s, attendees: toCsv([...a.header, 'event_id'], [...a.records, ...rows]) });
    expect(d.editions.filter((e) => e.name === 'Same Name Expo').map((e) => e.key)).toEqual(['id:E-26A', 'id:E-26B']);
    const csv = parseCsv(assessmentToCsv(assessJob(d, d.jobs[0]!.jobId))).records;
    expect(csv.find((r) => r.full_name === 'Evan E-26A')!.event_assessments).toMatch(/; event E-26A$/);
  });
});

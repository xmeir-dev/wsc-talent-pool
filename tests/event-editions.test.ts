/**
 * A conference name can have several editions. Person, edition and attendance (person + edition) are separate
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
    // Cara's day two of the 2026 run is kept as a row (a new date) but stays one attendance; Dev is new.
    expect({ added: later.added, alreadyRecorded: later.alreadyRecorded }).toEqual({ added: 2, alreadyRecorded: 0 });
    const cara = later.dataset.candidates.filter((c) => c.fullName === 'Cara New');
    expect(cara).toHaveLength(1);
    expect(cara[0]!.attendances).toHaveLength(1);
    expect(later.dataset.editions.filter((e) => e.name === SUMMIT).map((e) => e.label)).toEqual([`${SUMMIT} (2024)`, `${SUMMIT} (2026)`]);

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

  it('retry detection groups people exactly as the build does: an email-only attendee re-sent with a LinkedIn URL is the same attendance, and the URL is kept', () => {
    const first = importAttendeeList(base(), list(row('Eli Email', '2026-11-14').replace(/linkedin\.com\/in\/eli-email$/, '')));
    if (!first.ok) throw new Error(first.problems.join('; '));
    const again = importAttendeeList(first.sources, list(row('Eli Email', '2026-11-14')));
    if (!again.ok) throw new Error(again.problems.join('; '));
    expect({ added: again.added, alreadyRecorded: again.alreadyRecorded }).toEqual({ added: 1, alreadyRecorded: 0 });
    const eli = again.dataset.candidates.filter((c) => c.fullName === 'Eli Email');
    expect(eli.map((c) => [c.linkedinUrl, c.attendances.length])).toEqual([['linkedin.com/in/eli-email', 1]]);
    const third = importAttendeeList(again.sources, list(row('Eli Email', '2026-11-14')));
    expect(third.ok && { added: third.added, alreadyRecorded: third.alreadyRecorded }).toEqual({ added: 0, alreadyRecorded: 1 });
  });

  it('Cara 11-14, Cara 11-17, Dev 11-20 in one file give the same editions in the preview, the pool and the CLI', () => {
    const file = list(row('Cara New', '2026-11-14'), row('Cara New', '2026-11-17'), row('Dev Later', '2026-11-20'));
    const s = base();
    const r = importAttendeeList(s, file);
    if (!r.ok) throw new Error(r.problems.join('; '));
    expect({ added: r.added, alreadyRecorded: r.alreadyRecorded }).toEqual({ added: 3, alreadyRecorded: 0 });
    const labels = (d: { editions: { name: string; label: string; startDate: string; endDate: string }[] }) =>
      d.editions.filter((e) => e.name === SUMMIT).map((e) => `${e.label} ${e.startDate}..${e.endDate}`);
    expect(labels(r.dataset)).toEqual([`${SUMMIT} (2024) 2024-11-14..2024-11-15`, `${SUMMIT} (2026) 2026-11-14..2026-11-20`]);
    // The CLI reads the same rows from data/: the same editions, and Cara's 11-17 row is still in the table.
    expect(labels(buildDataset(r.sources))).toEqual(labels(r.dataset));
    expect(parseCsv(r.sources.attendees).records.filter((x) => x.full_name === 'Cara New').map((x) => x.conference_date)).toEqual(['2026-11-14', '2026-11-17']);
    // The filter the import selects shows both people.
    const pool = buildPool(r.dataset);
    expect(filterAttendees(pool, r.editions, []).map((p) => p.candidate.fullName).sort()).toEqual(['Cara New', 'Dev Later']);
    // The demo's preview names the same single 2026 edition, and its pool matches.
    const p = previewImport(file, s);
    if (!p.ok) throw new Error(p.problems.join('; '));
    expect(p.conferences).toEqual([`${SUMMIT} (2026)`]);
    expect({ rows: p.rows.length, alreadyRecorded: p.alreadyRecorded }).toEqual({ rows: 3, alreadyRecorded: 0 });
    expect(labels(buildDataset(applyImport(p.rows, s)))).toEqual(labels(r.dataset));
    // And the exact file again is still harmless.
    const retry = importAttendeeList(r.sources, file);
    expect(retry.ok && { added: retry.added, same: retry.sources === r.sources }).toEqual({ added: 0, same: true });
  });

  it('a row with no email, LinkedIn URL or source ID is still recognised on an exact retry', () => {
    const file = 'full_name,email,company,title,conference_name,conference_domain,conference_date,notes,linkedin_url\nNo Ids,,Synth,Eng,NoId Meetup,Sports,2026-05-01,,\n';
    const first = importAttendeeList(base(), file);
    if (!first.ok) throw new Error(first.problems.join('; '));
    expect(first.added).toBe(1);
    const again = importAttendeeList(first.sources, file);
    expect(again.ok && { added: again.added, alreadyRecorded: again.alreadyRecorded, same: again.sources === first.sources }).toEqual({
      added: 0,
      alreadyRecorded: 1,
      same: true,
    });
    const person = first.dataset.candidates.filter((c) => c.fullName === 'No Ids');
    expect(person.map((c) => c.dataQualityFlags.filter((f) => f.startsWith('duplicate attendee row')))).toEqual([[]]);
  });

  it('warns when rows with and without an event ID look like one event split in two', () => {
    const s = loadSources(FIXTURE_DIR);
    const a = parseCsv(s.attendees);
    const rows = ['E-1', ''].map((id, i) => ({
      hubspot_id: `HS82${i}`,
      full_name: `Iris ${i}`,
      email: `iris${i}@example.test`,
      conference_name: 'Split Expo',
      conference_domain: 'Sports Technology',
      conference_date: '2026-03-01',
      linkedin_url: '',
      event_id: id,
    }));
    const d = buildDataset({ ...s, attendees: toCsv([...a.header, 'event_id'], [...a.records, ...rows]) });
    expect(d.editions.filter((e) => e.name === 'Split Expo')).toHaveLength(2);
    expect(d.warnings).toContainEqual(expect.stringMatching(/event_id E-1\) and Split Expo .* \(no event_id\) share a name and dates; kept apart/));
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

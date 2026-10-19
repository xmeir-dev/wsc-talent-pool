/**
 * F1: durable person IDs. A person keeps their ID whatever else is added or reordered; two people never
 * share one; a clash stops the build instead of joining one person to another's assessment.
 */
import { describe, expect, it } from 'vitest';
import { loadSources } from '../cli/load-sources';
import { buildDataset, DataValidationError, parseCsv, toCsv, type Dataset, type SourceTexts } from '../pipeline';
import { assertUnique, indexByPersonId, PERSON_ID_PATTERN, ATTENDANCE_ID_PATTERN } from '../pipeline/identity';
import { applyImport, previewImport } from '../integration-demo/sources';
import { buildPool } from '../view/attendees';
import { DATA_DIR, FIXTURE_DIR, realDataset } from './helpers';

type Row = Record<string, string>;
const base = () => loadSources(FIXTURE_DIR);

/** The fixture sources with extra attendee (and optional profile) rows. */
function withRows(sources: SourceTexts, attendees: Row[], profiles: Row[] = []): SourceTexts {
  const a = parseCsv(sources.attendees);
  const p = parseCsv(sources.profiles);
  return {
    ...sources,
    attendees: toCsv(a.header, [...a.records, ...attendees]),
    profiles: toCsv(p.header, [...p.records, ...profiles]),
  };
}
const person = (id: string, name: string, extra: Row = {}): Row => ({
  hubspot_id: id,
  full_name: name,
  email: `${name.toLowerCase()}@example.test`,
  conference_name: 'Identity Summit',
  conference_domain: 'Sports Technology',
  conference_date: '2026-03-01',
  linkedin_url: `linkedin.com/in/${name.toLowerCase()}-identity`,
  ...extra,
});
const profile = (name: string, skills: string): Row => ({
  linkedin_url: `linkedin.com/in/${name.toLowerCase()}-identity`,
  full_name: name,
  current_company: 'Synthetic Co',
  current_title: 'Engineer',
  years_experience: '6',
  top_skills: skills,
  industry: 'Sports Technology',
});
const byName = (d: Dataset, name: string) => {
  const found = d.candidates.filter((c) => c.fullName === name);
  expect(found).toHaveLength(1);
  return found[0]!;
};
const reversed = (s: SourceTexts): SourceTexts => {
  const a = parseCsv(s.attendees);
  return { ...s, attendees: toCsv(a.header, [...a.records].reverse()) };
};

describe('source IDs X, X and X-2 (acceptance case 1)', () => {
  const people = [person('X', 'Alice'), person('X', 'Bob'), person('X-2', 'Carol')];
  const profiles = [profile('Alice', 'Python'), profile('Bob', 'Go'), profile('Carol', 'Rust')];
  const sources = withRows(base(), people, profiles);

  it('gives three distinct durable IDs, unchanged when the input is reordered', () => {
    const first = buildDataset(sources);
    const second = buildDataset(reversed(sources));
    const ids = ['Alice', 'Bob', 'Carol'].map((n) => byName(first, n).candidateKey);
    expect(new Set(ids).size).toBe(3);
    for (const id of ids) expect(id).toMatch(PERSON_ID_PATTERN);
    expect(['Alice', 'Bob', 'Carol'].map((n) => byName(second, n).candidateKey)).toEqual(ids);
  });

  it('joins each person to their own assessment: Bob never receives Carol\'s', () => {
    for (const s of [sources, reversed(sources)]) {
      const pool = buildPool(buildDataset(s));
      for (const p of pool.attendees) expect(p.any.a.candidate).toBe(p.candidate);
      const bob = pool.attendees.find((p) => p.candidate.fullName === 'Bob')!;
      expect(bob.any.a.candidate.profile?.skills).toEqual(['Go']);
      for (const job of pool.jobs) expect(pool.items.get(job.jobId)!.get(bob.candidate.candidateKey)!.a.candidate.fullName).toBe('Bob');
    }
  });

  it('flags the shared source ID as a possible duplicate, never merges or renames', () => {
    const d = buildDataset(sources);
    const [alice, bob, carol] = ['Alice', 'Bob', 'Carol'].map((n) => byName(d, n));
    expect(alice!.identity.status).toBe('possible_duplicate');
    expect(alice!.identity.relatedPersonIds).toEqual([bob!.candidateKey]);
    expect(carol!.identity.status).toBe('resolved');
  });
});

describe('IDs survive new attendance, reordering and added evidence (acceptance case 2)', () => {
  const james = person('HS999', 'James');

  it('adding attendance HS1000 to a person known by HS999 keeps their ID and history owner', () => {
    const before = byName(buildDataset(withRows(base(), [james])), 'James');
    const after = byName(buildDataset(withRows(base(), [james, { ...james, hubspot_id: 'HS1000', conference_name: 'Next Summit' }])), 'James');
    expect(after.sourceContactIds).toEqual(['HS1000', 'HS999']);
    expect(after.candidateKey).toBe(before.candidateKey);
    // Each attendance has its own record ID, separate from the person's.
    expect(after.attendances.map((a) => a.attendanceId)).toHaveLength(2);
    for (const a of after.attendances) expect(a.attendanceId).toMatch(ATTENDANCE_ID_PATTERN);
    expect(after.attendances.find((a) => a.hubspotId === 'HS999')!.attendanceId).toBe(before.attendances[0]!.attendanceId);
  });

  it('adding a profile (enrichment) does not change the ID', () => {
    const without = byName(buildDataset(withRows(base(), [james])), 'James');
    const enriched = byName(buildDataset(withRows(base(), [james], [profile('James', 'Python')])), 'James');
    expect(enriched.profile).not.toBeNull();
    expect(enriched.candidateKey).toBe(without.candidateKey);
  });

  it('a person with only a source ID keeps it across reorder; a row with nothing is unanchored but stable', () => {
    const bare = { hubspot_id: '', full_name: 'Nobody Known', email: '', linkedin_url: '', conference_name: 'Identity Summit', conference_date: '2026-03-01' };
    const onlyId = { ...bare, hubspot_id: 'SRC-7', full_name: 'Only Id' };
    const s = withRows(base(), [bare, onlyId]);
    const a = buildDataset(s);
    const b = buildDataset(reversed(s));
    expect(byName(a, 'Nobody Known').identity.status).toBe('unanchored');
    expect(byName(a, 'Only Id').identity.kind).toBe('source_id');
    expect(byName(b, 'Nobody Known').candidateKey).toBe(byName(a, 'Nobody Known').candidateKey);
    expect(byName(b, 'Only Id').candidateKey).toBe(byName(a, 'Only Id').candidateKey);
  });
});

describe('imports without IDs, across reloads (acceptance case 2, import half)', () => {
  // The recruiter view keeps an added conference in memory: every reload starts again from the supplied files.
  const real = loadSources(DATA_DIR);
  const alex = (email: string): Row => ({ hubspot_id: '', full_name: 'Alex Review', email, conference_name: 'Review Event', conference_date: '2026-10-19', linkedin_url: '' });
  const importOnce = (row: Row) => buildDataset(withRows(real, [row])).candidates.find((c) => c.email === row.email)!;

  it('two different Alex Reviews (different emails) never share an ID, so never share saved history', () => {
    const a = importOnce(alex('person-a@example.test'));
    const b = importOnce(alex('person-b@example.test'));
    expect(a.candidateKey).not.toBe(b.candidateKey);
    expect(a.candidateKey).toMatch(/^P-[0-9a-f]{16}$/);
  });

  it('reimporting the same Alex gets the same ID (history reattaches) without a duplicate person', () => {
    const first = importOnce(alex('person-a@example.test'));
    expect(importOnce(alex('person-a@example.test')).candidateKey).toBe(first.candidateKey);
    // Same file twice in one session: one person with both rows, not two people.
    const twice = buildDataset(withRows(real, [alex('person-a@example.test'), { ...alex('person-a@example.test'), source: 'Retry' }]));
    expect(twice.candidates.filter((c) => c.fullName === 'Alex Review')).toHaveLength(1);
  });

  it('the integration demo import resolves the same person to the same ID after a reload', () => {
    const row = 'full_name,email,conference_name,conference_date\nAlex Review,person-a@example.test,Review Event,2026-10-19\n';
    const once = (sources: SourceTexts) => {
      const preview = previewImport(row, sources);
      if (!preview.ok) throw new Error(preview.problems.join(' '));
      return buildDataset(applyImport(preview.rows, sources)).candidates.find((c) => c.email === 'person-a@example.test')!.candidateKey;
    };
    expect(once(real)).toBe(once(real));
  });
});

describe('published IDs and validation', () => {
  it('keeps every supplied person on their published C-HS ID', () => {
    const d = realDataset();
    expect(d.candidates).toHaveLength(75);
    for (const c of d.candidates) {
      expect(c.candidateKey).toMatch(/^C-HS\d{3}$/);
      expect(c.candidateKey).toBe(`C-${c.sourceContactIds[0]}`);
      expect(c.identity.status).toBe('resolved');
    }
  });

  it('refuses duplicate IDs instead of keeping the last one', () => {
    expect(() => assertUnique(['P-1', 'P-2', 'P-1'], 'person IDs')).toThrow(DataValidationError);
    expect(() => indexByPersonId([{ id: 'a' }, { id: 'a' }], (x) => x.id)).toThrow(/same ID is used more than once: a/);
  });

  it('is deterministic: the same files give the same IDs in every build', () => {
    const s = withRows(base(), [person('X', 'Alice'), person('X', 'Bob')]);
    expect(buildDataset(s).candidates.map((c) => c.candidateKey)).toEqual(buildDataset(s).candidates.map((c) => c.candidateKey));
  });
});

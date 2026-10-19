/**
 * An identifier link (email or LinkedIn URL → person ID) accepted by an import is saved at
 * once, whether or not any action follows, so a later import after a reload still finds the person and their
 * history. Also: a source-ID-only person who later arrives with an email keeps their ID, and links that
 * contradict each other hold the person instead of minting a fresh, history-less ID.
 *
 * "Reload" here means: the imported rows are gone (back to the supplied files), the saved store remains.
 */
import { describe, expect, it } from 'vitest';
import { loadSources } from '../cli/load-sources';
import type { Candidate, SourceTexts } from '../pipeline';
import { toCsv } from '../pipeline';
import * as store from '../view/actionStore';
import { decide, type ActionRequest } from '../view/actionStore';
import { inviteCheck, knownPeople, SEEDED, type StoredPerson } from '../view/activity';
import { importAttendeeList } from '../view/importList';
import { DATA_DIR } from './helpers';

const supplied: SourceTexts = loadSources(DATA_DIR);
const ML = { jobId: 'JOB001', title: 'Senior ML Engineer' };
const NOW = Date.parse('2026-10-19T12:00:00Z');
let n = 0;
const newId = () => `links-${++n}`;

type Saved = Parameters<typeof decide>[0];
const empty = (): Saved => ({ entries: [], people: new Map(), held: [], seq: 0 });

/** What the app does after it builds a pool: keep the identity links the build accepted for people with history. */
function accept(saved: Saved, people: readonly Candidate[]): Saved {
  const changed = store.acceptIdentities(saved, people);
  return { ...saved, people: new Map([...saved.people, ...changed.map((p) => [p.personId, p] as const)]) };
}

/** A fresh page (supplied files only) importing one row, with whatever the store has saved. */
function importRow(saved: Saved, row: Record<string, string>): { saved: Saved; person: Candidate } {
  const r = importAttendeeList(supplied, toCsv(Object.keys(row), [row]), undefined, knownPeople(saved.people));
  if (!r.ok) throw new Error(r.problems.join('; '));
  // The person this row became (a supplied namesake is someone else unless the row's email is theirs too).
  const mine = (c: Candidate) => !row.email || c.identity.identifiers.includes(`email:${row.email}`);
  const person = r.dataset.candidates.find((c) => mine(c) && c.fullName === row.full_name) ?? r.dataset.candidates.find(mine);
  if (!person) throw new Error(`${row.full_name} not in the pool`);
  return { saved: accept(saved, r.dataset.candidates), person };
}

const invite = (person: Candidate): ActionRequest => ({ kind: 'invite', person, job: ML, otherJobs: [ML], channel: 'comeet', state: 'sent' });
function act(saved: Saved, person: Candidate) {
  const d = decide(saved, [invite(person)], NOW, newId);
  const next: Saved = {
    entries: [...saved.entries, ...d.entries],
    people: new Map([...saved.people, ...d.people.map((p) => [p.personId, p] as const)]),
    held: saved.held,
    seq: d.seq,
  };
  return { saved: next, result: d.results[0]! };
}
const gate = (saved: Saved, person: Candidate) => inviteCheck({ entries: [...SEEDED, ...saved.entries], people: saved.people, held: saved.held }, person, ML, [ML]);
const sentInvites = (saved: Saved) => saved.entries.filter((e) => e.kind === 'invite' && e.state === 'sent');

const bridge = (more: Record<string, string>) => ({
  full_name: 'Review Bridge',
  email: 'bridge@example.test',
  company: 'Acme',
  title: 'Data Engineer',
  conference_name: 'Independent Review',
  conference_date: '2026-10-19',
  linkedin_url: '',
  ...more,
});

describe('links learned by an import are kept without any action', () => {
  it('email → email + LinkedIn (no action) → LinkedIn + new email: the same person, history back, no second invite', () => {
    // 1. Email only; invited to JOB001.
    let s = empty();
    const first = importRow(s, bridge({}));
    const sent = act(first.saved, first.person);
    expect(sent.result.ok).toBe(true);
    s = sent.saved;

    // 2. Reload; same email plus a LinkedIn URL. History returns. No action is taken here.
    const second = importRow(s, bridge({ linkedin_url: 'linkedin.com/in/review-bridge' }));
    expect(second.person.candidateKey).toBe(first.person.candidateKey);
    expect(gate(second.saved, second.person).block).toMatch(/^Already contacted for /);
    s = second.saved;

    // 3. Reload; same LinkedIn URL, new email. Still the same person: history present, invite blocked.
    const third = importRow(s, bridge({ email: 'bridge.new@example.test', linkedin_url: 'linkedin.com/in/review-bridge' }));
    expect(third.person.candidateKey).toBe(first.person.candidateKey);
    expect(third.person.identity.status).toBe('resolved');
    expect(gate(third.saved, third.person).block).toMatch(/^Already contacted for /);
    const again = act(third.saved, third.person);
    expect(again.result.ok).toBe(false);
    expect(sentInvites(again.saved)).toHaveLength(1);
  });

  it('no link is saved for an imported newcomer without history, so their ID stays what the CLI gives', () => {
    const r = importRow(empty(), bridge({ linkedin_url: 'linkedin.com/in/review-bridge' }));
    expect(store.acceptIdentities(r.saved, [r.person])).toEqual([]);
    expect(r.saved.people.has(r.person.candidateKey)).toBe(false);
    // Supplied people's links are stored (their published IDs are fixed anyway); no imported newcomer's is.
    expect([...r.saved.people.keys()].every((id) => id.startsWith('C-'))).toBe(true);
  });

  it('an identifier already linked to someone else is not taken over; the row is held as a conflict', () => {
    // Bridge (bridge@) and Other (other@) each have history; Bridge's LinkedIn URL is learned by a later import.
    const bridgeFirst = importRow(empty(), bridge({}));
    let s = act(bridgeFirst.saved, bridgeFirst.person).saved;
    const other = importRow(s, { ...bridge({ email: 'other@example.test' }), full_name: 'Review Other' });
    s = act(other.saved, other.person).saved;
    s = importRow(s, bridge({ linkedin_url: 'linkedin.com/in/review-bridge' })).saved;
    // A row with Bridge's URL and Other's email: two people with history, never merged, never a fresh ID.
    const clash = importRow(s, bridge({ email: 'other@example.test', linkedin_url: 'linkedin.com/in/review-bridge' }));
    expect(clash.person.identity.status).toBe('conflict');
    expect(act(clash.saved, clash.person).result.ok).toBe(false);
    // Neither person's saved identifiers changed because of the conflicting row.
    expect(clash.saved.people).toEqual(s.people);
  });
});

describe('supplied people with seeded or Comeet history also keep links learned by an import', () => {
  const BACKEND = { jobId: 'JOB002', title: 'Backend Engineer' };
  const row = (full_name: string, email: string, linkedin_url = '') => ({ full_name, email, company: 'Acme', title: 'Engineer', conference_name: 'Independent Review', conference_date: '2026-10-19', linkedin_url });

  it('Ryan (in process in Comeet): new email + his URL, then after a reload a name variant with only that email is still held', () => {
    const first = importRow(empty(), row('Ryan Patel', 'ryan.new@example.test', 'https://www.linkedin.com/in/ryan-patel-dazn'));
    expect(first.person.candidateKey).toBe('C-HS017');
    expect(gate(first.saved, first.person).block).toBeDefined();
    expect(knownPeople(first.saved.people).get('email:ryan.new@example.test')).toBe('C-HS017');
    const later = importRow(first.saved, row('Ryan J. Patel', 'ryan.new@example.test'));
    expect(later.person.candidateKey).toBe('C-HS017');
    expect(gate(later.saved, later.person).block).toBeDefined();
    expect(act(later.saved, later.person).result.ok).toBe(false);
  });

  it('Noah (seeded decline for Backend Engineer): after a reload a name variant with the new email is still C-HS029, so the decline blocks', () => {
    const first = importRow(empty(), row('Noah Anderson', 'noah.new@example.test', 'linkedin.com/in/noah-anderson-gs'));
    expect(first.person.candidateKey).toBe('C-HS029');
    const later = importRow(first.saved, row('Noah J. Anderson', 'noah.new@example.test'));
    expect(later.person.candidateKey).toBe('C-HS029');
    const check = inviteCheck({ entries: [...SEEDED, ...later.saved.entries], people: later.saved.people, held: later.saved.held }, later.person, BACKEND, [BACKEND]);
    expect(check.block).toBeDefined();
  });
});

describe('source-ID-only people who later gain an email', () => {
  const sid = (more: Record<string, string>) => ({ hubspot_id: 'SID-1', ...bridge({ email: '', ...more }) });

  it('SID-1 with no email or URL records an action; SID-1 + email later is the same person and cannot be invited again', () => {
    const first = importRow(empty(), sid({}));
    expect(first.person.identity.kind).toBe('source_id');
    const sent = act(first.saved, first.person);
    expect(sent.result.ok).toBe(true);

    const later = importRow(sent.saved, sid({ email: 'bridge@example.test' }));
    expect(later.person.candidateKey).toBe(first.person.candidateKey);
    expect(gate(later.saved, later.person).block).toMatch(/^Already contacted for /);
    expect(act(later.saved, later.person).result.ok).toBe(false);

    // And the email learned there is kept: email only, no source ID, after another reload.
    const emailOnly = importRow(later.saved, bridge({}));
    expect(emailOnly.person.candidateKey).toBe(first.person.candidateKey);
    expect(gate(emailOnly.saved, emailOnly.person).block).toMatch(/^Already contacted for /);
  });

  it('a different name with the same source ID is not that person (the source-ID join rule needs the name too)', () => {
    const first = importRow(empty(), sid({}));
    const sent = act(first.saved, first.person);
    const other = importRow(sent.saved, { ...sid({ email: 'someone@example.test' }), full_name: 'Someone Else' });
    expect(other.person.candidateKey).not.toBe(first.person.candidateKey);
    expect(gate(other.saved, other.person).block).toBeUndefined();
  });

  it('SID-1 linked to P and the email linked to Q: held as a conflict, never a fresh ID that drops either history', () => {
    const p = importRow(empty(), sid({}));
    let s = act(p.saved, p.person).saved;
    const q = importRow(s, { ...bridge({ email: 'q@example.test' }), full_name: 'Review Bridge' });
    s = act(q.saved, q.person).saved;
    expect(q.person.candidateKey).not.toBe(p.person.candidateKey);
    const clash = importRow(s, sid({ email: 'q@example.test' }));
    expect(clash.person.identity.status).toBe('conflict');
    expect(act(clash.saved, clash.person).result.ok).toBe(false);
  });

  it('both rows in one session (no reload): the source-ID-only row keeps P, the row with an email is held, IDs stay unique', () => {
    const first = importRow(empty(), sid({}));
    const saved = act(first.saved, first.person).saved;
    const rows = [sid({}), sid({ email: 'bridge@example.test', conference_date: '2026-10-20' })];
    const r = importAttendeeList(supplied, toCsv(Object.keys(rows[0]!), rows), undefined, knownPeople(saved.people));
    if (!r.ok) throw new Error(r.problems.join('; '));
    const bridges = r.dataset.candidates.filter((c) => c.fullName === 'Review Bridge');
    expect(new Set(r.dataset.candidates.map((c) => c.candidateKey)).size).toBe(r.dataset.candidates.length);
    expect(bridges.find((c) => c.identity.kind === 'source_id' && c.identity.identifiers.length === 0)!.candidateKey).toBe(first.person.candidateKey);
    for (const c of bridges) expect(gate(saved, c).block).toBeDefined();
  });

  it('after the email is on record, a source-ID-only row and the email row in one file never share an ID', () => {
    const first = importRow(empty(), sid({}));
    let s = act(first.saved, first.person).saved;
    s = importRow(s, sid({ email: 'bridge@example.test' })).saved; // P now also known by the email.
    const rows = [sid({}), sid({ email: 'bridge@example.test', conference_date: '2026-10-20' })];
    const r = importAttendeeList(supplied, toCsv(Object.keys(rows[0]!), rows), undefined, knownPeople(s.people));
    if (!r.ok) throw new Error(r.problems.join('; '));
    expect(new Set(r.dataset.candidates.map((c) => c.candidateKey)).size).toBe(r.dataset.candidates.length);
    const withEmail = r.dataset.candidates.find((c) => c.fullName === 'Review Bridge' && c.identity.identifiers.length > 0)!;
    expect(withEmail.candidateKey).toBe(first.person.candidateKey);
    for (const c of r.dataset.candidates.filter((x) => x.fullName === 'Review Bridge')) expect(gate(s, c).block).toBeDefined();
  });

  it('history saved before this fix (a source-ID-only person stored with no identifiers) is still found', () => {
    const first = importRow(empty(), sid({}));
    const sent = act(first.saved, first.person);
    // The earlier store saved source-ID-only people with an empty identifier list.
    const legacy: Saved = {
      ...sent.saved,
      people: new Map([...sent.saved.people].map(([k, v]) => [k, { ...v, identifiers: [] } satisfies StoredPerson])),
    };
    const later = importRow(legacy, sid({ email: 'bridge@example.test' }));
    expect(later.person.candidateKey).toBe(first.person.candidateKey);
    expect(act(later.saved, later.person).result.ok).toBe(false);
  });
});

describe('the store keeps accepted links in its own transaction (memory backend here; IndexedDB in e2e)', () => {
  it('rememberIdentities saves a link for a person with history, independently of any action', async () => {
    await store.resetActivity();
    const first = importRow(empty(), bridge({}));
    const [r] = await store.recordActions([invite(first.person)]);
    expect(r!.ok).toBe(true);
    const page2 = importAttendeeList(supplied, toCsv(Object.keys(bridge({})), [bridge({ linkedin_url: 'linkedin.com/in/review-bridge' })]), undefined, knownPeople((await store.refreshActivity()).people));
    if (!page2.ok) throw new Error('import failed');
    await store.rememberIdentities(page2.dataset.candidates);
    const known = knownPeople((await store.refreshActivity()).people);
    expect(known.get('linkedin:linkedin.com/in/review-bridge')).toBe(first.person.candidateKey);
    await store.resetActivity();
  });
});

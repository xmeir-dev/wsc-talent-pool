/**
 * The decision the action store runs inside each transaction. Pure, so it is tested here; the real
 * two-tab behaviour (IndexedDB across tabs) is in e2e/multi-tab-history.spec.ts.
 */
import { describe, expect, it } from 'vitest';
import { decide, type ActionRequest } from '../view/actionStore';
import { realDataset } from './helpers';

const people = realDataset().candidates;
const who = (name: string) => people.find((c) => c.fullName === name)!;
const ML = { jobId: 'JOB001', title: 'Senior ML Engineer' };
const empty = () => ({ entries: [], people: new Map(), held: [], seq: 0 });
let n = 0;
const id = () => `t-${++n}`;
const invite = (name: string, job = ML): ActionRequest => ({ kind: 'invite', person: who(name), job, otherJobs: [job], channel: 'comeet', state: 'sent' });
const ask = (name: string, employeeId: string, state: 'sent' | 'prepared' = 'sent'): ActionRequest => ({
  kind: 'reference',
  person: who(name),
  employeeId,
  employeeName: 'Noa Shapiro',
  channel: 'slack',
  state,
});

describe('one logical action per dedup identity', () => {
  it('records invites for two different people, and refuses a second invite for the same person and role', () => {
    const d = decide(empty(), [invite('Priya Anand'), invite('Chiara Russo'), invite('Priya Anand')], Date.parse('2026-10-19T10:00:00Z'), id);
    expect(d.results.map((r) => r.ok)).toEqual([true, true, false]);
    expect(d.results[2]).toEqual({ ok: false, reason: 'Already contacted for Senior ML Engineer on 19 Oct.' });
    expect(d.entries.map((e) => e.dedupKey)).toEqual([`invite|${who('Priya Anand').candidateKey}|JOB001`, `invite|${who('Chiara Russo').candidateKey}|JOB001`]);
    expect(d.entries.map((e) => e.seq)).toEqual([1, 2]);
  });

  it('checks against what is already saved, not what the tab last saw', () => {
    const first = decide(empty(), [invite('Priya Anand')], Date.now(), id);
    const saved = { entries: first.entries, people: new Map(first.people.map((p) => [p.personId, p])), held: [], seq: first.seq };
    const second = decide(saved, [invite('Priya Anand')], Date.now(), id);
    expect(second.results[0]).toMatchObject({ ok: false, reason: expect.stringMatching(/^Already contacted for Senior ML Engineer/) });
    expect(second.entries).toEqual([]);
  });

  it('a reference request is person + colleague: one send per pair, other colleagues and drafts still allowed', () => {
    const d = decide(empty(), [ask('Priya Anand', 'WSC001'), ask('Priya Anand', 'WSC002'), ask('Priya Anand', 'WSC001'), ask('Chiara Russo', 'WSC001')], Date.now(), id);
    expect(d.results.map((r) => r.ok)).toEqual([true, true, false, true]);
    const drafts = decide(empty(), [ask('Priya Anand', 'WSC001', 'prepared'), ask('Priya Anand', 'WSC001', 'prepared')], Date.now(), id);
    expect(drafts.results.map((r) => r.ok)).toEqual([true, true]);
    expect(drafts.entries.every((e) => e.dedupKey === undefined)).toBe(true);
  });

  it('remembers who each person ID was first saved for', () => {
    const d = decide(empty(), [invite('Priya Anand'), ask('Priya Anand', 'WSC001')], Date.now(), id);
    expect(d.people).toEqual([expect.objectContaining({ personId: who('Priya Anand').candidateKey, fullName: 'Priya Anand', anchor: 'linkedin:linkedin.com/in/priya-anand-cv' })]);
  });

  it('refuses any action for an unresolved identity', () => {
    const alias = { ...who('Priya Anand'), identity: { ...who('Priya Anand').identity, status: 'possible_duplicate' as const, reasons: ['shares email x'] } };
    const d = decide(empty(), [{ kind: 'invite', person: alias, job: ML, otherJobs: [ML], channel: 'comeet', state: 'sent' }], Date.now(), id);
    expect(d.results[0]).toMatchObject({ ok: false, reason: expect.stringMatching(/^Possible duplicate/) });
  });

  it('a reused source-ID person (same ID, different name) is held for review instead of inheriting history', () => {
    const base = who('Priya Anand');
    const alex = { ...base, candidateKey: 'P-00000000000000aa', fullName: 'Alex Review', identity: { ...base.identity, kind: 'source_id' as const, anchor: 'source_id:HS200' } };
    const first = decide(empty(), [{ kind: 'invite', person: alex, job: ML, otherJobs: [ML], channel: 'comeet', state: 'sent' }], Date.now(), id);
    const saved = { entries: first.entries, people: new Map(first.people.map((p) => [p.personId, p])), held: [], seq: first.seq };
    const bob = { ...alex, fullName: 'Bob Other' };
    const d = decide(saved, [{ kind: 'invite', person: bob, job: { jobId: 'JOB004', title: 'Data Engineer' }, otherJobs: [], channel: 'comeet', state: 'sent' }], Date.now(), id);
    expect(d.results[0]).toMatchObject({ ok: false, reason: expect.stringMatching(/recorded for Alex Review/) });
  });
});

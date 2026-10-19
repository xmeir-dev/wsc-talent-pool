/**
 * F3 and F9: the Comeet handoff resolves who a person is across every position before looking at the
 * destination, refuses unresolved identities in the service (not only the button), re-checks on confirm,
 * and carries the recorded contact history instead of claiming "not contacted".
 */
import { describe, expect, it } from 'vitest';
import { buildAssessmentStore, type AssessmentStore } from '../integration-demo/assessments';
import { buildHandoff, createSimulatedComeet, handoffCheck } from '../integration-demo/comeet';
import { applyImport, previewImport } from '../integration-demo/sources';
import { buildDataset, toCsv, type Candidate, type SourceTexts } from '../pipeline';
import { checkInvite, comeetFor, SEEDED, type Entry, type HistoryState } from '../view/activity';
import { bundledSources } from '../view/data';
import { byName } from './helpers';

const history = (entries: readonly Entry[] = SEEDED): HistoryState => ({ entries, people: new Map(), held: [] });

function imported(rows: Record<string, string>[], sources: SourceTexts = bundledSources): SourceTexts {
  const text = toCsv(Object.keys(rows[0]!), rows);
  const preview = previewImport(text, sources);
  if (!preview.ok) throw new Error(preview.problems.join(' '));
  return applyImport(preview.rows, sources);
}

/** A demo session on these sources: the service reads the pool live, like the app. */
function session(sources: SourceTexts) {
  let store: AssessmentStore = buildAssessmentStore(buildDataset(sources));
  const comeet = createSimulatedComeet({ isAvailable: () => true, delayMs: 0, people: () => store.dataset.candidates, history: () => history() });
  const payload = (c: Candidate, jobId: string, entries: readonly Entry[] = SEEDED) => {
    const a = store.get(c.candidateKey, jobId)!.a;
    return buildHandoff(a, store.result(jobId).job, store.version, comeet.positionFor(jobId)!, entries);
  };
  return {
    comeet,
    payload,
    get store() {
      return store;
    },
    swap(next: SourceTexts) {
      store = buildAssessmentStore(buildDataset(next));
    },
  };
}

const RYAN = 'Ryan Patel';
const ryanEmail = 'ryan.patel@dazn.com';

describe("Ryan's email imported without his LinkedIn (acceptance case 4)", () => {
  const sources = imported([{ full_name: RYAN, email: ryanEmail, conference_name: 'Synthetic review event', conference_date: '2026-10-19' }]);
  const s = session(sources);
  const people = s.store.dataset.candidates.filter((c) => c.email === ryanEmail);
  const original = people.find((c) => c.candidateKey === 'C-HS017')!;
  const alias = people.find((c) => c.candidateKey !== 'C-HS017')!;

  it('is a possible duplicate of Ryan, never a fresh person', () => {
    expect(people).toHaveLength(2);
    expect(alias.identity.status).toBe('possible_duplicate');
    expect(alias.identity.relatedPersonIds).toEqual(['C-HS017']);
    expect(original.identity.relatedPersonIds).toEqual([alias.candidateKey]);
  });

  it('cannot enter JOB001 past his Data Engineer process: card, lookup and service all refuse', async () => {
    expect(handoffCheck(alias, 'JOB001', s.store.dataset.jobs, history()).block).toMatch(/Possible duplicate/);
    expect(s.comeet.check(alias.candidateKey, 'JOB001').block).toMatch(/Possible duplicate/);
    const p = s.payload(alias, 'JOB001');
    expect((await s.comeet.find(p, p.positionUid)).kind).toBe('conflict');
    expect((await s.comeet.handoff(p)).kind).not.toBe('created');
    expect(s.comeet.list('POS-ML-001')).toHaveLength(0);
  });

  it("is caught by Ryan's Data Engineer record before the destination role is even looked at", async () => {
    const p = s.payload(alias, 'JOB001');
    const r = await s.comeet.handoff(p);
    expect(r).toEqual({ kind: 'conflict', message: 'Needs review: this email belongs to an existing Comeet candidate with a different HubSpot contact.' });
  });

  it('Ryan himself stays blocked by his active process', async () => {
    expect((await s.comeet.handoff(s.payload(original, 'JOB001'))).kind).toBe('blocked');
  });
});

describe("a different name and email against Priya's LinkedIn URL (acceptance case 4)", () => {
  const sources = imported([
    {
      full_name: 'A Different Person',
      email: 'synthetic-conflict@example.test',
      conference_name: 'Synthetic review event',
      conference_date: '2026-10-19',
      linkedin_url: 'linkedin.com/in/priya-anand-cv',
    },
  ]);
  const s = session(sources);
  const held = s.store.dataset.candidates.find((c) => c.linkedinUrl === 'linkedin.com/in/priya-anand-cv')!;

  it('is an identity conflict that cannot be handed off, and carries no unverified skill tags', async () => {
    expect(held.identity.status).toBe('conflict');
    const p = s.payload(held, 'JOB001');
    expect(p.tags).toEqual([]);
    expect(s.comeet.check(held.candidateKey, 'JOB001').block).toMatch(/Identity not confirmed/);
    const r = await s.comeet.handoff(p);
    expect(r.kind).toBe('blocked');
    expect(s.comeet.list('POS-ML-001')).toHaveLength(0);
  });
});

describe('ordinary cases still work', () => {
  it('a person with no LinkedIn profile (missing-profile review) and two distinct new contacts can be handed off', async () => {
    const sources = imported([
      { full_name: 'Dana Fresh', email: 'dana.fresh@example.test', conference_name: 'Review Event', conference_date: '2026-10-19' },
      { full_name: 'Eli Fresh', email: 'eli.fresh@example.test', conference_name: 'Review Event', conference_date: '2026-10-19' },
    ]);
    const s = session(sources);
    for (const name of ['Dana Fresh', 'Eli Fresh']) {
      const c = s.store.dataset.candidates.find((x) => x.fullName === name)!;
      expect(c.profileStatus).toBe('missing_url');
      expect(c.identity.status).toBe('resolved');
      expect((await s.comeet.handoff(s.payload(c, 'JOB001'))).kind).toBe('created');
    }
    expect(s.comeet.list('POS-ML-001')).toHaveLength(2);
  });
});

describe('the identity is checked again at confirm', () => {
  it('a preview built before an import made the person a possible duplicate is refused on confirm', async () => {
    const s = session(bundledSources);
    const priya = s.store.dataset.candidates.find((c) => c.fullName === 'Priya Anand')!;
    const p = s.payload(priya, 'JOB001');
    expect(s.comeet.check(priya.candidateKey, 'JOB001').block).toBeUndefined();
    // Meanwhile, an import adds an email-only record with Priya's email.
    s.swap(imported([{ full_name: 'Priya Anand', email: priya.email, conference_name: 'Review Event', conference_date: '2026-10-19' }]));
    const r = await s.comeet.handoff(p);
    expect(r.kind).toBe('blocked');
    if (r.kind === 'blocked') expect(r.message).toMatch(/Possible duplicate/);
  });
});

describe("Noah's JOB002 handoff and the history note (acceptance case 5)", () => {
  const s = session(bundledSources);
  const store = s.store;
  const noah = byName(store.result('JOB002'), 'Noah Anderson').candidate;
  const backend = store.result('JOB002').job;

  it('a decline blocks another invite for the role, but not the handoff, which shows it', () => {
    expect(checkInvite(SEEDED, comeetFor(noah.candidateKey), noah.candidateKey, backend, store.dataset.jobs).block).toBe('Declined Backend Engineer on 8 Oct.');
    const check = handoffCheck(noah, 'JOB002', store.dataset.jobs, history());
    expect(check.block).toBeUndefined();
    expect(check.warn).toBe('Declined Backend Engineer on 8 Oct.');
  });

  it('carries the recorded invite and decline, with role and date, into the ATS note', async () => {
    const p = s.payload(noah, 'JOB002');
    expect(p.note).toBe(
      'Handed over from HubSpot for Backend Engineer. Contact history: Invited to Backend Engineer on 5 Oct 2026 by Gal Ofer (simulated); ' +
        'Declined Backend Engineer on 8 Oct 2026 by Gal Ofer (simulated). The owning recruiter decides on outreach.',
    );
    const r = await s.comeet.handoff(p);
    expect(r.kind).toBe('created');
    if (r.kind === 'created') expect(r.candidate.note).toBe(p.note);
  });

  it('an untouched candidate gets "No contact recorded", never "Not contacted yet"', () => {
    const priya = store.dataset.candidates.find((c) => c.fullName === 'Priya Anand')!;
    const note = s.payload(priya, 'JOB001').note;
    expect(note).toBe('Handed over from HubSpot for Senior ML Engineer. No contact recorded. The owning recruiter decides on outreach.');
    expect(note).not.toMatch(/not contacted/i);
  });

  it("Comeet's own history is carried too", () => {
    const alex = store.dataset.candidates.find((c) => c.fullName === 'Alex Turner')!;
    expect(s.payload(alex, 'JOB004').note).toContain('Comeet: Rejected after phone screen for Senior Product Manager - Sports Data (Mar 2025)');
  });

  it('repeating a safe handoff returns the existing record and creates no duplicate', async () => {
    const t = session(bundledSources);
    const priya = t.store.dataset.candidates.find((c) => c.fullName === 'Priya Anand')!;
    const first = await t.comeet.handoff(t.payload(priya, 'JOB001'));
    const again = await t.comeet.handoff(t.payload(priya, 'JOB001'));
    expect(first.kind).toBe('created');
    expect(again.kind).toBe('existing');
    if (first.kind === 'created' && again.kind === 'existing') expect(again.candidate.uid).toBe(first.candidate.uid);
    expect(t.comeet.list('POS-ML-001')).toHaveLength(1);
  });

  it('an active process still blocks the handoff for every role', () => {
    const ryan = store.dataset.candidates.find((c) => c.fullName === RYAN)!;
    for (const jobId of ['JOB001', 'JOB002', 'JOB004']) expect(s.comeet.check(ryan.candidateKey, jobId).block).toMatch(/^Already in process for Data Engineer/);
  });
});

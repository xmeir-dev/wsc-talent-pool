/**
 * The Comeet handoff resolves who a person is across every position before looking at the
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

describe("Ryan re-imported without his LinkedIn URL, or with a country-subdomain URL (acceptance case 4)", () => {
  const variants: [string, Record<string, string>][] = [
    ['his email only', { full_name: RYAN, email: ryanEmail, conference_name: 'Synthetic review event', conference_date: '2026-10-19' }],
    ['a uk.linkedin.com URL only', { full_name: RYAN, linkedin_url: 'https://uk.linkedin.com/in/ryan-patel-dazn', conference_name: 'Synthetic review event', conference_date: '2026-10-19' }],
    ['an m.linkedin.com URL and a new email', { full_name: RYAN, email: 'ryan@elsewhere.test', linkedin_url: 'm.linkedin.com/in/ryan-patel-dazn/', conference_name: 'Synthetic review event', conference_date: '2026-10-19' }],
    ['a /en profile page URL', { full_name: RYAN, linkedin_url: 'https://www.linkedin.com/in/ryan-patel-dazn/en', conference_name: 'Synthetic review event', conference_date: '2026-10-19' }],
    ['a /details/experience/ URL', { full_name: RYAN, linkedin_url: 'linkedin.com/in/ryan-patel-dazn/details/experience/', conference_name: 'Synthetic review event', conference_date: '2026-10-19' }],
    ['a percent-encoded slug', { full_name: RYAN, linkedin_url: 'https://linkedin.com/in/ryan%2Dpatel%2Ddazn%20', conference_name: 'Synthetic review event', conference_date: '2026-10-19' }],
  ];
  for (const [label, row] of variants) {
    it(`with ${label}: is Ryan himself (one person, C-HS017), so his Data Engineer process still blocks JOB001`, async () => {
      const s = session(imported([row]));
      const ryans = s.store.dataset.candidates.filter((c) => c.fullName === RYAN);
      expect(ryans.map((c) => c.candidateKey)).toEqual(['C-HS017']);
      expect(ryans[0]!.attendances).toHaveLength(2);
      expect(s.comeet.check('C-HS017', 'JOB001').block).toMatch(/^Already in process for Data Engineer/);
      expect((await s.comeet.handoff(s.payload(ryans[0]!, 'JOB001'))).kind).toBe('blocked');
      expect(s.comeet.list('POS-ML-001')).toHaveLength(0);
    });
  }

  it("any record carrying Ryan's email under another contact is caught by his Data Engineer record, in every position", async () => {
    const s = session(bundledSources);
    const ryan = s.store.dataset.candidates.find((c) => c.candidateKey === 'C-HS017')!;
    const alias = { ...s.payload(ryan, 'JOB001'), linkedinUrl: '', sourceContactId: 'P-00000000000000aa' };
    expect(await s.comeet.handoff(alias)).toEqual({
      kind: 'conflict',
      message: 'Needs review: this email belongs to an existing Comeet candidate with a different HubSpot contact.',
    });
    // The same with a subdomain spelling of his LinkedIn URL and no email.
    const viaUrl = { ...alias, email: '', linkedinUrl: 'https://uk.linkedin.com/in/ryan-patel-dazn' };
    expect((await s.comeet.handoff(viaUrl)).kind).toBe('conflict');
    expect(s.comeet.list('POS-ML-001')).toHaveLength(0);
  });
});

describe('the same full name with no identifier in common (a mistyped email)', () => {
  it('stays a separate person, but both records are possible duplicates: the new one cannot be handed off past Ryan', async () => {
    const s = session(imported([{ full_name: 'ryan  patel', email: 'ryan.patel@dazn.co', conference_name: 'Synthetic review event', conference_date: '2026-10-19' }]));
    const ryans = s.store.dataset.candidates.filter((c) => /^ryan\s+patel$/i.test(c.fullName));
    expect(ryans).toHaveLength(2);
    for (const c of ryans) expect(c.identity.status).toBe('possible_duplicate');
    const typo = ryans.find((c) => c.candidateKey !== 'C-HS017')!;
    expect(typo.identity.relatedPersonIds).toEqual(['C-HS017']);
    expect(s.comeet.check(typo.candidateKey, 'JOB001').block).toMatch(/Possible duplicate/);
    expect((await s.comeet.handoff(s.payload(typo, 'JOB001'))).kind).toBe('blocked');
    expect(s.comeet.list('POS-ML-001')).toHaveLength(0);
  });
});

describe("another person's email and a uk. spelling of Priya's LinkedIn URL", () => {
  it('joins Priya as a conflict (two names), never a separate person who can be handed off', async () => {
    const s = session(imported([{ full_name: 'Mallory X', email: 'mallory@x.test', linkedin_url: 'https://uk.linkedin.com/in/priya-anand-cv', conference_name: 'Probe', conference_date: '2026-10-19' }]));
    const held = s.store.dataset.candidates.filter((c) => c.linkedinUrl === 'linkedin.com/in/priya-anand-cv');
    expect(held).toHaveLength(1);
    expect(held[0]!.identity.status).toBe('conflict');
    expect((await s.comeet.handoff(s.payload(held[0]!, 'JOB001'))).kind).toBe('blocked');
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
  it('a preview built before an import put the person in conflict is refused on confirm', async () => {
    const s = session(bundledSources);
    const priya = s.store.dataset.candidates.find((c) => c.fullName === 'Priya Anand')!;
    const p = s.payload(priya, 'JOB001');
    expect(s.comeet.check(priya.candidateKey, 'JOB001').block).toBeUndefined();
    // Meanwhile, an import adds a record with Priya's email under another name.
    s.swap(imported([{ full_name: 'Someone Else', email: priya.email, conference_name: 'Review Event', conference_date: '2026-10-19' }]));
    const r = await s.comeet.handoff(p);
    expect(r.kind).toBe('blocked');
    if (r.kind === 'blocked') expect(r.message).toMatch(/Identity not confirmed/);
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

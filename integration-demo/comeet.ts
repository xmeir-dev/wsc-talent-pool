/**
 * The Comeet side of the handoff, behind a small interface. The demo uses the in-memory simulation
 * below; a production version would implement the same interface against Comeet's Recruiting API
 * (create candidate with a position, "Sourced" status, custom fields and a note).
 */

import { normalizeLinkedinUrl } from '../pipeline/text';
import { splitName, type Candidate, type CandidateAssessment, type Job } from '../pipeline';
import { checkHandoff, comeetFor, handoffNote, SEEDED, type Check, type Entry, type HistoryState } from '../view/activity';
import { OUTCOME_LABEL, referenceLine } from '../view/format';
import { DEFAULT_RECRUITER, POSITIONS, recruiterFor, reviewStep, seedCandidates } from './fixtures';
import { initials } from './initials';

export { DEFAULT_RECRUITER, RECRUITERS, recruiterFor, reviewStep } from './fixtures';

export interface ComeetPosition {
  uid: string;
  jobId: string;
  name: string;
  /** The position's lead recruiter (Comeet's position API exposes it). Owns everyone handed off for the role. */
  recruiter: string;
}

/** Avatar letters for an owner: "?" when unassigned, the user's own "WS" for You. */
export function ownerInitials(owner: string): string {
  if (owner === 'Unassigned') return '?';
  return owner === DEFAULT_RECRUITER ? 'WS' : initials(owner);
}

/** Configured custom candidate fields. Values are plain text, as a recruiter would read them. */
export interface TalentFields {
  roleFit: string;
  evidence: string;
  gaps: string;
  possibleReferences: string;
  assessment: string;
}

export interface ComeetCandidate {
  uid: string;
  positionUid: string;
  positionName: string;
  firstName: string;
  lastName: string;
  email: string;
  linkedinUrl: string;
  /** The HubSpot contact this record came from; absent on records created outside this handoff. */
  sourceContactId?: string;
  location: string;
  /** Matched required skills, shown as candidate tags. */
  tags: string[];
  addedOn: string;
  /** A prospect is sourced for the position and not yet in its hiring process (Comeet's Prospects tab). */
  kind: 'candidate' | 'prospect';
  /** For a prospect, Comeet's prospect_status. */
  status: 'Sourced' | 'In progress' | 'Rejected';
  stage: string;
  owner: string;
  nextStep: string;
  source: string;
  /** null for records created outside this handoff. */
  customFields: TalentFields | null;
  note: string;
}

/** What the handoff sends. The dialog previews exactly these values. */
export interface HandoffPayload {
  positionUid: string;
  positionName: string;
  firstName: string;
  lastName: string;
  email: string;
  linkedinUrl: string;
  sourceContactId: string;
  location: string;
  tags: string[];
  status: 'Sourced';
  /** The position's recruiter, who owns the record in Comeet. */
  owner: string;
  source: string;
  customFields: TalentFields;
  note: string;
}

export type HandoffResult =
  | { kind: 'created'; candidate: ComeetCandidate }
  | { kind: 'existing'; candidate: ComeetCandidate }
  /** The identifiers point at an existing record but disagree with it: a person must review it. */
  | { kind: 'conflict'; message: string }
  /** The app's contact rules forbid it (an active Comeet process). */
  | { kind: 'blocked'; message: string }
  | { kind: 'unavailable'; message: string };

/**
 * Who a person is, for matching. A record matches on a non-empty email, LinkedIn URL or source contact ID;
 * two blank values never match. A bare string is treated as an email.
 */
export interface PersonIdentity {
  email: string;
  linkedinUrl?: string;
  sourceContactId?: string;
}

export type LookupResult =
  | { kind: 'found'; candidate: ComeetCandidate | null }
  | { kind: 'conflict'; message: string }
  | { kind: 'unavailable'; message: string };

export interface ComeetService {
  positions: () => ComeetPosition[];
  /** A new position opened in Comeet; in production its webhook starts an assessment for the role. */
  addPosition: (jobId: string, name: string, recruiter?: string) => ComeetPosition;
  /** recruiterFor() over this service's positions, new ones included. */
  recruiterFor: (positionId: string) => string;
  /** What HubSpot shows as "Comeet status": the person's record in that position, if any. */
  statusFor: (person: string | PersonIdentity, positionUid: string) => ComeetCandidate | null;
  positionFor: (jobId: string) => ComeetPosition | undefined;
  find: (person: string | PersonIdentity, positionUid: string) => Promise<LookupResult>;
  /** Idempotent: handing off the same person to the same position again returns the existing record. */
  handoff: (payload: HandoffPayload) => Promise<HandoffResult>;
  get: (uid: string) => ComeetCandidate | undefined;
  /** Everyone in one position, oldest first. */
  list: (positionUid: string) => ComeetCandidate[];
  /** handoffCheck() against this service's positions and the current pool and history. */
  check: (candidateKey: string, jobId: string) => Check;
}

const UNAVAILABLE = 'Comeet did not respond. Nothing was created.';

/**
 * The handoff exactly as it will be sent. `history` is the recorded outreach (seeded plus this browser's): the note
 * carries what it says, and says "No contact recorded" when it says nothing. An unresolved identity sends no tags,
 * so skills from a profile that may be someone else's never reach the ATS (the handoff is blocked anyway).
 */
export function buildHandoff(a: CandidateAssessment, job: Job, version: string, position: ComeetPosition, history: readonly Entry[]): HandoffPayload {
  const c = a.candidate;
  const hasProfile = c.profile !== null;
  const confirmed = c.identity.status === 'resolved';
  const rank = a.shortlistRank !== null ? ` · #${a.shortlistRank}` : '';
  const refs = a.possibleReferences.map((r) => `${r.employeeName}: ${referenceLine(r)}`);
  return {
    positionUid: position.uid,
    positionName: position.name,
    ...splitNames(c.fullName),
    email: c.email,
    linkedinUrl: c.linkedinUrl,
    sourceContactId: c.candidateKey,
    location: c.profile?.location ?? '',
    // Only skills named on the profile become tags; related or likely ones stay qualified in evidence and gaps.
    tags: confirmed ? a.skills.filter((s) => s.kind === 'required' && s.match === 'named').map((s) => s.skill) : [],
    status: 'Sourced',
    owner: position.recruiter || DEFAULT_RECRUITER,
    source: 'Conference talent pool (HubSpot)',
    customFields: {
      roleFit: `${OUTCOME_LABEL[a.recommendation]}${rank}`,
      evidence: hasProfile ? a.fitEvidence.join('; ') || 'No required skill on profile' : 'Unknown: no usable profile',
      gaps: hasProfile ? a.skillGaps.join('; ') || 'None identified' : 'Unknown: no usable profile',
      possibleReferences: hasProfile
        ? refs.length > 0
          ? `${refs.join('; ')}. Leads, not endorsements.`
          : 'None found'
        : 'Unknown: no work history',
      assessment: `${job.jobId} ${job.title} · ${version}`,
    },
    note: handoffNote(history, comeetFor(c.candidateKey), c.candidateKey, job.title),
  };
}

function splitNames(fullName: string): { firstName: string; lastName: string } {
  const { firstname, lastname } = splitName(fullName);
  return { firstName: firstname, lastName: lastname };
}

const normEmail = (v: string) => v.trim().toLowerCase();
/** The pipeline's own canonical LinkedIn form (any subdomain, scheme, query or trailing slash is the same profile). */
const normUrl = (v: string) => normalizeLinkedinUrl(v);

export interface SimulationOptions {
  /** Read on every call, so the demo's outage switch takes effect immediately. */
  isAvailable: () => boolean;
  delayMs?: number;
  /**
   * The contact pool, read on every check so imports count. Anyone in it with a record in data/demo/comeet.json
   * for an open position is seeded. When given, a handoff for someone not in it, or whose identity is
   * unresolved, is refused by the service itself, not only by the button.
   */
  people?: readonly Candidate[] | (() => readonly Candidate[]);
  /** The recorded outreach and saved-history review state, read on every check. Defaults to the seeded examples. */
  history?: () => HistoryState;
}

type Field = 'email' | 'linkedinUrl' | 'sourceContactId';
const FIELDS: { field: Field; norm: (v: string) => string; label: string; other: string }[] = [
  { field: 'email', norm: normEmail, label: 'this email', other: 'a different email' },
  { field: 'linkedinUrl', norm: normUrl, label: 'this LinkedIn profile', other: 'a different LinkedIn profile' },
  { field: 'sourceContactId', norm: (v) => v.trim(), label: 'this HubSpot contact', other: 'a different HubSpot contact' },
];
type Match = { kind: 'match'; candidate: ComeetCandidate } | { kind: 'conflict'; message: string } | null;

const SEEDED_HISTORY: HistoryState = { entries: SEEDED, people: new Map(), held: [] };

/**
 * May this person be handed off for this role? checkHandoff in view/activity.ts on the shared Comeet history
 * (data/demo/comeet.json) and the recorded outreach: an unresolved identity or an active process for any role
 * blocks; an uncontacted lead does not; a decline or earlier contact for this role is shown, not blocking,
 * because adding someone to the ATS sends nothing (the decline still blocks another invite).
 */
export function handoffCheck(
  person: Candidate,
  jobId: string,
  jobs: readonly { jobId: string; title: string }[],
  history: HistoryState = SEEDED_HISTORY,
): Check {
  const job = jobs.find((j) => j.jobId === jobId);
  return job ? checkHandoff(history, person, job, jobs) : {};
}

export function createSimulatedComeet({ isAvailable, delayMs = 400, people, history = () => SEEDED_HISTORY }: SimulationOptions): ComeetService {
  const positions = [...POSITIONS];
  const pool = () => (typeof people === 'function' ? people() : (people ?? []));
  const records = new Map(seedCandidates(pool(), positions).map((c) => [c.uid, c]));
  let nextUid = 2001;
  const wait = () => new Promise((resolve) => setTimeout(resolve, delayMs));
  /**
   * The first non-blank identifier (email, then LinkedIn, then source contact) that equals a record's finds it.
   * If any other identifier is set on both sides and differs, it is a conflict, never a match.
   */
  const match = (person: string | PersonIdentity, positionUid: string): Match => {
    const who: PersonIdentity = typeof person === 'string' ? { email: person } : person;
    const inPosition = [...records.values()].filter((c) => c.positionUid === positionUid);
    for (const key of FIELDS) {
      const value = key.norm(who[key.field] ?? '');
      const found = value ? inPosition.find((c) => key.norm(c[key.field] ?? '') === value) : undefined;
      if (!found) continue;
      const clash = FIELDS.find((f) => {
        const mine = f.norm(who[f.field] ?? '');
        const theirs = f.norm(found[f.field] ?? '');
        return mine !== '' && theirs !== '' && mine !== theirs;
      });
      return clash
        ? { kind: 'conflict', message: `Needs review: ${key.label} belongs to an existing Comeet candidate with ${clash.other}.` }
        : { kind: 'match', candidate: found };
    }
    return null;
  };
  /**
   * Who this is across every position, before the destination is looked at: a record in any position that shares
   * one identifier but disagrees on another is a conflict. So an email-only alias of someone in process for
   * another role cannot become a fresh candidate by arriving with a new contact ID.
   */
  const resolve = (person: string | PersonIdentity, positionUid: string): Match => {
    const who: PersonIdentity = typeof person === 'string' ? { email: person } : person;
    for (const key of FIELDS) {
      const value = key.norm(who[key.field] ?? '');
      if (!value) continue;
      for (const found of records.values()) {
        if (key.norm(found[key.field] ?? '') !== value) continue;
        const clash = FIELDS.find((f) => {
          const mine = f.norm(who[f.field] ?? '');
          const theirs = f.norm(found[f.field] ?? '');
          return mine !== '' && theirs !== '' && mine !== theirs;
        });
        if (clash) return { kind: 'conflict', message: `Needs review: ${key.label} belongs to an existing Comeet candidate with ${clash.other}.` };
      }
    }
    return match(who, positionUid);
  };
  const recordFor = (person: string | PersonIdentity, positionUid: string) => {
    const m = match(person, positionUid);
    return m?.kind === 'match' ? m.candidate : null;
  };
  const check = (candidateKey: string, jobId: string): Check => {
    const jobs = positions.map((p) => ({ jobId: p.jobId, title: p.name }));
    const person = pool().find((c) => c.candidateKey === candidateKey);
    if (person) return handoffCheck(person, jobId, jobs, history());
    // Without a pool (unit tests of the matching alone) only the Comeet rules apply; with one, an unknown contact is refused.
    if (people !== undefined) return { block: 'This contact is not in the talent pool. Nothing was created.' };
    const job = jobs.find((j) => j.jobId === jobId);
    return job ? checkHandoff(history(), unknownPerson(candidateKey), job, jobs) : {};
  };

  return {
    positions: () => positions,
    addPosition: (jobId, name, recruiter = DEFAULT_RECRUITER) => {
      const position = { uid: `POS-${jobId}`, jobId, name, recruiter: recruiter.trim() || DEFAULT_RECRUITER };
      positions.push(position);
      return position;
    },
    recruiterFor: (positionId) => recruiterFor(positionId, positions),
    statusFor: (person, positionUid) => recordFor(person, positionUid),
    check,
    positionFor: (jobId) => positions.find((p) => p.jobId === jobId),
    get: (uid) => records.get(uid),
    list: (positionUid) => [...records.values()].filter((c) => c.positionUid === positionUid),
    async find(person, positionUid) {
      await wait();
      if (!isAvailable()) return { kind: 'unavailable', message: UNAVAILABLE };
      const m = resolve(person, positionUid);
      return m?.kind === 'conflict' ? m : { kind: 'found', candidate: m?.candidate ?? null };
    },
    async handoff(p) {
      await wait();
      if (!isAvailable()) return { kind: 'unavailable', message: UNAVAILABLE };
      // Re-checked here, at confirm time: the preview may be stale (an import, another tab, another handoff).
      const m = resolve(p, p.positionUid);
      if (m?.kind === 'conflict') return m;
      if (m) return { kind: 'existing', candidate: m.candidate };
      const position = positions.find((x) => x.uid === p.positionUid);
      const block = check(p.sourceContactId, position?.jobId ?? '').block;
      if (block) return { kind: 'blocked', message: block };
      // The position's recruiter owns the prospect; the HubSpot contact owner is not touched.
      const owner = position ? recruiterFor(position.uid, positions) : p.owner;
      const candidate: ComeetCandidate = {
        uid: `CMT-${nextUid++}`,
        positionUid: p.positionUid,
        positionName: p.positionName,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        linkedinUrl: p.linkedinUrl,
        sourceContactId: p.sourceContactId,
        location: p.location,
        tags: p.tags,
        addedOn: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        kind: 'prospect',
        status: p.status,
        stage: 'Sourced',
        owner,
        nextStep: reviewStep(owner),
        source: p.source,
        customFields: p.customFields,
        note: p.note,
      };
      records.set(candidate.uid, candidate);
      return { kind: 'created', candidate };
    },
  };
}

/** A contact the service cannot look up (tests without a pool): resolved by its own ID, with no other evidence. */
function unknownPerson(candidateKey: string): Candidate {
  return {
    candidateKey,
    identity: { anchor: `source_id:${candidateKey}`, kind: 'source_id', identifiers: [], status: 'resolved', relatedPersonIds: [], reasons: [] },
    sourceContactIds: [],
    fullName: '',
    email: '',
    linkedinUrl: '',
    attendances: [],
    profileStatus: 'missing_url',
    profile: null,
    dataQualityFlags: [],
  };
}

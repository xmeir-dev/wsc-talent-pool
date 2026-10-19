/**
 * The Comeet side of the handoff, behind a small interface. The demo uses the in-memory simulation
 * below; a production version would implement the same interface against Comeet's Recruiting API
 * (create candidate with a position, "Sourced" status, custom fields and a note).
 */

import { splitName, type Candidate, type CandidateAssessment, type Job } from '../pipeline';
import { checkInvite, comeetFor, type Check } from '../view/activity';
import { OUTCOME_LABEL, referenceLine } from '../view/format';
import { POSITIONS, seedCandidates } from './fixtures';

export interface ComeetPosition {
  uid: string;
  jobId: string;
  name: string;
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
  addPosition: (jobId: string, name: string) => ComeetPosition;
  /** What HubSpot shows as "Comeet status": the person's record in that position, if any. */
  statusFor: (person: string | PersonIdentity, positionUid: string) => ComeetCandidate | null;
  positionFor: (jobId: string) => ComeetPosition | undefined;
  find: (person: string | PersonIdentity, positionUid: string) => Promise<LookupResult>;
  /** Idempotent: handing off the same person to the same position again returns the existing record. */
  handoff: (payload: HandoffPayload) => Promise<HandoffResult>;
  get: (uid: string) => ComeetCandidate | undefined;
  /** Everyone in one position, oldest first. */
  list: (positionUid: string) => ComeetCandidate[];
  /** handoffCheck() against this service's positions. */
  check: (candidateKey: string, jobId: string) => Check;
}

const UNAVAILABLE = 'Comeet did not respond. Nothing was created.';

export function buildHandoff(a: CandidateAssessment, job: Job, version: string, position: ComeetPosition): HandoffPayload {
  const c = a.candidate;
  const hasProfile = c.profile !== null;
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
    tags: a.skills.filter((s) => s.kind === 'required' && s.match === 'named').map((s) => s.skill),
    status: 'Sourced',
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
    note: `Handed over from HubSpot for ${job.title}. Not contacted yet; the owning recruiter decides on outreach.`,
  };
}

function splitNames(fullName: string): { firstName: string; lastName: string } {
  const { firstname, lastname } = splitName(fullName);
  return { firstName: firstname, lastName: lastname };
}

const normEmail = (v: string) => v.trim().toLowerCase();
const normUrl = (v: string) => v.trim().toLowerCase().replace(/\/+$/, '');

export interface SimulationOptions {
  /** Read on every call, so the demo's outage switch takes effect immediately. */
  isAvailable: () => boolean;
  delayMs?: number;
  /** The contact pool. Anyone with a record in data/demo_comeet.json for an open position is seeded into it. */
  people?: readonly Candidate[];
}

type Field = 'email' | 'linkedinUrl' | 'sourceContactId';
const FIELDS: { field: Field; norm: (v: string) => string; label: string; other: string }[] = [
  { field: 'email', norm: normEmail, label: 'this email', other: 'a different email' },
  { field: 'linkedinUrl', norm: normUrl, label: 'this LinkedIn profile', other: 'a different LinkedIn profile' },
  { field: 'sourceContactId', norm: (v) => v.trim(), label: 'this HubSpot contact', other: 'a different HubSpot contact' },
];
type Match = { kind: 'match'; candidate: ComeetCandidate } | { kind: 'conflict'; message: string } | null;

/**
 * May this person be handed off for this role? Exactly the recruiter view's invite rule (checkInvite in
 * view/activity.ts) on the shared Comeet history (data/demo_comeet.json): an active process blocks every role,
 * an uncontacted lead does not, and a past rejection for another role warns.
 */
export function handoffCheck(candidateKey: string, jobId: string, jobs: readonly { jobId: string; title: string }[]): Check {
  const job = jobs.find((j) => j.jobId === jobId);
  return job ? checkInvite([], comeetFor(candidateKey), candidateKey, job, jobs) : {};
}

export function createSimulatedComeet({ isAvailable, delayMs = 400, people = [] }: SimulationOptions): ComeetService {
  const positions = [...POSITIONS];
  const records = new Map(seedCandidates(people, positions).map((c) => [c.uid, c]));
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
  const recordFor = (person: string | PersonIdentity, positionUid: string) => {
    const m = match(person, positionUid);
    return m?.kind === 'match' ? m.candidate : null;
  };
  const check = (candidateKey: string, jobId: string): Check =>
    handoffCheck(
      candidateKey,
      jobId,
      positions.map((p) => ({ jobId: p.jobId, title: p.name })),
    );

  return {
    positions: () => positions,
    addPosition: (jobId, name) => {
      const position = { uid: `POS-${jobId}`, jobId, name };
      positions.push(position);
      return position;
    },
    statusFor: (person, positionUid) => recordFor(person, positionUid),
    check,
    positionFor: (jobId) => positions.find((p) => p.jobId === jobId),
    get: (uid) => records.get(uid),
    list: (positionUid) => [...records.values()].filter((c) => c.positionUid === positionUid),
    async find(person, positionUid) {
      await wait();
      if (!isAvailable()) return { kind: 'unavailable', message: UNAVAILABLE };
      const m = match(person, positionUid);
      return m?.kind === 'conflict' ? m : { kind: 'found', candidate: m?.candidate ?? null };
    },
    async handoff(p) {
      await wait();
      if (!isAvailable()) return { kind: 'unavailable', message: UNAVAILABLE };
      const m = match(p, p.positionUid);
      if (m?.kind === 'conflict') return m;
      if (m) return { kind: 'existing', candidate: m.candidate };
      const jobId = positions.find((x) => x.uid === p.positionUid)?.jobId ?? '';
      const block = check(p.sourceContactId, jobId).block;
      if (block) return { kind: 'blocked', message: block };
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
        status: p.status,
        stage: 'Sourced',
        owner: 'Unassigned',
        nextStep: 'Assign an owner, who reviews the fit and decides on outreach.',
        source: p.source,
        customFields: p.customFields,
        note: p.note,
      };
      records.set(candidate.uid, candidate);
      return { kind: 'created', candidate };
    },
  };
}

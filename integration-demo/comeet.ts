/**
 * The Comeet side of the handoff, behind a small interface. The demo uses the in-memory simulation
 * below; a production version would implement the same interface against Comeet's Recruiting API
 * (create candidate with a position, "Sourced" status, custom fields and a note).
 */

import { splitName, type CandidateAssessment, type Job } from '../pipeline';
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
  location: string;
  /** Matched required skills, shown as candidate tags. */
  tags: string[];
  addedOn: string;
  status: 'Sourced' | 'In progress';
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
  | { kind: 'unavailable'; message: string };

export type LookupResult = { kind: 'found'; candidate: ComeetCandidate | null } | { kind: 'unavailable'; message: string };

export interface ComeetService {
  positions: () => ComeetPosition[];
  /** A new position opened in Comeet; in production its webhook starts an assessment for the role. */
  addPosition: (jobId: string, name: string) => ComeetPosition;
  /** What HubSpot shows as "Comeet status": the person's record in that position, if any. */
  statusFor: (email: string, positionUid: string) => ComeetCandidate | null;
  positionFor: (jobId: string) => ComeetPosition | undefined;
  find: (email: string, positionUid: string) => Promise<LookupResult>;
  /** Idempotent: handing off the same person to the same position again returns the existing record. */
  handoff: (payload: HandoffPayload) => Promise<HandoffResult>;
  get: (uid: string) => ComeetCandidate | undefined;
  /** Everyone in one position, oldest first. */
  list: (positionUid: string) => ComeetCandidate[];
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
    location: c.profile?.location ?? '',
    tags: a.skills.filter((s) => s.kind === 'required' && s.match !== 'none').map((s) => s.skill),
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

export interface SimulationOptions {
  /** Read on every call, so the demo's outage switch takes effect immediately. */
  isAvailable: () => boolean;
  delayMs?: number;
}

export function createSimulatedComeet({ isAvailable, delayMs = 400 }: SimulationOptions): ComeetService {
  const records = new Map(seedCandidates().map((c) => [c.uid, c]));
  const positions = [...POSITIONS];
  let nextUid = 2001;
  const wait = () => new Promise((resolve) => setTimeout(resolve, delayMs));
  const match = (email: string, positionUid: string) =>
    [...records.values()].find((c) => c.positionUid === positionUid && c.email.toLowerCase() === email.toLowerCase()) ?? null;

  return {
    positions: () => positions,
    addPosition: (jobId, name) => {
      const position = { uid: `POS-${jobId}`, jobId, name };
      positions.push(position);
      return position;
    },
    statusFor: (email, positionUid) => match(email, positionUid),
    positionFor: (jobId) => positions.find((p) => p.jobId === jobId),
    get: (uid) => records.get(uid),
    list: (positionUid) => [...records.values()].filter((c) => c.positionUid === positionUid),
    async find(email, positionUid) {
      await wait();
      if (!isAvailable()) return { kind: 'unavailable', message: UNAVAILABLE };
      return { kind: 'found', candidate: match(email, positionUid) };
    },
    async handoff(p) {
      await wait();
      if (!isAvailable()) return { kind: 'unavailable', message: UNAVAILABLE };
      const existing = match(p.email, p.positionUid);
      if (existing) return { kind: 'existing', candidate: existing };
      const candidate: ComeetCandidate = {
        uid: `CMT-${nextUid++}`,
        positionUid: p.positionUid,
        positionName: p.positionName,
        firstName: p.firstName,
        lastName: p.lastName,
        email: p.email,
        linkedinUrl: p.linkedinUrl,
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

/**
 * Demo-only Comeet fixtures. Fictional positions and recruiters. The Comeet history is the same made-up
 * file the recruiter view reads (data/demo/comeet.json); nothing here comes from a real Comeet account.
 */

import type { Candidate } from '../pipeline';
import { activeInComeet, comeetFor, type ComeetRecord } from '../view/activity';
import type { ComeetCandidate, ComeetPosition } from './comeet';

/**
 * Each position's lead recruiter. Invented names, the same made-up recruiters the recruiter view uses
 * (data/demo/recruiters.json); Gal Ofer, who invited Noah Anderson to Backend Engineer, recruits for it.
 */
export const POSITIONS: ComeetPosition[] = [
  { uid: 'POS-ML-001', jobId: 'JOB001', name: 'Senior ML Engineer', recruiter: 'Neta Harel' },
  { uid: 'POS-BE-002', jobId: 'JOB002', name: 'Backend Engineer', recruiter: 'Gal Ofer' },
  { uid: 'POS-PM-003', jobId: 'JOB003', name: 'Senior Product Manager - Sports Data', recruiter: 'Ronit Sela' },
  { uid: 'POS-DE-004', jobId: 'JOB004', name: 'Data Engineer', recruiter: 'Amit Sasson' },
];

/** The signed-in demo user (the "WS" avatar in both apps): recruiter for a position opened without one. */
export const DEFAULT_RECRUITER = 'You';

/** The fictional recruiters on the seeded positions, for a recruiter picker. */
export const RECRUITERS: readonly string[] = [...new Set(POSITIONS.map((p) => p.recruiter))];

/**
 * The recruiter responsible for a position, by its Comeet uid or its job ID. A position with no recruiter
 * (or one this list does not know, such as a new position) falls back to DEFAULT_RECRUITER.
 */
export function recruiterFor(positionId: string, positions: readonly ComeetPosition[] = POSITIONS): string {
  return positions.find((p) => p.uid === positionId || p.jobId === positionId)?.recruiter || DEFAULT_RECRUITER;
}

const firstOf = (name: string) => name.trim().split(/\s+/)[0] ?? name;

/** The Workflow card's next step for a sourced prospect the recruiter owns. */
export function reviewStep(owner: string): string {
  return owner === DEFAULT_RECRUITER ? 'You review the fit and decide on outreach.' : `${firstOf(owner)} reviews the fit and decides on outreach.`;
}
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const addedOn = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** How a shared history record reads in the position. An uncontacted lead is a Sourced prospect; the recruiter owns both. */
function workflow(r: ComeetRecord, first: string, owner: string): Pick<ComeetCandidate, 'kind' | 'status' | 'stage' | 'owner' | 'nextStep'> {
  const them = firstOf(owner);
  if (r.kind === 'lead' && !activeInComeet(r)) return { kind: 'prospect', status: 'Sourced', stage: 'Sourced', owner, nextStep: reviewStep(owner) };
  if (activeInComeet(r)) {
    const stage = sentence(r.outcome.replace(/^in process:\s*/i, ''));
    return { kind: 'candidate', status: 'In progress', stage, owner, nextStep: `${them} is running the ${stage.toLowerCase()}. Check with ${them} before contacting ${first}.` };
  }
  const stage = sentence(r.outcome.replace(/^rejected (after|at)\s*/i, ''));
  return { kind: 'candidate', status: 'Rejected', stage, owner, nextStep: `Closed. Check with ${them} before approaching ${first} again.` };
}

/** Everyone in the pool with a shared Comeet record for an open position. */
export function seedCandidates(people: readonly Candidate[], positions: readonly ComeetPosition[]): ComeetCandidate[] {
  let uid = 1040;
  return people.flatMap((c) =>
    comeetFor(c.candidateKey).flatMap((r) => {
      const position = positions.find((p) => p.name === r.job);
      if (!position) return [];
      const [firstName = '', ...rest] = c.fullName.split(' ');
      return [
        {
          uid: `CMT-${uid++}`,
          positionUid: position.uid,
          positionName: position.name,
          firstName,
          lastName: rest.join(' '),
          email: c.email,
          linkedinUrl: c.linkedinUrl,
          sourceContactId: c.candidateKey,
          location: c.profile?.location ?? '',
          tags: [],
          addedOn: addedOn(r.date),
          ...workflow(r, firstName, position.recruiter),
          source: 'Added in Comeet',
          customFields: null,
          note: '',
        },
      ];
    }),
  );
}

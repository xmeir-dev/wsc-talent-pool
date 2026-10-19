/**
 * Demo-only Comeet fixtures. Fictional positions and recruiters. The Comeet history is the same made-up
 * file the recruiter view reads (data/demo/comeet.json); nothing here comes from a real Comeet account.
 */

import type { Candidate } from '../pipeline';
import { activeInComeet, comeetFor, type ComeetRecord } from '../view/activity';
import type { ComeetCandidate, ComeetPosition } from './comeet';

export const POSITIONS: ComeetPosition[] = [
  { uid: 'POS-ML-001', jobId: 'JOB001', name: 'Senior ML Engineer' },
  { uid: 'POS-BE-002', jobId: 'JOB002', name: 'Backend Engineer' },
  { uid: 'POS-PM-003', jobId: 'JOB003', name: 'Senior Product Manager - Sports Data' },
  { uid: 'POS-DE-004', jobId: 'JOB004', name: 'Data Engineer' },
];

const OWNER = 'Dana (fictional recruiter)';
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const addedOn = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

/** How a shared history record reads as a Comeet candidate in the position. */
function workflow(r: ComeetRecord, first: string): Pick<ComeetCandidate, 'status' | 'stage' | 'owner' | 'nextStep'> {
  if (r.kind === 'lead' && !activeInComeet(r))
    return { status: 'Sourced', stage: 'Sourced', owner: 'Unassigned', nextStep: 'Assign an owner, who reviews the fit and decides on outreach.' };
  if (activeInComeet(r)) {
    const stage = sentence(r.outcome.replace(/^in process:\s*/i, ''));
    return { status: 'In progress', stage, owner: OWNER, nextStep: `Dana is running the ${stage.toLowerCase()}. Check with Dana before contacting ${first}.` };
  }
  const stage = sentence(r.outcome.replace(/^rejected (after|at)\s*/i, ''));
  return { status: 'Rejected', stage, owner: OWNER, nextStep: `Closed. Check with Dana before approaching ${first} again.` };
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
          ...workflow(r, firstName),
          source: 'Added in Comeet',
          customFields: null,
          note: '',
        },
      ];
    }),
  );
}

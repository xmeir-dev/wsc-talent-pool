/**
 * Demo-only Comeet fixtures. Fictional positions, recruiters and statuses; nothing here comes from
 * the supplied CSVs or from a real Comeet account.
 */

import type { ComeetCandidate, ComeetPosition } from './comeet';

export const POSITIONS: ComeetPosition[] = [
  { uid: 'POS-ML-001', jobId: 'JOB001', name: 'Senior ML Engineer' },
  { uid: 'POS-BE-002', jobId: 'JOB002', name: 'Backend Engineer' },
  { uid: 'POS-PM-003', jobId: 'JOB003', name: 'Senior Product Manager - Sports Data' },
  { uid: 'POS-DE-004', jobId: 'JOB004', name: 'Data Engineer' },
];

/** One person already in an active process, so the demo can show "already in Comeet". */
export function seedCandidates(): ComeetCandidate[] {
  return [
    {
      uid: 'CMT-1042',
      positionUid: 'POS-ML-001',
      positionName: 'Senior ML Engineer',
      firstName: 'Lucas',
      lastName: 'Evans',
      email: 'l.evans@img.com',
      linkedinUrl: 'https://linkedin.com/in/lucasevans',
      status: 'Active',
      stage: 'Phone screen',
      owner: 'Dana (fictional recruiter)',
      nextStep: 'Dana is booking a phone screen. Check with Dana before contacting Lucas.',
      source: 'Referral',
      customFields: null,
      note: '',
    },
  ];
}

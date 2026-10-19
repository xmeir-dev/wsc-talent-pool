import { describe, expect, it } from 'vitest';
import { activeInComeet, checkInvite, checkReference, current, overallStatus, personFlags, roleStatus, SEEDED, type ComeetRecord, type Entry } from '../../view/activity';

const BACKEND = { jobId: 'JOB002', title: 'Backend Engineer' };
const DATA = { jobId: 'JOB004', title: 'Data Engineer' };
const JOBS = [BACKEND, DATA];
const NOW = Date.parse('2026-10-19T12:00:00Z');

const base = { candidateKey: 'C-X', by: 'You', simulated: true } as const;
const invite = (id: string, job: typeof BACKEND, state: 'prepared' | 'sent' | 'confirmed' | 'failed', at = '2026-10-10T09:00:00Z'): Entry => ({
  ...base,
  id,
  at,
  kind: 'invite',
  jobId: job.jobId,
  jobTitle: job.title,
  channel: 'comeet',
  state,
});
const declined = (id: string, job: typeof BACKEND, at = '2026-10-11T09:00:00Z', supersedes?: string): Entry => ({
  ...base,
  id,
  at,
  kind: 'outcome',
  jobId: job.jobId,
  jobTitle: job.title,
  outcome: 'declined',
  supersedes,
});
const lead: ComeetRecord = { job: 'Data Engineer', outcome: 'Lead, not contacted yet', date: '2026-10-16', kind: 'lead', status: 'In progress', outreach: 'Not Contacted' };
const interviewing: ComeetRecord = { job: 'Data Engineer', outcome: 'In process: phone screen', date: '2026-09-28' };

describe('role status is per person and role', () => {
  it('declined for one role, still open for another', () => {
    const log = [invite('1', BACKEND, 'sent'), declined('2', BACKEND)];
    expect(roleStatus(log, [], 'C-X', BACKEND).status).toBe('declined');
    expect(roleStatus(log, [], 'C-X', DATA).status).toBe('not_contacted');
    expect(checkInvite(log, [], 'C-X', BACKEND, JOBS, NOW).block).toMatch(/Declined Backend Engineer/);
    const other = checkInvite(log, [], 'C-X', DATA, JOBS, NOW);
    expect(other.block).toBeUndefined();
    expect(other.warn).toMatch(/Declined Backend Engineer/);
  });

  it('a prepared or failed invite is not contact', () => {
    expect(roleStatus([invite('1', BACKEND, 'prepared')], [], 'C-X', BACKEND).status).toBe('not_contacted');
    expect(roleStatus([invite('1', BACKEND, 'failed')], [], 'C-X', BACKEND).status).toBe('not_contacted');
    expect(roleStatus([invite('1', BACKEND, 'confirmed')], [], 'C-X', BACKEND).status).toBe('contacted');
  });

  it('the table shows the most advanced role when no role is selected', () => {
    const log = [invite('1', DATA, 'sent'), declined('2', BACKEND)];
    expect(overallStatus(log, [], 'C-X', JOBS)).toMatchObject({ status: 'contacted', job: DATA });
  });
});

describe('Comeet: an uncontacted lead is not "in process"', () => {
  it('a new lead (In progress + Not Contacted) does not block the first approach', () => {
    expect(activeInComeet(lead)).toBe(false);
    expect(personFlags([], [lead], 'C-X').inProcess).toBeUndefined();
    expect(roleStatus([], [lead], 'C-X', DATA).status).toBe('comeet_lead');
    expect(checkInvite([], [lead], 'C-X', DATA, JOBS, NOW).block).toBeUndefined();
  });

  it('a contacted lead or an active candidacy blocks new invites, for any role', () => {
    expect(activeInComeet({ ...lead, outreach: 'Contacted' })).toBe(true);
    expect(checkInvite([], [interviewing], 'C-X', BACKEND, JOBS, NOW).block).toMatch(/Already in process for Data Engineer/);
  });

  it('a closed Comeet process does not block', () => {
    const rejected: ComeetRecord = { job: 'Backend Engineer', outcome: 'Rejected after phone screen', date: '2025-03-12' };
    expect(roleStatus([], [rejected], 'C-X', BACKEND).status).toBe('comeet_closed');
    expect(checkInvite([], [rejected], 'C-X', BACKEND, JOBS, NOW).block).toBeUndefined();
  });
});

describe('Comeet: a past rejection for another role warns', () => {
  const rejectedBackend: ComeetRecord = { job: 'Backend Engineer', outcome: 'Rejected after phone screen', date: '2025-03-12' };
  const rejectedPm: ComeetRecord = { job: 'Senior Product Manager - Sports Data', outcome: 'Rejected after phone screen', date: '2025-03-12' };
  const withdrew: ComeetRecord = { job: 'Product Analyst', outcome: 'Withdrew at interview', date: '2023-06-02' };

  it('warns, without blocking, with the Comeet outcome, role and month', () => {
    expect(checkInvite([], [rejectedBackend], 'C-X', DATA, JOBS, NOW)).toEqual({
      warn: 'Rejected after phone screen for Backend Engineer in Comeet · Mar 2025.',
    });
  });

  it('also for a role that is not one of the person\'s relevant jobs', () => {
    expect(checkInvite([], [rejectedPm, withdrew], 'C-X', DATA, JOBS, NOW)).toEqual({
      warn: 'Rejected after phone screen for Senior Product Manager - Sports Data in Comeet · Mar 2025.',
    });
  });

  it('the most recent rejection is the one named', () => {
    const older: ComeetRecord = { job: 'Computer Vision Engineer', outcome: 'Rejected after technical interview', date: '2024-01-15' };
    expect(checkInvite([], [older, rejectedPm], 'C-X', DATA, JOBS, NOW).warn).toMatch(/^Rejected after phone screen for Senior Product Manager/);
  });

  it('a rejection for this same role, a withdrawal, or an uncontacted lead does not warn', () => {
    expect(checkInvite([], [rejectedBackend], 'C-X', BACKEND, JOBS, NOW)).toEqual({});
    expect(checkInvite([], [withdrew], 'C-X', DATA, JOBS, NOW)).toEqual({});
    expect(checkInvite([], [lead], 'C-X', BACKEND, JOBS, NOW)).toEqual({});
  });

  it('blocks still win over the warning', () => {
    const dnc: Entry = { ...base, id: '1', at: '2026-10-01T00:00:00Z', kind: 'do_not_contact' };
    expect(checkInvite([dnc], [rejectedPm], 'C-X', DATA, JOBS, NOW)).toEqual({ block: 'Asked not to be contacted.' });
    expect(checkInvite([], [rejectedPm, interviewing], 'C-X', BACKEND, JOBS, NOW).block).toMatch(/Already in process for Data Engineer/);
  });

  it('a decline in our own history is named before the older Comeet rejection', () => {
    const log = [invite('1', BACKEND, 'sent'), declined('2', BACKEND)];
    expect(checkInvite(log, [rejectedPm], 'C-X', DATA, JOBS, NOW).warn).toMatch(/^Declined Backend Engineer/);
  });
});

describe('repeat protection', () => {
  it('a simulated send blocks a repeat exactly like a real one', () => {
    const log = [invite('1', BACKEND, 'sent')];
    expect(log[0]!.simulated).toBe(true);
    expect(checkInvite(log, [], 'C-X', BACKEND, JOBS, NOW).block).toMatch(/Already contacted for Backend Engineer/);
  });

  it('do not contact blocks every invite and every reference request', () => {
    const log: Entry[] = [{ ...base, id: '1', at: '2026-10-01T00:00:00Z', kind: 'do_not_contact' }];
    expect(checkInvite(log, [], 'C-X', DATA, JOBS, NOW).block).toBe('Asked not to be contacted.');
    expect(checkReference(log, [], 'C-X', 'WSC003', 'Noa Shapiro').block).toBe('Asked not to be contacted.');
  });

  it('the same colleague is not asked twice about the same person; a copied draft only warns', () => {
    const ask = (state: 'prepared' | 'sent'): Entry => ({ ...base, id: state, at: '2026-10-12T09:00:00Z', kind: 'reference', employeeId: 'WSC003', employeeName: 'Noa Shapiro', channel: state === 'sent' ? 'slack' : 'copy', state });
    expect(checkReference([ask('prepared')], [], 'C-X', 'WSC003', 'Noa Shapiro')).toEqual({ warn: expect.stringMatching(/prepared .* never marked sent/) });
    expect(checkReference([ask('sent')], [], 'C-X', 'WSC003', 'Noa Shapiro').block).toMatch(/Noa was already asked/);
    expect(checkReference([ask('sent')], [], 'C-X', 'WSC004', 'Avi Goldberg')).toEqual({});
  });

  it('contact for another role in the last 30 days warns; older does not', () => {
    expect(checkInvite([invite('1', BACKEND, 'sent', '2026-10-10T09:00:00Z')], [], 'C-X', DATA, JOBS, NOW).warn).toMatch(/Contacted for Backend Engineer/);
    expect(checkInvite([invite('1', BACKEND, 'sent', '2026-08-01T09:00:00Z')], [], 'C-X', DATA, JOBS, NOW)).toEqual({});
  });
});

describe('corrections keep the history', () => {
  it('a correction replaces an outcome without deleting it', () => {
    const wrong = declined('1', BACKEND);
    const fixed: Entry = { ...base, id: '2', at: '2026-10-12T09:00:00Z', kind: 'outcome', jobId: BACKEND.jobId, jobTitle: BACKEND.title, outcome: 'responded', supersedes: '1' };
    expect(current([wrong, fixed])).toEqual([fixed]);
    expect(roleStatus([wrong, fixed], [], 'C-X', BACKEND).status).toBe('responded');
  });
});

describe('seeded examples', () => {
  it('are all simulated', () => {
    expect(SEEDED.every((e) => e.simulated)).toBe(true);
  });
  it('the copied reference request is prepared, not counted as contact', () => {
    const copied = SEEDED.find((e) => e.kind === 'reference')!;
    expect(copied).toMatchObject({ state: 'prepared', channel: 'copy' });
  });
});

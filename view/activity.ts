/**
 * Outreach history (docs/contact-tracking-plan.md): who was contacted, how, and for which role.
 *
 * Everything here is simulated: nothing is sent. Entries live in this browser only, plus a few seeded
 * examples. The rules are pure functions so they can be tested without the view.
 */
import { useSyncExternalStore } from 'react';
import comeetHistory from '../data/demo_comeet.json';

export type Channel = 'comeet' | 'slack' | 'email' | 'copy';
/** Prepared = drafted, copied or opened in an email app; only Sent and Confirmed count as contact. */
export type SendState = 'prepared' | 'sent' | 'failed' | 'confirmed';
export type Outcome = 'responded' | 'interested' | 'declined';

interface Base {
  id: string;
  candidateKey: string;
  /** Who did it. The demo has no sign-in, so new entries are "You". */
  by: string;
  /** ISO date-time. */
  at: string;
  /** A label, not a state: simulated entries follow exactly the same rules as real ones. */
  simulated: boolean;
  /** A correction: this entry replaces an earlier one, which stays in the history. */
  supersedes?: string;
}
export type Entry =
  | (Base & { kind: 'invite'; jobId: string; jobTitle: string; channel: Channel; state: SendState })
  | (Base & { kind: 'reference'; employeeId: string; employeeName: string; channel: Channel; state: SendState })
  | (Base & { kind: 'outcome'; jobId: string; jobTitle: string; outcome: Outcome })
  | (Base & { kind: 'do_not_contact' });

/** A Comeet record for one role (made up, see data/demo_comeet.json). */
export interface ComeetRecord {
  job: string;
  outcome: string;
  date: string;
  kind?: 'candidate' | 'lead';
  status?: string;
  outreach?: 'Not Contacted' | 'Contacted' | 'Responded';
}
const COMEET: Record<string, ComeetRecord[]> = comeetHistory.byCandidate as Record<string, ComeetRecord[]>;
export const comeetFor = (candidateKey: string): ComeetRecord[] => COMEET[candidateKey] ?? [];

/**
 * In process = an active candidacy, or a lead that has been contacted. A new Comeet lead comes back as
 * "In progress" + "Not Contacted": that is not an interview and must not block the first approach.
 */
export function activeInComeet(r: ComeetRecord): boolean {
  if (r.kind === 'lead') return (r.status ?? 'In progress') === 'In progress' && r.outreach !== undefined && r.outreach !== 'Not Contacted';
  return /^in process/i.test(r.outcome);
}

const counts = (e: Entry) => (e.kind === 'invite' || e.kind === 'reference') && (e.state === 'sent' || e.state === 'confirmed');
/** Entries still in force: a correction hides what it replaced. */
export function current(entries: readonly Entry[]): Entry[] {
  const replaced = new Set(entries.flatMap((e) => (e.supersedes ? [e.supersedes] : [])));
  return entries.filter((e) => !replaced.has(e.id));
}

export type RoleStatus = 'not_contacted' | 'comeet_closed' | 'comeet_lead' | 'contacted' | 'declined' | 'responded' | 'interested' | 'in_process';
export const STATUS_LABEL: Record<RoleStatus, string> = {
  not_contacted: 'Not contacted',
  comeet_closed: 'Closed in Comeet',
  comeet_lead: 'Comeet lead',
  contacted: 'Contacted',
  declined: 'Declined',
  responded: 'Responded',
  interested: 'Interested',
  in_process: 'In process',
};
/** How far along a role is, for "most advanced role" when no role is selected. */
const RANK: Record<RoleStatus, number> = {
  not_contacted: 0,
  comeet_closed: 1,
  comeet_lead: 2,
  declined: 3,
  contacted: 4,
  responded: 5,
  interested: 6,
  in_process: 7,
};

export interface RoleState {
  status: RoleStatus;
  /** When it got there (ISO or YYYY-MM-DD), if known. */
  at?: string;
  simulated?: boolean;
}

/** Where one person stands for one role: Comeet first, then outcomes, then our own invites. */
export function roleStatus(entries: readonly Entry[], comeet: readonly ComeetRecord[], candidateKey: string, job: { jobId: string; title: string }): RoleState {
  const mine = current(entries).filter((e) => e.candidateKey === candidateKey);
  const inComeet = comeet.filter((r) => r.job === job.title);
  const active = inComeet.find(activeInComeet);
  if (active) return { status: 'in_process', at: active.date };
  const outcome = mine.filter((e): e is Extract<Entry, { kind: 'outcome' }> => e.kind === 'outcome' && e.jobId === job.jobId).at(-1);
  if (outcome) return { status: outcome.outcome, at: outcome.at, simulated: outcome.simulated };
  const invited = mine.filter((e) => e.kind === 'invite' && e.jobId === job.jobId && counts(e)).at(-1);
  if (invited) return { status: 'contacted', at: invited.at, simulated: invited.simulated };
  const lead = inComeet.find((r) => r.kind === 'lead');
  if (lead) return { status: 'comeet_lead', at: lead.date };
  if (inComeet.length) return { status: 'comeet_closed', at: inComeet[0]!.date };
  return { status: 'not_contacted' };
}

/** The most advanced of a person's roles, for the table when no role is selected. */
export function overallStatus(entries: readonly Entry[], comeet: readonly ComeetRecord[], candidateKey: string, jobs: readonly { jobId: string; title: string }[]): RoleState & { job?: { jobId: string; title: string } } {
  let best: RoleState & { job?: { jobId: string; title: string } } = { status: 'not_contacted' };
  for (const job of jobs) {
    const s = roleStatus(entries, comeet, candidateKey, job);
    if (RANK[s.status] > RANK[best.status]) best = { ...s, job };
  }
  return best;
}

export interface PersonFlags {
  doNotContact?: Entry;
  inProcess?: ComeetRecord;
}
export function personFlags(entries: readonly Entry[], comeet: readonly ComeetRecord[], candidateKey: string): PersonFlags {
  return {
    doNotContact: current(entries).find((e) => e.candidateKey === candidateKey && e.kind === 'do_not_contact'),
    inProcess: comeet.find(activeInComeet),
  };
}

export interface Check {
  /** Why this action is not allowed; the panel shows it instead of sending. */
  block?: string;
  /** Allowed, but worth knowing first. */
  warn?: string;
}
const DAY = 86_400_000;
export const shortDay = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const firstName = (name: string) => name.split(' ')[0] ?? name;

/** May this person be invited to this role? Same rules for single and bulk invites. */
export function checkInvite(
  entries: readonly Entry[],
  comeet: readonly ComeetRecord[],
  candidateKey: string,
  job: { jobId: string; title: string },
  otherJobs: readonly { jobId: string; title: string }[],
  now = Date.now(),
): Check {
  const flags = personFlags(entries, comeet, candidateKey);
  if (flags.doNotContact) return { block: 'Asked not to be contacted.' };
  if (flags.inProcess) return { block: `Already in process for ${flags.inProcess.job} in Comeet (${flags.inProcess.outcome.replace(/^in process:\s*/i, '')}). The owning recruiter decides.` };
  const here = roleStatus(entries, comeet, candidateKey, job);
  if (here.status === 'declined') return { block: `Declined ${job.title} on ${shortDay(here.at!)}.` };
  if (here.status === 'contacted' || here.status === 'responded' || here.status === 'interested')
    return { block: `Already contacted for ${job.title} on ${shortDay(here.at!)}.` };
  for (const other of otherJobs) {
    if (other.jobId === job.jobId) continue;
    const s = roleStatus(entries, comeet, candidateKey, other);
    if (s.status === 'declined') return { warn: `Declined ${other.title} on ${shortDay(s.at!)}.` };
    if (s.status === 'contacted' && s.at && now - Date.parse(s.at) < 30 * DAY) return { warn: `Contacted for ${other.title} on ${shortDay(s.at)}.` };
  }
  return {};
}

/** May this colleague be asked about this person? Prepared (copied, unsent) requests only warn. */
export function checkReference(entries: readonly Entry[], comeet: readonly ComeetRecord[], candidateKey: string, employeeId: string, employeeName: string): Check {
  if (personFlags(entries, comeet, candidateKey).doNotContact) return { block: 'Asked not to be contacted.' };
  const asked = current(entries).filter((e): e is Extract<Entry, { kind: 'reference' }> => e.kind === 'reference' && e.candidateKey === candidateKey && e.employeeId === employeeId);
  const sent = asked.filter(counts).at(-1);
  if (sent) return { block: `${firstName(employeeName)} was already asked on ${shortDay(sent.at)}.` };
  const prepared = asked.filter((e) => e.state === 'prepared').at(-1);
  if (prepared) return { warn: `A request to ${firstName(employeeName)} was prepared on ${shortDay(prepared.at)} but never marked sent.` };
  return {};
}

/** Seeded examples (simulated) so reviewers see the rules without clicking around. */
export const SEEDED: readonly Entry[] = [
  // Declined one role, open for another.
  { id: 'seed-1', kind: 'invite', candidateKey: 'C-HS029', jobId: 'JOB002', jobTitle: 'Backend Engineer', channel: 'comeet', state: 'sent', simulated: true, by: 'Gal Ofer', at: '2026-10-05T09:00:00Z' },
  { id: 'seed-2', kind: 'outcome', candidateKey: 'C-HS029', jobId: 'JOB002', jobTitle: 'Backend Engineer', outcome: 'declined', simulated: true, by: 'Gal Ofer', at: '2026-10-08T14:00:00Z' },
  // Copied but not sent: prepared, never counted as contact.
  { id: 'seed-3', kind: 'reference', candidateKey: 'C-HS021', employeeId: 'WSC003', employeeName: 'Noa Shapiro', channel: 'copy', state: 'prepared', simulated: true, by: 'Neta Harel', at: '2026-10-14T11:00:00Z' },
];

// The store: seeded examples plus what was done in this browser. Storage can be blocked; memory still works.
const STORAGE_KEY = 'wsc-activity-v1';
function load(): Entry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Entry[]) : [];
  } catch {
    return [];
  }
}
let added: Entry[] = typeof window === 'undefined' ? [] : load();
let snapshot: readonly Entry[] = [...SEEDED, ...added];
const listeners = new Set<() => void>();
function save() {
  snapshot = [...SEEDED, ...added];
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(added));
  } catch {
    // Private mode or blocked storage: keep it in memory for this visit.
  }
  listeners.forEach((l) => l());
}

type NewEntry = Entry extends infer E ? (E extends Entry ? Omit<E, 'id' | 'at' | 'by' | 'simulated'> : never) : never;
/** Record actions (all simulated here). */
export function record(...items: NewEntry[]): void {
  const at = new Date().toISOString();
  added = [...added, ...items.map((e, i) => ({ ...e, id: `a-${Date.now().toString(36)}-${i}-${Math.random().toString(36).slice(2, 6)}`, at, by: 'You', simulated: true }) as Entry)];
  save();
}
/** For tests and a demo reset: forget this browser's entries (seeded examples stay). */
export function resetActivity(): void {
  added = [];
  save();
}
export function useActivity(): readonly Entry[] {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => snapshot,
    () => snapshot,
  );
}

/** A plain-words line for the profile's Activity card. */
export function describe(e: Entry): string {
  switch (e.kind) {
    case 'invite':
      return `Invited to ${e.jobTitle}`;
    case 'reference':
      return `Asked ${e.employeeName} for a reference`;
    case 'outcome':
      return `${e.outcome === 'declined' ? 'Declined' : e.outcome === 'responded' ? 'Responded about' : 'Interested in'} ${e.jobTitle}`;
    case 'do_not_contact':
      return 'Asked not to be contacted';
  }
}
export const STATE_LABEL: Record<SendState, string> = { prepared: 'Prepared', sent: 'Sent', failed: 'Failed', confirmed: 'Confirmed' };

/** The table's status for a person: the selected role's, or their most advanced role's when none is selected. */
export function statusIn(
  entries: readonly Entry[],
  candidateKey: string,
  jobs: readonly { jobId: string; title: string }[],
  jobId: string | null,
): RoleState & { job?: { jobId: string; title: string } } {
  const comeet = comeetFor(candidateKey);
  const job = jobId ? jobs.find((j) => j.jobId === jobId) : undefined;
  return job ? { ...roleStatus(entries, comeet, candidateKey, job), job } : overallStatus(entries, comeet, candidateKey, jobs);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthYear = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
/** The status in words for a table chip's band, or null when nothing has happened for this role. */
export function statusLine(entries: readonly Entry[], candidateKey: string, job: { jobId: string; title: string }): { text: string; simulated: boolean } | null {
  const comeet = comeetFor(candidateKey);
  const s = roleStatus(entries, comeet, candidateKey, job);
  if (s.status === 'not_contacted') return null;
  const rec = comeet.find((r) => r.job === job.title);
  if (rec && (s.status === 'in_process' || s.status === 'comeet_lead' || s.status === 'comeet_closed'))
    return { text: `${rec.outcome} · ${monthYear(rec.date)}`, simulated: false };
  return { text: `${STATUS_LABEL[s.status]} · ${s.at ? shortDay(s.at) : ''}`.replace(/ · $/, ''), simulated: !!s.simulated };
}

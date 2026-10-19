/**
 * Outreach history (docs/contact-tracking-plan.md): who was contacted, how, and for which role.
 *
 * Everything here is simulated: nothing is sent. Entries live in this browser only (view/actionStore.ts),
 * plus a few seeded examples. The rules are pure functions so they can be tested without the view; the
 * store runs the same rules inside one transaction when it records an action.
 *
 * Every entry is owned by a durable person ID (Candidate.candidateKey, pipeline/identity.ts), never a name.
 */
import comeetHistory from '../data/demo_comeet.json';
import { identityBlock, mayOwnLegacyKey, type Candidate } from '../pipeline';
import { normalize } from '../pipeline/text';

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
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthYear = (iso: string) => `${MONTHS[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;

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
  const warn = otherRoleWarning(entries, comeet, candidateKey, job, otherJobs, now);
  return warn ? { warn } : {};
}

/** Worth knowing before approaching someone about `job`: a decline or recent contact for another role, or a past Comeet rejection. */
function otherRoleWarning(
  entries: readonly Entry[],
  comeet: readonly ComeetRecord[],
  candidateKey: string,
  job: { jobId: string; title: string },
  otherJobs: readonly { jobId: string; title: string }[],
  now: number,
): string | undefined {
  for (const other of otherJobs) {
    if (other.jobId === job.jobId) continue;
    const s = roleStatus(entries, comeet, candidateKey, other);
    if (s.status === 'declined') return `Declined ${other.title} on ${shortDay(s.at!)}.`;
    if (s.status === 'contacted' && s.at && now - Date.parse(s.at) < 30 * DAY) return `Contacted for ${other.title} on ${shortDay(s.at)}.`;
  }
  // A past Comeet rejection for any other role (open or not). A withdrawal or a lead is not a rejection.
  const rejected = comeet
    .filter((r) => r.job !== job.title && r.kind !== 'lead' && /^rejected/i.test(r.outcome))
    .sort((x, y) => y.date.localeCompare(x.date))[0];
  if (rejected) return `${rejected.outcome} for ${rejected.job} in Comeet · ${monthYear(rejected.date)}.`;
  return undefined;
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

/**
 * The request to show for one colleague on a profile: the latest sent or confirmed one wins over any later
 * prepared copy (copying the text again does not undo a send), otherwise the latest request.
 */
export function referenceSummary(entries: readonly Entry[], candidateKey: string, employeeId: string): Extract<Entry, { kind: 'reference' }> | undefined {
  const asked = current(entries).filter((e): e is Extract<Entry, { kind: 'reference' }> => e.kind === 'reference' && e.candidateKey === candidateKey && e.employeeId === employeeId);
  return asked.filter(counts).at(-1) ?? asked.at(-1);
}

/** Seeded examples (simulated) so reviewers see the rules without clicking around. */
export const SEEDED: readonly Entry[] = [
  // Declined one role, open for another.
  { id: 'seed-1', kind: 'invite', candidateKey: 'C-HS029', jobId: 'JOB002', jobTitle: 'Backend Engineer', channel: 'comeet', state: 'sent', simulated: true, by: 'Gal Ofer', at: '2026-10-05T09:00:00Z' },
  { id: 'seed-2', kind: 'outcome', candidateKey: 'C-HS029', jobId: 'JOB002', jobTitle: 'Backend Engineer', outcome: 'declined', simulated: true, by: 'Gal Ofer', at: '2026-10-08T14:00:00Z' },
  // Copied but not sent: prepared, never counted as contact.
  { id: 'seed-3', kind: 'reference', candidateKey: 'C-HS021', employeeId: 'WSC003', employeeName: 'Noa Shapiro', channel: 'copy', state: 'prepared', simulated: true, by: 'Neta Harel', at: '2026-10-14T11:00:00Z' },
];

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

// ---------- Person gate, handoff rule and history note (shared by both apps and the store) ----------

/** What the rules need to know about a person: their durable ID and how sure we are who they are. */
export type PersonRef = Pick<Candidate, 'candidateKey' | 'fullName' | 'sourceContactIds' | 'identity'>;

/** Who the store first saved history for, under a person ID. Lets a reused ID be noticed instead of inherited. */
export interface StoredPerson {
  personId: string;
  anchor: string;
  fullName: string;
  /** ISO time of the first saved action. */
  since: string;
}

/**
 * Saved history from the old (v1) store whose owner cannot be told from its key alone. Kept for review:
 * it blocks actions for anyone it might belong to until a recruiter assigns it or rules them out.
 */
export interface HeldEntry {
  id: string;
  /** The key the old app saved it under (e.g. C-HS076, C-alex-review). */
  legacyKey: string;
  entry: Entry;
  /** Set once a recruiter says whose it is; it then lives in the history under that person ID. */
  assignedTo?: string;
  /** People a recruiter said it does not belong to. */
  notFor: string[];
}

/** Everything the rules read: all entries in force plus the store's identity bookkeeping. */
export interface HistoryState {
  entries: readonly Entry[];
  people: ReadonlyMap<string, StoredPerson>;
  held: readonly HeldEntry[];
}

/** Old history that may be this person's and is still waiting for review. */
export function heldFor(state: Pick<HistoryState, 'held'>, person: PersonRef): HeldEntry[] {
  return state.held.filter((h) => !h.assignedTo && !h.notFor.includes(person.candidateKey) && mayOwnLegacyKey(person, h.legacyKey));
}

/**
 * Saved history under this ID that was recorded for someone with a different name. Only a source-ID anchor can
 * be reused this way (an app-assigned contact ID given to someone else after a reload); emails and LinkedIn
 * URLs identify the person themselves.
 */
export function storedAsSomeoneElse(state: Pick<HistoryState, 'people'>, person: PersonRef): StoredPerson | undefined {
  const stored = state.people.get(person.candidateKey);
  if (!stored) return undefined;
  if (stored.anchor !== person.identity.anchor) return stored;
  return person.identity.kind === 'source_id' && normalize(stored.fullName) !== normalize(person.fullName) ? stored : undefined;
}

/** Why no action (invite, reference request, outcome, handoff) may be recorded for this person yet. */
export function actionGate(state: Pick<HistoryState, 'people' | 'held'>, person: PersonRef): string | undefined {
  const identity = identityBlock(person.identity);
  if (identity) return identity;
  const other = storedAsSomeoneElse(state, person);
  if (other) return `Saved history under this contact was recorded for ${other.fullName}. Review it on the profile first.`;
  if (heldFor(state, person).length > 0) return 'Saved history from an earlier version may belong to this person. Review it on the profile first.';
  return undefined;
}

/** checkInvite plus the person gate: what every invite button and the store use. */
export function inviteCheck(
  state: HistoryState,
  person: PersonRef,
  job: { jobId: string; title: string },
  otherJobs: readonly { jobId: string; title: string }[],
  now = Date.now(),
): Check {
  const gate = actionGate(state, person);
  if (gate) return { block: gate };
  return checkInvite(state.entries, comeetFor(person.candidateKey), person.candidateKey, job, otherJobs, now);
}

/** checkReference plus the person gate. */
export function referenceCheck(state: HistoryState, person: PersonRef, employeeId: string, employeeName: string): Check {
  const gate = actionGate(state, person);
  if (gate) return { block: gate };
  return checkReference(state.entries, comeetFor(person.candidateKey), person.candidateKey, employeeId, employeeName);
}

/**
 * May this person be handed off to the ATS for this role? Not the invite rule: a handoff sends nothing.
 * Blocks: an unresolved identity or history under review, and an active Comeet process for any role.
 * Allowed but shown: a decline or earlier contact for this role (the note carries it), do-not-contact, and the
 * invite rule's other-role warnings. A decline blocks another invite for that role, not the handoff.
 */
export function checkHandoff(
  state: HistoryState,
  person: PersonRef,
  job: { jobId: string; title: string },
  jobs: readonly { jobId: string; title: string }[],
  now = Date.now(),
): Check {
  const gate = actionGate(state, person);
  if (gate) return { block: gate };
  const key = person.candidateKey;
  const comeet = comeetFor(key);
  const flags = personFlags(state.entries, comeet, key);
  if (flags.inProcess)
    return { block: `Already in process for ${flags.inProcess.job} in Comeet (${flags.inProcess.outcome.replace(/^in process:\s*/i, '')}). The owning recruiter decides.` };
  const warns: string[] = [];
  if (flags.doNotContact) warns.push('Asked not to be contacted.');
  const here = roleStatus(state.entries, comeet, key, job);
  if (here.status === 'declined') warns.push(`Declined ${job.title} on ${shortDay(here.at!)}.`);
  else if (here.status === 'contacted' || here.status === 'responded' || here.status === 'interested')
    warns.push(`${STATUS_LABEL[here.status]} for ${job.title} on ${shortDay(here.at!)}.`);
  const other = otherRoleWarning(state.entries, comeet, key, job, jobs, now);
  if (other) warns.push(other);
  return warns.length ? { warn: warns.join(' ') } : {};
}

const longDay = (iso: string) =>
  new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/**
 * The person's recorded contact history in words, oldest first: sent invites, outcomes, do-not-contact and
 * Comeet records. Empty when nothing is recorded, which is not the same as "never contacted".
 */
export function contactHistory(entries: readonly Entry[], comeet: readonly ComeetRecord[], candidateKey: string): string[] {
  const ours = current(entries)
    .filter((e) => e.candidateKey === candidateKey && (e.kind === 'outcome' || e.kind === 'do_not_contact' || (e.kind === 'invite' && counts(e))))
    .sort((x, y) => Date.parse(x.at) - Date.parse(y.at))
    .map((e) => `${describe(e)} on ${longDay(e.at)}${e.by && e.by !== 'You' ? ` by ${e.by}` : ''}${e.simulated ? ' (simulated)' : ''}`);
  const fromComeet = [...comeet]
    .sort((x, y) => x.date.localeCompare(y.date))
    .map((r) => `Comeet: ${r.outcome} for ${r.job} (${monthYear(r.date)})`);
  return [...fromComeet, ...ours];
}

/** The ATS note: what is actually recorded, or "No contact recorded" (never "not contacted"). */
export function handoffNote(entries: readonly Entry[], comeet: readonly ComeetRecord[], candidateKey: string, jobTitle: string): string {
  const history = contactHistory(entries, comeet, candidateKey);
  const said = history.length ? `Contact history: ${history.join('; ')}.` : 'No contact recorded.';
  return `Handed over from HubSpot for ${jobTitle}. ${said} The owning recruiter decides on outreach.`;
}

/**
 * One logical action, for deduplication: an invite is person + role, a reference request is person + colleague.
 * Only entries that count as contact (sent or confirmed) have one; drafts and failures can repeat.
 */
export function dedupKeyFor(e: Entry): string | undefined {
  if (e.kind === 'invite' && counts(e)) return `invite|${e.candidateKey}|${e.jobId}`;
  if (e.kind === 'reference' && counts(e)) return `reference|${e.candidateKey}|${e.employeeId}`;
  if (e.kind === 'do_not_contact') return `do_not_contact|${e.candidateKey}`;
  return undefined;
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const oneOf = (v: unknown, options: readonly string[]) => isStr(v) && options.includes(v);
const CHANNELS = ['comeet', 'slack', 'email', 'copy'] as const;
const STATES = ['prepared', 'sent', 'failed', 'confirmed'] as const;
/** Saved data is untrusted: an entry is kept only if it has every field the views read. */
export function isEntry(v: unknown): v is Entry {
  if (!v || typeof v !== 'object') return false;
  const e = v as Record<string, unknown>;
  if (!isStr(e.id) || !isStr(e.candidateKey) || !isStr(e.by) || !isStr(e.at) || Number.isNaN(Date.parse(e.at))) return false;
  if (typeof e.simulated !== 'boolean' || (e.supersedes !== undefined && !isStr(e.supersedes))) return false;
  switch (e.kind) {
    case 'invite':
      return isStr(e.jobId) && isStr(e.jobTitle) && oneOf(e.channel, CHANNELS) && oneOf(e.state, STATES);
    case 'reference':
      return isStr(e.employeeId) && isStr(e.employeeName) && oneOf(e.channel, CHANNELS) && oneOf(e.state, STATES);
    case 'outcome':
      return isStr(e.jobId) && isStr(e.jobTitle) && oneOf(e.outcome, ['responded', 'interested', 'declined']);
    case 'do_not_contact':
      return true;
    default:
      return false;
  }
}

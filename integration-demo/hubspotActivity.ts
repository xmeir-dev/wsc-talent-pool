/**
 * The recruiter app's outreach history (view/activity.ts) as HubSpot would log it on the contact.
 *
 * HubSpot's native "Last contacted" follows logged communications (email, call, meeting), not notes or tasks.
 * So only an invite the candidate actually received (sent or confirmed) counts. A draft, a copied message,
 * a failed send, a reference request (it goes to a WSC colleague) or a new Comeet record does not.
 */
import { current, describe, roleStatus, shortDay, STATE_LABEL, STATUS_LABEL, type Entry } from '../view/activity';

export interface LoggedActivity {
  id: string;
  type: 'Logged email' | 'Note' | 'Task';
  title: string;
  /** YYYY-MM-DD, like the timeline's event dates. */
  date: string;
  by: string;
}

const reached = (e: Entry) => e.kind === 'invite' && (e.state === 'sent' || e.state === 'confirmed');

function logged(e: Entry): Pick<LoggedActivity, 'type' | 'title'> {
  if (e.kind === 'invite') return reached(e) ? { type: 'Logged email', title: describe(e) } : { type: 'Note', title: `${describe(e)} · ${STATE_LABEL[e.state]}` };
  if (e.kind === 'reference') return { type: 'Task', title: `${describe(e)} · ${STATE_LABEL[e.state]}` };
  return { type: 'Note', title: describe(e) };
}

/** The person's entries for the contact timeline, newest first. */
export function timeline(entries: readonly Entry[], candidateKey: string): LoggedActivity[] {
  return current(entries)
    .filter((e) => e.candidateKey === candidateKey)
    .sort((x, y) => Date.parse(y.at) - Date.parse(x.at))
    .map((e) => ({ id: e.id, ...logged(e), date: e.at.slice(0, 10), by: e.by }));
}

/** HubSpot's "Last contacted" (YYYY-MM-DD), or null when the candidate has not been reached. */
export function lastContacted(entries: readonly Entry[], candidateKey: string): string | null {
  const times = current(entries)
    .filter((e) => e.candidateKey === candidateKey && reached(e))
    .map((e) => e.at)
    .sort();
  return times.at(-1)?.slice(0, 10) ?? null;
}

/**
 * Outreach for one person and one role, for a role's shortlist view: "Declined · 8 Oct", or "--".
 * Comeet's own records have their own column, so they are left out here.
 */
export function outreachStatus(entries: readonly Entry[], candidateKey: string, job: { jobId: string; title: string }): string {
  const s = roleStatus(entries, [], candidateKey, job);
  if (s.status === 'not_contacted') return '--';
  return s.at ? `${STATUS_LABEL[s.status]} · ${shortDay(s.at)}` : STATUS_LABEL[s.status];
}

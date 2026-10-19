import { useMemo, useState, type ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { BubbleChatIcon, Cancel01Icon, MailAdd01Icon, SlackIcon } from '@hugeicons/core-free-icons';
import { Avatar, Button, Popover } from '@meir-labs/ui-kit';
import type { Candidate, Employee, Job } from '../pipeline';
import type { Attendee } from './attendees';
import { connectionPeople } from './AskConnection';
import { inviteMessage } from './InviteToJob';
import comeetIcon from './assets/comeet.png';
import { DemoBadge } from './DemoBadge';
import { checkInvite, checkReference, comeetFor, record, useActivity } from './activity';
import { AVATAR, initials } from './avatars';

const firstName = (name: string) => name.split(' ')[0] ?? name;
const names = (cs: Candidate[]) =>
  cs.length <= 2 ? cs.map((c) => c.fullName).join(' and ') : `${cs.slice(0, -1).map((c) => c.fullName).join(', ')} and ${cs.at(-1)!.fullName}`;

/** One request per colleague, covering everyone selected who they know. */
function askMessage(employee: Employee, people: Candidate[]): string {
  const them = people.length === 1 ? 'them' : 'any of them';
  return [
    `Hi ${firstName(employee.fullName)},`,
    `${names(people)} came up in our conference talent pool for open roles. Do you know ${them}? Would you recommend ${them}, and would you be open to a quick intro?`,
    'Thanks!',
  ].join('\n\n');
}

/** A panel opened from the bulk bar, styled like the single Ask and Invite panels. */
function BulkPanel({ label, icon, title, children }: { label: string; icon: ReactNode; title: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover placement="bottom-start" open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="ml-btn ml-btn-secondary ml-btn-size-sm">
        <span className="ml-btn-icon-slot" aria-hidden="true">
          {icon}
        </span>
        <span className="ml-btn-label">{label}</span>
      </Popover.Trigger>
      <Popover.Content className="ask bulk-pop" aria-label={title}>
        <div className="ask-head">
          <span className="ask-to">{title}</span>
          <span className="bulk-head-end">
            <DemoBadge />
            <Button variant="icon" size="sm" aria-label="Close" onClick={() => setOpen(false)}>
              <HugeiconsIcon icon={Cancel01Icon} size={16} />
            </Button>
          </span>
        </div>
        {children(() => setOpen(false))}
      </Popover.Content>
    </Popover>
  );
}

/** Shown above the table once rows are ticked: invite them all, or ask their WSC connections, in one go. */
export function BulkActions({ selected, jobs, onClear }: { selected: Attendee[]; jobs: Job[]; onClear: () => void }) {
  const [status, setStatus] = useState<string | null>(null);
  // Each person goes to their own best job (shortlisted first); people with no fitting job or no email are skipped.
  const entries = useActivity();
  const plan = useMemo(() => {
    const byJob = new Map<string, { job: Job; people: Candidate[] }>();
    let noJob = 0;
    let noEmail = 0;
    // Same rules as a single invite: anyone blocked is skipped, with the reason shown.
    const blocked: { name: string; reason: string }[] = [];
    for (const p of selected) {
      const best = [...p.relevantFor].sort((x, y) => (x.outcome === 'shortlist' ? 0 : 1) - (y.outcome === 'shortlist' ? 0 : 1))[0];
      const key = p.candidate.candidateKey;
      const check =
        best &&
        checkInvite(
          entries,
          comeetFor(key),
          key,
          { jobId: best.job.jobId, title: best.job.title },
          p.relevantFor.map((r) => ({ jobId: r.job.jobId, title: r.job.title })),
        );
      if (!best) noJob++;
      else if (!p.candidate.email) noEmail++;
      else if (check?.block) blocked.push({ name: p.candidate.fullName, reason: check.block });
      else {
        const g = byJob.get(best.job.jobId) ?? { job: best.job, people: [] };
        g.people.push(p.candidate);
        byJob.set(best.job.jobId, g);
      }
    }
    const groups = jobs.flatMap((j) => byJob.get(j.jobId) ?? []);
    return { groups, total: groups.reduce((n, g) => n + g.people.length, 0), noJob, noEmail, blocked };
  }, [selected, jobs, entries]);

  // Colleague → the selected people they know.
  const asks = useMemo(() => {
    const by = new Map<string, { employee: Employee; people: Candidate[] }>();
    let skipped = 0;
    for (const p of selected) {
      const key = p.candidate.candidateKey;
      for (const { employee } of connectionPeople(p.any.a)) {
        // A colleague is asked about a person once; a blocked pair is left out.
        if (checkReference(entries, comeetFor(key), key, employee.employeeId, employee.fullName).block) {
          skipped++;
          continue;
        }
        const g = by.get(employee.employeeId) ?? { employee, people: [] };
        g.people.push(p.candidate);
        by.set(employee.employeeId, g);
      }
    }
    return Object.assign([...by.values()].sort((x, y) => y.people.length - x.people.length), { skipped });
  }, [selected, entries]);
  const unconnected = selected.filter((p) => !asks.some((g) => g.people.includes(p.candidate))).length;

  if (!selected.length) return null;
  const preview = plan.groups[0];

  return (
    <div className="bulk-bar" role="region" aria-label="Selected attendees">
      <span className="bulk-count">{selected.length} selected</span>
      <BulkPanel label="Ask WSC connections" icon={<HugeiconsIcon icon={BubbleChatIcon} size={16} strokeWidth={1.75} />} title="Ask WSC connections">
        {(close) =>
          asks.length ? (
            <>
              <ul className="bulk-asks">
                {asks.map(({ employee, people }) => (
                  <li key={employee.employeeId}>
                    <Avatar size="sm" src={AVATAR[employee.employeeId]} fallback={initials(employee.fullName)} aria-hidden="true" />
                    <span className="bulk-ask-who">
                      <span>{employee.fullName}</span>
                      <span className="muted">about {names(people)}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="muted bulk-note">Preview for {asks[0]!.employee.fullName}:</p>
              <textarea className="ask-text" readOnly rows={6} value={askMessage(asks[0]!.employee, asks[0]!.people)} aria-label="Request preview" />
              <div className="ask-actions">
                <Button
                  size="sm"
                  variant="primary"
                  leftIcon={<HugeiconsIcon icon={SlackIcon} size={16} aria-hidden="true" />}
                  onClick={() => {
                    record(
                      ...asks.flatMap(({ employee, people }) =>
                        people.map((c) => ({
                          kind: 'reference' as const,
                          candidateKey: c.candidateKey,
                          employeeId: employee.employeeId,
                          employeeName: employee.fullName,
                          channel: 'slack' as const,
                          state: 'sent' as const,
                        })),
                      ),
                    );
                    setStatus(`Sent · Simulated: ${asks.length} Slack ${asks.length === 1 ? 'message' : 'messages'}, one per colleague.`);
                    close();
                  }}
                >
                  Send {asks.length} in Slack
                </Button>
                {unconnected > 0 && <span className="ask-status muted">{unconnected} selected have no WSC connection</span>}
                {asks.skipped > 0 && <span className="ask-status muted">{asks.skipped} already asked, left out</span>}
              </div>
            </>
          ) : (
            <p className="muted">
              {asks.skipped > 0 ? 'Every colleague connected to them was already asked.' : 'No one at WSC is connected to the selected people.'}
            </p>
          )
        }
      </BulkPanel>
      <BulkPanel
        label="Invite to jobs"
        icon={<HugeiconsIcon icon={MailAdd01Icon} size={16} strokeWidth={1.75} />}
        title={`Invite ${plan.total} to ${plan.groups.length === 1 ? 'a job' : 'jobs'}`}
      >
        {(close) => (
          <>
            {/* Who goes where: each person's best-fit job. */}
            <ul className="bulk-asks">
              {plan.groups.map(({ job, people }) => (
                <li key={job.jobId}>
                  <span className="bulk-ask-who">
                    <span>
                      {job.title} <span className="muted">· {people.length}</span>
                    </span>
                    <span className="muted">{names(people)}</span>
                  </span>
                </li>
              ))}
            </ul>
            {(plan.noJob > 0 || plan.noEmail > 0) && (
              <p className="muted bulk-note">
                Skipped:{' '}
                {[plan.noJob && `${plan.noJob} not a fit for any open job`, plan.noEmail && `${plan.noEmail} without an email`].filter(Boolean).join(', ')}
              </p>
            )}
            {plan.blocked.length > 0 && (
              <div className="check-note is-block">
                <p className="bulk-note">{plan.blocked.length} blocked:</p>
                <ul className="bulk-blocked">
                  {plan.blocked.map((b) => (
                    <li key={b.name}>
                      {b.name}: {b.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {preview && (
              <>
                <p className="muted bulk-note">
                  Each invite is written for that person and their job. Preview for {preview.people[0]!.fullName}:
                </p>
                <textarea
                  className="ask-text"
                  readOnly
                  rows={8}
                  value={inviteMessage(preview.people[0]!, preview.job)}
                  aria-label={`Invite preview for ${preview.people[0]!.fullName}`}
                />
              </>
            )}
            <div className="ask-actions">
              <Button
                size="sm"
                variant="primary"
                disabled={!plan.total}
                leftIcon={<img src={comeetIcon} alt="" width={16} height={16} />}
                onClick={() => {
                  record(
                    ...plan.groups.flatMap(({ job, people }) =>
                      people.map((c) => ({
                        kind: 'invite' as const,
                        candidateKey: c.candidateKey,
                        jobId: job.jobId,
                        jobTitle: job.title,
                        channel: 'comeet' as const,
                        state: 'sent' as const,
                      })),
                    ),
                  );
                  setStatus(`Sent · Simulated: ${plan.total} ${plan.total === 1 ? 'invite' : 'invites'} through Comeet.`);
                  close();
                }}
              >
                Send {plan.total} {plan.total === 1 ? 'invite' : 'invites'}
              </Button>
            </div>
          </>
        )}
      </BulkPanel>
      <span className="bulk-status muted" role="status">
        {status}
      </span>
      <button
        type="button"
        className="bulk-clear"
        onClick={() => {
          setStatus(null);
          onClear();
        }}
      >
        Clear
      </button>
    </div>
  );
}

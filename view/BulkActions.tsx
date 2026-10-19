import { useMemo, useState, type ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { BubbleChatIcon, Cancel01Icon, MailAdd01Icon, SlackIcon } from '@hugeicons/core-free-icons';
import { Avatar, Button, Popover, Select } from '@meir-labs/ui-kit';
import type { Candidate, Employee, Job } from '../pipeline';
import type { Attendee } from './attendees';
import { connectionPeople } from './AskConnection';
import { inviteMessage } from './InviteToJob';
import comeetIcon from './assets/comeet.png';
import { DemoBadge } from './DemoBadge';
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
  const [jobId, setJobId] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  // Default job: the one most of the selected people fit.
  const fitted = useMemo(() => {
    const count = new Map<string, number>();
    for (const p of selected) for (const r of p.relevantFor) count.set(r.job.jobId, (count.get(r.job.jobId) ?? 0) + 1);
    return [...count.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? jobs[0]?.jobId ?? '';
  }, [selected, jobs]);
  const job = jobs.find((j) => j.jobId === (jobId || fitted)) ?? jobs[0];
  const reachable = selected.filter((p) => p.candidate.email);

  // Colleague → the selected people they know.
  const asks = useMemo(() => {
    const by = new Map<string, { employee: Employee; people: Candidate[] }>();
    for (const p of selected) {
      for (const { employee } of connectionPeople(p.any.a)) {
        const g = by.get(employee.employeeId) ?? { employee, people: [] };
        g.people.push(p.candidate);
        by.set(employee.employeeId, g);
      }
    }
    return [...by.values()].sort((x, y) => y.people.length - x.people.length);
  }, [selected]);
  const unconnected = selected.filter((p) => !asks.some((g) => g.people.includes(p.candidate))).length;

  if (!selected.length || !job) return null;
  const first = reachable[0]?.candidate;

  return (
    <div className="bulk-bar" role="region" aria-label="Selected attendees">
      <span className="bulk-count">{selected.length} selected</span>
      <BulkPanel label="Invite to jobs" icon={<HugeiconsIcon icon={MailAdd01Icon} size={16} strokeWidth={1.75} />} title={`Invite ${selected.length} to a job`}>
        {(close) => (
          <>
            <Select
              value={job.jobId}
              onValueChange={(v) => {
                setJobId(v);
                setStatus(null);
              }}
            >
              <Select.Trigger aria-label="Job" />
              <Select.Content>
                {jobs.map((j) => (
                  <Select.Item key={j.jobId} value={j.jobId}>
                    {j.title}
                  </Select.Item>
                ))}
              </Select.Content>
            </Select>
            {first && (
              <>
                <p className="muted bulk-note">
                  Each invite is written for that person: their name, where they met WSC, their company. Preview for {first.fullName}:
                </p>
                <textarea className="ask-text" readOnly rows={8} value={inviteMessage(first, job)} aria-label={`Invite preview for ${first.fullName}`} />
              </>
            )}
            <div className="ask-actions">
              <Button
                size="sm"
                variant="primary"
                disabled={!reachable.length}
                leftIcon={<img src={comeetIcon} alt="" width={16} height={16} />}
                onClick={() => {
                  setStatus(`Comeet would add ${reachable.length} to ${job.title} and send each invite.`);
                  close();
                }}
              >
                Send {reachable.length} {reachable.length === 1 ? 'invite' : 'invites'}
              </Button>
              {reachable.length < selected.length && (
                <span className="ask-status muted">{selected.length - reachable.length} without an email are skipped</span>
              )}
            </div>
          </>
        )}
      </BulkPanel>
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
                    setStatus(`${asks.length} Slack ${asks.length === 1 ? 'message' : 'messages'} would go out, one per colleague.`);
                    close();
                  }}
                >
                  Send {asks.length} in Slack
                </Button>
                {unconnected > 0 && <span className="ask-status muted">{unconnected} selected have no WSC connection</span>}
              </div>
            </>
          ) : (
            <p className="muted">No one at WSC is connected to the selected people.</p>
          )
        }
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

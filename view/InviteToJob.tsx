import { useState, type ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, MailAdd01Icon } from '@hugeicons/core-free-icons';
import { Avatar, Button, Popover, Select } from '@meir-labs/ui-kit';
import type { Candidate, Job } from '../pipeline';
import recruiters from '../data/demo_recruiters.json';
import type { Relevant } from './attendees';
import comeetIcon from './assets/comeet.png';
import { initials } from './avatars';

const RECRUITERS: Record<string, { id: string; name: string }> = recruiters.byConference;
const firstName = (name: string) => name.split(' ')[0] ?? name;

/** Signed by the recruiter who met them (made up, see data/demo_recruiters.json). */
function senderFor(c: Candidate) {
  return c.attendances.map((at) => RECRUITERS[at.conferenceName]).find(Boolean) ?? null;
}

export function inviteMessage(c: Candidate, job: Job): string {
  const at = c.attendances[0];
  const sender = senderFor(c);
  const met = at ? ` We met at ${at.conferenceName}.` : '';
  const now = c.profile?.currentCompany ? ` and your work at ${c.profile.currentCompany} stood out` : '';
  return [
    `Hi ${firstName(c.fullName)},`,
    `I'm ${sender ? `${firstName(sender.name)} from` : 'on'} the recruiting team at WSC Sports.${met} We're hiring a ${job.title}${now}.`,
    'Would you be open to a quick chat? The role details are linked below.',
    sender ? `Best,\n${sender.name}` : 'Best,\nWSC Sports Recruiting',
  ].join('\n\n');
}

/** The profile's one call to action: a drafted invite to a job, sent through Comeet. */
export function InviteToJob({ c, fits }: { c: Candidate; fits: { job: Job; outcome: Relevant }[] }) {
  const [open, setOpen] = useState(false);
  const [jobId, setJobId] = useState(fits[0]?.job.jobId ?? '');
  const [text, setText] = useState<string | null>(null);
  const [status, setStatus] = useState<ReactNode>(null);
  const job = fits.find((f) => f.job.jobId === jobId)?.job ?? fits[0]?.job;
  if (!job) return null;
  const message = text ?? inviteMessage(c, job);

  return (
    <Popover
      placement="bottom-end"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setStatus(null);
      }}
    >
      <Popover.Trigger className="ml-btn ml-btn-primary ml-btn-size-md">
        <span className="ml-btn-icon-slot" aria-hidden="true">
          <HugeiconsIcon icon={MailAdd01Icon} size={16} strokeWidth={1.75} />
        </span>
        <span className="ml-btn-label">Invite to job</span>
      </Popover.Trigger>
      <Popover.Content className="ask" aria-label={`Invite ${c.fullName} to a job`}>
        <div className="ask-head">
          <span className="ask-to">
            <Avatar size="sm" fallback={initials(c.fullName)} aria-hidden="true" />
            {c.fullName}
          </span>
          <Button variant="icon" size="sm" aria-label="Close" onClick={() => setOpen(false)}>
            <HugeiconsIcon icon={Cancel01Icon} size={16} />
          </Button>
        </div>
        {fits.length > 1 ? (
          <Select
            value={job.jobId}
            onValueChange={(v) => {
              setJobId(v);
              setText(null);
              setStatus(null);
            }}
          >
            <Select.Trigger aria-label="Job" />
            <Select.Content>
              {fits.map((f) => (
                <Select.Item key={f.job.jobId} value={f.job.jobId}>
                  {f.job.title}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        ) : (
          <p className="ask-context">{job.title}</p>
        )}
        <textarea
          className="ask-text"
          value={message}
          onChange={(e) => setText(e.target.value)}
          rows={11}
          aria-label={`Invite to ${c.fullName}`}
        />
        <div className="ask-actions">
          <Button
            size="sm"
            variant="primary"
            disabled={!c.email}
            leftIcon={<img src={comeetIcon} alt="" width={16} height={16} className="invite-comeet" />}
            onClick={() =>
              setStatus(`Demo: Comeet would add ${firstName(c.fullName)} to ${job.title} and send this from there.`)
            }
          >
            Send invite
          </Button>
          <span className="ask-status muted" role="status">
            {c.email ? status : 'No email address to send to'}
          </span>
        </div>
      </Popover.Content>
    </Popover>
  );
}

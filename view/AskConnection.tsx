import { useMemo, useState, type KeyboardEvent, type ReactNode, type SyntheticEvent } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Cancel01Icon, Copy01Icon, Mail01Icon, SlackIcon } from '@hugeicons/core-free-icons';
import { Avatar, Button, Popover, Tag } from '@meir-labs/ui-kit';
import { sameEmployer, type Candidate, type Employee, type Job, type Period, type PossibleReference } from '../pipeline';
import type { Relevant } from './attendees';
import { AVATAR, initials } from './avatars';
import './ask-connection.css';

const THIS_YEAR = 2026;

/** Assumed address pattern: the data has no employee emails. */
export const employeeEmail = (e: Employee) => `${e.fullName.toLowerCase().replace(/[^a-z]+/g, '.')}@wsc-sports.com`;

interface Overlap {
  company: string;
  theirs: Period;
  mine: Period;
  together: Period;
}

const yearsOf = (p: Period) => ({
  start: p.start,
  end: p.end === Infinity ? THIS_YEAR : p.end,
});

/** Both people's years at the shared employer, from the possible-reference match. */
export function overlapFor(candidate: Candidate, employee: Employee, ref: PossibleReference | undefined): Overlap | null {
  if (!ref || !candidate.profile) return null;
  const together = { start: ref.overlapStart, end: ref.overlapEnd };
  const covers = (p: Period) => p.start <= together.start && p.end >= together.end;
  const mine = candidate.profile.pastRoles
    .filter((r) => sameEmployer(r.company, ref.company))
    .flatMap((r) => r.periods)
    .find(covers);
  const theirs = employee.workHistory
    .filter((j) => sameEmployer(j.company, ref.company))
    .flatMap((j) => j.periods)
    .find(covers);
  if (!mine || !theirs) return null;
  return {
    company: ref.company,
    theirs: yearsOf(theirs),
    mine: yearsOf(mine),
    together: yearsOf(together),
  };
}

const firstName = (name: string) => name.split(' ')[0] ?? name;
const span = (p: Period) => (p.start === p.end ? String(p.start) : `${p.start}–${p.end}`);

export function questions(first: string, worked: boolean) {
  return [
    worked ? `Did you work with ${first}?` : `Do you know ${first}?`,
    `Would you recommend ${first}?`,
    'Anything we should know before we reach out?',
    'Would you be open to a quick intro?',
  ];
}

export interface AskContext {
  candidate: Candidate;
  /** The job the candidate fits best, if any. */
  job: { job: Job; outcome: Relevant } | null;
}

export function draftMessage(ctx: AskContext, employee: Employee, overlap: Overlap | null, asks: string[]): string {
  const c = ctx.candidate;
  const p = c.profile;
  const role = p?.currentTitle && p.currentCompany ? ` (${p.currentTitle} at ${p.currentCompany})` : '';
  const fit = !ctx.job
    ? 'came up in our conference talent pool.'
    : ctx.job.outcome === 'shortlist'
      ? `is on our shortlist for ${ctx.job.job.title}.`
      : `is a possible fit for ${ctx.job.job.title}.`;
  const how = overlap ? `You were both at ${overlap.company} around ${span(overlap.together)}.` : "You're connected on LinkedIn.";
  const body = [`${c.fullName}${role} ${fit}`, how, ...asks].join(' ');
  return `Hi ${firstName(employee.fullName)},\n\n${body}\n\nThanks!`;
}

/** Two bars on one year axis; dashed guides and green labels mark the shared years. */
function Timeline({ o, theirName, myName }: { o: Overlap; theirName: string; myName: string }) {
  const from = Math.min(o.theirs.start, o.mine.start) - 1;
  const to = Math.max(o.theirs.end, o.mine.end) + 1;
  const x = (y: number) => `${((y - from) / (to - from)) * 100}%`;
  const bar = (p: Period, cls: string) => (
    <span className={`ask-fill ${cls}`} style={{ left: x(p.start), width: `calc(${x(p.end)} - ${x(p.start)})` }} />
  );
  const marks = [...new Set([o.theirs.start, o.mine.start, o.together.start, o.together.end])].sort((a, b) => a - b);
  return (
    <div className="ask-overlap">
      <strong>{o.company}</strong>
      <div
        className="ask-gantt"
        role="img"
        aria-label={`${theirName} ${span(o.theirs)}, ${myName} ${span(o.mine)} at ${o.company}`}
      >
        <span className="ask-lane-name">{theirName}</span>
        <span className="ask-track">{bar(o.theirs, 'is-theirs')}</span>
        <span className="ask-lane-name">{myName}</span>
        <span className="ask-track">{bar(o.mine, 'is-mine')}</span>
        <span />
        <span className="ask-axis">
          {[o.together.start, o.together.end].map((y) => (
            <span key={`g${y}`} className="ask-guide" style={{ left: x(y) }} />
          ))}
          {marks.map((y) => (
            <span
              key={y}
              className={`ask-year${y >= o.together.start && y <= o.together.end ? ' is-together' : ''}`}
              style={{ left: x(y) }}
            >
              {y}
            </span>
          ))}
        </span>
      </div>
    </div>
  );
}

const stop = (e: SyntheticEvent) => e.stopPropagation();
/** Keys stay inside the popover (the table row would otherwise treat Space and Enter as "open profile"), except Escape. */
const keepKeys = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') e.stopPropagation();
};

/** A WSC connection tag that opens a drafted request for a recommendation: copy, Slack or email. */
export function AskConnection({
  employee,
  refs,
  ctx,
}: {
  employee: Employee;
  refs: PossibleReference[];
  ctx: AskContext;
}) {
  const [open, setOpen] = useState(false);
  const theirFirst = firstName(employee.fullName);
  const myFirst = firstName(ctx.candidate.fullName);
  // The most recent shared employer is the likeliest to be remembered.
  const latest = useMemo(() => [...refs].sort((x, y) => y.overlapEnd - x.overlapEnd)[0], [refs]);
  const overlap = useMemo(() => overlapFor(ctx.candidate, employee, latest), [ctx.candidate, employee, latest]);
  const qs = questions(myFirst, !!overlap);
  const [picked, setPicked] = useState([true, true, true, false]);
  const [text, setText] = useState<string | null>(null);
  const [status, setStatus] = useState<ReactNode>(null);
  const message =
    text ??
    draftMessage(
      ctx,
      employee,
      overlap,
      qs.filter((_, i) => picked[i]),
    );

  const toggle = (i: number) => {
    setPicked((p) => p.map((v, j) => (j === i ? !v : v)));
    setText(null);
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      return true;
    } catch {
      return false;
    }
  };
  const email = `mailto:${employeeEmail(employee)}?subject=${encodeURIComponent(`Quick question about ${ctx.candidate.fullName}`)}&body=${encodeURIComponent(message)}`;

  return (
    <Popover
      // Beside the tag, so it is clamped into the viewport even on the last rows.
      placement="left-start"
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setStatus(null);
      }}
    >
      <Popover.Trigger
        className="ask-trigger"
        onClick={stop}
        onKeyDown={keepKeys}
        aria-label={`Ask ${employee.fullName} about ${ctx.candidate.fullName}`}
      >
        <Tag size="sm" className="conn-tag">
          <Avatar size="xs" src={AVATAR[employee.employeeId]} fallback={initials(employee.fullName)} aria-hidden="true" />
          {employee.fullName}
        </Tag>
      </Popover.Trigger>
      <Popover.Content
        className="ask"
        aria-label={`Ask ${employee.fullName} for a recommendation`}
        onClick={stop}
        onKeyDown={keepKeys}
      >
        <div className="ask-head">
          <span className="ask-to">
            <HugeiconsIcon icon={SlackIcon} size={16} aria-hidden="true" />
            {employee.fullName}
          </span>
          <Button variant="icon" size="sm" aria-label="Close" onClick={() => setOpen(false)}>
            <HugeiconsIcon icon={Cancel01Icon} size={16} />
          </Button>
        </div>
        {overlap ? (
          <Timeline o={overlap} theirName={theirFirst} myName={myFirst} />
        ) : (
          <p className="muted ask-linkedin">LinkedIn connection · no shared employer on record</p>
        )}
        <div className="ask-chips">
          {qs.map((q, i) => (
            <button key={q} type="button" className="ask-chip" aria-pressed={picked[i]} onClick={() => toggle(i)}>
              <span className="ask-check" aria-hidden="true" />
              {q}
            </button>
          ))}
        </div>
        <div className="ask-msg">
          <Avatar size="sm" fallback="You" aria-hidden="true" />
          <label className="ask-msg-body">
            <span className="ask-msg-from">
              You <span className="ask-msg-time">now</span>
            </span>
            <textarea
              value={message}
              onChange={(e) => setText(e.target.value)}
              rows={7}
              aria-label={`Message to ${employee.fullName}`}
            />
          </label>
        </div>
        <div className="ask-actions">
          <Button
            size="sm"
            variant="secondary"
            aria-label="Copy message"
            title="Copy message"
            onClick={async () => setStatus((await copy()) ? 'Copied' : 'Select the text and copy it')}
          >
            <HugeiconsIcon icon={Copy01Icon} size={16} />
          </Button>
          <Button
            size="sm"
            variant="primary"
            leftIcon={<HugeiconsIcon icon={SlackIcon} size={16} aria-hidden="true" />}
            onClick={async () =>
              setStatus((await copy()) ? `Copied. Paste it in your Slack DM to ${theirFirst}.` : 'Select the text and copy it')
            }
          >
            Send in Slack
          </Button>
          <Button size="sm" variant="secondary" href={email} leftIcon={<HugeiconsIcon icon={Mail01Icon} size={16} aria-hidden="true" />}>
            Email {theirFirst}
          </Button>
          <span className="ask-status muted" role="status">
            {status}
          </span>
        </div>
      </Popover.Content>
    </Popover>
  );
}

import { useMemo, useState, type KeyboardEvent, type ReactNode, type SyntheticEvent } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  BubbleChatIcon,
  Cancel01Icon,
  Copy01Icon,
  Mail01Icon,
  SlackIcon,
  Tick02Icon,
} from '@hugeicons/core-free-icons';
import { Avatar, Button, Popover, Tag } from '@meir-labs/ui-kit';
import {
  buildDataset,
  sameEmployer,
  type Candidate,
  type CandidateAssessment,
  type Employee,
  type Job,
  type Period,
  type PossibleReference,
} from '../pipeline';
import type { Relevant } from './attendees';
import { checkReference, comeetFor, record, useActivity } from './activity';
import { AVATAR, initials } from './avatars';
import { bundledSources } from './data';
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

let roster: Map<string, Employee> | null = null;
/** Former colleagues who are not listed connections are only known by ID from the reference match. */
const employeesById = () => (roster ??= buildDataset(bundledSources).employees);

/** The most recent shared employer is the likeliest to be remembered. */
const latestRef = (refs: PossibleReference[]) => [...refs].sort((x, y) => y.overlapEnd - x.overlapEnd)[0];

export interface ConnectionPerson {
  employee: Employee;
  refs: PossibleReference[];
}

/** Listed connections plus former colleagues who are not listed; former colleagues first, most recent overlap first. */
export function connectionPeople(a: CandidateAssessment): ConnectionPerson[] {
  const refsOf = (id: string) => a.possibleReferences.filter((r) => r.employeeId === id);
  const listed = a.connections.resolved.map((employee) => ({ employee, refs: refsOf(employee.employeeId) }));
  const listedIds = new Set(listed.map((p) => p.employee.employeeId));
  const unlisted = [...new Set(a.possibleReferences.map((r) => r.employeeId))]
    .filter((id) => !listedIds.has(id))
    .flatMap((id) => {
      const employee = employeesById().get(id);
      return employee ? [{ employee, refs: refsOf(id) }] : [];
    });
  const people = [...listed, ...unlisted];
  const end = (p: ConnectionPerson) => latestRef(p.refs)?.overlapEnd ?? -Infinity;
  return [...people.filter((p) => p.refs.length > 0).sort((x, y) => end(y) - end(x)), ...people.filter((p) => p.refs.length === 0)];
}

const shortSpan = (r: PossibleReference) =>
  r.overlapStart === r.overlapEnd
    ? String(r.overlapStart)
    : `${r.overlapStart}–${r.overlapEnd === Infinity ? 'now' : String(r.overlapEnd).slice(2)}`;

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

/** Text button that opens a section below it: arrow on the right, down to open, up to close. */
function Disclosure({ open, onToggle, children }: { open: boolean; onToggle: () => void; children: ReactNode }) {
  return (
    <button type="button" className="ask-disclosure" aria-expanded={open} onClick={onToggle}>
      {children}
      <HugeiconsIcon icon={open ? ArrowUp01Icon : ArrowDown01Icon} size={14} aria-hidden="true" />
    </button>
  );
}

const stop = (e: SyntheticEvent) => e.stopPropagation();
/** Keys stay inside the popover (the table row would otherwise treat Space and Enter as "open profile"), except Escape. */
const keepKeys = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') e.stopPropagation();
};

/** A WSC connection tag (or, on the profile, an "Ask <name>" button) that opens a drafted request for a recommendation: copy, Slack or email. */
export function AskConnection({
  employee,
  refs,
  ctx,
  asButton = false,
}: {
  employee: Employee;
  refs: PossibleReference[];
  ctx: AskContext;
  asButton?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const theirFirst = firstName(employee.fullName);
  const myFirst = firstName(ctx.candidate.fullName);
  const latest = useMemo(() => latestRef(refs), [refs]);
  const overlap = useMemo(() => overlapFor(ctx.candidate, employee, latest), [ctx.candidate, employee, latest]);
  const qs = questions(myFirst, !!overlap);
  const [picked, setPicked] = useState([true, true, true, false]);
  const [text, setText] = useState<string | null>(null);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showQuestions, setShowQuestions] = useState(false);
  const [status, setStatus] = useState<ReactNode>(null);
  const [copied, setCopied] = useState(false);
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
  const entries = useActivity();
  const key = ctx.candidate.candidateKey;
  // A colleague is asked about a person once; copying or opening email only prepares a request.
  const check = checkReference(entries, comeetFor(key), key, employee.employeeId, employee.fullName);
  const prepare = (channel: 'copy' | 'email') =>
    record({ kind: 'reference', candidateKey: key, employeeId: employee.employeeId, employeeName: employee.fullName, channel, state: 'prepared' });

  return (
    <Popover
      // Beside the tag, so it is clamped into the viewport even on the last rows.
      placement={asButton ? 'bottom-end' : 'left-start'}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setStatus(null);
      }}
    >
      <Popover.Trigger
        className={asButton ? 'ml-btn ml-btn-secondary ml-btn-size-sm' : 'ask-trigger'}
        onClick={stop}
        onKeyDown={keepKeys}
        aria-label={`Ask ${employee.fullName} about ${ctx.candidate.fullName}`}
      >
        {asButton ? (
          <>
            <HugeiconsIcon icon={BubbleChatIcon} size={16} strokeWidth={1.75} aria-hidden="true" />
            Ask {theirFirst}
          </>
        ) : latest ? (
          <span className="conn-tag2">
            <Avatar size="sm" src={AVATAR[employee.employeeId]} fallback={initials(employee.fullName)} aria-hidden="true" />
            <span className="conn-tag2-name">{employee.fullName}</span>
            <span className="conn-tag2-where">
              {latest.company} {shortSpan(latest)}
            </span>
          </span>
        ) : (
          <Tag size="sm" className="conn-tag">
            <Avatar size="xs" src={AVATAR[employee.employeeId]} fallback={initials(employee.fullName)} aria-hidden="true" />
            {employee.fullName}
          </Tag>
        )}
      </Popover.Trigger>
      <Popover.Content
        className="ask"
        aria-label={`Ask ${employee.fullName} for a recommendation`}
        onClick={stop}
        onKeyDown={keepKeys}
      >
        <div className="ask-head">
          <span className="ask-to">
            <Avatar size="sm" src={AVATAR[employee.employeeId]} fallback={initials(employee.fullName)} aria-hidden="true" />
            {employee.fullName}
          </span>
          <Button variant="icon" size="sm" aria-label="Close" onClick={() => setOpen(false)}>
            <HugeiconsIcon icon={Cancel01Icon} size={16} />
          </Button>
        </div>
        {overlap ? (
          <div className="ask-context">
            <span>
              <strong className="ask-together">Together at {overlap.company}</strong> {span(overlap.together)}
            </span>
            <Disclosure open={showTimeline} onToggle={() => setShowTimeline((v) => !v)}>
              Timeline
            </Disclosure>
          </div>
        ) : (
          <p className="muted ask-context">No shared work history</p>
        )}
        {overlap && showTimeline && <Timeline o={overlap} theirName={theirFirst} myName={myFirst} />}
        <textarea
          className="ask-text"
          value={message}
          onChange={(e) => setText(e.target.value)}
          rows={11}
          aria-label={`Message to ${employee.fullName}`}
        />
        <div className="ask-questions">
          <Disclosure open={showQuestions} onToggle={() => setShowQuestions((v) => !v)}>
            Questions · {picked.filter(Boolean).length} of {qs.length}
          </Disclosure>
          {showQuestions && (
            <div className="ask-chips">
              {qs.map((q, i) => (
                <button key={q} type="button" className="ask-chip" aria-pressed={picked[i]} onClick={() => toggle(i)}>
                  <span className="ask-check" aria-hidden="true" />
                  {q}
                </button>
              ))}
            </div>
          )}
        </div>
        {check.block && !status && <p className="check-note is-block">{check.block}</p>}
        {check.warn && !check.block && !status && <p className="check-note">{check.warn}</p>}
        <div className="ask-actions">
          <Button
            size="sm"
            variant="secondary"
            className={copied ? 'ask-copied' : undefined}
            aria-label={copied ? 'Copied' : 'Copy message'}
            title={copied ? 'Copied' : 'Copy message'}
            onClick={async () => {
              if (await copy()) {
                prepare('copy');
                setStatus('Prepared, not sent: mark it sent on the profile once you send it.');
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1600);
              } else setStatus('Select the text and copy it');
            }}
          >
            <HugeiconsIcon icon={copied ? Tick02Icon : Copy01Icon} size={16} />
          </Button>
          <Button
            size="sm"
            variant="primary"
            leftIcon={<HugeiconsIcon icon={SlackIcon} size={16} aria-hidden="true" />}
            disabled={!!check.block}
            onClick={() => {
              record({ kind: 'reference', candidateKey: key, employeeId: employee.employeeId, employeeName: employee.fullName, channel: 'slack', state: 'sent' });
              setStatus(`Sent · Simulated: the Slack app would message ${theirFirst}.`);
            }}
          >
            Send in Slack
          </Button>
          {/* Opening an email app proves nothing was sent, so it only prepares the request. */}
          {!check.block && (
            <Button
              size="sm"
              variant="secondary"
              href={email}
              onClick={() => {
                prepare('email');
                setStatus('Prepared, not sent: mark it sent on the profile once you send it.');
              }}
              leftIcon={<HugeiconsIcon icon={Mail01Icon} size={16} aria-hidden="true" />}
            >
              Email {theirFirst}
            </Button>
          )}
          <span className="ask-status muted" role="status">
            {status}
          </span>
        </div>
      </Popover.Content>
    </Popover>
  );
}

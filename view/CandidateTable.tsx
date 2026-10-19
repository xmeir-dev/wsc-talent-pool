import { isValidElement, useEffect, useRef, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { Briefcase04Icon, Calendar03Icon, Cancel01Icon, CheckmarkBadge01Icon, HelpCircleIcon, Tick02Icon, UserIcon } from '@hugeicons/core-free-icons';
import { inviteCheck, statusLine } from './activity';
import { useActivityState, type ActivityState } from './actionStore';
import { InviteToJob } from './InviteToJob';
import { DataTable, Hint, Tag, type Column, type SortState } from '@meir-labs/ui-kit';
import type { CandidateAssessment } from '../pipeline';
import type { Attendee } from './attendees';
import { AskConnection } from './AskConnection';
import { CountryFlag } from './Location';
import { WscMark } from './WscMark';
import { conferenceShort, fitChecks, jobShort, shortDate, TABLE_OUTCOME_LABEL } from './format';

interface Shared {
  onOpen: (key: string) => void;
  emptyState: ReactNode;
}

/** Header label with its icon: inline-flex so the icon sits centred on the text, never on the baseline. */
function Head({ icon, label }: { icon: IconSvgElement | ReactElement; label: string }) {
  return (
    <span className="th-label">
      {isValidElement(icon) ? icon : <HugeiconsIcon icon={icon} size={14} strokeWidth={1.75} aria-hidden="true" />}
      <span className="th-text">{label}</span>
    </span>
  );
}

const quiet = (text: string, unknown = false) => <span className={unknown ? 'unknown' : 'muted'}>{text}</span>;

/** Name with the current role under it. */
const who = (c: CandidateAssessment['candidate'], role: string) => (
  <span className="who">
    <span className="name">
      {c.fullName}
      <CountryFlag c={c} />
    </span>
    {role && <span className="muted who-role">{role}</span>}
  </span>
);

/** An empty cell gets a faint hairline instead of words. */
const empty = <span className="empty-line" role="img" aria-label="None" />;

/** Count, then up to two names as tags that open a drafted request for a recommendation (former colleagues first, with where and when); the rest go in a "+N" tag with the names on hover. */
const connections = ({ any, candidate, relevantFor, connections: people }: Attendee) => {
  const c = any.a.connections;
  if (c.status === 'unknown') return quiet('Unknown', true);
  const names = [...people.map((p) => p.employee.fullName), ...c.unresolvedIds];
  if (names.length === 0) return empty;
  const best = [...relevantFor].sort((x, y) => (x.outcome === 'shortlist' ? 0 : 1) - (y.outcome === 'shortlist' ? 0 : 1))[0];
  const ctx = { candidate, job: best ? { job: best.job, outcome: best.outcome } : null };
  const shown = [
    ...people.map((p) => <AskConnection key={p.employee.employeeId} employee={p.employee} refs={p.refs} ctx={ctx} />),
    ...c.unresolvedIds.map((id) => (
      <Tag key={id} size="sm" className="conn-tag">
        {id}
      </Tag>
    )),
  ];
  const rest = names.slice(2);
  return (
    <span className="conns">
      <span className="conn-count">{names.length}</span>
      <span className="conn-tags">
        {shown.slice(0, 2)}
        {rest.length > 0 && (
          <Hint focusable={false} tip={rest.join(', ')}>
            <Tag size="sm">+{rest.length}</Tag>
          </Hint>
        )}
      </span>
    </span>
  );
};

/** Up to two short-name chips, latest first ("WSC Meetup '26"), full name and date on hover; any more go in a "+N" chip. */
function Conferences({ attendances }: { attendances: Attendee['candidate']['attendances'] }) {
  const latest = [...attendances].sort((x, y) => y.conferenceDate.localeCompare(x.conferenceDate));
  const year = (iso: string) => `’${iso.slice(2, 4)}`;
  const full = (at: (typeof latest)[number]) => `${at.conferenceName}, ${shortDate(at.conferenceDate)}`;
  const rest = latest.slice(2);
  return (
    <span className="confs">
      {latest.slice(0, 2).map((at) => (
        <Hint key={at.attendanceId} tip={full(at)} focusable={false}>
          <Tag size="sm" className="conf-tag">
            {conferenceShort(at.conferenceName)} {year(at.conferenceDate)}
          </Tag>
        </Hint>
      ))}
      {rest.length > 0 && (
        <Hint tip={rest.map(full).join('; ')} focusable={false}>
          <Tag size="sm" className="conf-tag">
            +{rest.length}
          </Tag>
        </Hint>
      )}
    </span>
  );
}

/** One pill per job, shortlist first: the title, tinted green (shortlisted) or amber (needs review), with the reason on hover. */
function RelevantFor({
  list,
  candidate,
  activity,
}: {
  list: Attendee['relevantFor'];
  candidate: Attendee['candidate'];
  activity: ActivityState;
}) {
  const key = candidate.candidateKey;
  const roles = list.map((r) => ({ jobId: r.job.jobId, title: r.job.title }));
  const fits = list.map((r) => ({ job: r.job, outcome: r.outcome }));
  if (list.length === 0) return empty;
  const ordered = [...list].sort((x, y) => (x.outcome === 'shortlist' ? 0 : 1) - (y.outcome === 'shortlist' ? 0 : 1));
  return (
    <span className="jobs">
      {ordered.map(({ job, outcome, a }) => {
        const shortlisted = outcome === 'shortlist';
        const why = (
          <span className="skill-tip">
            <span className="skill-tip-name">{shortlisted ? 'Shortlisted' : 'Needs review'}</span>
            <span className="fit-tip-rows">
              {fitChecks(a, job).map((c) => (
                <span key={c.key} className={c.ok ? 'is-ok' : 'is-no'}>
                  <HugeiconsIcon icon={c.ok ? Tick02Icon : Cancel01Icon} size={12} strokeWidth={2} aria-hidden="true" />
                  <span>
                    {c.name}: {c.detail}
                  </span>
                </span>
              ))}
            </span>
          </span>
        );
        // With an outreach status, the chip becomes a small card: the job on top, the status in a band below.
        const role = { jobId: job.jobId, title: job.title };
        const status = statusLine(activity.entries, key, role);
        // Invite shows on hover only where the rules allow it (not declined, contacted or in process).
        const canInvite = !!candidate.email && !inviteCheck(activity, candidate, role, roles).block;
        const title = (
          <span className="fit-top">
            <span className="fit-title">
              {jobShort(job)}
              <span className="ml-visually-hidden">{`: ${TABLE_OUTCOME_LABEL[outcome]}`}</span>
            </span>
            <HugeiconsIcon icon={shortlisted ? CheckmarkBadge01Icon : HelpCircleIcon} size={14} strokeWidth={1.75} aria-hidden="true" />
          </span>
        );
        return (
          <span key={job.jobId} className="job-line">
            <Hint tip={why} focusable={false}>
              <span className={`fit ${shortlisted ? 'is-shortlist' : 'is-review'}${status ? ' has-band' : ''}`}>
                {title}
                {status && (
                  <span className="fit-band" title={status.simulated ? 'Simulated' : undefined}>
                    <span className="ml-visually-hidden">, </span>
                    {status.text}
                  </span>
                )}
              </span>
            </Hint>
            {canInvite && <InviteToJob c={candidate} fits={fits} jobId={job.jobId} compact />}
          </span>
        );
      })}
    </span>
  );
}

/**
 * The kit's table opens a row on Enter or Space from anywhere inside it, so Space on a row's
 * checkbox (or Enter on a button in it) would open the profile instead of doing its own job.
 * Keys aimed at a control inside a row stop here, before React hands them to the row; the
 * control keeps its native behaviour and a focused row still opens on Enter or Space.
 */
function useNativeKeysInRows() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const target = e.target as HTMLElement;
      const row = target.closest('tbody tr');
      if (row && row !== target) e.stopPropagation();
    };
    el.addEventListener('keydown', onKey);
    return () => el.removeEventListener('keydown', onKey);
  }, []);
  return ref;
}

/** Every attendee once, A–Z. */
export function AttendeeTable({
  attendees,
  onOpen,
  emptyState,
  sort,
  onSort,
  footer,
  selected,
  onSelect,
}: Shared & {
  attendees: Attendee[];
  sort: SortState | null;
  onSort: (next: SortState | null) => void;
  footer?: ReactNode;
  /** Ticked rows (candidate keys), kept across pages. */
  selected: string[];
  onSelect: (next: string[]) => void;
}) {
  const activity = useActivityState();
  const keys = useNativeKeysInRows();
  const pageKeys = new Set(attendees.map((a) => a.candidate.candidateKey));
  const tickedHere = selected.filter((k) => pageKeys.has(k)).length;
  // With some rows ticked (the header shows a dash), the header box clears the selection instead of ticking every row.
  const clearOnPartial = (e: MouseEvent) => {
    const partial = tickedHere > 0 && tickedHere < pageKeys.size;
    if (partial && (e.target as HTMLElement).closest('thead .ml-dt-check')) {
      e.preventDefault();
      e.stopPropagation();
      onSelect([]);
    }
  };
  const columns: Column<Attendee>[] = [
    {
      id: 'candidate',
      header: <Head icon={UserIcon} label="Candidate" />,
      width: '27%',
      sortable: true,
      accessor: ({ candidate, role }) => who(candidate, role),
    },
    {
      id: 'conference',
      header: <Head icon={Calendar03Icon} label="Conference" />,
      width: '19%',
      sortable: true,
      accessor: ({ candidate }) => <Conferences attendances={candidate.attendances} />,
    },
    {
      id: 'relevant',
      header: <Head icon={Briefcase04Icon} label="Relevant job" />,
      sortable: true,
      width: '30%',
      accessor: ({ candidate, relevantFor }) => <RelevantFor list={relevantFor} candidate={candidate} activity={activity} />,
    },
    { id: 'ref', header: <Head icon={<WscMark />} label="WSC connections" />, accessor: connections },
  ];

  return (
    // display: contents keeps the table's layout; the wrapper only catches the header box click first.
    <div ref={keys} className="dt-catch" onClickCapture={clearOnPartial}>
      <DataTable
        className="candidates attendees"
        aria-label="Attendees"
        columns={columns}
        data={attendees}
        sortState={sort}
        onSortChange={onSort}
        manualSort
        getRowId={({ candidate }) => candidate.candidateKey}
        selectable="multiple"
        selectedIds={selected.filter((k) => pageKeys.has(k))}
        // The table only knows this page; keep ticks made on other pages.
        onSelectionChange={(ids) => onSelect([...selected.filter((k) => !pageKeys.has(k)), ...ids])}
        onRowClick={({ candidate }) => onOpen(candidate.candidateKey)}
        emptyState={emptyState}
        footer={footer}
      />
    </div>
  );
}

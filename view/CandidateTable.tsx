import { isValidElement, type MouseEvent, type ReactElement, type ReactNode } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { Briefcase04Icon, Calendar03Icon, Cancel01Icon, CheckmarkBadge01Icon, HelpCircleIcon, Tick02Icon, UserIcon } from '@hugeicons/core-free-icons';
import { STATUS_LABEL, statusIn, useActivity, type RoleState } from './activity';
import { DataTable, Hint, Tag, type Column, type SortState } from '@meir-labs/ui-kit';
import type { CandidateAssessment } from '../pipeline';
import type { Attendee } from './attendees';
import { AskConnection, connectionPeople } from './AskConnection';
import { CountryFlag } from './Location';
import { WscMark } from './WscMark';
import { conferenceShort, fitChecks, shortDate, TABLE_OUTCOME_LABEL } from './format';

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
const connections = ({ any, candidate, relevantFor }: Attendee) => {
  const c = any.a.connections;
  if (c.status === 'unknown') return quiet('Unknown', true);
  const people = connectionPeople(any.a);
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
        <Hint key={at.hubspotId} tip={full(at)} focusable={false}>
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

/** One pill per job, shortlist first: the title, tinted green (shortlisted) or amber (maybe relevant), with the reason on hover. */
function RelevantFor({ list, statusOf }: { list: Attendee['relevantFor']; statusOf: (job: { jobId: string; title: string }) => RoleState }) {
  if (list.length === 0) return empty;
  const ordered = [...list].sort((x, y) => (x.outcome === 'shortlist' ? 0 : 1) - (y.outcome === 'shortlist' ? 0 : 1));
  return (
    <span className="jobs">
      {ordered.map(({ job, outcome, a }) => {
        const shortlisted = outcome === 'shortlist';
        const why = (
          <span className="skill-tip">
            <span className="skill-tip-name">{shortlisted ? 'Shortlisted' : 'Maybe relevant'}</span>
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
        // Outreach status for this role, as a small pill inside the chip in place of the fit icon; "Not contacted" stays unsaid.
        const s = statusOf({ jobId: job.jobId, title: job.title });
        return (
          <Hint key={job.jobId} tip={why} focusable={false}>
            <span className={`fit ${shortlisted ? 'is-shortlist' : 'is-review'}`}>
              <span className="fit-title">
                {job.title}
                <span className="ml-visually-hidden">{`: ${TABLE_OUTCOME_LABEL[outcome]}`}</span>
              </span>
              {s.status === 'not_contacted' ? (
                <HugeiconsIcon icon={shortlisted ? CheckmarkBadge01Icon : HelpCircleIcon} size={14} strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <span className="fit-status" title={s.simulated ? 'Simulated' : undefined}>
                  <span className="ml-visually-hidden">, </span>
                  {STATUS_LABEL[s.status]}
                </span>
              )}
            </span>
          </Hint>
        );
      })}
    </span>
  );
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
  jobs,
}: Shared & {
  attendees: Attendee[];
  sort: SortState | null;
  onSort: (next: SortState | null) => void;
  footer?: ReactNode;
  /** Ticked rows (candidate keys), kept across pages. */
  selected: string[];
  onSelect: (next: string[]) => void;
  /** Open roles, for each chip's outreach status. */
  jobs: { jobId: string; title: string }[];
}) {
  const entries = useActivity();
  const statusOf = (key: string) => (job: { jobId: string; title: string }) => statusIn(entries, key, jobs, job.jobId);
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
      accessor: ({ candidate, relevantFor }) => <RelevantFor list={relevantFor} statusOf={statusOf(candidate.candidateKey)} />,
    },
    { id: 'ref', header: <Head icon={<WscMark />} label="WSC connections" />, accessor: connections },
  ];

  return (
    // display: contents keeps the table's layout; the wrapper only catches the header box click first.
    <div className="dt-catch" onClickCapture={clearOnPartial}>
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

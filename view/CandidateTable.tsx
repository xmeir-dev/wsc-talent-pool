import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  Calendar03Icon,
  File02Icon,
  Briefcase04Icon,
  UserIcon,
} from '@hugeicons/core-free-icons';
import { DataTable, Hint, Tag, type Column, type SortState } from '@meir-labs/ui-kit';
import type { CandidateAssessment } from '../pipeline';
import type { Attendee } from './attendees';
import { AskConnection, connectionPeople } from './AskConnection';
import { CountryFlag } from './Location';
import { Overview } from './Overview';
import { WscMark } from './WscMark';
import { maxPoints, shortDate, TABLE_OUTCOME_LABEL } from './format';

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

const about = (c: CandidateAssessment['candidate']) => <Overview c={c} />;

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

/** One pill per job, shortlist first: green when shortlisted, outlined grey in needs review. */
function RelevantFor({ list }: { list: Attendee['relevantFor'] }) {
  if (list.length === 0) return empty;
  const ordered = [...list].sort((x, y) => (x.outcome === 'shortlist' ? 0 : 1) - (y.outcome === 'shortlist' ? 0 : 1));
  return (
    <span className="jobs">
      {ordered.map(({ job, outcome, a }) => {
        const max = maxPoints(a, job);
        const pct = Math.round((a.points.total / max) * 100);
        return (
          <Hint key={job.jobId} focusable={false} tip={`${TABLE_OUTCOME_LABEL[outcome]} · ${a.points.total} of ${max} points`}>
            <span className={`fit-pill fit-${outcome === 'shortlist' ? 'good' : 'review'}`}>
              <span className="fit-fill" style={{ width: `${pct}%` }} aria-hidden="true" />
              <span className="fit-title">{job.title}</span>
              <span className="fit-pct">{pct}%</span>
              <span className="ml-visually-hidden">{`: ${TABLE_OUTCOME_LABEL[outcome]}`}</span>
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
}: Shared & { attendees: Attendee[]; sort: SortState | null; onSort: (next: SortState | null) => void; footer?: ReactNode }) {
  const columns: Column<Attendee>[] = [
    {
      id: 'candidate',
      header: <Head icon={UserIcon} label="Candidate" />,
      width: '22%',
      sortable: true,
      accessor: ({ candidate, role }) => who(candidate, role),
    },
    {
      id: 'conference',
      header: <Head icon={Calendar03Icon} label="Conference" />,
      width: '20%',
      sortable: true,
      accessor: ({ candidate }) => (
        <span className="confs">
          {candidate.attendances.map((at) => (
            <span key={at.hubspotId} className="who">
              <span>{at.conferenceName}</span>
              <span className="muted who-role">{shortDate(at.conferenceDate)}</span>
            </span>
          ))}
        </span>
      ),
    },
    {
      id: 'relevant',
      header: <Head icon={Briefcase04Icon} label="Relevant job" />,
      sortable: true,
      width: 176,
      accessor: ({ relevantFor }) => <RelevantFor list={relevantFor} />,
    },
    { id: 'about', header: <Head icon={File02Icon} label="About candidate" />, width: '24%', accessor: ({ candidate }) => about(candidate) },
    { id: 'ref', header: <Head icon={<WscMark />} label="WSC connections" />, accessor: connections },
  ];

  return (
    <DataTable
      className="candidates attendees"
      aria-label="Attendees"
      columns={columns}
      data={attendees}
      sortState={sort}
      onSortChange={onSort}
      manualSort
      getRowId={({ candidate }) => candidate.candidateKey}
      onRowClick={({ candidate }) => onOpen(candidate.candidateKey)}
      emptyState={emptyState}
      footer={footer}
    />
  );
}

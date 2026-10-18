import type { ReactNode } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  AlertCircleIcon,
  Calendar03Icon,
  CheckmarkCircle02Icon,
  File02Icon,
  StarIcon,
  Target02Icon,
  UserIcon,
  UserMultipleIcon,
} from '@hugeicons/core-free-icons';
import { DataTable, Hint, StatusPill, type Column } from '@meir-labs/ui-kit';
import type { CandidateAssessment } from '../pipeline';
import type { Attendee, Item } from './attendees';
import { Overview } from './Overview';
import { currentRole, fitReason, mainGap, OUTCOME_TONE, referenceSummary, shortDate, TABLE_OUTCOME_LABEL } from './format';

interface Shared {
  onOpen: (key: string) => void;
  emptyState: ReactNode;
}

/** Header label with its icon: inline-flex so the icon sits centred on the text, never on the baseline. */
function Head({ icon, label }: { icon: IconSvgElement; label: string }) {
  return (
    <span className="th-label">
      <HugeiconsIcon icon={icon} size={14} strokeWidth={1.75} aria-hidden="true" />
      <span className="th-text">{label}</span>
    </span>
  );
}

const quiet = (text: string, unknown = false) => <span className={unknown ? 'unknown' : 'muted'}>{text}</span>;

/** Name with the current role under it. */
const who = (name: string, role: string) => (
  <span className="who">
    <span className="name">{name}</span>
    {role && <span className="muted who-role">{role}</span>}
  </span>
);

const about = (c: CandidateAssessment['candidate']) => <Overview c={c} />;

const connections = (a: CandidateAssessment) => {
  const ref = referenceSummary(a);
  return quiet(ref.text, ref.unknown);
};

function RankCell({ a }: { a: CandidateAssessment }) {
  return (
    <span className="rank-cell">
      {a.shortlistRank !== null && <span className="rank">{a.shortlistRank}</span>}
      <StatusPill tone={OUTCOME_TONE[a.recommendation]}>{TABLE_OUTCOME_LABEL[a.recommendation]}</StatusPill>
      {a.tieNote && (
        <span className="tie" title={a.tieNote}>
          tied
        </span>
      )}
    </span>
  );
}

/** One job's shortlist and needs review, in pipeline rank order. */
export function CandidateTable({ items, onOpen, emptyState }: Shared & { items: Item[] }) {
  const columns: Column<Item>[] = [
    { id: 'rank', header: <span className="th-label"><span className="th-text">#</span></span>, width: 168, accessor: ({ a }) => <RankCell a={a} /> },
    {
      id: 'score',
      header: (
        <Hint tip="Total points: required + nice to have + industry bonus">
          <Head icon={StarIcon} label="Score" />
        </Hint>
      ),
      width: 96,
      accessor: ({ a }) => <span className="score">{a.candidate.profile ? a.points.total : '–'}</span>,
    },
    {
      id: 'candidate',
      header: <Head icon={UserIcon} label="Candidate" />,
      width: '18%',
      accessor: ({ a, row }) => who(a.candidate.fullName, currentRole(row)),
    },
    { id: 'about', header: <Head icon={File02Icon} label="About candidate" />, width: '20%', accessor: ({ a }) => about(a.candidate) },
    { id: 'why', header: <Head icon={CheckmarkCircle02Icon} label="Why" />, accessor: ({ a }) => quiet(fitReason(a)) },
    {
      id: 'gap',
      header: <Head icon={AlertCircleIcon} label="Main gap" />,
      accessor: ({ a }) => {
        const gap = mainGap(a);
        return quiet(gap.text, gap.unknown);
      },
    },
    { id: 'ref', header: <Head icon={UserMultipleIcon} label="WSC connections" />, width: '16%', accessor: ({ a }) => connections(a) },
  ];

  return (
    <DataTable
      className="candidates by-job"
      aria-label="Candidates"
      columns={columns}
      data={items}
      getRowId={({ a }) => a.candidate.candidateKey}
      onRowClick={({ a }) => onOpen(a.candidate.candidateKey)}
      emptyState={emptyState}
    />
  );
}

function RelevantFor({ list }: { list: Attendee['relevantFor'] }) {
  if (list.length === 0) return quiet('—');
  return (
    <span className="jobs">
      {list.map(({ job, outcome }) => (
        <Hint key={job.jobId} focusable={false} tip={TABLE_OUTCOME_LABEL[outcome]}>
          <StatusPill tone={OUTCOME_TONE[outcome]}>
            {job.title}
            <span className="ml-visually-hidden">{`: ${TABLE_OUTCOME_LABEL[outcome]}`}</span>
          </StatusPill>
        </Hint>
      ))}
    </span>
  );
}

/** Every attendee once, A–Z. */
export function AttendeeTable({ attendees, onOpen, emptyState }: Shared & { attendees: Attendee[] }) {
  const columns: Column<Attendee>[] = [
    {
      id: 'candidate',
      header: <Head icon={UserIcon} label="Candidate" />,
      width: '22%',
      accessor: ({ candidate, role }) => who(candidate.fullName, role),
    },
    {
      id: 'conference',
      header: <Head icon={Calendar03Icon} label="Conference" />,
      width: '20%',
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
    { id: 'about', header: <Head icon={File02Icon} label="About candidate" />, width: '24%', accessor: ({ candidate }) => about(candidate) },
    {
      id: 'relevant',
      header: <Head icon={Target02Icon} label="Relevant for" />,
      width: 176,
      accessor: ({ relevantFor }) => <RelevantFor list={relevantFor} />,
    },
    { id: 'ref', header: <Head icon={UserMultipleIcon} label="WSC connections" />, accessor: ({ any }) => connections(any.a) },
  ];

  return (
    <DataTable
      className="candidates attendees"
      aria-label="Attendees"
      columns={columns}
      data={attendees}
      getRowId={({ candidate }) => candidate.candidateKey}
      onRowClick={({ candidate }) => onOpen(candidate.candidateKey)}
      emptyState={emptyState}
    />
  );
}

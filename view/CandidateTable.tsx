import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  AlertCircleIcon,
  Briefcase01Icon,
  CheckmarkCircle02Icon,
  StarIcon,
  UserIcon,
  UserMultipleIcon,
} from '@hugeicons/core-free-icons';
import { DataTable, Hint, StatusPill, type Column } from '@meir-labs/ui-kit';
import type { CandidateAssessment, OutputRow } from '../pipeline';
import { currentRole, fitReason, mainGap, OUTCOME_TONE, referenceSummary, TABLE_OUTCOME_LABEL } from './format';

export interface Item {
  a: CandidateAssessment;
  row: OutputRow;
}

interface Props {
  items: Item[];
  showOutcome: boolean;
  onOpen: (key: string) => void;
}

function RankCell({ a, showOutcome }: { a: CandidateAssessment; showOutcome: boolean }) {
  if (a.shortlistRank !== null) {
    return (
      <span className="rank-cell">
        <span className="rank">{a.shortlistRank}</span>
        {a.tieNote && (
          <span className="tie" title={a.tieNote}>
            tied
          </span>
        )}
      </span>
    );
  }
  if (!showOutcome) return null;
  return <StatusPill tone={OUTCOME_TONE[a.recommendation]}>{TABLE_OUTCOME_LABEL[a.recommendation]}</StatusPill>;
}

/** Header label with its icon: inline-flex so the icon sits centred on the text, never on the baseline. */
function Head({ icon, label }: { icon: IconSvgElement; label: string }) {
  return (
    <span className="th-label">
      <HugeiconsIcon icon={icon} size={14} strokeWidth={1.75} aria-hidden="true" />
      {label}
    </span>
  );
}

const quiet = (text: string, unknown = false) => <span className={unknown ? 'unknown' : 'muted'}>{text}</span>;

export function CandidateTable({ items, showOutcome, onOpen }: Props) {
  const columns: Column<Item>[] = [
    {
      id: 'rank',
      header: '#',
      width: showOutcome ? 152 : 88,
      accessor: ({ a }) => <RankCell a={a} showOutcome={showOutcome} />,
    },
    {
      id: 'score',
      header: (
        <Hint tip="Total points: required + nice to have + industry bonus">
          <Head icon={StarIcon} label="Score" />
        </Hint>
      ),
      width: 104,
      accessor: ({ a }) => <span className="score">{a.candidate.profile ? a.points.total : '–'}</span>,
    },
    {
      id: 'candidate',
      header: <Head icon={UserIcon} label="Candidate" />,
      width: '14%',
      accessor: ({ a }) => <span className="name">{a.candidate.fullName}</span>,
    },
    {
      id: 'role',
      header: <Head icon={Briefcase01Icon} label="Role" />,
      width: '16%',
      accessor: ({ row }) => quiet(currentRole(row)),
    },
    {
      id: 'why',
      header: <Head icon={CheckmarkCircle02Icon} label="Why" />,
      accessor: ({ a }) => quiet(fitReason(a)),
    },
    {
      id: 'gap',
      header: <Head icon={AlertCircleIcon} label="Main gap" />,
      accessor: ({ a }) => {
        const gap = mainGap(a);
        return quiet(gap.text, gap.unknown);
      },
    },
    {
      id: 'ref',
      header: <Head icon={UserMultipleIcon} label="WSC connections" />,
      width: '18%',
      accessor: ({ a }) => {
        const ref = referenceSummary(a);
        return quiet(ref.text, ref.unknown);
      },
    },
  ];

  return (
    <DataTable
      className="candidates"
      aria-label="Candidates"
      columns={columns}
      data={items}
      getRowId={({ a }) => a.candidate.candidateKey}
      onRowClick={({ a }) => onOpen(a.candidate.candidateKey)}
    />
  );
}

import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  AlertCircleIcon,
  Briefcase01Icon,
  CheckmarkCircle02Icon,
  StarIcon,
  UserIcon,
  UserMultipleIcon,
} from '@hugeicons/core-free-icons';
import type { CandidateAssessment, OutputRow } from '../pipeline';
import { currentRole, fitReason, mainGap, OUTCOME_LABEL, referenceSummary } from './format';

interface Item {
  a: CandidateAssessment;
  row: OutputRow;
}

interface Props {
  items: Item[];
  showOutcome: boolean;
  openKey: string | null;
  onOpen: (key: string) => void;
  registerRow: (key: string, el: HTMLButtonElement | null) => void;
}

function RankCell({ a, showOutcome }: { a: CandidateAssessment; showOutcome: boolean }) {
  if (a.shortlistRank !== null) {
    return (
      <>
        <span className="rank">{a.shortlistRank}</span>
        {a.tieNote && (
          <span className="tie" title={a.tieNote}>
            tied
          </span>
        )}
      </>
    );
  }
  if (!showOutcome) return null;
  return <span className={`outcome outcome-${a.recommendation}`}>{OUTCOME_LABEL[a.recommendation]}</span>;
}

function Head({ icon, label }: { icon: IconSvgElement; label: string }) {
  return (
    <span className="th-label">
      <HugeiconsIcon icon={icon} size={14} strokeWidth={1.75} aria-hidden="true" />
      {label}
    </span>
  );
}

export function CandidateTable({ items, showOutcome, openKey, onOpen, registerRow }: Props) {
  return (
    <table className="candidates">
      <thead>
        <tr>
          <th scope="col" className="col-rank">
            #
          </th>
          <th scope="col" className="col-score" title="Total points (required + nice to have + industry bonus)">
            <Head icon={StarIcon} label="Score" />
          </th>
          <th scope="col" className="col-candidate">
            <Head icon={UserIcon} label="Candidate" />
          </th>
          <th scope="col" className="col-role">
            <Head icon={Briefcase01Icon} label="Role" />
          </th>
          <th scope="col">
            <Head icon={CheckmarkCircle02Icon} label="Why" />
          </th>
          <th scope="col">
            <Head icon={AlertCircleIcon} label="Main gap" />
          </th>
          <th scope="col" className="col-ref">
            <Head icon={UserMultipleIcon} label="WSC connections" />
          </th>
        </tr>
      </thead>
      <tbody>
        {items.map(({ a, row }) => {
          const key = a.candidate.candidateKey;
          const gap = mainGap(a);
          const ref = referenceSummary(a);
          return (
            <tr key={key} className={key === openKey ? 'is-open' : undefined} onClick={() => onOpen(key)}>
              <td className="col-rank">
                <RankCell a={a} showOutcome={showOutcome} />
              </td>
              <td className="col-score">{a.candidate.profile ? a.points.total : '–'}</td>
              <td className="col-name">
                <button
                  type="button"
                  className="row-link"
                  ref={(el) => registerRow(key, el)}
                  aria-expanded={key === openKey}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpen(key);
                  }}
                >
                  {a.candidate.fullName}
                </button>
              </td>
              <td className="col-role muted">{currentRole(row)}</td>
              <td className="col-why">{fitReason(a)}</td>
              <td className={`col-gap${gap.unknown ? ' unknown' : ''}`}>{gap.text}</td>
              <td className={`col-ref${ref.unknown ? ' unknown' : ''}`}>{ref.text}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

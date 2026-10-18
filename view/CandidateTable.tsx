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

export function CandidateTable({ items, showOutcome, openKey, onOpen, registerRow }: Props) {
  return (
    <table className="candidates">
      <thead>
        <tr>
          <th scope="col" className="col-rank">
            {showOutcome ? 'Rank / outcome' : 'Rank'}
          </th>
          <th scope="col">Candidate</th>
          <th scope="col">Why</th>
          <th scope="col">Main gap</th>
          <th scope="col">WSC connections</th>
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
              <td>
                <div className="col-name">
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
                  <span className="muted">{currentRole(row)}</span>
                </div>
              </td>
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

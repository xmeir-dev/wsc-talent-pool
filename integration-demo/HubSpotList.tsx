import type { JobAssessment } from '../pipeline';
import { fitReason, OUTCOME_LABEL, referenceSummary } from '../view/format';
import { HubSpotNav } from './HubSpotNav';
import { initials } from './initials';

interface Props {
  result: JobAssessment;
  onOpen: (candidateKey: string) => void;
}

export function HubSpotList({ result, onOpen }: Props) {
  const shortlist = result.candidates.filter((a) => a.recommendation === 'shortlist');
  const viewName = `${result.job.title} — shortlist`;
  return (
    <div className="host hs">
      <HubSpotNav />
      <main className="hs-page">
        <h1 className="hs-title">Contacts</h1>
        <div className="hs-views" role="tablist" aria-label="Saved views">
          <span className="hs-view" aria-disabled="true">
            All contacts
          </span>
          <span className="hs-view is-active" role="tab" aria-selected="true">
            {viewName}
          </span>
        </div>
        <div className="hs-table-wrap">
          <table className="hs-table" aria-label={viewName}>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Name</th>
                <th scope="col">Job title</th>
                <th scope="col">Recommendation</th>
                <th scope="col">Main fit reason</th>
                <th scope="col">WSC connection</th>
              </tr>
            </thead>
            <tbody>
              {shortlist.map((a) => {
                const c = a.candidate;
                const ref = referenceSummary(a);
                return (
                  <tr key={c.candidateKey} onClick={() => onOpen(c.candidateKey)}>
                    <td className="hs-rank">{a.shortlistRank}</td>
                    <td className="hs-name-cell">
                      <span className="hs-avatar hs-avatar-sm" aria-hidden="true">
                        {initials(c.fullName)}
                      </span>
                      <button
                        type="button"
                        className="hs-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(c.candidateKey);
                        }}
                      >
                        {c.fullName}
                      </button>
                    </td>
                    <td>{c.profile?.currentTitle ?? ''}</td>
                    <td>{OUTCOME_LABEL[a.recommendation]}</td>
                    <td className="hs-wrap">{fitReason(a)}</td>
                    <td className={ref.unknown ? 'unknown' : undefined}>{ref.text}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

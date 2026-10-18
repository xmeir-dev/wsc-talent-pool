import { ArrowDown01Icon, Cancel01Icon, FilterIcon, Search01Icon } from '@hugeicons/core-free-icons';
import type { JobAssessment } from '../pipeline';
import { fitReason, OUTCOME_LABEL, referenceSummary } from '../view/format';
import { HubSpotShell } from './HubSpotShell';
import { Icon } from './Icon';
import { initials } from './initials';

interface Props {
  result: JobAssessment;
  onOpen: (candidateKey: string) => void;
}

/** HubSpot's contacts index on a saved view. Only the rows work; the rest is the host's chrome. */
export function HubSpotList({ result, onOpen }: Props) {
  const shortlist = result.candidates.filter((a) => a.recommendation === 'shortlist');
  const viewName = `${result.job.title} — shortlist`;
  return (
    <HubSpotShell>
      <main className="hs-index">
        <div className="hs-index-head">
          <div>
            <h1 className="hs-index-title">
              Contacts <Icon icon={ArrowDown01Icon} size={16} />
            </h1>
            <p className="hs-records">{shortlist.length} records</p>
          </div>
          <div className="hs-index-actions" aria-hidden="true">
            <span className="hs-btn hs-btn-outline">
              Actions <Icon icon={ArrowDown01Icon} size={14} />
            </span>
            <span className="hs-btn hs-btn-outline">Import</span>
            <span className="hs-btn hs-btn-primary">Create contact</span>
          </div>
        </div>

        <div className="hs-viewtabs">
          <span className="hs-viewtab" aria-hidden="true">
            All contacts
          </span>
          <span className="hs-viewtab" aria-hidden="true">
            My contacts
          </span>
          <span className="hs-viewtab is-active">
            {viewName}
            <Icon icon={Cancel01Icon} size={14} />
          </span>
          <span className="hs-viewtab hs-addview" aria-hidden="true">
            + Add view
          </span>
        </div>

        <div className="hs-board">
          <div className="hs-filters" aria-hidden="true">
            <span className="hs-tablesearch">
              Search name, phone, email
              <Icon icon={Search01Icon} size={16} />
            </span>
            <span className="hs-filter">
              Contact owner <Icon icon={ArrowDown01Icon} size={14} />
            </span>
            <span className="hs-filter">
              Create date <Icon icon={ArrowDown01Icon} size={14} />
            </span>
            <span className="hs-filter">
              Lead status <Icon icon={ArrowDown01Icon} size={14} />
            </span>
            <span className="hs-filter hs-filter-adv">
              <Icon icon={FilterIcon} size={14} /> Advanced filters (2)
            </span>
          </div>

          <div className="hs-table-wrap">
            <table className="hs-table" aria-label={viewName}>
              <thead>
                <tr>
                  <th scope="col" className="hs-col-check">
                    <span className="hs-check" aria-hidden="true" />
                  </th>
                  <th scope="col">Name</th>
                  <th scope="col">Talent match rank</th>
                  <th scope="col">Talent match</th>
                  <th scope="col">Main fit reason</th>
                  <th scope="col">WSC connections</th>
                  <th scope="col">Job title</th>
                </tr>
              </thead>
              <tbody>
                {shortlist.map((a) => {
                  const c = a.candidate;
                  const ref = referenceSummary(a);
                  return (
                    <tr key={c.candidateKey} onClick={() => onOpen(c.candidateKey)}>
                      <td className="hs-col-check">
                        <span className="hs-check" aria-hidden="true" />
                      </td>
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
                      <td className="hs-rank">{a.shortlistRank}</td>
                      <td>{OUTCOME_LABEL[a.recommendation]}</td>
                      <td className="hs-wrap">{fitReason(a)}</td>
                      <td className={ref.unknown ? 'unknown' : undefined}>{ref.text}</td>
                      <td>{c.profile?.currentTitle ?? ''}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="hs-pager" aria-hidden="true">
            <span className="muted">‹ Prev</span>
            <span className="hs-page-num">1</span>
            <span className="muted">Next ›</span>
            <span className="hs-perpage">
              25 per page <Icon icon={ArrowDown01Icon} size={14} />
            </span>
          </div>
        </div>
      </main>
    </HubSpotShell>
  );
}

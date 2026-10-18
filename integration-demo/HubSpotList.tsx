import { ArrowDown01Icon, FilterIcon, Search01Icon } from '@hugeicons/core-free-icons';
import { useState } from 'react';
import type { SourceTexts } from '../pipeline';
import { fitReason, OUTCOME_LABEL, referenceSummary } from '../view/format';
import type { AssessmentStore } from './assessments';
import type { ComeetService } from './comeet';
import { comeetStatusText } from './comeetStatus';
import { Icon } from './Icon';
import { ImportDialog } from './ImportDialog';
import { initials } from './initials';
import type { ImportRow } from './sources';

interface Props {
  store: AssessmentStore;
  sources: SourceTexts;
  comeet: ComeetService;
  /** 'all' or a job ID: that role's saved shortlist view. */
  view: string;
  onView: (view: string) => void;
  onOpen: (candidateKey: string, jobId: string) => void;
  onImport: (rows: ImportRow[], fileName: string, merged: number) => void;
}

const PAGE = 25;

/** HubSpot's contacts index. Saved views, rows and Import work; the rest is the host's chrome. */
export function HubSpotList({ store, sources, comeet, view, onView, onOpen, onImport }: Props) {
  const [importing, setImporting] = useState(false);
  const jobs = store.dataset.jobs;
  const viewName = (jobId: string) => `${store.result(jobId).job.title} — shortlist`;
  const total =
    view === 'all'
      ? store.dataset.candidates.length
      : store.result(view).candidates.filter((a) => a.recommendation === 'shortlist').length;

  return (
    <main className="hs-index">
      <div className="hs-index-head">
        <div>
          <h1 className="hs-index-title">
            Contacts <Icon icon={ArrowDown01Icon} size={16} />
          </h1>
          <p className="hs-records">{total} records</p>
        </div>
        <div className="hs-index-actions">
          <span className="hs-btn hs-btn-outline" aria-hidden="true">
            Actions <Icon icon={ArrowDown01Icon} size={14} />
          </span>
          <button type="button" className="hs-btn hs-btn-outline" onClick={() => setImporting(true)}>
            Import
          </button>
          <span className="hs-btn hs-btn-primary" aria-hidden="true">
            Create contact
          </span>
        </div>
      </div>

      <div className="hs-viewtabs" role="tablist" aria-label="Saved views">
        {[{ id: 'all', name: 'All contacts' }, ...jobs.map((j) => ({ id: j.jobId, name: viewName(j.jobId) }))].map((v) => (
          <button
            key={v.id}
            type="button"
            role="tab"
            aria-selected={view === v.id}
            className={`hs-viewtab${view === v.id ? ' is-active' : ''}`}
            onClick={() => onView(v.id)}
          >
            {v.name}
          </button>
        ))}
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
            <Icon icon={FilterIcon} size={14} /> Advanced filters{view === 'all' ? '' : ' (2)'}
          </span>
        </div>
        {view === 'all' ? (
          <AllContacts key="all" store={store} onOpen={onOpen} />
        ) : (
          <RoleView key={view} store={store} comeet={comeet} jobId={view} name={viewName(view)} onOpen={onOpen} />
        )}
      </div>

      {importing && (
        <ImportDialog
          sources={sources}
          onClose={() => setImporting(false)}
          onImport={(rows, fileName, merged) => {
            onImport(rows, fileName, merged);
            onView('all');
          }}
        />
      )}
    </main>
  );
}

function NameCell({ name, onOpen }: { name: string; onOpen: () => void }) {
  return (
    <td className="hs-name-cell">
      <span className="hs-avatar hs-avatar-sm" aria-hidden="true">
        {initials(name)}
      </span>
      <button
        type="button"
        className="hs-link"
        onClick={(e) => {
          e.stopPropagation();
          onOpen();
        }}
      >
        {name}
      </button>
    </td>
  );
}

const Check = () => (
  <td className="hs-col-check">
    <span className="hs-check" aria-hidden="true" />
  </td>
);

/** Newest contacts first, as HubSpot sorts by create date. */
function AllContacts({ store, onOpen }: { store: AssessmentStore; onOpen: Props['onOpen'] }) {
  const [page, setPage] = useState(0);
  const people = [...store.dataset.candidates].reverse();
  const pages = Math.max(1, Math.ceil(people.length / PAGE));
  const firstJob = store.dataset.jobs[0]!.jobId;
  return (
    <>
      <div className="hs-table-wrap">
        <table className="hs-table" aria-label="All contacts">
          <thead>
            <tr>
              <th scope="col" className="hs-col-check">
                <span className="hs-check" aria-hidden="true" />
              </th>
              <th scope="col">Name</th>
              <th scope="col">Email</th>
              <th scope="col">Lead source</th>
              <th scope="col">Event</th>
              <th scope="col">Job title</th>
            </tr>
          </thead>
          <tbody>
            {people.slice(page * PAGE, page * PAGE + PAGE).map((c) => {
              const last = c.attendances.at(-1);
              return (
                <tr key={c.candidateKey} onClick={() => onOpen(c.candidateKey, firstJob)}>
                  <Check />
                  <NameCell name={c.fullName} onOpen={() => onOpen(c.candidateKey, firstJob)} />
                  <td>{c.email || '--'}</td>
                  <td>{last?.source || '--'}</td>
                  <td>
                    {last?.conferenceName}
                    {c.attendances.length > 1 && <span className="muted"> +{c.attendances.length - 1}</span>}
                  </td>
                  <td>{c.profile?.currentTitle || last?.listedTitle || '--'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="hs-pager">
        <button type="button" className="hs-pager-btn" disabled={page === 0} onClick={() => setPage(page - 1)}>
          ‹ Prev
        </button>
        <span className="hs-page-num">{page + 1}</span>
        <button type="button" className="hs-pager-btn" disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>
          Next ›
        </button>
        <span className="hs-perpage" aria-hidden="true">
          25 per page <Icon icon={ArrowDown01Icon} size={14} />
        </span>
      </div>
    </>
  );
}

function RoleView({
  store,
  comeet,
  jobId,
  name,
  onOpen,
}: {
  store: AssessmentStore;
  comeet: ComeetService;
  jobId: string;
  name: string;
  onOpen: Props['onOpen'];
}) {
  const result = store.result(jobId);
  const shortlist = result.candidates.filter((a) => a.recommendation === 'shortlist');
  const position = comeet.positionFor(jobId);
  if (shortlist.length === 0) {
    return (
      <div className="hs-empty">
        <p className="hs-empty-title">No contacts match this view.</p>
        <p className="muted">
          No one meets every shortlist condition for {result.job.title}. {result.counts.needs_review} need a recruiter's review.
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="hs-table-wrap">
        <table className="hs-table" aria-label={name}>
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
              <th scope="col">Comeet status</th>
            </tr>
          </thead>
          <tbody>
            {shortlist.map((a) => {
              const c = a.candidate;
              const ref = referenceSummary(a);
              const status = position ? comeetStatusText(comeet.statusFor(c.email, position.uid)) : '--';
              return (
                <tr key={c.candidateKey} onClick={() => onOpen(c.candidateKey, jobId)}>
                  <Check />
                  <NameCell name={c.fullName} onOpen={() => onOpen(c.candidateKey, jobId)} />
                  <td className="hs-rank">{a.shortlistRank}</td>
                  <td>{OUTCOME_LABEL[a.recommendation]}</td>
                  <td className="hs-wrap">{fitReason(a)}</td>
                  <td className={ref.unknown ? 'unknown' : undefined}>{ref.text}</td>
                  <td data-testid="comeet-status">{status}</td>
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
      </div>
    </>
  );
}

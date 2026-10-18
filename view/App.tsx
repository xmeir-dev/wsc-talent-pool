import { useEffect, useMemo, useRef, useState } from 'react';
import {
  assessJob,
  buildDataset,
  DataValidationError,
  toOutputRows,
  type Dataset,
  type SourceTexts,
} from '../pipeline';
import { CandidateDetail } from './CandidateDetail';
import { CandidateTable } from './CandidateTable';
import { bundledSources } from './data';
import { downloadCsv } from './download';
import { emptyShortlistCopy, VIEWS, type View } from './format';

type Loaded = { ok: true; dataset: Dataset } | { ok: false; problems: string[] };

function load(sources: SourceTexts): Loaded {
  try {
    return { ok: true, dataset: buildDataset(sources) };
  } catch (err) {
    if (err instanceof DataValidationError) return { ok: false, problems: err.problems };
    return { ok: false, problems: [err instanceof Error ? err.message : String(err)] };
  }
}

export function App({ sources = bundledSources }: { sources?: SourceTexts }) {
  const loaded = useMemo(() => load(sources), [sources]);
  if (!loaded.ok) {
    return (
      <main className="error" role="alert">
        <h1>The source data could not be read</h1>
        <ul>
          {loaded.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <p>Fix the files in data/ and reload.</p>
      </main>
    );
  }
  return <Workspace dataset={loaded.dataset} />;
}

function Workspace({ dataset }: { dataset: Dataset }) {
  const [jobId, setJobId] = useState(dataset.jobs[0]?.jobId ?? '');
  const [view, setView] = useState<View>('shortlist');
  const [openKey, setOpenKey] = useState<string | null>(null);
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());

  const result = useMemo(() => assessJob(dataset, jobId), [dataset, jobId]);
  const rows = useMemo(() => toOutputRows(result), [result]);
  const indexed = useMemo(() => result.candidates.map((a, i) => ({ a, row: rows[i]! })), [result, rows]);
  const visible = view === 'all' ? indexed : indexed.filter(({ a }) => a.recommendation === view);
  const open = openKey ? indexed.find(({ a }) => a.candidate.candidateKey === openKey) : undefined;

  const close = () => {
    const key = openKey;
    setOpenKey(null);
    if (key) requestAnimationFrame(() => rowButtons.current.get(key)?.focus());
  };

  useEffect(() => {
    if (!openKey) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const counts: Record<View, number> = {
    shortlist: result.counts.shortlist,
    needs_review: result.counts.needs_review,
    all: result.candidates.length,
  };

  return (
    <div className="app">
      <header className="toolbar">
        <label className="role">
          <span className="sr-only">Role</span>
          <select
            value={jobId}
            onChange={(e) => {
              setJobId(e.target.value);
              setOpenKey(null);
            }}
          >
            {dataset.jobs.map((j) => (
              <option key={j.jobId} value={j.jobId}>
                {j.jobId} · {j.title}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn-primary" onClick={() => downloadCsv(result)}>
          Export all for role
        </button>
      </header>

      <main className="content">
        <h1 className="sr-only">Candidates for {result.job.title}</h1>
        <div className="views" role="group" aria-label="View">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className="view"
              aria-pressed={view === v.id}
              onClick={() => setView(v.id)}
            >
              {v.label}
              <span className="view-count">{counts[v.id]}</span>
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          view === 'shortlist' && result.counts.needs_review > 0 ? (
            <div className="empty">
              <p className="empty-title">{emptyShortlistCopy(result).title}</p>
              <p>{emptyShortlistCopy(result).body}</p>
              <button type="button" className="btn-secondary" onClick={() => setView('needs_review')}>
                Open Needs review
              </button>
            </div>
          ) : (
            <div className="empty">
              <p className="empty-title">No candidates in this view.</p>
            </div>
          )
        ) : (
          <CandidateTable
            items={visible}
            showOutcome={view === 'all'}
            openKey={openKey}
            onOpen={setOpenKey}
            registerRow={(key, el) => {
              if (el) rowButtons.current.set(key, el);
              else rowButtons.current.delete(key);
            }}
          />
        )}
      </main>

      {open && <CandidateDetail key={open.a.candidate.candidateKey} a={open.a} row={open.row} onClose={close} />}
    </div>
  );
}

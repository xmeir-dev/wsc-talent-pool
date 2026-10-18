import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { Button, Callout, EmptyState, SegmentedControl, Select, TopBar } from '@meir-labs/ui-kit';
import {
  assessJob,
  buildDataset,
  DataValidationError,
  toOutputRows,
  type Dataset,
  type SourceTexts,
} from '../pipeline';
import { CandidateDetail } from './CandidateDetail';
import { CandidateTable, type Item } from './CandidateTable';
import { bundledSources } from './data';
import { downloadCsv } from './download';
import { emptyShortlistCopy, VIEWS, type View } from './format';

function keyFromHash(): string | null {
  const m = /^#\/candidate\/(.+)$/.exec(window.location.hash);
  return m ? decodeURIComponent(m[1]!) : null;
}

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
      <main className="content">
        <Callout tone="danger" title="The source data could not be read">
          <ul>
            {loaded.problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <p>Fix the files in data/ and reload.</p>
        </Callout>
      </main>
    );
  }
  return <Workspace dataset={loaded.dataset} />;
}

function Workspace({ dataset }: { dataset: Dataset }) {
  const [jobId, setJobId] = useState(dataset.jobs[0]?.jobId ?? '');
  const [view, setView] = useState<View>('shortlist');
  const [openKey, setOpenKeyState] = useState<string | null>(keyFromHash);

  const result = useMemo(() => assessJob(dataset, jobId), [dataset, jobId]);
  const rows = useMemo(() => toOutputRows(result), [result]);
  const indexed = useMemo<Item[]>(() => result.candidates.map((a, i) => ({ a, row: rows[i]! })), [result, rows]);
  const visible = view === 'all' ? indexed : indexed.filter(({ a }) => a.recommendation === view);
  const open = openKey ? indexed.find(({ a }) => a.candidate.candidateKey === openKey) : undefined;

  // The profile is its own page: #/candidate/<key>, so the browser back button works too.
  const pushed = useRef(false);
  const returnTo = useRef<{ name: string; scrollY: number } | null>(null);
  useEffect(() => {
    const onHash = () => setOpenKeyState(keyFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const openProfile = useCallback(
    (key: string) => {
      const item = indexed.find(({ a }) => a.candidate.candidateKey === key);
      returnTo.current = { name: item?.a.candidate.fullName ?? '', scrollY: window.scrollY };
      pushed.current = true;
      window.location.hash = `/candidate/${encodeURIComponent(key)}`;
      setOpenKeyState(key);
    },
    [indexed],
  );

  const back = useCallback(() => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      setOpenKeyState(null);
    }
  }, []);

  // Back on the list: restore the scroll position and put focus on the row that was opened.
  useLayoutEffect(() => {
    if (open || !returnTo.current) return;
    const { name, scrollY } = returnTo.current;
    returnTo.current = null;
    window.scrollTo(0, scrollY);
    const row = [...document.querySelectorAll<HTMLElement>('.candidates tbody tr')].find((r) =>
      r.textContent?.includes(name),
    );
    row?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    window.scrollTo(0, 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, back]);

  const counts: Record<View, number> = {
    shortlist: result.counts.shortlist,
    needs_review: result.counts.needs_review,
    all: result.candidates.length,
  };

  if (open) {
    return (
      <>
        <TopBar
          className="toolbar"
          left={
            <Button variant="ghost" onClick={back} leftIcon={<HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.75} />}>
              Back
            </Button>
          }
        />
        <main className="content profile">
          <CandidateDetail a={open.a} row={open.row} />
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar
        className="toolbar"
        left={
          <Select
            value={jobId}
            onValueChange={(v) => {
              setJobId(v);
            }}
          >
            <Select.Trigger aria-label="Role" />
            <Select.Content>
              {dataset.jobs.map((j) => (
                <Select.Item key={j.jobId} value={j.jobId}>
                  {`${j.jobId} · ${j.title}`}
                </Select.Item>
              ))}
            </Select.Content>
          </Select>
        }
        right={<Button onClick={() => downloadCsv(result)}>Export all for role</Button>}
      />

      <main className="content">
        <h1 className="ml-visually-hidden">Candidates for {result.job.title}</h1>
        <SegmentedControl
          className="views"
          aria-label="View"
          value={view}
          onChange={(v) => setView(v as View)}
          options={VIEWS.map((v) => ({ value: v.id, label: v.label, count: counts[v.id] }))}
        />

        {visible.length === 0 ? (
          view === 'shortlist' && result.counts.needs_review > 0 ? (
            <EmptyState
              variant="no-results"
              title={emptyShortlistCopy(result).title}
              description={emptyShortlistCopy(result).body}
              action={
                <Button variant="secondary" onClick={() => setView('needs_review')}>
                  Open Needs review
                </Button>
              }
            />
          ) : (
            <EmptyState variant="no-results" title="No candidates in this view." />
          )
        ) : (
          <CandidateTable items={visible} showOutcome={view === 'all'} onOpen={openProfile} />
        )}
      </main>

    </>
  );
}

import { useMemo, useRef, useState } from 'react';
import { Button, Callout, Drawer, EmptyState, SegmentedControl, Select, TopBar } from '@meir-labs/ui-kit';
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
  const [openKey, setOpenKey] = useState<string | null>(null);

  const result = useMemo(() => assessJob(dataset, jobId), [dataset, jobId]);
  const rows = useMemo(() => toOutputRows(result), [result]);
  const indexed = useMemo<Item[]>(() => result.candidates.map((a, i) => ({ a, row: rows[i]! })), [result, rows]);
  const visible = view === 'all' ? indexed : indexed.filter(({ a }) => a.recommendation === view);
  const open = openKey ? indexed.find(({ a }) => a.candidate.candidateKey === openKey) : undefined;

  // The drawer dissolves after close; keep showing the last person while it does.
  const shown = useRef<Item | undefined>(undefined);
  if (open) shown.current = open;

  const counts: Record<View, number> = {
    shortlist: result.counts.shortlist,
    needs_review: result.counts.needs_review,
    all: result.candidates.length,
  };

  return (
    <>
      <TopBar
        className="toolbar"
        left={
          <Select
            value={jobId}
            onValueChange={(v) => {
              setJobId(v);
              setOpenKey(null);
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
          <CandidateTable items={visible} showOutcome={view === 'all'} onOpen={setOpenKey} />
        )}
      </main>

      <Drawer
        open={open !== undefined}
        onClose={() => setOpenKey(null)}
        size="lg"
        title={shown.current?.a.candidate.fullName}
      >
        {shown.current && <CandidateDetail a={shown.current.a} row={shown.current.row} />}
      </Drawer>
    </>
  );
}

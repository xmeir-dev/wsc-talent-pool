import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon } from '@hugeicons/core-free-icons';
import { Button, Callout, EmptyState, Select, TopBar } from '@meir-labs/ui-kit';
import { buildDataset, DataValidationError, type Dataset, type SourceTexts } from '../pipeline';
import { attended, attendeesCsv, bestJobId, buildPool, jobItems } from './attendees';
import { CandidateDetail } from './CandidateDetail';
import { AttendeeTable, CandidateTable } from './CandidateTable';
import { bundledSources } from './data';
import { downloadFile, exportCsv } from './download';
import { jobLabel } from './format';

/** Select value for "no filter"; real values are conference names and job IDs. */
const ALL = '*';

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
  const pool = useMemo(() => buildPool(dataset), [dataset]);
  // Filters live here, so they survive a trip to a profile and back.
  const [conference, setConference] = useState(ALL);
  const [jobFilter, setJobFilter] = useState(ALL);
  const [openKey, setOpenKeyState] = useState<string | null>(keyFromHash);
  const [profileJob, setProfileJob] = useState<string | null>(null);

  const conf = conference === ALL ? null : conference;
  const job = jobFilter === ALL ? null : jobFilter;
  const attendees = useMemo(() => pool.attendees.filter((p) => attended(p.candidate, conf)), [pool, conf]);
  const items = useMemo(() => (job ? jobItems(pool, job, conf) : []), [pool, job, conf]);
  const shown = job ? items.length : attendees.length;
  const total = pool.attendees.length;

  const isKnown = openKey !== null && pool.items.get(pool.jobs[0]!.jobId)!.has(openKey);
  const viewJob = isKnown ? (profileJob ?? job ?? bestJobId(pool, openKey)) : null;
  const open = isKnown && viewJob ? pool.items.get(viewJob)!.get(openKey)! : undefined;

  // The profile is its own page: #/candidate/<key>, so the browser back button works too.
  const pushed = useRef(false);
  const returnTo = useRef<{ name: string; scrollY: number } | null>(null);
  useEffect(() => {
    const onHash = () => {
      setOpenKeyState(keyFromHash());
      setProfileJob(null);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const openProfile = useCallback(
    (key: string) => {
      const person = pool.attendees.find((p) => p.candidate.candidateKey === key);
      returnTo.current = { name: person?.candidate.fullName ?? '', scrollY: window.scrollY };
      pushed.current = true;
      window.location.hash = `/candidate/${encodeURIComponent(key)}`;
      setOpenKeyState(key);
      setProfileJob(null);
    },
    [pool],
  );

  const back = useCallback(() => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
      setOpenKeyState(null);
      setProfileJob(null);
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

  const profileOpen = open !== undefined;
  useEffect(() => {
    if (!profileOpen) return;
    window.scrollTo(0, 0);
    const onKey = (e: KeyboardEvent) => {
      // A picker closing on Escape marks the event handled; only a free Escape leaves the page.
      if (e.key === 'Escape' && !e.defaultPrevented) back();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [profileOpen, back]);

  if (open && viewJob) {
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
          <CandidateDetail
            a={open.a}
            row={open.row}
            jobPicker={
              <div className="assessed-for">
                <span className="muted">Assessed for</span>
                <Select value={viewJob} onValueChange={setProfileJob}>
                  <Select.Trigger aria-label="Assessed for" />
                  <Select.Content>
                    {pool.jobs.map((j) => (
                      <Select.Item key={j.jobId} value={j.jobId}>
                        {jobLabel(j)}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select>
              </div>
            }
          />
        </main>
      </>
    );
  }

  const onExport = () =>
    downloadFile(job ? exportCsv(pool.results.get(job)!) : attendeesCsv(attendees, conf));

  const filters = (
    <div className="filters">
      <Select value={conference} onValueChange={setConference}>
        <Select.Trigger aria-label="Conference" />
        <Select.Content>
          <Select.Item value={ALL}>All conferences</Select.Item>
          {pool.conferences.map((c) => (
            <Select.Item key={c.name} value={c.name}>
              {c.name}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
      <Select value={jobFilter} onValueChange={setJobFilter}>
        <Select.Trigger aria-label="Job" />
        <Select.Content>
          <Select.Item value={ALL}>All jobs</Select.Item>
          {pool.jobs.map((j) => (
            <Select.Item key={j.jobId} value={j.jobId}>
              {jobLabel(j)}
            </Select.Item>
          ))}
        </Select.Content>
      </Select>
      <Button variant="secondary" className="export" onClick={onExport}>
        Export
      </Button>
    </div>
  );
  const empty = <EmptyState variant="no-results" title="No one matches these filters." />;

  return (
    <main className="content">
      <h1 className="list-title">{conf || job ? `${shown} of ${total} attendees` : `All ${total} attendees`}</h1>
      {job ? (
        <CandidateTable items={items} onOpen={openProfile} toolbar={filters} emptyState={empty} />
      ) : (
        <AttendeeTable attendees={attendees} onOpen={openProfile} toolbar={filters} emptyState={empty} />
      )}
    </main>
  );
}

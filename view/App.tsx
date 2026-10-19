import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Download04Icon, Briefcase01Icon, Calendar03Icon, Location01Icon } from '@hugeicons/core-free-icons';
import { Button, Callout, EmptyState, PaginationFooter, usePagination, type SortState } from '@meir-labs/ui-kit';
import { buildDataset, DataValidationError, parseCsv, toCsv, type Dataset, type SourceTexts } from '../pipeline';
import { attendeesCsv, bestJobId, buildPool, countryCounts, filterAttendees, filterCounts, jobItems, sortAttendees } from './attendees';
import { CandidateDetail } from './CandidateDetail';
import { AttendeeTable } from './CandidateTable';
import { NewConference } from './NewConference';
import { SyncStatus } from './SyncStatus';
import { PoolCards } from './PoolCards';
import { bundledSources } from './data';
import offices from '../data/wsc_offices.json';
import { downloadFile, exportCsv } from './download';
import { FilterMenu, type FilterOption } from './FilterMenu';
import { conferenceShort, jobShort } from './format';

/** The list's default order: shortlisted first, then maybe relevant, then everyone else. */
const BY_RELEVANT_JOB: SortState = { columnId: 'relevant', direction: 'asc' };

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

/** A source file with more rows added, in the original columns. */
function withRows(base: string, added: string): string {
  const a = parseCsv(base);
  return toCsv(a.header, [...a.records, ...parseCsv(added).records]);
}

export function App({ sources: initial = bundledSources }: { sources?: SourceTexts }) {
  // An added conference lives in memory only; a reload goes back to the supplied files.
  const [sources, setSources] = useState(initial);
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
  const addAttendees = (text: string, profiles?: string): string[] | null => {
    const next = {
      ...sources,
      attendees: withRows(sources.attendees, text),
      ...(profiles && { profiles: withRows(sources.profiles, profiles) }),
    };
    const tried = load(next);
    if (!tried.ok) return tried.problems;
    setSources(next);
    return null;
  };
  return <Workspace dataset={loaded.dataset} onAddAttendees={addAttendees} />;
}

function Workspace({ dataset, onAddAttendees }: { dataset: Dataset; onAddAttendees: (text: string, profiles?: string) => string[] | null }) {
  const pool = useMemo(() => buildPool(dataset), [dataset]);
  // Filters live here, so they survive a trip to a profile and back.
  // Empty means no filter. Values are conference names and job IDs, in list order.
  const [conferences, setConferences] = useState<string[]>([]);
  const [jobIds, setJobIds] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [sort, setSort] = useState<SortState | null>(null);
  const [openKey, setOpenKeyState] = useState<string | null>(keyFromHash);

  // One table, same columns, whatever the filter. Exactly one job: that job's ranked order until a header is clicked.
  const job = jobIds.length === 1 ? jobIds[0]! : null;
  const attendees = useMemo(() => {
    const list = filterAttendees(pool, conferences, jobIds, countries);
    if (sort || !job) return sortAttendees(list, sort ?? BY_RELEVANT_JOB, pool.jobs);
    const order = new Map(jobItems(pool, job, []).map(({ a }, i) => [a.candidate.candidateKey, i]));
    return [...list].sort((x, y) => order.get(x.candidate.candidateKey)! - order.get(y.candidate.candidateKey)!);
  }, [pool, conferences, jobIds, countries, sort, job]);
  const shown = attendees.length;
  const [pageSize, setPageSize] = useState(12);
  const paged = usePagination(attendees, pageSize);
  // A new filter, sort or page size starts again at the first page.
  const { reset } = paged;
  useEffect(reset, [reset, conferences, jobIds, countries, sort, pageSize]);
  const { conferenceOptions, jobOptions, countryOptions } = useMemo(() => {
    const counts = filterCounts(pool);
    const conferenceOptions: FilterOption[] = pool.conferences.map((c) => {
      const short = conferenceShort(c.name);
      return { value: c.name, label: short, short, count: counts.conferences.get(c.name)!, title: short === c.name ? undefined : c.name };
    });
    const jobOptions: FilterOption[] = pool.jobs.map((j) => ({
      value: j.jobId,
      label: j.title,
      short: jobShort(j),
      count: counts.jobs.get(j.jobId)!,
    }));
    const countryOptions: FilterOption[] = countryCounts(pool).map((c) => ({ value: c.code, label: c.country, short: c.country, count: c.count }));
    return { conferenceOptions, jobOptions, countryOptions };
  }, [pool]);
  const total = pool.attendees.length;

  const openAttendee = openKey === null ? undefined : pool.attendees.find((p) => p.candidate.candidateKey === openKey);
  // Person-level facts (career, connections, events) are the same in every job's assessment; take the best job's.
  const open = openAttendee && pool.items.get(bestJobId(pool, openAttendee.candidate.candidateKey))!.get(openAttendee.candidate.candidateKey)!;

  // The profile is its own page: #/candidate/<key>, so the browser back button works too.
  const pushed = useRef(false);
  const returnTo = useRef<{ name: string; scrollY: number } | null>(null);
  useEffect(() => {
    const onHash = () => {
      setOpenKeyState(keyFromHash());
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

  if (open && openAttendee) {
    return (
      <main className="content profile">
        <CandidateDetail
          a={open.a}
          row={open.row}
          fits={openAttendee.relevantFor}
          onBack={back}
          onJob={(jobId) => {
            // Back to the list, showing that job's candidates in its ranked order.
            setJobIds([jobId]);
            setSort(null);
            back();
          }}
        />
      </main>
    );
  }

  const onExport = () =>
    downloadFile(job ? exportCsv(pool.results.get(job)!) : attendeesCsv(attendees, conferences, jobIds, countries));

  const filtered = conferences.length > 0 || jobIds.length > 0 || countries.length > 0;
  const filters = (
    <div className="filters">
      <span className="list-count">{filtered ? `${shown} of ${total} attendees` : `All ${total} attendees`}</span>
      <FilterMenu
        label="Conference"
        icon={Calendar03Icon}
        options={conferenceOptions}
        selected={conferences}
        onChange={setConferences}
      />
      <FilterMenu label="Job" icon={Briefcase01Icon} options={jobOptions} selected={jobIds} onChange={setJobIds} />
      <FilterMenu
        label="Location"
        icon={Location01Icon}
        options={countryOptions}
        selected={countries}
        onChange={setCountries}
        featured={{ label: 'WSC offices', values: Object.keys(offices.offices), more: (n) => `${n} more countries` }}
      />
      <Button variant="secondary" className="export" onClick={onExport} aria-label="Download CSV">
        <HugeiconsIcon icon={Download04Icon} size={16} strokeWidth={1.75} aria-hidden="true" />
        <span className="export-label" aria-hidden="true">
          Download CSV
        </span>
      </Button>
    </div>
  );
  const empty = <EmptyState variant="no-results" title="No one matches these filters." />;

  return (
    <main className="content">
      <header className="page-head d-head home-head">
        <img className="page-logo" src="/favicon-192.png" alt="WSC Sports" width={44} height={44} />
        <div className="page-title">
          <h1>WSC talent pool</h1>
          <p className="muted">Conference to candidate pipeline</p>
        </div>
        <SyncStatus />
        <NewConference
          existing={pool.conferences.map((c) => c.name)}
          onAdd={(text, names, profiles) => {
            const problems = onAddAttendees(text, profiles);
            // Show who came: filter the table to the new event.
            if (!problems) setConferences(names);
            return problems;
          }}
        />
      </header>
      <h2 className="section-label">At a glance</h2>
      <PoolCards
        pool={pool}
        attendeesPer={filterCounts(pool).conferences}
        conferences={{ selected: conferences, onSelect: setConferences }}
        jobs={{ selected: jobIds, onSelect: setJobIds }}
      />
      {filters}
      <AttendeeTable
        attendees={paged.page}
        onOpen={openProfile}
        emptyState={empty}
        // With no header clicked: one job keeps that job's ranked order, otherwise shortlisted people come first.
        sort={sort ?? (job ? null : BY_RELEVANT_JOB)}
        onSort={setSort}
      />
      {shown > 0 && (
        <PaginationFooter
          className="pager"
          pageIndex={paged.pageIndex}
          pageCount={paged.pageCount}
          onPage={paged.setPage}
          total={shown}
          pageSize={pageSize}
          pageSizeOptions={[12, 24, 48, 96]}
          onPageSizeChange={setPageSize}
          noun="attendee"
        />
      )}
      <footer className="page-foot">
        Made by{' '}
        <a href="https://www.linkedin.com/in/meir-rosenschein" target="_blank" rel="noreferrer">
          Meir Rosenschein
        </a>{' '}
        for WSC Sports, Oct 18–20, 2026
      </footer>
    </main>
  );
}

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Download04Icon, Briefcase01Icon, Calendar03Icon, Location01Icon, MailSend01Icon } from '@hugeicons/core-free-icons';
import { Button, Callout, Dropdown, EmptyState, PaginationFooter, usePagination, type SortState } from '@meir-labs/ui-kit';
import { buildDataset, DataValidationError, type Dataset, type SourceTexts } from '../pipeline';
import { attendeesXlsx, bestJobId, buildPool, countryCounts, filterAttendees, filterCounts, jobItems, sortAttendees } from './attendees';
import { CandidateDetail } from './CandidateDetail';
import { AttendeeTable } from './CandidateTable';
import { BulkActions } from './BulkActions';
import { NewConference } from './NewConference';
import { SyncStatus } from './SyncStatus';
import { STATUS_LABEL, statusIn, type RoleStatus } from './activity';
import { rememberIdentities, useActivity, useKnownPeople } from './actionStore';
import { PageFooter } from './PageFooter';
import { PoolCards } from './PoolCards';
import { bundledSources } from './data';
import offices from '../data/demo/wsc_offices.json';
import { downloadFile, exportCsv, exportXlsx } from './download';
import { importAttendeeList } from './importList';
import { FilterMenu, type FilterOption } from './FilterMenu';
import { conferenceShort, jobShort } from './format';

/** The list's default order: shortlisted first, then needs review, then everyone else. */
const BY_RELEVANT_JOB: SortState = { columnId: 'relevant', direction: 'asc' };

function keyFromHash(): string | null {
  const m = /^#\/candidate\/(.+)$/.exec(window.location.hash);
  return m ? decodeURIComponent(m[1]!) : null;
}

type Loaded = { ok: true; dataset: Dataset } | { ok: false; problems: string[] };

function load(sources: SourceTexts, knownPeople?: ReadonlyMap<string, string>): Loaded {
  try {
    return { ok: true, dataset: buildDataset(sources, { knownPeople }) };
  } catch (err) {
    if (err instanceof DataValidationError) return { ok: false, problems: err.problems };
    return { ok: false, problems: [err instanceof Error ? err.message : String(err)] };
  }
}

export function App({ sources: initial = bundledSources }: { sources?: SourceTexts }) {
  // An added conference lives in memory only; a reload goes back to the supplied files.
  const [sources, setSources] = useState(initial);
  // People with saved history keep the ID it is under, even if a later import adds or drops a LinkedIn URL or email.
  const known = useKnownPeople();
  const loaded = useMemo(() => load(sources, known), [sources, known]);
  // Links this build accepted (e.g. an import adding a LinkedIn URL to someone with history) are saved now, not
  // only when an action succeeds, so the next reload still finds the person.
  useEffect(() => {
    if (loaded.ok) void rememberIdentities(loaded.dataset.candidates);
  }, [loaded]);
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
  // The whole list is checked and the merged pool built before anything changes; a problem leaves the pool as it was.
  // People are resolved with the same known IDs as the pool, so saved history keeps its owner.
  const addAttendees: AddAttendees = (text, profiles) => {
    const result = importAttendeeList(sources, text, profiles, known);
    if (result.ok && result.added > 0) setSources(result.sources);
    return result;
  };
  return <Workspace dataset={loaded.dataset} onAddAttendees={addAttendees} />;
}

type AddAttendees = (text: string, profiles?: string) => ReturnType<typeof importAttendeeList>;

function Workspace({ dataset, onAddAttendees }: { dataset: Dataset; onAddAttendees: AddAttendees }) {
  const pool = useMemo(() => buildPool(dataset), [dataset]);
  // Filters live here, so they survive a trip to a profile and back.
  // Empty means no filter. Values are event edition keys and job IDs, in list order.
  const [conferences, setConferences] = useState<string[]>([]);
  const [jobIds, setJobIds] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  // Ticked rows for bulk Invite / Ask; kept across pages and filters.
  const [picked, setPicked] = useState<string[]>([]);
  const [sort, setSort] = useState<SortState | null>(null);
  const [openKey, setOpenKeyState] = useState<string | null>(keyFromHash);

  // One table, same columns, whatever the filter. Exactly one job: that job's ranked order until a header is clicked.
  const job = jobIds.length === 1 ? jobIds[0]! : null;
  const entries = useActivity();
  const jobList = useMemo(() => pool.jobs.map((j) => ({ jobId: j.jobId, title: j.title })), [pool]);
  // Outreach status: the selected role's, or each person's most advanced role when none is selected.
  const [statuses, setStatuses] = useState<string[]>([]);
  const others = useMemo(() => filterAttendees(pool, conferences, jobIds, countries), [pool, conferences, jobIds, countries]);
  const statusOf = useMemo(() => {
    const m = new Map<string, RoleStatus>();
    for (const p of others) m.set(p.candidate.candidateKey, statusIn(entries, p.candidate.candidateKey, jobList, job).status);
    return m;
  }, [others, entries, jobList, job]);
  const statusOptions: FilterOption[] = useMemo(() => {
    const count = new Map<RoleStatus, number>();
    for (const s of statusOf.values()) count.set(s, (count.get(s) ?? 0) + 1);
    // A chosen status stays listed (with 0) when the role has no one in it, so the filter never hides people while saying "All".
    return (Object.keys(STATUS_LABEL) as RoleStatus[])
      .filter((s) => count.has(s) || statuses.includes(s))
      .map((s) => ({ value: s, label: STATUS_LABEL[s], short: STATUS_LABEL[s], count: count.get(s) ?? 0 }));
  }, [statusOf, statuses]);
  const attendees = useMemo(() => {
    const list = statuses.length ? others.filter((p) => statuses.includes(statusOf.get(p.candidate.candidateKey)!)) : others;
    if (sort || !job) return sortAttendees(list, sort ?? BY_RELEVANT_JOB, pool.jobs);
    const order = new Map(jobItems(pool, job, []).map(({ a }, i) => [a.candidate.candidateKey, i]));
    return [...list].sort((x, y) => order.get(x.candidate.candidateKey)! - order.get(y.candidate.candidateKey)!);
  }, [pool, others, statuses, statusOf, sort, job]);
  const shown = attendees.length;
  const [pageSize, setPageSize] = useState(12);
  const paged = usePagination(attendees, pageSize);
  // A new filter, sort or page size starts again at the first page.
  const { reset } = paged;
  useEffect(reset, [reset, conferences, jobIds, countries, statuses, sort, pageSize]);
  const { conferenceOptions, jobOptions, countryOptions } = useMemo(() => {
    const counts = filterCounts(pool);
    const conferenceOptions: FilterOption[] = pool.conferences.map((c) => {
      // The edition's qualifier ("(2024)") stays on the short name, so two runs of one conference read apart.
      const short = conferenceShort(c.name) + c.label.slice(c.name.length);
      return { value: c.key, label: short, short, count: counts.conferences.get(c.key)!, title: short === c.label ? undefined : c.label };
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
      <>
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
        <PageFooter />
      </>
    );
  }

  // The people shown, every filter applied, as an Excel file. With one job there are two more named choices:
  // that job's full assessment as Excel, and the exact CRM import CSV (the CLI's file, values unaltered).
  const labelOf = (key: string) => pool.conferences.find((c) => c.key === key)?.label ?? key;
  const exportShown = () => downloadFile(attendeesXlsx(attendees, conferences.map(labelOf), jobIds, countries));
  const exportButton = (
    <Button variant="secondary" className="export" onClick={job ? undefined : exportShown} aria-label="Download">
      <HugeiconsIcon icon={Download04Icon} size={16} strokeWidth={1.75} aria-hidden="true" />
      <span className="export-label" aria-hidden="true">
        Download
      </span>
    </Button>
  );

  const filtered = conferences.length > 0 || jobIds.length > 0 || countries.length > 0 || statuses.length > 0;
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
      <FilterMenu label="Status" icon={MailSend01Icon} options={statusOptions} selected={statuses} onChange={setStatuses} />
      {job ? (
        <Dropdown
          // The menu is portaled; `contents` keeps the button itself on the filter line's flex layout.
          style={{ display: 'contents' }}
          align="end"
          trigger={exportButton}
          items={[
            { value: 'shown', label: `Attendees shown (${shown}), Excel` },
            { value: 'job', label: `Full ${job} assessment (${pool.results.get(job)!.candidates.length}), Excel` },
            { value: 'crm', label: `CRM import CSV, full ${job} assessment` },
          ]}
          onSelect={(v) =>
            v === 'crm'
              ? downloadFile(exportCsv(pool.results.get(job)!))
              : v === 'job'
                ? downloadFile(exportXlsx(pool.results.get(job)!))
                : exportShown()
          }
        />
      ) : (
        exportButton
      )}
    </div>
  );
  const empty = <EmptyState variant="no-results" title="No one matches these filters." />;

  return (
    <>
      <main className="content">
        <header className="page-head d-head home-head">
        <img className="page-logo" src="/favicon-192.png" alt="WSC Sports" width={44} height={44} />
        <div className="page-title">
          <h1>WSC talent pool</h1>
          <p className="muted">Conference to candidate pipeline</p>
        </div>
        <SyncStatus />
        <NewConference
          onAdd={(text, profiles) => {
            const result = onAddAttendees(text, profiles);
            // Show who came: filter the table to the list's event editions.
            if (result.ok) setConferences(result.editions);
            return result;
          }}
        />
      </header>
      {/* Same section title as the profile page, so spacing under the header and above content matches. */}
      <h2 className="d-section-title">
        <span>At a glance</span>
      </h2>
      <PoolCards
        pool={pool}
        attendeesPer={filterCounts(pool).conferences}
        conferences={{ selected: conferences, onSelect: setConferences }}
        jobs={{ selected: jobIds, onSelect: setJobIds }}
      />
      {filters}
      <BulkActions
        selected={pool.attendees.filter((p) => picked.includes(p.candidate.candidateKey))}
        jobs={pool.jobs}
        onClear={() => setPicked([])}
      />
      <AttendeeTable
        attendees={paged.page}
        onOpen={openProfile}
        emptyState={empty}
        // With no header clicked: one job keeps that job's ranked order, otherwise shortlisted people come first.
        sort={sort ?? (job ? null : BY_RELEVANT_JOB)}
        onSort={setSort}
        selected={picked}
        onSelect={setPicked}
      />
      <BulkActions
        selected={pool.attendees.filter((p) => picked.includes(p.candidate.candidateKey))}
        jobs={pool.jobs}
        onClear={() => setPicked([])}
        below
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
      </main>
      <PageFooter />
    </>
  );
}

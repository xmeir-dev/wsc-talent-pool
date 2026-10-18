import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowLeft01Icon, Briefcase01Icon, Calendar03Icon, Location01Icon } from '@hugeicons/core-free-icons';
import { Button, Callout, EmptyState, Select, TopBar, type SortState } from '@meir-labs/ui-kit';
import { buildDataset, DataValidationError, type Dataset, type SourceTexts } from '../pipeline';
import { attendeesCsv, bestJobId, buildPool, countryCounts, filterAttendees, filterCounts, jobItems, sortAttendees } from './attendees';
import { CandidateDetail } from './CandidateDetail';
import { AttendeeTable, CandidateTable } from './CandidateTable';
import { bundledSources } from './data';
import { downloadFile, exportCsv } from './download';
import { FilterMenu, type FilterOption } from './FilterMenu';
import { conferenceShort, jobLabel, jobShort } from './format';

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
  // Empty means no filter. Values are conference names and job IDs, in list order.
  const [conferences, setConferences] = useState<string[]>([]);
  const [jobIds, setJobIds] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [sort, setSort] = useState<SortState | null>(null);
  const [openKey, setOpenKeyState] = useState<string | null>(keyFromHash);
  const [profileJob, setProfileJob] = useState<string | null>(null);

  // Exactly one job: that job's ranked view. None or several: the attendee list.
  const job = jobIds.length === 1 ? jobIds[0]! : null;
  const attendees = useMemo(
    () => sortAttendees(filterAttendees(pool, conferences, jobIds, countries), sort, pool.jobs),
    [pool, conferences, jobIds, countries, sort],
  );
  const items = useMemo(() => (job ? jobItems(pool, job, conferences, countries) : []), [pool, job, conferences, countries]);
  const shown = job ? items.length : attendees.length;
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

  const isKnown = openKey !== null && pool.items.get(pool.jobs[0]!.jobId)!.has(openKey);
  const viewJob = isKnown ? (profileJob ?? job ?? bestJobId(pool, openKey, jobIds)) : null;
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
    downloadFile(job ? exportCsv(pool.results.get(job)!) : attendeesCsv(attendees, conferences, jobIds, countries));

  const filtered = conferences.length > 0 || jobIds.length > 0 || countries.length > 0;
  const filters = (
    <div className="filters">
      <h1 className="list-title">{filtered ? `${shown} of ${total} attendees` : `All ${total} attendees`}</h1>
      <FilterMenu
        label="Conference"
        icon={Calendar03Icon}
        options={conferenceOptions}
        selected={conferences}
        onChange={setConferences}
      />
      <FilterMenu label="Job" icon={Briefcase01Icon} options={jobOptions} selected={jobIds} onChange={setJobIds} />
      <FilterMenu label="Location" icon={Location01Icon} options={countryOptions} selected={countries} onChange={setCountries} />
      <Button variant="secondary" className="export" onClick={onExport}>
        Export
      </Button>
    </div>
  );
  const empty = <EmptyState variant="no-results" title="No one matches these filters." />;

  return (
    <main className="content">
      {filters}
      {job ? (
        <CandidateTable items={items} onOpen={openProfile} emptyState={empty} />
      ) : (
        <AttendeeTable attendees={attendees} onOpen={openProfile} emptyState={empty} sort={sort} onSort={setSort} />
      )}
    </main>
  );
}

import { useMemo, useRef, useState } from 'react';
import { buildDataset, type SourceTexts } from '../pipeline';
import { activitySnapshot, useKnownPeople } from '../view/actionStore';
import { bundledSources } from '../view/data';
import { buildAssessmentStore, type AssessmentStore } from './assessments';
import { createSimulatedComeet, type ComeetService } from './comeet';
import { ComeetApp } from './ComeetApp';
import { HubSpotContact } from './HubSpotContact';
import { HubSpotList } from './HubSpotList';
import { HubSpotShell, type Notice } from './HubSpotShell';
import { addRole, applyImport, type ImportRow, type NewRole } from './sources';

type Host = 'hubspot' | 'comeet';
/** view: 'all' or a job ID (that role's saved shortlist view). */
type HubSpotScreen = { name: 'list'; view: string } | { name: 'contact'; candidateKey: string; jobId: string; view: string };
type ComeetScreen = { positionUid: string; openUid: string | null };

interface Props {
  sources?: SourceTexts;
  /** Tests pass 0 so the simulated service answers immediately. */
  delayMs?: number;
}

function roleLines(store: AssessmentStore, jobIds: string[]) {
  return jobIds.map((jobId) => {
    const r = store.result(jobId);
    return { jobId, title: r.job.title, shortlist: r.counts.shortlist, needsReview: r.counts.needs_review };
  });
}

/** The overnight run: every contact in the pool scored for every open role. */
function overnightNotice(store: AssessmentStore): Notice {
  const events = new Set(store.dataset.candidates.flatMap((c) => c.attendances.map((a) => a.conferenceName)));
  return {
    id: 'overnight',
    title: 'Talent match ran overnight',
    body: `${store.dataset.candidates.length} conference contacts from ${events.size} events scored for ${store.dataset.jobs.length} open roles.`,
    lines: roleLines(
      store,
      store.dataset.jobs.map((j) => j.jobId),
    ),
  };
}

/** Two simulated products side by side, like two browser tabs. The strip on top switches between them. */
export function App({ sources: initialSources = bundledSources, delayMs }: Props) {
  const [sources, setSources] = useState(initialSources);
  const known = useKnownPeople();
  const store = useMemo(() => buildAssessmentStore(buildDataset(sources, { knownPeople: known })), [sources, known]);
  const [session, setSession] = useState(0);
  // The service reads the current pool (imports included) and history on every check, as a real backend would.
  const latest = useRef(store);
  latest.current = store;
  // A fresh simulated Comeet per demo session; Reset demo discards everything handed off.
  const comeet: ComeetService = useMemo(
    () => createSimulatedComeet({ isAvailable: () => true, delayMs, people: () => latest.current.dataset.candidates, history: activitySnapshot }),
    [session, delayMs],
  );
  const firstPosition = comeet.positions()[0]!.uid;
  const [host, setHost] = useState<Host>('hubspot');
  const [hubspot, setHubspot] = useState<HubSpotScreen>({ name: 'list', view: 'all' });
  const [comeetScreen, setComeetScreen] = useState<ComeetScreen>({ positionUid: firstPosition, openUid: null });
  const [notices, setNotices] = useState<Notice[]>(() => [overnightNotice(store)]);
  const [unread, setUnread] = useState(1);
  // Bumped when Comeet changes, so HubSpot re-reads the synced "Comeet status".
  const [, setSyncTick] = useState(0);

  const notify = (n: Notice) => {
    setNotices((all) => [n, ...all]);
    setUnread((u) => u + 1);
  };

  const reset = () => {
    setSession((s) => s + 1);
    setSources(initialSources);
    setHost('hubspot');
    setHubspot({ name: 'list', view: 'all' });
    setComeetScreen({ positionUid: firstPosition, openUid: null });
    setNotices([overnightNotice(buildAssessmentStore(buildDataset(initialSources)))]);
    setUnread(1);
  };

  const openInComeet = (uid: string) => {
    const c = comeet.get(uid);
    if (c) setComeetScreen({ positionUid: c.positionUid, openUid: uid });
    setHost('comeet');
  };

  const importRows = (rows: ImportRow[], fileName: string, merged: number) => {
    const next = applyImport(rows, sources);
    const nextStore = buildAssessmentStore(buildDataset(next, { knownPeople: known }));
    setSources(next);
    notify({
      id: `import-${Date.now()}`,
      title: `Import finished: ${fileName}`,
      body: `${rows.length - merged} new contacts, ${merged} added as an event to an existing contact. Pool re-scored for ${nextStore.dataset.jobs.length} open roles.`,
      lines: roleLines(
        nextStore,
        nextStore.dataset.jobs.map((j) => j.jobId),
      ),
    });
  };

  const openRole = (role: NewRole) => {
    const { sources: next, jobId } = addRole(role, sources);
    const nextStore = buildAssessmentStore(buildDataset(next));
    const position = comeet.addPosition(jobId, role.title.trim());
    setSources(next);
    setComeetScreen({ positionUid: position.uid, openUid: null });
    notify({
      id: `role-${jobId}`,
      title: `New Comeet position: ${role.title.trim()}`,
      body: `The talent pool was scored for it. A saved view was added.`,
      lines: roleLines(nextStore, [jobId]),
    });
  };

  const hubspotView = hubspot.view;

  return (
    <div className="demo">
      <div className="demo-bar" role="region" aria-label="Demo controls">
        <div className="demo-hosts" role="group" aria-label="App">
          <button type="button" aria-pressed={host === 'hubspot'} onClick={() => setHost('hubspot')}>
            HubSpot
            {unread > 0 && host !== 'hubspot' && <span className="demo-dot" aria-hidden="true" />}
          </button>
          <button type="button" aria-pressed={host === 'comeet'} onClick={() => setHost('comeet')}>
            Comeet
          </button>
        </div>
        <p className="demo-label">Integration concept · synthetic data · no live connection.</p>
        <div className="demo-controls">
          <button type="button" className="demo-reset" onClick={reset}>
            Reset demo
          </button>
        </div>
      </div>

      {host === 'hubspot' && (
        <HubSpotShell
          key={session}
          notices={notices}
          unread={unread}
          onReadAll={() => setUnread(0)}
          onOpenView={(view) => setHubspot({ name: 'list', view })}
        >
          {hubspot.name === 'list' ? (
            <HubSpotList
              store={store}
              sources={sources}
              comeet={comeet}
              view={hubspotView}
              onView={(view) => setHubspot({ name: 'list', view })}
              onOpen={(candidateKey, jobId) => setHubspot({ name: 'contact', candidateKey, jobId, view: hubspotView })}
              onImport={importRows}
            />
          ) : (
            <HubSpotContact
              key={`${session}-${hubspot.candidateKey}`}
              store={store}
              comeet={comeet}
              candidateKey={hubspot.candidateKey}
              jobId={hubspot.jobId}
              onJobChange={(jobId) => setHubspot({ ...hubspot, jobId })}
              onBack={() => setHubspot({ name: 'list', view: hubspot.view })}
              onOpenComeet={openInComeet}
              onHandedOff={() => setSyncTick((t) => t + 1)}
            />
          )}
        </HubSpotShell>
      )}
      {host === 'comeet' && (
        <ComeetApp
          key={session}
          comeet={comeet}
          positionUid={comeetScreen.positionUid}
          openUid={comeetScreen.openUid}
          onNavigate={setComeetScreen}
          onOpenRole={openRole}
        />
      )}
    </div>
  );
}

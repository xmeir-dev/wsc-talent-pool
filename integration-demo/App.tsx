import { useMemo, useRef, useState } from 'react';
import { buildDataset, type SourceTexts } from '../pipeline';
import { bundledSources } from '../view/data';
import { buildAssessmentStore } from './assessments';
import { createSimulatedComeet, type ComeetService } from './comeet';
import { ComeetApp } from './ComeetApp';
import { HubSpotContact } from './HubSpotContact';
import { HubSpotList } from './HubSpotList';

/** The saved HubSpot view is a snapshot of one role. */
export const LIST_JOB_ID = 'JOB001';

type Host = 'hubspot' | 'comeet';
type HubSpotScreen = { name: 'list' } | { name: 'contact'; candidateKey: string; jobId: string };
type ComeetScreen = { positionUid: string; openUid: string | null };

interface Props {
  sources?: SourceTexts;
  /** Tests pass 0 so the simulated service answers immediately. */
  delayMs?: number;
}

/** Two simulated products side by side, like two browser tabs. The strip on top switches between them. */
export function App({ sources = bundledSources, delayMs }: Props) {
  const store = useMemo(() => buildAssessmentStore(buildDataset(sources)), [sources]);
  const [session, setSession] = useState(0);
  const [available, setAvailable] = useState(true);
  const availableRef = useRef(available);
  availableRef.current = available;
  // A fresh simulated Comeet per demo session; Reset demo discards everything handed off.
  const comeet: ComeetService = useMemo(
    () => createSimulatedComeet({ isAvailable: () => availableRef.current, delayMs }),
    [session, delayMs],
  );
  const firstPosition = comeet.positionFor(LIST_JOB_ID)!.uid;
  const [host, setHost] = useState<Host>('hubspot');
  const [hubspot, setHubspot] = useState<HubSpotScreen>({ name: 'list' });
  const [comeetScreen, setComeetScreen] = useState<ComeetScreen>({ positionUid: firstPosition, openUid: null });

  const reset = () => {
    setSession((s) => s + 1);
    setAvailable(true);
    setHost('hubspot');
    setHubspot({ name: 'list' });
    setComeetScreen({ positionUid: firstPosition, openUid: null });
  };

  const openInComeet = (uid: string) => {
    const c = comeet.get(uid);
    if (c) setComeetScreen({ positionUid: c.positionUid, openUid: uid });
    setHost('comeet');
  };

  return (
    <div className="demo">
      <div className="demo-bar" role="region" aria-label="Demo controls">
        <div className="demo-hosts" role="group" aria-label="App">
          <button type="button" aria-pressed={host === 'hubspot'} onClick={() => setHost('hubspot')}>
            HubSpot
          </button>
          <button type="button" aria-pressed={host === 'comeet'} onClick={() => setHost('comeet')}>
            Comeet
          </button>
        </div>
        <p className="demo-label">Integration concept · synthetic data · no live connection.</p>
        <div className="demo-controls">
          <label className="demo-switch">
            <input type="checkbox" checked={!available} onChange={(e) => setAvailable(!e.target.checked)} />
            Simulate Comeet outage
          </label>
          <button type="button" className="demo-reset" onClick={reset}>
            Reset demo
          </button>
        </div>
      </div>

      {host === 'hubspot' && hubspot.name === 'list' && (
        <HubSpotList
          result={store.result(LIST_JOB_ID)}
          onOpen={(candidateKey) => setHubspot({ name: 'contact', candidateKey, jobId: LIST_JOB_ID })}
        />
      )}
      {host === 'hubspot' && hubspot.name === 'contact' && (
        <HubSpotContact
          key={`${session}-${hubspot.candidateKey}`}
          store={store}
          comeet={comeet}
          candidateKey={hubspot.candidateKey}
          jobId={hubspot.jobId}
          onJobChange={(jobId) => setHubspot({ ...hubspot, jobId })}
          onBack={() => setHubspot({ name: 'list' })}
          onOpenComeet={openInComeet}
        />
      )}
      {host === 'comeet' && (
        <ComeetApp
          key={session}
          comeet={comeet}
          positionUid={comeetScreen.positionUid}
          openUid={comeetScreen.openUid}
          onNavigate={setComeetScreen}
        />
      )}
    </div>
  );
}

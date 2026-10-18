import { useMemo, useRef, useState } from 'react';
import { buildDataset, type SourceTexts } from '../pipeline';
import { bundledSources } from '../view/data';
import { buildAssessmentStore } from './assessments';
import { createSimulatedComeet, type ComeetService } from './comeet';
import { ComeetRecord } from './ComeetRecord';
import { HubSpotContact } from './HubSpotContact';
import { HubSpotList } from './HubSpotList';

/** The saved HubSpot view is a snapshot of one role. */
export const LIST_JOB_ID = 'JOB001';

export type Screen =
  | { name: 'list' }
  | { name: 'contact'; candidateKey: string; jobId: string }
  | { name: 'comeet'; uid: string; from: { candidateKey: string; jobId: string } };

interface Props {
  sources?: SourceTexts;
  /** Tests pass 0 so the simulated service answers immediately. */
  delayMs?: number;
}

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
  const [screen, setScreen] = useState<Screen>({ name: 'list' });

  const reset = () => {
    setSession((s) => s + 1);
    setAvailable(true);
    setScreen({ name: 'list' });
  };

  return (
    <div className="demo">
      <div className="demo-bar" role="region" aria-label="Demo controls">
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

      {screen.name === 'list' && (
        <HubSpotList
          result={store.result(LIST_JOB_ID)}
          onOpen={(candidateKey) => setScreen({ name: 'contact', candidateKey, jobId: LIST_JOB_ID })}
        />
      )}
      {screen.name === 'contact' && (
        <HubSpotContact
          key={`${session}-${screen.candidateKey}`}
          store={store}
          comeet={comeet}
          candidateKey={screen.candidateKey}
          jobId={screen.jobId}
          onJobChange={(jobId) => setScreen({ ...screen, jobId })}
          onBack={() => setScreen({ name: 'list' })}
          onOpenComeet={(uid) =>
            setScreen({ name: 'comeet', uid, from: { candidateKey: screen.candidateKey, jobId: screen.jobId } })
          }
        />
      )}
      {screen.name === 'comeet' && (
        <ComeetRecord candidate={comeet.get(screen.uid)} onBack={() => setScreen({ name: 'contact', ...screen.from })} />
      )}
    </div>
  );
}

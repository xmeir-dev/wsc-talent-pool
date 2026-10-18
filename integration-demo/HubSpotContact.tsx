import { useEffect, useRef, useState } from 'react';
import { RELEVANCE_LABEL } from '../view/format';
import type { AssessmentStore } from './assessments';
import type { ComeetService } from './comeet';
import { HandoffDialog } from './HandoffDialog';
import { HubSpotNav } from './HubSpotNav';
import { TalentMatchCard } from './TalentMatchCard';

interface Props {
  store: AssessmentStore;
  comeet: ComeetService;
  candidateKey: string;
  jobId: string;
  onJobChange: (jobId: string) => void;
  onBack: () => void;
  onOpenComeet: (uid: string) => void;
}

export function HubSpotContact({ store, comeet, candidateKey, jobId, onJobChange, onBack, onOpenComeet }: Props) {
  const [handoffOpen, setHandoffOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  const entry = store.get(candidateKey, jobId);
  if (!entry) return null;
  const { a } = entry;
  const c = a.candidate;
  const p = c.profile;

  return (
    <div className="host hs">
      <HubSpotNav />
      <div className="hs-record">
        <aside className="hs-left" aria-label="Contact properties">
          <button type="button" className="hs-back" onClick={onBack}>
            ← Contacts
          </button>
          <h1 ref={heading} tabIndex={-1} className="hs-name">
            {c.fullName}
          </h1>
          <p className="muted">{[p?.currentTitle, p?.currentCompany].filter(Boolean).join(' at ')}</p>
          <dl className="hs-props">
            <dt>Email</dt>
            <dd>{c.email || <span className="unknown">Not set</span>}</dd>
            <dt>LinkedIn</dt>
            <dd className="hs-break">{c.linkedinUrl || <span className="unknown">Not set</span>}</dd>
            <dt>Location</dt>
            <dd>{p?.location || <span className="unknown">Not set</span>}</dd>
            <dt>Contact IDs</dt>
            <dd>{c.sourceContactIds.join(', ')}</dd>
          </dl>
        </aside>

        <main className="hs-middle">
          <h2 className="hs-section-title">Conference activity</h2>
          <ul className="hs-timeline">
            {a.events.map((e) => (
              <li key={e.attendance.hubspotId}>
                <p>
                  <strong>{e.attendance.conferenceName}</strong>
                  <span className="muted"> · {e.attendance.conferenceDate}</span>
                </p>
                <p className="muted">
                  Listed as {e.attendance.listedTitle || 'no title'}, {e.attendance.listedCompany || 'no company'} ·{' '}
                  {RELEVANCE_LABEL[e.relevance]} to this role
                </p>
                {e.attendance.notes && <p>"{e.attendance.notes}"</p>}
              </li>
            ))}
          </ul>
        </main>

        <aside className="hs-right" aria-label="App cards">
          <TalentMatchCard
            store={store}
            entry={entry}
            jobId={jobId}
            onJobChange={onJobChange}
            onHandoff={() => setHandoffOpen(true)}
          />
        </aside>
      </div>

      {handoffOpen && (
        <HandoffDialog
          entry={entry}
          version={store.version}
          comeet={comeet}
          onClose={() => setHandoffOpen(false)}
          onOpenComeet={onOpenComeet}
        />
      )}
    </div>
  );
}

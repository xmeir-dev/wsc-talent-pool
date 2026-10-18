import { useEffect, useRef, useState } from 'react';
import { RELEVANCE_LABEL } from '../view/format';
import type { AssessmentStore } from './assessments';
import type { ComeetService } from './comeet';
import { HandoffDialog } from './HandoffDialog';
import { HubSpotNav } from './HubSpotNav';
import { initials } from './initials';
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

/**
 * HubSpot's three-column contact record. The Talent match app card sits in the middle column's
 * Overview tab (a supported app-card location), so the assessment gets the full width.
 */
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
          <div className="hs-identity">
            <span className="hs-avatar" aria-hidden="true">
              {initials(c.fullName)}
            </span>
            <h1 ref={heading} tabIndex={-1} className="hs-name">
              {c.fullName}
            </h1>
            <p className="hs-subtitle">{[p?.currentTitle, p?.currentCompany].filter(Boolean).join(' at ')}</p>
            <p className="hs-email">{c.email}</p>
          </div>
          <h2 className="hs-about">About this contact</h2>
          <dl className="hs-props">
            <dt>Email</dt>
            <dd>{c.email || <span className="unknown">Not set</span>}</dd>
            <dt>LinkedIn</dt>
            <dd className="hs-break">{c.linkedinUrl || <span className="unknown">Not set</span>}</dd>
            <dt>Location</dt>
            <dd>{p?.location || <span className="unknown">Not set</span>}</dd>
            <dt>Lead source</dt>
            <dd>{a.events.map((e) => e.attendance.conferenceName).join(', ')}</dd>
          </dl>
        </aside>

        <main className="hs-middle">
          <div className="hs-tabs" role="tablist" aria-label="Record tabs">
            <span className="hs-tab is-active" role="tab" aria-selected="true">
              Overview
            </span>
            <span className="hs-tab" aria-disabled="true">
              Activities
            </span>
          </div>

          <TalentMatchCard
            store={store}
            entry={entry}
            jobId={jobId}
            onJobChange={onJobChange}
            onHandoff={() => setHandoffOpen(true)}
          />

          <section className="hs-card" aria-labelledby="hs-events">
            <h2 id="hs-events" className="hs-card-title">
              Conference activity
            </h2>
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
          </section>
        </main>

        <aside className="hs-right" aria-label="Associations">
          <section className="hs-assoc">
            <h2>Companies (1)</h2>
            <p className="hs-assoc-name">{p?.currentCompany || c.attendances.at(-1)?.listedCompany}</p>
          </section>
          <section className="hs-assoc">
            <h2>Deals (0)</h2>
          </section>
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

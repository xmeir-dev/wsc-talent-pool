import { useEffect, useRef } from 'react';
import type { ComeetCandidate } from './comeet';

interface Props {
  candidate: ComeetCandidate | undefined;
  onBack: () => void;
}

function Value({ v }: { v: string | undefined }) {
  return v ? <>{v}</> : <span className="unknown">Not set</span>;
}

/** Comeet's own candidate record with the configured custom fields; no invented panels. */
export function ComeetRecord({ candidate: c, onBack }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);

  return (
    <div className="host cm">
      <nav className="cm-nav" aria-label="Comeet (simulated)">
        <span className="cm-brand">Comeet</span>
        <span className="cm-nav-item">Positions</span>
        <span className="cm-nav-item is-active">Candidates</span>
      </nav>
      <main className="cm-page">
        <button type="button" className="cm-back" onClick={onBack}>
          ← Back to HubSpot
        </button>
        {!c ? (
          <p role="alert">This candidate is no longer in the simulated Comeet. Reset demo clears it.</p>
        ) : (
          <>
            <header className="cm-head">
              <div>
                <h1 ref={heading} tabIndex={-1}>
                  {c.firstName} {c.lastName}
                </h1>
                <p className="muted">
                  {c.positionName} · {c.uid}
                </p>
              </div>
              <span className="cm-status" data-testid="cm-status">
                {c.status === 'Sourced' ? 'Sourced' : `${c.status} · ${c.stage}`}
              </span>
            </header>

            <div className="cm-grid">
              <section className="cm-card" aria-labelledby="cm-details">
                <h2 id="cm-details">Details</h2>
                <dl className="cm-fields">
                  <dt>Email</dt>
                  <dd>
                    <Value v={c.email} />
                  </dd>
                  <dt>LinkedIn</dt>
                  <dd className="hs-break">
                    <Value v={c.linkedinUrl} />
                  </dd>
                  <dt>Source</dt>
                  <dd>{c.source}</dd>
                  <dt>Owner</dt>
                  <dd>{c.owner}</dd>
                  <dt>Next step</dt>
                  <dd>{c.nextStep}</dd>
                </dl>
              </section>

              <section className="cm-card" aria-labelledby="cm-custom">
                <h2 id="cm-custom">Custom fields</h2>
                <dl className="cm-fields">
                  <dt>Role fit</dt>
                  <dd>
                    <Value v={c.customFields?.roleFit} />
                  </dd>
                  <dt>Evidence</dt>
                  <dd>
                    <Value v={c.customFields?.evidence} />
                  </dd>
                  <dt>Gaps</dt>
                  <dd>
                    <Value v={c.customFields?.gaps} />
                  </dd>
                  <dt>Possible references</dt>
                  <dd>
                    <Value v={c.customFields?.possibleReferences} />
                  </dd>
                  <dt>Assessment</dt>
                  <dd>
                    <Value v={c.customFields?.assessment} />
                  </dd>
                </dl>
              </section>
            </div>

            {c.note && (
              <section className="cm-card cm-note" aria-labelledby="cm-note">
                <h2 id="cm-note">Note</h2>
                <p>{c.note}</p>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

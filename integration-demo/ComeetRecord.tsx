import { useEffect, useRef } from 'react';
import type { ComeetCandidate, ComeetService } from './comeet';
import { initials } from './initials';

interface Props {
  comeet: ComeetService;
  uid: string;
  onSelect: (uid: string) => void;
  onBack: () => void;
}

/** The demo's hiring steps. Fictional; a real position uses its own configured workflow. */
const STEPS = ['Sourced', 'Phone screen', 'Interview / Manager', 'Offer'];

function Value({ v }: { v: string | undefined }) {
  return v ? <>{v}</> : <span className="unknown">Not set</span>;
}

/**
 * Comeet's position workspace: the position's candidates on the left, the open profile on the right.
 * The assessment travels as configured custom candidate fields; no invented Comeet panel.
 */
export function ComeetRecord({ comeet, uid, onSelect, onBack }: Props) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), [uid]);

  const c = comeet.get(uid);

  return (
    <div className="host cm">
      <nav className="cm-nav" aria-label="Comeet (simulated)">
        <span className="cm-brand">Comeet</span>
        <span className="cm-search" aria-hidden="true">
          Search candidates
        </span>
        <span className="cm-company">WSC Sports (demo)</span>
      </nav>

      {!c ? (
        <main className="cm-empty">
          <p role="alert">This candidate is no longer in the simulated Comeet. Reset demo clears it.</p>
          <button type="button" className="cm-back" onClick={onBack}>
            ← Back to HubSpot
          </button>
        </main>
      ) : (
        <div className="cm-workspace">
          <CandidateList candidates={comeet.list(c.positionUid)} positionName={c.positionName} uid={uid} onSelect={onSelect} />

          <main className="cm-profile">
            <button type="button" className="cm-back" onClick={onBack}>
              ← Back to HubSpot
            </button>

            <section className="cm-card cm-header" aria-label="Candidate">
              <div className="cm-person">
                <span className="cm-avatar" aria-hidden="true">
                  {initials(`${c.firstName} ${c.lastName}`)}
                </span>
                <div>
                  <h1 ref={heading} tabIndex={-1}>
                    {c.firstName} {c.lastName}
                  </h1>
                  <p className="muted">
                    {c.email} · {c.uid}
                  </p>
                </div>
              </div>
              <div className="cm-position">
                <div>
                  <p className="cm-position-name">{c.positionName}</p>
                  <p className="muted">
                    Source: {c.source} · Owner: {c.owner}
                  </p>
                </div>
                <span className="cm-status" data-testid="cm-status">
                  {c.status === 'Sourced' ? 'Sourced' : `${c.status} · ${c.stage}`}
                </span>
              </div>
            </section>

            <div className="cm-columns">
              <section className="cm-card" aria-labelledby="cm-custom">
                <div className="cm-tabs" aria-hidden="true">
                  <span className="cm-tab is-active">Details</span>
                  <span className="cm-tab">Resume</span>
                  <span className="cm-tab">Evaluation</span>
                </div>
                <h2 id="cm-custom" className="cm-section-title">
                  Custom fields
                </h2>
                <dl className="cm-fields">
                  <dt>Role fit</dt>
                  <dd className="cm-fit">
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
                  <dt>LinkedIn</dt>
                  <dd className="hs-break">
                    <Value v={c.linkedinUrl} />
                  </dd>
                </dl>
                {c.note && (
                  <>
                    <h2 className="cm-section-title">Note</h2>
                    <p>{c.note}</p>
                  </>
                )}
              </section>

              <Workflow c={c} />
            </div>
          </main>
        </div>
      )}
    </div>
  );
}

function CandidateList({
  candidates,
  positionName,
  uid,
  onSelect,
}: {
  candidates: ComeetCandidate[];
  positionName: string;
  uid: string;
  onSelect: (uid: string) => void;
}) {
  const groups = STEPS.map((step) => ({ step, people: candidates.filter((c) => c.stage === step) })).filter(
    (g) => g.people.length > 0,
  );
  return (
    <aside className="cm-list" aria-label={`${positionName} candidates`}>
      <h2 className="cm-list-title">{positionName}</h2>
      {groups.map((g) => (
        <section key={g.step}>
          <h3 className="cm-group">
            {g.step} ({g.people.length})
          </h3>
          <ul>
            {g.people.map((p) => (
              <li key={p.uid}>
                <button
                  type="button"
                  className={`cm-row${p.uid === uid ? ' is-selected' : ''}`}
                  aria-current={p.uid === uid ? 'true' : undefined}
                  onClick={() => onSelect(p.uid)}
                >
                  <span className="cm-avatar cm-avatar-sm" aria-hidden="true">
                    {initials(`${p.firstName} ${p.lastName}`)}
                  </span>
                  <span>
                    <span className="cm-row-name">
                      {p.firstName} {p.lastName}
                    </span>
                    <span className="cm-row-step">{p.customFields?.roleFit ?? p.stage}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}

function Workflow({ c }: { c: ComeetCandidate }) {
  const current = Math.max(0, STEPS.indexOf(c.stage));
  return (
    <section className="cm-card" aria-labelledby="cm-workflow">
      <h2 id="cm-workflow" className="cm-section-title">
        Workflow
      </h2>
      <ol className="cm-steps">
        {STEPS.map((s, i) => (
          <li key={s} className={i < current ? 'is-done' : i === current ? 'is-current' : undefined}>
            {s}
          </li>
        ))}
      </ol>
      <p className="cm-next">
        <span className="label">Next step:</span> {c.nextStep}
      </p>
    </section>
  );
}

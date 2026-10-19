import { ArrowDown01Icon, MoreHorizontalIcon } from '@hugeicons/core-free-icons';
import { connectionNote, connectionPeople, matchLabel, OUTCOME_LABEL } from '../view/format';
import type { AssessmentStore, StoredAssessment } from './assessments';
import { useActivityState } from '../view/actionStore';
import { handoffCheck, type ComeetCandidate } from './comeet';
import { comeetStatusText } from './comeetStatus';
import { Icon } from './Icon';

interface Props {
  store: AssessmentStore;
  entry: StoredAssessment;
  jobId: string;
  /** The selected role's Comeet recruiter (not the HubSpot contact owner). */
  recruiter: string;
  onJobChange: (jobId: string) => void;
  /** This person's record in the selected role's Comeet position, kept in sync by Comeet's webhook. */
  comeetRecord: ComeetCandidate | null;
  onHandoff: () => void;
  onOpenComeet: (uid: string) => void;
}

const TAG: Record<string, string> = {
  shortlist: 'hs-tag-success',
  needs_review: 'hs-tag-warning',
  not_recommended_for_role: 'hs-tag-default',
};

function Block({ title, wide, children }: { title: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <section className={wide ? 'tm-block tm-block-wide' : 'tm-block'}>
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/**
 * The proposed HubSpot app card, drawn with HubSpot's card, statistic, tag and description-list
 * patterns. Every value comes from the assessment for the selected role; the selector reads another
 * stored assessment rather than recomputing or overwriting this one.
 */
export function TalentMatchCard({ store, entry, jobId, recruiter, onJobChange, comeetRecord, onHandoff, onOpenComeet }: Props) {
  const { a } = entry;
  const p = a.candidate.profile;
  // Must-haves the role does not also list as required (e.g. AWS for an SRE) are evidence too; never listed twice.
  const matched = [...a.mustHaveSkills, ...a.skills].filter((s) => s.match !== 'none');
  const conn = a.connections;
  const people = connectionPeople(a, store.dataset.employees);
  const outcome = OUTCOME_LABEL[a.recommendation];
  const activity = useActivityState();
  // The same rule the service enforces on confirm: identity and active process block; a decline is shown.
  const check = comeetRecord ? {} : handoffCheck(a.candidate, jobId, store.dataset.jobs, activity);

  return (
    <section className="hs-card tm" aria-labelledby="tm-title">
      <div className="hs-card-head">
        <h2 id="tm-title">
          <Icon icon={ArrowDown01Icon} size={16} /> Talent match
        </h2>
        <span className="tm-app" aria-hidden="true">
          WSC Talent Pool app <Icon icon={MoreHorizontalIcon} size={16} />
        </span>
      </div>

      <div className="tm-toolbar">
        <div className="tm-rolebox">
          <label className="tm-role">
            <span>Role</span>
            <select value={jobId} onChange={(e) => onJobChange(e.target.value)}>
              {store.dataset.jobs.map((j) => (
                <option key={j.jobId} value={j.jobId}>
                  {j.jobId} · {j.title}
                </option>
              ))}
            </select>
          </label>
          <p className="tm-recruiter" data-testid="tm-recruiter">
            Recruiter for this role: {recruiter}
          </p>
        </div>
        {comeetRecord ? (
          <div className="tm-incomeet">
            <span data-testid="tm-comeet">In Comeet: {comeetStatusText(comeetRecord)}</span>
            <button type="button" className="hs-btn hs-btn-outline" onClick={() => onOpenComeet(comeetRecord.uid)}>
              Open in Comeet
            </button>
          </div>
        ) : check.block ? (
          <p className="tm-incomeet" data-testid="tm-blocked">
            {check.block}
          </p>
        ) : (
          <div className="tm-handoff">
            {check.warn && (
              <p className="warn" data-testid="tm-warn">
                {check.warn}
              </p>
            )}
            <button type="button" className="hs-btn hs-btn-primary" onClick={onHandoff}>
              Add to Comeet
            </button>
          </div>
        )}
      </div>

      <div className="tm-stats">
        <div className="tm-stat">
          <span className="tm-stat-label">Recommendation</span>
          <span className={`hs-tag ${TAG[a.recommendation]}`} data-testid="tm-outcome">
            {a.shortlistRank !== null ? `${outcome} · #${a.shortlistRank}` : outcome}
          </span>
        </div>
        <div className="tm-stat">
          <span className="tm-stat-label">Required skills</span>
          <span className="tm-stat-value">{p ? `${a.tally.required} / ${a.tally.requiredTotal}` : '--'}</span>
        </div>
        <div className="tm-stat">
          <span className="tm-stat-label">Experience</span>
          <span className="tm-stat-value">{a.seniority.totalYears === null ? 'Unknown' : `${a.seniority.totalYears} yrs`}</span>
        </div>
        <div className="tm-stat">
          <span className="tm-stat-label">WSC connections</span>
          <span className="tm-stat-value">{conn.status === 'unknown' ? '--' : conn.resolved.length}</span>
        </div>
      </div>

      <div className="tm-why">
        <ul>
          {a.outcomeReasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
        <p>
          <span className="label">Next step:</span> {a.reviewNextStep}
        </p>
        {a.dataQualityFlags.length > 0 && (
          <ul className="tm-plain" data-testid="tm-flags">
            {a.dataQualityFlags.map((f) => (
              <li key={f} className="warn">
                {f}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="tm-grid">
        <Block title="Matched evidence">
          {!p ? (
            <p className="unknown">Unknown: no usable LinkedIn profile.</p>
          ) : matched.length === 0 ? (
            <p>None of the role's skills appear on the profile.</p>
          ) : (
            <dl className="tm-list">
              {matched.map((s) => (
                <div key={`${s.kind}:${s.skill}`}>
                  <dt>{s.skill}</dt>
                  <dd className={s.match === 'named' ? 'muted' : 'warn'}>{matchLabel(s.skill, s.match, s.evidence)}</dd>
                </div>
              ))}
            </dl>
          )}
        </Block>

        <Block title="Not confirmed">
          {!p ? (
            <p className="unknown">Unknown until a profile is found.</p>
          ) : a.skillGaps.length === 0 ? (
            <p>Nothing outstanding.</p>
          ) : (
            <ul className="tm-plain">
              {a.skillGaps.map((g) => (
                <li key={g} className="warn">
                  {g}
                </li>
              ))}
            </ul>
          )}
          {p && a.seniority.earlyCareerRoles.length > 0 && <p className="warn">Experience includes intern or junior roles</p>}
          {p && a.seniority.seniorTitleFlag && <p className="warn">{a.seniority.seniorTitleFlag}</p>}
        </Block>

        <Block title="WSC connections" wide>
          {people.length === 0 ? (
            conn.status === 'unknown' ? <p className="unknown">Unknown: no profile.</p> : <p>None listed.</p>
          ) : (
            <>
              <dl className="tm-list">
                {people.map((x) => (
                  <div key={x.employee.employeeId}>
                    <dt>{x.employee.fullName}</dt>
                    <dd className="muted">{connectionNote(x)}</dd>
                  </div>
                ))}
              </dl>
              <p className="muted tm-hint">Leads, not endorsements.</p>
            </>
          )}
        </Block>
      </div>

      <details className="tm-details">
        <summary>Details</summary>
        <p className="muted">
          {a.jobId} · {store.version}
        </p>
      </details>
    </section>
  );
}

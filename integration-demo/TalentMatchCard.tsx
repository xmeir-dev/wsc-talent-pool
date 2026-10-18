import { ArrowDown01Icon, MoreHorizontalIcon } from '@hugeicons/core-free-icons';
import { matchLabel, OUTCOME_LABEL, referenceLine } from '../view/format';
import type { AssessmentStore, StoredAssessment } from './assessments';
import type { ComeetCandidate } from './comeet';
import { comeetStatusText } from './comeetStatus';
import { Icon } from './Icon';

interface Props {
  store: AssessmentStore;
  entry: StoredAssessment;
  jobId: string;
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

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="tm-block">
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
export function TalentMatchCard({ store, entry, jobId, onJobChange, comeetRecord, onHandoff, onOpenComeet }: Props) {
  const { a } = entry;
  const p = a.candidate.profile;
  const matched = a.skills.filter((s) => s.match !== 'none');
  const conn = a.connections;
  const outcome = OUTCOME_LABEL[a.recommendation];

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
        {comeetRecord ? (
          <div className="tm-incomeet">
            <span data-testid="tm-comeet">
              In Comeet: {comeetStatusText(comeetRecord)} · Owner: {comeetRecord.owner}
            </span>
            <button type="button" className="hs-btn hs-btn-outline" onClick={() => onOpenComeet(comeetRecord.uid)}>
              Open in Comeet
            </button>
          </div>
        ) : (
          <button type="button" className="hs-btn hs-btn-primary" onClick={onHandoff}>
            Add to Comeet
          </button>
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
          <span className="tm-stat-label">Required-skill points</span>
          <span className="tm-stat-value">{p ? `${a.points.required} / ${a.points.requiredMax}` : '--'}</span>
        </div>
        <div className="tm-stat">
          <span className="tm-stat-label">Experience</span>
          <span className="tm-stat-value">{a.seniority.totalYears === null ? '--' : `${a.seniority.totalYears} yrs`}</span>
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
                <div key={s.skill}>
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

        <Block title="WSC connections">
          {conn.status === 'unknown' ? (
            <p className="unknown">Unknown: no profile.</p>
          ) : conn.resolved.length === 0 ? (
            <p>None listed.</p>
          ) : (
            <dl className="tm-list">
              {conn.resolved.map((e) => (
                <div key={e.employeeId}>
                  <dt>{e.fullName}</dt>
                  <dd className="muted">{e.title}</dd>
                </div>
              ))}
            </dl>
          )}
        </Block>

        <Block title="Possible references">
          {!p ? (
            <p className="unknown">Unknown: no work history.</p>
          ) : a.possibleReferences.length === 0 ? (
            <p>None found.</p>
          ) : (
            <dl className="tm-list">
              {a.possibleReferences.map((r) => (
                <div key={`${r.employeeId}-${r.company}-${r.overlapStart}`}>
                  <dt>{r.employeeName}</dt>
                  <dd className="muted">{referenceLine(r)}</dd>
                </div>
              ))}
            </dl>
          )}
          <p className="muted tm-hint">Overlapping work history. Leads, not endorsements.</p>
        </Block>
      </div>

      <p className="tm-version muted">
        {a.jobId} · {store.version}
      </p>
    </section>
  );
}

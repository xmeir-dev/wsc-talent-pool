import { matchLabel, OUTCOME_LABEL, referenceLine } from '../view/format';
import type { AssessmentStore, StoredAssessment } from './assessments';

interface Props {
  store: AssessmentStore;
  entry: StoredAssessment;
  jobId: string;
  onJobChange: (jobId: string) => void;
  onHandoff: () => void;
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="tm-block">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

/**
 * The proposed HubSpot app card. Every value comes from the assessment for the selected role;
 * the selector reads another stored assessment rather than recomputing or overwriting this one.
 */
export function TalentMatchCard({ store, entry, jobId, onJobChange, onHandoff }: Props) {
  const { a } = entry;
  const p = a.candidate.profile;
  const matched = a.skills.filter((s) => s.match !== 'none');
  const conn = a.connections;
  const outcome =
    a.shortlistRank !== null ? `${OUTCOME_LABEL[a.recommendation]} · #${a.shortlistRank}` : OUTCOME_LABEL[a.recommendation];

  return (
    <section className="tm" aria-labelledby="tm-title">
      <div className="tm-head">
        <h2 id="tm-title">Talent match</h2>
      </div>

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

      <p className={`tm-outcome outcome-${a.recommendation}`} data-testid="tm-outcome">
        {outcome}
      </p>
      <ul className="tm-list">
        {a.outcomeReasons.map((r) => (
          <li key={r}>{r}</li>
        ))}
      </ul>

      <Block title="Matched evidence">
        {!p ? (
          <p className="unknown">Unknown: no usable LinkedIn profile.</p>
        ) : matched.length === 0 ? (
          <p>None of the role's skills appear on the profile.</p>
        ) : (
          <ul className="tm-list">
            {matched.map((s) => (
              <li key={s.skill}>
                {s.skill}
                <span className={s.match === 'named' ? 'muted' : 'warn'}> · {matchLabel(s.skill, s.match, s.evidence)}</span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Not confirmed">
        {!p ? (
          <p className="unknown">Unknown until a profile is found.</p>
        ) : a.skillGaps.length === 0 ? (
          <p>Nothing outstanding.</p>
        ) : (
          <ul className="tm-list">
            {a.skillGaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Seniority">
        {!p ? (
          <p className="unknown">Unknown: no profile.</p>
        ) : (
          <>
            <p>
              {a.seniority.totalYears === null ? (
                <span className="unknown">Years not stated</span>
              ) : (
                `${a.seniority.totalYears} years total`
              )}
            </p>
            {a.seniority.earlyCareerRoles.length > 0 && <p className="warn">Includes intern or junior roles</p>}
            {a.seniority.seniorTitleFlag && <p className="warn">{a.seniority.seniorTitleFlag}</p>}
          </>
        )}
      </Block>

      <Block title="WSC connections">
        {conn.status === 'unknown' ? (
          <p className="unknown">Unknown: no profile.</p>
        ) : conn.resolved.length === 0 ? (
          <p>None listed.</p>
        ) : (
          <ul className="tm-list">
            {conn.resolved.map((e) => (
              <li key={e.employeeId}>
                {e.fullName} <span className="muted">· {e.title}</span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Possible references">
        <p className="muted">Overlapping work history. Leads, not endorsements.</p>
        {!p ? (
          <p className="unknown">Unknown: no work history.</p>
        ) : a.possibleReferences.length === 0 ? (
          <p>None found.</p>
        ) : (
          <ul className="tm-list">
            {a.possibleReferences.map((r) => (
              <li key={`${r.employeeId}-${r.company}-${r.overlapStart}`}>
                {r.employeeName} <span className="muted">· {referenceLine(r)}</span>
              </li>
            ))}
          </ul>
        )}
      </Block>

      <p className="tm-next">
        <span className="label">Next step:</span> {a.reviewNextStep}
      </p>

      <button type="button" className="hs-btn-primary" onClick={onHandoff}>
        Add to Comeet
      </button>
      <p className="tm-version muted">
        {a.jobId} · {store.version}
      </p>
    </section>
  );
}

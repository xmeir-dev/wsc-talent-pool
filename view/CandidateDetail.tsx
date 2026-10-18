import type { ReactNode } from 'react';
import { Section, StatusPill } from '@meir-labs/ui-kit';
import type { CandidateAssessment, OutputRow } from '../pipeline';
import { currentRole, matchLabel, OUTCOME_LABEL, OUTCOME_TONE, referenceLine, RELEVANCE_LABEL } from './format';

interface Props {
  a: CandidateAssessment;
  row: OutputRow;
}

function Unknown({ children }: { children: ReactNode }) {
  return <p className="unknown">{children}</p>;
}

/** The body of the detail drawer; the drawer itself (title, close, Escape, focus) is the kit's. */
export function CandidateDetail({ a, row }: Props) {
  const c = a.candidate;
  const profile = c.profile;
  const matched = a.skills.filter((s) => s.match !== 'none');
  const conn = a.connections;
  const outcome =
    a.shortlistRank !== null ? `${OUTCOME_LABEL[a.recommendation]} · #${a.shortlistRank}` : OUTCOME_LABEL[a.recommendation];

  return (
    <div className="detail">
      <p className="muted">{currentRole(row)}</p>

      <Section title="Outcome">
        <div className="stack">
          <StatusPill className="outcome-pill" tone={OUTCOME_TONE[a.recommendation]}>
            {outcome}
          </StatusPill>
          {a.tieNote && <p className="muted">{a.tieNote}</p>}
          <ul className="plain">
            {a.outcomeReasons.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p>
            <span className="label">Next step:</span> {a.reviewNextStep}
          </p>
        </div>
      </Section>

      <Section title="Matched requirements">
        {!profile ? (
          <Unknown>Unknown: no usable LinkedIn profile ({c.profileStatus.replace('_', ' ')}).</Unknown>
        ) : matched.length === 0 ? (
          <p>None of the role's skills appear on the profile.</p>
        ) : (
          <ul className="rows">
            {matched.map((s) => (
              <li key={s.skill}>
                <span>
                  {s.skill}
                  {s.kind === 'nice_to_have' && <span className="muted"> (nice to have)</span>}
                </span>
                <span className={s.match === 'named' ? 'muted' : 'warn'}>{matchLabel(s.skill, s.match, s.evidence)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Gaps">
        {!profile ? (
          <Unknown>Unknown until a profile is found. Missing information is not a negative finding.</Unknown>
        ) : a.skillGaps.length === 0 ? (
          <p>None identified.</p>
        ) : (
          <ul className="plain">
            {a.skillGaps.map((g) => (
              <li key={g}>{g}</li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Seniority">
        {!profile ? (
          <Unknown>Unknown: no profile.</Unknown>
        ) : (
          <div className="stack">
            <p>
              {a.seniority.totalYears === null ? (
                <span className="unknown">Years of experience not stated</span>
              ) : (
                `${a.seniority.totalYears} years total`
              )}
            </p>
            {a.seniority.earlyCareerRoles.length > 0 && (
              <p className="warn">Total includes intern or junior roles: confirm non-intern years</p>
            )}
            {a.seniority.seniorTitleFlag && <p className="warn">{a.seniority.seniorTitleFlag}</p>}
            {a.seniority.roles.length > 0 && (
              <ul className="plain">
                {a.seniority.roles.map((r) => (
                  <li key={r.raw}>
                    {r.raw}
                    {r.isEarlyCareer && <span className="muted"> (intern or junior role)</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </Section>

      <Section title="Conferences">
        <ul className="rows">
          {a.events.map((e) => (
            <li key={e.attendance.hubspotId} className="event">
              <span>
                {e.attendance.conferenceName}
                <span className="muted">
                  {' '}
                  · {e.attendance.conferenceDate} · {e.attendance.conferenceDomain}
                </span>
              </span>
              <span className={`relevance relevance-${e.relevance}`}>{RELEVANCE_LABEL[e.relevance]}</span>
              <span className="muted event-why">{e.explanation}</span>
              {e.attendance.notes && <span className="event-why">"{e.attendance.notes}"</span>}
            </li>
          ))}
        </ul>
      </Section>

      <Section title="WSC connections">
        {conn.status === 'unknown' ? (
          <Unknown>Unknown: no profile to read connections from.</Unknown>
        ) : conn.resolved.length === 0 && conn.unresolvedIds.length === 0 ? (
          <p>None listed on the profile.</p>
        ) : (
          <ul className="rows">
            {conn.resolved.map((e) => (
              <li key={e.employeeId}>
                <span>{e.fullName}</span>
                <span className="muted">{e.title}</span>
              </li>
            ))}
            {conn.unresolvedIds.map((id) => (
              <li key={id}>
                <span>{id}</span>
                <span className="unknown">Not in the employee roster</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Possible references">
        <div className="stack">
          <p className="muted">Leads from overlapping work history, not endorsements.</p>
          {!profile ? (
            <Unknown>Unknown: no work history to compare.</Unknown>
          ) : a.possibleReferences.length === 0 ? (
            <p>None found.</p>
          ) : (
            <ul className="rows">
              {a.possibleReferences.map((r) => (
                <li key={`${r.employeeId}-${r.company}-${r.overlapStart}`}>
                  <span>
                    {r.employeeName}
                    {r.alsoListedConnection && <span className="muted"> · also a listed connection</span>}
                  </span>
                  <span className="muted">{referenceLine(r)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      {a.dataQualityFlags.length > 0 && (
        <Section title="Data quality">
          <ul className="plain">
            {a.dataQualityFlags.map((f) => (
              <li key={f} className="warn">
                {f}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Contact">
        <div className="stack">
          <p>{c.email || <span className="unknown">No email</span>}</p>
          <p className="muted">{c.linkedinUrl || 'No LinkedIn URL'}</p>
        </div>
      </Section>
    </div>
  );
}

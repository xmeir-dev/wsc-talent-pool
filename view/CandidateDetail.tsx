import type { ReactNode } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  Briefcase01Icon,
  Calendar03Icon,
  CancelCircleIcon,
  CheckmarkBadge01Icon,
  CheckmarkCircle02Icon,
  DiamondPlusIcon,
  HelpCircleIcon,
  Mail01Icon,
  UserMultipleIcon,
} from '@hugeicons/core-free-icons';
import { Hint, StatusPill } from '@meir-labs/ui-kit';
import type { CandidateAssessment, EmploymentSpell, OutputRow, PossibleReference, SkillMatch } from '../pipeline';
import { currentRole, OUTCOME_LABEL, OUTCOME_TONE, years } from './format';

interface Props {
  a: CandidateAssessment;
  row: OutputRow;
}

type SkillState = 'has' | 'likely' | 'missing';

const STATE_ICON: Record<SkillState, IconSvgElement> = {
  has: CheckmarkCircle02Icon,
  likely: HelpCircleIcon,
  missing: CancelCircleIcon,
};

function skillState(s: SkillMatch): SkillState {
  if (s.match === 'named') return 'has';
  if (s.match === 'none') return 'missing';
  return 'likely';
}

/** Why an orange skill is orange: the profile skill it was read from. */
function likelyTip(s: SkillMatch): string {
  return s.match === 'inferred' ? `Likely: profile lists ${s.evidence}` : `Related skill on profile: ${s.evidence}`;
}

function Label({ icon, children, meta }: { icon: IconSvgElement; children: ReactNode; meta?: ReactNode }) {
  return (
    <div className="d-label">
      <span className="d-label-name">
        <HugeiconsIcon icon={icon} size={14} strokeWidth={1.75} aria-hidden="true" />
        {children}
      </span>
      {meta !== undefined && <span className="d-meta">{meta}</span>}
    </div>
  );
}

function SkillList({ skills }: { skills: SkillMatch[] }) {
  return (
    <ul className="d-skills">
      {skills.map((s) => {
        const state = skillState(s);
        const icon = (
          <HugeiconsIcon icon={STATE_ICON[state]} size={16} strokeWidth={1.75} aria-label={state} className={`s-${state}`} />
        );
        return (
          <li key={s.skill}>
            <span>{s.skill}</span>
            {state === 'likely' ? (
              <Hint tip={likelyTip(s)} className="d-hint">
                {icon}
              </Hint>
            ) : (
              icon
            )}
          </li>
        );
      })}
    </ul>
  );
}

function sameCompany(spell: EmploymentSpell, r: PossibleReference): boolean {
  const x = spell.company.toLowerCase();
  const y = r.company.toLowerCase();
  return x.includes(y) || y.includes(x);
}

function spellYears(spell: EmploymentSpell): string {
  return spell.periods.map((q) => years(q.start, q.end)).join(', ');
}

/** One candidate's profile page for the selected role. */
export function CandidateDetail({ a, row }: Props) {
  const c = a.candidate;
  const profile = c.profile;
  const required = a.skills.filter((s) => s.kind === 'required');
  const nice = a.skills.filter((s) => s.kind === 'nice_to_have');
  const has = (list: SkillMatch[]) => list.filter((s) => s.match === 'named').length;
  const conn = a.connections;

  return (
    <div className="detail">
      <header className="d-head">
        <h1>{c.fullName}</h1>
        <p className="muted">{currentRole(row)}</p>
      </header>

      <div className="d-score">
        <div className="d-score-num">
          <span className="d-big">{profile ? a.points.total : '–'}</span>
          <span className="muted">
            points
            {a.shortlistRank !== null && <> · #{a.shortlistRank}</>}
            {a.tieNote && (
              <>
                {', '}
                <Hint tip={a.tieNote}>
                  <span className="d-tied">tied</span>
                </Hint>
              </>
            )}
          </span>
        </div>
        <StatusPill tone={OUTCOME_TONE[a.recommendation]}>{OUTCOME_LABEL[a.recommendation]}</StatusPill>
      </div>

      {!profile ? (
        <section className="d-section">
          <Label icon={CheckmarkBadge01Icon}>Required skills</Label>
          <p className="unknown">Unknown: no usable LinkedIn profile. Missing information is not a negative finding.</p>
        </section>
      ) : (
        <>
          <section className="d-section">
            <Label icon={CheckmarkBadge01Icon} meta={`${has(required)}/${required.length}`}>
              Required skills
            </Label>
            <SkillList skills={required} />
          </section>

          {nice.length > 0 && (
            <section className="d-section">
              <Label icon={DiamondPlusIcon} meta={`${has(nice)}/${nice.length}`}>
                Nice to have
              </Label>
              <SkillList skills={nice} />
            </section>
          )}

          <section className="d-section">
            <Label
              icon={Briefcase01Icon}
              meta={a.seniority.totalYears === null ? 'Years not stated' : `${a.seniority.totalYears} years of experience`}
            >
              Career
            </Label>
            <ol className="d-timeline">
              <li className="now">
                <span>{profile.currentCompany}</span>
                <span className="muted">{profile.currentTitle} · now</span>
              </li>
              {a.seniority.roles.map((r) => {
                const worked = a.possibleReferences.filter((p) => sameCompany(r, p));
                return (
                  <li key={r.raw}>
                    <span>{r.company}</span>
                    <span className="muted">{[r.title, spellYears(r)].filter(Boolean).join(' · ')}</span>
                    {worked.length > 0 && (
                      <span className="d-with">Worked with {worked.map((p) => p.employeeName).join(', ')}</span>
                    )}
                    {r.isEarlyCareer && <span className="d-intern">Intern or junior role, counted in the total</span>}
                  </li>
                );
              })}
            </ol>
          </section>
        </>
      )}

      <section className="d-section">
        <Label icon={UserMultipleIcon}>WSC connections</Label>
        {conn.status === 'unknown' ? (
          <p className="unknown">Unknown: no profile to read connections from.</p>
        ) : conn.resolved.length === 0 && conn.unresolvedIds.length === 0 ? (
          <p className="muted">None listed</p>
        ) : (
          <ul className="d-rows">
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
      </section>

      <section className="d-section">
        <Label icon={Calendar03Icon}>Met at</Label>
        <ul className="d-rows">
          {a.events.map((e) => (
            <li key={e.attendance.hubspotId}>
              <span>{e.attendance.conferenceName}</span>
              <span className="muted">{e.attendance.conferenceDate}</span>
            </li>
          ))}
        </ul>
      </section>

      {a.dataQualityFlags.length > 0 && (
        <section className="d-section">
          <ul className="d-flags">
            {a.dataQualityFlags.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="d-section">
        <Label icon={Mail01Icon}>Contact</Label>
        <ul className="d-rows">
          <li>
            <span>{c.email || <span className="unknown">No email</span>}</span>
          </li>
          <li>
            <span className="muted">{c.linkedinUrl || 'No LinkedIn URL'}</span>
          </li>
        </ul>
      </section>
    </div>
  );
}

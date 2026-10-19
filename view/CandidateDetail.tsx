import type { ReactNode } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  AiFileIcon,
  ArrowLeft01Icon,
  Briefcase01Icon,
  Calendar03Icon,
  CancelCircleIcon,
  CheckListIcon,
  CheckmarkCircle02Icon,
  HelpCircleIcon,
  Linkedin01Icon,
  Mail01Icon,
  StarIcon,
  UserMultipleIcon,
} from '@hugeicons/core-free-icons';
import { Avatar, Button, Hint } from '@meir-labs/ui-kit';
import type { CandidateAssessment, EmploymentSpell, Job, OutputRow, PossibleReference, SkillMatch } from '../pipeline';
import { AskConnection, connectionPeople } from './AskConnection';
import { AVATAR, initials } from './avatars';
import { CHECK_ICON } from './CandidateTable';
import { CountryFlag } from './Location';
import { overviewFor } from './Overview';
import { currentRole, fitChecks, OUTCOME_LABEL, shortDate, years } from './format';

interface Props {
  a: CandidateAssessment;
  row: OutputRow;
  job: Job;
  /** The job picker: the profile is one job's assessment. */
  jobPicker?: ReactNode;
  onBack: () => void;
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
        <span>{children}</span>
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
          <li key={s.skill} className={state === 'missing' ? 'is-missing' : undefined}>
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

const linkedinHref = (url: string) => (/^https?:\/\//.test(url) ? url : `https://${url}`);
const upperFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The recruiter's note (or the AI line) as the page's lead, with who wrote it and where they met. */
function Lead({ a }: { a: CandidateAssessment }) {
  const o = overviewFor(a.candidate);
  if (!o) return null;
  const met = a.candidate.attendances.find((at) => at.notes.trim());
  return (
    <section className="d-lead">
      <p className="d-quote">{o.source === 'recruiter' ? `“${o.text}”` : o.text}</p>
      <div className="d-byline">
        {o.by ? (
          <>
            <Avatar size="xs" src={AVATAR[o.by.id]} fallback={initials(o.by.name)} aria-hidden="true" />
            {o.by.name} met them at {met?.conferenceName} · {shortDate(o.by.date)}
          </>
        ) : (
          <>
            <HugeiconsIcon icon={AiFileIcon} size={14} strokeWidth={1.75} aria-hidden="true" />
            {o.origin}
          </>
        )}
      </div>
    </section>
  );
}

/** One candidate's profile page for the selected role: who, the recruiter's note, the three shortlist checks, then the evidence. */
export function CandidateDetail({ a, row, job, jobPicker, onBack }: Props) {
  const c = a.candidate;
  const profile = c.profile;
  const required = a.skills.filter((s) => s.kind === 'required');
  const nice = a.skills.filter((s) => s.kind === 'nice_to_have');
  const has = (list: SkillMatch[]) => list.filter((s) => s.match === 'named').length;
  const conn = a.connections;
  const people = connectionPeople(a);
  const ctx = {
    candidate: c,
    job: a.recommendation === 'not_recommended_for_role' ? null : { job, outcome: a.recommendation },
  };
  const connectionCount = people.length + conn.unresolvedIds.length;

  const careerCard = profile && (
    <section className="d-card">
      <Label icon={Briefcase01Icon} meta={a.seniority.totalYears === null ? 'Years not stated' : `${a.seniority.totalYears} years`}>
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
  );
  const metCard = (
    <section className="d-card">
      <Label icon={Calendar03Icon}>Met at</Label>
      <ul className="d-rows">
        {a.events.map((e) => (
          <li key={e.attendance.hubspotId}>
            <span>{e.attendance.conferenceName}</span>
            <span className="muted">{shortDate(e.attendance.conferenceDate)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
  const connCard = (
    <section className="d-card">
      <Label icon={UserMultipleIcon}>{connectionCount === 1 ? 'WSC connection' : 'WSC connections'}</Label>
      {conn.status === 'unknown' && people.length === 0 ? (
        <p className="unknown">Unknown: no profile to read connections from.</p>
      ) : connectionCount === 0 ? (
        <p className="muted">No one at WSC is connected to them</p>
      ) : (
        <ul className="d-people">
          {people.map(({ employee, refs }) => {
            const ref = refs[0];
            return (
              <li key={employee.employeeId}>
                <Avatar size="md" src={AVATAR[employee.employeeId]} fallback={initials(employee.fullName)} aria-hidden="true" />
                <span className="d-person">
                  <span>{employee.fullName}</span>
                  <span className="muted">{ref ? `${employee.title} · both at ${ref.company}` : employee.title}</span>
                </span>
                <AskConnection employee={employee} refs={refs} ctx={ctx} asButton />
              </li>
            );
          })}
          {conn.unresolvedIds.map((id) => (
            <li key={id}>
              <span className="d-person">
                <span>{id}</span>
                <span className="unknown">Not in the employee roster</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="detail">
      <header className="page-head d-head">
        <button type="button" className="d-back" onClick={onBack} aria-label="Back">
          <HugeiconsIcon icon={ArrowLeft01Icon} size={24} strokeWidth={1.75} aria-hidden="true" />
        </button>
        <div className="page-title">
          <div className="d-name">
            <h1>{c.fullName}</h1>
            <CountryFlag c={c} />
          </div>
          <p className="muted">{currentRole(row)}</p>
        </div>
        {(c.email || c.linkedinUrl) && (
          <div className="d-reach">
            {c.email && (
              <Button href={`mailto:${c.email}`} leftIcon={<HugeiconsIcon icon={Mail01Icon} size={16} strokeWidth={1.75} />}>
                Email
              </Button>
            )}
            {c.linkedinUrl && (
              // The kit Button has no target prop; same classes, so it matches the Email button.
              <a className="ml-btn ml-btn-secondary ml-btn-size-md" href={linkedinHref(c.linkedinUrl)} target="_blank" rel="noreferrer">
                <span className="ml-btn-icon-slot" aria-hidden="true">
                  <HugeiconsIcon icon={Linkedin01Icon} size={16} strokeWidth={1.75} />
                </span>
                <span className="ml-btn-label">LinkedIn</span>
              </a>
            )}
          </div>
        )}
      </header>

      <Lead a={a} />

      <div className="d-grid">
        {profile ? careerCard : metCard}
        <div className="d-col">
          {profile && metCard}
          {connCard}
        </div>
      </div>

      <section className="d-fit">
        <div className="d-fit-head">
          {jobPicker}
          <span className="muted">
            {a.shortlistRank !== null ? `#${a.shortlistRank} on the shortlist` : OUTCOME_LABEL[a.recommendation]}
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
        <ul className="d-checks">
          {fitChecks(a, job).map((k) => (
            <li key={k.key} className={k.ok ? 'is-ok' : undefined}>
              <span className={`fit-check d-check${k.ok ? ' is-ok' : ''}`} role="img" aria-label={k.ok ? 'Passed' : 'Not passed'}>
                <HugeiconsIcon icon={CHECK_ICON[k.key]} size={16} strokeWidth={1.75} aria-hidden="true" />
              </span>
              <span className="d-label-name">{k.name}</span>
              <span className="d-check-detail">{upperFirst(k.detail)}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="d-grid">
        {!profile ? (
          <section className="d-card">
            <Label icon={CheckListIcon}>Required skills</Label>
            <p className="unknown">Unknown: no usable LinkedIn profile. Missing information is not a negative finding.</p>
          </section>
        ) : (
          <>
            <section className="d-card">
              <Label icon={CheckListIcon} meta={`${has(required)} of ${required.length}`}>
                Required skills
              </Label>
              <SkillList skills={required} />
            </section>
            {nice.length > 0 && (
              <section className="d-card">
                <Label icon={StarIcon} meta={`${has(nice)} of ${nice.length}`}>
                  Nice to have
                </Label>
                <SkillList skills={nice} />
              </section>
            )}
          </>
        )}
      </div>

      {a.dataQualityFlags.length > 0 && (
        <ul className="d-flags">
          {a.dataQualityFlags.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

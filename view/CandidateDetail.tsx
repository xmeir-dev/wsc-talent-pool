import type { ReactNode } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  AiFileIcon,
  ArrowLeft01Icon,
  Briefcase01Icon,
  Calendar03Icon,
  Cancel01Icon,
  HelpCircleIcon,
  Linkedin01Icon,
  Mail01Icon,
  StarIcon,
  Tick02Icon,
  UserMultipleIcon,
} from '@hugeicons/core-free-icons';
import { Avatar, Button, Hint } from '@meir-labs/ui-kit';
import { policyFor, type CandidateAssessment, type EmploymentSpell, type Job, type OutputRow, type PossibleReference, type SkillMatch } from '../pipeline';
import type { Attendee } from './attendees';
import { AskConnection, connectionPeople } from './AskConnection';
import { AVATAR, initials } from './avatars';
import { CHECK_ICON } from './CandidateTable';
import { CountryFlag } from './Location';
import { overviewFor } from './Overview';
import { currentRole, fitChecks, shortDate, years } from './format';

interface Props {
  /** One job's assessment, for the person-level facts (career, connections, events), which every job shares. */
  a: CandidateAssessment;
  row: OutputRow;
  /** The jobs they may fit (shortlist or needs review), each with its own assessment. */
  fits: Attendee['relevantFor'];
  onBack: () => void;
}

type SkillState = 'has' | 'likely' | 'missing';

const STATE_ICON: Record<SkillState, IconSvgElement> = {
  has: Tick02Icon,
  likely: HelpCircleIcon,
  missing: Cancel01Icon,
};

function skillState(s: SkillMatch): SkillState {
  if (s.match === 'named') return 'has';
  if (s.match === 'none') return 'missing';
  return 'likely';
}

const STATE_WORDS: Record<SkillState, string> = { has: 'has it', likely: 'likely', missing: 'missing' };

/** What the hover says: the kind of skill, then whether they have it (and, for a likely match, why). */
function skillTip(s: SkillMatch, must: boolean): string {
  const kind = must ? 'Must-have' : s.kind === 'required' ? 'Required' : 'Nice to have';
  const state = skillState(s);
  if (state !== 'likely') return `${kind}, ${STATE_WORDS[state]}`;
  return `${kind}, likely: ${s.match === 'inferred' ? 'profile lists' : 'related skill on profile:'} ${s.evidence}`;
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

/**
 * The job's skills as one row of chips, required first. Four looks: required and has it (green), nice to have and
 * has it (green outline), required and missing (red), nice to have and missing (grey dashed). Must-haves carry a star.
 */
function SkillChips({ a, job }: { a: CandidateAssessment; job: Job }) {
  // A must-have with alternatives ("Python or Go") is met by any one; the others are then ordinary required skills.
  const unmet = new Set(a.missingEssentials);
  const musts = new Set(
    policyFor(job).policy.essentials.flatMap((e) =>
      e.anyOf.filter((skill) => unmet.has(e.label) || a.skills.some((s) => s.skill === skill && s.match !== 'none')),
    ),
  );
  const ordered = [...a.skills.filter((s) => s.kind === 'required'), ...a.skills.filter((s) => s.kind === 'nice_to_have')];
  return (
    <ul className="d-chips">
      {ordered.map((s) => {
        const state = skillState(s);
        const must = musts.has(s.skill);
        const tip = skillTip(s, must);
        return (
          <li key={s.skill}>
            <Hint tip={tip} focusable={false}>
              <span className={`d-chip is-${state} is-${s.kind === 'required' ? 'required' : 'nice'}`} aria-label={`${s.skill}: ${tip}`}>
                <HugeiconsIcon icon={must ? StarIcon : STATE_ICON[state]} size={14} strokeWidth={1.75} aria-hidden="true" />
                {s.skill}
              </span>
            </Hint>
          </li>
        );
      })}
    </ul>
  );
}

/** One job they may fit: the three shortlist checks, then the job's skills against theirs. */
function JobFit({ a, job }: { a: CandidateAssessment; job: Job }) {
  const profile = a.candidate.profile;
  return (
    <section className="d-card">
      <div className="d-label">
        <span className="d-job">{job.title}</span>
      </div>
      <ul className="d-fit-checks">
        {fitChecks(a, job).map((k) => (
          <li key={k.key}>
            <Hint tip={k.name} focusable={false}>
              <span className={`fit-check${k.ok ? ' is-ok' : ''}`} role="img" aria-label={`${k.name}: ${k.ok ? 'passed' : 'not passed'}`}>
                <HugeiconsIcon icon={CHECK_ICON[k.key]} size={14} strokeWidth={1.75} aria-hidden="true" />
              </span>
            </Hint>
            <span>{upperFirst(k.detail)}</span>
          </li>
        ))}
      </ul>
      {profile && profile.skills.length > 0 ? (
        <SkillChips a={a} job={job} />
      ) : (
        <p className="unknown">Unknown: no usable LinkedIn profile. Missing information is not a negative finding.</p>
      )}
    </section>
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

/** A section heading with a hairline running to the right edge. */
function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="d-section-title">
      <span>{children}</span>
    </h2>
  );
}

/** The recruiter's note (or the AI line) as the page's lead, with who wrote it and where they met. */
function Lead({ a }: { a: CandidateAssessment }) {
  const o = overviewFor(a.candidate);
  if (!o) return null;
  const met = a.candidate.attendances.find((at) => at.notes.trim());
  // A message from whoever wrote it: their avatar beside a speech bubble, who and where underneath.
  return (
    <section>
      <SectionTitle>{o.source === 'recruiter' ? 'Recruiter note' : 'AI summary'}</SectionTitle>
      <div className="d-lead">
        {o.by ? (
          <Avatar size="md" src={AVATAR[o.by.id]} fallback={initials(o.by.name)} aria-hidden="true" />
        ) : (
          <span className="d-lead-ai" aria-hidden="true">
            <HugeiconsIcon icon={AiFileIcon} size={16} strokeWidth={1.75} />
          </span>
        )}
        <div className="d-lead-body">
          <p className="d-bubble">{o.text}</p>
          <p className="d-byline">
            {o.by ? (
              <>
                {o.by.name} at{' '}
                <Hint tip={shortDate(o.by.date)} focusable={false}>
                  <span className="d-conf">{met?.conferenceName}</span>
                </Hint>
              </>
            ) : (
              o.origin
            )}
          </p>
        </div>
      </div>
    </section>
  );
}

/** One candidate's profile page: who, the recruiter's note, career and contacts, then every job they may fit. */
export function CandidateDetail({ a, row, fits, onBack }: Props) {
  const c = a.candidate;
  const profile = c.profile;
  const conn = a.connections;
  const people = connectionPeople(a);
  // Shortlisted jobs first; the best one is what a connection gets asked about.
  const ordered = [...fits].sort((x, y) => (x.outcome === 'shortlist' ? 0 : 1) - (y.outcome === 'shortlist' ? 0 : 1));
  const best = ordered[0];
  const ctx = { candidate: c, job: best ? { job: best.job, outcome: best.outcome } : null };
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
      <Label icon={Calendar03Icon}>Attended</Label>
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

      <section>
        <SectionTitle>Overview</SectionTitle>
        <div className="d-grid">
          {profile ? careerCard : metCard}
          <div className="d-col">
            {profile && metCard}
            {connCard}
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>Fit to WSC roles</SectionTitle>
        {ordered.length > 0 ? (
          <div className="d-grid">
            {ordered.map(({ job, a: fit }) => (
              <JobFit key={job.jobId} a={fit} job={job} />
            ))}
          </div>
        ) : (
          <p className="muted">Not a fit for any open job</p>
        )}
      </section>

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

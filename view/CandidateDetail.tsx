import type { ReactNode } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import {
  AiFileIcon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  Briefcase01Icon,
  Calendar03Icon,
  Cancel01Icon,
  CheckmarkBadge01Icon,
  HelpCircleIcon,
  Linkedin01Icon,
  Mail01Icon,
  StarIcon,
  Tick02Icon,
  UserMultipleIcon,
} from '@hugeicons/core-free-icons';
import { Avatar, Button, Hint } from '@meir-labs/ui-kit';
import { policyFor, type CandidateAssessment, type EmploymentSpell, type Job, type OutputRow, type PossibleReference, type SkillMatch } from '../pipeline';
import type { Attendee, Relevant } from './attendees';
import { AskConnection, connectionPeople } from './AskConnection';
import { AVATAR, initials } from './avatars';
import { CHECK_ICON } from './CandidateTable';
import comeetIcon from './assets/comeet.png';
import hubspotIcon from './assets/hubspot.png';
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
  /** Open the list filtered to this job. */
  onJob: (jobId: string) => void;
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

const KIND_WORDS = { must: 'Must-have', required: 'Required', nice_to_have: 'Nice to have' } as const;

/** One line for screen readers: the kind of skill, then whether they have it. */
function skillLabel(s: SkillMatch, must: boolean): string {
  const state = skillState(s);
  return `${KIND_WORDS[must ? 'must' : s.kind]}, ${state === 'has' ? 'has it' : state === 'missing' ? 'missing' : 'likely'}`;
}

/** The hover card for a skill chip: the skill, what kind it is, and what the profile shows. */
function SkillTip({ s, must }: { s: SkillMatch; must: boolean }) {
  const state = skillState(s);
  const found =
    state === 'has'
      ? 'On their profile'
      : state === 'missing'
        ? 'Not on their profile'
        : s.match === 'inferred'
          ? `Likely: profile lists ${s.evidence}`
          : `Related skill on profile: ${s.evidence}`;
  return (
    <span className="skill-tip">
      <span className="skill-tip-name">{s.skill}</span>
      <span className="skill-tip-rows">
        <span>Type</span>
        <span>{KIND_WORDS[must ? 'must' : s.kind]}</span>
        <span>Profile</span>
        <span>{found}</span>
      </span>
    </span>
  );
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
 * The job's skills as chips, required then nice to have. Four looks: required and has it (green), nice to have and
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
  const chip = (s: SkillMatch) => {
    const state = skillState(s);
    const must = musts.has(s.skill);
    return (
      <li key={s.skill}>
        <Hint tip={<SkillTip s={s} must={must} />} focusable={false}>
          <span
            className={`d-chip is-${state} is-${s.kind === 'required' ? 'required' : 'nice'}`}
            aria-label={`${s.skill}: ${skillLabel(s, must)}`}
          >
            <HugeiconsIcon icon={must ? StarIcon : STATE_ICON[state]} size={14} strokeWidth={1.75} aria-hidden="true" />
            {s.skill}
          </span>
        </Hint>
      </li>
    );
  };
  const groups = [
    { label: 'Required skills', skills: a.skills.filter((s) => s.kind === 'required') },
    { label: 'Nice to have', skills: a.skills.filter((s) => s.kind === 'nice_to_have') },
  ].filter((g) => g.skills.length > 0);
  return (
    <div className="d-skill-groups">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="d-label-name">{g.label}</p>
          <ul className="d-chips">{g.skills.map(chip)}</ul>
        </div>
      ))}
    </div>
  );
}

/** One job they may fit: a TL;DR (shortlisted, or maybe relevant and why), required skills and years, then the job's skills. */
function JobFit({ a, job, outcome, onJob }: { a: CandidateAssessment; job: Job; outcome: Relevant; onJob: (jobId: string) => void }) {
  const profile = a.candidate.profile;
  const checks = fitChecks(a, job);
  const shortlisted = outcome === 'shortlist';
  const verdictTip = shortlisted ? a.tieNote && upperFirst(a.tieNote) : checks.filter((k) => !k.ok).map((k) => k.tip).join('. ');
  const verdict = (
    <span className="d-verdict">
      <span className={`fit-check${shortlisted ? ' is-ok' : ''}`} aria-hidden="true">
        <HugeiconsIcon icon={shortlisted ? CheckmarkBadge01Icon : HelpCircleIcon} size={14} strokeWidth={1.75} />
      </span>
      <span>{shortlisted ? `Shortlisted${a.shortlistRank !== null ? `, #${a.shortlistRank}` : ''}` : 'Maybe relevant'}</span>
    </span>
  );
  return (
    <section className="d-card">
      <div className="d-label">
        <button type="button" className="d-job" onClick={() => onJob(job.jobId)} aria-label={`${job.title}: see all candidates`}>
          {job.title}
          <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
      </div>
      <ul className="d-fit-strip">
        <li>{verdictTip ? <Hint tip={verdictTip}>{verdict}</Hint> : verdict}</li>
        {checks
          .filter((k) => k.key !== 'must')
          .map((k) => (
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
/** Assumed record links: the snapshot's HS… IDs are source IDs, not HubSpot record IDs, and Comeet is searched by email. */
const hubspotRecord = (id: string) => `https://app.hubspot.com/contacts/record/0-1/${id}`;
const comeetSearch = (q: string) => `https://app.comeet.co/app/candidates?search=${encodeURIComponent(q)}`;
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
export function CandidateDetail({ a, row, fits, onBack, onJob }: Props) {
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
  const hubspotId = c.attendances.map((at) => at.hubspotId).find(Boolean);
  const contacts = [
    c.email && { key: 'email', icon: <HugeiconsIcon icon={Mail01Icon} size={16} strokeWidth={1.75} />, name: 'Email', value: c.email, href: `mailto:${c.email}` },
    c.linkedinUrl && {
      key: 'linkedin',
      icon: <HugeiconsIcon icon={Linkedin01Icon} size={16} strokeWidth={1.75} />,
      name: 'LinkedIn',
      value: c.linkedinUrl.replace(/^https?:\/\/(www\.)?/, ''),
      href: linkedinHref(c.linkedinUrl),
    },
    hubspotId && { key: 'hubspot', icon: <img src={hubspotIcon} alt="" width={16} height={16} />, name: 'HubSpot', value: hubspotId, href: hubspotRecord(hubspotId) },
    { key: 'comeet', icon: <img src={comeetIcon} alt="" width={16} height={16} />, name: 'Comeet', value: 'Look up', href: comeetSearch(c.email || c.fullName) },
  ].filter((x) => !!x);
  const contactCard = (
    <section className="d-card">
      <Label icon={Mail01Icon}>Contact</Label>
      <ul className="d-rows d-contact">
        {contacts.map((x) => (
          <li key={x.key}>
            <span className="d-contact-name">
              <span className="d-contact-icon" aria-hidden="true">{x.icon}</span>
              {x.name}
            </span>
            <a href={x.href} target={x.key === 'email' ? undefined : '_blank'} rel="noreferrer">
              <span>{x.value}</span>
              <HugeiconsIcon icon={ArrowUpRight01Icon} size={14} strokeWidth={1.75} aria-hidden="true" />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
  const metCard = (
    <section className="d-card">
      <Label icon={Calendar03Icon}>{a.events.length === 1 ? 'Conference attended' : 'Conferences attended'}</Label>
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
          <div className="d-col">
            {contactCard}
            {metCard}
          </div>
          <div className="d-col">
            {careerCard}
            {connCard}
          </div>
        </div>
      </section>

      <section>
        <SectionTitle>Fit to WSC roles</SectionTitle>
        {ordered.length > 0 ? (
          <div className="d-grid">
            {ordered.map(({ job, outcome, a: fit }) => (
              <JobFit key={job.jobId} a={fit} job={job} outcome={outcome} onJob={onJob} />
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

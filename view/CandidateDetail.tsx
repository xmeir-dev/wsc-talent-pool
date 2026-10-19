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
  CheckmarkCircle02Icon,
  Clock01Icon,
  HelpCircleIcon,
  InformationCircleIcon,
  Linkedin01Icon,
  Mail01Icon,
  MailSend01Icon,
  Message01Icon,
  StarIcon,
  Tick02Icon,
  UnavailableIcon,
  UserIcon,
  UserMultipleIcon,
} from '@hugeicons/core-free-icons';
import { Avatar, Hint, Tag } from '@meir-labs/ui-kit';
import { minYearsFor, policyFor, type CandidateAssessment, type EmploymentSpell, type Job, type OutputRow, type PossibleReference, type SkillMatch } from '../pipeline';
import type { Attendee, Relevant } from './attendees';
import { AskConnection, connectionPeople } from './AskConnection';
import { AVATAR, initials } from './avatars';
import comeetHistory from '../data/demo_comeet.json';
import comeetIcon from './assets/comeet.png';
import hubspotIcon from './assets/hubspot.png';
import { current, comeetFor, describe, personFlags, record, roleStatus, shortDay, STATE_LABEL, STATUS_LABEL, useActivity, type Entry } from './activity';
import { InviteToJob } from './InviteToJob';
import { CountryFlag } from './Location';
import { overviewFor } from './Overview';
import { currentRole, fitChecks, shortDate, years } from './format';

/** The Activity row's icon: what kind of step it was, tinted red for a decline and green for interest. */
const activityMark = (e: Entry): { icon: IconSvgElement; tone?: 'bad' | 'good' } => {
  if (e.kind === 'invite') return { icon: MailSend01Icon };
  if (e.kind === 'reference') return { icon: UserMultipleIcon };
  if (e.kind === 'do_not_contact') return { icon: UnavailableIcon, tone: 'bad' };
  if (e.outcome === 'declined') return { icon: Cancel01Icon, tone: 'bad' };
  if (e.outcome === 'interested') return { icon: CheckmarkCircle02Icon, tone: 'good' };
  return { icon: Message01Icon };
};

/** How long they overlapped, from year-only dates: 2019–2021 is 2y, a single shared year is under one. */
const yearsTogether = (start: number, end: number) => {
  const n = (end === Infinity ? new Date().getFullYear() : end) - start;
  return n < 1 ? '<1y' : `${n}y`;
};

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
function SkillRows({ a, job }: { a: CandidateAssessment; job: Job }) {
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
  const required = a.skills.filter((s) => s.kind === 'required');
  const nice = a.skills.filter((s) => s.kind === 'nice_to_have');
  const has = (list: SkillMatch[]) => list.filter((s) => s.match === 'named').length;
  const years = a.candidate.profile?.yearsExperience ?? null;
  const minYears = minYearsFor(job);
  return (
    <>
      <FitRow
        label="Required skills"
        count={`${has(required)}/${required.length}`}
        tip={`Needs ${a.tally.requiredNeeded} on the profile`}
        info={
          <RuleTip
            lines={[
              `The ${required.length} skills this job lists as required. Each is matched against the skills on their LinkedIn profile.`,
              `The shortlist needs ${a.tally.requiredNeeded} of ${required.length} on the profile by name (60%, rounded up; one rule for every job), plus every must-have (star).`,
              'Green: on the profile. Amber: only a related skill, to confirm; it never counts toward the shortlist. Red: not on the profile.',
            ]}
          />
        }
      >
        <ul className="d-chips">{required.map(chip)}</ul>
      </FitRow>
      {nice.length > 0 && (
        <FitRow
          label="Nice to have"
          count={`${nice.filter((s) => s.match !== 'none').length}/${nice.length}`}
          info={
            <RuleTip
              lines={[
                'The skills this job lists as nice to have, on the profile by name or a related skill.',
                'They never decide the shortlist. They only order people who have the same required skills.',
              ]}
            />
          }
        >
          <ul className="d-chips">{nice.map(chip)}</ul>
        </FitRow>
      )}
      <FitRow
        label="Experience"
        count={
          minYears === null ? (
            'No minimum'
          ) : a.seniority.earlyCareerRoles.length > 0 ? (
            <span className="d-years-note">Includes intern or junior roles</span>
          ) : undefined
        }
        info={
          <RuleTip
            lines={[
              'Total years on their LinkedIn profile, internships and junior roles included.',
              minYears === null
                ? `No minimum: the job's seniority, "${job.seniority}", has no years rule.`
                : `The minimum, ${minYears} years, comes from the job's seniority, "${job.seniority}": Senior 5, Mid-Senior 4, Mid 3. WSC did not set years; this is our assumption.`,
            ]}
          />
        }
      >
        <YearsBar years={years} minYears={minYears} />
      </FitRow>
    </>
  );
}

/**
 * Years they have against the years the job needs, on one bar: the fill is their years (green when enough, red when
 * short), the tick is the minimum. The scale runs to at least 10 years, so bars line up across cards.
 */
function YearsBar({ years, minYears }: { years: number | null; minYears: number | null }) {
  if (years === null) return <p className="unknown">Years not stated on the profile</p>;
  const scale = Math.max(10, years + 1, (minYears ?? 0) + 2);
  const at = (n: number) => `${(n / scale) * 100}%`;
  const state = minYears === null ? 'neutral' : years >= minYears ? 'ok' : 'short';
  const label = `${years} years${minYears === null ? '' : `, needs ${minYears}`}`;
  return (
    <div className="d-years" role="img" aria-label={label}>
      <div className="d-years-track">
        <span className={`d-years-fill is-${state}`} style={{ width: at(years) }} />
        {minYears !== null && <span className="d-years-tick" style={{ left: at(minYears) }} />}
        {minYears !== null && (
          <span className="d-years-need" style={{ left: at(minYears) }}>
            needs {minYears}
          </span>
        )}
      </div>
      <span className={`d-years-value is-${state}`}>{years} yrs</span>
    </div>
  );
}

/** How a row's result was worked out, one short paragraph per point. */
function RuleTip({ lines }: { lines: string[] }) {
  return (
    <span className="rule-tip">
      {lines.map((l) => (
        <span key={l}>{l}</span>
      ))}
    </span>
  );
}

/** One row of a job card: a caps label (with an info icon on hover that explains the rule) and a count on the right, then its content. */
function FitRow({
  label,
  count,
  tip,
  info,
  children,
}: {
  label: string;
  count?: ReactNode;
  tip?: string;
  info?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="d-fit-row">
      <p className="d-fit-row-head">
        <span className="d-label-name">
          {label}
          {info && (
            <Hint tip={info} className="d-info">
              <HugeiconsIcon icon={InformationCircleIcon} size={14} strokeWidth={1.75} aria-label={`How ${label.toLowerCase()} is worked out`} />
            </Hint>
          )}
        </span>
        {count !== undefined &&
          (tip ? (
            <Hint tip={tip} focusable={false}>
              <span className="d-meta">{count}</span>
            </Hint>
          ) : (
            <span className="d-meta">{count}</span>
          ))}
      </p>
      {children}
    </div>
  );
}

/** One job they may fit: a TL;DR (shortlisted, or maybe relevant and why), then rows for required skills, nice to have and experience. */
function JobFit({
  a,
  job,
  outcome,
  onJob,
  role,
}: {
  a: CandidateAssessment;
  job: Job;
  outcome: Relevant;
  onJob: (jobId: string) => void;
  /** Where they stand for this role: from Comeet, or from our own outreach. */
  role: { text: string; fromComeet: boolean };
}) {
  const profile = a.candidate.profile;
  const checks = fitChecks(a, job);
  const shortlisted = outcome === 'shortlist';
  // Maybe relevant says why on hover; the rank stays on the list page.
  const verdictTip = shortlisted ? '' : checks.filter((k) => !k.ok).map((k) => k.tip).join('. ');
  const verdict = (
    <span className="d-verdict">
      <HugeiconsIcon icon={shortlisted ? CheckmarkBadge01Icon : HelpCircleIcon} size={16} strokeWidth={1.75} aria-hidden="true" />
      {shortlisted ? 'Shortlisted' : 'Maybe relevant'}
    </span>
  );
  // The verdict sits in the card's header, which is tinted green (shortlisted) or amber (maybe relevant).
  return (
    <section className={`d-card d-fit ${shortlisted ? 'is-shortlist' : 'is-review'}`}>
      <div className="d-label">
        <button type="button" className="d-job" onClick={() => onJob(job.jobId)} aria-label={`${job.title}: see all candidates`}>
          {job.title}
          <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.75} aria-hidden="true" />
        </button>
        {verdictTip ? <Hint tip={verdictTip}>{verdict}</Hint> : verdict}
      </div>
      {profile && profile.skills.length > 0 ? (
        <SkillRows a={a} job={job} />
      ) : (
        <p className="unknown">Unknown: no usable LinkedIn profile. Missing information is not a negative finding.</p>
      )}
      {/* Where they stand for this role: Comeet's status once handed off, otherwise our own outreach (simulated). */}
      <p className="d-fit-comeet">
        {role.fromComeet ? (
          <img src={comeetIcon} alt="" width={16} height={16} />
        ) : (
          <HugeiconsIcon icon={MailSend01Icon} size={16} strokeWidth={1.75} aria-hidden="true" />
        )}
        {role.text}
      </p>
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
/** Past Comeet applications (made up, see data/demo_comeet.json); newest first. */
const COMEET: Record<string, { job: string; outcome: string; date: string }[]> = comeetHistory.byCandidate;
const monthYear = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });

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
  const applications = COMEET[c.candidateKey] ?? [];
  const entries = useActivity();
  const comeet = comeetFor(c.candidateKey);
  const history = current(entries)
    .filter((e) => e.candidateKey === c.candidateKey)
    .reverse();
  const flags = personFlags(entries, comeet, c.candidateKey);
  const roleLine = (job: Job) => {
    const s = roleStatus(entries, comeet, c.candidateKey, { jobId: job.jobId, title: job.title });
    const rec = comeet.find((r) => r.job === job.title);
    if (rec && (s.status === 'in_process' || s.status === 'comeet_lead' || s.status === 'comeet_closed'))
      return { fromComeet: true, text: `${rec.outcome} · ${monthYear(rec.date)}` };
    if (s.status === 'not_contacted') return { fromComeet: false, text: 'Not contacted for this role' };
    return { fromComeet: false, text: [STATUS_LABEL[s.status], s.at && shortDay(s.at), s.simulated && 'Simulated'].filter(Boolean).join(' · ') };
  };
  // The latest request to each colleague about this person, if any.
  const askedBy = (employeeId: string) =>
    history.find((e): e is Extract<typeof e, { kind: 'reference' }> => e.kind === 'reference' && e.employeeId === employeeId);
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
    {
      key: 'comeet',
      icon: <img src={comeetIcon} alt="" width={16} height={16} />,
      name: 'Comeet',
      value: applications.length ? 'Open profile' : 'Look up',
      href: comeetSearch(c.email || c.fullName),
    },
  ].filter((x) => !!x);
  const contactCard = (
    <section className="d-card">
      <Label icon={UserIcon}>Contact</Label>
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
            {x.key === 'comeet' && applications.length > 0 && (
              <ul className="d-apps" aria-label="Comeet applications">
                {applications.map((ap) => (
                  <li key={ap.job + ap.date}>
                    <span>{ap.job}</span>
                    <span>
                      {ap.outcome} · {monthYear(ap.date)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
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
                  <span className="d-person-name">
                    {employee.fullName}
                    {ref && (
                      <Tag size="sm" tone="success">
                        Worked together {yearsTogether(ref.overlapStart, ref.overlapEnd)}
                      </Tag>
                    )}
                  </span>
                  <span className="muted">{employee.title}</span>
                  {(() => {
                    const asked = askedBy(employee.employeeId);
                    if (!asked) return null;
                    return (
                      <span className="d-asked">
                        Asked {shortDay(asked.at)} · {STATE_LABEL[asked.state]} · Simulated
                        {asked.state === 'prepared' && (
                          <button
                            type="button"
                            className="d-mark-sent"
                            onClick={() =>
                              record({
                                kind: 'reference',
                                candidateKey: c.candidateKey,
                                employeeId: asked.employeeId,
                                employeeName: asked.employeeName,
                                channel: asked.channel,
                                state: 'confirmed',
                                supersedes: asked.id,
                              })
                            }
                          >
                            Mark sent
                          </button>
                        )}
                      </span>
                    );
                  })()}
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

  const activityCard = (
    <section className="d-card">
      <Label icon={Clock01Icon}>Activity</Label>
      {flags.doNotContact && <p className="check-note is-block">Asked not to be contacted.</p>}
      {flags.inProcess && (
        <p className="check-note is-block">
          In process for {flags.inProcess.job} in Comeet ({flags.inProcess.outcome.replace(/^in process:\s*/i, '')}). New invites are blocked.
        </p>
      )}
      {history.length ? (
        <ul className="d-rows d-activity">
          {history.map((e) => {
            const { icon, tone } = activityMark(e);
            const state = (e.kind === 'invite' || e.kind === 'reference') && e.state !== 'sent' && e.state !== 'confirmed' ? STATE_LABEL[e.state] : null;
            return (
              <li key={e.id}>
                <span className={`d-activity-icon${tone ? ` is-${tone}` : ''}`}>
                  <HugeiconsIcon icon={icon} size={15} strokeWidth={1.75} aria-hidden="true" />
                </span>
                <span className="d-activity-text">
                  {describe(e)}
                  {state && <span className="muted"> · {state}</span>}
                </span>
                <span className="d-activity-date">{shortDay(e.at)}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="muted">No outreach yet</p>
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
        <div className="d-reach">
          <InviteToJob key={c.candidateKey} c={c} fits={ordered} />
        </div>
      </header>

      <Lead a={a} />

      <section>
        <SectionTitle>Overview</SectionTitle>
        <div className="d-grid">
          <div className="d-col">
            {contactCard}
            {metCard}
            {activityCard}
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
              <JobFit
                key={job.jobId}
                a={fit}
                job={job}
                outcome={outcome}
                onJob={onJob}
                role={roleLine(job)}
              />
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

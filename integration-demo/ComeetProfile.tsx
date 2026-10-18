import {
  ArrowDown01Icon,
  ArrowExpand01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Briefcase01Icon,
  Call02Icon,
  Cancel01Icon,
  Comment01Icon,
  File01Icon,
  Flag01Icon,
  Linkedin01Icon,
  Mail01Icon,
  MoreHorizontalIcon,
  ShuffleIcon,
  StarIcon,
  UserIcon,
  Clock01Icon,
} from '@hugeicons/core-free-icons';
import { useEffect, useRef } from 'react';
import type { ComeetCandidate } from './comeet';
import { Icon } from './Icon';
import { initials } from './initials';

/** The demo position's hiring steps. Fictional; a real position uses its own configured workflow. */
export const STEPS = ['Sourced', 'Phone screen', 'Interview / Manager', 'Offer'];

function Value({ v }: { v: string | undefined }) {
  return v ? <>{v}</> : <span className="unknown">Not set</span>;
}

/**
 * Comeet's two-column candidate profile. The assessment travels as configured custom candidate
 * fields on the Details tab; no invented Comeet panel.
 */
export function ComeetProfile({ c, onClose }: { c: ComeetCandidate; onClose: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const name = `${c.firstName} ${c.lastName}`;
  const step = Math.max(0, STEPS.indexOf(c.stage));

  return (
    <section className="cm-profile" aria-label={`${name} profile`} data-uid={c.uid}>
      <div className="cm-pcard cm-pheader">
        <div className="cm-person">
          <span className="cm-avatar cm-avatar-lg" aria-hidden="true">
            {initials(name)}
          </span>
          <div className="cm-person-text">
            <div className="cm-person-name">
              <h2 ref={heading} tabIndex={-1}>
                {name}
              </h2>
              <span className="cm-contact-icons" aria-hidden="true">
                <Icon icon={Call02Icon} />
                <Icon icon={Mail01Icon} />
                <Icon icon={Linkedin01Icon} />
              </span>
            </div>
            <ul className="cm-tags" aria-label="Tags">
              {c.tags.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <button type="button" className="cm-close" aria-label="Close profile" onClick={onClose}>
            <Icon icon={Cancel01Icon} />
          </button>
        </div>
        <div className="cm-pposition">
          <Icon icon={Briefcase01Icon} size={22} />
          <div className="cm-pposition-text">
            <p className="cm-pposition-name">
              {c.positionName} <span className="cm-badge">Candidate</span>
            </p>
            <p className="muted">
              Location: {c.location || '-'} · Source: <span className="cm-underline">{c.source}</span>
            </p>
            <p className="muted">Added: {c.addedOn}</p>
          </div>
          <div className="cm-pstatus">
            <span className={`cm-status${c.status === 'In progress' ? ' is-progress' : ''}`} data-testid="cm-status">
              {c.status === 'Sourced' ? 'Sourced' : `${c.status} · ${c.stage}`}
              <Icon icon={ArrowDown01Icon} size={14} />
            </span>
            <span className="cm-iconbtn" aria-hidden="true">
              <Icon icon={Flag01Icon} size={16} />
            </span>
            <span className="cm-iconbtn" aria-hidden="true">
              <Icon icon={MoreHorizontalIcon} size={16} />
            </span>
          </div>
        </div>
      </div>

      <div className="cm-pcols">
        <div className="cm-pcard cm-ptabs-card">
          <div className="cm-ptabs" aria-hidden="true">
            <span>
              <Icon icon={File01Icon} size={16} /> Application
            </span>
            <span>
              <Icon icon={StarIcon} size={16} /> Evaluation
            </span>
            <span>
              <Icon icon={Briefcase01Icon} size={16} /> Positions <b className="cm-count-badge">1</b>
            </span>
            <span className="is-active">
              <Icon icon={UserIcon} size={16} /> Details
            </span>
            <span>
              <Icon icon={Linkedin01Icon} size={16} /> LinkedIn
            </span>
          </div>
          <section className="cm-details" aria-labelledby="cm-custom">
            <h3 id="cm-custom">Custom fields</h3>
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
            </dl>
            <h3>Contact details</h3>
            <dl className="cm-fields">
              <dt>Email</dt>
              <dd>
                <Value v={c.email} />
              </dd>
              <dt>LinkedIn</dt>
              <dd className="cm-break">
                <Value v={c.linkedinUrl} />
              </dd>
              <dt>Owner</dt>
              <dd>{c.owner}</dd>
            </dl>
          </section>
        </div>

        <div className="cm-pside">
          <section className="cm-pcard" aria-labelledby="cm-workflow">
            <div className="cm-pcard-head">
              <h3 id="cm-workflow">
                <Icon icon={ShuffleIcon} size={18} /> Workflow
              </h3>
              <span className="muted" aria-hidden="true">
                <Icon icon={ArrowExpand01Icon} size={14} /> Expand
              </span>
            </div>
            <div className="cm-wf-dots" aria-hidden="true">
              <Icon icon={ArrowLeft01Icon} size={16} />
              <span className="cm-dots cm-dots-lg">
                {STEPS.map((s, i) => (
                  <span key={s} className={i < step ? 'is-on' : i === step ? 'is-current' : undefined} />
                ))}
              </span>
              <Icon icon={ArrowRight01Icon} size={16} />
            </div>
            <div className="cm-wf-step">
              <div>
                <p className="cm-wf-name">{c.stage}</p>
                <p className="muted">
                  Step {step + 1} of {STEPS.length}
                </p>
              </div>
              <span className="cm-avatar cm-avatar-xs" title={c.owner} aria-hidden="true">
                {c.owner === 'Unassigned' ? '?' : initials(c.owner)}
              </span>
            </div>
            <p className="cm-wf-desc">{c.nextStep}</p>
            <span className="cm-btn-primary cm-btn-block" aria-hidden="true">
              {c.owner === 'Unassigned' ? 'Assign owner' : 'Schedule'}
            </span>
          </section>

          <section className="cm-pcard" aria-labelledby="cm-activity">
            <div className="cm-pcard-head">
              <h3 id="cm-activity">
                <Icon icon={Comment01Icon} size={18} /> Activity
              </h3>
            </div>
            <div className="cm-activity-actions" aria-hidden="true">
              <span>
                <Icon icon={Comment01Icon} size={16} /> Comment
              </span>
              <span>
                <Icon icon={Mail01Icon} size={16} /> Email
              </span>
              <span>
                <Icon icon={Clock01Icon} size={16} /> Reminder
              </span>
            </div>
            <ul className="cm-activity">
              {c.note ? (
                <li>
                  <p className="cm-activity-who">Talent pool integration · {c.addedOn}</p>
                  <p>{c.note}</p>
                </li>
              ) : (
                <li>
                  <p className="cm-activity-who">
                    {c.owner} · {c.addedOn}
                  </p>
                  <p>Moved to {c.stage}.</p>
                </li>
              )}
            </ul>
          </section>
        </div>
      </div>
    </section>
  );
}

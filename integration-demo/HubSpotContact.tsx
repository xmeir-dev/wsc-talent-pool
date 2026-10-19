import {
  ArrowDown01Icon,
  ArrowLeft01Icon,
  ArrowRight01Icon,
  Calendar03Icon,
  Call02Icon,
  Copy01Icon,
  Mail01Icon,
  MoreHorizontalIcon,
  Note01Icon,
  Settings01Icon,
  Task01Icon,
} from '@hugeicons/core-free-icons';
import { useEffect, useRef, useState } from 'react';
import { useActivity } from '../view/actionStore';
import { RELEVANCE_LABEL } from '../view/format';
import type { AssessmentStore } from './assessments';
import type { ComeetService } from './comeet';
import { HandoffDialog } from './HandoffDialog';
import { lastContacted, timeline } from './hubspotActivity';
import { comeetStatusText } from './comeetStatus';
import { Icon } from './Icon';
import { initials } from './initials';
import { TalentMatchCard } from './TalentMatchCard';

interface Props {
  store: AssessmentStore;
  comeet: ComeetService;
  candidateKey: string;
  jobId: string;
  onJobChange: (jobId: string) => void;
  onBack: () => void;
  onOpenComeet: (uid: string) => void;
  onHandedOff: () => void;
}

const ACTIONS = [
  { label: 'Note', icon: Note01Icon },
  { label: 'Email', icon: Mail01Icon },
  { label: 'Call', icon: Call02Icon },
  { label: 'Task', icon: Task01Icon },
  { label: 'Meeting', icon: Calendar03Icon },
  { label: 'More', icon: MoreHorizontalIcon },
];

/**
 * HubSpot's contact record: left sidebar, middle column tabs, right sidebar associations.
 * The Talent match app card sits at the top of the Overview tab (an app-card location HubSpot
 * supports), so the assessment gets the full middle column.
 */
export function HubSpotContact({ store, comeet, candidateKey, jobId, onJobChange, onBack, onOpenComeet, onHandedOff }: Props) {
  const [handoffOpen, setHandoffOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const activity = useActivity();

  const entry = store.get(candidateKey, jobId);
  if (!entry) return null;
  const { a } = entry;
  const c = a.candidate;
  const p = c.profile;
  const firstEvent = a.events[0]?.attendance;
  const position = comeet.positionFor(jobId);
  const status = position ? comeetStatusText(comeet.statusFor(c, position.uid)) : '--';
  const company = p?.currentCompany || c.attendances.at(-1)?.listedCompany || '';
  // Outreach from the recruiter app joins event attendance in one timeline, newest first.
  const logged = timeline(activity, candidateKey);
  const items = [
    ...logged.map((x) => ({ key: x.id, date: x.date, x })),
    ...a.events.map((e) => ({ key: e.attendance.attendanceId, date: e.attendance.conferenceDate, e })),
  ].sort((m, n) => n.date.localeCompare(m.date));

  return (
    <>
      <div className="hs-record">
        <aside className="hs-left" aria-label="Contact properties">
          <section className="hs-card hs-idcard">
            <div className="hs-idcard-top">
              <button type="button" className="hs-crumb" onClick={onBack}>
                <Icon icon={ArrowLeft01Icon} size={16} /> Contacts
              </button>
              <span className="hs-actions-menu" aria-hidden="true">
                Actions <Icon icon={ArrowDown01Icon} size={14} />
              </span>
            </div>
            <div className="hs-identity">
              <span className="hs-avatar" aria-hidden="true">
                {initials(c.fullName)}
              </span>
              <div className="hs-identity-text">
                <h1 ref={heading} tabIndex={-1} className="hs-name">
                  {c.fullName}
                </h1>
                <p>{[p?.currentTitle, company].filter(Boolean).join(' at ')}</p>
                <p className="hs-email">
                  <span className="hs-underline">{c.email}</span> <Icon icon={Copy01Icon} size={14} />
                </p>
              </div>
            </div>
            <div className="hs-quick" aria-hidden="true">
              {ACTIONS.map((x) => (
                <span key={x.label} className="hs-quick-item">
                  <span className="hs-quick-btn">
                    <Icon icon={x.icon} size={18} />
                  </span>
                  {x.label}
                </span>
              ))}
            </div>
          </section>

          <section className="hs-card" aria-labelledby="hs-key">
            <div className="hs-card-head">
              <h2 id="hs-key">
                <Icon icon={ArrowDown01Icon} size={16} /> Key information
              </h2>
            </div>
            <dl className="hs-props">
              <dt>Contact owner</dt>
              <dd>Unassigned</dd>
              <dt>Lifecycle stage</dt>
              <dd>Lead</dd>
              <dt>Lead source</dt>
              <dd>{firstEvent ? `Conference: ${firstEvent.editionLabel}` : '--'}</dd>
              <dt>Comeet status ({entry.result.job.title})</dt>
              <dd data-testid="hs-comeet-status">{status}</dd>
              <dt>Last contacted</dt>
              <dd data-testid="hs-last-contacted">{lastContacted(activity, candidateKey) ?? '--'}</dd>
            </dl>
          </section>

          <section className="hs-card" aria-labelledby="hs-about">
            <div className="hs-card-head">
              <h2 id="hs-about">
                <Icon icon={ArrowDown01Icon} size={16} /> About this contact
              </h2>
            </div>
            <dl className="hs-props">
              <dt>Email</dt>
              <dd>{c.email || '--'}</dd>
              <dt>LinkedIn</dt>
              <dd className="hs-break">{c.linkedinUrl || '--'}</dd>
              <dt>City</dt>
              <dd>{p?.location || '--'}</dd>
              <dt>Record ID</dt>
              <dd>{c.sourceContactIds.join(', ')}</dd>
            </dl>
          </section>
        </aside>

        <main className="hs-middle">
          <div className="hs-tabs">
            <div className="hs-tabbar" role="tablist" aria-label="Record tabs">
              <span className="hs-tab is-active" role="tab" aria-selected="true">
                Overview
              </span>
              <span className="hs-tab" aria-disabled="true">
                Activities
              </span>
            </div>
            <span className="hs-customize" aria-hidden="true">
              <Icon icon={Settings01Icon} size={16} /> Customize
            </span>
          </div>

          <TalentMatchCard
            store={store}
            entry={entry}
            jobId={jobId}
            onJobChange={onJobChange}
            comeetRecord={position ? comeet.statusFor(c, position.uid) : null}
            onHandoff={() => setHandoffOpen(true)}
            onOpenComeet={onOpenComeet}
          />

          <section className="hs-card" aria-labelledby="hs-recent">
            <div className="hs-card-head">
              <h2 id="hs-recent">Recent activities</h2>
            </div>
            <ul className="hs-activities">
              {items.map((item) =>
                'x' in item ? (
                  <li key={item.key}>
                    <div className="hs-activity-head">
                      <span>
                        <Icon icon={ArrowRight01Icon} size={14} /> <strong>{item.x.type}</strong> · {item.x.title}
                      </span>
                      <span className="muted">{item.date}</span>
                    </div>
                    <p className="muted">
                      {item.x.by}
                      {item.x.simulated && ' · Simulated'}
                    </p>
                  </li>
                ) : (
                  <li key={item.key}>
                    <div className="hs-activity-head">
                      <span>
                        <Icon icon={ArrowRight01Icon} size={14} /> <strong>Event attendance</strong> · {item.e.attendance.editionLabel}
                      </span>
                      <span className="muted">{item.date}</span>
                    </div>
                    <p className="muted">
                      Listed as {item.e.attendance.listedTitle || 'no title'}, {item.e.attendance.listedCompany || 'no company'} ·{' '}
                      Relevance to event topic ({item.e.attendance.conferenceDomain}): {RELEVANCE_LABEL[item.e.relevance]}
                    </p>
                    {item.e.attendance.notes && <p>"{item.e.attendance.notes}"</p>}
                  </li>
                ),
              )}
            </ul>
          </section>
        </main>

        <aside className="hs-right" aria-label="Associations">
          <section className="hs-card">
            <div className="hs-card-head">
              <h2>
                <Icon icon={ArrowDown01Icon} size={16} /> Companies (1)
              </h2>
              <span className="hs-add" aria-hidden="true">
                + Add
              </span>
            </div>
            <div className="hs-assoc">
              <span className="hs-primary-tag">Primary</span>
              <p className="hs-underline hs-assoc-name">{company}</p>
            </div>
          </section>
          <section className="hs-card">
            <div className="hs-card-head">
              <h2>
                <Icon icon={ArrowRight01Icon} size={16} /> Deals (0)
              </h2>
              <span className="hs-add" aria-hidden="true">
                + Add
              </span>
            </div>
          </section>
          <section className="hs-card">
            <div className="hs-card-head">
              <h2>
                <Icon icon={ArrowRight01Icon} size={16} /> Tickets (0)
              </h2>
              <span className="hs-add" aria-hidden="true">
                + Add
              </span>
            </div>
          </section>
        </aside>
      </div>

      {handoffOpen && (
        <HandoffDialog
          entry={entry}
          version={store.version}
          comeet={comeet}
          onClose={() => setHandoffOpen(false)}
          onOpenComeet={onOpenComeet}
          onHandedOff={onHandedOff}
        />
      )}
    </>
  );
}

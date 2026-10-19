import { useState, type ReactNode } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { ArrowDown01Icon, ArrowUp01Icon, Briefcase04Icon, Calendar03Icon } from '@hugeicons/core-free-icons';
import type { Pool } from './attendees';
import { shortDate } from './format';
import comeetIcon from './assets/comeet.png';

/** Assumed Comeet position link; the real one uses Comeet's position ID, which the snapshot doesn't have. */
const comeetPosition = (jobId: string) => `https://app.comeet.co/app/positions/${jobId}`;

interface Row {
  /** The filter value: an event edition key or a job ID. */
  id: string;
  name: string;
  /** Quiet text right after the name. */
  sub?: string;
  value: string;
  /** Opens the row's record in another tool, shown as that tool's icon. */
  link?: { href: string; label: string; icon: string };
}

/** One card: icon, label, big count, then "See all" opens the full list in place. A row click adds it to the table filter or takes it out, so several can be on at once. */
function PoolCard({
  icon,
  label,
  count,
  rows,
  action,
  selected,
  onSelect,
}: {
  icon: IconSvgElement;
  label: string;
  count: number;
  rows: Row[];
  /** The card's one action, if any (e.g. Add conference). */
  action?: ReactNode;
  selected: string[];
  onSelect: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="pool-card" aria-label={label}>
      <div className="pool-card-top">
        <div>
          <span className="muted pool-label">
            <HugeiconsIcon icon={icon} size={32} strokeWidth={1.5} aria-hidden="true" />
            <span className="pool-label-text">{label}</span>
          </span>
          <p className="pool-count">{count}</p>
          <p className="pool-toggle-row">
            <button type="button" className="pool-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? 'Show less' : 'See all'}
              <HugeiconsIcon icon={open ? ArrowUp01Icon : ArrowDown01Icon} size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
          </p>
        </div>
        {action}
      </div>
      {open && (
        <ul className="pool-list">
          {rows.map((r) => {
            const on = selected.includes(r.id);
            // Keep the filter in list order, like the filter menus.
            const toggle = () => onSelect(rows.map((x) => x.id).filter((id) => (id === r.id ? !on : selected.includes(id))));
            return (
              <li key={r.id} className="pool-item">
                {/* The button stretches over the whole row, so a click anywhere toggles; the link sits above it. */}
                <button type="button" className="pool-row" aria-pressed={on} onClick={toggle}>
                  {r.name}
                  {r.sub && <span className="muted pool-sub">{r.sub}</span>}
                </button>
                {r.link && (
                  <a className="pool-link" href={r.link.href} target="_blank" rel="noreferrer" aria-label={r.link.label} title={r.link.label}>
                    <img src={r.link.icon} alt="" width={16} height={16} />
                  </a>
                )}
                <span className="muted pool-value">{r.value}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

interface Filter {
  selected: string[];
  onSelect: (next: string[]) => void;
}

export function PoolCards({
  pool,
  attendeesPer,
  conferences,
  jobs: jobFilter,
  newConference,
}: {
  pool: Pool;
  /** Attendees per event edition key. */
  attendeesPer: Map<string, number>;
  conferences: Filter;
  jobs: Filter;
  newConference?: ReactNode;
}) {
  const shortlisted = (jobId: string) =>
    pool.attendees.filter((p) => p.relevantFor.some((r) => r.job.jobId === jobId && r.outcome === 'shortlist')).length;
  const jobs = pool.jobs.map((j) => ({ id: j.jobId, name: j.title, n: shortlisted(j.jobId) }));
  return (
    <div className="pool-cards">
      <PoolCard
        icon={Calendar03Icon}
        label="Conferences"
        count={pool.conferences.length}
        rows={pool.conferences.map((c) => ({
          id: c.key,
          name: c.name,
          // The date tells two runs of one conference apart; an undated edition says so.
          sub: c.date ? shortDate(c.date) : 'date unknown',
          value: `${attendeesPer.get(c.key)} attendees`,
        }))}
        action={newConference}
        {...conferences}
      />
      <PoolCard
        icon={Briefcase04Icon}
        label="Open jobs"
        count={pool.jobs.length}
        rows={jobs.map((j) => ({
          id: j.id,
          name: j.name,
          value: `${j.n} shortlisted`,
          link: { href: comeetPosition(j.id), label: `Open ${j.name} in Comeet`, icon: comeetIcon },
        }))}
        {...jobFilter}
      />
    </div>
  );
}

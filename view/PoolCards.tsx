import { useState } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { Add01Icon, ArrowDown01Icon, ArrowUp01Icon, Briefcase04Icon, Calendar03Icon } from '@hugeicons/core-free-icons';
import { Button } from '@meir-labs/ui-kit';
import type { Pool } from './attendees';
import { shortDate } from './format';
import comeetIcon from './assets/comeet.png';

/** Assumed Comeet position link; the real one uses Comeet's position ID, which the snapshot doesn't have. */
const comeetPosition = (jobId: string) => `https://app.comeet.co/app/positions/${jobId}`;

interface Row {
  /** The filter value: a conference name or a job ID. */
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
  primary,
  selected,
  onSelect,
}: {
  icon: IconSvgElement;
  label: string;
  count: number;
  rows: Row[];
  action: string;
  primary?: boolean;
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
        <Button variant={primary ? 'primary' : 'secondary'} leftIcon={<HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />}>
          {action}
        </Button>
      </div>
      {open && (
        <ul className="pool-list">
          {rows.map((r) => {
            const on = selected.includes(r.id);
            // Keep the filter in list order, like the filter menus.
            const toggle = () => onSelect(rows.map((x) => x.id).filter((id) => (id === r.id ? !on : selected.includes(id))));
            return (
              <li key={r.id} className={r.link ? 'has-link' : undefined}>
                <button type="button" className="pool-row" aria-pressed={on} onClick={toggle}>
                  <span>
                    {r.name}
                    {r.sub && <span className="muted pool-sub">{r.sub}</span>}
                  </span>
                  <span className="muted">{r.value}</span>
                </button>
                {r.link && (
                  <a className="pool-link" href={r.link.href} target="_blank" rel="noreferrer" aria-label={r.link.label} title={r.link.label}>
                    <img src={r.link.icon} alt="" width={16} height={16} />
                  </a>
                )}
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
}: {
  pool: Pool;
  attendeesPer: Map<string, number>;
  conferences: Filter;
  jobs: Filter;
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
        rows={pool.conferences.map((c) => ({ id: c.name, name: c.name, sub: shortDate(c.date), value: `${attendeesPer.get(c.name)} attendees` }))}
        action="New conference"
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
        action="New job"
        {...jobFilter}
        primary
      />
    </div>
  );
}

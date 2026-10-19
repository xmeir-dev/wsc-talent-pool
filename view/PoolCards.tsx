import { useState } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { Add01Icon, ArrowDown01Icon, ArrowUp01Icon, Briefcase04Icon, ConferenceIcon } from '@hugeicons/core-free-icons';
import { Button } from '@meir-labs/ui-kit';
import type { Pool } from './attendees';
import { shortDate } from './format';

interface Row {
  name: string;
  /** Quiet text right after the name. */
  sub?: string;
  value: string;
}

/** One card: icon, label, big count, then "See all" opens the full list in place. */
function PoolCard({ icon, label, count, rows, action, primary }: { icon: IconSvgElement; label: string; count: number; rows: Row[]; action: string; primary?: boolean }) {
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
          {rows.map((r) => (
            <li key={r.name}>
              <span>
                {r.name}
                {r.sub && <span className="muted pool-sub">{r.sub}</span>}
              </span>
              <span className="muted">{r.value}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function PoolCards({ pool, attendeesPer }: { pool: Pool; attendeesPer: Map<string, number> }) {
  const shortlisted = (jobId: string) =>
    pool.attendees.filter((p) => p.relevantFor.some((r) => r.job.jobId === jobId && r.outcome === 'shortlist')).length;
  const jobs = pool.jobs.map((j) => ({ name: j.title, n: shortlisted(j.jobId) }));
  return (
    <div className="pool-cards">
      <PoolCard
        icon={ConferenceIcon}
        label="Conferences"
        count={pool.conferences.length}
        rows={pool.conferences.map((c) => ({ name: c.name, sub: shortDate(c.date), value: `${attendeesPer.get(c.name)} attendees` }))}
        action="New conference"
      />
      <PoolCard
        icon={Briefcase04Icon}
        label="Open jobs"
        count={pool.jobs.length}
        rows={jobs.map((j) => ({ name: j.name, value: `${j.n} shortlisted` }))}
        action="New job"
        primary
      />
    </div>
  );
}

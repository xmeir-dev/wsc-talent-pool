import { useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon } from '@hugeicons/core-free-icons';
import { Button } from '@meir-labs/ui-kit';
import type { Pool } from './attendees';
import { shortDate } from './format';

interface Row {
  name: string;
  value: string;
}

/** One card: label, big count, a short line, then "See all" opens the full list in place. */
function PoolCard({ label, count, line, rows, action, primary }: { label: string; count: number; line: string; rows: Row[]; action: string; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="pool-card" aria-label={label}>
      <div className="pool-card-top">
        <div>
          <span className="muted">{label}</span>
          <p className="pool-count">{count}</p>
          <p className="muted">
            {line} ·{' '}
            <button type="button" className="pool-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
              {open ? 'Show less' : 'See all'}
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
              <span>{r.name}</span>
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
        label="Conferences"
        count={pool.conferences.length}
        line={`${pool.attendees.length} attendees`}
        rows={pool.conferences.map((c) => ({ name: c.name, value: `${shortDate(c.date)} · ${attendeesPer.get(c.name)} attendees` }))}
        action="New conference"
      />
      <PoolCard
        label="Open jobs"
        count={pool.jobs.length}
        line={`${jobs.reduce((s, j) => s + j.n, 0)} shortlisted across all roles`}
        rows={jobs.map((j) => ({ name: j.name, value: `${j.n} shortlisted` }))}
        action="New job"
        primary
      />
    </div>
  );
}

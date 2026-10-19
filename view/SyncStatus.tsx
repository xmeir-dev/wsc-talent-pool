import { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, Refresh01Icon } from '@hugeicons/core-free-icons';
import { Button, Popover } from '@meir-labs/ui-kit';
import comeetIcon from './assets/comeet.png';
import googleFormsIcon from './assets/google-forms.png';
import hubspotIcon from './assets/hubspot.png';

const MIN = 60_000;

/** Made-up sync times for the demo: nothing connects here (see docs/assumptions.md). */
const SOURCES = [
  { key: 'hubspot', name: 'HubSpot', icon: hubspotIcon, ago: 4 * MIN },
  { key: 'comeet', name: 'Comeet', icon: comeetIcon, ago: 2 * MIN },
  { key: 'forms', name: 'Google Forms', icon: googleFormsIcon, ago: 60 * MIN },
] as const;

function relative(ms: number): string {
  const m = Math.floor(ms / MIN);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h === 1 ? '1 hr ago' : `${h} hr ago`;
}

/** "Synced 2 min ago": the arrow lists each source's last sync, with Sync now. */
export function SyncStatus() {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [last, setLast] = useState<Record<string, number>>(() =>
    Object.fromEntries(SOURCES.map((s) => [s.key, Date.now() - s.ago])),
  );
  const [syncing, setSyncing] = useState(false);
  // Keep "x min ago" current.
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const newest = Math.max(...Object.values(last));

  const syncNow = () => {
    setSyncing(true);
    window.setTimeout(() => {
      const t = Date.now();
      setLast(Object.fromEntries(SOURCES.map((s) => [s.key, t])));
      setNow(t);
      setSyncing(false);
    }, 1400);
  };

  return (
    <Popover placement="bottom-end" open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="sync-trigger">
        {syncing ? 'Syncing…' : `Synced ${relative(now - newest)}`}
        <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.75} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Content className="sync-pop" aria-label="Last syncs">
        <ul className="sync-list">
          {SOURCES.map((s) => (
            <li key={s.key}>
              <img src={s.icon} alt="" width={18} height={18} />
              <span className="sync-name">{s.name}</span>
              <span className="sync-when">
                {syncing ? (
                  <HugeiconsIcon icon={Refresh01Icon} size={14} strokeWidth={1.75} className="sync-spin" aria-label="Syncing" />
                ) : (
                  relative(now - last[s.key]!)
                )}
              </span>
            </li>
          ))}
        </ul>
        <Button
          variant="secondary"
          size="sm"
          className="sync-now"
          disabled={syncing}
          onClick={syncNow}
          leftIcon={<HugeiconsIcon icon={Refresh01Icon} size={16} strokeWidth={1.75} className={syncing ? 'sync-spin' : undefined} />}
        >
          {syncing ? 'Syncing…' : 'Sync now'}
        </Button>
      </Popover.Content>
    </Popover>
  );
}

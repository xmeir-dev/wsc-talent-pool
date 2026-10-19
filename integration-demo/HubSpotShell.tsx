import {
  Cancel01Icon,
  ChartLineData01Icon,
  ContactIcon,
  CustomerService01Icon,
  HelpCircleIcon,
  Home01Icon,
  Megaphone01Icon,
  Notification03Icon,
  Search01Icon,
  Settings01Icon,
  ShoppingBag01Icon,
} from '@hugeicons/core-free-icons';
import { useEffect, useRef, useState } from 'react';
import { roleView } from './HubSpotList';
import { Icon } from './Icon';

export interface Notice {
  id: string;
  title: string;
  body: string;
  /** One line per role; each count opens that role's view on that group. */
  lines: { jobId: string; title: string; shortlist: number; needsReview: number }[];
}

interface Props {
  notices: Notice[];
  unread: number;
  onReadAll: () => void;
  /** Opens a saved view (see roleView). */
  onOpenView: (view: string) => void;
  children: React.ReactNode;
}

/**
 * HubSpot's frame: dark top bar with global search and a left icon rail. Only the notification
 * bell works; it is how the overnight run and later updates reach the recruiter.
 */
export function HubSpotShell({ notices, unread, onReadAll, onOpenView, children }: Props) {
  // Opens when something new is waiting: the demo starts the morning after, with the overnight run's notice.
  const [open, setOpen] = useState(unread > 0);
  const latest = notices[0]?.id;
  useEffect(() => {
    if (unread > 0) setOpen(true);
    // Only a newly arrived notice reopens the panel.
  }, [latest]);

  useEffect(() => {
    if (open && unread > 0) onReadAll();
  }, [open, unread, onReadAll]);

  const panel = useRef<HTMLElement>(null);
  const bell = useRef<HTMLButtonElement>(null);

  // Closes on Escape or a click anywhere outside the panel, as HubSpot's popovers do.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !bell.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <div className="host hs">
      <header className="hs-top">
        <span className="hs-brand" aria-hidden="true">
          HubSpot
        </span>
        <span className="hs-search" aria-hidden="true">
          <Icon icon={Search01Icon} size={16} />
          Search HubSpot
        </span>
        <span className="hs-top-icons">
          <span aria-hidden="true">
            <Icon icon={HelpCircleIcon} />
          </span>
          <span aria-hidden="true">
            <Icon icon={Settings01Icon} />
          </span>
          <button
            ref={bell}
            type="button"
            className="hs-bell"
            aria-label={unread > 0 ? `Notifications, ${unread} new` : 'Notifications'}
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <Icon icon={Notification03Icon} />
            {unread > 0 && <span className="hs-bell-count">{unread}</span>}
          </button>
          <span className="hs-me" aria-hidden="true">
            WS
          </span>
        </span>
      </header>

      {open && (
        <section ref={panel} className="hs-notices" role="dialog" aria-label="Notifications">
          <div className="hs-notices-head">
            <h2>Notifications</h2>
            <button type="button" className="handoff-x" aria-label="Close notifications" onClick={() => setOpen(false)}>
              <Icon icon={Cancel01Icon} size={16} />
            </button>
          </div>
          <ul>
            {notices.map((n) => (
              <li key={n.id} className="hs-notice">
                <p className="hs-notice-app">WSC Talent Pool</p>
                <p className="hs-notice-title">{n.title}</p>
                <p className="muted">{n.body}</p>
                <ul className="hs-notice-lines">
                  {n.lines.map((l) => (
                    <li key={l.jobId}>
                      {l.title}:{' '}
                      {(
                        [
                          ['shortlist', l.shortlist, 'shortlist'],
                          ['needs_review', l.needsReview, 'needs review'],
                        ] as const
                      ).map(([outcome, count, label], i) => (
                        <span key={outcome}>
                          {i > 0 && ' · '}
                          <button
                            type="button"
                            className="hs-link"
                            aria-label={`${l.title}: ${count} ${label}`}
                            onClick={() => {
                              onOpenView(roleView(l.jobId, outcome));
                              setOpen(false);
                            }}
                          >
                            {count} {label}
                          </button>
                        </span>
                      ))}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="hs-frame">
        <nav className="hs-rail" aria-hidden="true">
          <span>
            <Icon icon={Home01Icon} />
          </span>
          <span className="is-active">
            <Icon icon={ContactIcon} />
          </span>
          <span>
            <Icon icon={Megaphone01Icon} />
          </span>
          <span>
            <Icon icon={ShoppingBag01Icon} />
          </span>
          <span>
            <Icon icon={CustomerService01Icon} />
          </span>
          <span>
            <Icon icon={ChartLineData01Icon} />
          </span>
        </nav>
        <div className="hs-main">{children}</div>
      </div>
    </div>
  );
}

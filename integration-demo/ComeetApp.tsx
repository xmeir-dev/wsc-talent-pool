import {
  Add01Icon,
  ArrowDown01Icon,
  ChartLineData01Icon,
  InboxIcon,
  Menu01Icon,
  PuzzleIcon,
  Search01Icon,
  Settings01Icon,
  Share08Icon,
  UserAdd01Icon,
  UserGroupIcon,
  UserMultipleIcon,
} from '@hugeicons/core-free-icons';
import type { ComeetCandidate, ComeetService } from './comeet';
import { ComeetProfile, STEPS } from './ComeetProfile';
import { Icon } from './Icon';
import { initials } from './initials';

interface Props {
  comeet: ComeetService;
  positionUid: string;
  openUid: string | null;
  onNavigate: (to: { positionUid: string; openUid: string | null }) => void;
}

/**
 * Comeet's hiring workspace: icon rail, Hiring sidebar with positions, and the position page.
 * Opening a candidate narrows the list into a side column beside the profile, as Comeet does.
 */
export function ComeetApp({ comeet, positionUid, openUid, onNavigate }: Props) {
  const position = comeet.positions().find((p) => p.uid === positionUid)!;
  const candidates = comeet.list(positionUid);
  const open = openUid ? comeet.get(openUid) : undefined;

  return (
    <div className="host cm">
      <nav className="cm-rail" aria-hidden="true">
        <span className="cm-mark">c</span>
        <span>
          <Icon icon={Search01Icon} size={22} />
        </span>
        <span>
          <Icon icon={UserGroupIcon} size={22} />
        </span>
        <span className="is-active">
          <Icon icon={UserAdd01Icon} size={22} />
        </span>
        <span>
          <Icon icon={UserMultipleIcon} size={22} />
        </span>
        <span>
          <Icon icon={ChartLineData01Icon} size={22} />
        </span>
        <span className="cm-rail-bottom">
          <Icon icon={PuzzleIcon} size={22} />
        </span>
        <span>
          <Icon icon={Settings01Icon} size={22} />
        </span>
        <span className="cm-me">WS</span>
      </nav>

      <aside className="cm-side" aria-label="Hiring">
        <p className="cm-side-title">Hiring</p>
        <ul className="cm-side-links" aria-hidden="true">
          <li>My tasks</li>
          <li>
            Inbox <Icon icon={InboxIcon} size={14} />
          </li>
          <li>Dashboard</li>
          <li>Hiring plan</li>
          <li>
            Setup <Icon icon={ArrowDown01Icon} size={14} />
          </li>
        </ul>
        <div className="cm-side-head">
          <span>Positions</span>
          <Icon icon={Add01Icon} size={18} />
        </div>
        <ul className="cm-positions">
          {comeet.positions().map((p) => (
            <li key={p.uid}>
              <button
                type="button"
                aria-current={p.uid === positionUid ? 'page' : undefined}
                onClick={() => onNavigate({ positionUid: p.uid, openUid: null })}
              >
                {p.name}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <div className="cm-main">
        <header className="cm-head">
          <div className="cm-head-title">
            <Icon icon={Menu01Icon} size={22} />
            <h1>{position.name}</h1>
            <span className="cm-team" aria-hidden="true">
              <span>DA</span>
              <span>AM</span>
              <span>+2</span>
            </span>
          </div>
          <div className="cm-head-actions" aria-hidden="true">
            <span className="cm-chip">
              <Icon icon={Share08Icon} size={16} />
            </span>
            <span className="cm-chip">
              Open <Icon icon={ArrowDown01Icon} size={14} />
            </span>
            <span className="cm-chip">
              Published <Icon icon={ArrowDown01Icon} size={14} />
            </span>
          </div>
        </header>
        <div className="cm-tabs" aria-hidden="true">
          {['Candidates', 'Prospects', 'Openings', 'Sources', 'Workflow', 'Scorecard', 'Description'].map((t, i) => (
            <span key={t} className={i === 0 ? 'cm-tab is-active' : 'cm-tab'}>
              {t}
            </span>
          ))}
        </div>

        {open ? (
          <div className="cm-split">
            <CandidateColumn
              candidates={candidates}
              openUid={open.uid}
              onOpen={(uid) => onNavigate({ positionUid, openUid: uid })}
            />
            <ComeetProfile key={open.uid} c={open} onClose={() => onNavigate({ positionUid, openUid: null })} />
          </div>
        ) : (
          <CandidateBoard candidates={candidates} onOpen={(uid) => onNavigate({ positionUid, openUid: uid })} />
        )}
      </div>
    </div>
  );
}

function groupByStep(candidates: ComeetCandidate[]) {
  return STEPS.map((step) => ({ step, people: candidates.filter((c) => c.stage === step) })).filter((g) => g.people.length > 0);
}

function Dots({ c }: { c: ComeetCandidate }) {
  const at = Math.max(0, STEPS.indexOf(c.stage));
  return (
    <span className="cm-dots" aria-hidden="true">
      {STEPS.map((s, i) => (
        <span key={s} className={i <= at ? 'is-on' : undefined} />
      ))}
    </span>
  );
}

function CandidateBoard({ candidates, onOpen }: { candidates: ComeetCandidate[]; onOpen: (uid: string) => void }) {
  return (
    <main className="cm-board">
      <div className="cm-toolbar">
        <div className="cm-toolbar-chips" aria-hidden="true">
          <span className="cm-chip">
            <Icon icon={UserGroupIcon} size={16} /> All candidates
          </span>
          <span className="cm-chip">All posting locations</span>
          <span className="cm-chip">by: Stage</span>
        </div>
        <span className="cm-btn-primary" aria-hidden="true">
          <Icon icon={Add01Icon} size={16} /> Add candidate
        </span>
      </div>
      <p className="cm-count">
        {candidates.length} candidate{candidates.length === 1 ? '' : 's'}
      </p>
      {candidates.length === 0 && <p className="muted">No candidates in this position yet.</p>}
      {groupByStep(candidates).map((g) => (
        <section key={g.step} className="cm-group">
          <h2>
            {g.step} ({g.people.length}) <Icon icon={ArrowDown01Icon} size={16} />
          </h2>
          <ul className="cm-cards">
            {g.people.map((c) => (
              <li key={c.uid}>
                <button type="button" className="cm-card-btn" onClick={() => onOpen(c.uid)}>
                  <span className="cm-avatar" aria-hidden="true">
                    {initials(`${c.firstName} ${c.lastName}`)}
                  </span>
                  <span className="cm-card-text">
                    <span className="cm-card-name">
                      {c.firstName} {c.lastName}
                    </span>
                    <span className="muted">{c.location || 'No location'}</span>
                    <span className="muted">{c.customFields?.roleFit ?? c.stage}</span>
                    <Dots c={c} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}

function CandidateColumn({
  candidates,
  openUid,
  onOpen,
}: {
  candidates: ComeetCandidate[];
  openUid: string;
  onOpen: (uid: string) => void;
}) {
  return (
    <aside className="cm-column" aria-label="Candidates">
      {groupByStep(candidates).map((g) => (
        <section key={g.step}>
          <h2 className="cm-column-group">
            {g.step} ({g.people.length})
          </h2>
          <ul>
            {g.people.map((c) => (
              <li key={c.uid}>
                <button
                  type="button"
                  className={`cm-row${c.uid === openUid ? ' is-selected' : ''}`}
                  aria-current={c.uid === openUid ? 'true' : undefined}
                  onClick={() => onOpen(c.uid)}
                >
                  <span className="cm-avatar cm-avatar-sm" aria-hidden="true">
                    {initials(`${c.firstName} ${c.lastName}`)}
                  </span>
                  <span className="cm-card-text">
                    <span className="cm-card-name">
                      {c.firstName} {c.lastName}
                    </span>
                    <span className="muted">{c.stage}</span>
                    <Dots c={c} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}

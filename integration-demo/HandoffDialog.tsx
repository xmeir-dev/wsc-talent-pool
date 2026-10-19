import { useEffect, useRef, useState } from 'react';
import type { StoredAssessment } from './assessments';
import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { refreshActivity, useActivityState } from '../view/actionStore';
import { buildHandoff, handoffCheck, type ComeetCandidate, type ComeetService } from './comeet';
import { Icon } from './Icon';
import { useDialog } from './useDialog';

interface Props {
  entry: StoredAssessment;
  version: string;
  comeet: ComeetService;
  onClose: () => void;
  onOpenComeet: (uid: string) => void;
  /** Comeet's status webhook: HubSpot re-reads the person's Comeet status. */
  onHandedOff: () => void;
}

type State =
  | { step: 'checking' }
  | { step: 'review' }
  | { step: 'sending' }
  | { step: 'created'; candidate: ComeetCandidate }
  | { step: 'existing'; candidate: ComeetCandidate }
  /** A conflicting identity or a blocking rule: nothing is sent. */
  | { step: 'stopped'; message: string }
  | { step: 'unavailable'; message: string };

/** Review, then confirm. Nothing is sent until Confirm, and a failed call never reads as success. */
export function HandoffDialog({ entry, version, comeet, onClose, onOpenComeet, onHandedOff }: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<State>({ step: 'checking' });
  const [attempt, setAttempt] = useState(0);
  const sending = useRef(false);

  const { a, result } = entry;
  const position = comeet.positionFor(a.jobId);
  const activity = useActivityState();
  // The note carries the recorded history as it is now; Confirm rebuilds it from a fresh read.
  const payload = position ? buildHandoff(a, result.job, version, position, activity.entries) : null;

  useDialog(dialog, onClose);

  useEffect(() => {
    if (!payload) return;
    let live = true;
    setState({ step: 'checking' });
    comeet.find(payload, payload.positionUid).then((r) => {
      if (!live) return;
      if (r.kind === 'unavailable') setState({ step: 'unavailable', message: r.message });
      else if (r.kind === 'conflict') setState({ step: 'stopped', message: r.message });
      else setState(r.candidate ? { step: 'existing', candidate: r.candidate } : { step: 'review' });
    });
    return () => {
      live = false;
    };
    // payload is derived from props; re-check only on an explicit retry.
  }, [attempt]);

  const confirm = async () => {
    if (!payload || !position || sending.current) return;
    sending.current = true;
    setState({ step: 'sending' });
    // Whether Comeet was called decides the message: before it, nothing was sent; after it, Comeet may have the person.
    let calledComeet = false;
    try {
      // The preview may be stale: re-read the history and re-check before sending; the service checks again too.
      const fresh = await refreshActivity();
      const block = handoffCheck(a.candidate, a.jobId, comeet.positions().map((p) => ({ jobId: p.jobId, title: p.name })), fresh).block;
      if (block) {
        setState({ step: 'stopped', message: block });
        return;
      }
      calledComeet = true;
      const r = await comeet.handoff(buildHandoff(a, result.job, version, position, fresh.entries));
      if (r.kind === 'unavailable') setState({ step: 'unavailable', message: r.message });
      else if (r.kind === 'conflict' || r.kind === 'blocked') setState({ step: 'stopped', message: r.message });
      else {
        setState({ step: r.kind, candidate: r.candidate });
        onHandedOff();
      }
    } catch {
      // A failure must leave a retry, never a stuck "Adding…" or anything that reads as success.
      setState({
        step: 'unavailable',
        message: calledComeet
          ? 'Comeet did not answer. Check Comeet before trying again.'
          : 'Could not read the saved history, so nothing was sent.',
      });
    } finally {
      sending.current = false;
    }
  };

  const close = onClose;

  const name = a.candidate.fullName;

  return (
    <div className="handoff-backdrop">
      <div ref={dialog} className="handoff" role="dialog" aria-modal="true" aria-labelledby="handoff-title" tabIndex={-1}>
        <div className="handoff-head">
          <h2 id="handoff-title">Add {name} to Comeet</h2>
          <button type="button" className="handoff-x" aria-label="Dismiss" onClick={close}>
            <Icon icon={Cancel01Icon} size={18} />
          </button>
        </div>

        {!payload ? (
          <p role="alert">No Comeet position is mapped to {result.job.title}.</p>
        ) : (
          <>
            <dl className="handoff-fields">
              <dt>Position</dt>
              <dd>{payload.positionName}</dd>
              <dt>Name</dt>
              <dd>
                {payload.firstName} {payload.lastName}
              </dd>
              <dt>Email</dt>
              <dd>{payload.email || <span className="unknown">Not set</span>}</dd>
              <dt>Tags</dt>
              <dd>{payload.tags.join(', ') || <span className="unknown">None</span>}</dd>
              <dt>Prospect status</dt>
              <dd>{payload.status}</dd>
              <dt>Owner in Comeet</dt>
              <dd data-testid="handoff-owner">{payload.owner}</dd>
              <dt>Role fit</dt>
              <dd>{payload.customFields.roleFit}</dd>
              <dt>Evidence</dt>
              <dd>{payload.customFields.evidence}</dd>
              <dt>Gaps</dt>
              <dd>{payload.customFields.gaps}</dd>
              <dt>Possible references</dt>
              <dd>{payload.customFields.possibleReferences}</dd>
              <dt>Assessment</dt>
              <dd>{result.job.title}</dd>
              <dt>Note</dt>
              <dd data-testid="handoff-note">{payload.note}</dd>
            </dl>

            <div className="handoff-status" role="status">
              {state.step === 'checking' && <p className="muted">Checking Comeet…</p>}
              {state.step === 'review' && <p className="muted">No email or message is sent.</p>}
              {state.step === 'sending' && <p className="muted">Adding…</p>}
              {state.step === 'created' && <p className="ok">Added to {payload.positionName} as Sourced.</p>}
              {state.step === 'existing' && (
                <p>
                  Already in Comeet for {state.candidate.positionName} ({state.candidate.status}, {state.candidate.stage}). Owner:{' '}
                  {state.candidate.owner}. {state.candidate.nextStep}
                </p>
              )}
              {state.step === 'stopped' && <p className="warn">{state.message}</p>}
              {state.step === 'unavailable' && <p className="error-text">{state.message}</p>}
            </div>
          </>
        )}

        <div className="handoff-actions">
          <button type="button" className="hs-btn hs-btn-outline" onClick={close}>
            {state.step === 'created' || state.step === 'existing' || state.step === 'stopped' ? 'Close' : 'Cancel'}
          </button>
          {(state.step === 'review' || state.step === 'sending') && (
            <button type="button" className="hs-btn hs-btn-primary" onClick={confirm} disabled={state.step === 'sending'}>
              Confirm
            </button>
          )}
          {state.step === 'unavailable' && (
            <button type="button" className="hs-btn hs-btn-primary" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
          )}
          {(state.step === 'created' || state.step === 'existing') && (
            <button
              type="button"
              className="hs-btn hs-btn-primary"
              onClick={() => {
                const uid = state.candidate.uid;
                close();
                onOpenComeet(uid);
              }}
            >
              Open in Comeet
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

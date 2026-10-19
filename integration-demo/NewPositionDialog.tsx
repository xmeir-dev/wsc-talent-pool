import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { useRef, useState } from 'react';
import { Icon } from './Icon';
import { SUPPORTED_SENIORITIES } from '../pipeline';
import { roleProblems, type NewRole } from './sources';
import { useDialog } from './useDialog';

interface Props {
  onClose: () => void;
  onCreate: (role: NewRole) => void;
}

/** Prefilled so the demo runs in one click; every field can be changed. */
const EXAMPLE: NewRole = {
  title: 'Computer Vision Engineer',
  department: 'AI/ML',
  seniority: 'Mid',
  keyDomains: 'Computer Vision, Sports Video Analysis',
  requiredSkills: 'Python, Computer Vision, Object Detection, OpenCV',
  niceToHave: 'PyTorch, Real-time processing',
};

const FIELDS: { key: keyof NewRole; label: string; hint?: string }[] = [
  { key: 'title', label: 'Position title' },
  { key: 'department', label: 'Department' },
  { key: 'seniority', label: 'Seniority' },
  { key: 'requiredSkills', label: 'Required skills', hint: 'Comma separated' },
  { key: 'niceToHave', label: 'Nice to have', hint: 'Comma separated' },
  { key: 'keyDomains', label: 'Key domains', hint: 'Comma separated' },
];

/** Comeet's "new position" form. Publishing fires the webhook that scores the talent pool for it. */
export function NewPositionDialog({ onClose, onCreate }: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  const [role, setRole] = useState<NewRole>(EXAMPLE);
  const [problems, setProblems] = useState<string[]>([]);

  useDialog(dialog, onClose);

  return (
    <div className="cm-modal-backdrop">
      <div ref={dialog} className="cm-modal" role="dialog" aria-modal="true" aria-labelledby="np-title" tabIndex={-1}>
        <div className="cm-modal-head">
          <h2 id="np-title">New position</h2>
          <button type="button" className="handoff-x" aria-label="Dismiss" onClick={onClose}>
            <Icon icon={Cancel01Icon} size={18} />
          </button>
        </div>
        <form
          className="cm-form"
          onSubmit={(e) => {
            e.preventDefault();
            const found = roleProblems(role);
            setProblems(found);
            if (found.length === 0) {
              onCreate(role);
              onClose();
            }
          }}
        >
          {FIELDS.map((f) => (
            <label key={f.key} className="cm-field">
              <span>
                {f.label}
                {f.hint && <span className="muted"> · {f.hint}</span>}
              </span>
              {f.key === 'seniority' ? (
                <select value={role.seniority} onChange={(e) => setRole({ ...role, seniority: e.target.value })}>
                  {SUPPORTED_SENIORITIES.map((level) => (
                    <option key={level} value={level}>
                      {level}
                    </option>
                  ))}
                </select>
              ) : (
                <input value={role[f.key]} onChange={(e) => setRole({ ...role, [f.key]: e.target.value })} />
              )}
            </label>
          ))}
          {problems.length > 0 && (
            <ul className="error-text" role="alert">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          <div className="cm-modal-actions">
            <button type="button" className="cm-btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="cm-btn-primary">
              Publish position
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

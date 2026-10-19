import { Cancel01Icon } from '@hugeicons/core-free-icons';
import { useRef, useState } from 'react';
import { Icon } from './Icon';
import { SUPPORTED_SENIORITIES } from '../pipeline';
import { roleProblems, type NewRole } from './sources';
import { CRITERIA_LISTS, editRow, suggestCriteria, type CriteriaList, type CriteriaRow } from './suggestCriteria';
import { useDialog } from './useDialog';

interface Props {
  onClose: () => void;
  onCreate: (role: NewRole) => void;
}

interface Draft {
  title: string;
  department: string;
  seniority: string;
  description: string;
}

/** The example role, prefilled so the demo runs in one click; every field can be changed. */
export const EXAMPLE_POSITION: Draft = {
  title: 'Computer Vision Engineer',
  department: 'AI/ML',
  seniority: 'Mid',
  description:
    "We're hiring an engineer to find the key moments in live sports video. " +
    'You will build computer vision and object detection models that track players and the ball across broadcast feeds. ' +
    'Python and computer vision are a must. ' +
    'Experience with Python, Computer Vision, Object Detection and OpenCV is required. ' +
    'PyTorch and real-time processing are a plus.',
};

/** The confirmed rows of one list, as the source table writes them. */
const listText = (rows: CriteriaRow[], list: CriteriaList) =>
  rows
    .filter((r) => r.list === list && r.skill.trim())
    .map((r) => r.skill.trim())
    .join('; ');

/** Comeet's "new position" form. Publishing fires the webhook that scores the talent pool for it. */
export function NewPositionDialog({ onClose, onCreate }: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Draft>(EXAMPLE_POSITION);
  const [rows, setRows] = useState<CriteriaRow[]>(() => suggestCriteria(EXAMPLE_POSITION.title, EXAMPLE_POSITION.description));
  const [added, setAdded] = useState(0);
  const [problems, setProblems] = useState<string[]>([]);

  useDialog(dialog, onClose);

  // A new title or description re-suggests; rows the recruiter added or edited by hand are kept.
  const edit = (next: Draft) => {
    setDraft(next);
    if (next.title !== draft.title || next.description !== draft.description) {
      setRows((prev) => [...suggestCriteria(next.title, next.description), ...prev.filter((r) => r.origin === 'recruiter')]);
    }
  };
  // An edited suggestion becomes the recruiter's row: no source label or quote, and it survives a re-suggest.
  const setSkill = (id: string, skill: string) => setRows((prev) => prev.map((r) => (r.id === id ? editRow(r, skill) : r)));
  const remove = (id: string) => setRows((prev) => prev.filter((r) => r.id !== id));
  const add = (list: CriteriaList) => {
    setRows((prev) => [...prev, { id: `added-${added}`, list, skill: '', quote: '', origin: 'recruiter' }]);
    setAdded(added + 1);
  };

  const role: NewRole = {
    title: draft.title,
    department: draft.department,
    seniority: draft.seniority,
    keyDomains: '',
    coreSkills: listText(rows, 'core'),
    mustHaveSkills: listText(rows, 'mustHave'),
    requiredSkills: listText(rows, 'required'),
    niceToHave: listText(rows, 'niceToHave'),
  };

  return (
    <div className="cm-modal-backdrop">
      <div ref={dialog} className="cm-modal cm-modal-wide" role="dialog" aria-modal="true" aria-labelledby="np-title" tabIndex={-1}>
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
          <label className="cm-field">
            <span>Position title</span>
            <input value={draft.title} onChange={(e) => edit({ ...draft, title: e.target.value })} />
          </label>
          <label className="cm-field">
            <span>Department</span>
            <input value={draft.department} onChange={(e) => edit({ ...draft, department: e.target.value })} />
          </label>
          <label className="cm-field">
            <span>Seniority</span>
            <select value={draft.seniority} onChange={(e) => edit({ ...draft, seniority: e.target.value })}>
              {SUPPORTED_SENIORITIES.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <label className="cm-field">
            <span>Job description</span>
            <textarea rows={5} value={draft.description} onChange={(e) => edit({ ...draft, description: e.target.value })} />
          </label>

          <section className="np-criteria" aria-labelledby="np-criteria">
            <h3 id="np-criteria">Suggested criteria</h3>
            <p className="muted">Suggested by AI from the description · simulated · edit before publishing</p>
            {CRITERIA_LISTS.map(({ list, label, hint, row }) => {
              const listRows = rows.filter((r) => r.list === list);
              return (
                <fieldset key={list} className="np-list">
                  <legend>
                    {label}
                    {hint && <span className="muted"> · {hint}</span>}
                  </legend>
                  {listRows.map((r, i) => (
                    <div key={r.id} className="np-row">
                      <div className="np-row-main">
                        <input
                          aria-label={`${row} ${i + 1}`}
                          value={r.skill}
                          autoFocus={r.origin === 'recruiter' && !r.skill}
                          onChange={(e) => setSkill(r.id, e.target.value)}
                        />
                        {r.origin !== 'recruiter' && (
                          <span className={r.origin === 'ai' ? 'np-origin is-ai' : 'np-origin'}>
                            {r.origin === 'ai' ? 'AI suggestion' : 'From description'}
                          </span>
                        )}
                        <button type="button" className="np-remove" aria-label={`Remove ${r.skill.trim() || `${row} ${i + 1}`}`} onClick={() => remove(r.id)}>
                          <Icon icon={Cancel01Icon} size={16} />
                        </button>
                      </div>
                      {r.quote && <q className="np-quote">{r.quote}</q>}
                    </div>
                  ))}
                  {list === 'core' && !role.coreSkills && (
                    <p className="warn">No core skills: any required skill counts as relevant (provisional).</p>
                  )}
                  <button type="button" className="np-add" onClick={() => add(list)}>
                    Add {row.toLowerCase()}
                  </button>
                </fieldset>
              );
            })}
          </section>

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

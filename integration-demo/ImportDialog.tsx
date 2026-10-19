import { Cancel01Icon, File01Icon } from '@hugeicons/core-free-icons';
import { useRef, useState } from 'react';
import type { SourceTexts } from '../pipeline';
import { useKnownPeople } from '../view/actionStore';
import { Icon } from './Icon';
import { previewImport, type ImportPreview, type ImportRow } from './sources';
import { useDialog } from './useDialog';

interface Props {
  sources: SourceTexts;
  onClose: () => void;
  onImport: (rows: ImportRow[], fileName: string, merged: number, alreadyRecorded: number) => void;
}

const SAMPLE = 'sample-conference-import.csv';

/**
 * HubSpot-style import for a spreadsheet a recruiter brings back from an event. The file is
 * checked first; nothing changes until Import, and a file with problems imports nothing.
 */
export function ImportDialog({ sources, onClose, onImport }: Props) {
  const dialog = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<{ name: string; preview: ImportPreview } | null>(null);
  const [loadError, setLoadError] = useState('');
  // The pool is built with saved-history IDs; the preview resolves people the same way.
  const known = useKnownPeople();

  useDialog(dialog, onClose);

  const check = (name: string, text: string) => {
    setLoadError('');
    setFile({ name, preview: previewImport(text, sources, known) });
  };

  const useSample = async () => {
    try {
      const res = await fetch(`./${SAMPLE}`);
      if (!res.ok) throw new Error(String(res.status));
      check(SAMPLE, await res.text());
    } catch {
      setLoadError('The sample file could not be loaded.');
    }
  };

  const p = file?.preview;

  return (
    <div className="handoff-backdrop">
      <div ref={dialog} className="handoff import" role="dialog" aria-modal="true" aria-labelledby="import-title" tabIndex={-1}>
        <div className="handoff-head">
          <h2 id="import-title">Import contacts</h2>
          <button type="button" className="handoff-x" aria-label="Dismiss" onClick={onClose}>
            <Icon icon={Cancel01Icon} size={18} />
          </button>
        </div>

        <div className="import-body">
          {!file ? (
            <>
              <p>Upload the spreadsheet from an event. Each row becomes a contact tagged with its conference, until you reload the page or reset the demo.</p>
              <label className="import-drop">
                <Icon icon={File01Icon} size={28} />
                <span className="hs-underline">Choose a CSV file</span>
                <input
                  type="file"
                  accept=".csv,text/csv"
                  className="import-input"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) check(f.name, await f.text());
                  }}
                />
              </label>
              <p className="muted">
                Columns: {'full_name, email, company, title, conference_name, conference_date (YYYY-MM-DD), linkedin_url'}, plus
                optional event_id and profile details (location, years_experience, top_skills, past_titles).{' '}
                <a className="hs-underline" href={`./${SAMPLE}`} download>
                  Download template
                </a>
              </p>
              <button type="button" className="hs-btn hs-btn-outline" onClick={useSample}>
                Use sample file
              </button>
              {loadError && (
                <p className="error-text" role="alert">
                  {loadError}
                </p>
              )}
            </>
          ) : p && !p.ok ? (
            <div role="alert">
              <p className="error-text">{file.name} can't be imported. Nothing was changed.</p>
              {p.problems.length > 8 && <p className="muted">Showing 8 of {p.problems.length} problems.</p>}
              <ul className="import-problems">
                {p.problems.slice(0, 8).map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
          ) : p && p.ok ? (
            <>
              <p>
                <strong>{file.name}</strong>: {p.rows.length + p.alreadyRecorded} rows from {p.conferences.join(', ')}.
              </p>
              {p.rows.length === 0 ? (
                <p data-testid="import-nothing-new">Everyone in this file is already recorded for this event. Nothing to import.</p>
              ) : (
                <p className="muted">
                  {p.created} new contacts · {p.merged} added as an event to an existing contact (no duplicate)
                  {p.alreadyRecorded > 0 && ` · ${p.alreadyRecorded} already recorded for this event, skipped`}. All open roles are
                  re-scored after import.
                </p>
              )}
              {p.uncertain.length > 0 && (
                <ul className="import-problems warn">
                  {p.uncertain.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
              )}
              <div className="hs-table-wrap import-table">
                <table className="hs-table" aria-label="Rows to import">
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Email</th>
                      <th scope="col">Title</th>
                      <th scope="col">LinkedIn</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.rows.map((r) => (
                      <tr key={`${r.full_name}-${r.email}`}>
                        <td>{r.full_name}</td>
                        <td>{r.email || '--'}</td>
                        <td>{r.title || '--'}</td>
                        <td>{r.linkedin_url ? 'Yes' : <span className="unknown">Missing</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {p.ignoredColumns.length > 0 && <p className="muted">Ignored columns: {p.ignoredColumns.join(', ')}</p>}
            </>
          ) : null}
        </div>

        <div className="handoff-actions">
          {file ? (
            <button type="button" className="hs-btn hs-btn-outline" onClick={() => setFile(null)}>
              Back
            </button>
          ) : (
            <button type="button" className="hs-btn hs-btn-outline" onClick={onClose}>
              Cancel
            </button>
          )}
          {p?.ok && p.rows.length > 0 && (
            <button
              type="button"
              className="hs-btn hs-btn-primary"
              onClick={() => {
                onImport(p.rows, file!.name, p.merged, p.alreadyRecorded);
                onClose();
              }}
            >
              Import {p.rows.length} contacts
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

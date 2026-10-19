import { useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { CalendarAdd01Icon, Cancel01Icon, CircleArrowUp02Icon, ClipboardPasteIcon, FileUploadIcon } from '@hugeicons/core-free-icons';
import { Button, Popover, Tooltip } from '@meir-labs/ui-kit';
import type { ListImport } from './importList';
import sample from '../data/demo/samples/wsc_product_meetup.csv?raw';
import sampleProfiles from '../data/demo/samples/wsc_product_meetup_profiles.csv?raw';

/** A Google Sheets link becomes its CSV export (the sheet must be viewable by anyone with the link); other links are fetched as they are. */
function csvUrl(link: string): string {
  const sheet = /docs\.google\.com\/spreadsheets\/d\/([\w-]+)/.exec(link);
  if (!sheet) return link;
  const gid = /[#&?]gid=(\d+)/.exec(link)?.[1];
  return `https://docs.google.com/spreadsheets/d/${sheet[1]}/gviz/tq?tqx=out:csv${gid ? `&gid=${gid}` : ''}`;
}

/** "Add conference": drop, choose or link one event's attendee list, and it joins the pool at once. */
export function NewConference({
  onAdd,
}: {
  /**
   * Checks the whole list and adds what is new (importList.ts). A problem (broken CSV, missing column, bad date)
   * adds nothing. `profiles` stands in for the LinkedIn lookup production runs on new attendees (the sample brings its own).
   */
  onAdd: (text: string, profiles?: string) => ListImport;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAuto, setShowAuto] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // Read by a link import when it finishes: the panel may have closed meanwhile (e.g. a sample import closed it).
  const openRef = useRef(false);

  const close = () => {
    openRef.current = false;
    setOpen(false);
    setError(null);
    setLink('');
    setShowAuto(false);
  };
  /** Adds the list; returns what to tell the user when nothing was added, or null when it was. */
  const apply = (text: string, profiles?: string): string | null => {
    const result = onAdd(text, profiles);
    if (!result.ok) {
      const more = result.problems.length - 4;
      return `Nothing was added. ${result.problems.slice(0, 4).join(' ')}${more > 0 ? ` …and ${more} more.` : ''}`;
    }
    // Adding the same list again is harmless: say so instead of closing as if something changed.
    if (result.added === 0) return 'Everyone on this list is already recorded for this event. Nothing changed.';
    return null;
  };
  const add = (text: string, profiles?: string) => {
    const problem = apply(text, profiles);
    if (problem) setError(problem);
    else close();
  };
  const fromLink = async (url: string) => {
    if (!/^https?:\/\//.test(url.trim())) return setError('Paste a full link, starting with https://');
    // The form itself can't be read without signing in; its answers live in the linked sheet.
    if (/docs\.google\.com\/forms\//.test(url)) return setError('That is the form itself. In the form, open Responses, then View in Sheets, and paste that link.');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(csvUrl(url.trim()));
      if (!res.ok) throw new Error(String(res.status));
      // The user asked for this list, so it is added even if the panel closed meanwhile; only an open panel
      // shows the outcome, so a closed one never comes back with a stale message.
      const problem = apply(await res.text());
      if (openRef.current) {
        if (problem) setError(problem);
        else close();
      }
    } catch {
      if (openRef.current) setError("Couldn't open that link. Check that anyone with the link can view it.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover
      placement="bottom-end"
      open={open}
      onOpenChange={(next) => {
        if (!next) return close();
        openRef.current = true;
        setOpen(true);
      }}
    >
      <Popover.Trigger className="ml-btn ml-btn-primary ml-btn-size-md">
        <span className="ml-btn-icon-slot" aria-hidden="true">
          <HugeiconsIcon icon={CalendarAdd01Icon} size={16} strokeWidth={1.75} />
        </span>
        <span className="ml-btn-label">Add conference</span>
      </Popover.Trigger>
      <Popover.Content className="ask new-conf" aria-label="Add a conference">
        <div className="ask-head">
          <span className="ask-to">Add a conference</span>
          <Button variant="icon" size="sm" aria-label="Close" onClick={close}>
            <HugeiconsIcon icon={Cancel01Icon} size={16} />
          </Button>
        </div>
        <input
          ref={input}
          type="file"
          accept=".csv,text/csv"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) add(await f.text());
            e.target.value = '';
          }}
        />
        {/* The whole zone takes a dropped file; its button stretches over it, and the sample chip sits above that. */}
        <div
          className="new-conf-drop"
          data-over={over || undefined}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={async (e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files[0];
            if (f) add(await f.text());
          }}
        >
          <HugeiconsIcon icon={FileUploadIcon} size={24} strokeWidth={1.5} aria-hidden="true" />
          <button type="button" className="new-conf-browse" onClick={() => input.current?.click()}>
            Choose attendee list
          </button>
          <span className="muted">Drop a CSV here or click to browse</span>
          <button type="button" className="new-conf-chip" onClick={() => add(sample, sampleProfiles)}>
            Use a sample list
          </button>
        </div>
        <label className="new-conf-link">
          <input
            type="url"
            value={link}
            placeholder="Or paste the form's responses sheet"
            aria-label="Attendee list link"
            disabled={busy}
            onChange={(e) => setLink(e.target.value)}
            onPaste={(e) => {
              const url = e.clipboardData.getData('text');
              if (url) {
                e.preventDefault();
                setLink(url);
                void fromLink(url);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void fromLink(link);
            }}
          />
          {/* Empty: paste from the clipboard. With a link typed in: send it. */}
          {link.trim() ? (
            <Tooltip content="Add list">
              <button type="button" className="new-conf-paste" aria-label="Add list from link" disabled={busy} onClick={() => void fromLink(link)}>
                <HugeiconsIcon icon={CircleArrowUp02Icon} size={18} strokeWidth={1.75} />
              </button>
            </Tooltip>
          ) : (
            <Tooltip content="Paste">
              <button
                type="button"
                className="new-conf-paste"
                aria-label="Paste link"
                disabled={busy}
                onClick={async () => {
                  try {
                    const url = (await navigator.clipboard.readText()).trim();
                    if (!url) return setError('The clipboard is empty.');
                    setLink(url);
                    void fromLink(url);
                  } catch {
                    setError('Paste with ⌘V instead; the browser blocked clipboard access.');
                  }
                }}
              >
                <HugeiconsIcon icon={ClipboardPasteIcon} size={16} strokeWidth={1.75} />
              </button>
            </Tooltip>
          )}
        </label>
        {/* Covers every route in: file, sample and link. */}
        {/* Quiet pointer to the automatic route: forms in the shared folder sync on their own. */}
        <button type="button" className="new-conf-auto" aria-expanded={showAuto} onClick={() => setShowAuto((v) => !v)}>
          How to connect this automatically
        </button>
        {showAuto && (
          <p className="new-conf-auto-text">
            Keep each event's sign-up form in the shared Google Drive folder "Event sign-ups" and connect Google Forms from the
            Connect accounts menu. New sign-ups then arrive on their own, with no file to add. Other forms are ignored.
          </p>
        )}
        {(busy || error) && (
          <p className="ask-status muted" role="status">
            {busy ? 'Opening the link…' : error}
          </p>
        )}
      </Popover.Content>
    </Popover>
  );
}

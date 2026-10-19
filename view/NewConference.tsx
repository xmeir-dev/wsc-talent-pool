import { useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { CalendarAdd01Icon, Cancel01Icon, FileUploadIcon, Link01Icon } from '@hugeicons/core-free-icons';
import { Button, Popover } from '@meir-labs/ui-kit';
import { parseCsv } from '../pipeline';
import sample from '../data/samples/wsc_product_meetup.csv?raw';

const NEEDED = ['full_name', 'email', 'conference_name', 'conference_date'];

/** Checks an attendee list (the sign-up form's export, same columns as conference_attendees.csv); returns its conference names or a problem. */
function check(text: string, existing: string[]): string[] | string {
  const { header, records } = parseCsv(text);
  const missing = NEEDED.filter((c) => !header.includes(c));
  if (missing.length) return `This list is missing ${missing.join(', ')}. Use the sign-up form's export.`;
  if (!records.length) return 'This list has no attendees.';
  const names = [...new Set(records.map((r) => r.conference_name!.trim()).filter(Boolean))];
  const already = names.filter((n) => existing.includes(n));
  if (already.length) return `${already.join(', ')} is already in the pool.`;
  return names;
}

/** A Google Sheets link becomes its CSV export (the sheet must be viewable by anyone with the link); other links are fetched as they are. */
function csvUrl(link: string): string {
  const sheet = /docs\.google\.com\/spreadsheets\/d\/([\w-]+)/.exec(link);
  if (!sheet) return link;
  const gid = /[#&?]gid=(\d+)/.exec(link)?.[1];
  return `https://docs.google.com/spreadsheets/d/${sheet[1]}/gviz/tq?tqx=out:csv${gid ? `&gid=${gid}` : ''}`;
}

/** "Add conference": drop, choose or link one event's attendee list, and it joins the pool at once. */
export function NewConference({
  existing,
  onAdd,
}: {
  existing: string[];
  /** Adds the list; returns problems if the merged data no longer reads. */
  onAdd: (text: string, names: string[]) => string[] | null;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const close = () => {
    setOpen(false);
    setError(null);
    setLink('');
  };
  const add = (text: string) => {
    const names = check(text, existing);
    if (typeof names === 'string') return setError(names);
    const problems = onAdd(text, names);
    if (problems) setError(problems.join(' '));
    else close();
  };
  const fromLink = async (url: string) => {
    if (!/^https?:\/\//.test(url.trim())) return setError('Paste a full link, starting with https://');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(csvUrl(url.trim()));
      if (!res.ok) throw new Error(String(res.status));
      add(await res.text());
    } catch {
      setError("Couldn't open that link. Check that anyone with the link can view it.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Popover placement="bottom-end" open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
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
        <button
          type="button"
          className="new-conf-drop"
          data-over={over || undefined}
          onClick={() => input.current?.click()}
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
          <span>Choose attendee list</span>
          <span className="muted">Drop a CSV here or click to browse</span>
        </button>
        <label className="new-conf-link">
          <HugeiconsIcon icon={Link01Icon} size={16} strokeWidth={1.75} aria-hidden="true" />
          <input
            type="url"
            value={link}
            placeholder="Or paste a Google Sheets link"
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
        </label>
        <div className="new-conf-foot">
          <button type="button" className="new-conf-chip" onClick={() => add(sample)}>
            Use a sample list
          </button>
          <span className="ask-status muted" role="status">
            {busy ? 'Opening the link…' : error}
          </span>
        </div>
      </Popover.Content>
    </Popover>
  );
}

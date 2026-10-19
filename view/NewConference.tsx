import { useRef, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Add01Icon, Cancel01Icon, File01Icon } from '@hugeicons/core-free-icons';
import { Button, Popover } from '@meir-labs/ui-kit';
import { parseCsv } from '../pipeline';
import sample from '../data/samples/wsc_product_meetup.csv?raw';
import { shortDate } from './format';

const NEEDED = ['full_name', 'email', 'conference_name', 'conference_date'];

interface Preview {
  file: string;
  text: string;
  names: string[];
  date: string;
  people: number;
  returning: number;
}

/** Reads an attendee list (the sign-up form's export, same columns as conference_attendees.csv) and says what it holds. */
function preview(file: string, text: string, known: Set<string>, existing: string[]): Preview | string {
  const { header, records } = parseCsv(text);
  const missing = NEEDED.filter((c) => !header.includes(c));
  if (missing.length) return `This file is missing ${missing.join(', ')}. Use the sign-up form's export.`;
  if (!records.length) return 'This file has no attendees.';
  const names = [...new Set(records.map((r) => r.conference_name!.trim()).filter(Boolean))];
  const already = names.filter((n) => existing.includes(n));
  if (already.length) return `${already.join(', ')} is already in the pool.`;
  const returning = records.filter((r) => known.has(r.email!.trim().toLowerCase())).length;
  return { file, text, names, date: records[0]!.conference_date!, people: records.length, returning };
}

/** "Add conference": add one event's attendee list to the pool. */
export function NewConference({
  known,
  existing,
  onAdd,
}: {
  /** Emails already in the pool, to count returning attendees. */
  known: Set<string>;
  existing: string[];
  /** Adds the list; returns problems if the merged data no longer reads. */
  onAdd: (text: string, names: string[]) => string[] | null;
}) {
  const [open, setOpen] = useState(false);
  const [got, setGot] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const read = (file: string, text: string) => {
    const p = preview(file, text, known, existing);
    if (typeof p === 'string') {
      setGot(null);
      setError(p);
    } else {
      setGot(p);
      setError(null);
    }
  };
  const close = () => {
    setOpen(false);
    setGot(null);
    setError(null);
  };

  return (
    <Popover placement="bottom-end" open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <Popover.Trigger className="ml-btn ml-btn-secondary ml-btn-size-md">
        <span className="ml-btn-icon-slot" aria-hidden="true">
          <HugeiconsIcon icon={Add01Icon} size={16} strokeWidth={1.75} />
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
            if (f) read(f.name, await f.text());
            e.target.value = '';
          }}
        />
        {got ? (
          <div className="new-conf-file">
            <HugeiconsIcon icon={File01Icon} size={20} strokeWidth={1.5} aria-hidden="true" />
            <span className="new-conf-what">
              <span>{got.names.join(', ')}</span>
              <span className="muted">
                {shortDate(got.date)} · {got.people} {got.people === 1 ? 'person' : 'people'}
                {got.returning > 0 && `, ${got.returning} already in the pool`}
              </span>
            </span>
            <button type="button" className="new-conf-change" onClick={() => input.current?.click()}>
              Change
            </button>
          </div>
        ) : (
          <div className="new-conf-pick">
            <Button variant="secondary" size="sm" onClick={() => input.current?.click()}>
              Choose attendee list
            </Button>
            <button type="button" className="new-conf-change" onClick={() => read('wsc_product_meetup.csv', sample)}>
              Use the sample list
            </button>
          </div>
        )}
        <div className="ask-actions">
          <Button
            size="sm"
            variant="primary"
            disabled={!got}
            onClick={() => {
              if (!got) return;
              const problems = onAdd(got.text, got.names);
              if (problems) setError(problems.join(' '));
              else close();
            }}
          >
            Add to pool
          </Button>
          <span className="ask-status muted" role="status">
            {error}
          </span>
        </div>
      </Popover.Content>
    </Popover>
  );
}

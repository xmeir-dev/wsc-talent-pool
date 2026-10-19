import { useEffect, useState, type ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, ArrowRight01Icon, Cancel01Icon, HelpCircleIcon, Refresh01Icon } from '@hugeicons/core-free-icons';
import { Button, Popover, Tooltip } from '@meir-labs/ui-kit';
import comeetIcon from './assets/comeet.png';
import googleFormsIcon from './assets/google-forms.png';
import hubspotIcon from './assets/hubspot.png';

const MIN = 60_000;

const ext = (href: string, text: string) => (
  <a href={href} target="_blank" rel="noreferrer">
    {text}
  </a>
);

/** Each source and how WSC would connect it for real (checked against each tool's docs, 2026-10-19). Connecting here is a demo. */
/** What Connect asks for. `secret` fields are masked; nothing typed here is stored or sent (demo). */
interface Field {
  id: string;
  label: string;
  placeholder: string;
  secret?: boolean;
  optional?: boolean;
}

const SOURCES: { key: string; name: string; icon: string; home: string; steps: ReactNode[]; fields: Field[]; google?: boolean }[] = [
  {
    key: 'hubspot',
    name: 'HubSpot',
    icon: hubspotIcon,
    home: 'https://app.hubspot.com/',
    steps: [
      <>Sign in to HubSpot as a Super Admin (or a user with Developer tools access).</>,
      <>
        Go to <b>Settings → Integrations → Service Keys</b> and click <b>Create a service key</b> (
        {ext('https://developers.hubspot.com/blog/hubspot-service-keys-the-right-api-credential-for-data-integrations', 'HubSpot guide')}).
      </>,
      <>
        Name it "WSC talent pool" and add these scopes: <code>crm.objects.contacts.read</code>, <code>crm.objects.contacts.write</code>,{' '}
        <code>crm.schemas.contacts.write</code> (for the <code>talent_</code> properties), <code>crm.lists.read</code> and{' '}
        <code>crm.lists.write</code>.
      </>,
      <>Click Create, copy the key, then click Connect here and paste it.</>,
      <>Contacts start syncing; new conference contacts are assessed as they arrive.</>,
    ],
    fields: [{ id: 'key', label: 'Service key', placeholder: 'pat-eu1-…', secret: true }],
  },
  {
    key: 'comeet',
    name: 'Comeet',
    icon: comeetIcon,
    home: 'https://app.comeet.co/app/',
    steps: [
      <>
        In Comeet, open {ext('https://app.comeet.co/app/company/settings/careers', 'Company settings → Careers website')} and copy the company{' '}
        <b>UID</b> and <b>Token</b>. These read the open jobs ({ext('https://developers.comeet.com/reference/careers-api-overview', 'Careers API')}).
      </>,
      <>
        Email Comeet support and ask them to send{' '}
        {ext('https://developers.comeet.com/reference/position-updates', 'position updates')} to this tool's address, so new and changed jobs
        arrive on their own.
      </>,
      <>
        Ask support to turn on the {ext('https://developers.comeet.com/reference/retrieve-a-candidate', 'Recruiting API')} (included in
        Enterprise, a paid add-on on Pro and Growth). It shows who is already a candidate and lets <b>Invite to job</b> add people to a
        position.
      </>,
      <>Click Connect here and paste the UID, the Token and the Recruiting API key.</>,
    ],
    fields: [
      { id: 'uid', label: 'Company UID', placeholder: 'e.g. 30.005' },
      { id: 'token', label: 'Token', placeholder: 'From Careers website settings', secret: true },
      { id: 'api', label: 'Recruiting API key', placeholder: 'From Comeet support', secret: true, optional: true },
    ],
  },
  {
    key: 'forms',
    name: 'Google Forms',
    icon: googleFormsIcon,
    home: 'https://drive.google.com/',
    steps: [
      <>
        In Google Drive, create a shared folder called "Event sign-ups" (
        {ext('https://support.google.com/drive/answer/2375091', 'how to create a folder')}).
      </>,
      <>Move each event's sign-up form into it, or keep one shared form there with the event as a dropdown question.</>,
      <>Click Connect here and sign in with the Google account that owns the folder. Allow read-only access to its forms and responses.</>,
      <>
        Every form in the folder is watched for new responses (
        {ext('https://developers.google.com/workspace/forms/api/guides/push-notifications', 'Google Forms API')}); new sign-ups arrive within
        minutes. Forms outside the folder are ignored.
      </>,
    ],
    google: true,
    fields: [{ id: 'folder', label: 'Event sign-ups folder', placeholder: 'https://drive.google.com/drive/folders/…' }],
  },
];

function relative(ms: number): string {
  const m = Math.floor(ms / MIN);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h === 1 ? '1 hr ago' : `${h} hr ago`;
}

/** Header sync status: each source starts not connected; the panel connects them and syncs. */
export function SyncStatus() {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  // Last sync per connected source; missing means not connected.
  const [last, setLast] = useState<Record<string, number>>({});
  const [connecting, setConnecting] = useState<string | null>(null);
  // One panel under the cards at a time: a source's how-to steps, or its Connect form.
  const [panel, setPanel] = useState<{ key: string; kind: 'steps' | 'form' } | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [googleSignedIn, setGoogleSignedIn] = useState(false);
  // The Event sign-ups folder entered on Connect, so the Google Forms name opens it.
  const [folder, setFolder] = useState('');
  const [syncing, setSyncing] = useState(false);
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const times = Object.values(last);
  const connected = times.length > 0;

  const connect = (key: string) => {
    setConnecting(key);
    window.setTimeout(() => {
      const t = Date.now();
      setLast((l) => ({ ...l, [key]: t }));
      setNow(t);
      setConnecting(null);
      setPanel(null);
      if (key === 'forms' && /^https?:\/\//.test(values.folder?.trim() ?? '')) setFolder(values.folder!.trim());
      setValues({});
    }, 1100);
  };
  const syncNow = () => {
    setSyncing(true);
    window.setTimeout(() => {
      const t = Date.now();
      setLast((l) => Object.fromEntries(Object.keys(l).map((k) => [k, t])));
      setNow(t);
      setSyncing(false);
    }, 1400);
  };
  const shown = panel && SOURCES.find((s) => s.key === panel.key);
  const toggle = (key: string, kind: 'steps' | 'form') => {
    setPanel((p) => (p?.key === key && p.kind === kind ? null : { key, kind }));
    setValues({});
  };
  const ready =
    !!shown && shown.fields.every((f) => f.optional || values[f.id]?.trim()) && (!shown.google || googleSignedIn);

  return (
    <Popover placement="bottom-end" open={open} onOpenChange={setOpen}>
      <Popover.Trigger className={`sync-trigger${connected ? '' : ' is-off'}`}>
        {syncing ? 'Syncing…' : connected ? `Synced ${relative(now - Math.max(...times))}` : 'Connect accounts'}
        <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.75} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Content className="sync-pop" aria-label="Connected sources">
        <div className="sync-cards">
          {SOURCES.map((s) => {
            const at = last[s.key];
            return (
              <section key={s.key} className="sync-card" aria-label={s.name}>
                <div className="sync-card-top">
                  <img src={s.icon} alt="" width={20} height={20} />
                  {/* Not connected: how to connect it. Connected: disconnect it. */}
                  {at === undefined ? (
                    <Tooltip content="How to connect">
                      <button
                        type="button"
                        className="sync-how"
                        aria-label={`How to connect ${s.name}`}
                        aria-expanded={panel?.key === s.key && panel.kind === 'steps'}
                        onClick={() => toggle(s.key, 'steps')}
                      >
                        <HugeiconsIcon icon={HelpCircleIcon} size={16} strokeWidth={1.75} />
                      </button>
                    </Tooltip>
                  ) : (
                    <Tooltip content="Disconnect">
                      <button
                        type="button"
                        className="sync-how"
                        aria-label={`Disconnect ${s.name}`}
                        disabled={syncing}
                        onClick={() =>
                          setLast((l) => {
                            const { [s.key]: _gone, ...rest } = l;
                            return rest;
                          })
                        }
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={16} strokeWidth={1.75} />
                      </button>
                    </Tooltip>
                  )}
                </div>
                {/* The name opens the tool itself; a chevron slides in on hover. */}
                <a className="sync-name" href={s.key === 'forms' && folder ? folder : s.home} target="_blank" rel="noreferrer">
                  {s.name}
                  <HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={2} aria-hidden="true" />
                </a>
                <span className="sync-when">
                  {at === undefined ? (
                    'Not connected'
                  ) : syncing ? (
                    <HugeiconsIcon icon={Refresh01Icon} size={14} strokeWidth={1.75} className="sync-spin" aria-label="Syncing" />
                  ) : (
                    `Synced ${relative(now - at)}`
                  )}
                </span>
                {at === undefined && (
                  <Button
                    size="sm"
                    variant="secondary"
                    aria-expanded={panel?.key === s.key && panel.kind === 'form'}
                    disabled={connecting !== null}
                    onClick={() => toggle(s.key, 'form')}
                  >
                    Connect
                  </Button>
                )}
              </section>
            );
          })}
        </div>
        {shown && panel?.kind === 'form' && (
          <form
            className="sync-steps sync-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) connect(shown.key);
            }}
          >
            <p className="sync-steps-title">Connect {shown.name}</p>
            {/* Connect opens the how-to too, so the steps sit right above the fields they fill in. */}
            <ol>
              {shown.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
            {shown.google && (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="sync-google"
                disabled={googleSignedIn}
                onClick={() => setGoogleSignedIn(true)}
                leftIcon={<img src={googleFormsIcon} alt="" width={16} height={16} />}
              >
                {googleSignedIn ? 'Signed in with Google' : 'Sign in with Google'}
              </Button>
            )}
            {shown.fields.map((f) => (
              <label key={f.id} className="sync-field">
                <span>
                  {f.label}
                  {f.optional && <span className="muted"> (optional)</span>}
                </span>
                <input
                  type={f.secret ? 'password' : 'text'}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={f.placeholder}
                  value={values[f.id] ?? ''}
                  onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
                />
              </label>
            ))}
            <div className="sync-form-actions">
              <Button type="submit" size="sm" variant="primary" disabled={!ready || connecting !== null}>
                {connecting === shown.key ? 'Connecting…' : `Connect ${shown.name}`}
              </Button>
            </div>
          </form>
        )}
        {shown && panel?.kind === 'steps' && (
          <div className="sync-steps">
            <p className="sync-steps-title">Connect {shown.name}</p>
            <ol>
              {shown.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>
        )}
        <Button
          variant="secondary"
          className="sync-now"
          disabled={!connected || syncing}
          onClick={syncNow}
          leftIcon={<HugeiconsIcon icon={Refresh01Icon} size={16} strokeWidth={1.75} className={syncing ? 'sync-spin' : undefined} />}
        >
          {syncing ? 'Syncing…' : 'Sync now'}
        </Button>
      </Popover.Content>
    </Popover>
  );
}

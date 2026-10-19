import { useEffect, useState, type ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { ArrowDown01Icon, ArrowRight01Icon, Cancel01Icon, HelpCircleIcon, Refresh01Icon } from '@hugeicons/core-free-icons';
import { Button, Popover, Tooltip } from '@meir-labs/ui-kit';
import comeetIcon from './assets/comeet.png';
import { DemoBadge } from './DemoBadge';
import googleFormsIcon from './assets/google-forms.png';
import hubspotIcon from './assets/hubspot.png';
import slackIcon from './assets/slack.png';

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
      <>Sign in to HubSpot as a Super Admin, or a user with Developer tools access.</>,
      <>
        Go to <b>Settings → Integrations → Service Keys</b> (in some accounts it sits under <b>Development</b> in the left menu) and click{' '}
        <b>Create a service key</b> (
        {ext('https://developers.hubspot.com/blog/hubspot-service-keys-the-right-api-credential-for-data-integrations', 'HubSpot guide')}).
      </>,
      <>
        Name it "WSC talent pool" and add these scopes ({ext('https://developers.hubspot.com/docs/apps/developer-platform/build-apps/authentication/scopes', 'scope list')}
        ): <code>crm.objects.contacts.read</code>, <code>crm.objects.contacts.write</code>, <code>crm.schemas.contacts.write</code> (to create the{' '}
        <code>talent_</code> properties), <code>crm.lists.read</code> and <code>crm.lists.write</code>.
      </>,
      <>Click Create, copy the key straight away, then paste it here.</>,
      <>
        Service keys don't receive webhooks, so the tool checks HubSpot for new and changed contacts every few minutes and assesses them.
      </>,
    ],
    fields: [{ id: 'key', label: 'Service key', placeholder: 'Paste the key from HubSpot', secret: true }],
  },
  {
    key: 'comeet',
    name: 'Comeet',
    icon: comeetIcon,
    home: 'https://app.comeet.co/app/',
    steps: [
      <>
        Request API access with Comeet's {ext('https://forms.gle/2GhnJHovgH7vRQVS8', 'API access form')}. The Recruiting API is part of the
        Enterprise plan ({ext('https://developers.comeet.com/reference/getting-started-comeet-customers', 'Comeet guide')}).
      </>,
      <>Comeet support replies with your <b>secret</b>.</>,
      <>
        A Comeet Admin or Owner opens {ext('https://app.comeet.co/app/index.html#/company/settings/integrations', 'Company settings → Integrations')}{' '}
        and copies the <b>API key</b>.
      </>,
      <>
        Ask support to send {ext('https://developers.comeet.com/reference/position-updates', 'position updates')} to this tool's address, so new
        and changed jobs arrive on their own. Candidate statuses are read from the API every few minutes.
      </>,
      <>Paste the API key and the secret here.</>,
    ],
    fields: [
      { id: 'key', label: 'API key', placeholder: 'From Settings → Integrations', secret: true },
      { id: 'secret', label: 'Secret', placeholder: 'From Comeet support', secret: true },
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
      <>
        Click <b>Sign in with Google</b> below with an account that can open the folder, and allow read-only access to Drive and to form
        responses. If WSC's Google Workspace limits outside apps, an admin allows this one first.
      </>,
      <>Paste the folder's link.</>,
      <>
        The tool watches each form in the folder for new responses (
        {ext('https://developers.google.com/workspace/forms/api/guides/push-notifications', 'Google Forms API')}) and renews the watch weekly;
        new sign-ups arrive within minutes. Forms outside the folder are ignored.
      </>,
    ],
    google: true,
    fields: [{ id: 'folder', label: 'Event sign-ups folder link', placeholder: 'https://drive.google.com/drive/folders/…' }],
  },
  {
    key: 'slack',
    name: 'Slack',
    icon: slackIcon,
    home: 'https://app.slack.com/',
    steps: [
      <>
        {ext('https://api.slack.com/apps?new_app=1', 'Create a Slack app')} from scratch, name it "WSC talent pool" and pick the WSC workspace (
        {ext('https://docs.slack.dev/app-management/quickstart-app-settings', 'Slack guide')}).
      </>,
      <>
        Under <b>OAuth &amp; Permissions → Bot Token Scopes</b>, add <code>chat:write</code>, <code>im:write</code>, <code>users:read</code> and{' '}
        <code>users:read.email</code> (to find each colleague by their work email).
      </>,
      <>Click <b>Install to Workspace</b> and allow it; a Slack admin may need to approve the app.</>,
      <>
        Back on <b>OAuth &amp; Permissions</b>, copy the <b>Bot User OAuth Token</b> (it starts with <code>xoxb-</code>) and paste it here.
      </>,
      <>Ask messages to WSC colleagues then go out as direct messages from the app, instead of being copied by hand.</>,
    ],
    fields: [{ id: 'token', label: 'Bot User OAuth Token', placeholder: 'xoxb-…', secret: true }],
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
  // The source whose Connect panel (how-to steps + fields) is open under the cards; ? and Connect both open it.
  const [panel, setPanel] = useState<string | null>(null);
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
  const shown = panel && SOURCES.find((s) => s.key === panel);
  const toggle = (key: string) => {
    setPanel((p) => (p === key ? null : key));
    setValues({});
  };
  const ready =
    !!shown && shown.fields.every((f) => f.optional || values[f.id]?.trim()) && (!shown.google || googleSignedIn);

  return (
    <Popover placement="bottom-end" open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="sync-trigger">
        {syncing ? 'Syncing…' : connected ? `Synced ${relative(now - Math.max(...times))}` : 'Connect accounts'}
        <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.75} aria-hidden="true" />
      </Popover.Trigger>
      <Popover.Content className="sync-pop" aria-label="Your accounts">
        {/* Nothing here connects for real: the Demo sticker says so on screen, not only in the docs. */}
        <div className="sync-head">
          <span>Your accounts</span>
          <DemoBadge />
        </div>
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
                        aria-expanded={panel === s.key}
                        onClick={() => toggle(s.key)}
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
                    aria-expanded={panel === s.key}
                    disabled={connecting !== null}
                    onClick={() => toggle(s.key)}
                  >
                    Connect
                  </Button>
                )}
              </section>
            );
          })}
        </div>
        {shown && (
          <form
            className="sync-steps sync-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (ready) connect(shown.key);
            }}
          >
            <p className="sync-steps-title">Connect {shown.name}</p>
            {/* The how-to steps sit right above the fields they fill in. */}
            <ol>
              {shown.steps.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
            {/* The fields sit in their own box under the steps. */}
            <div className="sync-fields">
              <p className="sync-demo-hint">Demo: nothing is saved or sent, so don't paste real keys.</p>
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
            </div>
          </form>
        )}
        <Button
          variant="primary"
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

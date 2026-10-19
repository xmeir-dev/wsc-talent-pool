# Design

**Help a recruiter decide whom to approach when a role opens, using conference contacts that would otherwise be forgotten.** The pipeline turns a mixed crowd of attendees into an explained shortlist for one role, with visible gaps and the WSC employees who may know each person.

## Why this approach

The core pain is signal-to-noise: too many contacts to screen and too little help deciding whom to approach first. Adding more candidates does not fix that; filtering the existing pool does.

- **Deterministic rules, not a black box.** Every result comes from written rules ([How candidates are ranked](scoring.md)) and every row says why in words: which skills matched, what is missing, what to check next. A hiring manager who disagrees with a rule can point to it, and it changes in one place.
- **Three outcomes, not a cut-off.** Shortlist, needs review, or not recommended for this role. Missing information sends someone to review, never to rejection, and nobody is deleted: a person who does not fit one role stays in the pool for the next.
- **Relevance and job fit are separate.** Conference relevance sorts the pool by what people actually do, not by which event they attended.
- **Connections are a reference lead, not a score.** They only break exact ties, so they can never lift a weaker candidate over a stronger one.
- **AI reads, rules decide.** For attendees with no recruiter note, the view shows a one-line summary written by an AI model (Claude) from the LinkedIn fields, labelled "AI summary" and checked against the files (`data/ai_summaries.json`). It helps a recruiter skim; it never changes a result.
- **One shared engine.** The same TypeScript module runs the CLI, the recruiter view and the integration demo, so every screen and the HubSpot-ready CSV agree. The [schema and flow](schema-and-flow.md) defines each step and column; the [assumptions](assumptions.md) list what was assumed.

## Production version

**Recruiters stay in the tools they use.** Contacts and recommendations live in HubSpot; selected people are handed into Comeet for a specific role. No new dashboard. The [integration demo](../integration-demo/README.md) shows the experience the morning after a conference.

| Today (CSV) | Production source |
|---|---|
| `conference_attendees.csv` | **The organizer's attendee list, arriving without uploads.** For events WSC hosts, one shared sign-up form (Google Forms, which WSC uses) sends each attendee straight into HubSpot, replacing today's spreadsheet per event; only forms in a shared Drive folder, "Event sign-ups", are synced ([which forms](assumptions.md#how-conference-lists-arrive)). Outside organizers' lists are sent to a dedicated email address or shared folder, or synced by the event platform's HubSpot integration ([options](assumptions.md#how-conference-lists-arrive)). HubSpot's Import button is the fallback. Repeat attendees are matched on email and get the new event on their existing contact. |
| `linkedin_profiles.csv` | **Enrichment.** LinkedIn's API offers no general profile lookup to ordinary companies, so production uses (1) what the attendee list or the candidate provides, (2) a licensed enrichment vendor whose terms permit recruiting use, and (3) a recruiter opening the profile for anyone in "needs review". Which of these WSC can use needs confirming with legal. |
| `wsc_employees.csv` and connections | **Employee roster** from the HR system. Mutual connections are not available through LinkedIn's API, so the first version relies on shared employers in work history ("possible references", already implemented) and employees confirming whom they know. |
| `job_openings.csv` | **Comeet.** Comeet's position webhook (created, updated, deleted) starts an assessment for that role. Comeet documents no webhook for candidate status, so a scheduled sync writes each person's Comeet status to HubSpot, flagging anyone already in process or recently rejected ([stance](assumptions.md#people-already-in-comeet)). |
| `output/candidates_<job>.csv` | **HubSpot.** Results are written to custom `talent_` contact properties, matched on email. One self-updating list per open role holds its shortlist, and a workflow sends the recruiter an in-app notification when results change. |

**Triggers:** new or changed HubSpot contacts (checked every few minutes: the Service Key used for this kind of integration cannot receive webhooks; a full HubSpot app can, if WSC wants instant scoring), a new form response in the "Event sign-ups" folder, a new or changed Comeet role, a nightly check as a safety net, or a recruiter on demand (**Sync now** in the view's header).

**Platform requirements, to confirm with WSC.** Comeet's Recruiting API and custom candidate fields need **Comeet Enterprise**. The interactive contact card with **Add to Comeet** is a HubSpot app card, which for an in-house app needs **HubSpot Enterprise**; workflows need Professional or higher. Without HubSpot Enterprise, properties, lists, import and notifications still work and the handoff becomes a list action. Connecting each tool: HubSpot uses a Service Key (Settings → Integrations → Service Keys, created by a Super Admin, with contact, contact-schema and list scopes); Comeet uses a Recruiting API key (requested through Comeet's API access form, copied by an Admin from Settings → Integrations) plus a secret from Comeet support, and support points position updates at the tool; Google Forms needs a one-time Google sign-in that allows reading the "Event sign-ups" folder and its responses; and Slack needs a small workspace app (bot token with `chat:write`, `im:write`, `users:read`, `users:read.email`) so reference requests go to colleagues as direct messages. The view's sync panel lists these steps. All three are joined by a small integration service (for example N8N or Workato) that runs the scoring.

## At scale

Thousands of contacts are little computing; the hard parts are identity and history.

- **One person, one record.** Match by LinkedIn URL, then email; never merge on name alone. Uncertain matches go to a recruiter.
- **Incremental re-assessment.** When a contact, profile or role changes, reassess only the affected people and roles.
- **Keep history per job.** A HubSpot property holds one current value, so every assessment (person, role, rule version, date, result) is also stored in a small database; earlier decisions survive and rule changes can be compared.
- **Respect rate limits.** Batch writes to HubSpot and Comeet and retry safely, so a large import cannot create duplicates.

**Privacy:** notice and a lawful basis at capture, consented or licensed sources only (no LinkedIn scraping), a retention period, deletion across HubSpot, the assessment store and Comeet, and logged access for the recruiting team only. Details in [Assumptions](assumptions.md#privacy).

## Measuring success

Contacts followed up, time from a role opening to a qualified shortlist, recruiter screening time per role, and hires from conferences and referrals. The tool narrows the list today; it has not yet been shown to improve any of these.

## With more time

1. **Check the rules with hiring managers** against past hires, and tune the 60% required-skills bar, minimum years and skill equivalents.
2. **Connect the real tools:** a HubSpot test account and a Comeet sandbox, to prove the handoff and status sync the demo simulates.
3. **Record recruiter decisions** (approached, not interested, hired) to learn which recommendations work.
4. **Future idea, beyond today's display-only summaries: an AI step for free text.** A language model could read recruiter notes and full work history to suggest evidence the skill list misses. Its suggestions would be labelled and confirmed by a recruiter before affecting any outcome; the deterministic rules stay the decision-maker.
5. **From conference pool to talent hub.** Conferences are one source. The same pool, matching and reference leads work for any contact WSC holds: people from tech-company layoffs (the recruiter's own idea from the call; a layoff alert alone covers only part of the need, so laid-off people would flow into the pool and be matched like attendees), past applicants, referrals and LinkedIn sourcing. Each becomes another source on the sync panel.

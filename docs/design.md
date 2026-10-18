# Design

**Help a recruiter decide whom to approach when a role opens, using conference contacts that would otherwise be forgotten.** The pipeline turns a mixed crowd of attendees into an explained shortlist for one role, with visible gaps and the WSC employees who may know each person.

## Why this approach

The core pain is signal-to-noise: too many contacts to screen and too little help deciding whom to approach first. Adding more candidates does not fix that; filtering the existing pool does.

- **Deterministic rules, not a black box.** Every result comes from written rules ([How candidates are ranked](scoring.md)) and every row says why in words: which skills matched, what is missing, what to check next. A hiring manager who disagrees with a rule can point to it, and it changes in one place.
- **Three outcomes, not a cut-off.** Shortlist, needs review, or not recommended for this role. Missing information sends someone to review, never to rejection, and nobody is deleted: a person who does not fit one role stays in the pool for the next.
- **Relevance and job fit are separate.** Conference relevance sorts the pool by what people actually do, not by which event they attended. Job fit is assessed against the selected role.
- **Connections are a reference lead, not a score.** They only break exact ties, so they can never lift a weaker candidate over a stronger one.
- **One shared engine.** The same TypeScript module runs the CLI and the recruiter view, so the screen and the HubSpot-ready CSV always agree. The [schema and flow](schema-and-flow.md) defines each step and column; the [assumptions](assumptions.md) list what was assumed.

## Production version

**Recruiter experience:** review the talent pool and recommendations inside HubSpot, then hand selected people into Comeet for a specific role. Prefer existing lists, contact records and supported embedded panels; introduce a separate dashboard only for an essential task those tools cannot support well. The [integration demo plan](native-integration-demo-plan.md) illustrates this future workflow and distinguishes simulated screens from verified integrations.

The CSVs stand in for four systems. In production:

| Today (CSV) | Production source |
|---|---|
| `conference_attendees.csv` | **Capture at the event.** Each attendee lands in HubSpot as a contact, tagged with the event, date and recruiter notes, with no spreadsheet per event: a HubSpot form opened from a QR code or tablet at the booth, a badge or business-card scan, or the event platform's HubSpot integration pushing the attendee list. A spreadsheet that still comes back goes through HubSpot's import. The form asks for the LinkedIn URL, current role and consent to be contacted about jobs. A repeat attendee is matched on email and gets the new event on their existing contact. |
| `linkedin_profiles.csv` | **Enrichment.** LinkedIn's API does not offer general profile lookup to arbitrary companies; its sign-in gives only basic identity, and richer access is limited to approved partner programs. So production relies on (1) data the candidate provides at capture (role, skills, CV or LinkedIn URL), (2) a licensed enrichment vendor whose data use is permitted, and (3) a recruiter opening the LinkedIn profile for anyone in "needs review". Which of these WSC can use needs confirming with legal and LinkedIn. |
| `wsc_employees.csv` and connections | **Employee roster** from the HR system. Mutual connections are not available through LinkedIn's API, so the first version relies on shared employers in work history (already implemented as "possible references") and employees confirming whom they know. |
| `job_openings.csv` | **Comeet.** Comeet's position webhook (created, updated, deleted) starts an assessment for that role. Comeet also supplies whether a person has already applied or was previously rejected, so the shortlist can flag them ([stance in Assumptions](assumptions.md#people-already-in-comeet)). Comeet documents no webhook for candidate status changes, so a scheduled sync reads candidate status and writes it to a HubSpot "Comeet status" property. |
| `output/candidates_<job>.csv` | **HubSpot API.** Results are written back through HubSpot's contacts API into custom `talent_` properties, matched on email, so recruiters see them in the tool they already use. One self-updating list per open role holds its shortlist, and a HubSpot workflow sends the recruiter an in-app notification when results change. |

**Who triggers it:** a new contact in HubSpot (HubSpot's contact-created webhook, so people are scored as they arrive), a new or changed role in Comeet, or a recruiter on demand.

**Platform requirements, to confirm with WSC:**

- **Comeet Enterprise** for API access (requested through Comeet support, with a sandbox) and custom candidate fields.
- **HubSpot Enterprise** for an in-house app card on the contact record. Without it, the `talent_` properties, per-role lists and import still work; only the interactive card and its Add to Comeet button are lost, and the handoff moves to a list action or a workflow.
- **HubSpot Professional or higher** for workflows (the in-app notification).
- **A small integration service** (for example in N8N or Workato) that runs the scoring and talks to both tools, plus an approved enrichment source.

## At scale

Hundreds of conferences and thousands of contacts are a small amount of computing; the hard parts are identity and history.

- **One person, one record.** Match by LinkedIn URL, then email; never merge on name alone. A returning attendee adds an event to their record instead of creating a duplicate. Uncertain matches go to a recruiter.
- **Incremental re-assessment.** When a profile, contact or role changes, reassess only the affected people and roles, not the whole pool.
- **Keep history per job.** HubSpot contact properties hold one current view and are overwritten by the next role. Store every assessment (person, role, rule version, date, result) in a small database alongside HubSpot, so earlier decisions are not lost and rule changes can be compared.
- **Respect rate limits.** Batch API writes to HubSpot and Comeet and retry safely, so a large import cannot create duplicates.

## Privacy and GDPR

- Tell attendees at capture what will be stored and why, and record consent or the legitimate-interest basis.
- Store only what recruiting needs: role, skills, experience, events. No scraping of LinkedIn.
- Set a retention period; contacts not engaged within it are deleted or asked to re-confirm.
- Honour access, correction and deletion requests across HubSpot, the assessment store and Comeet.
- Limit access to the recruiting team and log who viewed or exported candidate data.

## Measuring success

Judge success by four measures:

- Conference contacts followed up.
- Time from a role opening to a qualified shortlist.
- Recruiter time spent screening each role.
- Hires from conferences and referrals.

The tool narrows the list today; it has not yet been shown to improve any of these.

## With more time

1. **Check the rules with hiring managers** against past hires, and tune the 60% bar, minimum years and skill equivalents.
2. **Connect Comeet status** so people already in process or previously rejected are flagged.
3. **Record recruiter decisions** (approached, not interested, hired) to learn which recommendations work.
4. **Future idea, clearly separate from the current rules: an AI step for free text.** A language model could read recruiter notes and full work history to suggest evidence the skill list misses, such as computer-vision work described only in a job description. Its suggestions would be labelled as such and confirmed by a recruiter before affecting any outcome; the deterministic rules stay the decision-maker.

# Design

**Help a recruiter decide whom to approach when a role opens, using conference contacts that would otherwise be forgotten.** The pipeline turns a mixed crowd of attendees into an explained shortlist for one role, with visible gaps and the WSC employees who may know each person.

## Why this approach

The core pain is signal-to-noise: too many contacts and too little help deciding whom to approach first.

- **Deterministic rules, not a black box.** Every result comes from [written rules](scoring.md) and says why in words: what matched, what is missing, what to check next.
- **Three outcomes, not a cut-off.** Shortlist, needs review, or not recommended for this role. Missing information sends someone to review, never to rejection; nobody is deleted from the pool.
- **Relevance and job fit are separate.** Relevance to an event's topic is reported beside job fit and never decides a job outcome.
- **Connections are a reference lead, not a score.** They only break exact ties, so they never lift a weaker candidate over a stronger one.
- **AI reads, rules decide.** Attendees with no recruiter note get a labelled one-line "AI summary" written by Claude from their LinkedIn fields; it never changes a result. When a role opens, AI suggests its criteria from the job description and a recruiter confirms them before any matching (below).
- **One shared engine.** The CLI, the recruiter view and the integration demo run the same TypeScript module, so every screen and export agrees ([schema and flow](schema-and-flow.md), [assumptions](assumptions.md)).

## Production version

**Recruiters stay in the tools they use.** Contacts and recommendations live in HubSpot; selected people are handed into Comeet for a specific role. The [integration demo](../integration-demo/README.md) simulates this.

| Today (CSV) | Production source |
|---|---|
| `conference_attendees.csv` | **The organizer's attendee list, without uploads:** one shared Google Form for WSC's own events; email, a shared folder or the event platform's integration for others ([options](assumptions.md#how-conference-lists-arrive)). The same list sent twice adds nothing ([importing](additional-info/importing-and-events.md)). Each event becomes a HubSpot marketing event, which keeps registration and attendance as separate statuses on the contact ([marketing events on contacts](https://knowledge.hubspot.com/integrations/view-marketing-events-on-contact-records)). Registration is not proof of attendance. |
| `linkedin_profiles.csv` | **Enrichment.** LinkedIn's API offers no general profile lookup, so: what the person provides, a licensed vendor whose terms permit recruiting use, or a recruiter opening the profile. To confirm with legal. |
| `wsc_employees.csv` and connections | **Employee roster** from the HR system. LinkedIn's API has no mutual connections, so shared employers ("possible references") and employees confirming whom they know. |
| `job_openings.csv` | **Comeet.** The position webhook (created, updated, deleted) starts an assessment for that role. Comeet documents no candidate-status webhook, so a scheduled sync writes each person's Comeet status to HubSpot ([stance](assumptions.md#people-already-in-comeet)). |
| `output/candidates_<job>.csv` | **HubSpot.** Results go to custom `talent_` contact properties, with a saved view per role and a workflow notification when results change. |

**Triggers:** new or changed HubSpot contacts (checked every few minutes), a new form response, a new or changed Comeet role, a nightly safety-net run, or a recruiter's **Sync now**.

**New roles: criteria confirmed before matching.** When a position opens, AI suggests core skills, must-haves, required skills and nice-to-haves from the job description, quoting the sentence behind each. The recruiter edits and confirms them before the pool is matched by the same rules. The demo's suggestions are scripted and labelled simulated; production would use an LLM. Publishing is never blocked: with no core skills, a provisional default applies and says so ([scoring](scoring.md#the-shortlist-checks)).

**Recruiting stays separate from sales and marketing.** A talent contact may also be a customer:

- **Recruiter per role, not contact owner.** Each Comeet position's recruiter owns everyone handed off for it. The HubSpot Contact owner, who may be in sales or marketing, never changes. Comeet's position API exposes the lead recruiter ([position schema](https://developers.comeet.com/reference/positions-copy)), but its create-candidate call has no owner field, so how assignment works needs verifying against WSC's setup.
- **Talent contacts are non-marketing.** Contact type "Talent lead". Talent-only contacts are non-marketing; new imports get lifecycle stage "Other". A contact with a commercial relationship keeps its marketing status and stage and shows both types. Non-marketing status blocks marketing emails and ads, not one-to-one emails or sequences ([marketing contacts](https://knowledge.hubspot.com/records/marketing-contacts)), so talent contacts are also excluded from commercial campaign lists, and recruiting activity never moves lifecycle stage or counts as sales progress.
- **Handoffs are prospects.** A person handed into Comeet is a prospect with status Sourced, not an applicant ([create candidate](https://developers.comeet.com/reference/create-a-candidate-new)). A repeat handoff for the same role creates no duplicate.

**Platform requirements, to confirm with WSC.** Comeet's Recruiting API and custom candidate fields need **Comeet Enterprise**. The contact card with **Add to Comeet** is a HubSpot app card, which for an in-house app needs **HubSpot Enterprise**; workflows need Professional. Without Enterprise, properties, lists and notifications still work and the handoff becomes a list action. A small integration service (for example N8N or Workato) joins HubSpot, Comeet, Google Forms and Slack and runs the scoring; how to connect each is in [assumptions](assumptions.md#connecting-the-tools).

## At scale

Thousands of contacts are little computing; the hard parts are identity and history.

- **One person, one record.** Match by LinkedIn URL, then email; never merge on name alone. Uncertain matches go to a recruiter.
- **Incremental re-assessment.** When a contact, profile or role changes, reassess only the affected people and roles.
- **Keep history per job.** A HubSpot property holds one value, so every assessment (person, role, rule version, date, result) is also kept in a small database.
- **Respect rate limits.** Batch writes to HubSpot and Comeet and retry safely, so a large import cannot create duplicates.

**Privacy:** notice and a lawful basis at capture, consented or licensed sources only (no LinkedIn scraping), a retention period, deletion across every system, and logged access for the recruiting team only ([details](assumptions.md#privacy)).

## Measuring success

Contacts followed up, time from a role opening to a qualified shortlist, recruiter screening time per role, and hires from conferences and referrals. The tool narrows the list today; it has not yet been shown to improve any of these.

## With more time

1. **Check the rules with hiring managers** against past hires, and tune the 60% bar, minimum years and skill equivalents.
2. **Connect the real tools:** a HubSpot test account and a Comeet sandbox, to prove the handoff, owner assignment and status sync the demo simulates.
3. **Record recruiter decisions** (approached, not interested, hired) to learn which recommendations work.
4. **AI for free text:** suggest evidence from recruiter notes and work history, confirmed by a recruiter before it counts.
5. **From conference pool to talent hub.** The same matching works for past applicants, referrals and people affected by layoffs ([future work](future-work.md)).

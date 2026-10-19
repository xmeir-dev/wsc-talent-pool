# Design

**Turn forgotten conference contacts into a shortlist a recruiter can act on.** The working tool assesses the supplied files for a selected role, explains its decisions and shows WSC colleagues who may know each person. HubSpot and Comeet integration is simulated.

## Why this approach

- **Visible rules.** Skills and experience determine three outcomes: shortlist, needs review, or not recommended for this role. Everyone stays in the pool. The rules have [known classification gaps](scoring.md#limits) and need hiring-manager validation.
- **Separate evidence.** Conference relevance describes fit with the event’s topic, not job fit. Employee connections break qualification ties and suggest references; they do not establish ability or endorsement.
- **One calculation everywhere.** The CLI, recruiter view and integration demo share the same assessment logic. Labelled AI summaries help readers skim profiles but never change decisions. [Flow](schema-and-flow.md), [rules](scoring.md), [exports](additional-info/export-formats.md).

## Production version

**Keep recruiting work in HubSpot and Comeet.** HubSpot holds contacts; Comeet manages selected candidates for each role. The [integration demo](../integration-demo/README.md) illustrates this proposal, without connecting to either service.

| Source | Proposed connection |
|---|---|
| Conference lists | WSC Google Forms in an approved “Event sign-ups” folder feed HubSpot through an integration service. Outside lists arrive by dedicated email, shared folder or an event-platform connection; manual import remains available. [Capture rules](assumptions.md#how-conference-lists-arrive). |
| LinkedIn profiles | Use attendee-provided data, a licensed recruiting-data provider or recruiter review. Ordinary LinkedIn API access does not provide general profile lookup or mutual connections. No scraping. |
| Employees | Read the HR roster and shared employment history; ask employees to confirm possible references. |
| Open roles | Comeet position webhooks trigger assessment. Poll candidate status because no status-change webhook is documented. [Contact rules](assumptions.md#people-already-in-comeet). |
| Results | Store each person’s assessment separately for every role. Update separate Shortlist and Needs review lists in HubSpot. The CSV remains a single-role snapshot, not storage for simultaneous roles. |

**Refresh:** assess new or changed contacts, profiles and roles; include a nightly check and manual **Sync now**. HubSpot Service Keys support data access, not webhooks, so contact changes require polling or a project-based app. An integration service, such as N8N or Workato, coordinates the work.

**Access:** the design assumes Comeet Enterprise for API access and custom fields, and HubSpot Enterprise for the proposed private app card; workflows require Professional or higher. Confirm WSC’s plans. Without the card, use lists and a separate handoff action, subject to validation. Setup needs scoped HubSpot access, Comeet support’s key and secret, Google sign-in and a Slack app for colleague requests. The view’s **Your accounts** panel contains setup steps; [vendor references](../integration-demo/README.md#what-the-real-products-support) support the proposal, not a tested installation.

**Location:** supplied roles have none, so it does not affect current scores. Production should flag country, remote-work or relocation questions for a recruiter, using WSC’s confirmed policy.

## At scale

- **Keep one person.** Match LinkedIn URL, then email; never merge on name alone. Preserve each event edition and make repeated imports harmless.
- **Keep each role’s history.** Store current and earlier assessments per person and role. Publish list membership changes in order, discard superseded runs and retry safely. Rank and reasons come from that store in the app card; native list columns still need validation. [Storage contract](schema-and-flow.md#production-multiple-roles).
- **Limit repeated work.** Reassess affected records only, batch writes and respect provider limits.
- **Protect candidate data.** Confirm permitted sources, capture notice, retention, restricted access and deletion across all stores. [Privacy assumptions](assumptions.md#privacy).

## Measuring success

Measure recruiter screening effort, time from role opening to shortlist, follow-ups and hires. None has yet shown an improvement.

## With more time

1. Validate rules against past decisions and fix known classification gaps.
2. Prove capture, handoff and status sync in test accounts.
3. Record recruiter decisions and measure results.
4. Explore AI suggestions from free text, labelled and confirmed before affecting outcomes.
5. Consider other talent sources, including the recruiter’s layoff-outreach idea. These remain [future work](future-work.md).

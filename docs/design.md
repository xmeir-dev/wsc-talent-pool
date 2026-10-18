# Design

**Help a recruiter decide whom to approach when a role opens, using conference contacts that would otherwise be forgotten.** The proposed pipeline produces an explained shortlist with visible gaps and potential employee references.

## Why this approach

A standalone pipeline is enough to demonstrate the assignment: combine the supplied data, assess candidates for a selected job, and prepare results for HubSpot. HubSpot holds passive contacts; Comeet handles roles and active applicants. The requested [webapp](webapp-plan.md) makes these results easy to inspect.

The [schema and flow](schema-and-flow.md) defines the processing and output. The [assumptions](assumptions.md) holds the selection rules and unresolved scoring choices.

## Production design

Conference registration forms or badge-scan imports would feed a shared HubSpot talent pool. Profile enrichment would add professional evidence; Comeet would supply open roles and application status. The CSVs simulate contacts, profiles, employee connections, and open roles; application status is unavailable. Actual integration methods and access would need validation.

Keep people, attendance history, and job assessments separate so returning attendees and new roles do not erase earlier information. At scale, update changed records and reassess affected roles instead of rebuilding everything. Importing assessment fields onto a contact is only a current-job view; retain the history separately.

## Success and further work

Judge success by four measures:

- Conference contacts followed up.
- Time from a role opening to a qualified shortlist.
- Recruiter time spent screening each role.
- Hires from conferences and referrals.

These are intended measures; no improvement has been demonstrated yet.

Before implementation, check the proposed rules against contrasting candidate examples and settle thresholds. Further work would validate recommendations with recruiters and add application-status checks.

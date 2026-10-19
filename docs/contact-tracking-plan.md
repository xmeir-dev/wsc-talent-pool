# Contact tracking plan

Status: proposal for review, 2026-10-19. Not built yet.

Proposal: record every outreach action on the person and show one status per person, so a recruiter can see at a glance who in the talent pool was contacted, how, and with what result.

## Why we are doing this

The recruiter asked for it directly: on the 2026-10-15 discovery call she wanted to "manage the process" in one place, meaning see who is relevant, where to start, and whether and how each person was contacted. Today the view can draft an invite or a reference request, but it forgets it the moment the panel closes.

Why it matters:

- **No double contact.** Five recruiters share one pool. Without a record, two of them can invite the same person, or ask the same colleague twice. The call was explicit that unwanted messages to attendees "feel weird"; repeats are worse.
- **The pool only pays off if it is worked.** Her own example: a product meetup five months ago, a product role opening today, and "I won't go back to look." A status per person turns the pool into a worklist: who for this role have we not contacted yet?
- **Bulk actions need memory.** The view now has Invite to jobs and Ask WSC connections for many people at once. Without tracking, a second bulk send can hit people already contacted.
- **Managers can see progress.** Contacted, replied and not interested per conference and per role is the first honest measure of whether conference contacts turn into hires (the [design doc](design.md#measuring-success)'s success measures need this data).
- **It keeps people in fewer tools.** In production every action lands on the person's HubSpot record, which the call asked for ("data should move between systems").

## What the recruiter sees

Three additions, no new page:

| Where | What appears | What it is for |
| --- | --- | --- |
| Main table | A **Status** column with one word per person: Not contacted, Asked colleague, Invited, In Comeet, Replied, Not interested | Scan the pool for who still needs a first touch |
| Filter line | A **Status** filter next to Conference, Job and Location | "Shortlisted for Data Engineer and not contacted yet" in two clicks |
| Profile page | An **Activity** card: every invite, reference request, Comeet change and outcome, newest first, with who did it and when | Context before contacting someone; no repeats |

The recruiter also sets outcomes by hand on the profile (Replied, Interested, Not interested), because replies arrive by email or Slack, outside the app.

Invite and Ask warn before a repeat: "Invited to Senior ML Engineer on 12 Oct by Neta. Send again?" Bulk actions skip people already invited to the same job in the last 30 days and say how many were skipped.

## Data model

An append-only event log per person; the status is computed from it, never typed in. Nothing is edited or deleted, so the history is the audit trail.

| Event | Recorded when | Fields |
| --- | --- | --- |
| `invited` | Send invite (single or bulk) | person, job, channel (Comeet), by, at |
| `asked_colleague` | Ask sent to a WSC employee (single or bulk) | person, employee, channel (Slack or email), by, at |
| `outcome` | Recruiter marks Replied, Interested or Not interested | person, outcome, optional note, by, at |
| `comeet_status` | Sync reads a change from Comeet | person, job, Comeet status and step, at |

One status per person, highest rule wins:

1. **Not interested**: any `outcome` = not interested (stays until a newer outcome replaces it)
2. **In Comeet**: an active Comeet candidacy for any role
3. **Replied** / **Interested**: the latest positive `outcome`
4. **Invited**: any `invited`
5. **Asked colleague**: any `asked_colleague`
6. **Not contacted**: none of the above

Status is per person, not per job: someone who said no to one role is flagged before anyone approaches them for another. The Activity card still shows which job each event was about.

The status never changes a ranking result. Fit and outreach stay separate, as the [scoring rules](scoring.md) already keep fit and connections separate.

## Where it is stored

The demo keeps the log in the browser; production keeps it on the person's HubSpot record, so the whole team sees the same history in the tool they already use.

| Piece | Demo (this take-home) | Production |
| --- | --- | --- |
| Event log | Browser storage, one key per browser, survives reload; not shared between people | A HubSpot note on the contact per event, plus a small table in the assessment store for fast filtering |
| Status | Computed in the view from the log | Same rules, written to contact properties `talent_outreach_status` and `talent_last_contacted_at`, so HubSpot lists and views can filter on it |
| Invite | Logged as `invited`; nothing sent | Recruiting API adds the person to the Comeet position; Comeet sends the invite; logged as `invited` |
| Comeet status | Made-up history (`data/demo_comeet.json`) | Read from the Comeet Recruiting API every few minutes (Comeet has no status-change webhook); changes logged as `comeet_status` |
| Ask a colleague | Logged as `asked_colleague`; nothing sent | Slack bot sends a direct message (or email); logged as `asked_colleague` |
| Outcomes | Set on the profile | Same, written back to HubSpot |

Nothing new is collected about the person: the log records WSC's own actions and the recruiter's notes. It follows the retention and deletion rules in [Assumptions](assumptions.md#privacy).

## Build steps and tests

Medium-sized, all in the recruiter view (`view/`); the pipeline and its CSV output do not change.

1. **Activity store**: new `view/activity.ts` with append-only events in browser storage (wrapped so a blocked or private-mode store falls back to memory), a `useActivity()` hook, and a pure `statusFor(events, comeet)` function implementing the six rules.
2. **Record actions**: Invite to job, Ask (Slack, email, copy), and both bulk actions append events instead of only showing "would send".
3. **Repeat guard**: single actions warn on a repeat; bulk actions skip people invited to the same job in the last 30 days and report the count.
4. **Table**: a Status column in `view/CandidateTable.tsx` and a Status filter beside Conference, Job and Location (same filter menu component).
5. **Profile**: an Activity card (timeline, newest first) and the three outcome buttons.
6. **Docs**: assumptions (demo storage, the 30-day window), design (HubSpot note and properties), README.

Tests:

- Unit: every status rule and precedence case, including Not interested overriding In Comeet, and an empty log.
- Unit: the repeat guard (same job inside 30 days skipped, different job allowed).
- Browser: invite someone, reload, status reads Invited and the Activity card shows it; the Status filter narrows to Not contacted; bulk invite twice skips the repeats.
- The existing 128 unit and 16 browser tests stay green.

## Risks and open questions

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Demo history lives in one browser | Reviewers on another machine see a clean slate | Say so on screen (the Demo sticker) and in the assumptions doc; production uses HubSpot |
| Replies are not captured automatically | A status can lag behind reality until a recruiter marks it | Manual outcome buttons now; reading Slack and email replies is a later step |
| Status precedence is a judgment call | Recruiters may disagree with e.g. Not interested outranking In Comeet | One function holds the rules; agree them with the recruiting team |
| Logging outreach is personal data | Needs a lawful basis and a retention limit | Covered by the existing privacy section; log WSC actions only, no message bodies |
| Scope creep into a CRM | The view starts duplicating HubSpot | Keep it to one status, one log and one filter; HubSpot stays the record |

Open questions for review:

- [ ] Store events as HubSpot notes or as custom timeline events? Timeline events need a full HubSpot app, not the Service Key planned today.
- [ ] Status per person (proposed) or per person and job?
- [ ] Is 30 days the right repeat window for bulk invites?
- [ ] Who may set Not interested, and can anyone undo it or only its author?
- [ ] Build it for the 2026-10-21 presentation, or present it as the next step?

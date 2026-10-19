# Contact tracking plan

Status: revised 2026-10-19 after two CTO reviews. The assignment scope below is built (simulated, in `view/activity.ts`); live connections and sending stay out of scope.

Proposal: keep a history of every outreach action and show where each person stands **for each role**, with person-wide warnings on top, so recruiters can see who was contacted, how and with what result, and are stopped before contacting someone they shouldn't. Outreach stays separate from candidate fit: nothing here changes a ranking.

## Why we are doing this

The recruiter asked for it directly: on the 2026-10-15 discovery call she wanted to "manage the process" in one place, meaning see who is relevant, where to start, and whether and how each person was contacted. Today the view drafts invites and reference requests but forgets them as soon as the panel closes.

Why it matters:

- **No unwanted or repeated contact.** Five recruiters share one pool. Without a record, two of them can invite the same person, approach someone already interviewing, or ask the same colleague twice. The call was explicit that unwanted messages to attendees "feel weird"; repeats are worse.
- **The pool only pays off if it is worked.** Her own example: a product meetup five months ago, a product role opening today, and "I won't go back to look." A status per role turns the pool into a worklist: who for this role have we not contacted yet?
- **Bulk actions need guard rails.** The view now has Invite to jobs and Ask WSC connections for many people at once. Without them, one click can reach people who declined or are mid-process.
- **Managers can see progress.** Contacted, responded and declined per conference and per role is the first honest measure of whether conference contacts turn into hires (the [design doc](design.md#measuring-success)'s success measures need this data).
- **It keeps people in fewer tools.** HubSpot holds the pool and shows the history; Comeet keeps owning recruitment progress after handoff, as the call asked ("data should move between systems").

## What changed after review

| Review point | Change in this version |
| --- | --- |
| Track outcomes per person **and role** | Status is per person × role. Person-wide warnings (Do not contact, Already interviewing) sit on top. Reference requests are tracked separately from contacting the candidate. |
| Only record "sent" when sending is confirmed | Every action has a state: Prepared, Sent, Failed, Confirmed by recruiter, or Simulated. Copying a message or opening email is Prepared, never Sent. Adding someone to Comeet is not treated as an invitation. |
| Repeat protection beyond a 30-day rule | Blocking rules apply to single and bulk actions: Do not contact, already in a process, same role already contacted, same colleague already asked about the same person. Production adds a server-side check for two recruiters acting at once. |
| Use Comeet's existing tracking | Comeet leads already carry a role, an outreach status (Not Contacted, Contacted, Responded) and a process status ([lead schema](https://developers.comeet.com/reference/lead-schema)). Production uses them instead of rebuilding them. |
| A Comeet lead isn't necessarily interviewing (second review) | A new lead comes back as "In progress" + "Not Contacted" ([create a lead](https://developers.comeet.com/reference/create-a-lead)). Only an active candidacy, or a lead already contacted, counts as Already in process; an uncontacted lead does not block the first approach. |
| Simulated is a label, not a state (second review) | Demo actions are "Sent · Simulated" or "Prepared · Simulated", so they trigger the same repeat protection as real ones. |
| Allow corrections and deletion | Corrections add a new entry that supersedes the old one (audit kept). A deletion request removes the person's history from every connected system. |

## What the recruiter sees

| Where | What appears | What it is for |
| --- | --- | --- |
| Main table | A role with a status turns its chip in the Relevant job column into a small card: the job on top, the status in a band below ("Rejected after phone screen · Mar 2025"); "Not contacted" is left unsaid | Scan a role's pool for who still needs a first touch |
| Filter line | A **Status** filter next to Conference, Job and Location | "Shortlisted for Data Engineer and not contacted yet" in two clicks |
| Profile page | An **Activity** card: what happened and when, newest first, with Prepared or Failed noted, and person-wide flags (in process, do not contact) at the top. Under each WSC connection: whether they were already asked, with **Mark sent** for a copied request | Context before contacting someone |
| Invite and Ask panels | A block, not a warning, when a rule applies: "Already interviewing for Data Engineer (Comeet)", "Asked not to be contacted", "Noa was already asked about Alex on 12 Oct" | No unwanted or repeated contact |

In the demo, outcomes come from the seeded examples, and **Mark sent** confirms a copied reference request. Production adds the rest: outcome buttons per role (Responded, Interested, Declined), **Mark sent** for invites prepared outside the app, and a person-wide **Do not contact** on the profile.

Demo actions are stored with a Simulated label: the bulk panels and **Your accounts** carry a Demo sticker, and a status in the table says Simulated on hover.

## Data model

Three kinds of record, kept apart:

| Record | Key | Values |
| --- | --- | --- |
| Role status | person × role | Not contacted, Contacted, Responded, Interested, Declined; once handed off: Comeet's own process status (In progress, On hold, Rejected, Not interested, Hired) |
| Person flags | person | Do not contact; Already in process (derived: an active Comeet candidacy for any role, or a lead whose outreach status is Contacted or Responded; a lead still "Not Contacted" does not count) |
| Reference requests | person × colleague | Prepared, Sent, Failed, Confirmed, with any answer the recruiter records |

Each outreach or reference action is an entry with: role (if any), channel (Comeet, Slack, email, copy), **action state**, by, at.

| Action state | Meaning | Counts as contact? |
| --- | --- | --- |
| Prepared | Drafted, copied, or opened in an email app | No |
| Sent | The sending system confirmed it (Slack API success, an email send result, a Comeet message we can see) | Yes |
| Failed | The sending system returned an error | No |
| Confirmed | The recruiter marked a Prepared message as sent by them | Yes |

**Simulated** is a separate label on an entry, not a state: in the demo every action is "Sent · Simulated" or "Prepared · Simulated". Simulated entries follow exactly the same rules (a simulated send blocks a repeat), and are never mixed into real counts.

Corrections: entries are not edited in place. A correction is a new entry that supersedes an earlier one (for example "Declined" entered by mistake, replaced by "Responded"), so the history shows both. Deletion is different: a person's deletion request removes their entries, flags and requests everywhere (see below).

## Rules before any contact

Checked for every single and bulk action. A bulk action skips blocked people and lists each with the reason ("2 blocked: Ryan Patel: Already in process for Data Engineer in Comeet…; Noah Anderson: Declined Backend Engineer on 8 Oct.").

| Rule | Blocks |
| --- | --- |
| Do not contact | Every invite and every reference request about them |
| Already in process (active Comeet candidacy, or a contacted lead, any role) | New invites; the owning recruiter decides. An uncontacted Comeet lead does not block |
| Role status is Contacted or later for this role | A second invite to the same role |
| Declined this role | Invites to this role; other roles stay open, with a warning |
| Same colleague already asked about the same person (Sent or Confirmed) | A repeat request |
| Recent contact for another role (window to agree, e.g. 30 days) | Warns, does not block |
| Rejected in Comeet for another role ("Rejected after phone screen for Senior Product Manager - Sports Data in Comeet · Mar 2025."); a withdrawal is not a rejection | Warns, does not block; the same rule in the integration demo's handoff |

Production: two recruiters can act at the same moment, so the check runs on the server, and one key per person × role × action makes a second identical action a no-op. Browser storage cannot show this; the demo only checks one browser's history.

## Where it is stored

HubSpot holds the pool and displays the history; Comeet owns progress after handoff.

| Piece | Demo (this take-home) | Production |
| --- | --- | --- |
| History and flags | Browser storage, one browser, survives reload, labelled Simulated | HubSpot: a note per entry on the contact, contact properties for person flags and last contact; the assessment store keeps the per-role table for fast filtering |
| Role status before handoff | Computed from the history | Same, mirrored to HubSpot properties so lists can filter on it |
| Role status after handoff | Made-up Comeet history (`data/demo_comeet.json`) | A Comeet lead or candidate for that role; its `outreach_status` and `status` are read back every few minutes (no status webhook) |
| Invite | Simulated entry | Created as a Comeet lead or candidate for the role; marked Sent only when an actual message is confirmed, not on creation ([create a candidate](https://developers.comeet.com/reference/create-a-candidate-new) does not say an invitation is sent) |
| Reference request | Simulated entry; copy and email are Prepared | Slack bot direct message, Sent on API success; email Prepared until confirmed |
| Deletion | Clear the browser history for that person | Delete across HubSpot, the assessment store and Comeet, keeping only a dated record that a deletion happened, with no personal data |

Nothing new is collected about the person beyond WSC's own actions and recruiters' notes. Retention and deletion follow [Assumptions](assumptions.md#privacy).

## Scope for the assignment

Keep it to what demonstrates the thinking:

1. A **clearly simulated** activity history.
2. **Role-aware status** in the table and a Status filter.
3. Seeded examples, so reviewers see the rules without clicking around:
    - **Declined one role, open for another**: blocked for that role, invitable for the other with a warning.
    - **Already in process**: Ryan Patel, at the phone screen for Data Engineer in the demo Comeet data, blocked from new invites.
    - **Copied but not sent**: a reference request to a colleague that was copied, shown as Prepared, not counted as contact.
4. The block messages in Invite, Ask and both bulk actions.

Left for production: outcome buttons, **Mark sent** for invites, Do not contact management, HubSpot and Comeet writes, concurrency protection.

## What was built

All in the recruiter view (`view/`); the pipeline and its CSV output do not change.

1. **Activity store** (`view/activity.ts`): entries in browser storage (memory when storage is blocked), the seeded examples, and pure functions: `roleStatus`, `statusIn`, `personFlags`, `checkInvite`, `checkReference`.
2. **Actions record their state**: Invite, Ask in Slack and both bulk actions record "Sent" with the Simulated label; Copy and Email record "Prepared"; **Mark sent** turns a prepared reference request into "Confirmed".
3. **Blocks** in single and bulk actions, with the blocked people and reasons listed.
4. **Table**: each role's status inside its job chip, an **Invite** pill on hover where allowed, and a **Status** filter.
5. **Profile**: the Activity card with flags, each job card's status, and the request state under each WSC connection.

Tests (all passing: 141 unit, 19 browser):

- Unit (`view/activity.test.ts`): role status per role (declined for one role, open for another); an uncontacted Comeet lead not counting as in process; every block rule; a past Comeet rejection for another role warning (a withdrawal does not); Prepared not counted as contact; a repeated simulated send blocked; a correction superseding an earlier entry.
- Browser (`e2e/contact-tracking.spec.ts`): the seeded examples render and block as described; an invite survives a reload and blocks a repeat; the Status filter narrows the list.

## Open questions

- [x] Can the Recruiting API create leads? Yes: [create a lead](https://developers.comeet.com/reference/create-a-lead) takes a role (`position_uid`) and an `outreach_status`.
- [ ] Are leads enabled in WSC's Comeet account, with API permission to create and read them?
- [ ] HubSpot notes or custom timeline events for the history? Timeline events need a full HubSpot app, not the Service Key planned today.
- [ ] The cross-role warning window: 30 days, or longer?
- [ ] Who may set Do not contact, and who may lift it?
- [x] Build the assignment scope before the 2026-10-21 presentation? Yes, built (above).

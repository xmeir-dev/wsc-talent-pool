# Contact tracking

**See who was approached for each role, and stop repeated or unwanted contact.** The demo records invites and reference requests locally. Nothing is sent. Outreach history never changes candidate rankings.

## What the recruiter sees

| Where | What it shows |
|---|---|
| Attendee table | A status beneath each job chip, such as “Declined · 8 Oct”. Roles with no contact recorded show no status. |
| Status filter | Progress for the selected role; with no single role selected, the person's most advanced role status. |
| Profile Activity card | Actions, dates and person-wide flags. Each employee connection also shows whether a reference was requested. |
| Invite and Ask panels | The reason an action is blocked. Bulk actions skip blocked people and list them. |

Seeded examples demonstrate the rules: Noah Anderson declined Backend Engineer but can be approached about Data Engineer; Ryan Patel is already in process; a reference request about Alex Turner was copied but never sent. Scarlett Green is an uncontacted Comeet lead, so a first approach remains possible.

## Data model

Three records stay separate:

| Record | Applies to | Meaning |
|---|---|---|
| Role status | Person + role | Not contacted, Contacted, Responded, Interested or Declined, plus available Comeet history. |
| Person flags | Person | Do not contact; already in an active Comeet process for any role. |
| Reference request | Person + colleague | Whether that colleague was asked about this person. It does not mean the candidate was contacted. |

Every action records who, when, channel and state:

| State | What happened | Counts as contact? |
|---|---|---|
| Prepared | Message drafted, copied or opened in email | No |
| Sent | Sending system confirmed sending the request | Yes |
| Failed | Sending system returned an error | No |
| Confirmed | Recruiter marked a prepared message as sent | Yes |

**Simulated is a label, not a state.** Demo sends count for repeat protection but are not real outreach. Copy and Email record Prepared; **Mark sent** confirms a copied reference request. Corrections supersede earlier entries without erasing them. Outcome and correction controls beyond that reference confirmation are not built.

## Rules before any contact

Single and bulk actions use the same rules and check again when recording the action.

| Situation | Result |
|---|---|
| Unresolved identity or history held for review | Block invites, reference requests and handoffs. |
| Do not contact | Block invites and reference requests. |
| Active Comeet process for any role | Block new invites. The owning recruiter decides. |
| Already contacted, responded, interested or declined for this role | Block another invite to this role. |
| Same colleague already asked about this person | Block another request if Sent or Confirmed; warn if only Prepared. |
| Declined another role, contacted about it within 30 days, or rejected in Comeet for another role | Warn without blocking. A withdrawal is not a rejection. |

A Comeet lead marked **In progress + Not Contacted** is not an active candidacy and does not block the first approach. A lead marked Contacted or Responded while In progress does. This follows Comeet's [lead schema](https://developers.comeet.com/reference/lead-schema) and [create-lead response](https://developers.comeet.com/reference/create-a-lead).

**Adding someone to Comeet sends nothing.** Its rules differ from inviting them: an earlier decline, contact or Do not contact flag is shown and carried in the handoff note. See the [invite-versus-handoff rules](identity-and-history.md#invite-versus-handoff).

## Where it is stored

The demo saves history in this browser, surviving reloads when browser storage is available. It protects against duplicate actions across tabs of the same app, not across recruiters or devices. Imported contacts have a different lifetime: see [identity and saved history](identity-and-history.md).

Production would use:

| Record or action | Proposed home |
|---|---|
| Contact history and person flags | HubSpot notes and contact properties, with restricted access. |
| Status for each role | Assessment store, with separate HubSpot list memberships per role. One contact property cannot hold several roles' statuses ([storage contract](../schema-and-flow.md#production-multiple-roles)). |
| Progress after handoff | Comeet, read back on a schedule. Creating a [candidate](https://developers.comeet.com/reference/create-a-candidate-new) alone is not proof an invitation was sent. |
| Reference request | Slack direct message; record Sent only after API success. Email stays Prepared until confirmed. |

The server must check and record each action together so two recruiters cannot both send it. Deletion must cover HubSpot, the assessment store and Comeet under the [privacy rules](../assumptions.md#privacy).

## What was built

Role statuses, the Status filter, Activity cards, simulated sends, reference confirmations and shared blocking rules are implemented. Rules: `view/activity.ts`; storage: `view/actionStore.ts`. Unit tests in `tests/app/activity.test.ts` cover states and blocks; browser tests in `tests/browser/contact-tracking.spec.ts` cover the visible examples, reloads and repeat protection.

Still for production: real connections and sends, outcome buttons, invite confirmations, Do not contact management, deletion controls and coordination across recruiters.

## Open questions

- Can WSC's Comeet account create and read leads through the API?
- Should history use HubSpot notes or custom timeline events? The latter require a full app.
- Is the demo's 30-day cross-role warning appropriate?
- Who may set or lift Do not contact?

# Person identity and saved history

Who a person is, how long an imported person lasts, what their saved outreach history is attached to, and when an action is allowed. Every part of the app (CLI, recruiter view, integration demo) uses this one contract; code in `pipeline/identity.ts`, `view/activity.ts` (rules) and `view/actionStore.ts` (storage).

## Person ID

Each person has one durable ID, `candidateKey` in code and `candidate_key` in the output CSV. It owns all saved history.

| Kind of person | ID | Example |
|---|---|---|
| A supplied attendee (the 75 in `data/`) | Their published ID, kept through `data/person_ids.json` | `C-HS002` |
| Anyone else (imports, other data folders) | `P-` + 16 hex characters: a 64-bit FNV-1a hash of their identity anchor | `P-bb8012068ac60de2` |

The **identity anchor** is the identifier their attendee rows were grouped by: a valid LinkedIn URL, else an email, else a source contact ID (`hubspot_id`). Rows with none of the three get a row anchor (a hash of the whole row) and are **unanchored**.

What follows from that:

- **Durable.** Another attendance, reordered rows or an added LinkedIn profile never changes the ID. Nothing depends on row order or on which source ID sorts first (the old key was `C-<first source ID>`, so adding `HS1000` to a person known as `HS999` changed it).
- **Distinct.** Different anchors give different IDs. Repeated or suffix-like source IDs (`X`, `X`, `X-2`) cannot collide. The build checks every person ID and attendance ID is unique before any map is keyed by them and stops with a `DataValidationError` on a clash; nothing is silently overwritten.
- **Deterministic.** The same files give the same IDs in the CLI and every browser. No random IDs.
- **Never a name.** A name alone never forms an ID or owns history.

Separate from the person ID:

- `sourceContactIds`: the `hubspot_id` values on their rows, as supplied. They may repeat or be blank.
- `Attendance.attendanceId`: one person at one event edition, `A-` + 16 hex (hash of person ID + edition key). Several rows for the same person and edition are one attendance; another edition of the same conference is another attendance. Edition keys come from a supplied `event_id`, else the conference name and date ([importing and events](importing-and-events.md#event-editions)), never from `hubspot_id`.

`Candidate.identity` says how sure we are:

| Status | When | Actions |
|---|---|---|
| `resolved` | One anchor, no clash with anyone | Allowed (subject to the contact rules) |
| `possible_duplicate` | Shares an email, LinkedIn URL or source ID with another person (they are never merged) | Blocked until the source data is fixed |
| `conflict` | Their own records disagree: different names on one URL, a profile naming someone else, several profiles or URLs | Blocked |
| `unanchored` | No LinkedIn URL, email or source ID | Blocked: nothing durable to hold history against |

"Blocked" covers invites, reference requests and the Comeet handoff, in both apps and in the store itself. Ordinary missing-profile people (an email, no LinkedIn) are `resolved` and work as before.

For other modules: use `candidateKey` as the person key, build maps with `indexByPersonId` (or call `assertUnique` first), and check `identityBlock(c.identity)` or `actionGate(...)` before any action.

## How long an imported person lasts

An attendee list added with **Add conference** (recruiter view) or **Import** (integration demo) lives in memory until the page reloads; the supplied files are the pool. Saved history is not lost when an import goes: it stays under the person ID, which comes from their anchor, so:

- importing the same person again (same email or LinkedIn URL) gives the same ID and their history comes back, with no duplicate person. For the same event edition it adds no second attendance either: a retried list changes nothing ([importing and events](importing-and-events.md#repeated-rows-and-retries));
- a different person, even with the same name, gets a different ID and inherits nothing.

The one way an ID can be reused is a source-ID-only person whose contact ID was assigned by an app and later given to someone else. The store remembers the name each ID was first saved for; if a source-ID person shows up under that ID with a different name, their actions are blocked and the profile asks whether it is the same person.

## Saved history and two tabs

Outreach history is stored per browser origin in IndexedDB (database `wsc-talent-pool`). The two demo apps run on different origins, so they do not share it.

Every action (invite, reference request, Mark sent) is one readwrite transaction that reads the current history, runs the same rules the button shows, and writes only if they still allow it. IndexedDB runs such transactions one at a time across all tabs of an origin, so:

- two tabs acting on different people both keep their action (nothing is overwritten);
- two tabs inviting the same person to the same role record one invite; the other is told "Not sent: Already contacted for … on …";
- after a commit the other tabs re-read the history (BroadcastChannel), so their buttons update.

Each action has a deduplication identity: person + role for an invite, person + colleague for a reference request, one do-not-contact per person. A unique index on it backs up the rule. Drafts (Prepared) and failed sends can repeat; only Sent and Confirmed count.

Without IndexedDB (blocked storage, private mode in some browsers) the same logic runs in memory for that page only.

## Stored-state version and upgrade

The store is version 2. Version 1 was a list in `localStorage` (`wsc-activity-v1`). On the first run on an origin it is read once, in one transaction:

- entries under a supplied person's published ID (`C-HS002`…) move over as they are: that ID has one possible owner;
- entries under any other key (an import's `C-HS076`, a name-based `C-alex-review`, a collision suffix like `C-X-2`) could belong to more than one person. They are **held for review**: anyone they might belong to has outreach blocked, and their profile lists the entries with "{Name}'s" and "Not {name}'s";
- unreadable entries are kept aside (`wsc-activity-v1-unreadable`) and the Activity card says some history couldn't be read;
- duplicate sends the old store allowed are all kept, and count once.

The v1 list is left in place, never wiped. No history is guessed onto a person or deleted on upgrade.

**Reset** (tests, `resetActivity()`) clears this browser's saved history; the seeded examples stay. The integration demo's **Reset demo** clears its simulated Comeet records, not the history.

## Invite versus handoff

They are different actions with different rules (`checkInvite`/`inviteCheck` and `checkHandoff` in `view/activity.ts`):

| | Invite (recruiter view) | Comeet handoff (integration demo) |
|---|---|---|
| What it does | Contacts the person about a role | Adds them to the ATS as Sourced; sends nothing |
| Unresolved identity or history under review | Blocks | Blocks |
| Active Comeet process, any role | Blocks | Blocks |
| Declined this role | Blocks another invite to it | Allowed; the decline is shown on the card and carried in the note |
| Already contacted for this role | Blocks | Allowed; shown and carried in the note |
| Do not contact | Blocks | Allowed; shown and carried in the note |
| Declined or recently contacted for another role, or rejected in Comeet before | Warns | Warns |

The handoff note carries what is actually recorded: Comeet history and our invites, outcomes and do-not-contact, with role, date and who ("Contact history: Invited to Backend Engineer on 5 Oct 2026 by Gal Ofer (simulated); Declined Backend Engineer on 8 Oct 2026 by Gal Ofer (simulated)."). With nothing recorded it says "No contact recorded", never "not contacted".

The Comeet service checks again when the handoff is confirmed, since the preview may be stale: it resolves who the person is against records in **every** position before looking at the destination (an email-only alias of someone in process for another role is a conflict, not a new candidate), re-reads the person's identity from the current pool, and refuses a conflict or a block. Handing off the same person to the same position again returns the existing record.

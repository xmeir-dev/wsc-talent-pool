# Person identity and saved history

Who a person is, how long an imported person lasts, what their saved outreach history is attached to, and when an action is allowed. Every part of the app (CLI, recruiter view, integration demo) uses this one contract; code in `pipeline/identity.ts`, `view/activity.ts` (rules) and `view/actionStore.ts` (storage).

## Person ID

Each person has one durable ID, `candidateKey` in code and `candidate_key` in the output CSV. It owns all saved history.

| Kind of person | ID | Example |
|---|---|---|
| A supplied attendee (the 75 in `data/`) | Their published ID, kept through `data/person_ids.json` | `C-HS002` |
| Someone with saved history in this browser | The ID that history is under, found through any of their LinkedIn URLs or emails | `P-b0bd83ef0fb00689` |
| Anyone else (imports, other data folders) | `P-` + 16 hex characters: a 64-bit FNV-1a hash of their identity anchor | `P-bb8012068ac60de2` |

**Which rows are one person** (`resolvePeople` in `pipeline/identity.ts`). Only strong identifiers join rows, never a name:

- the same LinkedIn URL, in canonical form `linkedin.com/in/<slug>`: scheme, any subdomain (`www.`, `uk.`, `m.`…), case, query, anything after the slug (`/en`, `/details/experience/`) and percent-encoding in the slug (`%2D`) are ignored, so `https://www.linkedin.com/in/ryan-patel-dazn/en` is Ryan's `linkedin.com/in/ryan-patel-dazn`. Lookalike domains (`linkedin.com.example.test`) are not LinkedIn. The simulated Comeet compares URLs with the same function;
- a row with an email and no LinkedIn URL joins the one person whose LinkedIn rows carry that email (a supplied person re-imported with only their email stays one person). If several LinkedIn people share that email it joins none of them and is a `conflict`;
- rows with no LinkedIn URL and no email join only rows with the same source ID **and** the same name. Different names that share only a source ID (`X Alice`, `X Bob`) stay different people, flagged `possible_duplicate`.

**Saved identity links.** For each person with saved history this browser keeps their **links**: every LinkedIn URL and email they have been resolved with, and, for someone known only by a source ID, that source ID + name (the join rule above). A link is saved as soon as a pool build accepts it (on load and after every import), whether or not anyone acts. It is accepted only when the person's identity is `resolved` and no link of theirs is on record for someone else; people without saved history get nothing stored, so their IDs stay exactly what the CLI gives.

**Which ID they get.** If a link only this person has in the data is already on record (the supplied people's file, or a saved link), they keep that ID. So a person first known by email who comes back with the same email and a LinkedIn URL keeps the ID their invite is under; after a reload, the same LinkedIn URL with a new email is still them; and a source-ID-only person who later arrives with the same source ID, the same name and an email keeps theirs. Links on record for two different people make the person a `conflict` (held: no action until the source data is fixed); they are never merged, and the row's links are not saved. Otherwise the ID is a hash of the **anchor**: the first LinkedIn URL, else the email, else source ID + name. Rows with none of these get a row anchor (a hash of the whole row) and are **unanchored**.

What follows from that:

- **Durable.** Another attendance, reordered rows, an added LinkedIn profile, or a LinkedIn URL or email added to someone with saved history never changes the ID. Nothing depends on row order or on which source ID sorts first (the old key was `C-<first source ID>`, so adding `HS1000` to a person known as `HS999` changed it).
- **Distinct.** Different people get different IDs. Repeated or suffix-like source IDs (`X`, `X`, `X-2`) cannot collide, with or without emails, and a record whose anchor is on record for someone else gets its own ID (and is a `conflict`), never theirs. The build still checks every person ID and attendance ID is unique before any map is keyed by them; a clash stops it with a plain message ("Two different records would share one person ID…, so nothing was changed") and an import is refused; nothing is silently overwritten.
- **Deterministic.** The same files give the same IDs in the CLI and every browser with no saved history. Saved history only ever makes a person keep an earlier ID. No random IDs.
- **Never a name.** A name alone never forms an ID, joins two records or owns history.
- **Belt and braces.** If a person is shown under a new ID while one of their identifiers is on record under another (for example before the store finished loading), the store refuses any action for them ("Saved history for this person is under another record") instead of starting a second history.

Separate from the person ID:

- `sourceContactIds`: the `hubspot_id` values on their rows, as supplied. They may repeat or be blank.
- `Attendance.attendanceId`: one person at one event edition, `A-` + 16 hex (hash of person ID + edition key). Several rows for the same person and edition are one attendance; another edition of the same conference is another attendance. Edition keys come from a supplied `event_id`, else the conference name and date ([importing and events](importing-and-events.md#event-editions)), never from `hubspot_id`.

`Candidate.identity` says how sure we are:

| Status | When | Actions |
|---|---|---|
| `resolved` | One anchor, no clash with anyone | Allowed (subject to the contact rules) |
| `possible_duplicate` | Shares an email or source ID with another person who has a different LinkedIn URL or name, or has exactly the same full name (case and spacing ignored) as another person with no identifier in common. They are never merged, and both records are flagged, because nothing says which one is real: a namesake with a mistyped email must not get past the real person's process, and the real person waits too | Blocked until the source data is fixed |
| `conflict` | Their own records disagree: different names on one URL or email, a profile naming someone else, several profiles or URLs; or an email on several LinkedIn people; or identifiers on record for two different people | Blocked |
| `unanchored` | No LinkedIn URL, email or source ID | Blocked: nothing durable to hold history against |

"Blocked" covers invites, reference requests and the Comeet handoff, in both apps and in the store itself. Ordinary missing-profile people (an email, no LinkedIn) are `resolved` and work as before.

For other modules: use `candidateKey` as the person key, build maps with `indexByPersonId` (or call `assertUnique` first), and check `identityBlock(c.identity)` or `actionGate(...)` before any action.

## How long an imported person lasts

An attendee list added with **Add conference** (recruiter view) or **Import** (integration demo) lives in memory until the page reloads (or **Reset demo**); the supplied files are the pool. Saved history is not lost when an import goes: it stays under the person ID, and the store remembers that person's LinkedIn URLs and emails, so:

- importing the same person again with any identifier already linked to them (an email, a LinkedIn URL, or source ID + name) gives the same ID and their history comes back, with no duplicate person. Each import that brings them a new identifier links it too, so email → email + LinkedIn → LinkedIn + new email is one person across reloads. For the same event edition it adds no second attendance either: a retried list changes nothing ([importing and events](importing-and-events.md#repeated-rows-and-retries));
- a different person, even with the same name, gets a different ID and inherits nothing.

A source-ID-only person's ID includes their name, so an app-assigned contact ID later given to someone else does not hand them the first person's history. A source ID + name link is trusted only as far as the source system's IDs are: the integration demo numbers new contacts `HS076`, `HS077`… on each import, so after a reload a different person with the same name could be given the same number and be held or shown the first person's history (never the other way round: never a second, empty history). As a further guard the store remembers the name each ID was first saved for; if a source-ID person shows up under that ID with a different name, their actions are blocked and the profile asks whether it is the same person.

## Saved history and two tabs

Outreach history is stored per browser origin in IndexedDB (database `wsc-talent-pool`). The two demo apps run on different origins, so they do not share it.

Every action (invite, reference request, Mark sent) is one readwrite transaction that reads the current history, runs the same rules the button shows, and writes only if they still allow it. IndexedDB runs such transactions one at a time across all tabs of an origin, so:

- two tabs acting on different people both keep their action (nothing is overwritten);
- two tabs inviting the same person to the same role record one invite; the other is told "Not sent: Already contacted for … on …";
- after a commit the other tabs re-read the history (BroadcastChannel), so their buttons update. Saved identity links work the same way (`rememberIdentities`): one transaction, then the other tabs re-read and rebuild their pool with them.

Each action has a deduplication identity: person + role for an invite, person + colleague for a reference request, one do-not-contact per person. A unique index on it backs up the rule. Drafts (Prepared) and failed sends can repeat; only Sent and Confirmed count.

Without IndexedDB (blocked storage, private mode in some browsers) the same logic runs in memory for that page only.

## Stored-state version and upgrade

The store is version 2. Version 1 was a list in `localStorage` (`wsc-activity-v1`). On the first run on an origin it is read once, in one transaction:

- entries under a supplied person's published ID (`C-HS002`…) move over as they are: that ID has one possible owner;
- entries under any other key (an import's `C-HS076`, a name-based `C-alex-review`, a collision suffix like `C-X-2`) could belong to more than one person. They are **held for review**: anyone they might belong to has outreach blocked, and their profile lists the entries with "{Name}'s" and "Not {name}'s";
- unreadable entries are kept aside (`wsc-activity-v1-unreadable`) and the Activity card says some history couldn't be read;
- duplicate sends the old store allowed are all kept, and count once.

The v1 list is left in place, never wiped. No history is guessed onto a person or deleted on upgrade.

Saved identity links live in the existing `people` store (each person's `identifiers`), so no schema change was needed. Records saved before links were kept on import still work: a source-ID-only person saved with no identifiers is found through their stored anchor.

**Clearing saved history.** Nothing in the apps deletes it. The integration demo's **Reset demo** starts the demo session over: it discards imports, positions added in Comeet, handed-off Comeet records and notifications, but leaves the saved outreach history alone. The recruiter view has no reset. To clear a browser's saved history, clear the site's data for that address (in Chrome: the site-information icon in the address bar → Site settings → Delete data, or DevTools → Application → Storage → Clear site data); the seeded examples come back on their own. Tests use `resetActivity()`.

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

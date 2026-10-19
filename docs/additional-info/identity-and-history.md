# Person identity and saved history

**A returning attendee keeps their outreach history; a different person never inherits it.** Uncertain identities block action until reviewed. Imported contacts disappear on reload, but saved outreach history does not.

## Person ID

Every person has a durable ID (`candidate_key` in the CSV). The 75 supplied attendees retain their published IDs through `data/demo/person_ids.json`. Other people get a deterministic ID from their LinkedIn URL, email or source ID plus name. Someone with saved history keeps that earlier ID when a new identifier is added.

### When records join

| Evidence | Result |
|---|---|
| Same LinkedIn profile URL | One person. Equivalent spellings, subdomains, extra URL paths and encoded characters are normalized; lookalike domains are rejected. |
| Email only, matching exactly one LinkedIn person | Join that person. If several people share the email, hold the row as a conflict. |
| No LinkedIn URL or email | Join only on the same source ID **and** name. |
| Name alone | Never merge. Identical names without shared identifiers are flagged for review. |

For supplied people and people with saved, seeded or Comeet history, the browser remembers accepted identifiers as soon as a pool build resolves them, including after imports. New links are saved only for resolved identities and cannot belong to another person. A newcomer without history gets no saved links yet, keeping their ID consistent with a fresh CLI run.

For example, someone first recorded by email can later add LinkedIn, then return using LinkedIn and a new email without losing their invite history. Conflicting saved links never merge two histories.

### When action is blocked

| Identity status | Meaning |
|---|---|
| `resolved` | No identity clash. Contact rules still apply. A missing LinkedIn profile alone is not a clash. |
| `possible_duplicate` | Separate people share an email, source ID or exact normalized name without enough evidence to merge. Both wait for review. |
| `conflict` | Names, profiles or saved identifiers disagree about who this is. |
| `unanchored` | No LinkedIn URL, email or source ID to attach history to. |

The last three block invites, reference requests and Comeet handoffs. If history is found under a different ID, the store also blocks action rather than starting another history.

### ID guarantees

Reordering rows, adding an attendance or supplying more profile data does not change an established person's ID. A fresh browser and the CLI produce identical IDs for the same files. New IDs use `P-` plus a 64-bit hash; any person or attendance ID collision stops the build instead of overwriting a record.

Source contact IDs (`hubspot_id`) remain separate and may repeat or be blank. An attendance is one person at one [event edition](importing-and-events.md#event-editions), with an `A-` ID derived from both. Code: `pipeline/identity.ts`; consumers use `candidateKey` and uniqueness-checked maps.

## How long an imported person lasts

**Add conference** and the integration demo's **Import** keep new contacts in memory only. Reloading restores the supplied pool. **Reset demo** also discards imports. Saved history stays attached to the person and returns when they are imported again with an accepted identifier.

A name match cannot retrieve history. Someone known only by source ID plus name must return with that same pair; a different source ID with no email or LinkedIn URL creates a new record. Reusing an ID with a different name never transfers history and may block action for review.

Re-importing the same event list adds no second attendance. Exact retry rules are in [Importing and events](importing-and-events.md#repeated-rows-and-retries).

## Saved history and two tabs

History uses IndexedDB, scoped to the browser and app address. The two demos run at different addresses and do not share it.

Each action reads the latest history, checks the rules and writes in one transaction. Across tabs of the same app:

- Different actions survive without overwriting each other.
- Two invites to the same person and role record only one; the other tab reports why it was blocked.
- Changes and accepted identity links refresh the other tabs.

Repeat protection uses person + role for invites, person + colleague for references, and person for Do not contact. Only Sent or Confirmed counts; Prepared and Failed can repeat. Without IndexedDB, storage falls back to memory for that page only, so history does not survive reloads or coordinate across tabs.

This protects one browser, not multiple recruiters or devices. Production needs the same check on a shared server. Code: `view/activity.ts` and `view/actionStore.ts`.

## Stored-state version and upgrade

Version 2 reads the old `localStorage` history (`wsc-activity-v1`) once:

- Entries for supplied IDs move across unchanged.
- Ambiguous imported IDs are held for review. Possible owners cannot be contacted until the profile's ownership controls resolve them.
- Unreadable history is preserved separately and flagged on the Activity card.
- Duplicate old sends are retained but count once.

The old list is not deleted, and ownership is never guessed. Older source-ID records without saved identifier links remain recognized through their saved identity anchor.

**Clearing history:** neither app provides a deletion control. **Reset demo** discards imports, newly created positions, handed-off Comeet records and notifications, but keeps outreach history. Clear site data for that app address to remove stored history; seeded examples return automatically. In Chrome: site information → Site settings → Delete data. The recruiter view has no reset button.

## Invite versus handoff

**An invite contacts the person; a Comeet handoff only adds a record as Sourced.** Both are simulated here.

| Situation | Invite | Comeet handoff |
|---|---|---|
| Unresolved identity or history under review | Block | Block |
| Active Comeet process for any role | Block | Block |
| Declined or already contacted for this role | Block | Allow with history shown and carried in the note |
| Do not contact | Block | Allow with the flag shown and carried in the note |
| Declined or recently contacted for another role, or a prior rejection for another role | Warn | Warn |

The handoff note carries recorded role, date, person responsible and simulated label. With no history it says **“No contact recorded”**, which does not assert that no contact ever happened.

At confirmation, simulated Comeet checks identity across every position and re-reads the current pool and history. An email shared with a different candidate is a conflict, not a match. Repeating a handoff to the same position returns the existing record.

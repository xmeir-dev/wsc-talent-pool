# HubSpot → Comeet integration demo

A clickable concept of the production recruiter experience: review the talent pool inside HubSpot, then hand a person into Comeet for a role. Plan: [docs/native-integration-demo-plan.md](../docs/native-integration-demo-plan.md).

**Everything here is simulated.** Synthetic data, no HubSpot or Comeet account, no network calls. Each screen is drawn in that product's layout, approximated from public screenshots; no logos or product assets are used. The **HubSpot | Comeet** switch in the yellow strip works like two browser tabs. Every recommendation, rank, gap and reference comes from the same `pipeline/` the CLI and recruiter view use.

```bash
npm run demo:integrations   # http://localhost:5173
npx playwright test --project integration-demo
```

## Walkthrough: the morning after a conference

1. **Overnight run.** The demo opens in HubSpot with a notification: the conference contacts were scored overnight for every open Comeet role, with a count per role. In production this runs after the event's contacts land in HubSpot and are enriched.
   ![Morning notification](../docs/screenshots/integration-1-hubspot-morning.png)
2. **Shortlist.** Click **Senior ML Engineer: 7 shortlist · 5 to review**. The saved view lists the 7 with rank, fit reason, WSC connections and Comeet status. Every open role has its own view.
   ![Shortlist](../docs/screenshots/integration-2-hubspot-shortlist.png)
3. **Contact record.** Open **Priya Anand**. The **Talent match** app card in the Overview tab shows the recommendation, skill points, matched evidence, what is not confirmed, connections and possible references (leads, not endorsements). Switch **Role** to read her other assessments.
   ![Contact card](../docs/screenshots/integration-3-hubspot-contact-card.png)
4. **Handoff.** **Add to Comeet** previews what will be sent. Nothing is sent until **Confirm**, and no email goes out.
   ![Handoff review](../docs/screenshots/integration-4-handoff-review.png)
5. **Comeet.** **Open in Comeet** opens her profile in the position: status Sourced (not Applied), tags, the custom fields on Details, the Workflow card and the handoff note.
   ![Comeet record](../docs/screenshots/integration-5-comeet-candidate.png)
6. **Status comes back.** Back in HubSpot, the card says "In Comeet: Sourced" with **Open in Comeet** instead of Add, the record shows the Comeet status, and the shortlist's Comeet status column updates. Lucas Evans already shows "In progress · Phone screen", so nobody approaches him twice.
   ![Comeet status in HubSpot](../docs/screenshots/integration-6-comeet-status-in-hubspot.png)
7. **Manual import.** **Import** in HubSpot takes a spreadsheet from an event (or **Use sample file**). It is checked first: 4 new contacts, 1 repeat attendee merged into his existing record. After import every role is re-scored and a notification reports the new counts (Senior ML Engineer: 8 shortlist, led by Noa Barak). A file with missing columns imports nothing.
   ![Import preview](../docs/screenshots/integration-7-import-preview.png)
8. **New role.** In Comeet, **+** next to Positions opens a new position (prefilled). Publishing it scores the whole pool for that role; HubSpot gets a notification and a new saved view.
   ![New position](../docs/screenshots/integration-8-comeet-new-position.png)

**Reset demo** starts over.

## What is simulated

| Piece | In the demo | In production |
|---|---|---|
| Shortlist list | Built from `assessJob('JOB001')` | HubSpot saved view on synced contact properties |
| Talent match card | React component | HubSpot UI extension (app card) reading the assessment store |
| Role switching | Reads per-person, per-role, per-version assessments held in memory (`assessments.ts`) | Same keys, in the assessment store |
| Comeet lookup and create | In-memory service (`comeet.ts`), fictional positions and one active candidate (`fixtures.ts`) | Comeet Recruiting API (Enterprise; access through Comeet support) |
| Comeet position and profile | Approximate layout with configured custom fields and tags | Comeet's own pages |
| Overnight run and notification | Computed on load from `data/`; a HubSpot-style notification | A scheduled job after event capture and enrichment; HubSpot notification or task |
| Comeet status in HubSpot | Read from the simulated Comeet | Comeet webhook writes a HubSpot contact property |
| Spreadsheet import | Validated, then appended to the same source tables (`sources.ts`) | HubSpot import, then the same scoring job |
| New role | Appended as a job; scored immediately | Comeet "position created" webhook starts scoring |

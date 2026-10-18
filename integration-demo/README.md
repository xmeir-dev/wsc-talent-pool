# HubSpot → Comeet integration demo

A clickable concept of the production recruiter experience: review the talent pool inside HubSpot, then hand a person into Comeet for a role. Plan: [docs/native-integration-demo-plan.md](../docs/native-integration-demo-plan.md).

**Everything here is simulated.** Synthetic data, no HubSpot or Comeet account, no network calls. The screens only approximate each product's layout. Every recommendation, rank, gap and reference comes from the same `pipeline/` the CLI and recruiter view use.

```bash
npm run demo:integrations   # http://localhost:5173
npx playwright test --project integration-demo
```

## Walkthrough

1. **HubSpot shortlist.** The saved view "Senior ML Engineer — shortlist" lists the 7 JOB001 shortlisted contacts with rank, recommendation, main fit reason and WSC connections. Open **Priya Anand**.
   ![Shortlist](../docs/screenshots/integration-1-hubspot-shortlist.png)
2. **Contact record.** The **Talent match** app card shows the selected role's recommendation, matched evidence, what is not confirmed, seniority, WSC connections and possible references (leads, not endorsements). Switch **Role** to see her other assessments: JOB002 reads "Not recommended for this role", and JOB001 is unchanged when you switch back.
   ![Contact card](../docs/screenshots/integration-2-hubspot-contact-card.png)
3. **Handoff.** **Add to Comeet** previews exactly what will be sent: position, name, email, status Sourced, and the custom fields. Nothing is sent until **Confirm**, and no email goes out.
   ![Handoff review](../docs/screenshots/integration-3-handoff-review.png)
4. **Comeet candidate.** **Open in Comeet** shows the candidate record: status Sourced (not Applied), unassigned owner, the custom fields with the assessment version, and a note.
   ![Comeet record](../docs/screenshots/integration-4-comeet-candidate.png)

Also try:

- **Already in Comeet:** open **Lucas Evans** → Add to Comeet. He is in a fictional phone-screen process, so the dialog shows the owner and next step and links to that record instead of creating one.
- **Repeat handoff:** add the same person twice. The second attempt links to the first record.
- **Outage:** tick **Simulate Comeet outage**, then Confirm. The dialog says nothing was created; untick and **Try again**.
- **Reset demo** clears every handoff.

## What is simulated

| Piece | In the demo | In production |
|---|---|---|
| Shortlist list | Built from `assessJob('JOB001')` | HubSpot saved view on synced contact properties |
| Talent match card | React component | HubSpot UI extension (app card) reading the assessment store |
| Role switching | Reads per-person, per-role, per-version assessments held in memory (`assessments.ts`) | Same keys, in the assessment store |
| Comeet lookup and create | In-memory service (`comeet.ts`), fictional positions and one active candidate (`fixtures.ts`) | Comeet Recruiting API (Enterprise; access through Comeet support) |
| Comeet record | Approximate layout with configured custom fields | Comeet's own candidate page |

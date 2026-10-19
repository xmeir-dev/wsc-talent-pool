# HubSpot → Comeet integration demo

**See how a recruiter could review conference contacts in HubSpot and add a suitable person to a Comeet role.**

All data and recruiting actions are simulated. There is no live HubSpot or Comeet connection. Screens approximate the products from public screenshots, with no product logos or assets. The recommendations use the same assessment code as the CLI and recruiter view.

```bash
npm run demo:integrations   # http://localhost:5173
npx playwright test --project integration-demo
```

## Walkthrough: the morning after a conference

1. **Open a role's shortlist.** The opening notification shows results for every role. Choose **6 shortlist** for Senior ML Engineer, or **Needs review (6)**. Each role keeps its own view.
2. **Review Priya Anand.** Her **Talent match** card explains skills, gaps and possible references. Switch **Role** to compare assessments. A shared employer suggests a reference lead; it does not prove two people worked together.
3. **Try the handoff.** **Add to Comeet** previews the record. **Confirm** creates it only in the simulation, with status **Sourced**, fields and a note. **Open in Comeet** shows it; the HubSpot view reflects the status. No email is sent.
4. **Import the sample.** **Import → Use sample file** previews four new people and one returning attendee. Confirming adds the event to the existing contact and re-scores every role. Senior ML Engineer becomes seven shortlisted and seven needing review. Re-importing adds nothing; invalid CSVs import nothing and explain the error.
5. **Create a role.** Switch to Comeet, select **+** beside Positions and publish the prefilled role. The pool is assessed for it and HubSpot gets a new notification and view.

The **HubSpot | Comeet** switch works like two browser tabs.

<details>
<summary>View the demo screens</summary>

| Review | Handoff and updates |
|---|---|
| ![Morning notification](../docs/screenshots/integration-1-hubspot-morning.png) | ![Handoff review](../docs/screenshots/integration-4-handoff-review.png) |
| ![Shortlist](../docs/screenshots/integration-2-hubspot-shortlist.png) | ![Comeet record](../docs/screenshots/integration-5-comeet-candidate.png) |
| ![Contact card](../docs/screenshots/integration-3-hubspot-contact-card.png) | ![Returned status](../docs/screenshots/integration-6-comeet-status-in-hubspot.png) |
| ![Import preview](../docs/screenshots/integration-7-import-preview.png) | ![New position](../docs/screenshots/integration-8-comeet-new-position.png) |

</details>

### History and safeguards

Ryan Patel's active Comeet process blocks another handoff for any role. Scarlett Green, an uncontacted lead, can be added. A past rejection for another role warns; a withdrawal does not. Conflicting identities or an email shared with a different Comeet person stop the handoff for review.

Noah Anderson's declined invitation stays attached to Backend Engineer. It does not close his Data Engineer opportunity or prevent a Comeet handoff; the handoff note carries the decline. See [invite versus handoff](../docs/additional-info/identity-and-history.md#invite-versus-handoff).

Contact activities distinguish sent invites, drafts, employee reference requests and event attendance. Only sent invites change the demo's **Last contacted**. Event-topic relevance is separate from job fit.

**Reset demo** clears imported contacts, new roles, simulated handoffs and notifications. Reloading also loses imports. Saved outreach history remains until browser site data is cleared. See [stored history](../docs/additional-info/identity-and-history.md#stored-state-version-and-upgrade).

## What is simulated

| Piece | Demo | Proposed production |
|---|---|---|
| Role results | In-memory assessments and views | Separate assessment store and Shortlist/Needs review memberships for each role |
| Talent match card | React component | HubSpot app card reading that role's assessment |
| Contact history | Fictional history plus browser-saved actions | HubSpot emails, notes and tasks; HubSpot manages Last contacted |
| Comeet records | In-memory lookup and creation | Recruiting API, with verified access and identity checks |
| Status return | Read from simulated Comeet | Scheduled candidate-status sync; no such webhook is documented |
| Notifications | Computed when the demo loads | Scoring after capture and enrichment, followed by a notification or task |
| Import | Validated rows added to local source tables | HubSpot import followed by assessment |
| New roles | Added locally and scored immediately | Comeet position webhook starts assessment |

**A person can fit several roles at once.** Production keeps person–role revisions separately. The service updates each role's lists, and the app card reads its rank and reasons from the store. The demo's role-specific list columns still need validation in HubSpot. See the [multi-role design](../docs/schema-and-flow.md#production-multiple-roles).

## What the real products support

These documented features support the proposal. WSC's plans, permissions and actual setup still need verification.

| Need | Documented route |
|---|---|
| HubSpot lists and views | [Saved views](https://knowledge.hubspot.com/records/create-and-manage-saved-views) and [service-managed list membership](https://developers.hubspot.com/docs/api-reference/legacy/crm/lists/guide#manage-list-membership). Shared contact properties cannot hold a different rank for each simultaneous role. |
| Interactive contact card | [UI extensions](https://developers.hubspot.com/docs/apps/developer-platform/add-features/ui-extensions/overview). Enterprise is required for [HubSpot-hosted serverless functions](https://developers.hubspot.com/docs/apps/developer-platform/add-features/serverless-functions/create-serverless-functions); a developer test account works during development. Confirm the chosen app setup's plan requirements. |
| HubSpot notifications | The workflow action [Send in-app notification](https://knowledge.hubspot.com/workflows/choose-your-workflow-actions). |
| Comeet role changes | [Position webhooks](https://developers.comeet.com/reference/position-updates) cover creation, update and deletion. Candidate-status webhooks are not documented, so the proposal uses polling. The [changelog](https://developers.comeet.com/reference/changelog) also documents Leads endpoints for sourced prospects. |
| Comeet handoff | [Candidate creation](https://developers.comeet.com/reference/create-a-candidate-new) supports a position, sourced status, custom fields and a note. [Custom fields](https://recruit-support.sparkhire.com/hc/en-us/articles/40045151370267-Custom-candidate-fields) and customer [Recruiting API access](https://developers.comeet.com/reference/getting-started-comeet-customers) require Enterprise; API access involves support. |

# HubSpot and Comeet integration demo

**Outcome:** show a recruiter finding a conference contact in HubSpot, understanding the recommendation, and handing that person into Comeet for a role, without learning another dashboard.

Status: built as a simulated prototype in [`integration-demo/`](../integration-demo/README.md) (`npm run demo:integrations`). This is a follow-on concept, separate from the working take-home app. Not connected to either service. The built demo goes further than the four steps below: it opens on the morning-after notification, imports a spreadsheet, scores a new Comeet position, and shows Comeet status back in HubSpot ([walkthrough](../integration-demo/README.md)). The preference is recorded in [Assumptions](assumptions.md#where-recruiters-work).

## Demo to build

Build a small clickable prototype with synthetic data and simulated service responses. Keep a visible label: **“Integration concept · synthetic data · no live connection.”** Use recognizable host navigation and record layouts, guided by the official references below. Only the demonstrated controls need to work; do not recreate either entire product.

| Step | Recruiter action | What to show |
|---|---|---|
| 1. HubSpot shortlist | Open a saved contacts view named “Senior ML Engineer — shortlist”. | JOB001 results: rank, name, current role, recommendation, main fit reason and WSC connection. This list represents one selected-job snapshot. |
| 2. HubSpot contact | Open a person and inspect a “Talent match” app card on their record. | Selected role, recommendation, matched evidence, unconfirmed requirements, seniority, employee connections and separate possible references. A role selector inside the card reveals that person's other assessments. |
| 3. Handoff | Click “Add to Comeet”, review the person and destination role, then confirm. | Preview the fields to transfer; confirmation creates a simulated sourced prospect. If already in Comeet, link to the existing record and show the owning recruiter's next step. No outreach or automatic rejection. |
| 4. Comeet candidate | Open the resulting candidate record. | Existing candidate details and configured custom fields: role fit, evidence, gaps and possible references, with the role and assessment version identified. Show “Sourced”, not “Applied”. Do not invent a custom Comeet recommendations panel. |

## What is supported

- **HubSpot lists:** saved views support filtering and chosen columns. The single-role list is the simplest demonstration. [Saved views](https://knowledge.hubspot.com/records/create-and-manage-saved-views).
- **HubSpot app cards:** a supported place for the proposed interactive contact panel and handoff button. A real implementation uses HubSpot's UI components and an integration service. [UI extensions](https://developers.hubspot.com/docs/apps/developer-platform/add-features/ui-extensions/overview).
- **HubSpot app card plan:** HubSpot's docs say UI extensions for private apps, and the serverless functions they use, require an Enterprise subscription; a developer test account works while building. [Private apps](https://developers.hubspot.com/docs/apps/legacy-apps/private-apps/build-with-projects/create-private-apps-with-projects), [serverless functions](https://developers.hubspot.com/docs/apps/developer-platform/add-features/serverless-functions/create-serverless-functions).
- **HubSpot notifications:** the workflow action "Send in-app notification" posts to the HubSpot notification centre. [Workflow actions](https://knowledge.hubspot.com/workflows/choose-your-workflow-actions).
- **Comeet positions:** a position webhook reports creation, update and deletion; no candidate-status webhook is documented, so status comes back by scheduled sync. Since April 2026 the API also has Leads endpoints, an alternative home for sourced prospects. [Position webhook](https://developers.comeet.com/reference/position-updates), [changelog](https://developers.comeet.com/reference/changelog).
- **Comeet records:** candidate creation supports a position, sourced status, custom fields and a note. Custom candidate fields and customer Recruiting API access require Enterprise; access involves Comeet support. This establishes a supported route, not a verified WSC installation. [Create candidate](https://developers.comeet.com/reference/create-a-candidate-new), [custom fields](https://recruit-support.sparkhire.com/hc/en-us/articles/40045151370267-Custom-candidate-fields), [access](https://developers.comeet.com/reference/getting-started-comeet-customers).

## Developer handoff

1. Add a separate `integration-demo/` entry and a documented `npm run demo:integrations` command. Reuse the existing React/TypeScript setup; keep the current app and pipeline behavior intact.
2. Import `buildDataset` and `assessJob` from `pipeline/index.ts`. Use `data/` and the existing assessment types; derive counts, ranks and explanations from the engine. Reuse formatting where helpful, while matching the host tools' visual style.
3. Keep assessments keyed by person, job and rule version. Contact fields are only a selected-job snapshot; switching roles in the card must preserve every assessment. A production card can read this history from the assessment store described in [Design](design.md#at-scale).
4. Put simulated lookup/create behavior behind a small service interface. Keep fictional Comeet statuses in demo-only fixtures, separate from source CSVs. Cover a new prospect, an existing active candidate and an unavailable integration (the last is covered by unit tests; the demo has no outage switch). Repeating a handoff must return the existing simulated record; a failed handoff must not show success.
5. Add Reset demo and a short walkthrough. Capture the shortlist, contact card and Comeet destination using synthetic data. Document exactly which interactions are simulated.

## Done when

- The four-step journey works with keyboard navigation and matches current pipeline results.
- Role switching preserves assessments; unknowns remain unknown and references never imply endorsement.
- Existing-candidate and failure scenarios work without duplicate records or accidental outreach.
- A focused browser test covers the journey, role switching and repeated/failed handoff; existing required checks still pass.
- A fresh checkout runs the demo without service accounts. Screenshots and the walkthrough clearly label the simulation.

## Optional proof in actual tools

With an authorized HubSpot test account, create the JOB001 properties and saved view, install a real app card, and verify the same synthetic contact journey. Record its working location and any plan restrictions. This validates the host placement; the offline prototype alone does not.

A real Comeet handoff additionally needs an enabled sandbox, mapped position and configured fields. Use synthetic records with outbound notifications disabled; verify the created record and duplicate handling there. Until that is tested, label the Comeet handoff as simulated. WSC's subscriptions, permissions and any arbitrary embedded Comeet UI remain unverified.

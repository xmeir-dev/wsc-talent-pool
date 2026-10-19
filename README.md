# WSC Talent Pool

Take-home task for the AI Solution Manager role at WSC Sports: turn conference attendees into a ranked, explained candidate list for an open role, ready to import into HubSpot.

## Deliverables

| Deliverable | Where |
|---|---|
| Pipeline code | `pipeline/` |
| Output for JOB001 (Senior ML Engineer), plus JOB002–JOB004 | `output/` |
| Schema and flow | `docs/schema-and-flow.md` |
| How candidates are ranked | `docs/scoring.md` |
| Design document | `docs/design.md` |
| Assumptions | `docs/assumptions.md` |
| Executive summary (optional) | `docs/executive-summary.md` |
| Recruiter view (bonus) | `view/` |
| HubSpot → Comeet integration demo (bonus, simulated) | `integration-demo/` |

## Follow-on integration demo

A clickable concept of the production experience, the morning after a conference: a HubSpot notification leads to per-role shortlists, a Talent match card on each contact hands people into Comeet, Comeet status comes back to HubSpot, and spreadsheet imports and new Comeet positions are scored automatically. [Walkthrough](integration-demo/README.md), [plan](docs/native-integration-demo-plan.md). Synthetic data and simulated services; not connected to either product. What it takes on the real platforms: [platform requirements](docs/design.md#production-version).

## Setup

Needs Node.js 22.22.2 or a later 22.x, 24.15 or a later 24.x, or 26+ (the oldest versions every locked tool supports; tested on 22.22.2). With nvm, `nvm install` picks the tested version from `.nvmrc`. On an older Node, `npm ci` stops with an engine error instead of failing later. No accounts, keys or private packages.

```bash
npm ci
```

## Run

```bash
npm run dev                  # recruiter view at http://localhost:5173 (runs the pipeline in the browser on data/)
npm run pipeline -- JOB001   # writes output/candidates_JOB001.csv and prints the shortlist
npm run pipeline:all         # every job in data/job_openings.csv
npm test                     # rule, edge-case, view and export tests (synthetic fixtures in tests/fixtures/)
npm run typecheck
npm run demo:integrations    # HubSpot → Comeet integration concept (simulated)
npm run build                # static build of the view into dist/ (npm run preview to serve it)
npm run test:all             # npm test + Playwright browser tests (first time: npx playwright install chromium)
```

Use `JOB001` (Senior ML Engineer) for the demo. Other IDs: `JOB002`, `JOB003`, `JOB004`. Optional flags: `--data <dir>` and `--out <dir>`.

Each output row is one person for the chosen role: the recommendation (`shortlist`, `needs_review`, `not_recommended_for_role`), the skill counts behind it, matched skills and gaps, seniority evidence, WSC connections and possible references, every conference they attended, and the next step. Rules: [How candidates are ranked](docs/scoring.md). Columns: [Schema and flow](docs/schema-and-flow.md).

The recruiter view (`view/`) lists all attendees, filtered by conference, job, location and outreach status (a single job shows its Shortlist and Needs review in rank order); the **At a glance** cards above the table toggle the conference and job filters, and each job links to Comeet. A row opens the person's profile, with one card per job they may fit. **Download CSV** downloads the attendees shown, with every filter applied; with one job chosen it opens a menu: **Attendees shown (N)** or **Full JOB… assessment**, the same file the CLI writes for that job (a test checks they match byte for byte).

Also in the view, with the made-up parts listed in [Assumptions](docs/assumptions.md):

- **Add conference** (header) adds an event's attendee list from a file, a Google Form's responses sheet, or a sample meetup; the sample fills the empty Senior PM shortlist, Shir's "product meetup, then a product role opens" example. A quiet line explains how forms sync automatically instead.
- **Connect accounts** in the header opens **Your accounts**: HubSpot, Comeet, Google Forms and Slack, each **Not connected** at first, with **Connect** (the setup steps plus the keys or sign-in that tool needs), step-by-step **How to connect** instructions, and **Sync now**.
- Hovering a job chip shows **Invite** where an invite is allowed. Ticking rows opens a bar, above and below the table, to **Invite to jobs** (each person to their own best-fit job, one personalised invite each, sent through Comeet) or **Ask WSC connections** (one request per colleague, covering everyone selected they know).
- A job chip with an outreach status turns into a small card with the status underneath (for example "Declined · 8 Oct"), and the **Status** filter narrows by it. The history is simulated and kept in the browser; invites or reference requests that would repeat, or reach someone declined or already in process, are blocked ([plan](docs/contact-tracking-plan.md)).
- Each profile has a **Contact** card (email, LinkedIn, HubSpot, Comeet with past applications), an **Activity** card (outreach history, plus a flag when someone is in process), **Invite to job**, each job card's status for that role, and **Ask** on each WSC connection (a drafted reference request; under the colleague it shows whether they were already asked, with **Mark sent** for a copied request).

The assessment logic in `pipeline/` is plain TypeScript with no file or network access, so a browser view can import it directly (`import { buildDataset, assessJob, assessmentToCsv } from './pipeline'`). The Node command in `cli/` only reads the CSVs and writes the result.

## Repo contents

- `assignment/` — the task brief as provided (open `assignment/index.html`)
- `data/` — the provided CSVs (synthetic), plus clearly labelled made-up demo files for the view (`ai_summaries.json`, `demo_recruiters.json`, `demo_comeet.json`, `wsc_offices.json`, `samples/`); none of them feeds the ranking
- `pipeline/` — assessment rules (`rules.ts`), scoring, ranking and CSV output
- `cli/` — the `npm run pipeline` command
- `view/` — the recruiter view (React + Vite, plain CSS)
- `tests/` — Vitest tests and synthetic fixtures
- `integration-demo/` — the simulated HubSpot → Comeet concept
- `e2e/` — Playwright browser tests
- `docs/discovery-call-context.md` — context from the discovery call the task came out of

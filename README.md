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

Needs Node.js 20 or newer. No accounts, keys or private packages.

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

The recruiter view (`view/`) lists all attendees, filtered by conference and by job (a job shows its Shortlist and Needs review in rank order). A row opens the person's profile for one job, switchable to any of the four. **Download CSV** downloads the attendee list as shown or, with a job chosen, the same file the CLI writes for that job (a test checks they match byte for byte).

Also in the view, with the made-up parts listed in [Assumptions](docs/assumptions.md):

- **Add conference** adds an event's attendee list from a file, a Google Form's responses sheet, or a sample meetup; a quiet line explains how forms sync automatically instead.
- The header's **Your accounts** panel shows HubSpot, Comeet, Google Forms and Slack, each **Not connected** at first, with **Connect** (the setup steps plus the keys or sign-in that tool needs), step-by-step **How to connect** instructions, and **Sync now**.
- Ticking rows in the table opens a bar to **Invite to jobs** (each person to their own best-fit job, one personalised invite each, sent through Comeet) or **Ask WSC connections** (one request per colleague, covering everyone selected they know).
- A **Status** column and filter show each person's outreach status for the selected role (simulated history, kept in the browser), and invites or reference requests that would repeat or reach someone already in process are blocked ([plan](docs/contact-tracking-plan.md)).
- Each profile has a **Contact** card (email, LinkedIn, HubSpot, Comeet with past applications), **Invite to job** (a drafted invite sent through Comeet), each job card's Comeet status for that role, and **Ask** on each WSC connection (a drafted request for a reference).

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

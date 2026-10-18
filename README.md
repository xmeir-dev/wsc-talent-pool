# WSC Talent Pool

Take-home task for the AI Solution Manager role at WSC Sports: turn conference attendees into a ranked, explained candidate list for an open role, ready to import into HubSpot.

Developer starting point: [Webapp build plan](docs/webapp-plan.md).

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

## Setup

Needs Node.js 20 or newer. No accounts, keys or private packages.

```bash
npm ci
```

## Run

```bash
npm run pipeline -- JOB001   # writes output/candidates_JOB001.csv and prints the shortlist
npm run pipeline:all         # every job in data/job_openings.csv
npm test                     # rule and edge-case tests (synthetic fixtures in tests/fixtures/)
npm run typecheck
```

Use `JOB001` (Senior ML Engineer) for the demo. Other IDs: `JOB002`, `JOB003`, `JOB004`. Optional flags: `--data <dir>` and `--out <dir>`.

Each output row is one person for the chosen role: the recommendation (`shortlist`, `needs_review`, `not_recommended_for_role`), the points behind it, matched skills and gaps, seniority evidence, WSC connections and possible references, every conference they attended, and the next step. Rules: [How candidates are ranked](docs/scoring.md). Columns: [Schema and flow](docs/schema-and-flow.md).

The assessment logic in `pipeline/` is plain TypeScript with no file or network access, so a browser view can import it directly (`import { buildDataset, assessJob, assessmentToCsv } from './pipeline'`). The Node command in `cli/` only reads the CSVs and writes the result.

## Repo contents

- `assignment/` — the task brief as provided (open `assignment/index.html`)
- `data/` — the provided CSVs (synthetic)
- `pipeline/` — assessment rules (`rules.ts`), scoring, ranking and CSV output
- `cli/` — the `npm run pipeline` command
- `tests/` — Vitest tests and synthetic fixtures
- `docs/mock-call-summary.md` — summary of the discovery call the task came out of

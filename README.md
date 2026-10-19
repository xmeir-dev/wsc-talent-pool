# WSC Talent Pool

**Find whom to approach when a role opens.** This tool brings conference contacts into one pool, recommends people for each role, explains the evidence and gaps, and shows WSC colleagues who may know them.

Built for WSC's [AI Solution Manager assignment](assignment/index.html). All supplied candidate data is synthetic. Account connections and outreach are simulated.

## Start here

| Your question | Read |
|---|---|
| What does this solve? | [Executive summary](docs/executive-summary.md) |
| Why these candidates? | [Ranking rules and limits](docs/scoring.md) |
| How would WSC use it? | [Design](docs/design.md) |
| What is assumed or made up? | [Assumptions](docs/assumptions.md) |
| How does the data move? | [Schema and flow](docs/schema-and-flow.md) |

For **JOB001, Senior ML Engineer**, the current rules produce **6 shortlisted, 6 needing review and 63 not recommended for that role**. Everyone remains in the pool. These are rule outputs, not validated hiring decisions; see the [known scoring limitation](docs/scoring.md#limits).

## Try the recruiter view

Use **Node.js 22.22.2** (`nvm install` selects it). Also supported: later 22.x, 24.15+ within 24.x, or 26+. No accounts or keys needed.

```bash
npm ci
npm run dev
```

Open **http://localhost:5173**.

1. Choose **Senior ML Engineer** in the **Job** filter. Review the shortlist and people needing a closer look.
2. Open a person to see skills, gaps, work history and possible WSC references.
3. Use **Download** for Excel, or select **CRM import CSV** for the full role assessment.
4. Try **Add conference → sample meetup**. Returning attendees stay one person; new contacts make the product-role pool more useful.
5. Try an invite or reference request. These record simulated activity; nothing is sent.

**Demo limits:** added conferences last until reload. Outreach history persists in this browser and is shared across its tabs. **Connect accounts** shows proposed setup steps. Use Excel for spreadsheet viewing; the CRM CSV preserves source text and can contain spreadsheet formulas. [Export details](docs/additional-info/export-formats.md).

## Run the pipeline

```bash
npm run pipeline -- JOB001
npm run pipeline:all
npm run pipeline -- --help
```

The first command writes `output/candidates_JOB001.csv` and prints each shortlisted and review candidate with the reasons and next step. All assessed people appear in the CSV. JOB002–JOB004 are also included.

To choose folders:

```bash
npm run pipeline -- JOB001 --data "my data" --out "my output"
```

Defaults are the project's `data/` and `output/`. Existing output files with the same name are overwritten. Help writes nothing; invalid arguments stop before writing. Exit codes: `0` success, `1` data/file/job problem, `2` invalid command.

## See the integration concept

```bash
npm run demo:integrations
```

Open the address printed in the terminal. Explore the proposed flow from a HubSpot recommendation to a Comeet handoff and status update. This is a separate simulation. [Walkthrough and platform limits](integration-demo/README.md).

## Check the submission

```bash
npm test                       # rules, edge cases, exports, CLI and view
npm run typecheck
npm run build                  # recruiter view; npm run preview serves it
npx playwright install chromium # first browser-test setup
npm run test:all                # unit and browser checks; builds both demos
```

`npm run verify:xlsx` checks the Excel files in LibreOffice. It requires LibreOffice; the regular test suite skips that check when it is unavailable.

## Where things live

| Folder | Contents |
|---|---|
| `assignment/`, `data/` | Original brief and four supplied CSVs |
| `pipeline/`, `cli/` | Shared assessment logic and command-line runner |
| `output/` | Included results for all four roles |
| `view/`, `integration-demo/`, `data/demo/` | Recruiter view, integration simulation and labelled demo fixtures |
| `docs/`, `tests/` | Design, rules, assumptions, supporting detail and checks |

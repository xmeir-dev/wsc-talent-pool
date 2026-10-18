# Webapp build plan

**Build one recruiter workspace: select a role, review an explained shortlist, inspect a candidate, and export the results.** The webapp is now requested, although the [assignment](../assignment/index.html) makes a UI optional. The required runnable pipeline and JOB001 output still ship with it.

## The interface

| Surface | Behavior |
|---|---|
| Toolbar | Role selector with all four supplied jobs; default to JOB001. Primary action: **Export all for role**. Selecting another role updates every assessment and closes the previous candidate detail. |
| Candidate list | **Shortlist / Needs review / All** views of one table. Show rank where applicable, name/current role, concise fit reason, main gap, and employee reference. Preserve ranking; view changes only filter it. |
| Candidate detail | Clicking a row opens a side panel; on narrow screens use a full-width sheet. Show matched requirements, gaps, evidence sources, conference history, and named employee connections. Distinguish missing information from a negative finding. |
| Export | Download the complete selected-job CSV, independent of the visible tab, with shortlisted people first. Use the existing [output contract](schema-and-flow.md), including warnings and unknowns. |
| States | Handle loading, no shortlisted candidates, missing profiles, and invalid source data. Keep uncertain candidates accessible. Keyboard users can open/close details and return focus to their row. |

Use a compact light interface: Geist, monochrome, semantic color only, one primary button. Keep explanations brief in rows and detailed in the panel. No fabricated percentages, photos, activity, or live-system status.

## Build approach

**Recommended:** React + TypeScript + Vite for a local, static app. Vite provides a React/TypeScript starter and static builds. [Vite guide](https://vite.dev/guide/).

Use the supplied CSVs as bundled inputs. Put reusable assessment and CSV-export logic in `pipeline/`, UI in `view/`, and generated deliverables in `output/`. One pure assessment module serves both the browser and a Node CLI; file loading is separate. Use deterministic, documented rules for v1, with explanations generated from the same evidence used to rank. Do not hardcode the shortlist or reimplement scoring in components.

Use `@meir-labs/ui-kit` for applicable controls and tables. Ensure its pinned dependency or packaged MIT distribution travels with the submission; no machine-local paths or private credentials should be needed to run it. Use text controls for this version.

## Build sequence

1. **Settle the assessment contract.** Start from [assumptions](assumptions.md). Document each role's essential/supporting evidence, shortlist thresholds, skill equivalences, and definition of a close tie. Show provisional decisions on contrasting candidates before finalizing ranking. The third outcome, `not_recommended_for_role`, and any advantage from multiple connections are still proposals, not agreed policy.
2. **Build the shared pipeline.** Validate/join the four files, preserve attendance and evidence, assess conference relevance separately from job fit, then rank and serialize. Keep every candidate accounted for, including uncertain or conflicting records. Generate `output/candidates_JOB001.csv` from the implementation.
3. **Build the workspace.** Load the real supplied data, wire role/view selection, candidate details, and download to that pipeline. Add the empty, error, and keyboard states alongside the main flow.
4. **Verify and package.** Add tests, run the production build, and update README setup/run instructions and the concise design documents to match the implementation. Preserve the private repository.

## Acceptance checks

- Changing roles updates reasons, gaps, ranking, and exported job IDs; old results never masquerade as the new role. All views account for the supplied contacts without multiplying rows for connections or repeat attendance.
- Tests preserve the agreed rules: missing AWS alone does not exclude a strong JOB001 candidate; sports industry is a bonus; employee connections cannot outrank clearly stronger qualifications. Missing/ambiguous profiles and unresolved employee IDs remain explicit.
- Browser export and CLI output agree on rows, order, all defined columns, and rule version. Repeated runs are deterministic. Keep synthetic source IDs separate from real HubSpot IDs; do not claim a tested live import.
- Use Vitest/Testing Library for logic and component behavior, and Playwright for role selection, detail inspection, CSV download, and narrow-screen/keyboard use. No page overflow or browser errors in the tested flow.
- A fresh checkout installs, runs, tests, builds, and generates JOB001 output without service credentials. Document `dev`, `build`, `typecheck`, `test:all`, and a pipeline command accepting `job_id`.

**Later:** uploads, saved recruiter decisions, authentication, a database, outreach, live integrations, and deployment. The first version uses the provided synthetic snapshot; applicant status and job interest remain unknown.

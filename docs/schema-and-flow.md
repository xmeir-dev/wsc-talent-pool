# Schema and flow

**Output:** a ranked candidate list for one selected role, explaining fit, gaps, and potential employee references. This is a draft specification; the pipeline and live import have not been verified.

## Flow

| Step | Input → action → output |
|---|---|
| 1. Select role | `job_id` + `job_openings.csv` → load the role's requirements. |
| 2. Combine evidence | Attendees + LinkedIn profiles, matched by profile URL; connections + employees, matched by employee ID → candidate records with source evidence. |
| 3. Assess conference relevance | Skills, work history, and `conference_domain` → relevance and explanation for each event. This organizes the pool; it does not exclude someone from job matching. |
| 4. Assess job fit | Candidate evidence + role requirements → recommendation, reasons, gaps, and next check, using the [selection rules](assumptions.md). |
| 5. Rank and export | Recommendations → `output/candidates_<job_id>.csv`. Include JOB001 in the submission. Identical inputs and rules produce identical ordering. |

Keep one person with all their attendance records. Never merge by name alone. Ambiguous identities stay separate with unique local keys and visible warnings; missing profiles remain eligible for review.

## Output fields

**One row per person per selected job; separate files for different jobs.** Put shortlisted people first. Source files retain the detailed evidence.

| Group | Columns | Purpose |
|---|---|---|
| Recommendation | `recommendation`, `shortlist_rank`, `fit_evidence`, `skill_gaps`, `seniority_evidence`, `industry_bonus_evidence` | Why this person fits, what is unconfirmed, and their position. Reasons cite source fields; inferences are labelled. |
| Person | `candidate_key`, `source_contact_ids`, `full_name`, `email`, `linkedin_url`, `current_company`, `current_title`, `years_experience` | Identify the person. Experience is total experience, not necessarily time in the specialty. |
| Role and history | `job_id`, `job_title`, `event_assessments`, `assessment_version` | Identify the role and rule version. Keep event names, dates, domains, relevance, notes/source references together. |
| References | `employee_connections`, `connection_count`, `connection_status` | Resolved employee IDs/names and the source of each connection. Distinguish `listed`, `none_listed`, `unknown`, and `partially_resolved`. |
| Review | `profile_status`, `data_quality_flags`, `review_next_step`, `comeet_status`, `job_interest` | Explain missing/conflicting data and what to check. Comeet status and job interest are `unknown` in this exercise. |

Export UTF-8 CSV with headers. Years, counts, and ranks are numbers; other fields are text. Related list entries stay together in readable cells. Keys, role, version, statuses, and explanations are required. Unavailable source values are blank and flagged; conflicting values remain unresolved. Rank starts at 1 and is blank outside the shortlist. Use `none identified` for no skill gaps and `none` for no quality flags.

`recommendation` is `shortlist` or `needs_review`. Retaining clear mismatches as `not_recommended_for_role` is **proposed, not yet agreed**. `profile_status` is `matched`, `missing_url`, `unmatched`, `invalid_url`, or `conflict`. Count only resolved employee IDs: an empty source list gives 0 and `none_listed`; unresolved IDs give `partially_resolved`, even if none resolve. An unavailable profile gives a blank count and `unknown`. An industry bonus is assessed only where that role's policy defines one.

## HubSpot preparation

Map `email` to Email and other columns to configured `talent_<column>` contact properties, using Number or text as above. Synthetic `HS...` IDs are source identifiers, not HubSpot Record IDs. Resolve identity/email conflicts before import. [HubSpot import guide](https://knowledge.hubspot.com/import-and-export/understand-the-import-tool).

Contact properties hold one selected-job snapshot: another job can overwrite it. Preserve per-job results. Blank CSV cells do not clear old values, including a former shortlist rank, so production updates need an explicit clearing policy. [HubSpot file requirements](https://knowledge.hubspot.com/import-and-export/set-up-your-import-file).

Planned checks: missing/conflicting profiles, repeat attendees, unresolved connections, visible skill gaps, and connections unable to outrank clearly stronger qualifications. Scoring choices still to settle are listed in [assumptions](assumptions.md).

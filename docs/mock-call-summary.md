# Mock call summary: 15 October 2026

The central problem is helping a recruiter find and act on suitable people already in a scattered talent pool. Adding more candidates alone does not solve the screening and management burden.

Second-round interview with Shir Einy (WSC Sports), on Thursday, 15 October. Shir played an HR recruiter; the goal was to ask discovery questions, understand the problem, then propose a solution. She explicitly said the scenario was fictional and did not describe WSC's actual recruiting process.

The call supplies context and feedback; the separate [written assignment](../assignment/index.html) specifies the deliverables.

## The problem in the simulation

A team of five recruiters handles LinkedIn sourcing, conferences, referrals, and direct applications through Comeet. Each role has one recruiter responsible for it. Comeet's existing filter is not accurate enough.

- **Finding qualified candidates:** too much information to screen and too little help deciding whom to approach first.
- **Losing conference contacts:** each event's registration form feeds a separate spreadsheet. Good candidates have come from conferences, but past attendees are easily forgotten when a relevant role opens later.
- **Missing employee connections outside Comeet:** she clarified that referrals already receive priority inside Comeet. She wants comparable visibility for sourced people and conference attendees who have not applied, so colleagues who know them or worked with them can provide a reference.

## What was proposed and challenged

- The recruiter's initial idea was a notification when a tech company announces layoffs. I extended this to automatically sourcing people from LinkedIn.
- I suggested that notifications alone might solve “10–20%” of the problem. This was my informal estimate, not Shir's assessment or a measured result.
- Shir challenged both the assumption that we could identify which employees were laid off and the focus on adding candidates. Her main pushback: filtering, managing the existing pool, and recovering lost conference contacts still needed a solution.

## Details that should shape the solution

- **Attendance is not qualification or job-seeking intent.** Some attendees are unsuitable; others are good prospects but are not looking for work. LinkedIn URLs are optional on the registration form, so profiles may be unavailable.
- **Make capture easy.** Shir questioned moving spreadsheets between locations when registration forms could feed the shared candidate pool directly. That was feedback for the real-world design; the exercise supplies CSVs.
- **Fit the recruiter's daily work.** Roles open in Comeet. Show relevant people, explain recommendations, and make it clear how the recruiter proceeds with them. Account for returning attendees, earlier conferences, candidates already in Comeet, and newly opened roles.
- **Reveal possible references without asking candidates.** She wanted to know who knows or previously worked with current employees. She pushed back on messaging attendees to ask whom they know. A connection is a lead for a reference, not proof of an endorsement.
- **Avoid fragmented tools.** Building inside Comeet was not expected; she described it as closed to that kind of customization. She still wanted data to move between systems and fewer places for recruiters to manage the same people.

## Written assignment requirements

The written brief places the talent pool in HubSpot's existing contact infrastructure, with Comeet handling active applicants. Its concrete scope is:

- A runnable pipeline using the four supplied datasets: conference attendees, mock LinkedIn profiles, employees, and open roles. Accept a selected `job_id` and produce HubSpot-ready results.
- Ranked role matches with explanations, domain relevance, and employee connections. Include output CSV results for `JOB001` (Senior ML Engineer).
- Defined processing steps and output fields, plus a design document covering choices, real-world capture and integrations, scale, and future additions.
- Explicit assumptions and handling of missing data, plus README setup and run instructions. Submit the code, output, and documentation as a repository link or zip.
- A recruiter-facing HTML or CLI view and a short executive summary are optional. The call's broader workflow discussion does not make a complete recruiting platform a required deliverable.

All supplied data is synthetic, and external AI tools are allowed. The written brief requires working entirely with the supplied CSVs, without real personal data, API keys, or live LinkedIn, HubSpot, or Comeet connections.

## Submission discussed on the call

Send the submission to Shir before the presentation so she can review it. Yael was to arrange the presentation; its date was not confirmed during this call.

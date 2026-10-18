# Mock call summary — 15 Oct 2026

Second-round interview with Shir Einy (WSC Sports). Shir played an HR recruiter describing a real pain point; the goal was to ask discovery questions, understand the problem, then propose a solution. The take-home assignment was sent after the call.

## The problem (recruiter's view)

- A team of 5 recruiters, overwhelmed by volume across many sourcing channels: LinkedIn, conferences, referrals, and direct applications through Comeet.
- Comeet's built-in filter is not accurate enough.
- Three core pain points:
  1. **Finding qualified candidates** in noisy inbound volume.
  2. **Conference attendees get lost.** Attendees fill a form (name, LinkedIn, role) that lands in a one-off Excel per event. The data is never consolidated, so when a relevant role opens later, those people fall through the cracks. Conferences have produced some of the best candidates.
  3. **Referral signal gets buried.** It exists in Comeet but is lost in the general pipeline.

## What was proposed in the call

- The recruiter's own idea: a notification when a tech company has layoffs.
- I extended it to automatically sourcing laid-off people from LinkedIn.
- Shir's pushback: a notification alone solves maybe 10–20% of the problem. It adds candidates instead of filtering them, and doesn't touch the lost conference data.

## The brief that came out of it

- Build a tool that gives the recruiter one end-to-end view of all potential candidates, not just those who applied.
- Inputs: conference attendee CSVs, mock LinkedIn profiles, the employee roster, open roles (Comeet).
- Expected features:
  - Match candidates to open roles, with ranked recommendations and explanations.
  - Show whether a candidate knows current employees, without asking them directly.
  - Manage the full pipeline in one place, not only Comeet applicants.
- Shir's tip: think like the recruiter and cover edge cases — repeat attendees, candidates already in Comeet, new roles opening mid-process.
- All data is synthetic; external AI tools are fine to use.
- A standalone tool is preferred over a Comeet integration (Comeet is closed), but data flow between systems is desirable.

# How candidates are ranked

**For each role, the tool counts how many of the job's skills a person's LinkedIn profile shows. Three checks then decide whether they are shortlisted, need a recruiter's look, or don't fit this role.** There are no points: every number is a count of skills or years. Connections to WSC employees never change that decision. Every row in the output explains its result in words, so nothing is a black box. Rule version: `rules-v4`. Every rule below lives in `pipeline/rules.ts`; this page and that file change together.

## The three outcomes

| Outcome | Meaning |
|---|---|
| **Shortlist** | Shows every must-have for the role, enough of the required skills, and enough years. Ready for a screening call. |
| **Needs review** | Promising or unclear. Something is missing, below a bar, or the data is incomplete. A recruiter decides. |
| **Not recommended for this role** | Shows nothing of the role's core discipline (e.g. no machine-learning or computer-vision skill for the ML role). They stay in the talent pool for other roles. |

Missing information is not proof of missing ability. Anyone without a usable LinkedIn profile, whose profile might belong to someone else, or whose profile lists no skills goes to **needs review**, never "not recommended".

## How skills are counted

Only the skills listed on the profile count, compared as whole names, ignoring case and extra spaces ("pytorch" = "PyTorch"; "PyTorch Lightning" is not "PyTorch"). A job skill always matches its own name first; the aliases below are extra. A skill repeated in a job's required list, or in its nice-to-have list, counts once ("Python; python ; Python" is one requirement), so repeating it cannot raise anyone's count. The same holds for a spelling variant: "Go; Golang" and "Golang; Go" are one requirement, scored exactly like "Go" alone, whichever spelling comes first. Each job skill gets one of three answers:

| What the profile shows | Shown as | Counts toward the shortlist? |
|---|---|---|
| The skill, by name or an accepted alias (table below) | "on profile" (green) | Yes |
| Only a related skill (e.g. TensorFlow for PyTorch), or work that suggests it (Object Detection from tracking, pose estimation, sports CV, highlight or event detection) | "likely, please confirm" (amber) | Not toward the 60% bar: it sends the person to review, so a recruiter can confirm it. It can meet a JOB001 must-have (below) |
| Nothing | "missing" | No |

A nice-to-have counts when the profile shows it by name, an alias or a related skill; work that only suggests it is too indirect. Nice-to-haves never decide the outcome; they only order people. Each profile skill is checked against every job skill separately, so **one profile skill can count toward several**. For example, "Sports CV" is Computer Vision (on profile) and Object Detection (likely, please confirm). "Kubernetes" is a related skill for both Docker and Microservices.

## Seniority and titles

Job titles never count toward fit. Work history is shown as evidence instead.

- **Years.** The minimum-years check uses the total years on the profile. **Policy: total years include internships and junior roles and are not reduced.** When a past title contains "intern", "internship", "research assistant" or "junior", the reason, the seniority evidence and the next step all say "confirm non-intern years", including on the shortlist (e.g. Nathan Brooks and James Thornton for JOB001). Total years are not the same as years in the specialty.
- **Leadership titles.** A current title containing Head of, Lead, Principal, Architect, Director, VP or Vice President, Chief, CTO, CPO, CEO, or Engineering Manager is marked "confirm they still work hands-on". It never changes the outcome. "Product Manager" on its own is not a leadership title.

## The shortlist checks

These three checks decide the outcome. To be shortlisted, a person needs **all** of:

1. every must-have skill for the role (below);
2. at least 60% of the job's required skills on the profile, rounded up: 3 of 4, 3 of 5, or 4 of 6. **One rule for every job.** "Likely" skills don't count here; someone who reaches the bar only with them goes to needs review with "please confirm";
3. at least the minimum total years for the job's seniority: Senior 5, Mid-Senior 4, Mid 3, Junior 0. Missing years never pass this check.

A job's seniority must be one of those four (case and spaces ignored). Anything else (blank, "Staff", "Senior-level", a typo, or unusual text such as "constructor") leaves the minimum unknown: nobody is shortlisted for that role, people who would otherwise qualify stay in needs review with the reason, and the next step is to set the role's seniority. The demo's New position form offers only the four levels.

Collecting supporting skills never makes up for a missing must-have.

| Role | Must-haves for the shortlist | Core discipline (none → not recommended) |
|---|---|---|
| JOB001 Senior ML Engineer | Computer Vision, and PyTorch or related deep learning. A related skill is enough for either must-have, but still not toward the 60% bar. Priya Anand is #1 with Deep Learning for PyTorch because 4 other required skills are on her profile. | Any of: PyTorch, TensorFlow, Keras, Deep Learning, Machine Learning, Computer Vision, OpenCV, YOLO, Object Detection, Sports CV, Pose Estimation, Sports Tracking, Video Understanding, Video Analytics, Highlight Detection, Event Detection, Action Detection |
| JOB002 Backend Engineer | Python or Go, on profile | Any of: Kafka, Microservices, REST APIs, REST API |
| JOB003 Senior Product Manager – Sports Data | Product Management and Sports Analytics, both on profile. Sports broadcasting or data-product experience counts only as a related skill, so it can earn needs review but never the shortlist. | Product Management |
| JOB004 Data Engineer | Python, on profile | Any of: Spark, dbt, Airflow |

Missing AWS alone does not keep anyone off the JOB001 shortlist; it appears as a gap to confirm. A role added to `job_openings.csv` without its own policy has no must-haves, treats any required skill on the profile as its core discipline, and is flagged "provisional default rules applied (no must-haves)", which the HubSpot card shows with the person's other data warnings.

## Accepted equivalents

Every equivalence the code uses. A job skill not in this table counts only when the profile names it exactly.

| Job skill | On profile | Related skill (likely, please confirm) | Suggested by related work (likely, please confirm) |
|---|---|---|---|
| Python | Python | Python Basics | |
| PyTorch | PyTorch | TensorFlow, Keras, Deep Learning, Machine Learning | |
| Computer Vision | Computer Vision, OpenCV, Sports CV | Pose Estimation, Sports Tracking, Video Understanding, Video Analytics, Object Detection, YOLO | |
| Object Detection | Object Detection, YOLO | | Sports Tracking, Pose Estimation, Sports CV, Highlight Detection, Event Detection, Action Detection |
| AWS | AWS, SageMaker | GCP, Azure | |
| Sports Analytics | Sports Analytics, Football Analytics, Performance Analytics | Sports Data, Real-time Sports Data, Sports Broadcasting, Sports Digital, Sports Rights | |
| Real-time processing | Real-time Processing, Real-time | | |
| Docker | Docker | Kubernetes | |
| Go | Go, Golang | | |
| Microservices | Microservices | Kubernetes, Spring Boot | |
| REST APIs | REST APIs, REST API | APIs, WebSockets, Django, Spring Boot, Spring, Node.js | |
| Video streaming | Video Streaming, Live Streaming, HLS | Streaming, CDN | |
| API Products | API Products | APIs, Broadcast APIs, Data Products | |
| OTT platforms | OTT | B2C Streaming | |
| Broadcast tech | Broadcast APIs, Sports Broadcasting, Broadcast Systems | | |
| SQL | SQL | Snowflake, PostgreSQL | |
| Sports domain knowledge | Sports, Sports Data, Sports Analytics, Football Analytics, Real-time Sports Data, Sports Data Feeds | | |
| Product Management, Stakeholder Management, Kafka, Spark, dbt, Airflow, FFmpeg, Redis, Terraform | Their own name only | | |

Every job skill also matches its own name (e.g. a profile listing "OTT platforms" has OTT platforms). The "On profile" column lists the extra names. The table works one way: it says which profile skills count as a job skill, not what a job asking for one of those names accepts.

- **Spelling variants** are the only names that work both ways: Golang (Go) and REST API (REST APIs). A job requiring either spelling is scored as that skill, in any order.
- **A narrower name** (SageMaker, OpenCV, HLS, Sports, Football Analytics and the other extra names above) required alone matches its own name only: a job asking for SageMaker needs SageMaker on the profile, not AWS.
- **A narrower name next to its skill is a separate requirement**, in either order, in required skills and in nice-to-haves: "AWS; SageMaker" is two requirements, so a person with AWS but no SageMaker has 1 of 2 and stays in review (on the profile, SageMaker counts toward AWS; AWS never counts toward SageMaker). The same holds for Computer Vision and OpenCV, Video Streaming and HLS, Sports Analytics and Football Analytics.
- Any other job skill, including unusual text such as "constructor", matches its own name only.

These rules changed results for some custom roles compared with the first submitted version, which merged any name in a skill's "On profile" list into that skill and kept whichever spelling came first. That made the order matter ("Golang, Go" found nobody; "SageMaker, AWS" scored only SageMaker, "AWS, SageMaker" only AWS) and silently dropped a requirement the recruiter entered. Custom roles that list a skill next to one of its narrower names now count both, so fewer people are shortlisted (e.g. the New position form's example role, Python, Computer Vision, Object Detection and OpenCV, now has 4 requirements). The four supplied roles do not use such names and their results are unchanged.

The less obvious ones: highlight and event detection in sports video usually means detecting players, the ball or actions, so it suggests object-detection work but must be confirmed. "Real-time Sports Data" is sports data work: related to Sports Analytics, not the same skill.

## Ties and connections

- People are ordered by outcome, then by skills: more required skills on the profile, then more likely ones, then more nice-to-haves, then (Senior ML Engineer only) an industry containing sport, league, media, broadcast, streaming or OTT. Connections never lift anyone over a skills gap.
- A **close tie** means all of those are equal. Within a tie, someone with at least one WSC employee connection ranks first. The number of connections does not matter.
- When tied people are all connected, or none are, they share a rank and are marked **tied**. They are listed alphabetically; that order is not a preference.

## Connections and possible references

These are two separate columns, and neither affects the outcome:

- **Employee connections**: WSC employees the profile lists as mutual LinkedIn connections. Only IDs found on the employee roster are counted; unknown IDs are flagged.
- **Possible references**: WSC employees who worked at the same employer in overlapping years, matched from dated work history. Employer names are matched loosely ("Akamai" matches "Akamai Technologies") and generic names ("Startup", "University") are ignored, so treat these as leads to check. The views tag them "Same company, 2y overlap": a shared employer does not prove they worked together.

## Conference relevance

Each event a person attended is marked relevant, adjacent, or not relevant, based on whether their skills and industry match the conference's topic. It describes the person's fit with the event, not with any job, and never removes anyone from job matching: a strong ML engineer met at a DevOps conference is still assessed for the ML role. It appears in the `event_assessments` column of each output CSV and, in the integration demo, on each **Event attendance** activity of a HubSpot contact ("Relevance to event topic (…)"); the recruiter view lists the conferences attended without it.

## Messy data

| Situation | What happens |
|---|---|
| No LinkedIn URL, a non-profile URL, or no matching profile | Kept; needs review; "find their profile" as the next step |
| The same person at several events | One row listing every event |
| An exact duplicate row | Dropped and noted |
| A skill repeated within a job's required or nice-to-have list | Counted once; noted |
| A job seniority that is blank or not Junior, Mid, Mid-Senior or Senior | Nobody shortlisted for that role; flagged on every row |
| One LinkedIn URL with different names, or a name that differs from the profile | Flagged; needs review, never shortlisted |
| One LinkedIn URL and name with different emails (e.g. work and personal) | One row; email left blank and flagged; scored normally |
| Two LinkedIn URLs sharing an email | Kept separate; flagged as a possible duplicate |
| A row with a known person's email and no LinkedIn URL, or their URL spelled differently (`uk.linkedin.com/…`, `…/en`, `%2D`) | The same person: one row with both events |
| Rows sharing only a source ID, with different names | Kept separate; flagged as a possible duplicate |
| Several profiles for one LinkedIn URL | Not scored; needs review |
| Two people with the same name | Kept separate and scored as usual; names alone never merge records. Both are flagged as possible duplicates, so invites and handoff wait until someone confirms they are different people |

## Important caveats

- **The 60% bar, the minimum years, the must-haves and the equivalents above are stated assumptions for this exercise, not validated hiring standards.** They should be reviewed with the hiring managers and checked against past hiring decisions before anyone relies on them.
- **Internships count toward total years.** This is a deliberate, visible choice: the tool keeps the profile's total and asks the recruiter to confirm non-intern years for everyone affected. Subtracting intern years instead would move two JOB001 shortlisted people (James Thornton and Nathan Brooks, each at exactly 5 years) to needs review.
- **Likely skills are leads, not facts.** They keep people like Mason Young (TensorFlow for PyTorch, Highlight Detection for Object Detection) in needs review rather than out of sight, and their next step asks to confirm them. They never count toward the 60% bar; the one place they count is a JOB001 must-have (above).

## Results on the supplied data

| Role | Shortlist | Needs review | Not recommended |
|---|---|---|---|
| JOB001 Senior ML Engineer | 6 | 6 | 63 |
| JOB002 Backend Engineer | 3 | 8 | 64 |
| JOB003 Senior Product Manager – Sports Data | 0 | 5 | 70 |
| JOB004 Data Engineer | 12 | 1 | 62 |

JOB003 has no shortlist because no product manager in the data lists Sports Analytics. The five product managers wait in needs review, with their closest sports experience shown.

# How candidates are ranked

**Each person gets points for skills their LinkedIn profile shows. A few must-have checks then decide whether they are shortlisted, need a recruiter's look, or don't fit this role.** Connections to WSC employees never change that decision. Every row in the output explains its result in words, so nothing is a black box. Rule version: `rules-v2`. Every rule below lives in `pipeline/rules.ts`; this page and that file change together.

## The three outcomes

| Outcome | Meaning |
|---|---|
| **Shortlist** | Shows every must-have for the role, enough of the required skills, and enough years. Ready for a screening call. |
| **Needs review** | Promising or unclear. Something is missing, below a bar, or the data is incomplete. A recruiter decides. |
| **Not recommended for this role** | Shows nothing of the role's core discipline (e.g. no machine-learning or computer-vision skill for the ML role). They stay in the talent pool for other roles. |

Missing information is not proof of missing ability. Anyone without a usable LinkedIn profile, whose profile might belong to someone else, or whose profile lists no skills goes to **needs review**, never "not recommended".

## How points work

Points come only from the skills listed on the profile, plus one industry bonus for the ML role. Skills are compared as whole names, ignoring case and extra spaces ("pytorch" = "PyTorch"; "PyTorch Lightning" is not "PyTorch").

| Evidence | Points | Shown as |
|---|---|---|
| Required skill on the profile, by name or an accepted alias (table below) | 2 | "on profile" |
| Required skill shown only through a related skill (e.g. TensorFlow for PyTorch) | 1 | "only a related skill" |
| Required skill inferred from related work (Object Detection from tracking, pose estimation, sports CV, highlight or event detection) | 1 | "likely, please confirm" |
| Each nice-to-have skill, on the profile **or** through a related skill | +1 | |
| Senior ML Engineer only: an industry or any skill containing sport, league, media, broadcast, streaming or OTT | +1 | industry bonus |

A nice-to-have earns its point from a name, an alias or a related skill; an inferred match is too indirect and earns nothing. Each profile skill is checked against every job skill separately, so **one profile skill can count toward several criteria**. For example, "Sports CV" counts as Computer Vision (on profile), as Object Detection (likely, please confirm), and earns the industry bonus because it contains "sport". "Kubernetes" is a related skill for both Docker and Microservices.

The **score** in the list is the total: required points + nice-to-have points + industry bonus.

## Seniority and titles

Job titles earn no points. Work history is shown as evidence instead.

- **Years.** The minimum-years check uses the total years on the profile. **Policy: total years include internships and junior roles and are not reduced.** When a past title contains "intern", "internship", "research assistant" or "junior", the reason, the seniority evidence and the next step all say "confirm non-intern years", including on the shortlist (e.g. Nathan Brooks and James Thornton for JOB001). Total years are not the same as years in the specialty.
- **Leadership titles.** A current title containing Head of, Lead, Principal, Architect, Director, VP or Vice President, Chief, CTO, CPO, CEO, or Engineering Manager is marked "confirm they still work hands-on". It never changes the outcome. "Product Manager" on its own is not a leadership title.

## The shortlist checks

Points rank people; these checks decide the outcome. To be shortlisted, a person needs **all** of:

1. every must-have skill for the role (below);
2. at least 60% of the required-skill points, rounded up (6 of 10, 8 of 12, or 5 of 8);
3. at least the minimum total years for the job's seniority: Senior 5, Mid-Senior 4, Mid 3, Junior 0.

Collecting supporting skills never makes up for a missing must-have.

| Role | Must-haves for the shortlist | Core discipline (none → not recommended) |
|---|---|---|
| JOB001 Senior ML Engineer | Computer Vision, and PyTorch or related deep learning. A related skill is enough for either (1 point). | Any of: PyTorch, TensorFlow, Keras, Deep Learning, Machine Learning, Computer Vision, OpenCV, YOLO, Object Detection, Sports CV, Pose Estimation, Sports Tracking, Video Understanding, Video Analytics, Highlight Detection, Event Detection, Action Detection |
| JOB002 Backend Engineer | Python or Go, on profile (2 points) | Any of: Kafka, Microservices, REST APIs, REST API |
| JOB003 Senior Product Manager – Sports Data | Product Management and Sports Analytics, both on profile (2 points each). Sports broadcasting or data-product experience counts only as a related skill, so it can earn needs review but never the shortlist. | Product Management |
| JOB004 Data Engineer | Python, on profile (2 points) | Any of: Spark, dbt, Airflow |

Missing AWS alone does not keep anyone off the JOB001 shortlist; it appears as a gap to confirm. A role added to `job_openings.csv` without its own policy has no must-haves, treats any required skill on the profile as its core discipline, and is flagged "default rules applied".

## Accepted equivalents

Every equivalence the code uses. A job skill not in this table counts only when the profile names it exactly.

| Job skill | On profile (2 points) | Related skill (1 point) | Likely, please confirm (1 point) |
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

The less obvious ones: highlight and event detection in sports video usually means detecting players, the ball or actions, so it suggests object-detection work but must be confirmed. "Real-time Sports Data" is sports data work: related to Sports Analytics, not the same skill.

## Ties and connections

- People are ordered by outcome, then by score. Connections never lift anyone over a points gap.
- A **close tie** means an identical score. Within a tie, someone with at least one WSC employee connection ranks first. The number of connections does not matter.
- When tied people are all connected, or none are, they share a rank and are marked **tied**. They are listed alphabetically; that order is not a preference.

## Connections and possible references

These are two separate columns, and neither affects the outcome:

- **Employee connections**: WSC employees the profile lists as mutual LinkedIn connections. Only IDs found on the employee roster are counted; unknown IDs are flagged.
- **Possible references**: WSC employees who worked at the same employer in overlapping years, matched from dated work history. Employer names are matched loosely ("Akamai" matches "Akamai Technologies") and generic names ("Startup", "University") are ignored, so treat these as leads to check.

## Conference relevance

Each event a person attended is marked relevant, adjacent, or not relevant, based on whether their skills and industry match the conference's topic. This sorts the talent pool. It never removes anyone from job matching: a strong ML engineer met at a DevOps conference is still assessed for the ML role.

## Messy data

| Situation | What happens |
|---|---|
| No LinkedIn URL, a non-profile URL, or no matching profile | Kept; needs review; "find their profile" as the next step |
| The same person at several events | One row listing every event |
| An exact duplicate row | Dropped and noted |
| Different names, emails or profiles for what looks like one person | Not merged or guessed; flagged; needs review |
| Two people with the same name | Kept separate; names alone never merge records |

## Important caveats

- **The 60% bar, the minimum years, the must-haves and the equivalents above are stated assumptions for this exercise, not validated hiring standards.** They should be reviewed with the hiring managers and checked against past hiring decisions before anyone relies on them.
- **Internships count toward total years.** This is a deliberate, visible choice: the tool keeps the profile's total and asks the recruiter to confirm non-intern years for everyone affected. Subtracting intern years instead would move three JOB001 shortlisted people (James Thornton, Nathan Brooks and Mason Young, each at exactly 5 years) to needs review.
- **Inferred skills are leads, not facts.** "Likely, please confirm" earns 1 point so that people like Mason Young (Highlight Detection) are not missed, and their next step always asks to confirm it.

## Results on the supplied data

| Role | Shortlist | Needs review | Not recommended |
|---|---|---|---|
| JOB001 Senior ML Engineer | 7 | 5 | 63 |
| JOB002 Backend Engineer | 3 | 8 | 64 |
| JOB003 Senior Product Manager – Sports Data | 0 | 5 | 70 |
| JOB004 Data Engineer | 12 | 1 | 62 |

JOB003 has no shortlist because no product manager in the data lists Sports Analytics. The five product managers wait in needs review, with their closest sports experience shown.

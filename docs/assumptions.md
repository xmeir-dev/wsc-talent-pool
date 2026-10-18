# Assumptions

## Domain relevance

Job title alone can't separate signal from noise. In the data, attendees with sports, media, video or broadcast backgrounds sit next to people from healthcare, banking, insurance, real estate and farming who hold the same titles ("Software Engineer", "Data Engineer", "Data Scientist"). The industry they work in is what tells them apart, so the pipeline looks at industry and work history, not only the title.


Being outside sports doesn't automatically make someone noise. Several contacts without a WSC connection are real specialists in their conference's field, such as a Platform Engineer and a DevOps Lead at the DevOps conference, a Senior Data Engineer at the data conference, and broadcast and camera engineers at the broadcast conference. They're relevant to their conference and may fit a role, even if they're a weaker match for a sports-video role.

## Relevance and connections are two separate questions

- **Relevance** answers "is this person right for the role?" It's judged on industry, skills and experience.
- **Connections** answer "who at WSC can vouch for them?" They're a bonus on top, the way referrals get a bonus in Comeet.

In this sample data the two line up exactly: all 42 contacts with a WSC connection work in sports, media, video or broadcast, and all 33 without one work elsewhere. If relevance were scored using connections, a strong candidate who simply knows no one at WSC would get buried, and that's exactly the kind of person a conference is good for finding. So the pipeline never uses connections to decide relevance. The neat split is also most likely how the synthetic data was built, and real data won't be that clean.

## Contacts with no LinkedIn match

## Number of mutual connections

## Candidates already in Comeet

## Refresh cadence

## Who triggers the pipeline

## Privacy and GDPR

## Data quality

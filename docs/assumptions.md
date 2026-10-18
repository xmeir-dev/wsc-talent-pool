# Assumptions

## Domain relevance

Job title alone can't separate signal from noise. In the data, attendees with sports, media, video or broadcast backgrounds sit next to people from healthcare, banking, insurance, real estate and farming who hold the same titles ("Software Engineer", "Data Engineer", "Data Scientist"). The industry they work in is what tells them apart, so the pipeline looks at industry and work history, not only the title.

Mutual connections with WSC staff are not used to decide relevance. In this dataset they line up exactly with industry: all 42 contacts with a WSC connection work in sports, media, video or broadcast, and all 33 without one work elsewhere. That neat split is a feature of the synthetic data, and real data won't be that clean. Connections stay a reference signal, as the brief intends.

Being outside sports doesn't automatically make someone noise. Several contacts without a WSC connection are real specialists in their conference's field, such as a Platform Engineer and a DevOps Lead at the DevOps conference, a Senior Data Engineer at the data conference, and broadcast and camera engineers at the broadcast conference. They're relevant to their conference and may fit a role, even if they're a weaker match for a sports-video role.

## Contacts with no LinkedIn match

## Number of mutual connections

## Candidates already in Comeet

## Refresh cadence

## Who triggers the pipeline

## Privacy and GDPR

## Data quality

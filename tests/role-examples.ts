/** A role unrelated to the prefilled example, pasted into New position by the acceptance walkthrough and tests. */
export const SRE_TITLE = 'Site Reliability Engineer';

export const SRE_DESCRIPTION =
  "We're hiring a Site Reliability Engineer to keep our live video platform fast and available on match days. " +
  'You will run our Kubernetes clusters, manage infrastructure with Terraform and own CI/CD and monitoring. ' +
  'AWS experience is a must. ' +
  'Experience with Kubernetes, Terraform, AWS and CI/CD is required. ' +
  'Python, Helm and Go are a plus.';

/**
 * The SRE example after the browser test's edits (Required "CI/CD" → "Docker", Nice to have "Go" removed), scored by
 * the engine: the unit test checks these against the pipeline, the browser test against the HubSpot notification.
 */
export const EDITED_SRE_COUNTS = { shortlist: 7, needs_review: 6, not_recommended_for_role: 62 };

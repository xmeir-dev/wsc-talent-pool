/**
 * Records combined by one LinkedIn URL but naming different people must never
 * borrow that profile for an automatic shortlist. Synthetic fixtures only.
 */
import { describe, expect, it } from 'vitest';
import { buildDataset, identityBlock } from '../../pipeline';
import { loadSources } from '../../cli/load-sources';
import { assessJob, byName, FIXTURE_DIR, shortlistNames, syntheticPerson, syntheticSources } from '../helpers';

function withAttendees(...rows: string[]) {
  const sources = loadSources(FIXTURE_DIR);
  sources.attendees = sources.attendees.replace(/\s*$/, '\n') + rows.join('\n') + '\n';
  return assessJob(buildDataset(sources), 'JOB001');
}

const row = (id: string, name: string, email: string, date: string, url: string) =>
  `${id},${name},${email},LeagueVision,ML Engineer,QA Meetup,Sports Technology & Analytics,${date},Conference - Badge Scan,,${url}`;

describe('one LinkedIn URL, different names', () => {
  // Tia Tied is shortlisted on her own profile; a row naming someone else reuses her URL.
  const result = withAttendees(row('QA-CONFLICT', 'Someone Different', 'different@example.test', '2024-01-01', 'linkedin.com/in/tia-tied'));
  const held = result.candidates.find((c) => c.candidate.sourceContactIds.includes('QA-CONFLICT'))!;

  it('is held for review, never shortlisted', () => {
    expect(held.candidate.profileStatus).toBe('conflict');
    expect(held.recommendation).toBe('needs_review');
    expect(held.shortlistRank).toBeNull();
    expect(shortlistNames(result)).not.toContain('Someone Different');
    expect(shortlistNames(result)).not.toContain('Tia Tied');
  });

  it('says why and what to do next', () => {
    expect(held.dataQualityFlags.join(' ')).toContain('Someone Different / Tia Tied');
    expect(held.outcomeReasons.join(' ')).toMatch(/different names/i);
    expect(held.reviewNextStep).toMatch(/same person/i);
  });
});

describe('safe identities are unchanged', () => {
  it('a repeat attendee with the same name and URL stays shortlisted', () => {
    const result = withAttendees();
    expect(byName(result, 'Tia Tied').recommendation).toBe('shortlist');
    expect(byName(result, 'Tia Tied').candidate.profileStatus).toBe('matched');
  });

  it('same name and URL with a second email (work vs personal) stays matched and shortlisted', () => {
    const result = withAttendees(row('QA-EMAIL', 'Connie Linked', 'connie.personal@example.test', '2025-06-01', 'linkedin.com/in/connie-linked'));
    const connie = byName(result, 'Connie Linked');
    expect(connie.candidate.sourceContactIds).toEqual(['HS102', 'QA-EMAIL']);
    expect(connie.candidate.profileStatus).toBe('matched');
    expect(connie.recommendation).toBe('shortlist');
    expect(connie.dataQualityFlags.join(' ')).toContain('different emails');
  });

  it('two people with the same name are still never merged', () => {
    const result = withAttendees();
    expect(result.candidates.filter((c) => c.candidate.fullName === 'Chris Same')).toHaveLength(2);
  });
});

describe('a shared source ID blocks actions, not only warns', () => {
  it('two sign-ups of one person at one edition keep every ID in the identity check', () => {
    const alice = syntheticPerson('A-1', 'Alice');
    // Alice signed up twice at one edition (A-1, Z-2); Bob's record reuses Z-2.
    const dataset = buildDataset(syntheticSources([alice, { ...alice, hubspot_id: 'Z-2' }, syntheticPerson('Z-2', 'Bob')]));
    expect(dataset.candidates).toHaveLength(2);
    const a = dataset.candidates.find((c) => c.fullName === 'Alice')!;
    const b = dataset.candidates.find((c) => c.fullName === 'Bob')!;
    expect(a.sourceContactIds).toEqual(['A-1', 'Z-2']);
    for (const c of [a, b]) {
      expect(c.identity.status).toBe('possible_duplicate');
      expect(identityBlock(c.identity)).toBeDefined();
      expect(c.dataQualityFlags.some((f) => f.includes('HubSpot ID Z-2 also used by'))).toBe(true);
    }
    expect(a.identity.relatedPersonIds).toEqual([b.candidateKey]);
    expect(b.identity.relatedPersonIds).toEqual([a.candidateKey]);
  });
});

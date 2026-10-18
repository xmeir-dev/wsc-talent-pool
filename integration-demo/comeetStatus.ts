import type { ComeetCandidate } from './comeet';

/** The HubSpot "Comeet status" property, as Comeet's status webhook would keep it. */
export function comeetStatusText(c: ComeetCandidate | null): string {
  if (!c) return '--';
  return c.status === 'Sourced' ? 'Sourced' : `${c.status} · ${c.stage}`;
}

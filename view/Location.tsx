import type { FlagComponent } from 'country-flag-icons/react/3x2';
import { AE, AR, AT, AU, CA, CH, CZ, DE, DK, ES, FR, GB, GH, IE, IL, IT, KR, MX, NG, NL, PL, PT, SE, SG, SN, US, ZA } from 'country-flag-icons/react/3x2';
import { Hint } from '@meir-labs/ui-kit';
import type { Candidate } from '../pipeline';
import { placeOf } from './place';

const FLAGS: Record<string, FlagComponent> = { AE, AR, AT, AU, CA, CH, CZ, DE, DK, ES, FR, GB, GH, IE, IL, IT, KR, MX, NG, NL, PL, PT, SE, SG, SN, US, ZA };

/** A small flag after the name; city and country on hover. */
export function CountryFlag({ c }: { c: Candidate }) {
  const place = placeOf(c);
  const F = place && FLAGS[place.code];
  if (!place || !F) return null;
  return (
    <Hint tip={`${place.city}, ${place.country}`} focusable={false} className="flag">
      <F aria-label={place.country} role="img" />
    </Hint>
  );
}

import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';

/** Decorative icon; the surrounding control carries the accessible name. */
export function Icon({ icon, size = 18 }: { icon: IconSvgElement; size?: number }) {
  return <HugeiconsIcon icon={icon} size={size} strokeWidth={1.75} aria-hidden="true" />;
}

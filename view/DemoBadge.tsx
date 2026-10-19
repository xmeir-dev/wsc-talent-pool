import { HugeiconsIcon } from '@hugeicons/react';
import { LabelIcon } from '@hugeicons/core-free-icons';
import { Badge } from '@meir-labs/ui-kit';

/** Marks a panel whose actions are simulated: nothing is sent or connected. */
export function DemoBadge() {
  return (
    <Badge tone="neutral" size="sm" className="demo-badge">
      <HugeiconsIcon icon={LabelIcon} size={12} strokeWidth={1.75} aria-hidden="true" />
      Demo
    </Badge>
  );
}

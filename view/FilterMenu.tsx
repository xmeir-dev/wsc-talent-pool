import { useEffect, useRef, useState } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { ArrowDown01Icon, ArrowUp01Icon } from '@hugeicons/core-free-icons';
import { Popover } from '@meir-labs/ui-kit';

export interface FilterOption {
  value: string;
  /** Chip text. */
  label: string;
  /** Trigger text when this is the first chosen option. */
  short: string;
  count: number;
  /** Full name on hover, when the chip shows a shortened one. */
  title?: string;
}

/** "All", "SportsTech", or "SportsTech +1": the first chosen option in list order, plus how many more. */
export function summary(options: FilterOption[], selected: readonly string[]): string {
  const chosen = options.filter((o) => selected.includes(o.value));
  if (chosen.length === 0) return 'All';
  return chosen.length === 1 ? chosen[0]!.short : `${chosen[0]!.short} +${chosen.length - 1}`;
}

/**
 * A multi-select filter: a quiet trigger opening a panel of toggle chips. Nothing chosen means no filter.
 * With `featured`, those options come first under a heading, most attendees first, and the rest wait behind "N more".
 */
export function FilterMenu({
  label,
  icon,
  options,
  selected,
  onChange,
  featured,
}: {
  label: string;
  icon: IconSvgElement;
  options: FilterOption[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
  featured?: { label: string; values: readonly string[]; more: (n: number) => string };
}) {
  // Keep the chosen values in list order, whatever order they were clicked in.
  const toggle = (value: string) => {
    const on = selected.includes(value);
    onChange(options.map((o) => o.value).filter((v) => (v === value ? !on : selected.includes(v))));
  };
  // The kit focuses the panel before it is positioned (still hidden), which the browser ignores;
  // once it shows, put focus on the first chip so the keyboard can start toggling.
  const [open, setOpen] = useState(false);
  const top = featured ? options.filter((o) => featured.values.includes(o.value)).sort((x, y) => y.count - x.count) : options;
  const rest = featured ? options.filter((o) => !featured.values.includes(o.value)) : [];
  // The rest start open when one of them is already chosen, so a choice is never hidden.
  const [showRest, setShowRest] = useState(false);
  useEffect(() => {
    if (open) setShowRest(rest.some((o) => selected.includes(o.value)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const chip = (o: FilterOption) => (
    <button
      key={o.value}
      type="button"
      className="filter-chip"
      aria-pressed={selected.includes(o.value)}
      title={o.title}
      onClick={() => toggle(o.value)}
    >
      {o.label} <em>{o.count}</em>
    </button>
  );
  const chipsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    let frame = 0;
    let tries = 0;
    const focusFirst = () => {
      const chips = chipsRef.current;
      if (chips?.contains(document.activeElement)) return;
      chips?.querySelector('button')?.focus({ preventScroll: true });
      if (!chips?.contains(document.activeElement) && ++tries < 20) frame = requestAnimationFrame(focusFirst);
    };
    frame = requestAnimationFrame(focusFirst);
    return () => cancelAnimationFrame(frame);
  }, [open]);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <Popover.Trigger className="filter-trigger">
        <HugeiconsIcon icon={icon} size={14} strokeWidth={1.75} aria-hidden="true" className="filter-icon" />
        <span className="filter-label">{label}</span>
        <span className="filter-value">{summary(options, selected)}</span>
        <HugeiconsIcon icon={ArrowDown01Icon} size={14} strokeWidth={1.75} aria-hidden="true" className="filter-icon" />
      </Popover.Trigger>
      <Popover.Content className="filter-menu" aria-label={label}>
        <div ref={chipsRef}>
          {featured && <p className="filter-heading">{featured.label}</p>}
          <div className="filter-chips">{top.map(chip)}</div>
          {rest.length > 0 && (
            <>
              <button type="button" className="filter-more" aria-expanded={showRest} onClick={() => setShowRest(!showRest)}>
                {featured!.more(rest.length)}
                <HugeiconsIcon icon={showRest ? ArrowUp01Icon : ArrowDown01Icon} size={14} strokeWidth={1.75} aria-hidden="true" />
              </button>
              {showRest && <div className="filter-chips">{rest.map(chip)}</div>}
            </>
          )}
        </div>
        <div className="filter-foot">
          <button type="button" className="filter-clear" onClick={() => onChange([])}>
            Clear
          </button>
        </div>
      </Popover.Content>
    </Popover>
  );
}

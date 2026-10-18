import { useEffect, useRef, useState } from 'react';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';
import { ArrowDown01Icon } from '@hugeicons/core-free-icons';
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

/** A multi-select filter: a quiet trigger opening a panel of toggle chips. Nothing chosen means no filter. */
export function FilterMenu({
  label,
  icon,
  options,
  selected,
  onChange,
}: {
  label: string;
  icon: IconSvgElement;
  options: FilterOption[];
  selected: readonly string[];
  onChange: (next: string[]) => void;
}) {
  // Keep the chosen values in list order, whatever order they were clicked in.
  const toggle = (value: string) => {
    const on = selected.includes(value);
    onChange(options.map((o) => o.value).filter((v) => (v === value ? !on : selected.includes(v))));
  };
  // The kit focuses the panel before it is positioned (still hidden), which the browser ignores;
  // once it shows, put focus on the first chip so the keyboard can start toggling.
  const [open, setOpen] = useState(false);
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
        <div className="filter-chips" ref={chipsRef}>
          {options.map((o) => {
            const on = selected.includes(o.value);
            return (
              <button
                key={o.value}
                type="button"
                className="filter-chip"
                aria-pressed={on}
                title={o.title}
                onClick={() => toggle(o.value)}
              >
                {o.label} <em>{o.count}</em>
              </button>
            );
          })}
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

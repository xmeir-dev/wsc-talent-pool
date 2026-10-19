import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The modal behaviour every demo dialog shares: focus moves into the dialog, Tab and Shift+Tab
 * cycle inside it, everything else on the page is inert (no clicks, no focus), Escape closes,
 * and focus returns to whatever opened it.
 */
export function useDialog(dialog: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const opener = document.activeElement as HTMLElement | null;

    // Inert every sibling on the path from the dialog up to <body>; undo only what was set here.
    const madeInert: Element[] = [];
    for (let node: Element = el; node.parentElement && node !== document.body; node = node.parentElement) {
      for (const sibling of Array.from(node.parentElement.children)) {
        if (sibling === node || sibling.hasAttribute('inert') || sibling.tagName === 'SCRIPT') continue;
        sibling.setAttribute('inert', '');
        madeInert.push(sibling);
      }
    }
    el.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => x.getClientRects().length > 0);
      if (items.length === 0) {
        e.preventDefault();
        el.focus();
        return;
      }
      const first = items[0]!;
      const last = items.at(-1)!;
      const active = document.activeElement;
      const inside = el.contains(active);
      if (e.shiftKey && (!inside || active === first || active === el)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (!inside || active === last)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      for (const node of madeInert) node.removeAttribute('inert');
      opener?.focus();
    };
  }, [dialog]);
}

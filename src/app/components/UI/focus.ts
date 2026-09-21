'use client';

import { RefObject, useEffect } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function isRendered(el: Element): boolean {
  return el.getClientRects().length > 0;
}

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(isRendered);
}

/**
 * Keep Tab / Shift+Tab inside `containerRef` while `active`. Does nothing while
 * the container is not rendered (e.g. a `md:hidden` variant on desktop).
 */
export function useFocusTrap(containerRef: RefObject<HTMLElement | null>, active: boolean) {
  useEffect(() => {
    if (!active) return;

    const onKeyDown = (event: KeyboardEvent) => {
      const container = containerRef.current;
      if (event.key !== 'Tab' || !container || !isRendered(container)) return;

      const items = getFocusableElements(container);
      if (items.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const current = document.activeElement;
      const outside = !current || !container.contains(current);

      if (event.shiftKey && (outside || current === first || current === container)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (outside || current === last)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [containerRef, active]);
}

/**
 * Remember what had focus when `active` turns on and give focus back when it
 * turns off - unless the visitor has meanwhile moved focus somewhere else on
 * purpose (e.g. clicked the map), which we leave alone.
 *
 * Declare it before any effect that moves focus into the dialog, so the
 * element captured here is the one outside the dialog.
 */
export function useRestoreFocus(active: boolean, container?: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;

    return () => {
      // Read at close time on purpose: the caller may point the ref at the
      // panel only after this effect ran.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const containerEl = container?.current;
      const current = document.activeElement;
      const focusWasLost = !current || current === document.body;
      const focusIsInside = !!(current && containerEl?.contains(current));
      if ((focusWasLost || focusIsInside) && previous && previous !== document.body && previous.isConnected) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [active, container]);
}

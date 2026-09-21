'use client';

import Link from 'next/link';
import { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import type { ConsentState } from './consent';

interface ConsentBannerProps {
  /** Stored choice not read yet (server HTML / first client render). */
  pending?: boolean;
  consent: ConsentState | null;
  onAccept: () => void;
  onReject: () => void;
  /** Present only when the banner was reopened from the settings link. */
  onDismiss?: () => void;
  /** Move focus into the banner (when the visitor opened it on purpose). */
  focusOnMount?: boolean;
}

/**
 * Non-modal consent banner. Accepting and rejecting are equally easy: same
 * size, same place, one click each.
 */
export function ConsentBanner({ pending, consent, onAccept, onReject, onDismiss, focusOnMount }: ConsentBannerProps) {
  const titleId = useId();
  const descriptionId = useId();
  const regionRef = useRef<HTMLElement>(null);

  // When opened from a settings link, take focus and give it back on close.
  useEffect(() => {
    if (!focusOnMount) return;
    const previous = document.activeElement as HTMLElement | null;
    const region = regionRef.current;
    region?.focus();
    return () => {
      const active = document.activeElement;
      const focusWasInside = !active || active === document.body || region?.contains(active);
      if (focusWasInside && previous && document.contains(previous)) previous.focus();
    };
  }, [focusOnMount]);

  useEffect(() => {
    if (!onDismiss) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) onDismiss();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onDismiss]);

  return (
    <section
      ref={regionRef}
      data-consent-pending={pending ? '' : undefined}
      tabIndex={-1}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="fixed inset-x-0 bottom-0 z-[60] p-4 pointer-events-none focus:outline-none"
    >
      <div className="pointer-events-auto mx-auto max-w-2xl rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <p id={titleId} className="font-semibold text-gray-900">
            Sütik és látogatottsági statisztika
          </p>
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Bezárás a beállítás módosítása nélkül"
              className="-m-1 rounded-full p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>
        <p id={descriptionId} className="mt-1 text-sm leading-relaxed text-gray-700">
          Szeretnénk látni, hányan és hogyan használjátok az oldalt, ehhez a Google Analytics-et
          használnánk (a Google Tag Manageren keresztül). Ez sütiket tesz a böngésződbe, és a Google-nek
          küld adatot. Csak akkor töltjük be, ha elfogadod.{' '}
          {consent === 'granted' && <strong>Jelenleg engedélyezted. </strong>}
          {consent === 'denied' && <strong>Jelenleg elutasítottad. </strong>}
          <Link
            href="/mi-ez-itt#adatvedelem"
            className="font-medium text-blue-700 underline hover:text-blue-900"
          >
            Részletek
          </Link>
        </p>
        <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onReject}
            className="rounded-lg bg-gray-800 px-5 py-2 text-sm font-semibold text-white hover:bg-gray-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Elutasítom
          </button>
          <button
            type="button"
            onClick={onAccept}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
          >
            Elfogadom
          </button>
        </div>
      </div>
    </section>
  );
}

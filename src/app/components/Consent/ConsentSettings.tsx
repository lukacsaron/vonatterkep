'use client';

import { cn } from '@/lib/utils';
import { useConsent } from './ConsentProvider';

/** Inline status and controls for the /mi-ez-itt privacy section. */
export function ConsentSettings({ className }: { className?: string }) {
  const { consent, accept, reject } = useConsent();

  const status =
    consent === 'granted'
      ? 'Jelenleg engedélyezted a statisztikát.'
      : consent === 'denied'
        ? 'Jelenleg elutasítottad a statisztikát, a Google kódja nem töltődik be.'
        : consent === 'unknown'
          ? 'Még nem döntöttél, ezért a Google kódja nem töltődik be.'
          : 'A beállításod betöltése…';

  return (
    <div className={cn('rounded-lg border border-gray-200 bg-gray-50 p-4', className)}>
      <p className="text-sm text-gray-700" role="status" aria-live="polite">
        {status}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={accept}
          disabled={consent === null}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          Elfogadom
        </button>
        <button
          type="button"
          onClick={reject}
          disabled={consent === null}
          className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-semibold text-white hover:bg-gray-900 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
        >
          {consent === 'granted' ? 'Visszavonom' : 'Elutasítom'}
        </button>
      </div>
    </div>
  );
}

/** Small text button that reopens the consent banner. */
export function CookieSettingsButton({ className }: { className?: string }) {
  const { openSettings } = useConsent();
  return (
    <button
      type="button"
      onClick={openSettings}
      className={cn(
        'text-blue-600 underline hover:text-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded',
        className
      )}
    >
      Cookie-beállítások
    </button>
  );
}

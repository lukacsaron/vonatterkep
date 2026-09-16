'use client';

import { DataFreshness } from '@/lib/dataFreshness';

/**
 * Shown when the cached train data has stopped being refreshed. Without it the
 * map presents stale positions as if the trains were moving right now.
 */
export function StaleDataBanner({ freshness }: { freshness: DataFreshness }) {
  if (!freshness.isStale || !freshness.label) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="absolute top-0 left-0 right-0 z-[1000] flex items-start gap-3 border-b border-amber-300 bg-amber-50/95 px-4 py-3 text-amber-900 shadow-sm backdrop-blur-sm"
    >
      <svg
        className="mt-0.5 h-5 w-5 flex-shrink-0"
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
          clipRule="evenodd"
        />
      </svg>
      <p className="text-sm leading-snug">
        <span className="font-semibold">A vonatadatok nem frissülnek.</span>{' '}
        A térképen látható pozíciók {freshness.label} frissültek utoljára, így nem
        a vonatok jelenlegi helyzetét mutatják.
      </p>
    </div>
  );
}

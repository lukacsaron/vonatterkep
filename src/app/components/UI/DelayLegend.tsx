const DELAY_BUCKETS = [
  { color: '#10b981', label: '0–4' },
  { color: '#eab308', label: '5–19' },
  { color: '#f97316', label: '20–59' },
  { color: '#ef4444', label: '60+' },
];

export function DelayLegend() {
  return (
    // A single strip rather than a card: on a phone the old panel covered a
    // quarter of the map. pointer-events-none keeps it from swallowing drags.
    <div className="pointer-events-none flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg bg-white/95 px-2.5 py-1.5 text-[11px] leading-none text-gray-700 shadow-md">
      <span className="sr-only">
        Színek jelentése: a vonat színe a késést mutatja percben. 5 perc fölött a
        késés percben is megjelenik a vonat mellett, nagyításkor.
      </span>
      <ul aria-hidden="true" className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
        {DELAY_BUCKETS.map(({ color, label }) => (
          <li key={label} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: color }}
            />
            {label}
          </li>
        ))}
      </ul>
      <span aria-hidden="true" className="text-gray-500">
        perc késés
      </span>
    </div>
  );
}

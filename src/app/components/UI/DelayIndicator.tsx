import { cn } from '@/lib/utils';
import { getDelayCategory, getDelayColor, formatDelay } from '@/lib/utils';
import { DelayCategory } from '@/types';

interface DelayIndicatorProps {
  delay: number;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

// The dot keeps the map's category colours. The text next to it uses darker
// shades of the same hues: the dot colours as text on white are 1.9-3.8:1,
// below the 4.5:1 WCAG AA minimum.
const TEXT_COLOR: Record<DelayCategory, string> = {
  [DelayCategory.ON_TIME]: '#047857',  // emerald-700
  [DelayCategory.MINOR]: '#a16207',    // yellow-700
  [DelayCategory.MODERATE]: '#c2410c', // orange-700
  [DelayCategory.SEVERE]: '#b91c1c',   // red-700
};

export function DelayIndicator({
  delay,
  showText = true,
  size = 'md',
  className
}: DelayIndicatorProps) {
  const category = getDelayCategory(delay);
  const color = getDelayColor(category);
  const label = formatDelay(delay);

  const sizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-3 w-3',
    lg: 'h-4 w-4',
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {/* Decorative: the same information is always given as text. */}
      <div
        className={cn(
          'rounded-full motion-safe:animate-pulse',
          sizeClasses[size]
        )}
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {showText ? (
        <span
          className={cn(
            'font-medium',
            size === 'sm' && 'text-xs',
            size === 'md' && 'text-sm',
            size === 'lg' && 'text-base'
          )}
          style={{ color: TEXT_COLOR[category] }}
        >
          {delay > 0 && <span className="sr-only">Késés: </span>}
          {label}
        </span>
      ) : (
        <span className="sr-only">{delay > 0 ? `Késés: ${label}` : label}</span>
      )}
    </div>
  );
}

import { cn } from '@/lib/utils';
import { getDelayCategory, getDelayColor, formatDelay } from '@/lib/utils';

interface DelayIndicatorProps {
  delay: number;
  showText?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function DelayIndicator({ 
  delay, 
  showText = true, 
  size = 'md',
  className 
}: DelayIndicatorProps) {
  const category = getDelayCategory(delay);
  const color = getDelayColor(category);
  
  const sizeClasses = {
    sm: 'h-2 w-2',
    md: 'h-3 w-3',
    lg: 'h-4 w-4',
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div 
        className={cn(
          'rounded-full animate-pulse',
          sizeClasses[size]
        )}
        style={{ backgroundColor: color }}
        aria-label={`Delay: ${formatDelay(delay)}`}
      />
      {showText && (
        <span 
          className={cn(
            'font-medium',
            size === 'sm' && 'text-xs',
            size === 'md' && 'text-sm',
            size === 'lg' && 'text-base'
          )}
          style={{ color }}
        >
          {formatDelay(delay)}
        </span>
      )}
    </div>
  );
}
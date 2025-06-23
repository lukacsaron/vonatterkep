import { TrainType } from '@/types';
import { cn } from '@/lib/utils';

interface TrainTypeBadgeProps {
  type: TrainType;
  className?: string;
}

const typeConfig: Record<TrainType, { label: string; color: string; bgColor: string }> = {
  [TrainType.IC]: { label: 'IC', color: 'text-blue-700', bgColor: 'bg-blue-100' },
  [TrainType.EC]: { label: 'EC', color: 'text-purple-700', bgColor: 'bg-purple-100' },
  [TrainType.RAILJET]: { label: 'RJ', color: 'text-red-700', bgColor: 'bg-red-100' },
  [TrainType.REGIONAL]: { label: 'REG', color: 'text-gray-700', bgColor: 'bg-gray-100' },
  [TrainType.SUBURBAN]: { label: 'S', color: 'text-green-700', bgColor: 'bg-green-100' },
  [TrainType.NIGHT]: { label: 'EN', color: 'text-indigo-700', bgColor: 'bg-indigo-100' },
};

export function TrainTypeBadge({ type, className }: TrainTypeBadgeProps) {
  const config = typeConfig[type];
  
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded text-xs font-medium',
        config.color,
        config.bgColor,
        className
      )}
    >
      {config.label}
    </span>
  );
}
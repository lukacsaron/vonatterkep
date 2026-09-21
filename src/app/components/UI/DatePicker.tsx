'use client';

import { useId } from 'react';
import { Calendar, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  date: Date;
  onDateChange: (date: Date) => void;
  className?: string;
  /** Visible group label, e.g. "Dátum és idő". Rendered above the two fields. */
  label?: string;
  labelClassName?: string;
}

export function DatePicker({ date, onDateChange, className, label, labelClassName }: DatePickerProps) {
  const id = useId();
  const groupLabelId = `${id}-label`;
  const dateId = `${id}-date`;
  const timeId = `${id}-time`;

  // Format date for input[type="date"]
  const formatDateForInput = (date: Date) => {
    return date.toISOString().split('T')[0];
  };

  // Format time for input[type="time"]
  const formatTimeForInput = (date: Date) => {
    return date.toTimeString().slice(0, 5);
  };

  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = new Date(date);
    const [year, month, day] = event.target.value.split('-').map(Number);
    newDate.setFullYear(year, month - 1, day);
    onDateChange(newDate);
  };

  const handleTimeChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newDate = new Date(date);
    const [hours, minutes] = event.target.value.split(':').map(Number);
    newDate.setHours(hours, minutes);
    onDateChange(newDate);
  };

  return (
    <div role="group" aria-labelledby={label ? groupLabelId : undefined}>
      {label && (
        <div id={groupLabelId} className={labelClassName}>
          {label}
        </div>
      )}
      <div className={cn('flex gap-2', className)}>
        <div className="relative flex-1">
          <label htmlFor={dateId} className="sr-only">Dátum</label>
          <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            id={dateId}
            type="date"
            value={formatDateForInput(date)}
            onChange={handleDateChange}
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>
        <div className="relative flex-1">
          <label htmlFor={timeId} className="sr-only">Időpont</label>
          <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            id={timeId}
            type="time"
            value={formatTimeForInput(date)}
            onChange={handleTimeChange}
            className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
        </div>
      </div>
    </div>
  );
}

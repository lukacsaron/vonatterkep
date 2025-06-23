'use client';

import { Calendar, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DatePickerProps {
  date: Date;
  onDateChange: (date: Date) => void;
  className?: string;
}

export function DatePicker({ date, onDateChange, className }: DatePickerProps) {
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
    <div className={cn('flex gap-2', className)}>
      <div className="relative flex-1">
        <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="date"
          value={formatDateForInput(date)}
          onChange={handleDateChange}
          className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
        />
      </div>
      <div className="relative flex-1">
        <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <input
          type="time"
          value={formatTimeForInput(date)}
          onChange={handleTimeChange}
          className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
        />
      </div>
    </div>
  );
}
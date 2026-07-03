'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface CustomDatePickerProps {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  placeholder?: string;
  required?: boolean;
}

export default function CustomDatePicker({
  value,
  onChange,
  className = '',
  placeholder = 'Select Date',
  required = false
}: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (value) {
      const parsed = new Date(value);
      if (!isNaN(parsed.getTime())) {
        setCurrentMonth(parsed);
      }
    }
  }, [value]);

  const daysInMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  };

  const startDayOfMonth = (date: Date) => {
    return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
  };

  const getDaysArray = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const totalDays = daysInMonth(currentMonth);
    const startDay = startDayOfMonth(currentMonth);

    const days: { dateStr: string; dayNum: number; isCurrentMonth: boolean }[] = [];

    const prevMonth = new Date(year, month - 1, 1);
    const prevTotalDays = daysInMonth(prevMonth);
    for (let i = startDay - 1; i >= 0; i--) {
      const day = prevTotalDays - i;
      const prevDate = new Date(year, month - 1, day);
      days.push({
        dateStr: formatDateISO(prevDate),
        dayNum: day,
        isCurrentMonth: false
      });
    }

    for (let i = 1; i <= totalDays; i++) {
      const curDate = new Date(year, month, i);
      days.push({
        dateStr: formatDateISO(curDate),
        dayNum: i,
        isCurrentMonth: true
      });
    }

    const remaining = 42 - days.length;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(year, month + 1, i);
      days.push({
        dateStr: formatDateISO(nextDate),
        dayNum: i,
        isCurrentMonth: false
      });
    }

    return days;
  };

  const formatDateISO = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  const changeMonth = (offset: number) => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + offset, 1));
  };

  const changeYear = (yearVal: number) => {
    setCurrentMonth(new Date(yearVal, currentMonth.getMonth(), 1));
  };

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const years = Array.from({ length: 20 }, (_, i) => new Date().getFullYear() - 10 + i);

  const displayValue = value ? (() => {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    const day = String(d.getDate()).padStart(2, '0');
    const month = d.toLocaleString('en-US', { month: 'short' });
    const year = d.getFullYear();
    return `${day}-${month}-${year}`;
  })() : '';

  return (
    <div ref={containerRef} className={`relative ${className.includes('w-') ? '' : 'w-full'} ${className}`}>
      <div className="relative">
        <input
          type="text"
          readOnly
          value={displayValue}
          onClick={() => setIsOpen(!isOpen)}
          placeholder={placeholder}
          required={required}
          className="w-full bg-[#FAF9F6]/40 border border-slate-200 rounded-xl px-3.5 py-2.5 pr-10 text-sm text-slate-800 font-semibold cursor-pointer focus:outline-none focus:border-theme focus:ring-2 focus:ring-theme/10 hover:bg-[#FAF9F6]/85 transition duration-150 shadow-2xs text-left border-solid"
        />
        <Calendar
          size={16}
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer hover:text-slate-650 transition-colors"
        />
      </div>

      {isOpen && (
        <div className="absolute z-50 left-0 mt-1.5 p-3.5 bg-white border border-slate-200/80 rounded-2xl shadow-xl w-64 animate-scale-up border-solid">
          <div className="flex justify-between items-center mb-3">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="p-1 rounded-lg hover:bg-slate-50 text-slate-500 hover:text-slate-850 cursor-pointer transition flex items-center justify-center border-none"
            >
              <ChevronLeft size={14} />
            </button>
            <div className="flex gap-1 text-[11px] font-bold">
              <select
                value={currentMonth.getMonth()}
                onChange={(e) => setCurrentMonth(new Date(currentMonth.getFullYear(), Number(e.target.value), 1))}
                className="bg-transparent border-none text-xs font-bold text-slate-700 cursor-pointer focus:outline-none focus:ring-0 p-0 text-[11px]"
              >
                {months.map((m, idx) => (
                  <option key={m} value={idx}>{m}</option>
                ))}
              </select>
              <select
                value={currentMonth.getFullYear()}
                onChange={(e) => changeYear(Number(e.target.value))}
                className="bg-transparent border-none text-xs font-bold text-slate-700 cursor-pointer focus:outline-none focus:ring-0 p-0 text-[11px]"
              >
                {years.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="p-1 rounded-lg hover:bg-slate-50 text-slate-500 hover:text-slate-855 cursor-pointer transition flex items-center justify-center border-none"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 text-center text-[9px] font-black text-slate-400 uppercase tracking-wider mb-1.5">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
              <div key={d}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 text-center">
            {getDaysArray().map((day, idx) => {
              const isSelected = day.dateStr === value;
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    onChange(day.dateStr);
                    setIsOpen(false);
                  }}
                  className={`h-7 w-7 rounded-lg text-xs font-bold transition flex items-center justify-center cursor-pointer border-none ${
                    isSelected
                      ? 'bg-theme-primary text-white shadow-sm'
                      : day.isCurrentMonth
                        ? 'text-slate-800 hover:bg-slate-50 hover:text-slate-950'
                        : 'text-slate-300 hover:bg-slate-50/50'
                  }`}
                >
                  {day.dayNum}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

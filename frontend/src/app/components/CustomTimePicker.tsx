'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Clock } from 'lucide-react';

interface CustomTimePickerProps {
  value: string; // e.g. "08:00"
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  required?: boolean;
}

export default function CustomTimePicker({
  value,
  onChange,
  placeholder = 'Select Time',
  className = '',
  required = false
}: CustomTimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Default to 08:00 if value is empty
  const timeParts = value ? value.split(':') : ['08', '00'];
  const [selectedHour, setSelectedHour] = useState(timeParts[0] || '08');
  const [selectedMinute, setSelectedMinute] = useState(timeParts[1] || '00');

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
      const parts = value.split(':');
      if (parts.length === 2) {
        setSelectedHour(parts[0]);
        setSelectedMinute(parts[1]);
      }
    }
  }, [value]);

  const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
  const minutes = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  const handleSelectTime = (h: string, m: string) => {
    onChange(`${h}:${m}`);
  };

  return (
    <div ref={containerRef} className={`relative ${className.includes('w-') ? '' : 'w-full'} ${className}`}>
      <div className="relative">
        <input
          type="text"
          readOnly
          value={value || ''}
          onClick={() => setIsOpen(!isOpen)}
          placeholder={placeholder}
          required={required}
          className="w-full bg-[#FAF9F6]/40 border border-slate-200 rounded-xl px-3.5 py-2.5 pr-10 text-sm text-slate-800 font-semibold cursor-pointer focus:outline-none focus:border-theme focus:ring-2 focus:ring-theme/10 hover:bg-[#FAF9F6]/85 transition duration-150 shadow-2xs text-left border-solid"
        />
        <Clock
          size={16}
          onClick={() => setIsOpen(!isOpen)}
          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 cursor-pointer hover:text-slate-650 transition-colors"
        />
      </div>

      {isOpen && (
        <div className="absolute z-50 left-0 mt-1.5 p-3.5 bg-white border border-slate-200/80 rounded-2xl shadow-xl w-48 animate-scale-up border-solid">
          <div className="flex justify-between items-center pb-2 border-b border-slate-100 mb-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Select Time</span>
            <span className="text-xs font-black text-theme-primary bg-theme-active px-2 py-0.5 rounded-lg">
              {selectedHour}:{selectedMinute}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 h-36">
            {/* Hours Column */}
            <div className="overflow-y-auto border-r border-slate-100 pr-1 flex flex-col gap-0.5 scrollbar-thin">
              <span className="text-[9px] font-black text-slate-450 uppercase text-center block sticky top-0 bg-white pb-1">Hour</span>
              {hours.map(h => {
                const isActive = h === selectedHour;
                return (
                  <button
                    key={h}
                    type="button"
                    onClick={() => {
                      setSelectedHour(h);
                      handleSelectTime(h, selectedMinute);
                    }}
                    className={`py-1 text-xs font-bold rounded-lg transition cursor-pointer border-none text-center ${
                      isActive ? 'bg-theme-primary text-white' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {h}
                  </button>
                );
              })}
            </div>

            {/* Minutes Column */}
            <div className="overflow-y-auto pl-1 flex flex-col gap-0.5 scrollbar-thin">
              <span className="text-[9px] font-black text-slate-450 uppercase text-center block sticky top-0 bg-white pb-1">Min</span>
              {minutes.map(m => {
                const isActive = m === selectedMinute;
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setSelectedMinute(m);
                      handleSelectTime(selectedHour, m);
                    }}
                    className={`py-1 text-xs font-bold rounded-lg transition cursor-pointer border-none text-center ${
                      isActive ? 'bg-theme-primary text-white' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {m}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="w-full mt-3 py-1.5 bg-slate-800 hover:bg-slate-900 rounded-xl text-white font-extrabold text-[10px] uppercase tracking-wider transition cursor-pointer border-none shadow-sm"
          >
            Confirm
          </button>
        </div>
      )}
    </div>
  );
}

'use client';

import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Check } from 'lucide-react';

export interface SelectOption {
  value: string | number;
  label: string;
}

interface CustomSelectProps {
  value: any;
  onChange: (val: any) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Select Option',
  className = '',
  disabled = false
}: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
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

  const selectedOption = options.find(o => o.value === value || (value !== undefined && String(o.value) === String(value)));

  return (
    <div ref={containerRef} className={`relative ${className.includes('w-') ? '' : 'w-full'} ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className="w-full bg-[#FAF9F6]/40 border border-slate-200 rounded-xl px-3 py-2 pr-8 text-sm text-slate-800 text-left font-semibold cursor-pointer focus:outline-none focus:border-theme focus:ring-2 focus:ring-theme/10 hover:bg-[#FAF9F6]/85 transition duration-150 shadow-2xs flex justify-between items-center select-none disabled:opacity-50 disabled:cursor-not-allowed border-solid"
      >
        <span className="truncate">{selectedOption ? selectedOption.label : placeholder}</span>
        <ChevronDown
          size={16}
          className={`text-slate-500 transition-transform duration-200 shrink-0 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 max-h-60 overflow-y-auto bg-white border border-slate-200/80 rounded-xl shadow-xl animate-scale-up py-1 border-solid">
          {options.length === 0 ? (
            <div className="px-3.5 py-2 text-xs text-slate-400 font-semibold text-center">No options available</div>
          ) : (
            options.map(option => {
              const isSelected = option.value === value || (value !== undefined && String(option.value) === String(value));
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setIsOpen(false);
                  }}
                  className={`w-full text-left px-3.5 py-2 text-xs font-bold transition duration-105 flex items-center justify-between cursor-pointer border-none ${
                    isSelected
                      ? 'bg-theme-active text-theme-active'
                      : 'text-slate-655 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span>{option.label}</span>
                  {isSelected && <Check size={12} className="text-theme-primary shrink-0 ml-1.5" />}
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

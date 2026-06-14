'use client';

import React, { useState } from 'react';
import { 
  BookOpen, 
  Search, 
  HelpCircle, 
  CalendarDays, 
  Database, 
  Scale, 
  Info,
  Clock
} from 'lucide-react';

interface HelpSection {
  id: string;
  title: string;
  icon: any;
  content: string[];
}

export default function HelpCenter() {
  const [searchQuery, setSearchQuery] = useState('');

  const helpSections: HelpSection[] = [
    {
      id: 'roster-codes',
      title: 'Roster Code Descriptions',
      icon: CalendarDays,
      content: [
        "P (Present - General/Day Shift): Denotes standard daytime or general shift attendance.",
        "P/N (Present - Night Duty): Denotes present on a night shift (between 22:00 to 06:00). Triggers 80 mins Weightage allowance for NDA statements.",
        "R (Weekly Rest): Represents the employee's designated weekly rest day. Rest day schedule is configured per employee profile templates.",
        "CR (Compensatory Rest): A leave day consumed from accumulated rest-day extra-duty credits.",
        "CL (Casual Leave): Marked when Casual Leave is taken. Deducts 1 unit from employee CL leave bank ledger.",
        "LAP (Average Pay Leave): Marked when Leave on Average Pay is consumed. Deducts 1 unit from LAP bank ledger.",
        "Sick (Sick Leave): Marked for medically unfit periods or medical memo entries.",
        "SCL (Special Casual Leave): Used for special administrative assignments or approved special circumstances.",
        "PH (Public Holiday): Marked for national or regional holiday days. Highlighted in light yellow on sheets."
      ]
    },
    {
      id: 'cr-ledger',
      title: 'Compensatory Rest (CR) Rules',
      icon: Scale,
      content: [
        "Accrual Triggers: If an employee works a full shift (status P or P/N) on their designated default rest day, the database automatic trigger logs a CR earned credit in the ledger.",
        "Chronological Pairing: When a 'CR' status code is saved in the roster grid, it chronologically consumes the oldest available unconsumed earned credit.",
        "Manual Adjustments: Admin panel allows manually adding earned CRs for special assignments or adjusting the balance directly under the employee profiles."
      ]
    },
    {
      id: 'monthly-cycle',
      title: '11th to 10th Monthly Cycle',
      icon: Clock,
      content: [
        "The operations department runs on a fixed monthly billing and attendance cycle from the 11th of the starting month to the 10th of the next month.",
        "Example: The 'June 2026 Roster' represents the exact duration from May 11, 2026 to June 10, 2026.",
        "Roster Sheet downloads, print margins, and PDF/Excel files align dynamically to this 31-day cycle boundary."
      ]
    },
    {
      id: 'backups-recovery',
      title: 'Backups & Recovery Safety',
      icon: Database,
      content: [
        "Standard SQLite Copies: Manual database snapshots are saved as complete '.db' files in the 'backups' folder.",
        "Integrity Checks: Creating or restoring a database snapshot triggers a SQLite 'PRAGMA integrity_check;' check. Corrupt files are automatically aborted to protect database files.",
        "Safety Copy: Restoring a snapshot creates a copy of the current database state named 'pre_restore_safety.db' prior to replacement, allowing rollbacks if needed."
      ]
    }
  ];

  const filteredSections = helpSections.filter(section => {
    const matchesTitle = section.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesContent = section.content.some(para => para.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesTitle || matchesContent;
  });

  return (
    <div className="p-6 space-y-6">
      
      {/* Title block */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
            Operations Help Center
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Documentation on roster status codes, compensatory rest algorithms, and database backups.
          </p>
        </div>

        {/* Search bar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs w-full md:w-64 shadow-xs">
          <Search size={14} className="text-slate-400" />
          <input 
            type="text" 
            placeholder="Search help topics..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-transparent border-none text-slate-800 placeholder-slate-400 focus:outline-none w-full"
          />
        </div>
      </div>

      {/* Guide Panel */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-650 font-bold leading-relaxed">
          Kolkata Metro S&T Staff Management System is designed to run 100% offline. 
          All database files, audit logs, and backups are stored on this machine. 
          Use this documentation center for questions on shift schedules and attendance rules.
        </p>
      </div>

      {/* Help topics list */}
      <div className="space-y-6">
        {filteredSections.length === 0 ? (
          <div className="glass-panel p-12 text-center rounded-xl bg-white">
            <HelpCircle className="mx-auto text-slate-300 mb-2" size={32} />
            <p className="text-sm font-bold text-slate-500">No help topics found matching your query.</p>
          </div>
        ) : (
          filteredSections.map(section => (
            <div key={section.id} className="glass-panel p-6 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-200 pb-3">
                <section.icon size={18} className="text-blue-600" />
                {section.title}
              </h3>
              
              <ul className="space-y-3.5 list-disc pl-4 text-xs font-semibold text-slate-600 leading-relaxed">
                {section.content.map((para, idx) => (
                  <li key={idx}>
                    {para}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>

    </div>
  );
}

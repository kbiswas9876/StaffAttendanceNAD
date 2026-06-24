'use client';

import React, { useState, useEffect } from 'react';
import { 
  FileSpreadsheet, 
  Moon, 
  CalendarDays,
  AlertTriangle,
  Info,
  Settings
} from 'lucide-react';
import { getEmployees, getAttendanceLogs, Employee, AttendanceLog, getSections, Section } from '../../lib/api';
import { getTranslation } from '../../lib/translations';

interface NDAStaffRow {
  sl: number;
  pf_number: string;
  name: string;
  designation: string;
  level: number;
  dates: string;
  section_code: string;
  rawDates?: { day: number, monthStr: string }[];
  total_days: number;
  total_hours: number;
  weightage: string;
}

const getRosterMonthRangeName = (month: number, year: number) => {
  const monthsList = [
    { name: 'January', val: 0 },
    { name: 'February', val: 1 },
    { name: 'March', val: 2 },
    { name: 'April', val: 3 },
    { name: 'May', val: 4 },
    { name: 'June', val: 5 },
    { name: 'July', val: 6 },
    { name: 'August', val: 7 },
    { name: 'September', val: 8 },
    { name: 'October', val: 9 },
    { name: 'November', val: 10 },
    { name: 'December', val: 11 },
  ];
  let prevM = month - 1;
  let prevY = year;
  if (prevM < 0) {
    prevM = 11;
    prevY = year - 1;
  }
  const prevMonthName = monthsList[prevM].name.toUpperCase();
  const currentMonthName = monthsList[month].name.toUpperCase();
  if (prevY !== year) {
    return `${prevMonthName}-${prevY} & ${currentMonthName}-${year}`;
  }
  return `${prevMonthName} - ${currentMonthName} ${year}`;
};

export default function NightDutyNDA() {
  const [activeSection, setActiveSection] = useState<string>('KKVS');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<string | null>(null);
  const [billUnit, setBillUnit] = useState<string>('');
  const [lang, setLang] = useState<'en' | 'bn' | 'hi'>('en');
  const [sections, setSections] = useState<Section[]>([]);

  const getSectionDisplayName = (code: string) => {
    const sec = sections.find(s => s.section_code === code);
    return sec ? `${sec.section_name} (${code})` : code;
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setLang((localStorage.getItem('erp_lang') || 'en') as 'en' | 'bn' | 'hi');
    }
    const handleLangChange = () => {
      if (typeof window !== 'undefined') {
        setLang((localStorage.getItem('erp_lang') || 'en') as 'en' | 'bn' | 'hi');
      }
    };
    window.addEventListener('erp_lang_changed', handleLangChange);
    return () => window.removeEventListener('erp_lang_changed', handleLangChange);
  }, []);

  useEffect(() => {
    setBillUnit(activeSection === 'KMUK' ? '2201-807' : '2201-806');
  }, [activeSection]);
  
  // Date period state
  const [selectedMonth, setSelectedMonth] = useState<number>(5); // June (0-indexed 5)
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [ndaRows, setNdaRows] = useState<NDAStaffRow[]>([]);
  const [backendStatus, setBackendStatus] = useState<'online' | 'offline'>('offline');
  const [datesFormat, setDatesFormat] = useState<'simple' | 'full'>('simple');

  const formatDates = (row: NDAStaffRow) => {
    if (!row.rawDates || row.rawDates.length === 0) return 'Nil';
    if (datesFormat === 'simple') {
      return row.rawDates.map(d => d.day).join(',');
    } else {
      return row.rawDates.map(d => `${d.day} ${d.monthStr}`).join(', ');
    }
  };

  // Signatory details states
  const [signatoryLeftName, setSignatoryLeftName] = useState('');
  const [signatoryLeftTitle, setSignatoryLeftTitle] = useState('');
  const [signatoryRight, setSignatoryRight] = useState('Dy. CPO');
  const [showSigConfig, setShowSigConfig] = useState(false);

  // Load default signatories based on loaded employees in the section
  const updateSignatoryFromLocalStorage = () => {
    if (employees.length > 0) {
      const savedId = localStorage.getItem(`erp_active_in_charge_${activeSection}`);
      if (savedId) {
        const matched = employees.find(e => e.emp_id === Number(savedId));
        if (matched) {
          setSignatoryLeftName(matched.name);
          setSignatoryLeftTitle(matched.designation);
          return true;
        }
      }
    }
    return false;
  };

  useEffect(() => {
    if (employees.length > 0) {
      const updated = updateSignatoryFromLocalStorage();
      if (!updated) {
        // Fall back to priority order search
        const eligible = employees.filter(emp => {
          const isCorrectSec = activeSection === 'ALL' || emp.section_code === activeSection;
          if (!isCorrectSec) return false;
          const desig = (emp.designation || '').toUpperCase();
          return desig.includes('SSE') || desig.includes('JE') || desig.includes('IN-CHARGE') || desig.includes('IN CHARGE');
        });

        const getPriorityScore = (emp: Employee) => {
          const desig = (emp.designation || '').toUpperCase();
          if (desig.includes('IN-CHARGE') || desig.includes('IN CHARGE')) return 3;
          if (desig.includes('SSE')) return 2;
          if (desig.includes('JE')) return 1;
          return 0;
        };

        const sorted = [...eligible].sort((a, b) => getPriorityScore(b) - getPriorityScore(a));

        if (sorted.length > 0) {
          setSignatoryLeftName(sorted[0].name);
          setSignatoryLeftTitle(sorted[0].designation);
        } else {
          setSignatoryLeftName('');
          setSignatoryLeftTitle(activeSection === 'ALL' ? 'SSE/Sig/O&M/In-Charge' : `SSE/Sig/${activeSection}/IC`);
        }
      }
    }
  }, [employees, activeSection]);

  useEffect(() => {
    const handleInChargeChange = () => {
      updateSignatoryFromLocalStorage();
    };
    window.addEventListener('erp_in_charge_changed', handleInChargeChange);
    return () => window.removeEventListener('erp_in_charge_changed', handleInChargeChange);
  }, [employees, activeSection]);

  // Test Python backend connection on mount
  useEffect(() => {
    const checkBackend = async () => {
      try {
        await fetch('http://127.0.0.1:8000/api/lines');
        setBackendStatus('online');
      } catch (e) {
        setBackendStatus('offline');
      }
    };
    checkBackend();
  }, []);

  const monthsList = [
    { name: 'January', val: 0 },
    { name: 'February', val: 1 },
    { name: 'March', val: 2 },
    { name: 'April', val: 3 },
    { name: 'May', val: 4 },
    { name: 'June', val: 5 },
    { name: 'July', val: 6 },
    { name: 'August', val: 7 },
    { name: 'September', val: 8 },
    { name: 'October', val: 9 },
    { name: 'November', val: 10 },
    { name: 'December', val: 11 },
  ];

  const loadNDAData = async (section: string, month: number, year: number) => {
    setLoading(true);
    try {
      let currentSections = sections;
      if (currentSections.length === 0) {
        try {
          currentSections = await getSections();
          setSections(currentSections);
        } catch (e) {
          console.error("Failed to load sections", e);
        }
      }

      let activeSectionsList: string[] = [];
      if (section === 'ALL' && typeof window !== 'undefined') {
        const lineId = localStorage.getItem('erp_active_line_id') || '1';
        const stored = localStorage.getItem('erp_join_sections');
        let hasStored = false;
        if (stored) {
          hasStored = true;
          try {
            activeSectionsList = JSON.parse(stored);
          } catch (e) {}
        }
        if (!hasStored) {
          activeSectionsList = currentSections.filter(s => s.line_id === Number(lineId)).map(s => s.section_code);
        }
      }

      const emps = await getEmployees(section === 'ALL' ? undefined : section);
      const filteredEmps = section === 'ALL'
        ? emps.filter(e => e.section_code && activeSectionsList.includes(e.section_code))
        : emps;
      
      setEmployees(filteredEmps);

      // Compute date ranges
      let prevM = month - 1;
      let prevY = year;
      if (prevM < 0) { prevM = 11; prevY = year - 1; }
      
      const startDateStr = `${prevY}-${String(prevM + 1).padStart(2, '0')}-11`;
      const endDateStr = `${year}-${String(month + 1).padStart(2, '0')}-10`;

      let jointLogs: AttendanceLog[] = [];
      if (section === 'ALL') {
        for (const secCode of activeSectionsList) {
          try {
            const secLogs = await getAttendanceLogs(secCode, startDateStr, endDateStr);
            jointLogs = [...jointLogs, ...secLogs];
          } catch (e) {
            console.error(`Failed to load logs for section ${secCode}`, e);
          }
        }
      } else {
        jointLogs = await getAttendanceLogs(section, startDateStr, endDateStr);
      }

      // Process and extract P/N shifts for each employee
      const rowsList: NDAStaffRow[] = [];

      filteredEmps.forEach((emp) => {
        const empLogs = jointLogs.filter(log => log.emp_id === emp.emp_id && log.status === 'P/N');
        
        // Sort logs by date order
        empLogs.sort((a, b) => a.date.localeCompare(b.date));
        
        const dayNumbers = empLogs.map((log) => {
          const dateObj = new Date(log.date);
          return dateObj.getDate();
        });

        const rawDates = empLogs.map((log) => {
          const dateObj = new Date(log.date);
          const day = dateObj.getDate();
          const monthStr = dateObj.toLocaleString('en-US', { month: 'short' });
          return { day, monthStr };
        });

        const total_days = dayNumbers.length;
        const total_hours = total_days * 8;
        
        // Calculate weightage: 80 mins per day
        const totalMins = total_days * 80;
        const wtHrs = Math.floor(totalMins / 60);
        const wtMins = totalMins % 60;
        const weightage = `${String(wtHrs).padStart(2, '0')} HRS ${String(wtMins).padStart(2, '0')} MIN.`;

        rowsList.push({
          sl: 0, // Assigned after sorting
          pf_number: emp.pf_number,
          name: emp.name,
          designation: emp.designation,
          level: emp.level,
          section_code: emp.section_code || '',
          dates: dayNumbers.length > 0 ? dayNumbers.join(',') : 'Nil',
          rawDates,
          total_days,
          total_hours,
          weightage
        });
      });

      // Sorting
      if (section === 'ALL') {
        rowsList.sort((a, b) => {
          const secA = a.section_code || '';
          const secB = b.section_code || '';
          if (secA !== secB) {
            return secA.localeCompare(secB);
          }
          return b.level - a.level || a.designation.localeCompare(b.designation);
        });
      } else {
        rowsList.sort((a, b) => b.level - a.level || a.designation.localeCompare(b.designation));
      }
      
      // Re-adjust serial numbers after sorting
      let lastSec = '';
      let secCounter = 0;
      rowsList.forEach((r, i) => {
        if (section === 'ALL') {
          if (r.section_code !== lastSec) {
            lastSec = r.section_code;
            secCounter = 0;
          }
          secCounter++;
          r.sl = secCounter;
        } else {
          r.sl = i + 1;
        }
      });

      setNdaRows(rowsList);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const section = localStorage.getItem('erp_active_section') || 'KKVS';
      setActiveSection(section);
      loadNDAData(section, selectedMonth, selectedYear);

      const handleSectionChanged = () => {
        const sec = localStorage.getItem('erp_active_section') || 'KKVS';
        setActiveSection(sec);
        loadNDAData(sec, selectedMonth, selectedYear);
      };

      window.addEventListener('erp_section_changed', handleSectionChanged);
      return () => {
        window.removeEventListener('erp_section_changed', handleSectionChanged);
      };
    }
  }, [selectedMonth, selectedYear]);

  // Export to Excel / PDF Trigger
  const handleExport = async (format: 'excel' | 'pdf') => {
    if (backendStatus === 'offline') {
      alert("Error: Python microservice backend is currently offline. Please start FastAPI backend service.");
      return;
    }

    setExporting(format);
    const monthText = getRosterMonthRangeName(selectedMonth, selectedYear);
    const matchedSection = sections.find(s => s.section_code === activeSection);
    const sectionName = activeSection === 'ALL' 
      ? 'All Sections' 
      : matchedSection ? matchedSection.section_name : activeSection;

    const payload = {
      month_name: monthText,
      section_code: activeSection,
      section_name: sectionName,
      ref_no: `SSE/Sig/${activeSection}/${new Date().getFullYear()}/ND`,
      bill_unit: billUnit.trim() || '(Enter Bill Unit No.)',
      date_str: new Date().toLocaleDateString('en-GB').replace(/\//g, '.'),
      signatory_left: signatoryLeftName ? `${signatoryLeftName}\n${signatoryLeftTitle}` : signatoryLeftTitle,
      signatory_right: signatoryRight,
      rows: ndaRows.map(r => ({
        sl: r.sl,
        pf_number: r.pf_number,
        name: r.name,
        designation: r.designation,
        level: r.level,
        dates: r.dates === 'Nil' ? '' : (formatDates(r) === 'Nil' ? '' : formatDates(r)),
        total_days: r.total_days,
        section_code: r.section_code || '',
        remarks: ''
      }))
    };

    try {
      const endpoint = `http://127.0.0.1:8000/api/export/night-duty/${format}`;
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Export server returned HTTP ${res.status}`);
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Night_Duty_NDA_${activeSection}_${monthText}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failure occurred:", e);
      alert(`Export Failed: Could not reach the Python FastAPI service.`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="p-6 space-y-6">
      
      {/* Title */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
            {getTranslation(lang, 'Night Duty Allowance (NDA) Calculator')}
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-theme-active text-theme-active border border-theme-active font-bold uppercase tracking-wider">
              {activeSection === 'ALL' ? getTranslation(lang, 'Joint View') : `${activeSection} ${getTranslation(lang, 'Section')}`}
            </span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Calculates 80 mins weightage allowance per night shift (P/N) and generates official billing formats.
          </p>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Period selector */}
          <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-lg p-1.5 text-sm text-slate-800">
            <CalendarDays size={16} className="text-slate-500 ml-1" />
            <select 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(Number(e.target.value))}
              className="bg-transparent border-none focus:outline-none text-slate-800 font-bold cursor-pointer text-xs"
            >
              {monthsList.map((m) => {
                let prevM = m.val - 1;
                if (prevM < 0) prevM = 11;
                const prevName = monthsList[prevM].name.substring(0, 3);
                const currName = m.name.substring(0, 3);
                return (
                  <option key={m.val} value={m.val} className="bg-white text-slate-800">
                    {prevName} - {currName}
                  </option>
                );
              })}
            </select>
            
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent border-none focus:outline-none text-slate-800 font-bold cursor-pointer ml-1 text-xs"
            >
              <option value={2026} className="bg-white text-slate-800">2026</option>
              <option value={2025} className="bg-white text-slate-800">2025</option>
            </select>
          </div>

          {/* Signatories Config Toggle */}
          <button
            onClick={() => setShowSigConfig(!showSigConfig)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border font-bold text-xs tracking-wider uppercase transition shadow-sm cursor-pointer ${showSigConfig ? 'bg-theme-active text-theme-active border-theme-active' : 'bg-slate-100 border-slate-250 text-slate-700 hover:bg-slate-200'}`}
          >
            <Settings size={14} />
            {getTranslation(lang, 'Signatories')}
          </button>

          {/* Export buttons */}
          <button
            onClick={() => handleExport('excel')}
            disabled={exporting !== null}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-theme-primary hover-bg-theme-primary text-white font-bold text-xs tracking-wider uppercase transition shadow-sm cursor-pointer"
          >
            <FileSpreadsheet size={14} />
            {exporting === 'excel' ? 'Exporting...' : getTranslation(lang, 'Export Excel')}
          </button>
        </div>
      </div>

      {/* Signatory Config Panel */}
      {showSigConfig && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 text-xs font-bold text-slate-755 select-none">
          <div className="flex flex-col gap-1.5">
            <label className="block text-[10px] uppercase text-slate-400 tracking-wider">Left Signatory (SSE In-Charge)</label>
            <select
              value={signatoryLeftName}
              onChange={(e) => {
                setSignatoryLeftName(e.target.value);
                const matched = employees.find(emp => emp.name === e.target.value);
                if (matched) {
                  setSignatoryLeftTitle(matched.designation);
                }
              }}
              className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none cursor-pointer"
            >
              <option value="">-- Custom/Manual --</option>
              {employees.map(e => (
                <option key={e.emp_id} value={e.name}>{e.name} ({e.designation})</option>
              ))}
            </select>
            <input
              type="text"
              value={signatoryLeftName}
              onChange={(e) => setSignatoryLeftName(e.target.value)}
              placeholder="Type Manual Name..."
              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-805 focus:outline-none focus:border-[var(--theme-icon-bg)]"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Left Signatory Designation</label>
            <input
              type="text"
              value={signatoryLeftTitle}
              onChange={(e) => setSignatoryLeftTitle(e.target.value)}
              placeholder="e.g. SSE/Sig/KKVS/IC"
              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-805 focus:outline-none focus:border-[var(--theme-icon-bg)]"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Right Signatory Designation</label>
            <input
              type="text"
              value={signatoryRight}
              onChange={(e) => setSignatoryRight(e.target.value)}
              placeholder="e.g. Dy. CPO"
              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-805 focus:outline-none focus:border-[var(--theme-icon-bg)]"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Bill Unit No.</label>
            <input
              type="text"
              value={billUnit}
              onChange={(e) => setBillUnit(e.target.value)}
              placeholder="e.g. 2201-806"
              className="w-full border border-slate-250 rounded-lg px-2 py-1.5 text-xs text-slate-805 focus:outline-none focus:border-[var(--theme-icon-bg)] font-semibold"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Dates Format</label>
            <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-slate-700">
              <button
                type="button"
                onClick={() => setDatesFormat('simple')}
                className={`flex-1 text-center py-1 rounded-md text-xs font-extrabold transition cursor-pointer ${
                  datesFormat === 'simple' ? 'bg-white shadow-xs text-theme-primary' : 'hover:bg-slate-50'
                }`}
              >
                Simple
              </button>
              <button
                type="button"
                onClick={() => setDatesFormat('full')}
                className={`flex-1 text-center py-1 rounded-md text-xs font-extrabold transition cursor-pointer ${
                  datesFormat === 'full' ? 'bg-white shadow-xs text-theme-primary' : 'hover:bg-slate-50'
                }`}
              >
                Full
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backend Status Warning */}
      {backendStatus === 'offline' && (
        <div className="bg-amber-50 border border-amber-200 px-5 py-3 rounded-xl flex items-start gap-3 text-xs text-amber-900">
          <AlertTriangle size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-amber-800">Python Export Microservice is Offline</p>
            <p>
              To download styled Excel workbooks and professional ReportLab PDF statements, please start the Python FastAPI backend on your system by running:
              <code className="bg-slate-100 text-amber-700 font-mono px-2 py-0.5 rounded border border-slate-200 ml-1.5 font-bold">
                python backend/main.py
              </code>
            </p>
          </div>
        </div>
      )}

      {/* NDA Weightage Guide Card */}
      <div className="relative overflow-hidden bg-gradient-to-r from-[var(--theme-active-bg)]/75 to-[var(--theme-active-bg)]/35 border border-theme-active/60 rounded-2xl p-5 flex items-start gap-4 shadow-xs select-none">
        <div className="absolute top-0 left-0 w-1.5 h-full bg-theme-primary opacity-80"></div>
        <div className="w-9 h-9 rounded-xl bg-theme-active border border-theme-active flex items-center justify-center text-theme-primary shadow-sm shrink-0">
          <Info size={18} className="stroke-[2.5]" />
        </div>
        <div className="text-xs text-slate-700 space-y-2 flex-1 font-semibold">
          <h4 className="font-black text-slate-855 text-xs uppercase tracking-wider">{getTranslation(lang, 'NDA Weightage Algorithm Calculation')}</h4>
          <p className="leading-relaxed">
            The system extracts shift data matching the code <strong className="text-theme-primary bg-theme-active px-1.5 py-0.5 rounded font-mono">P/N</strong> (Present with Night Duty) and applies the following computations:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="bg-white/80 border border-theme-active/60 rounded-xl p-3 flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Total Working Hours</span>
              <span className="text-xs font-black text-slate-800">
                Total Shifts <span className="text-theme-primary font-extrabold">×</span> 8 Hours
              </span>
            </div>
            <div className="bg-white/80 border border-theme-active/60 rounded-xl p-3 flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Weightage Allowance</span>
              <span className="text-xs font-black text-slate-800">
                Total Shifts <span className="text-theme-primary font-extrabold">×</span> 80 Minutes <span className="text-slate-400 font-bold">(1h 20m per shift)</span>
              </span>
            </div>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            * Shift results are grouped and sorted hierarchically by Employee Pay Level according to official establishment rules.
          </p>
        </div>
      </div>

      {/* NDA Preview Table */}
      <div className="glass-panel rounded-xl border border-slate-200 flex flex-col overflow-hidden bg-white shadow-sm">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Moon size={18} className="text-theme-primary" />
            {getTranslation(lang, 'Night Duty Allowance Statement Preview')}
          </h3>
          <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-650">
            {ndaRows.length} Rows
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-fixed">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-bold text-slate-500 uppercase bg-slate-50">
                <th className="py-3 px-5 w-[5%] text-center">{getTranslation(lang, 'SL')}</th>
                <th className="py-3 px-5 w-[15%]">{getTranslation(lang, 'P.F. No.')}</th>
                <th className="py-3 px-5 w-[20%]">{getTranslation(lang, 'Name of Staff')}</th>
                <th className="py-3 px-5 w-[15%]">{getTranslation(lang, 'Desig')}</th>
                <th className="py-3 px-5 text-center w-[8%]">{getTranslation(lang, 'Level')}</th>
                <th className="py-3 px-5 w-[15%]">{getTranslation(lang, 'Night Duty Dates')}</th>
                <th className="py-3 px-5 text-center w-[8%]">{getTranslation(lang, 'Total Days')}</th>
                <th className="py-3 px-5 text-center w-[8%]">{getTranslation(lang, 'Total Hours')}</th>
                <th className="py-3 px-5 text-center w-[11%]">{getTranslation(lang, 'Weightage')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-400 font-bold">
                    Computing NDA statements...
                  </td>
                </tr>
              ) : ndaRows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-400 text-xs font-semibold">
                    No staff roster entries found. Ensure that attendance is loaded.
                  </td>
                </tr>
              ) : (
                (() => {
                  let lastSection = '';
                  return ndaRows.flatMap((row) => {
                    const showSectionHeader = activeSection === 'ALL' && row.section_code !== lastSection;
                    if (showSectionHeader) {
                      lastSection = row.section_code;
                    }
                    const rows = [];
                    if (showSectionHeader) {
                      rows.push(
                        <tr key={`sec-header-${row.section_code}`} className="bg-slate-100 font-extrabold text-[11px] tracking-wider text-slate-700 uppercase no-print select-none">
                          <td colSpan={9} className="py-2 px-5 text-left border-y border-slate-200 bg-slate-150">
                            <span className="bg-theme-primary text-white font-black px-2 py-0.5 rounded mr-2 text-[9px] uppercase tracking-widest shadow-xs">Section</span>
                            <span className="font-black text-slate-800">
                              {getSectionDisplayName(row.section_code || '')}
                            </span>
                          </td>
                        </tr>
                      );
                    }
                    rows.push(
                      <tr key={row.pf_number} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3 px-5 text-center text-slate-400 font-bold">{row.sl}</td>
                        <td className="py-3 px-5 font-mono text-slate-550 text-xs">{row.pf_number}</td>
                        <td className="py-3 px-5 font-bold text-slate-800">{row.name}</td>
                        <td className="py-3 px-5">
                          <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">
                            {row.designation}
                          </span>
                        </td>
                        <td className="py-3 px-5 text-center">
                          <span className="text-xs font-extrabold text-theme-active">Lvl {row.level}</span>
                        </td>
                        <td className="py-3 px-5 text-xs text-slate-655 max-w-[200px] truncate" title={formatDates(row)}>
                          {formatDates(row)}
                        </td>
                        <td className="py-3 px-5 text-center font-bold text-slate-800">{row.total_days}</td>
                        <td className="py-3 px-5 text-center font-mono text-slate-550 text-xs">{row.total_hours} Hrs</td>
                        <td className="py-3 px-5 text-center font-bold text-theme-active">{row.weightage}</td>
                      </tr>
                    );
                    return rows;
                  });
                })()
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

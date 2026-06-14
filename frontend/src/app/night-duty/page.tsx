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
import { getEmployees, getAttendanceLogs, Employee, AttendanceLog } from '../../lib/api';

interface NDAStaffRow {
  sl: number;
  pf_number: string;
  name: string;
  designation: string;
  level: number;
  dates: string;
  total_days: number;
  total_hours: number;
  weightage: string;
}

export default function NightDutyNDA() {
  const [activeSection, setActiveSection] = useState<string>('KKVS');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<string | null>(null);
  
  // Date period state
  const [selectedMonth, setSelectedMonth] = useState<number>(5); // June (0-indexed 5)
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [ndaRows, setNdaRows] = useState<NDAStaffRow[]>([]);
  const [backendStatus, setBackendStatus] = useState<'online' | 'offline'>('offline');

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
      const emps = await getEmployees(section === 'ALL' ? undefined : section);
      setEmployees(emps);

      // Compute date ranges
      let prevM = month - 1;
      let prevY = year;
      if (prevM < 0) { prevM = 11; prevY = year - 1; }
      
      const startDateStr = `${prevY}-${String(prevM + 1).padStart(2, '0')}-11`;
      const endDateStr = `${year}-${String(month + 1).padStart(2, '0')}-10`;

      const logs = await getAttendanceLogs(
        section === 'ALL' ? 'KKVS' : section,
        startDateStr,
        endDateStr
      );
      let jointLogs = [...logs];
      if (section === 'ALL') {
        const logsKmuk = await getAttendanceLogs('KMUK', startDateStr, endDateStr);
        jointLogs = [...jointLogs, ...logsKmuk];
      }

      // Process and extract P/N shifts for each employee
      const rowsList: NDAStaffRow[] = [];
      let slCounter = 1;

      emps.forEach((emp) => {
        const empLogs = jointLogs.filter(log => log.emp_id === emp.emp_id && log.status === 'P/N');
        
        // Sort logs by date order
        empLogs.sort((a, b) => a.date.localeCompare(b.date));
        
        const dayNumbers = empLogs.map((log) => {
          const dateObj = new Date(log.date);
          return dateObj.getDate();
        });

        const total_days = dayNumbers.length;
        const total_hours = total_days * 8;
        
        // Calculate weightage: 80 mins per day
        const totalMins = total_days * 80;
        const wtHrs = Math.floor(totalMins / 60);
        const wtMins = totalMins % 60;
        const weightage = `${String(wtHrs).padStart(2, '0')} HRS, ${String(wtMins).padStart(2, '0')}MIN.`;

        rowsList.push({
          sl: slCounter++,
          pf_number: emp.pf_number,
          name: emp.name,
          designation: emp.designation,
          level: emp.level,
          dates: dayNumbers.length > 0 ? dayNumbers.join(',') : 'Nil',
          total_days,
          total_hours,
          weightage
        });
      });

      // Grouping by level descending and designation
      rowsList.sort((a, b) => b.level - a.level || a.designation.localeCompare(b.designation));
      
      // Re-adjust serial numbers after sorting
      rowsList.forEach((r, i) => {
        r.sl = i + 1;
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
    const monthText = monthsList[selectedMonth].name.toUpperCase() + `-${selectedYear}`;
    const sectionName = activeSection === 'ALL' 
      ? 'KKVS & KMUK Sections' 
      : activeSection === 'KKVS' 
        ? 'Kavi Subhash Section' 
        : 'Tollygunge Section';

    const payload = {
      month_name: monthText,
      section_code: activeSection,
      section_name: sectionName,
      ref_no: `SSE/Sig/${activeSection}/${new Date().getFullYear()}/ND`,
      bill_unit: activeSection === 'KKVS' ? '2201-806' : '2201-807',
      date_str: new Date().toLocaleDateString('en-GB').replace(/\//g, '.'),
      signatory_left: signatoryLeftName ? `${signatoryLeftName}\n${signatoryLeftTitle}` : signatoryLeftTitle,
      signatory_right: signatoryRight,
      rows: ndaRows.map(r => ({
        sl: r.sl,
        pf_number: r.pf_number,
        name: r.name,
        designation: r.designation,
        level: r.level,
        dates: r.dates === 'Nil' ? '' : r.dates,
        total_days: r.total_days,
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
            Night Duty Allowance (NDA) Calculator
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 font-bold uppercase tracking-wider">
              {activeSection === 'ALL' ? 'Joint View' : `${activeSection} Section`}
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
              className="bg-transparent border-none focus:outline-none text-slate-800 font-bold cursor-pointer"
            >
              {monthsList.map((m) => (
                <option key={m.val} value={m.val} className="bg-white text-slate-800">
                  {m.name} Roster
                </option>
              ))}
            </select>
            
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="bg-transparent border-none focus:outline-none text-slate-800 font-bold cursor-pointer ml-1"
            >
              <option value={2026} className="bg-white text-slate-800">2026</option>
              <option value={2025} className="bg-white text-slate-800">2025</option>
            </select>
          </div>

          {/* Signatories Config Toggle */}
          <button
            onClick={() => setShowSigConfig(!showSigConfig)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg border font-bold text-xs tracking-wider uppercase transition shadow-sm cursor-pointer ${showSigConfig ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 border-slate-250 text-slate-700 hover:bg-slate-200'}`}
          >
            <Settings size={14} />
            Signatories
          </button>

          {/* Export buttons */}
          <button
            onClick={() => handleExport('excel')}
            disabled={exporting !== null}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs tracking-wider uppercase transition shadow-sm cursor-pointer"
          >
            <FileSpreadsheet size={14} />
            {exporting === 'excel' ? 'Exporting...' : 'Export Excel'}
          </button>


        </div>
      </div>

      {/* Signatory Config Panel */}
      {showSigConfig && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-bold text-slate-750">
          <div>
            <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Left Signatory (SSE In-Charge)</label>
            <div className="flex gap-2">
              <select
                value={signatoryLeftName}
                onChange={(e) => {
                  setSignatoryLeftName(e.target.value);
                  const matched = employees.find(emp => emp.name === e.target.value);
                  if (matched) {
                    setSignatoryLeftTitle(matched.designation);
                  }
                }}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-800 font-semibold focus:outline-none cursor-pointer"
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
                placeholder="Type Name..."
                className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-805 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Left Signatory Designation</label>
            <input
              type="text"
              value={signatoryLeftTitle}
              onChange={(e) => setSignatoryLeftTitle(e.target.value)}
              placeholder="e.g. SSE/Sig/KKVS/IC"
              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-805 focus:outline-none focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Right Signatory Designation</label>
            <input
              type="text"
              value={signatoryRight}
              onChange={(e) => setSignatoryRight(e.target.value)}
              placeholder="e.g. Dy. CPO"
              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-805 focus:outline-none focus:border-blue-500"
            />
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

      {/* NDA Weightage Guide */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Info size={16} className="text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-slate-650 space-y-1">
          <p className="font-bold text-slate-800">NDA weightage algorithm calculation details:</p>
          <p>
            The system filters roster sheets for the code <strong className="text-blue-600">P/N</strong> (Present with Night Duty). 
            Total hours is computed as <strong className="text-blue-600">Total Shifts * 8 Hours</strong>. 
            Weightage is computed as <strong className="text-blue-600">Total Shifts * 80 Minutes</strong> (1 Hour 20 Minutes per shift), structured hierarchically by Employee Pay Level.
          </p>
        </div>
      </div>

      {/* NDA Preview Table */}
      <div className="glass-panel rounded-xl border border-slate-200 flex flex-col overflow-hidden bg-white shadow-sm">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-800 flex items-center gap-2">
            <Moon size={18} className="text-blue-600" />
            Night Duty Allowance Statement Preview
          </h3>
          <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-650">
            {ndaRows.length} Rows
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-bold text-slate-500 uppercase bg-slate-50">
                <th className="py-3 px-5 w-[60px] text-center">SL</th>
                <th className="py-3 px-5">P.F. No.</th>
                <th className="py-3 px-5">Name of Staff</th>
                <th className="py-3 px-5">Desig</th>
                <th className="py-3 px-5 text-center">Level</th>
                <th className="py-3 px-5">Night Duty Dates</th>
                <th className="py-3 px-5 text-center">Total Days</th>
                <th className="py-3 px-5 text-center">Total Hours</th>
                <th className="py-3 px-5 text-center">Weightage</th>
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
                ndaRows.map((row) => (
                  <tr key={row.pf_number} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3 px-5 text-center text-slate-400 font-bold">{row.sl}</td>
                    <td className="py-3 px-5 font-mono text-slate-500 text-xs">{row.pf_number}</td>
                    <td className="py-3 px-5 font-bold text-slate-700">{row.name}</td>
                    <td className="py-3 px-5">
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold">
                        {row.designation}
                      </span>
                    </td>
                    <td className="py-3 px-5 text-center">
                      <span className="text-xs font-extrabold text-blue-600">Lvl {row.level}</span>
                    </td>
                    <td className="py-3 px-5 text-xs text-slate-650 max-w-[200px] truncate" title={row.dates}>
                      {row.dates}
                    </td>
                    <td className="py-3 px-5 text-center font-bold text-slate-700">{row.total_days}</td>
                    <td className="py-3 px-5 text-center font-mono text-slate-500 text-xs">{row.total_hours} Hrs</td>
                    <td className="py-3 px-5 text-center font-bold text-blue-600">{row.weightage}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

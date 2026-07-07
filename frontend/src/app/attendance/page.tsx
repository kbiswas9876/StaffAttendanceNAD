'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Save,
  Sparkles,
  PlusCircle,
  Info,
  CalendarDays,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  AlertTriangle,
  Trash2,
  RotateCcw,
  Check,
  AlertCircle,
  Settings,
  Pencil
} from 'lucide-react';
import {
  getEmployees,
  getAttendanceLogs,
  saveAttendanceLogsBulk,
  addSpecialEvent,
  Employee,
  AttendanceLog,
  getAttendanceCodes,
  AttendanceCode,
  getCRLedger,
  CRLedgerEntry,
  updateCRLedgerEntry,
  deleteAttendanceLog,
  deleteAttendanceLogsRange,
  createBackup,
  getSections,
  Section,
  parseLocalDate
} from '../../lib/api';
import { getTranslation } from '../../lib/translations';
import CustomSelect from '../components/CustomSelect';
import CustomDatePicker from '../components/CustomDatePicker';

interface DayInfo {
  dateStr: string;
  dayNum: number;
  weekday: string;
  isSunday: boolean;
}

interface DeleteRosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const DeleteRosterModal: React.FC<DeleteRosterModalProps> = ({ isOpen, onClose, onConfirm }) => {
  const [challengeInput, setChallengeInput] = useState('');

  // Reset challenge input on open/close
  useEffect(() => {
    if (isOpen) {
      setChallengeInput('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm z-50 p-4">
      <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-up border-none">
        <div className="px-5 py-4.5 flex items-center gap-3 bg-white">
          <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg">
            <AlertCircle size={18} className="shrink-0" />
          </div>
          <h3 className="font-extrabold text-slate-800 text-xs uppercase tracking-wider">Delete Month Roster</h3>
        </div>
        
        <div className="p-5 pt-0 space-y-4">
          <p className="text-xs text-slate-550 leading-relaxed font-semibold">
            This will permanently delete all attendance logs and generated night duties for this month/section from the database.
          </p>
          <p className="text-xs text-slate-500 font-medium">
            To confirm this change, please type <code className="bg-rose-50 text-rose-700 font-mono px-1 py-0.5 rounded font-bold border border-rose-100">DELETE</code> below:
          </p>
          
          <input 
            type="text"
            placeholder="Type DELETE here"
            value={challengeInput}
            onChange={(e) => setChallengeInput(e.target.value)}
            className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs font-bold placeholder-slate-400 text-slate-805 uppercase focus:outline-none focus:ring-2 focus:ring-rose-100 focus:border-rose-500 transition duration-150"
          />

          <div className="flex justify-end gap-2.5 pt-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 rounded-xl text-slate-655 hover:bg-slate-50 font-bold transition duration-150 cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              disabled={challengeInput.trim().toUpperCase() !== 'DELETE'}
              className={`px-4 py-2 rounded-xl font-bold transition duration-150 flex items-center gap-1.5 cursor-pointer border-none shadow-sm ${
                challengeInput.trim().toUpperCase() === 'DELETE'
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-slate-100 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Trash2 size={14} />
              Delete Month
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const getBaseRotatingShift = (sched: any, dateStr: string) => {
  if (!sched) return null;
  if (sched.type === 'flexible') return null;

  if (sched.type === 'custom-rotation') {
    const pattern = sched.pattern || [];
    if (pattern.length === 0) return null;
    const anchorStr = sched.anchor_date || '2026-06-01';
    const anchor = parseLocalDate(anchorStr);
    const target = parseLocalDate(dateStr);
    anchor.setHours(0,0,0,0);
    target.setHours(0,0,0,0);
    const diffTime = target.getTime() - anchor.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    const cycleLength = pattern.length;
    const cycleDay = ((diffDays % cycleLength) + cycleLength) % cycleLength;
    return pattern[cycleDay] || null;
  }

  if (sched.type !== 'rotating' && sched.type !== 'rotating-3week') {
    const date = parseLocalDate(dateStr);
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
    return sched[dayOfWeek] || null;
  }

  const anchorStr = sched.anchor_date || '2026-06-01';
  const anchor = parseLocalDate(anchorStr);
  const target = parseLocalDate(dateStr);

  anchor.setHours(0,0,0,0);
  target.setHours(0,0,0,0);

  const diffTime = target.getTime() - anchor.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  // Determine how many weeks are configured dynamically
  let numWeeks = 0;
  while (sched[`week${numWeeks + 1}`]) {
    numWeeks++;
  }
  if (numWeeks === 0) {
    numWeeks = sched.type === 'rotating-3week' ? 3 : 4;
  }

  const cycleDays = numWeeks * 7;
  const cycleDay = ((diffDays % cycleDays) + cycleDays) % cycleDays;
  const weekNum = Math.floor(cycleDay / 7) + 1; // 1 to numWeeks
  const dayOfWeek = target.toLocaleDateString('en-US', { weekday: 'long' });
  const wk = `week${weekNum}`;
  return sched[wk]?.[dayOfWeek] || null;
};

const getRotatingShift = (emp: any, dateStr: string) => {
  const sched = emp.weekly_schedule;
  if (!sched) return null;

  const overrides = (sched as any).custom_night_weeks;
  if (Array.isArray(overrides)) {
    const override = overrides.find(w => dateStr >= w.from_date && dateStr <= w.to_date);
    if (override) {
      const baseShift = getBaseRotatingShift(sched, dateStr);
      if (baseShift === 'R') return 'R';
      return override.shift || 'N';
    }
  }

  return getBaseRotatingShift(sched, dateStr);
};

const mapShiftToRosterCode = (shiftCode: string | null) => {
  if (!shiftCode) return 'P';
  const code = shiftCode.toUpperCase();
  if (code === 'R') return 'R';
  if (code === 'N' || code === 'P/N') return 'P/N';
  if (['G', 'M', 'E', 'P'].includes(code)) return 'P';
  return code;
};

const getRosterPeriodLabel = (monthVal: number) => {
  const fullMonths = ["December", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const prevName = fullMonths[monthVal];
  const currName = fullMonths[monthVal + 1];
  return `${prevName}-${currName}`;
};

interface RosterRowProps {
  emp: Employee;
  slToShow: number;
  empGrid: { [dateStr: string]: AttendanceLog };
  days: DayInfo[];
  getCellStyle: (status: string, isSunday: boolean) => any;
  handleCellChange: (empId: number, dateStr: string, value: string, remarks?: string) => Promise<void>;
  handleRemarksChange: (empId: number, dateStr: string, status: string, text: string) => void;
  activeDropdownCell: { empId: number; dateStr: string } | null;
  setActiveDropdownCell: (cell: { empId: number; dateStr: string } | null) => void;
  setDropdownPos: (pos: { top: number; left: number; width: number } | null) => void;
  setHoveredCell: (cell: any) => void;
  setMousePos: (pos: { x: number; y: number }) => void;
}

const RosterRow: React.FC<RosterRowProps> = React.memo(({
  emp,
  slToShow,
  empGrid,
  days,
  getCellStyle,
  handleCellChange,
  handleRemarksChange,
  activeDropdownCell,
  setActiveDropdownCell,
  setDropdownPos,
  setHoveredCell,
  setMousePos
}) => {
  return (
    <tr className="hover:bg-slate-50/50 transition-colors">
      {/* Fixed Staff info cell */}
      <td className="py-2 px-3 text-left bg-slate-50 sticky left-0 z-10 border-r border-slate-200 flex flex-col justify-center h-[60px] w-[180px]">
        <span className="font-bold text-slate-800 text-[11px] truncate max-w-[160px]" title={emp.name}>
          {slToShow}. {emp.name}
        </span>
        <div className="flex items-center gap-1.5 text-[9.5px] font-mono text-slate-550 mt-0.5 font-semibold">
          <span className="text-slate-400">PF:</span>
          <span className="text-blue-700 font-bold">{emp.pf_number}</span>
        </div>
        <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1.5 mt-0.5 font-semibold">
          {emp.designation}
          <span className="text-[9px] text-blue-600 font-bold">L{emp.level}</span>
        </span>
      </td>

      {/* Date cells */}
      {days.map((day) => {
        const log = empGrid[day.dateStr];
        const status = log ? log.status : '';
        const earnedDateShort = log?.remarks && log.remarks.startsWith('CR_EARNED_DATE:')
          ? (() => {
              const parts = log.remarks.split('CR_EARNED_DATE:');
              if (parts[1]) {
                const dParts = parts[1].split('-');
                if (dParts[1] && dParts[2]) {
                  return `${dParts[2]}.${dParts[1]}`;
                }
              }
              return '';
            })()
          : '';

        return (
          <td
            key={day.dateStr}
            className="p-1 border-r border-slate-200 relative animate-fade-in cursor-pointer roster-cell"
            style={getCellStyle(status, day.isSunday)}
            onMouseEnter={() => {
              if (activeDropdownCell) return;
              setHoveredCell({
                empName: emp.name,
                designation: emp.designation,
                dateStr: day.dateStr,
                weekday: day.weekday,
                status: status || '—'
              });
            }}
            onMouseLeave={() => {
              setHoveredCell(null);
            }}
            onMouseMove={(e) => {
              setMousePos({ x: e.clientX, y: e.clientY });
            }}
          >
            <div className="flex flex-col justify-center items-center w-full h-full min-h-[38px] relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  if (activeDropdownCell?.empId === emp.emp_id && activeDropdownCell?.dateStr === day.dateStr) {
                    setActiveDropdownCell(null);
                    setDropdownPos(null);
                  } else {
                    setActiveDropdownCell({ empId: emp.emp_id, dateStr: day.dateStr });
                    const rect = e.currentTarget.getBoundingClientRect();
                    setDropdownPos({
                      top: rect.bottom,
                      left: rect.left + rect.width / 2,
                      width: rect.width
                    });
                    setHoveredCell(null);
                  }
                }}
                className="w-full h-full text-center bg-transparent border-none font-black text-[10.5px] focus:outline-none cursor-pointer flex items-center justify-center min-h-[30px] transition-transform active:scale-95 duration-100 hover:bg-slate-200/20 rounded-md"
                style={{ color: getCellStyle(status, day.isSunday).color }}
              >
                {status || '—'}
              </button>

              {status === 'CR' && earnedDateShort && (
                <span className="text-[7.5px] font-black text-blue-700 block leading-none select-none pointer-events-none mt-[-2px] z-10">
                  {earnedDateShort}
                </span>
              )}

              {status !== 'CR' && status !== 'P' && status !== '' && log?.remarks && (
                <span className="text-[7.2px] font-bold text-slate-500 block leading-none select-none pointer-events-none mt-[-2px] z-10 truncate max-w-[42px]" title={log.remarks}>
                  {log.remarks.replace('Order: ', '')}
                </span>
              )}
            </div>
          </td>
        );
      })}

      {/* Remarks cell */}
      <td className="py-2 px-3 border-l border-slate-200">
        <input
          type="text"
          placeholder="No remarks"
          value={empGrid[days[0]?.dateStr]?.remarks || ''}
          onChange={(e) => {
            if (days[0]) {
              handleRemarksChange(emp.emp_id, days[0].dateStr, empGrid[days[0].dateStr]?.status || 'P', e.target.value);
            }
          }}
          className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[10px] text-slate-700 focus:outline-none focus:border-blue-500"
        />
      </td>
    </tr>
  );
});

RosterRow.displayName = 'RosterRow';

export default function AttendanceGrid() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState<string>('KKVS');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Date period state
  const defaultPeriod = (() => {
    const now = new Date();
    const day = now.getDate();
    const month = now.getMonth();
    const year = now.getFullYear();
    if (day >= 11) {
      return { month: (month + 1) % 12, year: month === 11 ? year + 1 : year };
    }
    return { month, year };
  })();

  const [selectedMonth, setSelectedMonth] = useState<number>(defaultPeriod.month);
  const [selectedYear, setSelectedYear] = useState<number>(defaultPeriod.year);
  const [days, setDays] = useState<DayInfo[]>([]);

  // Attendance grid states
  const [gridData, setGridData] = useState<{ [empId: number]: { [dateStr: string]: AttendanceLog } }>({});
  const [originalGridData, setOriginalGridData] = useState<{ [empId: number]: { [dateStr: string]: AttendanceLog } }>({});
  const [isModified, setIsModified] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  const [exporting, setExporting] = useState<string | null>(null);
  const [backendStatus, setBackendStatus] = useState<'online' | 'offline'>('offline');

  // Dynamic codes & CR ledger states
  const [allCodes, setAllCodes] = useState<AttendanceCode[]>([]);
  const [crLedgers, setCrLedgers] = useState<{ [empId: number]: CRLedgerEntry[] }>({});
  const [crAssociations, setCrAssociations] = useState<{ [key: string]: number }>({});
  const [originalCrAssociations, setOriginalCrAssociations] = useState<{ [key: string]: number }>({});

  // Toast and Modal states
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);
  const [customModal, setCustomModal] = useState<{ isOpen: boolean; empId: number; dateStr: string } | null>(null);
  const [customCodeInput, setCustomCodeInput] = useState('');
  const [customOrderInput, setCustomOrderInput] = useState('');
  const [customRemarksInput, setCustomRemarksInput] = useState('');
  const [crModal, setCrModal] = useState<{ isOpen: boolean; empId: number; dateStr: string; availableEntries: CRLedgerEntry[] } | null>(null);
  const [manualCrDate, setManualCrDate] = useState<string>('');
  const [activeDropdownCell, setActiveDropdownCell] = useState<{ empId: number; dateStr: string } | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);
  
  const [lang, setLang] = useState<'en' | 'bn' | 'hi'>('en');
  const [sections, setSections] = useState<Section[]>([]);
  const [hoveredCell, setHoveredCell] = useState<{ empName: string; designation: string; dateStr: string; weekday: string; status: string } | null>(null);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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

  // Roster Simulation/Preview Modal state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [rosterChanges, setRosterChanges] = useState<{ empName: string; date: string; oldVal: string; newVal: string }[]>([]);

  // Clear challenge modal state
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [pendingDeleteCell, setPendingDeleteCell] = useState<{ empId: number; dateStr: string; empName: string } | null>(null);

  // Bulk Entry modal states
  const [showBulkModal, setShowBulkModal] = useState<boolean>(false);
  const [bulkEmpId, setBulkEmpId] = useState<string>('all');
  const [bulkStartDate, setBulkStartDate] = useState<string>('2026-05-11');
  const [bulkEndDate, setBulkEndDate] = useState<string>('2026-06-10');
  const [bulkStatus, setBulkStatus] = useState<string>('Sick');
  const [bulkCustomCode, setBulkCustomCode] = useState<string>('');
  const [bulkOrderNumber, setBulkOrderNumber] = useState<string>('');
  const [bulkRemarks, setBulkRemarks] = useState<string>('');

  // Bulk conflict warnings modal state
  const [bulkConflicts, setBulkConflicts] = useState<{ empName: string; date: string; status: string }[]>([]);
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [pendingBulkLogList, setPendingBulkLogList] = useState<AttendanceLog[]>([]);

  // Signatory details states
  const [signatoryLeftName, setSignatoryLeftName] = useState('');
  const [signatoryLeftTitle, setSignatoryLeftTitle] = useState('');
  const [signatoryRight, setSignatoryRight] = useState('Dy. CPO');
  const [showSigConfig, setShowSigConfig] = useState(false);
  const [printScaleMode, setPrintScaleMode] = useState<string>('0');
  const [printScaleValue, setPrintScaleValue] = useState<number>(100);

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

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

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

  const handleAttendanceExport = async (format: 'excel' | 'pdf') => {
    if (backendStatus === 'offline') {
      showToast("Error: Python microservice backend is currently offline. Please start FastAPI server.", "error");
      return;
    }

    setExporting(format);

    let prevM = selectedMonth - 1;
    let prevY = selectedYear;
    if (prevM < 0) { prevM = 11; prevY = selectedYear - 1; }

    const formattedStartDate = `11.${String(prevM + 1).padStart(2, '0')}.${prevY}`;
    const formattedEndDate = `10.${String(selectedMonth + 1).padStart(2, '0')}.${selectedYear}`;

    const monthText = monthsList[selectedMonth].name.toUpperCase() + `-${selectedYear}`;
    const matchedSection = sections.find(s => s.section_code === activeSection);
    const sectionName = activeSection === 'ALL'
      ? 'All Sections'
      : matchedSection ? matchedSection.section_name : activeSection;

    // Build rows for payload
    const exportRows = employees.map((emp, idx) => {
      const empGrid = gridData[emp.emp_id] || {};
      const daysList = days.map((day) => {
        const log = empGrid[day.dateStr];
        return {
          day: day.dayNum,
          weekday: day.weekday,
          status: log?.status || '',
          is_holiday: day.isSunday,
          remarks: log?.remarks || ''
        };
      });

      const firstDayLog = empGrid[days[0]?.dateStr];
      const remarks = firstDayLog?.remarks || '';

      return {
        sl: idx + 1,
        pf_number: emp.pf_number,
        name: emp.name,
        designation: emp.designation,
        days: daysList,
        remarks: remarks
      };
    });

    const payload = {
      period_start: formattedStartDate,
      period_end: formattedEndDate,
      section_code: activeSection,
      section_name: sectionName,
      submission_date: new Date().toLocaleDateString('en-GB').replace(/\//g, '.'),
      signatory_left: signatoryLeftName ? `${signatoryLeftName}\n${signatoryLeftTitle}` : signatoryLeftTitle,
      signatory_right: signatoryRight,
      rows: exportRows,
      scale: printScaleMode === '0' ? null : printScaleValue
    };

    try {
      const endpoint = `http://127.0.0.1:8000/api/export/attendance/${format}`;
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
      a.download = `Attendance_Sheet_${activeSection}_${monthText}.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Attendance export failure:", e);
      showToast("Export Failed: Could not reach the Python FastAPI service.", "error");
    } finally {
      setExporting(null);
    }
  };

  const computeDays = (month: number, year: number) => {
    const dayList: DayInfo[] = [];
    let prevMonth = month - 1;
    let prevYear = year;
    if (prevMonth < 0) {
      prevMonth = 11;
      prevYear = year - 1;
    }

    const daysInPrev = new Date(prevYear, prevMonth + 1, 0).getDate();

    for (let d = 11; d <= daysInPrev; d++) {
      const date = new Date(prevYear, prevMonth, d);
      const dateStr = `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
      dayList.push({
        dateStr,
        dayNum: d,
        weekday,
        isSunday: weekday === 'Sun'
      });
    }

    for (let d = 1; d <= 10; d++) {
      const date = new Date(year, month, d);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const weekday = date.toLocaleDateString('en-US', { weekday: 'short' });
      dayList.push({
        dateStr,
        dayNum: d,
        weekday,
        isSunday: weekday === 'Sun'
      });
    }

    setDays(dayList);
  };

  const loadData = async (section: string, month: number, year: number) => {
    setLoading(true);
    computeDays(month, year);

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

      // Sort and group by section code, then level descending
      if (section === 'ALL') {
        filteredEmps.sort((a, b) => {
          const secA = a.section_code || '';
          const secB = b.section_code || '';
          if (secA !== secB) {
            return secA.localeCompare(secB);
          }
          return b.level - a.level;
        });
      }
      setEmployees(filteredEmps);

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

      const newGrid: { [empId: number]: { [dateStr: string]: AttendanceLog } } = {};
      filteredEmps.forEach((emp) => {
        newGrid[emp.emp_id] = {};
      });

      jointLogs.forEach((log) => {
        if (newGrid[log.emp_id]) {
          newGrid[log.emp_id][log.date] = { ...log };
        }
      });

      setGridData(newGrid);
      
      // Save a deep copy of original loaded DB state for Undo support
      const originalCopy = JSON.parse(JSON.stringify(newGrid));
      setOriginalGridData(originalCopy);

      const codesList = await getAttendanceCodes();
      setAllCodes(codesList);

      const ledgersMap: { [empId: number]: CRLedgerEntry[] } = {};
      const assocMap: { [key: string]: number } = {};
      for (const emp of filteredEmps) {
        const ledger = await getCRLedger(emp.emp_id);
        ledgersMap[emp.emp_id] = ledger;
        ledger.forEach(entry => {
          if (entry.consumed_date) {
            assocMap[`${emp.emp_id}_${entry.consumed_date}`] = entry.id!;
          }
        });
      }
      setCrLedgers(ledgersMap);
      setCrAssociations(assocMap);
      setOriginalCrAssociations({ ...assocMap });

    } catch (e) {
      console.error("Error loading roster sheet data", e);
      showToast("Failed to fetch logs from server database", "error");
    } finally {
      setIsModified(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const section = localStorage.getItem('erp_active_section') || 'KKVS';
      setActiveSection(section);
      loadData(section, selectedMonth, selectedYear);

      const handleSectionChanged = () => {
        const sec = localStorage.getItem('erp_active_section') || 'KKVS';
        setActiveSection(sec);
        loadData(sec, selectedMonth, selectedYear);
      };

      window.addEventListener('erp_section_changed', handleSectionChanged);
      return () => {
        window.removeEventListener('erp_section_changed', handleSectionChanged);
      };
    }
  }, [selectedMonth, selectedYear]);

  // Handle cell edit in grid
  const handleCellChange = useCallback(async (empId: number, dateStr: string, value: string, remarks?: string) => {
    if (value === 'CUSTOM_CODE') {
      const existing = gridData[empId]?.[dateStr];
      const existingStatus = existing?.status || '';
      const isPredefined = ['P', 'R', 'CR', 'CL', 'LAP', 'Sick', 'SCL', 'PH', 'P/N'].includes(existingStatus);
      setCustomModal({ isOpen: true, empId, dateStr });
      setCustomCodeInput(isPredefined ? '' : existingStatus);
      
      const rem = existing?.remarks || '';
      if (rem.startsWith('Order: ')) {
        const parts = rem.split(' | ');
        setCustomOrderInput(parts[0].substring(7));
        setCustomRemarksInput(parts[1] || '');
      } else {
        setCustomOrderInput('');
        setCustomRemarksInput(rem);
      }
      return;
    }

    if (value === 'CR') {
      const ledger = crLedgers[empId] || [];
      const available = ledger.filter(e => e.consumed_date === null || e.consumed_date === dateStr);
      setCrModal({ isOpen: true, empId, dateStr, availableEntries: available });
      return;
    }

    if (value === 'DELETE') {
      const emp = employees.find(e => e.emp_id === empId);
      setPendingDeleteCell({ empId, dateStr, empName: emp ? emp.name : 'Employee' });
      return;
    }

    setGridData((prev) => {
      const empGrid = { ...(prev[empId] || {}) };
      const oldLog = empGrid[dateStr];
      
      let finalRemarks = remarks;
      if (remarks === undefined) {
        if (['P', 'R', 'CL', 'LAP', 'Sick', 'SCL', 'PH', 'P/N'].includes(value)) {
          finalRemarks = '';
        } else {
          finalRemarks = oldLog ? oldLog.remarks : '';
        }
      }
      
      empGrid[dateStr] = {
        ...oldLog,
        emp_id: empId,
        date: dateStr,
        status: value as any,
        is_night: value === 'P/N',
        remarks: finalRemarks
      };
      return {
        ...prev,
        [empId]: empGrid
      };
    });
    setIsModified(true);
  }, [gridData, crLedgers, employees]);

  const handleRemarksChange = useCallback((empId: number, dateStr: string, status: string, text: string) => {
    setGridData((prev) => {
      const eg = { ...prev[empId] };
      const oldLog = eg[dateStr];
      eg[dateStr] = {
        ...oldLog,
        emp_id: empId,
        date: dateStr,
        status: (status || 'P') as any,
        is_night: status === 'P/N',
        remarks: text
      };
      return { ...prev, [empId]: eg };
    });
    setIsModified(true);
  }, []);

  // Undo / Rollback grid changes to matching database state loaded
  const handleUndoRollback = () => {
    setConfirmDialog({
      isOpen: true,
      title: "Undo Unsaved Changes",
      message: "Are you sure you want to discard all changes made during this editing session? The roster grid will be reverted to the current state stored on the server database.",
      onConfirm: () => {
        setGridData(JSON.parse(JSON.stringify(originalGridData)));
        setCrAssociations({ ...originalCrAssociations });
        setIsModified(false);
        setConfirmDialog(null);
        showToast("Reverted all unsaved local grid modifications.", "info");
      }
    });
  };

  // One-Click Auto-Fill logic
  const handleAutoFill = () => {
    setConfirmDialog({
      isOpen: true,
      title: "Auto-Fill Defaults",
      message: "This will auto-populate shift and rest days for all empty cells in the grid based on employees' weekly schedule templates. Existing entries will not be overwritten. Proceed?",
      onConfirm: () => {
        setConfirmDialog(null);
        executeAutoFill();
      }
    });
  };

  const executeAutoFill = () => {
    const updatedGrid = { ...gridData };

    employees.forEach((emp) => {
      const empGrid = { ...(updatedGrid[emp.emp_id] || {}) };

      days.forEach((day, index) => {
        const existing = empGrid[day.dateStr];
        if (!existing || !existing.status) {
          const sched = emp.weekly_schedule;
          let status = 'P';
          if (sched) {
            const shift = getRotatingShift(emp, day.dateStr);
            status = mapShiftToRosterCode(shift);
          } else {
            const restDay = emp.default_rest_day;
            const isRest = day.weekday === restDay.slice(0, 3) || (day.isSunday && restDay === 'Sunday');
            status = isRest ? 'R' : 'P';
          }

          empGrid[day.dateStr] = {
            emp_id: emp.emp_id,
            date: day.dateStr,
            status: status as any,
            is_night: status === 'P/N',
            remarks: ''
          };
        }
      });
      updatedGrid[emp.emp_id] = empGrid;
    });

    setGridData(updatedGrid);
    setIsModified(true);
    showToast("Grid auto-filled with template schedules.", "info");
  };

  // Clear Grid securing with text challenge challenge confirmed
  const triggerClearGrid = () => {
    setIsClearModalOpen(true);
  };

  const confirmClearGrid = async () => {
    setIsClearModalOpen(false);
    setLoading(true);

    let prevM = selectedMonth - 1;
    let prevY = selectedYear;
    if (prevM < 0) { prevM = 11; prevY = selectedYear - 1; }
    const startDateStr = `${prevY}-${String(prevM + 1).padStart(2, '0')}-11`;
    const endDateStr = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-10`;

    try {
      // 1. Create safety backup first
      await createBackup();
      // 2. Perform delete range
      await deleteAttendanceLogsRange(activeSection, startDateStr, endDateStr);
      // 3. Reload data
      await loadData(activeSection, selectedMonth, selectedYear);
      showToast("Successfully deleted all attendance logs for this roster month from the database.", "success");
    } catch (e) {
      console.error("Delete roster month failed:", e);
      showToast("Failed to delete roster logs from the database.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Compile and show Roster Simulation / Preview before save
  const handleOpenSimulation = () => {
    const changes: { empName: string; date: string; oldVal: string; newVal: string }[] = [];
    
    employees.forEach((emp) => {
      const empGrid = gridData[emp.emp_id] || {};
      const origEmpGrid = originalGridData[emp.emp_id] || {};
      
      days.forEach((day) => {
        const oldLog = origEmpGrid[day.dateStr];
        const newLog = empGrid[day.dateStr];
        
        const oldStatus = oldLog?.status || '—';
        const newStatus = newLog?.status || '—';
        
        if (oldStatus !== newStatus) {
          changes.push({
            empName: emp.name,
            date: day.dateStr,
            oldVal: oldStatus,
            newVal: newStatus
          });
        }
      });
    });

    setRosterChanges(changes);
    setIsPreviewOpen(true);
  };

  const executeSaveChanges = async () => {
    setIsPreviewOpen(false);
    setIsSaving(true);
    const logsToSave: AttendanceLog[] = [];

    Object.keys(gridData).forEach((empIdStr) => {
      const empId = Number(empIdStr);
      const empGrid = gridData[empId];
      Object.keys(empGrid).forEach((dateStr) => {
        const log = empGrid[dateStr];
        if (log && log.status) {
          logsToSave.push(log);
        }
      });
    });

    try {
      await saveAttendanceLogsBulk(logsToSave);

      // Save CR updates
      for (const empIdStr of Object.keys(gridData)) {
        const empId = Number(empIdStr);
        const empGrid = gridData[empId];
        const ledger = crLedgers[empId] || [];

        // 1. Release entries
        for (const entry of ledger) {
          if (entry.consumed_date) {
            const isInPeriod = days.some(d => d.dateStr === entry.consumed_date);
            if (isInPeriod) {
              const currentStatus = empGrid[entry.consumed_date]?.status;
              if (currentStatus !== 'CR') {
                entry.consumed_date = null;
                await updateCRLedgerEntry(entry);
              }
            }
          }
        }

        // 2. Consume entries
        for (const dateStr of Object.keys(empGrid)) {
          const log = empGrid[dateStr];
          if (log && log.status === 'CR') {
            const assocId = crAssociations[`${empId}_${dateStr}`];
            if (assocId) {
              const entry = ledger.find(e => e.id === assocId);
              if (entry && entry.consumed_date !== dateStr) {
                entry.consumed_date = dateStr;
                await updateCRLedgerEntry(entry);
              }
            }
          }
        }
      }

      await loadData(activeSection, selectedMonth, selectedYear);
      setIsModified(false);
      showToast("Roster updates synced with SQLite database successfully!", "success");
    } catch (e) {
      showToast("An error occurred while saving logs.", "error");
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  // Bulk Entry submissions with Roster Conflict detection
  const handleBulkSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const start = new Date(bulkStartDate);
    const end = new Date(bulkEndDate);

    if (start > end) {
      showToast("Start date must be before or equal to End date.", "error");
      return;
    }

    const finalStatus = bulkStatus === 'CUSTOM_CODE' ? bulkCustomCode.trim().toUpperCase() : bulkStatus;
    if (!finalStatus) {
      showToast("Please enter a valid roster code.", "error");
      return;
    }

    const targetEmps = bulkEmpId === 'all'
      ? employees
      : employees.filter(emp => emp.emp_id === Number(bulkEmpId));

    // Compile list of conflicts
    const conflicts: { empName: string; date: string; status: string }[] = [];
    const logsToSave: AttendanceLog[] = [];

    // Loop through dates
    const dateList: string[] = [];
    const temp = new Date(start);
    while (temp <= end) {
      dateList.push(temp.toISOString().slice(0, 10));
      temp.setDate(temp.getDate() + 1);
    }

    const leaveStatusList = ['CL', 'LAP', 'Sick', 'SCL', 'CR', 'R', 'PH'];

    targetEmps.forEach((emp) => {
      const empGrid = gridData[emp.emp_id] || {};
      dateList.forEach((dStr) => {
        const existingLog = empGrid[dStr];
        if (existingLog && leaveStatusList.includes(existingLog.status)) {
          conflicts.push({
            empName: emp.name,
            date: dStr,
            status: existingLog.status
          });
        }

        logsToSave.push({
          emp_id: emp.emp_id,
          date: dStr,
          status: finalStatus as any,
          is_night: finalStatus === 'P/N',
          remarks: bulkOrderNumber ? `Order: ${bulkOrderNumber}` : bulkRemarks
        });
      });
    });

    if (conflicts.length > 0) {
      // Conflicts detected! Open conflict override modal
      setBulkConflicts(conflicts);
      setPendingBulkLogList(logsToSave);
      setShowConflictModal(true);
    } else {
      // No conflicts, apply immediately
      applyBulkChanges(logsToSave);
    }
  };

  const applyBulkChanges = async (logsList: AttendanceLog[]) => {
    const updatedGrid = { ...gridData };
    
    // Apply updates locally to the grid
    for (const log of logsList) {
      const empGrid = updatedGrid[log.emp_id] || {};
      empGrid[log.date] = log;
      updatedGrid[log.emp_id] = empGrid;

      // Add a special event audit row for leave or order registers
      if (['Sick', 'SCL', 'CL', 'LAP'].includes(log.status) || bulkOrderNumber) {
        await addSpecialEvent({
          emp_id: log.emp_id,
          event_type: log.status === 'Sick' ? 'Sick Leave' : log.status === 'CL' ? 'Casual Leave' : log.status === 'LAP' ? 'Average Pay Leave' : 'Special Assignment',
          from_date: bulkStartDate,
          to_date: bulkEndDate,
          order_number: bulkOrderNumber || 'N/A',
          location: bulkRemarks || 'Section Base'
        });
      }
    }

    setGridData(updatedGrid);
    setIsModified(true);
    setShowBulkModal(false);
    setShowConflictModal(false);
    setPendingBulkLogList([]);
    showToast(`Bulk entry complete. Applied ${logsList.length} cells. Save to commit.`, "success");
  };

  const getCellStyle = useCallback((status: string, isSunday: boolean) => {
    if (isSunday && !status) return { backgroundColor: 'rgba(239, 68, 68, 0.08)', color: '#DC2626' };
    if (!status) return { color: '#64748B' };

    const codeObj = allCodes.find(c => c.code === status);
    if (codeObj) {
      return {
        backgroundColor: codeObj.bg_color,
        color: codeObj.text_color,
        border: `1px solid ${codeObj.text_color}20`
      };
    }
    return { backgroundColor: '#F1F5F9', color: '#1E293B' };
  }, [allCodes]);

  const containerRect = containerRef.current?.getBoundingClientRect();
  const leftOffset = containerRect ? containerRect.left : 0;
  const topOffset = containerRect ? containerRect.top : 0;

  return (
    <div ref={containerRef} className="p-6 space-y-6 flex flex-col h-full min-h-screen">      {/* Title & Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-40">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-850 flex items-center gap-2">
            {getTranslation(lang, 'Smart Attendance Roster')}
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#00c2b2]/10 text-[#00c2b2] border border-[#00c2b2]/20 font-black uppercase tracking-wider whitespace-nowrap">
              {activeSection === 'ALL' ? getTranslation(lang, 'Joint View') : `${activeSection} ${getTranslation(lang, 'Section')}`}
            </span>
          </h2>
          <p className="text-xs font-semibold text-slate-500 mt-1">
            Official Signalling & Telecommunication Department monthly staff roster.
          </p>
        </div>

        {/* Toolbar controls */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Period selector */}
          <div className="flex items-center gap-2 text-sm text-slate-800 no-print">
            <CustomSelect
              value={selectedMonth}
              onChange={(val) => setSelectedMonth(Number(val))}
              options={monthsList.map((m) => {
                let prevM = m.val - 1;
                if (prevM < 0) prevM = 11;
                const prevName = monthsList[prevM].name.substring(0, 3);
                const currName = m.name.substring(0, 3);
                return { value: m.val, label: `${prevName} - ${currName}` };
              })}
              className="w-40 shrink-0"
              btnClassName="pl-3.5 pr-2.5 py-2.5 text-xs sm:text-sm gap-1.5"
            />

            <CustomSelect
              value={selectedYear}
              onChange={(val) => setSelectedYear(Number(val))}
              options={[
                { value: 2026, label: '2026' },
                { value: 2025, label: '2025' }
              ]}
              className="w-28 shrink-0"
              btnClassName="pl-3.5 pr-2.5 py-2.5 text-xs sm:text-sm gap-1.5"
            />
          </div>

          <button
            onClick={handleAutoFill}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-theme-active border border-theme-active/30 hover:opacity-85 text-theme-primary font-bold text-xs tracking-wider uppercase transition no-print cursor-pointer"
          >
            <Sparkles size={14} />
            {getTranslation(lang, 'Auto-Fill')}
          </button>

          <button
            onClick={handleUndoRollback}
            disabled={!isModified}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg font-bold text-xs tracking-wider uppercase transition no-print cursor-pointer ${
              isModified 
                ? 'bg-amber-50 hover:bg-amber-100 border border-amber-250 text-amber-700' 
                : 'bg-slate-100 text-slate-400 border border-slate-250 cursor-not-allowed'
            }`}
          >
            <RotateCcw size={14} />
            {getTranslation(lang, 'Undo')}
          </button>

          <button
            onClick={triggerClearGrid}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-600 font-bold text-xs tracking-wider uppercase transition no-print cursor-pointer"
          >
            <Trash2 size={14} />
            {getTranslation(lang, 'Delete Roster Month')}
          </button>

          <button
            onClick={() => {
              setShowBulkModal(true);
              setBulkConflicts([]);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs tracking-wider uppercase transition no-print cursor-pointer"
          >
            <PlusCircle size={14} />
            {getTranslation(lang, 'Bulk Entry')}
          </button>

          {/* Signatories Config Toggle */}
          <button
            onClick={() => setShowSigConfig(!showSigConfig)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border font-bold text-xs tracking-wider uppercase transition shadow-sm no-print cursor-pointer ${showSigConfig ? 'bg-theme-active text-theme-active border-theme-active' : 'bg-slate-100 border-slate-250 text-slate-700 hover:bg-slate-200'}`}
          >
            <Settings size={14} />
            {getTranslation(lang, 'Signatories')}
          </button>

          <button
            onClick={() => handleAttendanceExport('excel')}
            disabled={exporting !== null}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-theme-primary hover-bg-theme-primary text-white font-bold text-xs tracking-wider uppercase transition shadow-sm no-print cursor-pointer"
          >
            <FileSpreadsheet size={14} />
            {exporting === 'excel' ? 'Excel...' : getTranslation(lang, 'Export Excel')}
          </button>

          <button
            onClick={handleOpenSimulation}
            disabled={!isModified || isSaving}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-xs tracking-wider uppercase transition shadow-sm no-print cursor-pointer ${isModified
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
              }`}
          >
            <Save size={14} />
            {isSaving ? 'Saving...' : getTranslation(lang, 'Save Changes')}
          </button>
        </div>
      </div>

      {/* Signatory Config Panel */}
      {showSigConfig && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-4 text-xs font-bold text-slate-750 no-print animate-scale-up relative z-20">
          <div>
            <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Left Signatory (SSE In-Charge)</label>
            <div className="flex gap-2 items-center">
              <CustomSelect
                value={signatoryLeftName}
                onChange={(val) => {
                  setSignatoryLeftName(val);
                  const matched = employees.find(emp => emp.name === val);
                  if (matched) {
                    setSignatoryLeftTitle(matched.designation);
                  }
                }}
                options={[
                  { value: "", label: "-- Custom/Manual --" },
                  ...employees.map(e => ({ value: e.name, label: `${e.name} (${e.designation})` }))
                ]}
                className="w-48 shrink-0"
              />
              <input
                type="text"
                value={signatoryLeftName}
                onChange={(e) => setSignatoryLeftName(e.target.value)}
                placeholder="Type Name..."
                className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-805 focus:outline-none focus-border-theme"
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
              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-805 focus:outline-none focus-border-theme"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Right Signatory Designation</label>
            <input
              type="text"
              value={signatoryRight}
              onChange={(e) => setSignatoryRight(e.target.value)}
              placeholder="e.g. Dy. CPO"
              className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-805 focus:outline-none focus-border-theme"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Excel Export Print Scale</label>
            <div className="flex gap-2 items-center">
              <CustomSelect
                value={printScaleMode}
                onChange={(val) => {
                  setPrintScaleMode(val);
                  if (val !== 'custom') {
                    setPrintScaleValue(Number(val));
                  }
                }}
                options={[
                  { value: "0", label: "Default (Fit Width)" },
                  { value: "100", label: "100% Scale" },
                  { value: "95", label: "95% Scale" },
                  { value: "90", label: "90% Scale" },
                  { value: "85", label: "85% Scale" },
                  { value: "80", label: "80% Scale" },
                  { value: "75", label: "75% Scale" },
                  { value: "70", label: "70% Scale" },
                  { value: "custom", label: "Custom Scale..." }
                ]}
                className="w-48 shrink-0"
              />
              {printScaleMode === 'custom' && (
                <input
                  type="number"
                  min="10"
                  max="400"
                  value={printScaleValue}
                  onChange={(e) => setPrintScaleValue(Number(e.target.value))}
                  className="w-16 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-805 focus:outline-none focus-border-theme text-center font-bold"
                  placeholder="%"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Roster Guide Panel */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap gap-4 text-xs text-slate-600 items-center justify-between shadow-sm no-print">
        <div className="flex items-center gap-1.5">
          <Info size={14} className="text-theme-primary" />
          <span><strong>Roster Guide Key:</strong></span>
        </div>
        <div className="flex flex-wrap gap-3.5">
          <span className="flex items-center gap-1"><span className="w-5 h-4 rounded text-center bg-slate-100 border border-slate-200 font-bold block text-[9px] leading-4 text-slate-700">P</span> Present</span>
          <span className="flex items-center gap-1"><span className="w-5 h-4 rounded text-center bg-purple-50 border border-purple-200 font-bold block text-[9px] leading-4 text-purple-700">P/N</span> Night Shift</span>
          <span className="flex items-center gap-1"><span className="w-5 h-4 rounded text-center bg-slate-200 font-bold block text-[9px] leading-4 text-slate-500">R</span> Rest Day</span>
          <span className="flex items-center gap-1"><span className="w-5 h-4 rounded text-center bg-theme-active border border-theme-active/30 font-bold block text-[9px] leading-4 text-theme-active">CR</span> Comp. Rest</span>
          <span className="flex items-center gap-1"><span className="w-5 h-4 rounded text-center bg-amber-50 border border-amber-200 font-bold block text-[9px] leading-4 text-amber-700">CL</span> Casual Leave</span>
          <span className="flex items-center gap-1"><span className="w-5 h-4 rounded text-center bg-orange-50 border border-orange-200 font-bold block text-[9px] leading-4 text-orange-700">LAP</span> LAP Leave</span>
          <span className="flex items-center gap-1"><span className="w-5 h-4 rounded text-center bg-red-100 font-bold block text-[9px] leading-4 text-red-700">Sick</span> Sick Leave</span>
          <span className="flex items-center gap-1"><span className="w-5 h-4 rounded text-center bg-rose-50 border border-rose-200 font-bold block text-[9px] leading-4 text-rose-700">SCL</span> Spl Leave</span>
          <span className="flex items-center gap-1"><span className="w-5 h-4 rounded text-center bg-yellow-50 border border-yellow-200 font-bold block text-[9px] leading-4 text-yellow-650">PH</span> Pub Holiday</span>
        </div>
      </div>

      {/* Grid Container */}
      <div className="glass-panel rounded-xl border border-slate-200 flex flex-col overflow-hidden h-fit max-h-[calc(100vh-310px)] bg-white shadow-sm">
        {loading ? (
          <div className="flex-1 flex flex-col overflow-hidden animate-pulse">
            <div className="border-b border-slate-200 bg-slate-50 flex">
              <div className="py-3 px-4 w-[180px] border-r border-slate-200 shrink-0"><div className="h-4 w-24 bg-[#E5E3DC] rounded" /></div>
              {[...Array(15)].map((_, i) => (
                <div key={i} className="flex-1 py-3 px-1 border-r border-slate-100 flex justify-center"><div className="h-4 w-6 bg-[#E5E3DC] rounded" /></div>
              ))}
            </div>
            <div className="divide-y divide-slate-100 overflow-y-hidden flex-1">
              {[...Array(8)].map((_, r) => (
                <div key={r} className="flex items-center min-h-[60px]">
                  <div className="py-2 px-3 w-[180px] border-r border-slate-200 flex flex-col justify-center gap-1.5 shrink-0">
                    <div className="h-3.5 w-28 bg-[#E5E3DC] rounded" />
                    <div className="h-3 w-16 bg-[#E5E3DC] rounded" />
                    <div className="h-3 w-20 bg-[#E5E3DC] rounded" />
                  </div>
                  {[...Array(15)].map((_, c) => (
                    <div key={c} className="flex-1 p-2.5 border-r border-slate-100 flex justify-center">
                      <div className="h-6 w-8 bg-[#E5E3DC]/75 rounded-md" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto relative">
            <table className="border-collapse text-xs w-full text-center table-fixed min-w-[1500px]">
              
              {/* Table Header */}
              <thead className="sticky top-0 bg-slate-50 z-10 shadow-sm border-b border-slate-200">
                <tr className="border-b border-slate-200 text-slate-500 font-bold uppercase">
                  <th className="py-2.5 px-3 text-left w-[180px] bg-slate-50 sticky left-0 z-20 border-r border-slate-200">Staff Info</th>
                  {days.map((day) => (
                    <th
                      key={day.dateStr}
                      className={`w-[45px] font-bold text-[10px] ${day.isSunday ? 'bg-red-50 text-red-600' : ''}`}
                    >
                      {day.dayNum}
                    </th>
                  ))}
                  <th className="w-[150px] py-2.5 px-3">Remarks</th>
                </tr>
                <tr className="border-b border-slate-200 text-slate-400 font-bold uppercase text-[9px] bg-slate-50">
                  <th className="py-1 px-3 text-left bg-slate-50 sticky left-0 z-20 border-r border-slate-200">Designation / PF</th>
                  {days.map((day) => (
                    <th
                      key={day.dateStr}
                      className={day.isSunday ? 'bg-red-50/50 text-red-600' : ''}
                    >
                      {day.weekday[0]}
                    </th>
                  ))}
                  <th className="py-1 px-3">Special Orders</th>
                </tr>
              </thead>

              {/* Table Body */}
              <tbody className="divide-y divide-slate-100 bg-white">
                {(() => {
                  let lastSection = '';
                  let localSl = 0;
                  return employees.flatMap((emp, idx) => {
                    const empGrid = gridData[emp.emp_id] || {};
                    const showSectionHeader = activeSection === 'ALL' && emp.section_code !== lastSection;
                    if (showSectionHeader) {
                      lastSection = emp.section_code || '';
                      localSl = 0; // Reset local serial number
                    }
                    localSl++;

                    const globalSl = idx + 1;
                    const slToShow = activeSection === 'ALL' ? localSl : globalSl;
                    
                    const rows = [];
                    if (showSectionHeader) {
                      rows.push(
                        <tr key={`sec-header-${emp.section_code}`} className="bg-slate-100 font-extrabold text-[11px] tracking-wider text-slate-700 uppercase no-print select-none">
                          <td colSpan={days.length + 2} className="py-2 px-4 text-left border-y border-slate-200 bg-slate-150">
                            <span className="bg-blue-600 text-white font-black px-2 py-0.5 rounded mr-2 text-[9px] uppercase tracking-widest shadow-xs">Section</span>
                            <span className="font-black text-slate-800">
                              {getSectionDisplayName(emp.section_code || '')}
                            </span>
                          </td>
                        </tr>
                      );
                    }

                    rows.push(
                      <RosterRow
                        key={emp.emp_id}
                        emp={emp}
                        slToShow={slToShow}
                        empGrid={empGrid}
                        days={days}
                        getCellStyle={getCellStyle}
                        handleCellChange={handleCellChange}
                        handleRemarksChange={handleRemarksChange}
                        activeDropdownCell={activeDropdownCell}
                        setActiveDropdownCell={setActiveDropdownCell}
                        setDropdownPos={setDropdownPos}
                        setHoveredCell={setHoveredCell}
                        setMousePos={setMousePos}
                      />
                    );
                    return rows;
                  });
                })()}
              </tbody>
            </table>
          </div>
        )}

        {/* Static Roster Inspector Footer Bar */}
        <div className="bg-slate-50 border-t border-slate-200 px-4 py-3 flex items-center justify-between text-xs font-bold text-slate-700 select-none shrink-0 no-print">
          <div className="flex items-center gap-2">
            <Info size={14} className="text-slate-400 animate-pulse" />
            <span className="text-slate-400 uppercase tracking-wider text-[10px]">{getTranslation(lang, 'Roster Inspector')}:</span>
            {hoveredCell ? (
              <div className="flex items-center gap-4 animate-fade-in">
                <span className="text-slate-800 font-extrabold">{hoveredCell.empName} <span className="text-slate-400 font-semibold">({hoveredCell.designation})</span></span>
                <span className="text-slate-300">|</span>
                <span className="text-slate-600">{getTranslation(lang, 'Date')}: <span className="text-slate-800">{hoveredCell.dateStr}</span> ({getTranslation(lang, hoveredCell.weekday) || hoveredCell.weekday})</span>
                <span className="text-slate-300">|</span>
                <span className="flex items-center gap-1.5">
                  <span 
                    className="w-2 h-2 rounded-full shrink-0 animate-pulse" 
                    style={{ backgroundColor: allCodes.find(c => c.code === hoveredCell.status)?.text_color || '#94A3B8' }}
                  />
                  <span className="text-slate-850 font-black">{hoveredCell.status}</span>
                  <span className="text-slate-455 font-medium font-sans">({getTranslation(lang, allCodes.find(c => c.code === hoveredCell.status)?.description || '') || allCodes.find(c => c.code === hoveredCell.status)?.description || 'Unassigned'})</span>
                </span>
              </div>
            ) : (
              <span className="text-slate-400 font-medium italic">{getTranslation(lang, 'Hover over any roster cell to view detailed signaller assignment details.')}</span>
            )}
          </div>
          {hoveredCell && (
            <span className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded border border-blue-100 uppercase tracking-widest font-black shrink-0">Live Inspect</span>
          )}
        </div>
      </div>

      {/* Roster Simulation Preview Dialog Modal */}
      {isPreviewOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm z-50 p-4">
          <div className="bg-white border border-[#E2E0D9] w-full max-w-xl max-h-[80vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-up">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                <CheckCircle2 size={16} className="text-emerald-600" />
                Roster Shift Changes Preview ({rosterChanges.length})
              </h3>
              <button onClick={() => setIsPreviewOpen(false)} className="text-slate-400 hover:text-slate-600 text-xs font-bold">✕</button>
            </div>
            
            <div className="p-5 overflow-y-auto space-y-4 max-h-[50vh]">
              {rosterChanges.length === 0 ? (
                <p className="text-center py-8 text-xs text-slate-500 font-bold">
                  No modifications detected. The roster is identical to the database values.
                </p>
              ) : (
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                  {rosterChanges.map((chg, idx) => (
                    <div key={idx} className="flex justify-between items-center p-3 text-xs">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-800">{chg.empName}</span>
                        <span className="text-[10px] text-slate-500 mt-0.5">Date: {chg.date}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">{chg.oldVal}</span>
                        <span className="text-slate-400">→</span>
                        <span className="font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">{chg.newVal}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-150 flex items-center justify-end gap-3">
              <button 
                onClick={() => setIsPreviewOpen(false)}
                className="px-4 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs uppercase cursor-pointer"
              >
                Go Back
              </button>
              <button 
                onClick={executeSaveChanges}
                disabled={rosterChanges.length === 0}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase cursor-pointer shadow-md flex items-center gap-1.5"
              >
                <Check size={14} />
                Confirm Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Month Roster Challenge Modal */}
      <DeleteRosterModal 
        isOpen={isClearModalOpen}
        onClose={() => setIsClearModalOpen(false)}
        onConfirm={confirmClearGrid}
      />

      {/* Bulk Entry Modal Dialog */}
      {showBulkModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm z-50 p-4">
          <div className="bg-white border border-slate-200 w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-up">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                <PlusCircle size={16} className="text-blue-600" />
                Bulk Special Event Entry
              </h3>
              <button
                onClick={() => setShowBulkModal(false)}
                className="text-slate-400 hover:text-slate-650 text-xs font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleBulkSubmit} className="p-5 space-y-4">
              {/* Target Employee */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Target Employee</label>
                <CustomSelect
                  value={bulkEmpId}
                  onChange={(val) => setBulkEmpId(val)}
                  options={[
                    { value: "all", label: `All Employees (${employees.length})` },
                    ...employees.map(e => ({ value: String(e.emp_id), label: `${e.name} (${e.designation})` }))
                  ]}
                  placeholder="Select Employee"
                />
              </div>

              {/* Date range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Start Date</label>
                  <CustomDatePicker
                    value={bulkStartDate}
                    onChange={(val) => setBulkStartDate(val)}
                    placeholder="Start Date"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">End Date</label>
                  <CustomDatePicker
                    value={bulkEndDate}
                    onChange={(val) => setBulkEndDate(val)}
                    placeholder="End Date"
                    required
                  />
                </div>
              </div>

              {/* Status Code */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Roster Code Status</label>
                <CustomSelect
                  value={bulkStatus}
                  onChange={(val) => setBulkStatus(val)}
                  options={[
                    ...allCodes.map(code => ({ value: code.code, label: `${code.code} - ${code.description}` })),
                    { value: "CUSTOM_CODE", label: "Custom..." }
                  ]}
                  placeholder="Select Code"
                />
              </div>

              {/* Custom Code Input when selected */}
              {bulkStatus === 'CUSTOM_CODE' && (
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Enter Custom Roster Code</label>
                  <input
                    type="text"
                    placeholder="e.g. TRG"
                    value={bulkCustomCode}
                    onChange={(e) => setBulkCustomCode(e.target.value)}
                    maxLength={10}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 uppercase focus:outline-none focus:border-blue-500"
                    required
                  />
                </div>
              )}

              {/* Order number */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Reference/Order Number (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. MRTS/SG-510/27(711) or Medical Memo"
                  value={bulkOrderNumber}
                  onChange={(e) => setBulkOrderNumber(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>

              {/* Remarks */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Details / Location Remarks</label>
                <textarea
                  placeholder="Additional remarks, transfer locations, training programs info"
                  value={bulkRemarks}
                  onChange={(e) => setBulkRemarks(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500 h-20 resize-none"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowBulkModal(false)}
                  className="px-4 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase cursor-pointer shadow-sm flex items-center gap-1.5"
                >
                  <CheckCircle2 size={14} />
                  Apply & Insert
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Roster Conflict Warning Modal */}
      {showConflictModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm z-50 p-4">
          <div className="bg-white border border-slate-250 w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-up">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-amber-50 text-amber-800">
              <AlertTriangle size={18} className="text-amber-600 shrink-0" />
              <h3 className="font-bold text-xs uppercase tracking-wider">Warning: Roster Conflicts Detected ({bulkConflicts.length})</h3>
            </div>
            
            <div className="p-5 space-y-4 overflow-y-auto max-h-[40vh]">
              <p className="text-xs text-slate-650 leading-relaxed font-semibold">
                The selected date range overlaps with existing leave, holiday, or rest entries for one or more employees:
              </p>
              
              <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden bg-slate-50/50">
                {bulkConflicts.map((cft, idx) => (
                  <div key={idx} className="flex justify-between items-center p-2.5 text-xs">
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-800">{cft.empName}</span>
                      <span className="text-[10px] text-slate-500 mt-0.5">Date: {cft.date}</span>
                    </div>
                    <span className="font-bold px-2 py-0.5 rounded bg-amber-100 border border-amber-250 text-amber-800 uppercase text-[10px]">
                      {cft.status}
                    </span>
                  </div>
                ))}
              </div>
              
              <p className="text-[11px] text-slate-400 font-bold">
                * Note: Proceeding will overwrite these status codes with the new bulk code.
              </p>
            </div>
            
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-150 flex items-center justify-end gap-3">
              <button 
                onClick={() => {
                  setShowConflictModal(false);
                  setPendingBulkLogList([]);
                }}
                className="px-3.5 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs uppercase cursor-pointer"
              >
                Cancel Bulk Entry
              </button>
              <button 
                onClick={() => applyBulkChanges(pendingBulkLogList)}
                className="px-3.5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs uppercase cursor-pointer shadow-md"
              >
                Override & Overwrite
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Premium Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-slate-800 text-white rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 max-w-sm transition-all duration-300">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${toast.type === 'success' ? 'bg-emerald-500' : toast.type === 'error' ? 'bg-rose-500' : 'bg-blue-500'
            }`}></span>
          <p className="text-xs font-semibold text-slate-200">{toast.message}</p>
          <button onClick={() => setToast(null)} className="text-slate-400 hover:text-slate-200 text-xs ml-2">✕</button>
        </div>
      )}

      {/* Confirm Dialog Modal */}
      {confirmDialog && confirmDialog.isOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm z-50 p-4">
          <div className="bg-white border border-slate-200 w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-up">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                <Info size={16} />
              </span>
              <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider">{confirmDialog.title}</h3>
            </div>
            <div className="px-6 py-4">
              <p className="text-xs text-slate-660 leading-relaxed font-semibold">{confirmDialog.message}</p>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmDialog(null)}
                className="px-4 py-2 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-bold text-xs uppercase tracking-wider transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDialog.onConfirm}
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider transition cursor-pointer shadow-sm"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Code Modal */}
      {customModal && customModal.isOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm z-50 p-4">
          <div className="bg-white border border-slate-200 w-full max-w-sm rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-up">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                <Sparkles size={16} className="text-blue-600" />
                Enter Custom Roster Code
              </h3>
              <button onClick={() => setCustomModal(null)} className="text-slate-400 hover:text-slate-655 text-xs font-bold">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Custom Code (e.g. TRG, OFF, OUT)</label>
                <input
                  type="text"
                  placeholder="e.g. TRG"
                  value={customCodeInput}
                  onChange={(e) => setCustomCodeInput(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 uppercase focus:outline-none focus:border-blue-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Reference/Order Number (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. MRTS/SG-510/27(711) or Medical Memo"
                  value={customOrderInput}
                  onChange={(e) => setCustomOrderInput(e.target.value)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Details / Location Remarks (Optional)</label>
                <textarea
                  placeholder="Additional remarks, training program details"
                  value={customRemarksInput}
                  onChange={(e) => setCustomRemarksInput(e.target.value)}
                  rows={2}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setCustomModal(null)}
                  className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const code = customCodeInput.trim().toUpperCase();
                    if (!code) {
                      showToast("Please enter a valid code.", "error");
                      return;
                    }
                    const order = customOrderInput.trim();
                    const remarks = customRemarksInput.trim();
                    let finalRemarks = '';
                    if (order) {
                      finalRemarks = `Order: ${order}`;
                      if (remarks) finalRemarks += ` | ${remarks}`;
                    } else {
                      finalRemarks = remarks;
                    }
                    handleCellChange(customModal.empId, customModal.dateStr, code, finalRemarks);
                    setCustomModal(null);
                  }}
                  className="px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase cursor-pointer"
                >
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CR Selection Modal */}
      {crModal && crModal.isOpen && (() => {
        const handleApplyEarnedDate = (earnedDateStr: string, entryId?: number) => {
          if (!earnedDateStr) {
            showToast("Please enter or select a valid earned date.", "error");
            return;
          }
          const availedDate = new Date(crModal.dateStr);
          const earnedDate = new Date(earnedDateStr);
          
          if (earnedDate > availedDate) {
            showToast("Earned date cannot be after the availed date.", "error");
            return;
          }
          
          const diffTime = availedDate.getTime() - earnedDate.getTime();
          const diffDays = diffTime / (1000 * 60 * 60 * 24);
          
          const proceed = () => {
            if (entryId) {
              setCrAssociations(prev => ({ ...prev, [`${crModal.empId}_${crModal.dateStr}`]: entryId }));
            }
            setGridData((prev) => {
              const empGrid = { ...(prev[crModal.empId] || {}) };
              const oldLog = empGrid[crModal.dateStr];
              empGrid[crModal.dateStr] = {
                ...oldLog,
                emp_id: crModal.empId,
                date: crModal.dateStr,
                status: 'CR',
                is_night: false,
                remarks: `CR_EARNED_DATE:${earnedDateStr}`
              };
              return { ...prev, [crModal.empId]: empGrid };
            });
            setIsModified(true);
            setCrModal(null);
            setManualCrDate('');
            showToast(`Associated CR with earned date: ${earnedDateStr}`, "success");
          };

          if (diffDays > 31) {
            setConfirmDialog({
              isOpen: true,
              title: "CR Expiry Warning",
              message: `Compensatory Rest should ideally be availed within 1 month. The earned date (${earnedDateStr}) is ${Math.round(diffDays)} days prior to the availed date (${crModal.dateStr}). Proceed anyway?`,
              onConfirm: () => {
                setConfirmDialog(null);
                proceed();
              }
            });
          } else {
            proceed();
          }
        };

        return (
          <div className="fixed inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm z-50 p-4">
            <div className="bg-white border border-slate-200 w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-up">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-blue-50/50">
                <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                  <CalendarDays size={16} className="text-blue-600" />
                  Select Compensatory Rest (CR) Source
                </h3>
                <button onClick={() => { setCrModal(null); setManualCrDate(''); }} className="text-slate-400 hover:text-slate-655 text-xs font-bold">✕</button>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-xs text-slate-650 font-semibold leading-relaxed">
                  Select an accrued earned rest day work or enter manually to associate with CR on <strong className="text-blue-600">{crModal.dateStr}</strong>:
                </p>

                {/* Suggestions List */}
                <div className="space-y-1.5">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Suggested Earned Dates:</span>
                  <div className="max-h-[140px] overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100 bg-slate-50/50">
                    {crModal.availableEntries.length === 0 ? (
                      <div className="p-3 text-center text-[11px] text-slate-400 font-semibold italic">
                        No available unconsumed CR earned records found.
                      </div>
                    ) : (
                      crModal.availableEntries.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => handleApplyEarnedDate(entry.earned_date, entry.id)}
                          className="w-full text-left p-2.5 hover:bg-blue-50/60 transition flex justify-between items-center cursor-pointer group"
                        >
                          <span className="text-xs font-bold text-slate-700 group-hover:text-blue-700">Earned Date: {entry.earned_date}</span>
                          <span className="text-[9px] bg-blue-50 border border-blue-200 text-blue-700 font-bold px-2 py-0.5 rounded-full">Available</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>

                {/* Manual Picker */}
                <div className="pt-3 border-t border-slate-100 space-y-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Or Enter Earned Date Manually:</span>
                  <div className="flex gap-2 items-center">
                    <div className="flex-1">
                      <CustomDatePicker
                        value={manualCrDate}
                        onChange={(val) => setManualCrDate(val)}
                        placeholder="Manual Date"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleApplyEarnedDate(manualCrDate)}
                      className="px-3.5 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase cursor-pointer transition shadow-xs"
                    >
                      Associate Date
                    </button>
                  </div>
                </div>

                {/* Footer buttons */}
                <div className="flex justify-between items-center pt-3 border-t border-slate-100 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setGridData((prev) => {
                        const empGrid = { ...(prev[crModal.empId] || {}) };
                        const oldLog = empGrid[crModal.dateStr];
                        empGrid[crModal.dateStr] = {
                          ...oldLog,
                          emp_id: crModal.empId,
                          date: crModal.dateStr,
                          status: 'CR',
                          is_night: false,
                          remarks: ''
                        };
                        return { ...prev, [crModal.empId]: empGrid };
                      });
                      setIsModified(true);
                      setCrModal(null);
                      setManualCrDate('');
                    }}
                    className="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 text-slate-655 font-bold text-xs uppercase cursor-pointer"
                  >
                    Proceed without Date (Just CR)
                  </button>

                  <button
                    type="button"
                    onClick={() => { setCrModal(null); setManualCrDate(''); }}
                    className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Cell Delete Confirmation Modal */}
      {pendingDeleteCell && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm z-50 p-4">
          <div className="bg-white border border-[#E2E0D9] w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-up">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-rose-50 text-rose-800">
              <AlertCircle size={18} className="text-rose-600" />
              <h3 className="font-bold text-xs uppercase tracking-wider">Confirm Delete Record</h3>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-650 leading-relaxed font-semibold">
                Are you sure you want to permanently delete the attendance entry for <strong>{pendingDeleteCell.empName}</strong> on <strong>{pendingDeleteCell.dateStr}</strong>?
              </p>
              <p className="text-xs text-slate-500 font-medium">
                This will wipe the entry from the database. An automatic safety backup of the database will be created before deletion.
              </p>
              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-150">
                <button
                  onClick={() => setPendingDeleteCell(null)}
                  className="px-3.5 py-2 rounded-lg border border-slate-250 hover:bg-slate-50 text-slate-700 font-bold text-xs uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    const { empId, dateStr } = pendingDeleteCell;
                    setPendingDeleteCell(null);
                    setLoading(true);
                    try {
                      await createBackup();
                      await deleteAttendanceLog(empId, dateStr);
                      await loadData(activeSection, selectedMonth, selectedYear);
                      showToast("Successfully deleted attendance log from the database.", "success");
                    } catch (e) {
                      console.error("Delete cell failed:", e);
                      showToast("Failed to delete log entry.", "error");
                    } finally {
                      setLoading(false);
                    }
                  }}
                  className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs uppercase cursor-pointer shadow-md flex items-center gap-1.5"
                >
                  <Trash2 size={14} />
                  Delete Entry
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Global Attendance Cell Dropdown Menu */}
      {activeDropdownCell && dropdownPos && (() => {
        const currentStatus = gridData[activeDropdownCell.empId]?.[activeDropdownCell.dateStr]?.status || '';
        return (
          <>
            {/* Click outside to close */}
            <div 
              className="fixed inset-0 z-40 cursor-default" 
              onClick={() => {
                setActiveDropdownCell(null);
                setDropdownPos(null);
              }}
            />
            
            {/* Dropdown Menu */}
            <div 
              className="fixed bg-white border border-slate-200 rounded-xl shadow-xl z-50 py-1 animate-in fade-in zoom-in-95 duration-100 flex flex-col text-left overflow-hidden select-none"
              style={{ 
                top: `${dropdownPos.top - topOffset + 4}px`, 
                left: `${dropdownPos.left - leftOffset}px`,
                transform: 'translateX(-50%)',
                width: '85px'
              }}
            >
              <button
                type="button"
                onClick={() => {
                  handleCellChange(activeDropdownCell.empId, activeDropdownCell.dateStr, "");
                  setActiveDropdownCell(null);
                  setDropdownPos(null);
                }}
                className={`w-full px-2 py-1 flex items-center justify-between hover:bg-slate-50 transition text-[10px] font-extrabold text-slate-400 cursor-pointer ${!currentStatus ? 'bg-slate-100' : ''}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-slate-300" />
                  <span>—</span>
                </div>
                {!currentStatus && (
                  <Check size={10} className="text-slate-450 stroke-[3]" />
                )}
              </button>
              {allCodes.map((c) => {
                const isSelected = currentStatus === c.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => {
                      handleCellChange(activeDropdownCell.empId, activeDropdownCell.dateStr, c.code);
                      setActiveDropdownCell(null);
                      setDropdownPos(null);
                    }}
                    className={`w-full px-2 py-1 flex items-center justify-between hover:bg-slate-50 transition text-[10px] font-black cursor-pointer ${isSelected ? 'bg-slate-100' : ''}`}
                    style={{ color: c.text_color }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span 
                        className="w-1.5 h-1.5 rounded-full shrink-0" 
                        style={{ 
                          backgroundColor: c.text_color, 
                          boxShadow: `0 0 3px ${c.text_color}60`
                        }}
                      />
                      <span>{c.code}</span>
                    </div>
                    {isSelected && (
                      <Check size={10} className="text-slate-650 stroke-[3]" />
                    )}
                  </button>
                );
              })}
              <div className="border-t border-slate-100 my-0.5"></div>
              <button
                type="button"
                onClick={() => {
                  handleCellChange(activeDropdownCell.empId, activeDropdownCell.dateStr, "CUSTOM_CODE");
                  setActiveDropdownCell(null);
                  setDropdownPos(null);
                }}
                className="w-full px-2 py-1 flex items-center gap-1.5 hover:bg-blue-50 text-[10px] font-black text-blue-600 transition cursor-pointer"
              >
                <Pencil size={10} className="text-blue-500 shrink-0" />
                <span>Custom</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  handleCellChange(activeDropdownCell.empId, activeDropdownCell.dateStr, "DELETE");
                  setActiveDropdownCell(null);
                  setDropdownPos(null);
                }}
                className="w-full px-2 py-1 flex items-center gap-1.5 hover:bg-rose-50 text-[10px] font-black text-rose-600 transition cursor-pointer"
              >
                <Trash2 size={10} className="text-rose-500 shrink-0" />
                <span>Delete</span>
              </button>
            </div>
          </>
        );
      })()}

      {/* Floating Hover Roster Inspector Card */}
      {hoveredCell && !activeDropdownCell && (
        <div 
          className="fixed z-50 pointer-events-none bg-slate-900/90 backdrop-blur-md border border-slate-700/80 rounded-2xl shadow-2xl p-4 flex flex-col gap-2 text-white animate-in fade-in zoom-in-95 duration-100 max-w-xs"
          style={{ 
            top: `${mousePos.y - topOffset + 15}px`, 
            left: `${typeof window !== 'undefined' && mousePos.x + 220 > window.innerWidth ? mousePos.x - leftOffset - 220 : mousePos.x - leftOffset + 15}px`,
          }}
        >
          {/* Employee Info */}
          <div className="flex items-center gap-2.5 border-b border-slate-700/50 pb-2">
            <span className="w-8 h-8 rounded-full bg-blue-600/35 border border-blue-500/50 flex items-center justify-center font-bold text-xs uppercase text-blue-300">
              {hoveredCell.empName.charAt(0)}
            </span>
            <div className="flex flex-col min-w-0">
              <span className="font-extrabold text-[12px] leading-tight truncate text-slate-100">{hoveredCell.empName}</span>
              <span className="text-[10px] font-semibold text-slate-400 mt-0.5">{hoveredCell.designation}</span>
            </div>
          </div>

          {/* Date & Shift Info */}
          <div className="grid grid-cols-2 gap-4 text-[10.5px] font-semibold">
            <div className="flex flex-col">
              <span className="text-slate-500 uppercase text-[8px] tracking-wider font-bold">{getTranslation(lang, 'Date')}</span>
              <span className="text-slate-200 mt-0.5">{hoveredCell.dateStr}</span>
              <span className="text-slate-400 text-[9px] mt-0.5">({getTranslation(lang, hoveredCell.weekday) || hoveredCell.weekday})</span>
            </div>
            <div className="flex flex-col items-start">
              <span className="text-slate-500 uppercase text-[8px] tracking-wider font-bold">{getTranslation(lang, 'Roster Code')}</span>
              <div className="flex items-center gap-1.5 mt-1">
                <span 
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: allCodes.find(c => c.code === hoveredCell.status)?.text_color || '#94A3B8',
                    boxShadow: `0 0 6px ${allCodes.find(c => c.code === hoveredCell.status)?.text_color || '#94A3B8'}80`
                  }}
                />
                <span className="font-extrabold text-slate-200">{hoveredCell.status}</span>
              </div>
              <span className="text-[9px] text-slate-400 mt-0.5 leading-none">
                {getTranslation(lang, allCodes.find(c => c.code === hoveredCell.status)?.description || '') || allCodes.find(c => c.code === hoveredCell.status)?.description || 'Unassigned'}
              </span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

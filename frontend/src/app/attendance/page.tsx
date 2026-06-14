'use client';

import { useState, useEffect } from 'react';
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
  Settings
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
  updateCRLedgerEntry
} from '../../lib/api';

interface DayInfo {
  dateStr: string;
  dayNum: number;
  weekday: string;
  isSunday: boolean;
}

export default function AttendanceGrid() {
  const [activeSection, setActiveSection] = useState<string>('KKVS');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Date period state
  const [selectedMonth, setSelectedMonth] = useState<number>(5); // June (0-indexed 5)
  const [selectedYear, setSelectedYear] = useState<number>(2026);
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
  const [crModal, setCrModal] = useState<{ isOpen: boolean; empId: number; dateStr: string; availableEntries: CRLedgerEntry[] } | null>(null);
  
  // Roster Simulation/Preview Modal state
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [rosterChanges, setRosterChanges] = useState<{ empName: string; date: string; oldVal: string; newVal: string }[]>([]);

  // Clear challenge modal state
  const [isClearModalOpen, setIsClearModalOpen] = useState(false);
  const [clearChallengeInput, setClearChallengeInput] = useState('');

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
        await fetch('http://localhost:8000/api/lines');
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
    const sectionName = activeSection === 'ALL'
      ? 'KKVS & KMUK Sections'
      : activeSection === 'KKVS'
        ? 'Kavi Subhash Section'
        : 'Tollygunge Section';

    // Build rows for payload
    const exportRows = employees.map((emp, idx) => {
      const empGrid = gridData[emp.emp_id] || {};
      const daysList = days.map((day) => {
        const log = empGrid[day.dateStr];
        return {
          day: day.dayNum,
          weekday: day.weekday,
          status: log?.status || '',
          is_holiday: day.isSunday
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
      rows: exportRows
    };

    try {
      const endpoint = `http://localhost:8000/api/export/attendance/${format}`;
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
      const emps = await getEmployees(section === 'ALL' ? undefined : section);
      setEmployees(emps);

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

      const newGrid: { [empId: number]: { [dateStr: string]: AttendanceLog } } = {};
      emps.forEach((emp) => {
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
      for (const emp of emps) {
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
  const handleCellChange = async (empId: number, dateStr: string, value: string) => {
    if (value === 'CUSTOM_CODE') {
      setCustomModal({ isOpen: true, empId, dateStr });
      setCustomCodeInput('');
      return;
    }

    if (value === 'CR') {
      const ledger = crLedgers[empId] || [];
      const available = ledger.filter(e => e.consumed_date === null || e.consumed_date === dateStr);
      setCrModal({ isOpen: true, empId, dateStr, availableEntries: available });
      return;
    }

    setGridData((prev) => {
      const empGrid = { ...(prev[empId] || {}) };
      const oldLog = empGrid[dateStr];
      empGrid[dateStr] = {
        ...oldLog,
        emp_id: empId,
        date: dateStr,
        status: value as any,
        is_night: value === 'P/N'
      };
      return {
        ...prev,
        [empId]: empGrid
      };
    });
    setIsModified(true);
  };

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
    const weekdayMap: { [key: string]: string } = {
      'Mon': 'Monday', 'Tue': 'Tuesday', 'Wed': 'Wednesday', 'Thu': 'Thursday', 'Fri': 'Friday', 'Sat': 'Saturday', 'Sun': 'Sunday'
    };

    employees.forEach((emp) => {
      const empGrid = { ...(updatedGrid[emp.emp_id] || {}) };

      days.forEach((day, index) => {
        const existing = empGrid[day.dateStr];
        if (!existing || !existing.status) {
          const restDay = emp.default_rest_day;
          const isRest = day.weekday === restDay.slice(0, 3) || (day.isSunday && restDay === 'Sunday');

          let status = isRest ? 'R' : 'P';
          const sched = emp.weekly_schedule;
          if (sched) {
            const fullDayName = weekdayMap[day.weekday];
            if ((sched as any).type === 'rotating') {
              let wk = 'week1';
              if (index >= 7 && index < 14) wk = 'week2';
              else if (index >= 14 && index < 21) wk = 'week3';
              else if (index >= 21) wk = 'week4';
              
              status = (sched as any)[wk]?.[fullDayName] || status;
            } else {
              status = (sched as any)[fullDayName] || status;
            }
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
    setClearChallengeInput('');
  };

  const confirmClearGrid = () => {
    if (clearChallengeInput !== 'CLEAR') {
      showToast("Challenge code invalid. Please type 'CLEAR'.", "error");
      return;
    }

    const clearedGrid = { ...gridData };
    employees.forEach((emp) => {
      const empGrid = { ...(clearedGrid[emp.emp_id] || {}) };
      days.forEach((day) => {
        empGrid[day.dateStr] = {
          emp_id: emp.emp_id,
          date: day.dateStr,
          status: 'P',
          is_night: false,
          remarks: ''
        };
      });
      clearedGrid[emp.emp_id] = empGrid;
    });

    setGridData(clearedGrid);
    setIsModified(true);
    setIsClearModalOpen(false);
    showToast("Grid cleared. All cells initialized as 'P' (Present). Click 'Save Changes' to commit.", "info");
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

  const getCellStyle = (status: string, isSunday: boolean) => {
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
  };

  return (
    <div className="p-6 space-y-6 flex flex-col h-full min-h-screen">

      {/* Title & Toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
            Smart Attendance Grid
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 font-bold uppercase tracking-wider">
              {activeSection === 'ALL' ? 'Joint View' : `${activeSection} Section`}
            </span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Manage daily presence codes from the 11th of the starting month to the 10th of the next month.
          </p>
        </div>

        {/* Toolbar controls */}
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Period selector */}
          <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-lg p-1.5 text-sm text-slate-800 no-print">
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

          <button
            onClick={handleAutoFill}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-100 text-blue-600 font-bold text-xs tracking-wider uppercase transition no-print cursor-pointer"
          >
            <Sparkles size={14} />
            Auto-Fill
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
            Undo
          </button>

          <button
            onClick={triggerClearGrid}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-600 font-bold text-xs tracking-wider uppercase transition no-print cursor-pointer"
          >
            <Trash2 size={14} />
            Clear Grid
          </button>

          <button
            onClick={() => {
              setShowBulkModal(true);
              setBulkConflicts([]);
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 hover:bg-slate-100 text-slate-700 font-bold text-xs tracking-wider uppercase transition no-print cursor-pointer"
          >
            <PlusCircle size={14} />
            Bulk Entry
          </button>

          {/* Signatories Config Toggle */}
          <button
            onClick={() => setShowSigConfig(!showSigConfig)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border font-bold text-xs tracking-wider uppercase transition shadow-sm no-print cursor-pointer ${showSigConfig ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-100 border-slate-250 text-slate-700 hover:bg-slate-200'}`}
          >
            <Settings size={14} />
            Signatories
          </button>

          <button
            onClick={() => handleAttendanceExport('excel')}
            disabled={exporting !== null}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs tracking-wider uppercase transition shadow-sm no-print cursor-pointer"
          >
            <FileSpreadsheet size={14} />
            {exporting === 'excel' ? 'Excel...' : 'Export Excel'}
          </button>

          <button
            onClick={() => handleAttendanceExport('pdf')}
            disabled={exporting !== null}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs tracking-wider uppercase transition shadow-sm no-print cursor-pointer"
          >
            <FileText size={14} />
            {exporting === 'pdf' ? 'PDF...' : 'Export PDF'}
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
            {isSaving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Signatory Config Panel */}
      {showSigConfig && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-bold text-slate-750 no-print">
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

      {/* Roster Guide Panel */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-wrap gap-4 text-xs text-slate-600 items-center justify-between shadow-sm no-print">
        <div className="flex items-center gap-1.5">
          <Info size={14} className="text-blue-600" />
          <span><strong>Roster Code Key:</strong></span>
        </div>
        <div className="flex flex-wrap gap-3.5">
          <span className="flex items-center gap-1"><span className="w-5 h-4 rounded text-center bg-slate-100 border border-slate-200 font-bold block text-[9px] leading-4 text-slate-700">P</span> Present</span>
          <span className="flex items-center gap-1"><span className="w-5 h-4 rounded text-center bg-purple-50 border border-purple-200 font-bold block text-[9px] leading-4 text-purple-700">P/N</span> Night Shift</span>
          <span className="flex items-center gap-1"><span className="w-5 h-4 rounded text-center bg-slate-200 font-bold block text-[9px] leading-4 text-slate-500">R</span> Rest Day</span>
          <span className="flex items-center gap-1"><span className="w-5 h-4 rounded text-center bg-blue-50 border border-blue-200 font-bold block text-[9px] leading-4 text-blue-700">CR</span> Comp. Rest</span>
          <span className="flex items-center gap-1"><span className="w-5 h-4 rounded text-center bg-amber-50 border border-amber-200 font-bold block text-[9px] leading-4 text-amber-700">CL</span> Casual Leave</span>
          <span className="flex items-center gap-1"><span className="w-5 h-4 rounded text-center bg-orange-50 border border-orange-200 font-bold block text-[9px] leading-4 text-orange-700">LAP</span> LAP Leave</span>
          <span className="flex items-center gap-1"><span className="w-5 h-4 rounded text-center bg-red-100 font-bold block text-[9px] leading-4 text-red-700">Sick</span> Sick Leave</span>
          <span className="flex items-center gap-1"><span className="w-5 h-4 rounded text-center bg-rose-50 border border-rose-200 font-bold block text-[9px] leading-4 text-rose-700">SCL</span> Spl Leave</span>
          <span className="flex items-center gap-1"><span className="w-5 h-4 rounded text-center bg-yellow-50 border border-yellow-200 font-bold block text-[9px] leading-4 text-yellow-650">PH</span> Pub Holiday</span>
        </div>
      </div>

      {/* Grid Container */}
      <div className="flex-1 glass-panel rounded-xl border border-slate-200 flex flex-col overflow-hidden max-h-[60vh] bg-white shadow-sm">
        {loading ? (
          <div className="h-64 flex items-center justify-center text-slate-400 font-semibold text-sm">
            Loading roster sheet data...
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
                {employees.map((emp) => {
                  const empGrid = gridData[emp.emp_id] || {};

                  return (
                    <tr key={emp.emp_id} className="hover:bg-slate-50/50 transition-colors">
                      {/* Fixed Staff info cell */}
                      <td className="py-2 px-3 text-left bg-slate-50 sticky left-0 z-10 border-r border-slate-200 flex flex-col justify-center h-[60px] w-[180px]">
                        <span className="font-bold text-slate-800 text-[11px] truncate max-w-[160px]">
                          {emp.name}
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

                        return (
                          <td
                            key={day.dateStr}
                            className="p-1 border-r border-slate-200 relative"
                            style={getCellStyle(status, day.isSunday)}
                          >
                            <select
                              value={status}
                              onChange={(e) => handleCellChange(emp.emp_id, day.dateStr, e.target.value)}
                              className="w-full h-full text-center bg-transparent border-none appearance-none font-bold text-[10px] focus:outline-none cursor-pointer p-1"
                              style={{ color: getCellStyle(status, day.isSunday).color }}
                            >
                              <option value="" className="bg-white text-slate-450">—</option>
                              {allCodes.map((c) => (
                                <option key={c.code} value={c.code} className="bg-white text-slate-800" style={{ color: c.text_color }}>
                                  {c.code}
                                </option>
                              ))}
                              <option value="CUSTOM_CODE" className="bg-white text-blue-600 font-bold">Custom...</option>
                            </select>
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
                              handleCellChange(emp.emp_id, days[0].dateStr, empGrid[days[0].dateStr]?.status || 'P');
                              setGridData((prev) => {
                                const eg = { ...prev[emp.emp_id] };
                                eg[days[0].dateStr].remarks = e.target.value;
                                return { ...prev, [emp.emp_id]: eg };
                              });
                            }
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded px-2 py-1 text-[10px] text-slate-700 focus:outline-none focus:border-blue-500"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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

      {/* Clear Grid Challenge Modal */}
      {isClearModalOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm z-50 p-4">
          <div className="bg-white border border-[#E2E0D9] w-full max-w-sm rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-up">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3 bg-rose-50 text-rose-800">
              <AlertCircle size={18} className="text-rose-600" />
              <h3 className="font-bold text-xs uppercase tracking-wider">Destructive Operation: Clear Grid</h3>
            </div>
            
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-650 leading-relaxed font-semibold">
                This will reset all cell codes in the active roster cycle to default <strong>'P' (Present)</strong>.
              </p>
              <p className="text-xs text-slate-500 font-medium">
                To confirm this change, please type <code className="bg-rose-50 border border-rose-200 text-rose-700 font-mono px-1 py-0.5 rounded font-bold">CLEAR</code> in the validation input field below:
              </p>
              
              <input 
                type="text"
                placeholder="Type CLEAR here"
                value={clearChallengeInput}
                onChange={(e) => setClearChallengeInput(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold placeholder-slate-400 text-slate-800 uppercase focus:outline-none focus:border-rose-500"
              />

              <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-150">
                <button
                  onClick={() => setIsClearModalOpen(false)}
                  className="px-3.5 py-2 rounded-lg border border-slate-250 hover:bg-slate-50 text-slate-700 font-bold text-xs uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmClearGrid}
                  disabled={clearChallengeInput !== 'CLEAR'}
                  className={`px-3.5 py-2 rounded-lg font-bold text-xs uppercase cursor-pointer flex items-center gap-1.5 ${
                    clearChallengeInput === 'CLEAR'
                      ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-md'
                      : 'bg-slate-100 text-slate-450 border border-slate-250 cursor-not-allowed'
                  }`}
                >
                  <Trash2 size={14} />
                  Clear Grid Cells
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                <select
                  value={bulkEmpId}
                  onChange={(e) => setBulkEmpId(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  <option value="all">All Employees ({employees.length})</option>
                  {employees.map(e => (
                    <option key={e.emp_id} value={e.emp_id}>{e.name} ({e.designation})</option>
                  ))}
                </select>
              </div>

              {/* Date range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Start Date</label>
                  <input
                    type="date"
                    value={bulkStartDate}
                    onChange={(e) => setBulkStartDate(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">End Date</label>
                  <input
                    type="date"
                    value={bulkEndDate}
                    onChange={(e) => setBulkEndDate(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                    required
                  />
                </div>
              </div>

              {/* Status Code */}
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Roster Code Status</label>
                <select
                  value={bulkStatus}
                  onChange={(e) => setBulkStatus(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                >
                  {allCodes.map((code) => (
                    <option key={code.code} value={code.code}>
                      {code.code} - {code.description}
                    </option>
                  ))}
                  <option value="CUSTOM_CODE" className="text-blue-600 font-bold">Custom...</option>
                </select>
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
                  maxLength={10}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-bold text-slate-800 uppercase focus:outline-none focus:border-blue-500"
                  autoFocus
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
                    handleCellChange(customModal.empId, customModal.dateStr, code);
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
      {crModal && crModal.isOpen && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm z-50 p-4">
          <div className="bg-white border border-slate-200 w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-up">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                <CalendarDays size={16} className="text-blue-600" />
                Select Compensatory Rest (CR) Source
              </h3>
              <button onClick={() => setCrModal(null)} className="text-slate-400 hover:text-slate-655 text-xs font-bold">✕</button>
            </div>
            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-600 font-semibold leading-relaxed">
                Select an accrued earned rest day work or manual entry to associate with this CR consumption on <strong>{crModal.dateStr}</strong>:
              </p>

              <div className="max-h-[220px] overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100 bg-slate-50/50">
                {crModal.availableEntries.length === 0 ? (
                  <div className="p-4 text-center text-xs text-slate-400 font-semibold">
                    No available unconsumed CR earned records found.
                  </div>
                ) : (
                  crModal.availableEntries.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => {
                        setCrAssociations(prev => ({ ...prev, [`${crModal.empId}_${crModal.dateStr}`]: entry.id! }));
                        setGridData((prev) => {
                          const empGrid = { ...(prev[crModal.empId] || {}) };
                          const oldLog = empGrid[crModal.dateStr];
                          empGrid[crModal.dateStr] = {
                            ...oldLog,
                            emp_id: crModal.empId,
                            date: crModal.dateStr,
                            status: 'CR',
                            is_night: false
                          };
                          return { ...prev, [crModal.empId]: empGrid };
                        });
                        setIsModified(true);
                        setCrModal(null);
                        showToast(`Associated CR with earned date: ${entry.earned_date}`, "success");
                      }}
                      className="w-full text-left p-3 hover:bg-blue-50/60 transition flex justify-between items-center cursor-pointer group"
                    >
                      <span className="text-xs font-bold text-slate-700 group-hover:text-blue-700">Earned Date: {entry.earned_date}</span>
                      <span className="text-[10px] bg-blue-50 border border-blue-200 text-blue-700 font-bold px-2 py-0.5 rounded-full">Available</span>
                    </button>
                  ))
                )}
              </div>

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
                        is_night: false
                      };
                      return { ...prev, [crModal.empId]: empGrid };
                    });
                    setIsModified(true);
                    setCrModal(null);
                  }}
                  className="px-3 py-1.5 rounded border border-slate-200 hover:bg-slate-50 text-slate-650 font-bold text-xs uppercase cursor-pointer"
                >
                  Proceed Unassociated
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setCrModal(null)}
                    className="px-3 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

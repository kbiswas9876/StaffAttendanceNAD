'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  TrendingUp, 
  MapPin, 
  CalendarDays, 
  Calendar, 
  Settings, 
  Database, 
  History, 
  Plus, 
  PlusCircle, 
  Edit, 
  Trash2, 
  ArrowLeftRight, 
  Sparkles, 
  Save, 
  CheckCircle, 
  Search, 
  RefreshCw,
  Clock,
  ChevronRight,
  Info
} from 'lucide-react';
import { 
  getEmployees, createEmployee, updateEmployee, deleteEmployee, Employee,
  getLines, createLine, updateLine, deleteLine, MetroLine,
  getSections, createSection, updateSection, deleteSection, Section,
  getShiftRules, createShiftRule, ShiftRule,
  getAttendanceCodes, createAttendanceCode, updateAttendanceCode, deleteAttendanceCode, AttendanceCode,
  getHolidays, createHoliday, updateHoliday, deleteHoliday, Holiday,
  getAuditLogs, AuditLog,
  getBackupsList, createBackup, restoreBackup, getBackupStatus, deleteBackup,
  getAttendanceLogs, saveAttendanceLogsBulk, addSpecialEvent,
  getWeeklyScheduleDefault
} from '../../lib/api';

interface DayInfo {
  dateStr: string;
  dayNum: number;
  weekday: string;
  isSunday: boolean;
}

const getBaseRotatingShift = (sched: any, dateStr: string) => {
  if (sched.type !== 'rotating') {
    const date = new Date(dateStr);
    const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
    return sched[dayOfWeek] || null;
  }

  const anchorStr = sched.anchor_date || '2026-06-01';
  const anchor = new Date(anchorStr);
  const target = new Date(dateStr);

  anchor.setHours(0,0,0,0);
  target.setHours(0,0,0,0);

  const diffTime = target.getTime() - anchor.getTime();
  const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

  const cycleDay = ((diffDays % 28) + 28) % 28;
  const weekNum = Math.floor(cycleDay / 7) + 1; // 1 to 4

  const dayOfWeek = target.toLocaleDateString('en-US', { weekday: 'long' });
  const wk = `week${weekNum}`;
  return sched[wk]?.[dayOfWeek] || null;
};

const getRotatingShift = (emp: any, dateStr: string) => {
  const sched = emp.weekly_schedule;
  if (!sched) return null;

  const overrides = (sched as any).custom_night_weeks;
  if (Array.isArray(overrides)) {
    const isOverride = overrides.some(w => dateStr >= w.from_date && dateStr <= w.to_date);
    if (isOverride) {
      const baseShift = getBaseRotatingShift(sched, dateStr);
      if (baseShift === 'R') return 'R';
      return 'N';
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

// Compute days range for roster month (11th of prev to 10th of current)
const getRosterPeriodDays = (month: number, year: number): DayInfo[] => {
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
  
  return dayList;
};

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

export default function AdminPanel() {
  const [activeTab, setActiveTab] = useState<'employees' | 'lines' | 'shifts' | 'roster' | 'codes' | 'holidays' | 'backups' | 'audit'>('employees');
  const [loading, setLoading] = useState(true);

  // Data lists
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [lines, setLines] = useState<MetroLine[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [shifts, setShifts] = useState<ShiftRule[]>([]);
  const [allCodes, setAllCodes] = useState<AttendanceCode[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [backups, setBackups] = useState<string[]>([]);
  const [backupStatus, setBackupStatus] = useState<{ integrity: string; last_backup: string; database_size_bytes: number } | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Search/Filters states
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditModuleFilter, setAuditModuleFilter] = useState('ALL');

  // Edit helper states
  const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null);
  const [editingLineId, setEditingLineId] = useState<number | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<number | null>(null);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editingHolidayId, setEditingHolidayId] = useState<number | null>(null);

  // Form states
  // 1. Employee Form
  const [empName, setEmpName] = useState('');
  const [empPF, setEmpPF] = useState('');
  const [empDesig, setEmpDesig] = useState('Assistant');
  const [isCustomDesig, setIsCustomDesig] = useState(false);
  const [customDesigText, setCustomDesigText] = useState('');
  const [empLevel, setEmpLevel] = useState(1);
  const [empSection, setEmpSection] = useState('KKVS');
  const [empRestDay, setEmpRestDay] = useState('Wednesday');
  const [scheduleType, setScheduleType] = useState<'simple' | 'rotating'>('rotating');
  const [empWeeklySchedule, setEmpWeeklySchedule] = useState<{ [day: string]: string }>(getWeeklyScheduleDefault('Wednesday'));
  const [rotatingSchedule, setRotatingSchedule] = useState<{
    week1: { [day: string]: string };
    week2: { [day: string]: string };
    week3: { [day: string]: string };
    week4: { [day: string]: string };
  }>({
    week1: getWeeklyScheduleDefault('Wednesday'),
    week2: getWeeklyScheduleDefault('Wednesday'),
    week3: getWeeklyScheduleDefault('Wednesday'),
    week4: getWeeklyScheduleDefault('Wednesday'),
  });
  const [activeRotatingWeek, setActiveRotatingWeek] = useState<'week1' | 'week2' | 'week3' | 'week4'>('week1');
  const [empJoiningDate, setEmpJoiningDate] = useState('');
  const [empAnchorDate, setEmpAnchorDate] = useState('2026-06-01');
  const [customNightWeeks, setCustomNightWeeks] = useState<{ from_date: string; to_date: string; }[]>([]);
  const [overrideFrom, setOverrideFrom] = useState('');
  const [overrideTo, setOverrideTo] = useState('');

  // 1b. Employee Transfer Form
  const [transferEmpId, setTransferEmpId] = useState<string>('');
  const [transferSecCode, setTransferSecCode] = useState<string>('');
  const [transferDate, setTransferDate] = useState<string>('2026-06-15');
  const [transferOrderNo, setTransferOrderNo] = useState<string>('');
  const [transferRemarks, setTransferRemarks] = useState<string>('');

  // 2. Line Form
  const [lineName, setLineName] = useState('');
  const [lineColor, setLineColor] = useState('#2563EB');

  // 3. Section Form
  const [secLineId, setSecLineId] = useState(1);
  const [secCode, setSecCode] = useState('');
  const [secName, setSecName] = useState('');
  const [secBase, setSecBase] = useState('');

  // 4. Shift Form
  const [shiftSecCode, setShiftSecCode] = useState('KKVS');
  const [shiftCode, setShiftCode] = useState('G');
  const [shiftStart, setShiftStart] = useState('09:00');
  const [shiftEnd, setShiftEnd] = useState('17:30');
  const [shiftNight, setShiftNight] = useState(false);

  // 4b. Roster Codes Form
  const [codeVal, setCodeVal] = useState('');
  const [codeDesc, setCodeDesc] = useState('');
  const [codeBg, setCodeBg] = useState('#FFFFFF');
  const [codeFg, setCodeFg] = useState('#1E293B');
  const [codeIsLeave, setCodeIsLeave] = useState(false);
  const [codeLeaveType, setCodeLeaveType] = useState<'CL' | 'LAP' | 'CR' | 'Sick' | 'None'>('None');

  // 5. Roster Planner Form
  const [plannerEmpId, setPlannerEmpId] = useState<string>('');
  const [plannerMonth, setPlannerMonth] = useState<number>(5); // June
  const [plannerYear, setPlannerYear] = useState<number>(2026);
  const [plannerDays, setPlannerDays] = useState<DayInfo[]>([]);
  const [plannerGrid, setPlannerGrid] = useState<{ [dateStr: string]: string }>({});
  const [plannerRemarks, setPlannerRemarks] = useState<string>('');
  const [isPlannerLoading, setIsPlannerLoading] = useState<boolean>(false);

  // 5b. Roster Planner Date-Range helper states
  const [rangeStartDate, setRangeStartDate] = useState<string>('2026-05-11');
  const [rangeEndDate, setRangeEndDate] = useState<string>('2026-06-10');
  const [rangeShift, setRangeShift] = useState<string>('P/N');

  // 6. Holiday Form
  const [hDate, setHDate] = useState('');
  const [hName, setHName] = useState('');
  const [hType, setHType] = useState('National');
  const [hApplicability, setHApplicability] = useState('ALL');

  // 7. Backups states
  const [isBackupRunning, setIsBackupRunning] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadAdminData = async () => {
    setLoading(true);
    try {
      const storedLines = await getLines();
      setLines(storedLines);
      
      const storedSections = await getSections();
      setSections(storedSections);
      
      const emps = await getEmployees();
      setEmployees(emps);
      
      const codesList = await getAttendanceCodes();
      setAllCodes(codesList);
      
      const hList = await getHolidays();
      setHolidays(hList);
      
      const bList = await getBackupsList();
      setBackups(bList);
      
      const bStatus = await getBackupStatus();
      setBackupStatus(bStatus);
      
      const aLogs = await getAuditLogs();
      setAuditLogs(aLogs);
      
      const rulesList: ShiftRule[] = [];
      for (const sec of storedSections) {
        try {
          const secShifts = await getShiftRules(sec.section_code);
          rulesList.push(...secShifts);
        } catch (secErr) {
          console.error(`Failed to load shifts for ${sec.section_code}`, secErr);
        }
      }
      setShifts(rulesList);

      // Set defaults dynamically
      if (storedSections.length > 0) {
        setEmpSection(storedSections[0].section_code);
        setShiftSecCode(storedSections[0].section_code);
        setTransferSecCode(storedSections[0].section_code);
      }
      if (storedLines.length > 0) {
        setSecLineId(storedLines[0].id);
      }
    } catch (e) {
      console.error("Failed to load admin panel data", e);
      showToast("Error loading dynamic administrative settings", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAdminData();
  }, []);

  const handleDesignationChange = (val: string) => {
    setEmpDesig(val);
    if (val === 'Custom') {
      setIsCustomDesig(true);
    } else {
      setIsCustomDesig(false);
      setCustomDesigText('');
      
      // Auto-adjust pay level based on designation
      let defaultLevel = 1;
      if (val === 'SSE/Sig/IC') defaultLevel = 8;
      else if (val === 'SSE/Sig') defaultLevel = 7;
      else if (val === 'JE/Sig') defaultLevel = 6;
      else if (val === 'Sr. Tech') defaultLevel = 6;
      else if (val === 'Tech-I') defaultLevel = 5;
      else if (val === 'Tech-II') defaultLevel = 4;
      else if (val === 'Tech-III') defaultLevel = 3;
      else if (val === 'Assistant') defaultLevel = 1;
      
      setEmpLevel(defaultLevel);
    }
  };

  // Form Submits & Actions
  // 1. Employees Tab Forms
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empPF.trim() || !empName.trim()) {
      showToast("Please fill in PF Number and Name.", "error");
      return;
    }

    const sectionObj = sections.find(s => s.section_code === empSection);
    
    const weeklySchedulePayload = scheduleType === 'simple' 
      ? empWeeklySchedule 
      : {
          type: 'rotating',
          anchor_date: empAnchorDate,
          week1: rotatingSchedule.week1,
          week2: rotatingSchedule.week2,
          week3: rotatingSchedule.week3,
          week4: rotatingSchedule.week4,
          custom_night_weeks: customNightWeeks
        };

    const desigValue = isCustomDesig ? customDesigText.trim() : empDesig;
    if (!desigValue) {
      showToast("Please enter designation name.", "error");
      return;
    }

    const payload = {
      pf_number: empPF.trim(),
      name: empName.trim(),
      designation: desigValue,
      level: Number(empLevel),
      primary_section_id: sectionObj?.id || null,
      section_code: empSection || null,
      default_rest_day: empRestDay,
      weekly_schedule: weeklySchedulePayload,
      joining_date: empJoiningDate || undefined
    };

    try {
      if (editingEmployeeId !== null) {
        await updateEmployee({
          emp_id: editingEmployeeId,
          ...payload
        });
        showToast("Employee details updated successfully!", "success");
        setEditingEmployeeId(null);
      } else {
        if (employees.some(emp => emp.pf_number === empPF)) {
          showToast("Employee with this PF number already exists.", "error");
          return;
        }
        await createEmployee(payload);
        showToast(`Successfully enrolled ${empName} to roster.`, "success");
      }
      setEmpPF('');
      setEmpName('');
      setEmpJoiningDate('');
      setIsCustomDesig(false);
      setCustomDesigText('');
      setScheduleType('rotating');
      setEmpAnchorDate('2026-06-01');
      setCustomNightWeeks([]);
      setOverrideFrom('');
      setOverrideTo('');
      setRotatingSchedule({
        week1: getWeeklyScheduleDefault('Wednesday'),
        week2: getWeeklyScheduleDefault('Wednesday'),
        week3: getWeeklyScheduleDefault('Wednesday'),
        week4: getWeeklyScheduleDefault('Wednesday'),
      });
      loadAdminData();
    } catch (err) {
      showToast("Failed to save employee. Check duplicate PF.", "error");
      console.error(err);
    }
  };

  const handleEditEmployeeClick = (emp: Employee) => {
    setEditingEmployeeId(emp.emp_id);
    setEmpName(emp.name);
    setEmpPF(emp.pf_number);
    
    const standardDesignations = ['SSE/Sig/IC', 'SSE/Sig', 'JE/Sig', 'Sr. Tech', 'Tech-I', 'Tech-II', 'Tech-III', 'Assistant'];
    if (standardDesignations.includes(emp.designation)) {
      setEmpDesig(emp.designation);
      setIsCustomDesig(false);
      setCustomDesigText('');
    } else {
      setEmpDesig('Custom');
      setIsCustomDesig(true);
      setCustomDesigText(emp.designation);
    }
    
    setEmpLevel(emp.level);
    setEmpSection(emp.section_code || '');
    setEmpRestDay(emp.default_rest_day);
    
    const sched = emp.weekly_schedule;
    if (sched && (sched as any).type === 'rotating') {
      setScheduleType('rotating');
      setEmpAnchorDate((sched as any).anchor_date || '2026-06-01');
      setRotatingSchedule({
        week1: (sched as any).week1 || getWeeklyScheduleDefault(emp.default_rest_day),
        week2: (sched as any).week2 || getWeeklyScheduleDefault(emp.default_rest_day),
        week3: (sched as any).week3 || getWeeklyScheduleDefault(emp.default_rest_day),
        week4: (sched as any).week4 || getWeeklyScheduleDefault(emp.default_rest_day),
      });
      setCustomNightWeeks((sched as any).custom_night_weeks || []);
    } else {
      setScheduleType('rotating');
      setEmpAnchorDate('2026-06-01');
      const baseSched = (sched as { [day: string]: string }) || getWeeklyScheduleDefault(emp.default_rest_day);
      setRotatingSchedule({
        week1: baseSched,
        week2: baseSched,
        week3: baseSched,
        week4: baseSched,
      });
      setCustomNightWeeks([]);
    }
    setEmpJoiningDate(emp.joining_date || '');
  };

  const handleCancelEditEmployee = () => {
    setEditingEmployeeId(null);
    setEmpName('');
    setEmpPF('');
    setEmpDesig('Assistant');
    setEmpLevel(1);
    setEmpRestDay('Wednesday');
    setScheduleType('rotating');
    setEmpAnchorDate('2026-06-01');
    setCustomNightWeeks([]);
    setOverrideFrom('');
    setOverrideTo('');
    setRotatingSchedule({
      week1: getWeeklyScheduleDefault('Wednesday'),
      week2: getWeeklyScheduleDefault('Wednesday'),
      week3: getWeeklyScheduleDefault('Wednesday'),
      week4: getWeeklyScheduleDefault('Wednesday'),
    });
    setEmpJoiningDate('');
  };

  const handleDeleteEmployeeClick = async (empId: number) => {
    if (!window.confirm("Are you sure you want to remove this employee from the roster? This will delete all their leave balances and attendance directories.")) {
      return;
    }
    try {
      await deleteEmployee(empId);
      showToast("Employee deleted successfully.", "success");
      loadAdminData();
    } catch (err) {
      showToast("Failed to delete employee.", "error");
      console.error(err);
    }
  };

  const handleTransferEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transferEmpId || !transferSecCode) {
      showToast("Please select employee and target section.", "error");
      return;
    }

    const emp = employees.find(e => e.emp_id === Number(transferEmpId));
    const sectionObj = sections.find(s => s.section_code === transferSecCode);
    if (!emp || !sectionObj) return;

    try {
      await updateEmployee({
        ...emp,
        primary_section_id: sectionObj.id,
        section_code: sectionObj.section_code
      });

      await addSpecialEvent({
        emp_id: emp.emp_id,
        event_type: 'Transfer',
        from_date: transferDate,
        to_date: transferDate,
        order_number: transferOrderNo || 'N/A',
        location: sectionObj.section_name
      });

      showToast(`Successfully transferred ${emp.name} to ${sectionObj.section_name}.`, "success");
      setTransferEmpId('');
      setTransferSecCode('');
      setTransferOrderNo('');
      setTransferRemarks('');
      loadAdminData();
    } catch (err) {
      showToast("Failed to complete employee transfer.", "error");
      console.error(err);
    }
  };

  // 2. Lines Tab Forms
  const handleSaveLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lineName.trim()) return;

    try {
      if (editingLineId !== null) {
        await updateLine({
          id: editingLineId,
          line_name: lineName.trim(),
          color_code: lineColor
        });
        showToast("Metro Line updated successfully.", "success");
        setEditingLineId(null);
      } else {
        await createLine({
          line_name: lineName.trim(),
          color_code: lineColor
        });
        showToast(`Successfully created ${lineName}.`, "success");
      }
      setLineName('');
      loadAdminData();
    } catch (err) {
      showToast("Failed to save Metro Line.", "error");
      console.error(err);
    }
  };

  const handleEditLineClick = (line: MetroLine) => {
    setEditingLineId(line.id);
    setLineName(line.line_name);
    setLineColor(line.color_code);
  };

  const handleCancelEditLine = () => {
    setEditingLineId(null);
    setLineName('');
    setLineColor('#2563EB');
  };

  const handleDeleteLineClick = async (lineId: number) => {
    if (!window.confirm("Are you sure you want to delete this Metro Line?")) return;
    try {
      await deleteLine(lineId);
      showToast("Metro Line deleted successfully.", "success");
      loadAdminData();
    } catch (err) {
      showToast("Failed to delete line.", "error");
    }
  };

  const handleSaveSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secCode.trim() || !secName.trim()) return;

    try {
      if (editingSectionId !== null) {
        await updateSection({
          id: editingSectionId,
          line_id: Number(secLineId),
          section_code: secCode.trim().toUpperCase(),
          section_name: secName.trim(),
          base_location: secBase.trim() || secName.trim()
        });
        showToast("Section updated successfully.", "success");
        setEditingSectionId(null);
      } else {
        await createSection({
          line_id: Number(secLineId),
          section_code: secCode.trim().toUpperCase(),
          section_name: secName.trim(),
          base_location: secBase.trim() || secName.trim()
        });
        showToast(`Successfully created section ${secName}.`, "success");
      }
      setSecCode('');
      setSecName('');
      setSecBase('');
      loadAdminData();
    } catch (err) {
      showToast("Failed to save section.", "error");
    }
  };

  const handleEditSectionClick = (sec: Section) => {
    setEditingSectionId(sec.id);
    setSecLineId(sec.line_id);
    setSecCode(sec.section_code);
    setSecName(sec.section_name);
    setSecBase(sec.base_location);
  };

  const handleCancelEditSection = () => {
    setEditingSectionId(null);
    setSecCode('');
    setSecName('');
    setSecBase('');
  };

  const handleDeleteSectionClick = async (secId: number) => {
    if (!window.confirm("Are you sure you want to delete this section?")) return;
    try {
      await deleteSection(secId);
      showToast("Section deleted successfully.", "success");
      loadAdminData();
    } catch (err) {
      showToast("Failed to delete section.", "error");
    }
  };

  // 3. Shifts Tab Forms
  const handleAddShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const sectionObj = sections.find(s => s.section_code === shiftSecCode);

    try {
      await createShiftRule({
        section_id: sectionObj?.id || 1,
        shift_code: shiftCode.toUpperCase(),
        start_time: `${shiftStart}:00`,
        end_time: `${shiftEnd}:00`,
        working_days: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
        is_night_duty: shiftNight
      });
      showToast(`Successfully created shift ${shiftCode} for ${shiftSecCode}.`, "success");
      loadAdminData();
    } catch (err) {
      showToast("Failed to create shift rule.", "error");
    }
  };

  // 4. Roster Tab Forms & Planner
  const loadPlannerRoster = async () => {
    if (!plannerEmpId) {
      setPlannerDays([]);
      setPlannerGrid({});
      return;
    }

    setIsPlannerLoading(true);
    const dayList = getRosterPeriodDays(plannerMonth, plannerYear);
    setPlannerDays(dayList);

    const emp = employees.find(e => e.emp_id === Number(plannerEmpId));
    if (!emp) {
      setIsPlannerLoading(false);
      return;
    }

    const startD = dayList[0].dateStr;
    const endD = dayList[dayList.length - 1].dateStr;
    
    try {
      const logs = await getAttendanceLogs(emp.section_code || '', startD, endD);
      const grid: { [dateStr: string]: string } = {};
      const empLogs = logs.filter(l => l.emp_id === emp.emp_id);
      
      dayList.forEach(day => {
        const matchingLog = empLogs.find(l => l.date === day.dateStr);
        grid[day.dateStr] = matchingLog?.status || '';
      });

      setPlannerGrid(grid);
      const firstLog = empLogs.find(l => l.date === dayList[0].dateStr);
      setPlannerRemarks(firstLog?.remarks || '');
    } catch (err) {
      console.error(err);
      showToast("Failed to load roster logs.", "error");
    }
    setIsPlannerLoading(false);
  };

  useEffect(() => {
    loadPlannerRoster();
  }, [plannerEmpId, plannerMonth, plannerYear]);

  const handleApplyRangeShift = () => {
    if (!rangeStartDate || !rangeEndDate) {
      showToast("Please choose start and end dates.", "error");
      return;
    }
    const start = new Date(rangeStartDate);
    const end = new Date(rangeEndDate);
    if (start > end) {
      showToast("Start date must be before or equal to End date.", "error");
      return;
    }

    const newGrid = { ...plannerGrid };
    const temp = new Date(start);
    while (temp <= end) {
      const dateStr = temp.toISOString().slice(0, 10);
      newGrid[dateStr] = rangeShift;
      temp.setDate(temp.getDate() + 1);
    }
    setPlannerGrid(newGrid);
    showToast(`Applied ${rangeShift} for selected range. Click 'Save Roster' to commit.`, "success");
  };

  const handleSavePlannerRoster = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plannerEmpId) return;

    const emp = employees.find(e => e.emp_id === Number(plannerEmpId));
    if (!emp) return;

    setIsPlannerLoading(true);
    const logsToSave = plannerDays.map(day => ({
      emp_id: emp.emp_id,
      date: day.dateStr,
      status: (plannerGrid[day.dateStr] || 'P'),
      is_night: plannerGrid[day.dateStr] === 'P/N',
      remarks: plannerRemarks
    }));

    try {
      await saveAttendanceLogsBulk(logsToSave as any);
      showToast(`Roster for ${emp.name} saved successfully!`, "success");
      loadPlannerRoster();
    } catch (err) {
      showToast("Failed to save roster logs.", "error");
      console.error(err);
    }
    setIsPlannerLoading(false);
  };

  const handlePlannerAutoFill = () => {
    if (!plannerEmpId) return;
    const emp = employees.find(e => e.emp_id === Number(plannerEmpId));
    if (!emp) return;

    const newGrid = { ...plannerGrid };

    plannerDays.forEach((day, index) => {
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
      newGrid[day.dateStr] = status;
    });
    setPlannerGrid(newGrid);
    showToast("Template schedule applied to planner. Save to commit.", "success");
  };

  // 5. Roster Codes Tab Forms
  const handleSaveCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!codeVal.trim() || !codeDesc.trim()) return;

    const codePayload: AttendanceCode = {
      code: codeVal.trim().toUpperCase(),
      description: codeDesc.trim(),
      bg_color: codeBg,
      text_color: codeFg,
      is_leave: codeIsLeave,
      leave_type: codeLeaveType
    };

    try {
      if (editingCode !== null) {
        await updateAttendanceCode(codePayload);
        showToast("Roster status code saved", "success");
        setEditingCode(null);
      } else {
        await createAttendanceCode(codePayload);
        showToast("Roster status code added", "success");
      }
      setCodeVal('');
      setCodeDesc('');
      setCodeBg('#FFFFFF');
      setCodeFg('#1E293B');
      setCodeIsLeave(false);
      setCodeLeaveType('None');
      loadAdminData();
    } catch (err) {
      showToast("Duplicate code error.", "error");
    }
  };

  const handleDeleteCode = async (code: string) => {
    if (['P', 'P/N', 'R', 'CR', 'CL', 'LAP', 'Sick', 'SCL', 'PH'].includes(code)) {
      showToast("Cannot delete system default codes.", "error");
      return;
    }
    if (window.confirm(`Delete code ${code}?`)) {
      try {
        await deleteAttendanceCode(code);
        showToast("Roster code deleted", "success");
        loadAdminData();
      } catch (err) {
        showToast("Failed to delete code", "error");
      }
    }
  };

  const handleEditCodeClick = (code: AttendanceCode) => {
    setEditingCode(code.code);
    setCodeVal(code.code);
    setCodeDesc(code.description);
    setCodeBg(code.bg_color);
    setCodeFg(code.text_color);
    setCodeIsLeave(code.is_leave);
    setCodeLeaveType(code.leave_type);
  };

  const handleCancelEditCode = () => {
    setEditingCode(null);
    setCodeVal('');
    setCodeDesc('');
    setCodeBg('#FFFFFF');
    setCodeFg('#1E293B');
    setCodeIsLeave(false);
    setCodeLeaveType('None');
  };

  // 6. Holidays Tab Forms
  const handleSaveHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hDate || !hName) {
      showToast("Please fill date and holiday name", "error");
      return;
    }

    try {
      if (editingHolidayId !== null) {
        await updateHoliday({
          id: editingHolidayId,
          holiday_date: hDate,
          name: hName,
          holiday_type: hType,
          applicability: hApplicability
        });
        showToast("Holiday updated successfully", "success");
        setEditingHolidayId(null);
      } else {
        await createHoliday({
          holiday_date: hDate,
          name: hName,
          holiday_type: hType,
          applicability: hApplicability
        });
        showToast("Holiday added to database", "success");
      }
      setHDate('');
      setHName('');
      loadAdminData();
    } catch (err: any) {
      showToast(err.message || "Failed to save holiday.", "error");
    }
  };

  const handleEditHoliday = (h: Holiday) => {
    setEditingHolidayId(h.id!);
    setHDate(h.holiday_date);
    setHName(h.name);
    setHType(h.holiday_type);
    setHApplicability(h.applicability || 'ALL');
  };

  const handleDeleteHoliday = async (id: number) => {
    if (window.confirm("Are you sure you want to delete this holiday?")) {
      try {
        await deleteHoliday(id);
        showToast("Holiday deleted from system", "success");
        loadAdminData();
      } catch (err) {
        showToast("Failed to delete holiday", "error");
      }
    }
  };

  // 7. Backups Tab Actions
  const handleCreateBackup = async () => {
    setIsBackupRunning(true);
    try {
      const res = await createBackup();
      showToast(`Snapshot created: ${res.filename}`, "success");
      loadAdminData();
    } catch (err: any) {
      showToast(err.message || "Backup failed.", "error");
    } finally {
      setIsBackupRunning(false);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    const doubleConfirm = window.confirm(`WARNING: Are you sure you want to restore database to "${filename}"?\n\nAll current staff records and rosters will be replaced. A safety backup will be saved first.`);
    if (doubleConfirm) {
      try {
        await restoreBackup(filename);
        showToast("Database restored successfully. Reloading...", "success");
        setTimeout(() => window.location.reload(), 1500);
      } catch (err: any) {
        showToast(err.message || "Restore failed. Snapshot file corrupt.", "error");
      }
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    const isConfirmed = window.confirm(`WARNING: Are you sure you want to permanently delete database backup "${filename}"?\n\nThis action cannot be undone.`);
    if (isConfirmed) {
      try {
        await deleteBackup(filename);
        showToast("Backup deleted successfully.", "success");
        loadAdminData();
      } catch (err: any) {
        showToast(err.message || "Failed to delete backup.", "error");
      }
    }
  };

  // Filters
  const filteredEmployees = employees.filter(emp => 
    emp.name.toLowerCase().includes(empSearchQuery.toLowerCase()) ||
    emp.pf_number.includes(empSearchQuery) ||
    emp.designation.toLowerCase().includes(empSearchQuery.toLowerCase()) ||
    (emp.section_code || "").toLowerCase().includes(empSearchQuery.toLowerCase())
  );

  const filteredAudits = auditLogs.filter(log => {
    const matchesSearch = log.details.toLowerCase().includes(auditSearch.toLowerCase()) || 
                          log.action.toLowerCase().includes(auditSearch.toLowerCase()) ||
                          log.user.toLowerCase().includes(auditSearch.toLowerCase());
    const matchesModule = auditModuleFilter === 'ALL' || log.module === auditModuleFilter;
    return matchesSearch && matchesModule;
  });

  return (
    <div className="p-6 space-y-6">
      
      {/* Title */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-800 flex items-center gap-2">
            Admin Control & System Settings
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Configure calendar events, database copies, transaction audit trails, metro lines, roster sections, and signaller profiles.
          </p>
        </div>
        <div className="no-print bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-blue-200 shadow-sm animate-pulse">
          Super Admin Mode
        </div>
      </div>

      {/* Tabs navigation grid */}
      <div className="no-print grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 border-b border-slate-200 pb-3">
        {[
          { id: 'employees', label: 'Enroll & Transfer', icon: Users },
          { id: 'lines', label: 'Lines & Sections', icon: TrendingUp },
          { id: 'shifts', label: 'Shift Rules', icon: Clock },
          { id: 'roster', label: 'Roster Planner', icon: Calendar },
          { id: 'codes', label: 'Roster Codes', icon: Settings },
          { id: 'holidays', label: 'Holidays Master', icon: CalendarDays },
          { id: 'backups', label: 'DB Backups', icon: Database },
          { id: 'audit', label: 'Audit Logs', icon: History }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id as any);
              handleCancelEditEmployee();
              handleCancelEditLine();
              handleCancelEditSection();
              handleCancelEditCode();
              setEditingHolidayId(null);
            }}
            className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition cursor-pointer select-none duration-150 ${
              activeTab === tab.id
                ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/10'
                : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50/50'
            }`}
          >
            <tab.icon size={18} className="mb-1 shrink-0" />
            <span className="text-[10px] font-bold tracking-tight block">{tab.label}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="h-64 flex items-center justify-center text-slate-400 text-sm font-bold">
          Loading administration records...
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* TAB 1: EMPLOYEES & TRANSFER */}
          {activeTab === 'employees' && (
            <>
              {/* Add & Transfer Forms Column */}
              <div className="space-y-6">
                {/* Employee Form */}
                <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
                  <h3 className="font-bold text-slate-855 text-xs uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b">
                    <PlusCircle size={15} className="text-blue-600" />
                    {editingEmployeeId !== null ? "Update Staff Details" : "Enroll Signalling Staff"}
                  </h3>
                  <form onSubmit={handleAddEmployee} className="space-y-4 text-xs font-bold text-slate-600">
                    <div>
                      <label className="block mb-1 uppercase tracking-wider text-[10px]">P.F. Number</label>
                      <input 
                        type="text" 
                        value={empPF}
                        onChange={(e) => setEmpPF(e.target.value)}
                        placeholder="e.g. 22177721093"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500 font-mono"
                        required
                      />
                    </div>
                    <div>
                      <label className="block mb-1 uppercase tracking-wider text-[10px]">Staff Name</label>
                      <input 
                        type="text" 
                        value={empName}
                        onChange={(e) => setEmpName(e.target.value)}
                        placeholder="e.g. Tonmoy Naskar"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block mb-1 uppercase tracking-wider text-[10px]">Designation</label>
                        <select 
                          value={empDesig}
                          onChange={(e) => handleDesignationChange(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 cursor-pointer"
                        >
                          <option value="SSE/Sig/IC">SSE/Sig/IC</option>
                          <option value="SSE/Sig">SSE/Sig</option>
                          <option value="JE/Sig">JE/Sig</option>
                          <option value="Sr. Tech">Sr. Tech</option>
                          <option value="Tech-I">Tech-I</option>
                          <option value="Tech-II">Tech-II</option>
                          <option value="Tech-III">Tech-III</option>
                          <option value="Assistant">Assistant</option>
                          <option value="Custom">Custom...</option>
                        </select>
                        {isCustomDesig && (
                          <div className="mt-2 animate-fade-in">
                            <label className="block mb-1 uppercase tracking-wider text-[10px] text-blue-600">Custom Name</label>
                            <input 
                              type="text" 
                              value={customDesigText}
                              onChange={(e) => setCustomDesigText(e.target.value)}
                              placeholder="e.g. Helper"
                              className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500 font-semibold"
                              required
                            />
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block mb-1 uppercase tracking-wider text-[10px]">Pay Level</label>
                        <input 
                          type="number" 
                          min={1} 
                          max={12}
                          value={empLevel}
                          onChange={(e) => setEmpLevel(Number(e.target.value))}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block mb-1 uppercase tracking-wider text-[10px]">Roster Section</label>
                        <select 
                          value={empSection || ""}
                          onChange={(e) => setEmpSection(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 cursor-pointer"
                        >
                          <option value="">-- No Section --</option>
                          {sections.map(sec => (
                            <option key={sec.id} value={sec.section_code}>{sec.section_code}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block mb-1 uppercase tracking-wider text-[10px]">Weekly Rest Day</label>
                        <select 
                          value={empRestDay}
                          onChange={(e) => setEmpRestDay(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 cursor-pointer"
                        >
                          {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block mb-1 uppercase tracking-wider text-[10px]">Joining Date (Optional)</label>
                      <input 
                        type="date" 
                        value={empJoiningDate}
                        onChange={(e) => setEmpJoiningDate(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 cursor-pointer"
                      />
                    </div>

                    {/* Weekly Schedule template */}
                    <div className="bg-slate-50 p-3.5 border border-slate-200 rounded-xl space-y-3">
                      <div className="flex justify-between items-center pb-1 border-b">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">4-Week Rotating Schedule Template</span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block mb-0.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Roster Anchor Date</label>
                          <input 
                            type="date"
                            value={empAnchorDate}
                            onChange={(e) => setEmpAnchorDate(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs text-slate-800 cursor-pointer focus:outline-none"
                            required
                          />
                        </div>
                        <div className="flex items-end">
                          <span className="text-[9px] text-slate-500 italic pb-1">This anchor date marks the start of "Week 1" cycle.</span>
                        </div>
                      </div>

                      <div className="space-y-2">
                        {/* Week Tabs */}
                        <div className="flex gap-1 border-b border-slate-200 pb-1">
                          {(['week1', 'week2', 'week3', 'week4'] as const).map(wk => (
                            <button
                              key={wk}
                              type="button"
                              onClick={() => setActiveRotatingWeek(wk)}
                              className={`px-2 py-0.5 rounded text-[9px] font-extrabold uppercase ${activeRotatingWeek === wk ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-200/60 text-slate-500 hover:text-slate-800'}`}
                            >
                              {wk.replace('week', 'W')}
                            </button>
                          ))}
                        </div>
                        
                        <div className="grid grid-cols-4 gap-2">
                          {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                            <div key={day} className="flex flex-col gap-0.5">
                              <label className="text-[9px] font-bold text-slate-400 truncate">{day.slice(0, 3)}</label>
                              <select
                                value={rotatingSchedule[activeRotatingWeek]?.[day] || 'G'}
                                onChange={(e) => setRotatingSchedule(prev => ({
                                  ...prev,
                                  [activeRotatingWeek]: {
                                    ...prev[activeRotatingWeek],
                                    [day]: e.target.value
                                  }
                                }))}
                                className="border border-slate-200 rounded px-1 py-0.5 text-[10px] bg-white font-semibold text-slate-800 focus:outline-none cursor-pointer"
                              >
                                <option value="G">G (Gen)</option>
                                <option value="M">M (Morn)</option>
                                <option value="E">E (Eve)</option>
                                <option value="N">N (Night)</option>
                                <option value="R">R (Rest)</option>
                              </select>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Custom Night Weeks (Override) */}
                      <div className="border-t border-slate-200 pt-2 space-y-2">
                        <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block">Custom Night Week Overrides</span>
                        <div className="grid grid-cols-3 gap-1.5 items-end">
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 truncate block">From Date</label>
                            <input 
                              type="date"
                              value={overrideFrom}
                              onChange={(e) => setOverrideFrom(e.target.value)}
                              className="w-full border border-slate-200 bg-white rounded px-1.5 py-0.5 text-[10px]"
                            />
                          </div>
                          <div>
                            <label className="text-[9px] font-bold text-slate-400 truncate block">To Date</label>
                            <input 
                              type="date"
                              value={overrideTo}
                              onChange={(e) => setOverrideTo(e.target.value)}
                              className="w-full border border-slate-200 bg-white rounded px-1.5 py-0.5 text-[10px]"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (!overrideFrom || !overrideTo) {
                                alert("Please select both start and end dates.");
                                return;
                              }
                              if (overrideFrom > overrideTo) {
                                alert("Start date cannot be after end date.");
                                return;
                              }
                              setCustomNightWeeks(prev => [...prev, { from_date: overrideFrom, to_date: overrideTo }]);
                              setOverrideFrom('');
                              setOverrideTo('');
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold py-1 px-2 uppercase"
                          >
                            Add Override
                          </button>
                        </div>

                        {customNightWeeks.length > 0 && (
                          <div className="max-h-24 overflow-y-auto bg-slate-100 rounded-lg p-2 space-y-1">
                            {customNightWeeks.map((w, index) => (
                              <div key={index} className="flex justify-between items-center text-[10px] font-semibold text-slate-700 border-b border-slate-200/50 pb-0.5">
                                <span>{w.from_date} to {w.to_date}</span>
                                <button
                                  type="button"
                                  onClick={() => setCustomNightWeeks(prev => prev.filter((_, idx) => idx !== index))}
                                  className="text-red-500 hover:text-red-700 font-extrabold"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="pt-2 flex justify-end gap-2.5">
                      {editingEmployeeId !== null && (
                        <button 
                          type="button" 
                          onClick={handleCancelEditEmployee}
                          className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 uppercase text-[10px]"
                        >
                          Cancel
                        </button>
                      )}
                      <button 
                        type="submit" 
                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white uppercase text-[10px]"
                      >
                        {editingEmployeeId !== null ? "Save Updates" : "Enroll Signaller"}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Transfer Form */}
                <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
                  <h3 className="font-bold text-slate-855 text-xs uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b">
                    <ArrowLeftRight size={15} className="text-blue-600" />
                    Transfer Staff Section
                  </h3>
                  <form onSubmit={handleTransferEmployee} className="space-y-4 text-xs font-bold text-slate-600">
                    <div>
                      <label className="block mb-1 uppercase tracking-wider text-[10px]">Select Employee</label>
                      <select 
                        value={transferEmpId}
                        onChange={(e) => setTransferEmpId(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 cursor-pointer"
                        required
                      >
                        <option value="">-- Choose Employee --</option>
                        {employees.map(emp => (
                          <option key={emp.emp_id} value={emp.emp_id}>{emp.name} ({emp.designation} - {emp.section_code})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block mb-1 uppercase tracking-wider text-[10px]">Target Section</label>
                      <select 
                        value={transferSecCode}
                        onChange={(e) => setTransferSecCode(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 cursor-pointer"
                        required
                      >
                        <option value="">-- Choose Target Section --</option>
                        {sections.map(sec => (
                          <option key={sec.id} value={sec.section_code}>{sec.section_code} - {sec.section_name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block mb-1 uppercase tracking-wider text-[10px]">Transfer Date</label>
                        <input 
                          type="date" 
                          value={transferDate}
                          onChange={(e) => setTransferDate(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 cursor-pointer"
                          required
                        />
                      </div>
                      <div>
                        <label className="block mb-1 uppercase tracking-wider text-[10px]">Office Order Number</label>
                        <input 
                          type="text" 
                          value={transferOrderNo}
                          onChange={(e) => setTransferOrderNo(e.target.value)}
                          placeholder="e.g. SSE/T/2026/04"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500"
                          required
                        />
                      </div>
                    </div>
                    <button 
                      type="submit" 
                      className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs uppercase tracking-wider transition cursor-pointer"
                    >
                      Execute Section Transfer
                    </button>
                  </form>
                </div>
              </div>

              {/* Staff directory directory table */}
              <div className="lg:col-span-2 glass-panel rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                <div className="px-5 py-4 border-b flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                  <h3 className="font-bold text-slate-855">Registered Signaller Directory</h3>
                  
                  {/* Directory Search */}
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs w-full sm:w-64">
                    <Search size={14} className="text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Search directory..." 
                      value={empSearchQuery}
                      onChange={(e) => setEmpSearchQuery(e.target.value)}
                      className="bg-transparent border-none text-slate-800 placeholder-slate-400 focus:outline-none w-full"
                    />
                  </div>
                </div>

                <div className="overflow-y-auto max-h-[660px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b text-slate-500 uppercase font-bold bg-slate-50">
                        <th className="py-2.5 px-5">PF Number</th>
                        <th className="py-2.5 px-5">Name</th>
                        <th className="py-2.5 px-5">Designation</th>
                        <th className="py-2.5 px-5">Level</th>
                        <th className="py-2.5 px-5">Section</th>
                        <th className="py-2.5 px-5">Rest Day</th>
                        <th className="py-2.5 px-5 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                      {filteredEmployees.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400 font-bold">
                            No matching staff members enrolled in SQLite.
                          </td>
                        </tr>
                      ) : (
                        filteredEmployees.map(emp => (
                          <tr key={emp.emp_id} className="hover:bg-slate-50/50">
                            <td className="py-3 px-5 font-mono text-slate-500">{emp.pf_number}</td>
                            <td className="py-3 px-5 font-bold text-slate-855">{emp.name}</td>
                            <td className="py-3 px-5"><span className="px-2 py-0.5 rounded bg-slate-100 text-slate-655">{emp.designation}</span></td>
                            <td className="py-3 px-5 text-blue-600 font-extrabold">Level {emp.level}</td>
                            <td className="py-3 px-5"><span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-bold uppercase">{emp.section_code || "Unassigned"}</span></td>
                            <td className="py-3 px-5">{emp.default_rest_day}</td>
                            <td className="py-3 px-5 text-center space-x-2">
                              <button onClick={() => handleEditEmployeeClick(emp)} className="text-slate-400 hover:text-slate-855 transition cursor-pointer font-bold">Edit</button>
                              <button onClick={() => handleDeleteEmployeeClick(emp.emp_id)} className="text-slate-400 hover:text-rose-600 transition cursor-pointer font-bold">Delete</button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* TAB 2: LINES & SECTIONS */}
          {activeTab === 'lines' && (
            <>
              {/* Form columns */}
              <div className="space-y-6">
                {/* Line Form */}
                <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
                  <h3 className="font-bold text-slate-855 text-xs uppercase tracking-wider border-b pb-2 flex items-center gap-1.5">
                    <PlusCircle size={15} className="text-blue-600" />
                    {editingLineId !== null ? "Update Metro Line" : "Register Metro Line"}
                  </h3>
                  <form onSubmit={handleSaveLine} className="space-y-4 text-xs font-bold text-slate-600">
                    <div>
                      <label className="block mb-1 uppercase tracking-wider text-[10px]">Line Name</label>
                      <input 
                        type="text" 
                        value={lineName}
                        onChange={(e) => setLineName(e.target.value)}
                        placeholder="e.g. Blue Line"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500"
                        required
                      />
                    </div>
                    <div>
                      <label className="block mb-1 uppercase tracking-wider text-[10px]">Theme Color Code</label>
                      <div className="flex gap-2 items-center">
                        <input 
                          type="color" 
                          value={lineColor}
                          onChange={(e) => setLineColor(e.target.value)}
                          className="w-10 h-10 border border-slate-250 bg-white rounded-lg cursor-pointer"
                        />
                        <input 
                          type="text" 
                          value={lineColor}
                          onChange={(e) => setLineColor(e.target.value)}
                          className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500 font-mono"
                        />
                      </div>
                    </div>
                    <div className="pt-2 flex justify-end gap-2.5">
                      {editingLineId !== null && (
                        <button 
                          type="button" 
                          onClick={handleCancelEditLine}
                          className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 uppercase text-[10px]"
                        >
                          Cancel
                        </button>
                      )}
                      <button 
                        type="submit" 
                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white uppercase text-[10px]"
                      >
                        {editingLineId !== null ? "Update Line" : "Create Line"}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Section Form */}
                <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
                  <h3 className="font-bold text-slate-855 text-xs uppercase tracking-wider border-b pb-2 flex items-center gap-1.5">
                    <PlusCircle size={15} className="text-blue-600" />
                    {editingSectionId !== null ? "Update Roster Section" : "Register Roster Section"}
                  </h3>
                  <form onSubmit={handleSaveSection} className="space-y-4 text-xs font-bold text-slate-600">
                    <div>
                      <label className="block mb-1 uppercase tracking-wider text-[10px]">Belongs to Line</label>
                      <select 
                        value={secLineId}
                        onChange={(e) => setSecLineId(Number(e.target.value))}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 cursor-pointer"
                      >
                        {lines.map(l => (
                          <option key={l.id} value={l.id}>{l.line_name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block mb-1 uppercase tracking-wider text-[10px]">Section Code (e.g. KKVS)</label>
                      <input 
                        type="text" 
                        value={secCode}
                        onChange={(e) => setSecCode(e.target.value)}
                        placeholder="e.g. KKVS"
                        maxLength={8}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 uppercase focus:outline-none focus:border-blue-500 font-mono font-bold"
                        required
                      />
                    </div>
                    <div>
                      <label className="block mb-1 uppercase tracking-wider text-[10px]">Section Name</label>
                      <input 
                        type="text" 
                        value={secName}
                        onChange={(e) => setSecName(e.target.value)}
                        placeholder="e.g. Kavi Subhash Station Section"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none"
                        required
                      />
                    </div>
                    <div>
                      <label className="block mb-1 uppercase tracking-wider text-[10px]">Base Location</label>
                      <input 
                        type="text" 
                        value={secBase}
                        onChange={(e) => setSecBase(e.target.value)}
                        placeholder="e.g. Kavi Subhash"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none"
                      />
                    </div>
                    <div className="pt-2 flex justify-end gap-2.5">
                      {editingSectionId !== null && (
                        <button 
                          type="button" 
                          onClick={handleCancelEditSection}
                          className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 uppercase text-[10px]"
                        >
                          Cancel
                        </button>
                      )}
                      <button 
                        type="submit" 
                        className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white uppercase text-[10px]"
                      >
                        {editingSectionId !== null ? "Update Section" : "Register Section"}
                      </button>
                    </div>
                  </form>
                </div>
              </div>

              {/* Lists column */}
              <div className="lg:col-span-2 space-y-6">
                {/* Metro Lines list cards */}
                <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-3">
                  <h3 className="font-bold text-slate-850 text-xs uppercase tracking-wider border-b pb-2 flex items-center justify-between">
                    Active Metro Lines
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-bold">{lines.length} Registered</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[200px] overflow-y-auto p-1">
                    {lines.map(line => (
                      <div key={line.id} className="p-3 border rounded-xl flex justify-between items-center bg-white shadow-sm hover:scale-[1.01] transition-transform">
                        <span className="text-xs font-bold text-slate-800 flex items-center gap-2">
                          <span className="w-3.5 h-3.5 rounded-full border shadow-inner block" style={{ backgroundColor: line.color_code }}></span>
                          {line.line_name}
                        </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] text-slate-450 font-mono uppercase">{line.color_code}</span>
                          <button onClick={() => handleEditLineClick(line)} className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer">Edit</button>
                          <button onClick={() => handleDeleteLineClick(line.id)} className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer">Delete</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sections cards list */}
                <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-3">
                  <h3 className="font-bold text-slate-850 text-xs uppercase tracking-wider border-b pb-2 flex items-center justify-between">
                    Registered Roster Sections
                    <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-bold">{sections.length} Sections</span>
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[380px] overflow-y-auto p-1">
                    {sections.map(sec => {
                      const line = lines.find(l => l.id === sec.line_id);
                      return (
                        <div key={sec.id} className="p-3.5 border rounded-xl space-y-2 relative overflow-hidden bg-white shadow-sm hover:scale-[1.01] transition-transform">
                          <span 
                            className="absolute top-0 left-0 bottom-0 w-1" 
                            style={{ backgroundColor: line?.color_code || '#e2e8f0' }}
                          ></span>
                          <div className="flex justify-between items-center pl-2">
                            <span className="text-xs font-bold text-slate-800 truncate max-w-[150px]">{sec.section_name}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-655 font-bold uppercase">{sec.section_code}</span>
                          </div>
                          <div className="flex justify-between items-center pl-2 pt-1 border-t border-slate-55">
                            <span className="text-[10px] text-slate-450">Base: <strong>{sec.base_location}</strong></span>
                            <div className="flex gap-2">
                              <button onClick={() => handleEditSectionClick(sec)} className="text-[10px] font-bold text-blue-600 hover:underline cursor-pointer">Edit</button>
                              <button onClick={() => handleDeleteSectionClick(sec.id)} className="text-[10px] font-bold text-rose-600 hover:underline cursor-pointer">Delete</button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </>
          )}

          {/* TAB 3: SHIFT RULES */}
          {activeTab === 'shifts' && (
            <>
              {/* Form columns */}
              <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
                <h3 className="font-bold text-slate-855 text-xs uppercase tracking-wider border-b pb-2 flex items-center gap-1.5">
                  <PlusCircle size={15} className="text-blue-600" />
                  Define Shift Timing Rule
                </h3>
                <form onSubmit={handleAddShift} className="space-y-4 text-xs font-bold text-slate-600">
                  <div>
                    <label className="block mb-1 uppercase tracking-wider text-[10px]">Roster Section</label>
                    <select 
                      value={shiftSecCode}
                      onChange={(e) => setShiftSecCode(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 cursor-pointer"
                    >
                      {sections.map(sec => (
                        <option key={sec.id} value={sec.section_code}>{sec.section_code} - {sec.section_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block mb-1 uppercase tracking-wider text-[10px]">Shift Code Symbol (e.g. M, G, N)</label>
                    <input 
                      type="text" 
                      value={shiftCode}
                      onChange={(e) => setShiftCode(e.target.value)}
                      placeholder="e.g. M"
                      maxLength={6}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500 font-extrabold uppercase"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block mb-1 uppercase tracking-wider text-[10px]">Start Time</label>
                      <input 
                        type="time" 
                        value={shiftStart}
                        onChange={(e) => setShiftStart(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 cursor-pointer"
                        required
                      />
                    </div>
                    <div>
                      <label className="block mb-1 uppercase tracking-wider text-[10px]">End Time</label>
                      <input 
                        type="time" 
                        value={shiftEnd}
                        onChange={(e) => setShiftEnd(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 cursor-pointer"
                        required
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2 py-1">
                    <input 
                      type="checkbox"
                      id="shiftNight"
                      checked={shiftNight}
                      onChange={(e) => setShiftNight(e.target.checked)}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded cursor-pointer"
                    />
                    <label htmlFor="shiftNight" className="uppercase tracking-wider text-[10px] text-slate-500 cursor-pointer select-none">
                      Is Night Duty Shift
                    </label>
                  </div>
                  <button 
                    type="submit" 
                    className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider transition cursor-pointer"
                  >
                    Create Shift Rule
                  </button>
                </form>
              </div>

              {/* Rules List table */}
              <div className="lg:col-span-2 glass-panel rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                <div className="px-5 py-4 border-b flex justify-between items-center">
                  <h3 className="font-bold text-slate-850">Shift rules list</h3>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-bold">{shifts.length} Shift Rules</span>
                </div>
                <div className="overflow-y-auto max-h-[460px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b text-slate-500 uppercase font-bold bg-slate-50">
                        <th className="py-2.5 px-5">Section</th>
                        <th className="py-2.5 px-5">Shift Code</th>
                        <th className="py-2.5 px-5">Start Time</th>
                        <th className="py-2.5 px-5">End Time</th>
                        <th className="py-2.5 px-5 text-center">Duty Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                      {shifts.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400 font-bold">
                            No shift rules configured.
                          </td>
                        </tr>
                      ) : (
                        shifts.map(s => {
                          const sec = sections.find(sec => sec.id === s.section_id);
                          return (
                            <tr key={s.id} className="hover:bg-slate-50/50">
                              <td className="py-3 px-5 font-bold">{sec ? `${sec.section_code} - ${sec.section_name}` : `Section ID ${s.section_id}`}</td>
                              <td className="py-3 px-5 text-blue-600 font-extrabold">{s.shift_code}</td>
                              <td className="py-3 px-5 font-mono">{s.start_time}</td>
                              <td className="py-3 px-5 font-mono">{s.end_time}</td>
                              <td className="py-3 px-5 text-center">
                                {s.is_night_duty ? (
                                  <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-bold text-[9px] uppercase">Night Shift</span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-bold text-[9px] uppercase">General / Day</span>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* TAB 4: ROSTER PLANNER */}
          {activeTab === 'roster' && (
            <div className="lg:col-span-3 glass-panel p-6 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col space-y-6">
              {/* Header selectors */}
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4 border-b pb-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
                    <Calendar className="text-blue-600 font-bold" size={18} /> Roster Planner
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">Configure duty grids for individual signalling staff month-wise.</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
                  <select 
                    value={plannerEmpId}
                    onChange={(e) => setPlannerEmpId(e.target.value)}
                    className="bg-slate-105 border border-slate-200 text-slate-800 text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer"
                  >
                    <option value="">-- Select Employee --</option>
                    {employees.map(e => (
                      <option key={e.emp_id} value={e.emp_id}>{e.name} ({e.designation})</option>
                    ))}
                  </select>

                  <select 
                    value={plannerMonth}
                    onChange={(e) => setPlannerMonth(Number(e.target.value))}
                    className="bg-slate-105 border border-slate-200 text-slate-800 text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer"
                  >
                    {monthsList.map(m => (
                      <option key={m.val} value={m.val}>{m.name}</option>
                    ))}
                  </select>

                  <select 
                    value={plannerYear}
                    onChange={(e) => setPlannerYear(Number(e.target.value))}
                    className="bg-slate-105 border border-slate-200 text-slate-800 text-xs font-bold px-3 py-1.5 rounded-lg cursor-pointer"
                  >
                    <option value={2026}>2026</option>
                    <option value={2025}>2025</option>
                  </select>

                  {plannerEmpId && (
                    <>
                      <button 
                        type="button" 
                        onClick={handlePlannerAutoFill}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 hover:bg-blue-105 text-blue-600 font-bold text-[10px] uppercase tracking-wider transition cursor-pointer"
                      >
                        <Sparkles size={13} /> Auto-Fill
                      </button>
                      <button 
                        type="button" 
                        onClick={handleSavePlannerRoster}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] uppercase tracking-wider transition cursor-pointer shadow-sm shadow-emerald-500/10"
                      >
                        <Save size={13} /> Save Roster
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Roster remarks */}
              {plannerEmpId && (
                <div className="flex flex-col gap-1 bg-slate-50 border border-slate-200 p-3.5 rounded-xl">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wide">Roster Remarks / Office Order Reference:</label>
                  <input 
                    type="text" 
                    placeholder="e.g. Working temporary night shifts or sick leaves details"
                    value={plannerRemarks}
                    onChange={(e) => setPlannerRemarks(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                </div>
              )}

              {/* Date range batch selector */}
              {plannerEmpId && (
                <div className="flex flex-col gap-3.5 bg-blue-50/20 border border-blue-100 p-4 rounded-xl">
                  <div className="text-blue-800 font-extrabold text-xs uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles size={14} className="text-blue-600" />
                    Quick Date-Range Shift Applicator
                  </div>
                  <div className="flex flex-wrap items-end gap-3.5 text-xs font-bold text-slate-655">
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] uppercase tracking-wider text-slate-450">From Date</label>
                      <input 
                        type="date" 
                        value={rangeStartDate}
                        onChange={(e) => setRangeStartDate(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] uppercase tracking-wider text-slate-450">To Date</label>
                      <input 
                        type="date" 
                        value={rangeEndDate}
                        onChange={(e) => setRangeEndDate(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] uppercase tracking-wider text-slate-450">Shift status Code</label>
                      <select 
                        value={rangeShift}
                        onChange={(e) => setRangeShift(e.target.value)}
                        className="bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 cursor-pointer"
                      >
                        {allCodes.map(c => (
                          <option key={c.code} value={c.code}>{c.code} - {c.description}</option>
                        ))}
                      </select>
                    </div>
                    <button 
                      type="button" 
                      onClick={handleApplyRangeShift}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider transition cursor-pointer rounded-lg h-[34px] shadow-sm shadow-blue-500/10"
                    >
                      Apply Range
                    </button>
                  </div>
                </div>
              )}

              {/* Grid roster planner cells */}
              {isPlannerLoading ? (
                <div className="text-center text-slate-400 py-16 text-sm font-semibold">Loading roster grid matrix...</div>
              ) : !plannerEmpId ? (
                <div className="text-center text-slate-400 py-20 bg-slate-50 border border-dashed rounded-xl font-semibold text-xs uppercase tracking-widest text-slate-500">
                  Please select an employee above to start planning.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3.5">
                  {plannerDays.map(day => {
                    const status = plannerGrid[day.dateStr] || '';
                    return (
                      <div key={day.dateStr} className={`p-3 border rounded-xl flex flex-col justify-between items-center shadow-sm relative ${
                        day.isSunday ? 'bg-red-50/20 border-red-100' : 'bg-[#FAF9F6] border-slate-200'
                      }`}>
                        <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          day.isSunday ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-600'
                        }`}>
                          {day.weekday}
                        </span>
                        <span className="text-lg font-black text-slate-800 mt-2">{day.dayNum}</span>
                        <span className="text-[9px] text-slate-400 font-mono mt-0.5">{day.dateStr.slice(5)}</span>
                        
                        <select 
                          value={status}
                          onChange={(e) => setPlannerGrid(prev => ({ ...prev, [day.dateStr]: e.target.value }))}
                          className="w-full mt-3 bg-white border border-slate-200 rounded-lg py-1 text-center font-bold text-xs text-slate-800 focus:outline-none cursor-pointer"
                        >
                          <option value="">-- Empty --</option>
                          {allCodes.map(codeObj => (
                            <option key={codeObj.code} value={codeObj.code}>{codeObj.code}</option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 5: ROSTER CODES */}
          {activeTab === 'codes' && (
            <>
              {/* Add form */}
              <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
                <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider pb-3 border-b flex items-center gap-1.5">
                  <PlusCircle size={15} className="text-blue-600" />
                  {editingCode ? "Edit Code Details" : "Register Roster Status Code"}
                </h3>
                <form onSubmit={handleSaveCode} className="space-y-4 text-xs font-bold text-slate-605">
                  <div>
                    <label className="block mb-1 uppercase tracking-wider text-[10px]">Roster Code Status</label>
                    <input 
                      type="text" 
                      value={codeVal}
                      onChange={(e) => setCodeVal(e.target.value)}
                      placeholder="e.g. TRG"
                      disabled={editingCode !== null}
                      maxLength={10}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 uppercase focus:outline-none focus:border-blue-500 font-extrabold"
                      required
                    />
                  </div>
                  <div>
                    <label className="block mb-1 uppercase tracking-wider text-[10px]">Description</label>
                    <input 
                      type="text" 
                      value={codeDesc}
                      onChange={(e) => setCodeDesc(e.target.value)}
                      placeholder="e.g. Training / Classroom Session"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block mb-1 uppercase tracking-wider text-[10px]">Background Color</label>
                      <input 
                        type="color" 
                        value={codeBg}
                        onChange={(e) => setCodeBg(e.target.value)}
                        className="w-full h-9 p-0.5 rounded-lg border border-slate-200 bg-white cursor-pointer"
                      />
                    </div>
                    <div>
                      <label className="block mb-1 uppercase tracking-wider text-[10px]">Text Color</label>
                      <input 
                        type="color" 
                        value={codeFg}
                        onChange={(e) => setCodeFg(e.target.value)}
                        className="w-full h-9 p-0.5 rounded-lg border border-slate-200 bg-white cursor-pointer"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block mb-1 uppercase tracking-wider text-[10px]">Is Leave Type?</label>
                      <select 
                        value={codeIsLeave ? 'true' : 'false'}
                        onChange={(e) => setCodeIsLeave(e.target.value === 'true')}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 cursor-pointer"
                      >
                        <option value="false">No (Shift Code)</option>
                        <option value="true">Yes (Accrued Leave)</option>
                      </select>
                    </div>
                    {codeIsLeave && (
                      <div>
                        <label className="block mb-1 uppercase tracking-wider text-[10px]">Leave Bank Category</label>
                        <select 
                          value={codeLeaveType}
                          onChange={(e) => setCodeLeaveType(e.target.value as any)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 cursor-pointer"
                        >
                          <option value="CL">CL Bank</option>
                          <option value="LAP">LAP Bank</option>
                          <option value="CR">CR Balance</option>
                          <option value="Sick">Sick Bank</option>
                          <option value="None">Special Leave</option>
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="pt-2 flex justify-end gap-2.5">
                    {editingCode && (
                      <button 
                        type="button" 
                        onClick={handleCancelEditCode}
                        className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 uppercase text-[10px]"
                      >
                        Cancel
                      </button>
                    )}
                    <button 
                      type="submit" 
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white uppercase text-[10px]"
                    >
                      {editingCode ? "Save Updates" : "Register Code"}
                    </button>
                  </div>
                </form>
              </div>

              {/* Codes list */}
              <div className="lg:col-span-2 glass-panel rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                <div className="px-5 py-4 border-b flex items-center justify-between">
                  <h3 className="font-bold text-slate-855">Roster Codes Config</h3>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-655 font-bold">{allCodes.length} Codes</span>
                </div>
                <div className="overflow-y-auto max-h-[460px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b text-slate-500 uppercase font-bold bg-slate-50">
                        <th className="py-2.5 px-5">Code</th>
                        <th className="py-2.5 px-5">Description</th>
                        <th className="py-2.5 px-5">Preview</th>
                        <th className="py-2.5 px-5">Is Leave</th>
                        <th className="py-2.5 px-5 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                      {allCodes.map(code => (
                        <tr key={code.code} className="hover:bg-slate-50/50">
                          <td className="py-3 px-5 font-bold text-slate-800">{code.code}</td>
                          <td className="py-3 px-5 text-slate-600">{code.description}</td>
                          <td className="py-3 px-5">
                            <span 
                              className="px-3 py-1 text-[10px] font-black rounded-lg uppercase tracking-wide border shadow-inner"
                              style={{ backgroundColor: code.bg_color, color: code.text_color, borderColor: code.text_color + '20' }}
                            >
                              {code.code}
                            </span>
                          </td>
                          <td className="py-3 px-5">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${code.is_leave ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-slate-100 text-slate-500'}`}>
                              {code.is_leave ? `Leave (${code.leave_type})` : 'Work Shift'}
                            </span>
                          </td>
                          <td className="py-3 px-5 text-center space-x-2">
                            <button onClick={() => handleEditCodeClick(code)} className="text-slate-400 hover:text-slate-800 transition cursor-pointer font-bold">Edit</button>
                            <button onClick={() => handleDeleteCode(code.code)} className="text-slate-400 hover:text-rose-600 transition cursor-pointer font-bold">Delete</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* TAB 6: HOLIDAY MASTER */}
          {activeTab === 'holidays' && (
            <>
              {/* Form */}
              <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
                <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5 pb-3 border-b">
                  <PlusCircle size={15} className="text-blue-600" />
                  {editingHolidayId ? "Edit Holiday Date" : "Add Official Holiday"}
                </h3>
                <form onSubmit={handleSaveHoliday} className="space-y-4 text-xs font-bold text-slate-600">
                  <div>
                    <label className="block mb-1 uppercase tracking-wider text-[10px]">Holiday Date</label>
                    <input 
                      type="date" 
                      value={hDate}
                      onChange={(e) => setHDate(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 cursor-pointer"
                      required
                    />
                  </div>
                  <div>
                    <label className="block mb-1 uppercase tracking-wider text-[10px]">Holiday Name</label>
                    <input 
                      type="text" 
                      value={hName}
                      onChange={(e) => setHName(e.target.value)}
                      placeholder="e.g. Independence Day"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block mb-1 uppercase tracking-wider text-[10px]">Holiday Type</label>
                      <select 
                        value={hType}
                        onChange={(e) => setHType(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 cursor-pointer"
                      >
                        <option value="National">National</option>
                        <option value="Gazetted">Gazetted</option>
                        <option value="Restricted">Restricted</option>
                      </select>
                    </div>
                    <div>
                      <label className="block mb-1 uppercase tracking-wider text-[10px]">Applicability</label>
                      <select 
                        value={hApplicability}
                        onChange={(e) => setHApplicability(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 cursor-pointer"
                      >
                        <option value="ALL">ALL Lines</option>
                        <option value="KKVS">KKVS Only</option>
                        <option value="KMUK">KMUK Only</option>
                      </select>
                    </div>
                  </div>
                  <div className="pt-2 flex justify-end gap-2.5">
                    {editingHolidayId && (
                      <button 
                        type="button" 
                        onClick={() => { setEditingHolidayId(null); setHDate(''); setHName(''); }}
                        className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 uppercase text-[10px]"
                      >
                        Cancel
                      </button>
                    )}
                    <button 
                      type="submit" 
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white uppercase text-[10px]"
                    >
                      {editingHolidayId ? "Save Updates" : "Register Holiday"}
                    </button>
                  </div>
                </form>
              </div>

              {/* Holidays list */}
              <div className="lg:col-span-2 glass-panel rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                <div className="px-5 py-4 border-b flex items-center justify-between">
                  <h3 className="font-bold text-slate-855">Holiday Calendar Master</h3>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-650 font-bold">{holidays.length} Registered</span>
                </div>
                <div className="overflow-y-auto max-h-[420px]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b text-slate-500 uppercase font-bold bg-slate-50">
                        <th className="py-2.5 px-5">Date</th>
                        <th className="py-2.5 px-5">Holiday Name</th>
                        <th className="py-2.5 px-5">Type</th>
                        <th className="py-2.5 px-5">Applicability</th>
                        <th className="py-2.5 px-5 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                      {holidays.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400 font-bold">
                            No holidays registered in system database.
                          </td>
                        </tr>
                      ) : (
                        holidays.map(h => (
                          <tr key={h.id} className="hover:bg-slate-50/50">
                            <td className="py-3 px-5 font-mono">{h.holiday_date}</td>
                            <td className="py-3 px-5 font-bold text-slate-800">{h.name}</td>
                            <td className="py-3 px-5"><span className="px-2 py-0.5 rounded bg-slate-100">{h.holiday_type}</span></td>
                            <td className="py-3 px-5 font-bold text-blue-600">{h.applicability || 'ALL'}</td>
                            <td className="py-3 px-5 text-center space-x-2">
                              <button onClick={() => handleEditHoliday(h)} className="text-slate-400 hover:text-slate-855 transition cursor-pointer font-bold">Edit</button>
                              <button onClick={() => handleDeleteHoliday(h.id!)} className="text-slate-400 hover:text-rose-600 transition cursor-pointer font-bold">Delete</button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {/* TAB 7: BACKUPS & RECOVERY */}
          {activeTab === 'backups' && (
            <>
              {/* SQLite Health metrics check */}
              <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
                <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider pb-3 border-b flex items-center gap-1.5">
                  <Database size={15} className="text-blue-600" />
                  Database Health Check
                </h3>
                {backupStatus ? (
                  <div className="space-y-4 text-xs font-semibold">
                    <div className="flex justify-between items-center py-2 border-b border-slate-50">
                      <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">SQLite Integrity:</span>
                      <span className={`flex items-center gap-1 font-bold ${backupStatus.integrity === 'ok' ? 'text-emerald-600' : 'text-rose-600'}`}>
                        <CheckCircle size={14} />
                        {backupStatus.integrity.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-50">
                      <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Database Size:</span>
                      <span className="font-mono text-slate-850">{(backupStatus.database_size_bytes / 1024).toFixed(2)} KB</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-slate-50">
                      <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Last Snapshot Copy:</span>
                      <span className="font-mono text-[9px] text-slate-500 truncate max-w-[130px]">{backupStatus.last_backup}</span>
                    </div>
                  </div>
                ) : (
                  <p className="text-slate-455 text-[10px]">Health statistics not loaded.</p>
                )}

                <button
                  onClick={handleCreateBackup}
                  disabled={isBackupRunning}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider transition cursor-pointer shadow-sm shadow-blue-500/10"
                >
                  <PlusCircle size={14} />
                  {isBackupRunning ? "Creating Copy..." : "Create Backup Snapshot"}
                </button>
              </div>

              {/* Snapshot history list */}
              <div className="lg:col-span-2 glass-panel rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col overflow-hidden">
                <div className="px-5 py-4 border-b flex items-center justify-between">
                  <h3 className="font-bold text-slate-855">Historical Snapshots list</h3>
                  <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-655 font-bold">{backups.length} Available</span>
                </div>
                
                <div className="overflow-y-auto max-h-[380px] divide-y divide-slate-100">
                  {backups.length === 0 ? (
                    <div className="py-12 text-center text-slate-400 text-xs font-semibold">
                      No snapshots found in local directory.
                    </div>
                  ) : (
                    backups.map(file => (
                      <div key={file} className="flex justify-between items-center p-4 hover:bg-slate-50/50">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-slate-700 font-mono">{file}</span>
                          <span className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider mt-0.5">SQLite database copy</span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleRestoreBackup(file)}
                            className="px-3.5 py-1.5 rounded bg-amber-50 hover:bg-amber-100 border border-amber-250 text-amber-700 text-xs font-bold transition cursor-pointer uppercase tracking-wider text-[10px]"
                          >
                            Restore State
                          </button>
                          <button
                            onClick={() => handleDeleteBackup(file)}
                            className="px-3.5 py-1.5 rounded bg-rose-50 hover:bg-rose-100 border border-rose-250 text-rose-700 text-xs font-bold transition cursor-pointer uppercase tracking-wider text-[10px]"
                          >
                            Delete Snapshot
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          )}

          {/* TAB 8: AUDIT TRAIL LOGS */}
          {activeTab === 'audit' && (
            <div className="lg:col-span-3 glass-panel rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col overflow-hidden">
              <div className="px-5 py-4 border-b flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h3 className="font-bold text-slate-855 flex items-center gap-1.5">
                  <Clock size={16} className="text-slate-500" />
                  Roster Activity Audit Trail Logs
                </h3>
                
                {/* Filters */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                    <Search size={14} className="text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Search audit trail..." 
                      value={auditSearch}
                      onChange={(e) => setAuditSearch(e.target.value)}
                      className="bg-transparent border-none text-slate-800 placeholder-slate-400 focus:outline-none w-full"
                    />
                  </div>

                  <select
                    value={auditModuleFilter}
                    onChange={(e) => setAuditModuleFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-250 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 cursor-pointer"
                  >
                    <option value="ALL">ALL Modules</option>
                    <option value="Attendance">Attendance</option>
                    <option value="Employees">Employees</option>
                    <option value="Holidays">Holidays</option>
                    <option value="System">System</option>
                  </select>
                </div>
              </div>

              <div className="overflow-y-auto max-h-[460px]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b text-slate-500 uppercase font-bold bg-slate-50">
                      <th className="py-2.5 px-5">Timestamp</th>
                      <th className="py-2.5 px-5">User</th>
                      <th className="py-2.5 px-5">Module</th>
                      <th className="py-2.5 px-5">Action</th>
                      <th className="py-2.5 px-5">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                    {filteredAudits.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-slate-400 font-bold">
                          No transaction audit records found in log directory.
                        </td>
                      </tr>
                    ) : (
                      filteredAudits.map(log => (
                        <tr key={log.id} className="hover:bg-slate-50/50">
                          <td className="py-3 px-5 font-mono text-slate-500">{log.timestamp}</td>
                          <td className="py-3 px-5 font-bold text-slate-850">{log.user}</td>
                          <td className="py-3 px-5"><span className="px-2 py-0.5 rounded bg-slate-100 text-slate-655">{log.module}</span></td>
                          <td className="py-3 px-5 font-bold text-blue-600">{log.action}</td>
                          <td className="py-3 px-5 text-slate-600 max-w-md truncate" title={log.details}>{log.details}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

        </div>
      )}

      {/* Premium Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-slate-800 text-white rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 max-w-sm transition-all duration-300">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
          <p className="text-xs font-semibold text-slate-200">{toast.message}</p>
        </div>
      )}

    </div>
  );
}

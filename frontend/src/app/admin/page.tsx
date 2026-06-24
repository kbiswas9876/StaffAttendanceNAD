'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  TrendingUp, 
  MapPin, 
  CalendarDays, 
  Calendar, 
  Settings, 
  Sliders,
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
  Info,
  AlertTriangle
} from 'lucide-react';
import { getTranslation } from '../../lib/translations';
import { 
  getEmployees, createEmployee, updateEmployee, deleteEmployee, Employee,
  getLines, createLine, updateLine, deleteLine, MetroLine,
  getSections, createSection, updateSection, deleteSection, Section,
  getShiftRules, createShiftRule, updateShiftRule, deleteShiftRule, ShiftRule,
  getAttendanceCodes, createAttendanceCode, updateAttendanceCode, deleteAttendanceCode, AttendanceCode,
  getHolidays, createHoliday, updateHoliday, deleteHoliday, Holiday,
  getAuditLogs, AuditLog,
  getBackupsList, createBackup, restoreBackup, getBackupStatus, deleteBackup,
  getAttendanceLogs, saveAttendanceLogsBulk, addSpecialEvent,
  getWeeklyScheduleDefault, getAppVersion,
  triggerUpdateDownload, getUpdateDownloadStatus,
  getRosterRules, createRosterRule, deleteRosterRule, RosterRule
} from '../../lib/api';

interface DayInfo {
  dateStr: string;
  dayNum: number;
  weekday: string;
  isSunday: boolean;
}

const getBaseRotatingShift = (sched: any, dateStr: string) => {
  if (!sched) return null;
  if (sched.type === 'flexible') return null;

  if (sched.type === 'custom-rotation') {
    const pattern = sched.pattern || [];
    if (pattern.length === 0) return null;
    const anchorStr = sched.anchor_date || '2026-06-01';
    const anchor = new Date(anchorStr);
    const target = new Date(dateStr);
    anchor.setHours(0,0,0,0);
    target.setHours(0,0,0,0);
    const diffTime = target.getTime() - anchor.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    const cycleLength = pattern.length;
    const cycleDay = ((diffDays % cycleLength) + cycleLength) % cycleLength;
    return pattern[cycleDay] || null;
  }

  if (sched.type !== 'rotating' && sched.type !== 'rotating-3week') {
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

  if (sched.type === 'rotating-3week') {
    const cycleDay = ((diffDays % 21) + 21) % 21;
    const weekNum = Math.floor(cycleDay / 7) + 1; // 1 to 3
    const dayOfWeek = target.toLocaleDateString('en-US', { weekday: 'long' });
    const wk = `week${weekNum}`;
    return sched[wk]?.[dayOfWeek] || null;
  } else {
    const cycleDay = ((diffDays % 28) + 28) % 28;
    const weekNum = Math.floor(cycleDay / 7) + 1; // 1 to 4
    const dayOfWeek = target.toLocaleDateString('en-US', { weekday: 'long' });
    const wk = `week${weekNum}`;
    return sched[wk]?.[dayOfWeek] || null;
  }
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

const getWeekdaysStartingFrom = (anchorDateStr: string) => {
  const defaultDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  if (!anchorDateStr) return defaultDays;
  try {
    const date = new Date(anchorDateStr);
    if (isNaN(date.getTime())) return defaultDays;
    const startDay = date.toLocaleDateString('en-US', { weekday: 'long' });
    const startIndex = defaultDays.indexOf(startDay);
    if (startIndex === -1) return defaultDays;
    return [
      ...defaultDays.slice(startIndex),
      ...defaultDays.slice(0, startIndex)
    ];
  } catch (e) {
    return defaultDays;
  }
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
  const [activeTab, setActiveTab] = useState<'employees' | 'lines' | 'shifts' | 'roster' | 'codes' | 'holidays' | 'backups' | 'audit' | 'updates' | 'settings' | 'roster-rules'>('employees');
  const [lang, setLang] = useState<'en' | 'bn' | 'hi'>('en');
  const [mySection, setMySection] = useState('KKVS');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setLang((localStorage.getItem('erp_lang') || 'en') as 'en' | 'bn' | 'hi');
      setMySection(localStorage.getItem('erp_my_section') || 'KKVS');
    }
    
    const handleLangChange = () => {
      if (typeof window !== 'undefined') {
        setLang((localStorage.getItem('erp_lang') || 'en') as 'en' | 'bn' | 'hi');
      }
    };
    window.addEventListener('erp_lang_changed', handleLangChange);
    return () => window.removeEventListener('erp_lang_changed', handleLangChange);
  }, []);

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
  const [rosterRules, setRosterRules] = useState<RosterRule[]>([]);

  // Search/Filters states
  const [empSearchQuery, setEmpSearchQuery] = useState('');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditModuleFilter, setAuditModuleFilter] = useState('ALL');
  const [directoryLineFilter, setDirectoryLineFilter] = useState<string>('ALL');
  const [directorySectionFilter, setDirectorySectionFilter] = useState<string>('ALL');

  // Edit helper states
  const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null);
  const [editingLineId, setEditingLineId] = useState<number | null>(null);
  const [editingSectionId, setEditingSectionId] = useState<number | null>(null);
  const [editingShiftRuleId, setEditingShiftRuleId] = useState<number | null>(null);
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
  const [scheduleType, setScheduleType] = useState<'simple' | 'rotating' | 'rotating-3week' | 'flexible' | 'custom-rotation'>('simple');
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState<number | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [rulePattern, setRulePattern] = useState('');
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
  const [customNightWeeks, setCustomNightWeeks] = useState<{ from_date: string; to_date: string; shift?: string }[]>([]);
  const [overrideFrom, setOverrideFrom] = useState('');
  const [overrideTo, setOverrideTo] = useState('');
  const [overrideShift, setOverrideShift] = useState('N');

  // 1b. Employee Transfer Form
  const [transferEmpId, setTransferEmpId] = useState<string>('');
  const [transferSecCode, setTransferSecCode] = useState<string>('');
  const [transferDate, setTransferDate] = useState<string>('2026-06-15');
  const [transferOrderNo, setTransferOrderNo] = useState<string>('');
  const [transferRemarks, setTransferRemarks] = useState<string>('');
  const [transferSignatoryName, setTransferSignatoryName] = useState<string>('');
  const [transferSignatoryDesig, setTransferSignatoryDesig] = useState<string>('');

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
  const [isCustomDutyType, setIsCustomDutyType] = useState(false);
  const [customDutyTypeText, setCustomDutyTypeText] = useState('');

  // 4b. Roster Codes Form
  const [codeVal, setCodeVal] = useState('');
  const [codeDesc, setCodeDesc] = useState('');
  const [codeBg, setCodeBg] = useState('#FFFFFF');
  const [codeFg, setCodeFg] = useState('#1E293B');
  const [codeIsLeave, setCodeIsLeave] = useState(false);
  const [codeLeaveType, setCodeLeaveType] = useState<'CL' | 'LAP' | 'CR' | 'Sick' | 'None'>('None');

  // 5. Roster Planner Form
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

  const [plannerEmpId, setPlannerEmpId] = useState<string>('');
  const [plannerMonth, setPlannerMonth] = useState<number>(defaultPeriod.month);
  const [plannerYear, setPlannerYear] = useState<number>(defaultPeriod.year);
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

  // Updates check states
  const [currentVersion, setCurrentVersion] = useState('v1.2.0'); // Installed version
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'latest' | 'available' | 'error'>('idle');
  const [latestRelease, setLatestRelease] = useState<{
    tag_name: string;
    name: string;
    published_at: string;
    body: string;
    html_url: string;
  } | null>(null);

  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStateText, setDownloadStateText] = useState<'idle' | 'downloading' | 'completed' | 'error'>('idle');
  const [downloadPath, setDownloadPath] = useState('');
  const [downloadError, setDownloadError] = useState('');

  const startUpdateDownload = async () => {
    setDownloadStateText('downloading');
    setDownloadProgress(0);
    setDownloadError('');
    try {
      await triggerUpdateDownload();
      
      const interval = setInterval(async () => {
        try {
          const status = await getUpdateDownloadStatus();
          setDownloadProgress(status.progress);
          setDownloadStateText(status.status);
          if (status.status === 'completed') {
            setDownloadPath(status.path);
            clearInterval(interval);
            showToast("Update downloaded successfully!", "success");
          } else if (status.status === 'error') {
            setDownloadError(status.error_message);
            clearInterval(interval);
            showToast("Failed to download update", "error");
          }
        } catch (pollErr) {
          console.error("Error polling update status", pollErr);
          clearInterval(interval);
          setDownloadStateText('error');
          setDownloadError("Connection to backend lost.");
        }
      }, 500);
    } catch (err: any) {
      console.error("Failed to trigger update download", err);
      setDownloadStateText('error');
      setDownloadError(err.message || "Failed to start download");
      showToast("Download failed", "error");
    }
  };

  const checkSystemUpdates = async () => {
    setUpdateStatus('checking');
    try {
      const res = await fetch('https://api.github.com/repos/kbiswas9876/StaffAttendanceNAD/releases/latest');
      if (res.status === 404) {
        setLatestRelease(null);
        setUpdateStatus('latest');
        return;
      }
      if (!res.ok) {
        throw new Error(`Failed to query releases: HTTP ${res.status}`);
      }
      const data = await res.json();
      setLatestRelease({
        tag_name: data.tag_name,
        name: data.name,
        published_at: new Date(data.published_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
        body: data.body,
        html_url: data.html_url
      });
      
      // Compare versions numerically to check if tag_name is newer than currentVersion
      const parse = (v: string) => v.replace(/^v/, '').split('.').map(Number);
      const a = parse(data.tag_name);
      const b = parse(currentVersion);
      const maxLength = Math.max(a.length, b.length);
      let isNewer = false;
      for (let i = 0; i < maxLength; i++) {
        const numA = a[i] || 0;
        const numB = b[i] || 0;
        if (numA > numB) {
          isNewer = true;
          break;
        }
        if (numA < numB) {
          break;
        }
      }
      
      if (isNewer) {
        setUpdateStatus('available');
      } else {
        setUpdateStatus('latest');
      }
    } catch (err) {
      console.error("Failed to check for updates", err);
      setUpdateStatus('error');
      showToast("Error checking for updates from GitHub", "error");
    }
  };

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

      try {
        const rules = await getRosterRules();
        setRosterRules(rules);
      } catch (ruleErr) {
        console.error("Failed to load roster rules", ruleErr);
      }
      
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

      // Fetch dynamic application version from API
      try {
        const verObj = await getAppVersion();
        if (verObj && verObj.version) {
          setCurrentVersion(`v${verObj.version.replace(/^v/, '')}`);
        }
      } catch (verErr) {
        console.error("Failed to load application version from backend", verErr);
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

    if (scheduleType === 'custom-rotation') {
      if (!selectedRuleId) {
        showToast("Please select a roster rotation rule.", "error");
        return;
      }
      if (!empAnchorDate) {
        showToast("Please select an anchor date.", "error");
        return;
      }
    }

    const sectionObj = sections.find(s => s.section_code === empSection);
    
    const weeklySchedulePayload = scheduleType === 'simple' 
      ? {
          type: 'simple',
          ...empWeeklySchedule,
          custom_night_weeks: customNightWeeks
        }
      : scheduleType === 'flexible'
      ? {
          type: 'flexible',
          custom_night_weeks: customNightWeeks
        }
      : scheduleType === 'rotating-3week'
      ? {
          type: 'rotating-3week',
          anchor_date: empAnchorDate,
          week1: rotatingSchedule.week1,
          week2: rotatingSchedule.week2,
          week3: rotatingSchedule.week3,
          custom_night_weeks: customNightWeeks
        }
      : scheduleType === 'custom-rotation'
      ? (() => {
          const matchedRule = rosterRules.find(r => r.id === Number(selectedRuleId));
          if (!matchedRule) {
            throw new Error("Selected roster rule not found.");
          }
          return {
            type: 'custom-rotation',
            rule_name: matchedRule.name,
            anchor_date: empAnchorDate,
            pattern: matchedRule.pattern.split(','),
            custom_night_weeks: customNightWeeks
          };
        })()
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

    let detectedRestDay = empRestDay;
    if (scheduleType === 'simple') {
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const foundRest = days.find(d => empWeeklySchedule[d] === 'R');
      if (foundRest) {
        detectedRestDay = foundRest;
      }
    } else if (scheduleType === 'rotating' || scheduleType === 'rotating-3week') {
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      const foundRest = days.find(d => rotatingSchedule.week1[d] === 'R');
      if (foundRest) {
        detectedRestDay = foundRest;
      }
    } else if (scheduleType === 'flexible' || scheduleType === 'custom-rotation') {
      detectedRestDay = 'Flexible';
    }

    const payload = {
      pf_number: empPF.trim(),
      name: empName.trim(),
      designation: desigValue,
      level: Number(empLevel),
      primary_section_id: sectionObj?.id || null,
      section_code: empSection || null,
      default_rest_day: detectedRestDay,
      weekly_schedule: weeklySchedulePayload as any,
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
      setScheduleType('simple');
      setEmpAnchorDate('2026-06-01');
      setCustomNightWeeks([]);
      setOverrideFrom('');
      setOverrideTo('');
      setOverrideShift('N');
      setEmpWeeklySchedule(getWeeklyScheduleDefault('Wednesday'));
      setRotatingSchedule({
        week1: getWeeklyScheduleDefault('Wednesday'),
        week2: getWeeklyScheduleDefault('Wednesday'),
        week3: getWeeklyScheduleDefault('Wednesday'),
        week4: getWeeklyScheduleDefault('Wednesday'),
      });
      loadAdminData();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('erp_metadata_changed'));
      }
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
    } else if (sched && (sched as any).type === 'rotating-3week') {
      setScheduleType('rotating-3week');
      setEmpAnchorDate((sched as any).anchor_date || '2026-06-01');
      setRotatingSchedule({
        week1: (sched as any).week1 || getWeeklyScheduleDefault(emp.default_rest_day),
        week2: (sched as any).week2 || getWeeklyScheduleDefault(emp.default_rest_day),
        week3: (sched as any).week3 || getWeeklyScheduleDefault(emp.default_rest_day),
        week4: getWeeklyScheduleDefault(emp.default_rest_day),
      });
      setCustomNightWeeks((sched as any).custom_night_weeks || []);
    } else if (sched && (sched as any).type === 'custom-rotation') {
      setScheduleType('custom-rotation');
      setEmpAnchorDate((sched as any).anchor_date || '2026-06-01');
      // Set selectedRuleId based on rule name match
      const matchedRule = rosterRules.find(r => r.name === (sched as any).rule_name);
      setSelectedRuleId(matchedRule ? matchedRule.id : null);
      setCustomNightWeeks((sched as any).custom_night_weeks || []);
    } else if (sched && (sched as any).type === 'flexible') {
      setScheduleType('flexible');
      setEmpAnchorDate('2026-06-01');
      setRotatingSchedule({
        week1: getWeeklyScheduleDefault(emp.default_rest_day),
        week2: getWeeklyScheduleDefault(emp.default_rest_day),
        week3: getWeeklyScheduleDefault(emp.default_rest_day),
        week4: getWeeklyScheduleDefault(emp.default_rest_day),
      });
      setCustomNightWeeks((sched as any).custom_night_weeks || []);
    } else {
      setScheduleType('simple');
      setEmpAnchorDate('2026-06-01');
      const baseSched = { ...((sched as { [day: string]: string }) || getWeeklyScheduleDefault(emp.default_rest_day)) };
      delete baseSched.type;
      delete baseSched.custom_night_weeks;
      setEmpWeeklySchedule(baseSched);
      setCustomNightWeeks((sched as any)?.custom_night_weeks || []);
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
    setScheduleType('simple');
    setEmpAnchorDate('2026-06-01');
    setCustomNightWeeks([]);
    setOverrideFrom('');
    setOverrideTo('');
    setOverrideShift('N');
    setSelectedRuleId(null);
    setEmpWeeklySchedule(getWeeklyScheduleDefault('Wednesday'));
    setRotatingSchedule({
      week1: getWeeklyScheduleDefault('Wednesday'),
      week2: getWeeklyScheduleDefault('Wednesday'),
      week3: getWeeklyScheduleDefault('Wednesday'),
      week4: getWeeklyScheduleDefault('Wednesday'),
    });
    setEmpJoiningDate('');
  };

  const handleDeleteEmployeeClick = async (empId: number) => {
    const emp = employees.find(e => e.emp_id === empId);
    const empName = emp ? emp.name : "this employee";
    if (!window.confirm(`Are you sure you want to remove ${empName} from the roster? This will delete all their leave balances and attendance logs.`)) {
      return;
    }
    try {
      await deleteEmployee(empId);
      showToast("Employee deleted successfully.", "success");
      loadAdminData();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('erp_metadata_changed'));
      }
    } catch (err) {
      showToast("Failed to delete employee.", "error");
      console.error(err);
    }
  };

  const handleAddRosterRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ruleName.trim() || !rulePattern.trim()) {
      showToast("Please provide both rule name and pattern.", "error");
      return;
    }

    const cleanPattern = rulePattern
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean)
      .join(',');

    if (!cleanPattern) {
      showToast("Please provide a valid comma-separated pattern.", "error");
      return;
    }

    try {
      await createRosterRule({ name: ruleName.trim(), pattern: cleanPattern });
      showToast("Roster rotation rule saved successfully!", "success");
      setRuleName('');
      setRulePattern('');
      loadAdminData();
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to create roster rule.", "error");
    }
  };

  const handleDeleteRosterRule = async (id: number) => {
    if (!window.confirm("Are you sure you want to delete this roster rotation rule? Existing employees using it will keep their current schedule settings, but you won't be able to select this rule for new or edited employees.")) {
      return;
    }
    try {
      await deleteRosterRule(id);
      showToast("Roster rotation rule deleted successfully.", "success");
      loadAdminData();
    } catch (err) {
      console.error(err);
      showToast("Failed to delete roster rotation rule.", "error");
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
        location: `${emp.section_code || 'Unassigned'} ➡️ ${sectionObj.section_code}`,
        from_section: emp.section_code || 'Unassigned',
        to_section: sectionObj.section_code,
        signatory_name: transferSignatoryName || 'N/A',
        signatory_designation: transferSignatoryDesig || 'N/A'
      });

      showToast(`Successfully transferred ${emp.name} to ${sectionObj.section_name}.`, "success");
      setTransferEmpId('');
      setTransferSecCode('');
      setTransferOrderNo('');
      setTransferRemarks('');
      setTransferSignatoryName('');
      setTransferSignatoryDesig('');
      loadAdminData();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('erp_metadata_changed'));
      }
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
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('erp_metadata_changed'));
      }
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
    const line = lines.find(l => l.id === lineId);
    const lineName = line ? line.line_name : "this Line";
    const confirmInput = window.prompt(
      `WARNING: Deleting Metro Line "${lineName}" will permanently delete ALL sections, shift rules, signallers, and attendance records associated with it!\n\nTo confirm deletion, please type the line name "${lineName}" exactly:`
    );
    if (confirmInput !== lineName) {
      showToast("Deletion cancelled. Line name did not match.", "error");
      return;
    }
    try {
      await deleteLine(lineId);
      showToast("Metro Line deleted successfully.", "success");
      loadAdminData();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('erp_metadata_changed'));
      }
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
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('erp_metadata_changed'));
      }
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
    const sec = sections.find(s => s.id === secId);
    const secCode = sec ? sec.section_code : "this section";
    const confirmInput = window.prompt(
      `WARNING: Deleting Section "${secCode}" will permanently delete ALL signallers, shift rules, and attendance logs associated with it!\n\nTo confirm deletion, please type the section code "${secCode}" exactly:`
    );
    if (confirmInput !== secCode) {
      showToast("Deletion cancelled. Section code did not match.", "error");
      return;
    }
    try {
      await deleteSection(secId);
      showToast("Section deleted successfully.", "success");
      loadAdminData();
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('erp_metadata_changed'));
      }
    } catch (err) {
      showToast("Failed to delete section.", "error");
    }
  };

  // 3. Shifts Tab Forms
  const handleAddShift = async (e: React.FormEvent) => {
    e.preventDefault();
    const sectionObj = sections.find(s => s.section_code === shiftSecCode);
    if (!sectionObj) return;

    const finalDutyType = isCustomDutyType ? customDutyTypeText.trim() : (shiftNight ? 'Night Shift' : 'General / Day Shift');

    try {
      if (editingShiftRuleId !== null) {
        await updateShiftRule(editingShiftRuleId, {
          section_id: sectionObj.id,
          shift_code: shiftCode.toUpperCase(),
          start_time: shiftStart.length === 5 ? `${shiftStart}:00` : shiftStart,
          end_time: shiftEnd.length === 5 ? `${shiftEnd}:00` : shiftEnd,
          working_days: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
          is_night_duty: shiftNight,
          duty_type: finalDutyType
        });
        showToast(`Successfully updated shift rule ${shiftCode} for ${shiftSecCode}.`, "success");
        setEditingShiftRuleId(null);
      } else {
        await createShiftRule({
          section_id: sectionObj.id,
          shift_code: shiftCode.toUpperCase(),
          start_time: `${shiftStart}:00`,
          end_time: `${shiftEnd}:00`,
          working_days: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'],
          is_night_duty: shiftNight,
          duty_type: finalDutyType
        });
        showToast(`Successfully created shift rule ${shiftCode} for ${shiftSecCode}.`, "success");
      }
      setShiftCode('G');
      setShiftStart('09:00');
      setShiftEnd('17:30');
      setShiftNight(false);
      setIsCustomDutyType(false);
      setCustomDutyTypeText('');
      loadAdminData();
    } catch (err) {
      showToast("Failed to save shift rule. Check if the code already exists for this section.", "error");
    }
  };

  const handleEditShiftClick = (rule: ShiftRule) => {
    setEditingShiftRuleId(rule.id);
    const sec = sections.find(s => s.id === rule.section_id);
    if (sec) {
      setShiftSecCode(sec.section_code);
    }
    setShiftCode(rule.shift_code);
    setShiftStart(rule.start_time.substring(0, 5));
    setShiftEnd(rule.end_time.substring(0, 5));
    setShiftNight(rule.is_night_duty);
    
    const dt = rule.duty_type || (rule.is_night_duty ? 'Night Shift' : 'General / Day Shift');
    if (dt === 'Night Shift' || dt === 'General / Day Shift') {
      setIsCustomDutyType(false);
      setCustomDutyTypeText('');
    } else {
      setIsCustomDutyType(true);
      setCustomDutyTypeText(dt);
    }
  };

  const handleCancelEditShift = () => {
    setEditingShiftRuleId(null);
    setShiftCode('G');
    setShiftStart('09:00');
    setShiftEnd('17:30');
    setShiftNight(false);
    setIsCustomDutyType(false);
    setCustomDutyTypeText('');
  };

  const handleDeleteShiftClick = async (ruleId: number) => {
    if (!window.confirm("Are you sure you want to delete this shift rule?")) return;
    try {
      await deleteShiftRule(ruleId);
      showToast("Shift rule deleted successfully.", "success");
      loadAdminData();
    } catch (err) {
      showToast("Failed to delete shift rule.", "error");
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
  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(empSearchQuery.toLowerCase()) ||
      emp.pf_number.includes(empSearchQuery) ||
      emp.designation.toLowerCase().includes(empSearchQuery.toLowerCase()) ||
      (emp.section_code || "").toLowerCase().includes(empSearchQuery.toLowerCase());
      
    const matchesLine = directoryLineFilter === 'ALL' || (() => {
      const empSec = sections.find(s => s.section_code === emp.section_code);
      return empSec ? empSec.line_id === Number(directoryLineFilter) : false;
    })();
    
    const matchesSection = directorySectionFilter === 'ALL' || emp.section_code === directorySectionFilter;
    
    return matchesSearch && matchesLine && matchesSection;
  });

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
        <div className="no-print bg-theme-active text-theme-active px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border border-theme-active shadow-sm animate-pulse">
          Super Admin Mode
        </div>
      </div>

      {/* Tabs navigation grid */}
      <div className="no-print grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-11 gap-2 border-b border-slate-200 pb-3">
        {[
          { id: 'employees', label: 'Enroll & Transfer', icon: Users },
          { id: 'lines', label: 'Lines & Sections', icon: TrendingUp },
          { id: 'settings', label: getTranslation(lang, 'My Section'), icon: Settings },
          { id: 'roster-rules', label: 'Roster Settings', icon: Sliders },
          { id: 'shifts', label: 'Shift Rules', icon: Clock },
          { id: 'roster', label: 'Roster Planner', icon: Calendar },
          { id: 'codes', label: 'Roster Codes', icon: Sliders },
          { id: 'holidays', label: 'Holidays Master', icon: CalendarDays },
          { id: 'updates', label: 'System Update', icon: RefreshCw },
          { id: 'audit', label: 'Audit Logs', icon: History },
          { id: 'backups', label: 'DB Backups', icon: Database }
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
                ? 'tab-theme-active'
                : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50/50'
            }`}
          >
            <tab.icon size={18} className="mb-1 shrink-0" />
            <span className="text-[10px] font-bold tracking-tight block">{getTranslation(lang, tab.label)}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-pulse">
          {/* Left Column Form Skeleton */}
          <div className="space-y-6">
            <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
              <div className="h-4 w-36 bg-[#E5E3DC] rounded pb-1" />
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="space-y-2">
                    <div className="h-3 w-16 bg-[#E5E3DC] rounded" />
                    <div className="h-9 w-full bg-[#FAF9F6] border border-slate-200/50 rounded-lg" />
                  </div>
                ))}
                <div className="h-9 w-24 bg-[#E5E3DC] rounded-lg mt-2" />
              </div>
            </div>
          </div>
          {/* Right Column List Skeleton */}
          <div className="lg:col-span-2 glass-panel rounded-xl border border-slate-200 flex flex-col overflow-hidden bg-white shadow-sm">
            <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div className="h-4 w-44 bg-[#E5E3DC] rounded" />
              <div className="h-6 w-16 bg-[#E5E3DC] rounded" />
            </div>
            <div className="p-4 space-y-3">
              <div className="flex border-b border-slate-200 pb-2">
                <div className="flex-1"><div className="h-3 w-20 bg-[#E5E3DC] rounded" /></div>
                <div className="flex-1"><div className="h-3 w-28 bg-[#E5E3DC] rounded" /></div>
                <div className="flex-1"><div className="h-3 w-24 bg-[#E5E3DC] rounded" /></div>
                <div className="w-16"><div className="h-3 w-10 bg-[#E5E3DC] rounded" /></div>
              </div>
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex py-3 border-b border-slate-100 items-center">
                  <div className="flex-1"><div className="h-4 w-24 bg-[#E5E3DC] rounded" /></div>
                  <div className="flex-1"><div className="h-4 w-32 bg-[#E5E3DC] rounded" /></div>
                  <div className="flex-1"><div className="h-4 w-20 bg-[#E5E3DC] rounded" /></div>
                  <div className="w-16 flex gap-1"><div className="h-6 w-10 bg-[#E5E3DC] rounded" /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* TAB 1: EMPLOYEES & TRANSFER */}
          {activeTab === 'employees' && (
            <div className="page-transition lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Add & Transfer Forms Column */}
              <div className="space-y-6">
                {/* Employee Form */}
                <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
                  <h3 className="font-bold text-slate-855 text-xs uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b">
                    <PlusCircle size={15} className="text-theme-primary" />
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
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus-border-theme font-mono"
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
                            <label className="block mb-1 uppercase tracking-wider text-[10px] text-theme-primary">Custom Name</label>
                            <input 
                              type="text" 
                              value={customDesigText}
                              onChange={(e) => setCustomDesigText(e.target.value)}
                              placeholder="e.g. Helper"
                              className="w-full border border-theme-active rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus-border-theme font-semibold"
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
                        <label className="block mb-1 uppercase tracking-wider text-[10px]">Joining Date (Optional)</label>
                        <input 
                          type="date" 
                          value={empJoiningDate}
                          onChange={(e) => setEmpJoiningDate(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 cursor-pointer"
                        />
                      </div>
                    </div>

                    {/* Weekly Schedule template button & summary */}
                    <div className="bg-slate-50 p-3.5 border border-slate-200 rounded-xl space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block">Roster Schedule Pattern</span>
                        <button
                          type="button"
                          onClick={() => setIsScheduleModalOpen(true)}
                          className="bg-theme-primary hover-opacity-85 text-white rounded-lg text-[10px] font-extrabold py-1.5 px-3 uppercase tracking-wider transition-colors cursor-pointer shadow-sm"
                        >
                          Configure
                        </button>
                      </div>
                       <div className="text-[11px] font-semibold text-slate-700">
                        {scheduleType === 'simple' && (() => {
                          const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
                          const rDay = days.find(d => empWeeklySchedule[d] === 'R') || empRestDay;
                          return `Single Week (Rest: ${rDay})`;
                        })()}
                        {scheduleType === 'flexible' && `Flexible / No Fixed Roster`}
                        {scheduleType === 'rotating-3week' && `3-Week Rotating (Anchor: ${empAnchorDate})`}
                        {scheduleType === 'rotating' && `4-Week Rotating (Anchor: ${empAnchorDate})`}
                        {scheduleType === 'custom-rotation' && `Rule: ${rosterRules.find(r => r.id === selectedRuleId)?.name || 'Custom Rotation'} (Anchor: ${empAnchorDate})`}
                      </div>
                      {customNightWeeks.length > 0 && (
                        <div className="text-[9px] text-slate-500 italic">
                          ({customNightWeeks.length} custom overrides configured)
                        </div>
                      )}
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
                        className="px-4 py-2 rounded-lg bg-theme-primary hover-bg-theme-primary text-white uppercase text-[10px] font-bold"
                      >
                        {editingEmployeeId !== null ? "Save Updates" : "Enroll Signaller"}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Transfer Form */}
                <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
                  <h3 className="font-bold text-slate-855 text-xs uppercase tracking-wider flex items-center gap-1.5 pb-2 border-b">
                    <ArrowLeftRight size={15} className="text-theme-primary" />
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
                    {transferEmpId && (
                      <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg animate-fade-in flex justify-between items-center text-xs">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">From Section (Current):</span>
                        <span className="px-2 py-0.5 rounded bg-theme-active text-theme-active font-extrabold border border-theme-active uppercase">
                          {employees.find(e => e.emp_id === Number(transferEmpId))?.section_code || 'Unassigned'}
                        </span>
                      </div>
                    )}
                    <div>
                      <label className="block mb-1 uppercase tracking-wider text-[10px]">Target Section (To Section)</label>
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
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus-border-theme"
                          required
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 border-t pt-3.5 mt-2">
                      <div>
                        <label className="block mb-1 uppercase tracking-wider text-[10px]">Signatory Name</label>
                        <input 
                          type="text" 
                          value={transferSignatoryName}
                          onChange={(e) => setTransferSignatoryName(e.target.value)}
                          placeholder="e.g. Koushik Saha"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus-border-theme"
                          required
                        />
                      </div>
                      <div>
                        <label className="block mb-1 uppercase tracking-wider text-[10px]">Signatory Designation</label>
                        <input 
                          type="text" 
                          value={transferSignatoryDesig}
                          onChange={(e) => setTransferSignatoryDesig(e.target.value)}
                          placeholder="e.g. SSE/Sig/IC"
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus-border-theme"
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
                <div className="px-5 py-4 border-b flex flex-col xl:flex-row justify-between items-start xl:items-center gap-3">
                  <h3 className="font-bold text-slate-855">Registered Signaller Directory</h3>
                  
                  <div className="flex flex-wrap items-center gap-2.5 w-full xl:w-auto">
                    {/* Line Filter */}
                    <select
                      value={directoryLineFilter}
                      onChange={(e) => {
                        setDirectoryLineFilter(e.target.value);
                        setDirectorySectionFilter('ALL');
                      }}
                      className="bg-slate-50 border border-slate-250 rounded-lg text-xs px-2.5 py-1.5 focus:outline-none font-bold text-slate-650 cursor-pointer"
                    >
                      <option value="ALL">All Lines</option>
                      {lines.map(line => (
                        <option key={line.id} value={line.id}>{line.line_name}</option>
                      ))}
                    </select>

                    {/* Section Filter */}
                    <select
                      value={directorySectionFilter}
                      onChange={(e) => setDirectorySectionFilter(e.target.value)}
                      className="bg-slate-50 border border-slate-250 rounded-lg text-xs px-2.5 py-1.5 focus:outline-none font-bold text-slate-650 cursor-pointer"
                    >
                      <option value="ALL">All Sections</option>
                      {sections.filter(s => directoryLineFilter === 'ALL' || s.line_id === Number(directoryLineFilter)).map(sec => (
                        <option key={sec.id} value={sec.section_code}>{sec.section_code}</option>
                      ))}
                    </select>

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
                            <td className="py-3 px-5 text-theme-primary font-extrabold">Level {emp.level}</td>
                            <td className="py-3 px-5"><span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-bold uppercase">{emp.section_code || "Unassigned"}</span></td>
                            <td className="py-3 px-5">{emp.default_rest_day}</td>
                            <td className="py-3 px-5 text-center flex items-center justify-center gap-1.5">
                              <button 
                                onClick={() => handleEditEmployeeClick(emp)} 
                                title="Edit Employee"
                                className="p-1.5 rounded-lg bg-theme-active text-theme-active hover:opacity-85 border border-theme-active/30 shadow-sm transition hover:scale-105 active:scale-95 cursor-pointer"
                              >
                                <Edit size={11} />
                              </button>
                              <button 
                                onClick={() => handleDeleteEmployeeClick(emp.emp_id)} 
                                title="Delete Employee"
                                className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200/50 shadow-sm transition hover:scale-105 active:scale-95 cursor-pointer"
                              >
                                <Trash2 size={11} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LINES & SECTIONS */}
          {activeTab === 'lines' && (
            <div className="page-transition lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                          <button 
                            onClick={() => handleEditLineClick(line)} 
                            title="Edit Metro Line"
                            className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200/50 shadow-sm transition hover:scale-105 active:scale-95 cursor-pointer"
                          >
                            <Edit size={11} />
                          </button>
                          <button 
                            onClick={() => handleDeleteLineClick(line.id)} 
                            title="Delete Metro Line"
                            className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200/50 shadow-sm transition hover:scale-105 active:scale-95 cursor-pointer"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
 
                {/* Sections cards list */}
                <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-3">
                  <h3 className="font-bold text-slate-855 text-xs uppercase tracking-wider border-b pb-2 flex items-center justify-between">
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
                            <div className="flex gap-1.5">
                              <button 
                                onClick={() => handleEditSectionClick(sec)} 
                                title="Edit Section"
                                className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200/50 shadow-sm transition hover:scale-105 active:scale-95 cursor-pointer"
                              >
                                <Edit size={11} />
                              </button>
                              <button 
                                onClick={() => handleDeleteSectionClick(sec.id)} 
                                title="Delete Section"
                                className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200/50 shadow-sm transition hover:scale-105 active:scale-95 cursor-pointer"
                              >
                                <Trash2 size={11} />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SHIFT RULES */}
          {activeTab === 'shifts' && (
            <div className="page-transition lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Form columns */}
              <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
                <h3 className="font-bold text-slate-855 text-xs uppercase tracking-wider border-b pb-2 flex items-center gap-1.5">
                  <PlusCircle size={15} className="text-blue-600" />
                  {editingShiftRuleId ? "Edit Shift Timing Rule" : "Define Shift Timing Rule"}
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
                  <div>
                    <label className="block mb-1 uppercase tracking-wider text-[10px]">Duty Type</label>
                    <select 
                      value={isCustomDutyType ? 'Custom' : (shiftNight ? 'Night Shift' : 'General / Day Shift')}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (val === 'Custom') {
                          setIsCustomDutyType(true);
                          setShiftNight(false);
                          setCustomDutyTypeText('');
                        } else {
                          setIsCustomDutyType(false);
                          setShiftNight(val === 'Night Shift');
                        }
                      }}
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 cursor-pointer focus:outline-none focus:border-blue-500 font-semibold"
                    >
                      <option value="General / Day Shift">General / Day Shift</option>
                      <option value="Night Shift">Night Shift</option>
                      <option value="Custom">Custom...</option>
                    </select>

                    {isCustomDutyType && (
                      <div className="mt-3.5 space-y-3.5 border-t border-slate-100 pt-3 animate-fade-in">
                        <div>
                          <label className="block mb-1 uppercase tracking-wider text-[10px] text-blue-600">Custom Duty Type Name</label>
                          <input 
                            type="text" 
                            value={customDutyTypeText}
                            onChange={(e) => setCustomDutyTypeText(e.target.value)}
                            placeholder="e.g. Evening Shift"
                            className="w-full border border-blue-200 rounded-lg px-3 py-2 text-sm text-slate-805 focus:outline-none focus:border-blue-500 font-semibold"
                            required
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox"
                            id="customShiftNight"
                            checked={shiftNight}
                            onChange={(e) => setShiftNight(e.target.checked)}
                            className="w-4 h-4 text-blue-600 border-slate-300 rounded cursor-pointer"
                          />
                          <label htmlFor="customShiftNight" className="uppercase tracking-wider text-[10px] text-slate-500 cursor-pointer select-none">
                            Qualifies as Night Duty? (For Allowance)
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="pt-2 flex justify-end gap-2.5">
                    {editingShiftRuleId !== null && (
                      <button 
                        type="button" 
                        onClick={handleCancelEditShift}
                        className="px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 uppercase text-[10px]"
                      >
                        Cancel
                      </button>
                    )}
                    <button 
                      type="submit" 
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white uppercase text-[10px]"
                    >
                      {editingShiftRuleId ? "Save Updates" : "Create Shift Rule"}
                    </button>
                  </div>
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
                        <th className="py-2.5 px-5 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                      {shifts.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400 font-bold">
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
                                {s.duty_type ? (
                                  s.is_night_duty ? (
                                    <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-bold text-[9px] uppercase">{s.duty_type}</span>
                                  ) : (
                                    <span className={`px-2 py-0.5 rounded font-bold text-[9px] uppercase ${
                                      s.duty_type === 'General / Day Shift' 
                                        ? 'bg-slate-100 text-slate-500' 
                                        : 'bg-indigo-50 text-indigo-600 border border-indigo-200/50'
                                    }`}>{s.duty_type}</span>
                                  )
                                ) : (
                                  s.is_night_duty ? (
                                    <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-700 font-bold text-[9px] uppercase">Night Shift</span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-500 font-bold text-[9px] uppercase">General / Day</span>
                                  )
                                )}
                              </td>
                              <td className="py-3 px-5 text-center flex justify-center items-center gap-1.5">
                                <button 
                                  onClick={() => handleEditShiftClick(s)} 
                                  title="Edit Shift Rule"
                                  className="p-1.5 rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200/50 shadow-sm transition hover:scale-105 active:scale-95 cursor-pointer"
                                >
                                  <Edit size={11} />
                                </button>
                                <button 
                                  onClick={() => handleDeleteShiftClick(s.id)} 
                                  title="Delete Shift Rule"
                                  className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200/50 shadow-sm transition hover:scale-105 active:scale-95 cursor-pointer"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ROSTER PLANNER */}
          {activeTab === 'roster' && (
            <div className="page-transition lg:col-span-3 glass-panel p-6 rounded-xl border border-slate-200 bg-white shadow-sm flex flex-col space-y-6">
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
                      className="px-4 py-2 bg-theme-primary hover-bg-theme-primary text-white font-bold text-xs uppercase tracking-wider transition cursor-pointer rounded-lg h-[34px] shadow-sm"
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
            <div className="page-transition lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Add form */}
              <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
                <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider pb-3 border-b flex items-center gap-1.5">
                  <PlusCircle size={15} className="text-theme-primary" />
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
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 uppercase focus:outline-none focus-border-theme font-extrabold"
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
                      className="px-4 py-2 rounded-lg bg-theme-primary hover-bg-theme-primary text-white uppercase text-[10px] font-bold"
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
                          <td className="py-3 px-5 text-center flex justify-center items-center gap-1.5">
                            <button 
                              onClick={() => handleEditCodeClick(code)} 
                              title="Edit Code"
                              className="p-1.5 rounded-lg bg-theme-active text-theme-active hover:opacity-85 border border-theme-active/30 shadow-sm transition hover:scale-105 active:scale-95 cursor-pointer font-bold"
                            >
                              <Edit size={11} />
                            </button>
                            <button 
                              onClick={() => handleDeleteCode(code.code)} 
                              title="Delete Code"
                              className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200/50 shadow-sm transition hover:scale-105 active:scale-95 cursor-pointer font-bold"
                            >
                              <Trash2 size={11} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 6: HOLIDAY MASTER */}
          {activeTab === 'holidays' && (
            <div className="page-transition lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Form */}
              <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
                <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-1.5 pb-3 border-b">
                  <PlusCircle size={15} className="text-theme-primary" />
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
                      className="px-4 py-2 rounded-lg bg-theme-primary hover-bg-theme-primary text-white uppercase text-[10px] font-bold"
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
                            <td className="py-3 px-5 font-bold text-theme-primary">{h.applicability || 'ALL'}</td>
                            <td className="py-3 px-5 text-center flex justify-center items-center gap-1.5">
                              <button 
                                onClick={() => handleEditHoliday(h)} 
                                title="Edit Holiday"
                                className="p-1.5 rounded-lg bg-theme-active text-theme-active hover:opacity-85 border border-theme-active/30 shadow-sm transition hover:scale-105 active:scale-95 cursor-pointer"
                              >
                                <Edit size={11} />
                              </button>
                              <button 
                                onClick={() => handleDeleteHoliday(h.id!)} 
                                title="Delete Holiday"
                                className="p-1.5 rounded-lg bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200/50 shadow-sm transition hover:scale-105 active:scale-95 cursor-pointer"
                              >
                                <Trash2 size={11} />
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 7: BACKUPS & RECOVERY */}
          {activeTab === 'backups' && (
            <div className="page-transition lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* SQLite Health metrics check */}
              <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
                <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider pb-3 border-b flex items-center gap-1.5">
                  <Database size={15} className="text-theme-primary" />
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
            </div>
          )}

          {/* TAB 8: AUDIT TRAIL LOGS */}
          {activeTab === 'audit' && (
            <div className="page-transition lg:col-span-3 glass-panel rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col overflow-hidden">
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

          {activeTab === 'updates' && (
            <div className="page-transition lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left Column: Version & Info */}
              <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4 animate-scale-up">
                <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider pb-3 border-b flex items-center gap-1.5">
                  <RefreshCw size={15} className="text-blue-600 animate-spin" style={{ animationDuration: '3s' }} />
                  Software Update Center
                </h3>
                
                <div className="space-y-4 text-xs font-semibold">
                  <div className="flex justify-between items-center py-2 border-b border-slate-50">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Installed Version:</span>
                    <span className="font-mono text-slate-850 bg-slate-100 px-2 py-0.5 rounded font-bold">{currentVersion}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-50">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Release Channel:</span>
                    <span className="font-bold text-emerald-600">Stable (Production)</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-slate-50">
                    <span className="text-slate-400 font-bold uppercase tracking-wider text-[9px]">Hosting Platform:</span>
                    <span className="font-mono text-slate-500">GitHub Releases</span>
                  </div>
                </div>

                <button
                  onClick={checkSystemUpdates}
                  disabled={updateStatus === 'checking'}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase tracking-wider transition cursor-pointer shadow-sm shadow-blue-500/10"
                >
                  <RefreshCw size={14} className={updateStatus === 'checking' ? 'animate-spin' : ''} />
                  {updateStatus === 'checking' ? "Checking GitHub..." : "Check for Updates"}
                </button>
              </div>

              {/* Right Column: Update details (spans 2 columns) */}
              <div className="lg:col-span-2 glass-panel rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col p-5 space-y-4 animate-scale-up">
                <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider pb-3 border-b">
                  Release Information
                </h3>
                
                {updateStatus === 'idle' && (
                  <div className="h-48 flex flex-col items-center justify-center text-center text-slate-400">
                    <RefreshCw size={32} className="text-slate-200 mb-2 animate-pulse" />
                    <p className="text-xs font-bold">No update search triggered yet.</p>
                    <p className="text-[10px] text-slate-500 mt-1">Click the button on the left to verify with the GitHub releases repository.</p>
                  </div>
                )}

                {updateStatus === 'latest' && (
                  <div className="h-48 flex flex-col items-center justify-center text-center text-emerald-600 bg-emerald-50/30 rounded-xl border border-emerald-100 p-4">
                    <CheckCircle size={32} className="text-emerald-500 mb-2 animate-bounce" />
                    <p className="text-xs font-bold uppercase tracking-wider">System is up to date!</p>
                    <p className="text-[10px] text-slate-500 mt-1">You are currently running the latest version of KM S&T ERP ({currentVersion}).</p>
                  </div>
                )}

                {updateStatus === 'available' && latestRelease && (
                  <div className="space-y-4">
                    <div className="p-3 bg-blue-50/50 rounded-lg border border-blue-200 flex justify-between items-center animate-fade-in">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-extrabold text-blue-700 uppercase tracking-wide">New Update Available!</span>
                        <span className="text-[10px] text-slate-500 font-bold">{latestRelease.name} ({latestRelease.tag_name})</span>
                      </div>
                      
                      {downloadStateText === 'idle' && (
                        <div className="flex gap-2">
                          <a 
                            href={latestRelease.html_url} 
                            target="_blank" 
                            rel="noreferrer"
                            className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold text-[10px] uppercase tracking-wider transition text-center"
                          >
                            GitHub Page
                          </a>
                          <button 
                            onClick={startUpdateDownload}
                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs uppercase tracking-wider transition shadow-md shadow-blue-500/10 text-center cursor-pointer"
                          >
                            Download Update
                          </button>
                        </div>
                      )}
                    </div>

                    {downloadStateText === 'downloading' && (
                      <div className="flex flex-col gap-2.5 p-4 bg-blue-50/30 rounded-xl border border-blue-100 animate-fade-in">
                        <div className="flex justify-between items-center text-xs font-bold text-blue-700">
                          <span className="flex items-center gap-1.5">
                            <RefreshCw size={14} className="animate-spin" />
                            Downloading standalone update bundle...
                          </span>
                          <span>{downloadProgress}%</span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-blue-600 transition-all duration-300 rounded-full"
                            style={{ width: `${downloadProgress}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {downloadStateText === 'completed' && (
                      <div className="flex flex-col gap-2.5 p-4 bg-emerald-50/50 rounded-xl border border-emerald-250 text-emerald-800 animate-fade-in">
                        <div className="flex items-center gap-2">
                          <CheckCircle size={18} className="text-emerald-600" />
                          <span className="text-xs font-bold">Successfully Downloaded Update!</span>
                        </div>
                        <p className="text-[10px] text-slate-650 font-semibold leading-relaxed">
                          The updated standalone executable <strong>{latestRelease.tag_name}</strong> was saved to your Downloads folder:
                          <code className="bg-white border border-slate-200 text-slate-800 font-mono px-2 py-1 rounded text-[9.5px] mt-1.5 block select-all">
                            {downloadPath}
                          </code>
                        </p>
                        <p className="text-[10px] text-amber-700 font-bold mt-1 bg-amber-50 border border-amber-200 p-2 rounded-lg">
                          ⚠️ Action Required: Please exit this application, delete or rename the old executable, copy the new file from your Downloads folder, and run the new executable to launch.
                        </p>
                      </div>
                    )}

                    {downloadStateText === 'error' && (
                      <div className="flex flex-col gap-2 p-4 bg-rose-50/50 rounded-xl border border-rose-250 text-rose-850 animate-fade-in">
                        <span className="text-xs font-bold">Download Failed</span>
                        <p className="text-[10px] text-slate-505 font-semibold">{downloadError || "An error occurred while downloading update files."}</p>
                        <button 
                          onClick={startUpdateDownload}
                          className="mt-1 self-start px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded text-[10px] font-bold uppercase transition cursor-pointer shadow-md"
                        >
                          Retry Download
                        </button>
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">
                        <span>Release Log</span>
                        <span>Date: {latestRelease.published_at}</span>
                      </div>
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-[180px] overflow-y-auto font-mono text-[10px] leading-relaxed text-slate-700 whitespace-pre-wrap">
                        {latestRelease.body || "No release notes provided."}
                      </div>
                    </div>
                  </div>
                )}

                {updateStatus === 'error' && (
                  <div className="h-48 flex flex-col items-center justify-center text-center text-rose-600 bg-rose-50/30 rounded-xl border border-rose-100 p-4">
                    <AlertTriangle size={32} className="text-rose-500 mb-2" />
                    <p className="text-xs font-bold uppercase tracking-wider">Update Check Failed</p>
                    <p className="text-[10px] text-slate-500 mt-1">Could not connect to GitHub API. Please check your internet connection and try again.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'settings' && (
            <div className="page-transition glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4 animate-scale-up">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider pb-3 border-b flex items-center gap-1.5">
                <Settings size={15} className="text-blue-600" />
                {getTranslation(lang, 'System Preferences & Settings')}
              </h3>
              
              <div className="space-y-4 text-xs font-bold text-slate-600 max-w-sm">
                <div>
                  <label className="block mb-1.5 uppercase tracking-wider text-[10px] text-slate-500">{getTranslation(lang, 'Preferred Default Section (My Section)')}</label>
                  <select 
                    value={mySection}
                    onChange={(e) => {
                      const val = e.target.value;
                      setMySection(val);
                      localStorage.setItem('erp_my_section', val);
                      showToast("Preferred default section updated successfully.", "success");
                      window.dispatchEvent(new Event('erp_my_section_changed'));
                    }}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 cursor-pointer focus:outline-none focus:border-blue-500"
                  >
                    {sections.map(sec => (
                      <option key={sec.id} value={sec.section_code}>{sec.section_code} - {sec.section_name}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed font-semibold">
                    Choosing a section here sets it as your default "My Section". The ERP will load this section by default on startup.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'roster-rules' && (
            <div className="page-transition lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-6 animate-scale-up">
              {/* Form Column */}
              <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
                <h3 className="font-bold text-slate-855 text-xs uppercase tracking-wider border-b pb-2 flex items-center gap-1.5">
                  <PlusCircle size={15} className="text-blue-600" />
                  Define Roster Rotation Rule
                </h3>
                <form onSubmit={handleAddRosterRule} className="space-y-4 text-xs font-bold text-slate-600">
                  <div>
                    <label className="block mb-1 uppercase tracking-wider text-[10px]">Rule Name</label>
                    <input 
                      type="text" 
                      value={ruleName}
                      onChange={(e) => setRuleName(e.target.value)}
                      placeholder="e.g. KKVS Rotating Cycle"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block mb-1 uppercase tracking-wider text-[10px]">Rotation Pattern (Comma-Separated)</label>
                    <textarea 
                      value={rulePattern}
                      onChange={(e) => setRulePattern(e.target.value)}
                      placeholder="e.g. E,E,E,E,E,E,E,R,M,M,M,M,N,N,N,N,N,N,N,R,R"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-805 focus:outline-none focus:border-blue-500 font-mono h-24 resize-none uppercase"
                      required
                    />
                    <p className="text-[9.5px] text-slate-400 mt-1 leading-normal font-semibold">
                      Input shift symbols separated by commas. Valid symbols: G (General), M (Morning), E (Evening), N (Night), R (Rest).
                    </p>
                  </div>
                  <div className="pt-2 flex justify-end">
                    <button 
                      type="submit" 
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white uppercase text-[10px] cursor-pointer shadow-sm font-bold flex items-center gap-1.5"
                    >
                      <Save size={13} />
                      Save Rule
                    </button>
                  </div>
                </form>
              </div>

              {/* Roster Rules List Column */}
              <div className="lg:col-span-2 glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm space-y-4">
                <h3 className="font-bold text-slate-855 text-xs uppercase tracking-wider border-b pb-2 flex items-center gap-1.5">
                  <Sliders size={15} className="text-blue-600" />
                  Roster Rotation Rules List
                </h3>
                {rosterRules.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 font-semibold text-xs">
                    No roster rotation rules registered yet.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-slate-455 uppercase tracking-widest text-[9.5px]">
                          <th className="py-2 px-3">Rule Name</th>
                          <th className="py-2 px-3">Pattern</th>
                          <th className="py-2 px-3 text-center">Cycle Length</th>
                          <th className="py-2 px-3 text-center">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rosterRules.map(rule => (
                          <tr key={rule.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                            <td className="py-3 px-3 font-extrabold text-slate-800">{rule.name}</td>
                            <td className="py-3 px-3 font-mono font-bold text-slate-600 break-all select-all">
                              {rule.pattern}
                            </td>
                            <td className="py-3 px-3 text-center font-bold text-blue-650">
                              {rule.pattern.split(',').length} Days
                            </td>
                            <td className="py-3 px-3 text-center">
                              <button
                                onClick={() => handleDeleteRosterRule(rule.id)}
                                className="text-red-500 hover:text-red-700 font-bold bg-transparent border-none cursor-pointer p-1"
                                title="Delete Rule"
                              >
                                <Trash2 size={15} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Schedule Configuration Modal (Relocated to root level for viewport centering and backdrop blur) */}
          {isScheduleModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-slate-900/40 animate-fade-in">
              <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-scale-up">
                <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                  <h3 className="font-black text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                    <CalendarDays size={16} className="text-blue-600" />
                    Roster Schedule Configuration
                  </h3>
                  <button 
                    type="button"
                    onClick={() => setIsScheduleModalOpen(false)} 
                    className="text-slate-400 hover:text-slate-650 font-bold text-sm transition"
                  >
                    ✕
                  </button>
                </div>
                
                <div className="p-5 space-y-4 text-xs font-bold text-slate-700">
                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase text-slate-400 tracking-wider">Schedule Type</label>
                    <div className="grid grid-cols-5 gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200">
                      {([ 'simple', 'rotating-3week', 'rotating', 'flexible', 'custom-rotation' ] as const).map(type => (
                        <button
                          key={type}
                          type="button"
                          onClick={() => {
                            setScheduleType(type);
                            if (type === 'rotating-3week' && activeRotatingWeek === 'week4') {
                              setActiveRotatingWeek('week1');
                            }
                          }}
                          className={`py-1.5 rounded text-[8px] font-extrabold uppercase transition-all duration-200 text-center ${scheduleType === type ? 'bg-blue-600 text-white shadow' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                          {type === 'simple' && '1-Week'}
                          {type === 'rotating-3week' && '3-Week'}
                          {type === 'rotating' && '4-Week'}
                          {type === 'flexible' && 'Flexible'}
                          {type === 'custom-rotation' && 'Rule'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {scheduleType === 'flexible' && (
                    <div className="p-4 bg-blue-50/50 border border-blue-200 rounded-lg text-slate-650 text-[10px] font-semibold leading-relaxed">
                      <strong>Flexible / No Fixed Roster Mode:</strong> This employee (e.g. SSE/JE/IC) does not follow a strict weekly or rotating duty cycle. Shift rules will be left blank by default in the attendance sheet and can be manually inputted.
                    </div>
                  )}

                  {scheduleType === 'custom-rotation' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Roster Rotation Rule</label>
                          <select
                            value={selectedRuleId || ''}
                            onChange={(e) => setSelectedRuleId(e.target.value ? Number(e.target.value) : null)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-850 cursor-pointer focus:outline-none focus:border-blue-500 font-semibold"
                            required
                          >
                            <option value="">-- Select Rule --</option>
                            {rosterRules.map(r => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Roster Anchor Date</label>
                          <input 
                            type="date"
                            value={empAnchorDate}
                            onChange={(e) => setEmpAnchorDate(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 cursor-pointer focus:outline-none focus:border-blue-500 font-semibold"
                            required
                          />
                        </div>
                      </div>
                      {selectedRuleId && (() => {
                        const r = rosterRules.find(rule => rule.id === Number(selectedRuleId));
                        if (!r) return null;
                        return (
                          <div className="p-3.5 bg-blue-50/50 border border-blue-200 rounded-xl space-y-1.5 text-[10px]">
                            <div className="flex justify-between items-center text-slate-500 font-bold uppercase tracking-wider">
                              <span>Rule Pattern Details</span>
                              <span className="text-blue-600 bg-blue-100/80 px-2 py-0.5 rounded-full text-[8.5px] font-extrabold uppercase">
                                {r.pattern.split(',').length} Days Cycle
                              </span>
                            </div>
                            <p className="text-slate-700 font-bold leading-normal font-mono break-all bg-white/70 p-2 rounded-lg border border-slate-100">
                              {r.pattern}
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {(scheduleType === 'rotating' || scheduleType === 'rotating-3week') && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Roster Anchor Date</label>
                        <input 
                          type="date"
                          value={empAnchorDate}
                          onChange={(e) => setEmpAnchorDate(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 cursor-pointer focus:outline-none focus:border-blue-500 font-semibold"
                          required={scheduleType === 'rotating' || scheduleType === 'rotating-3week'}
                        />
                      </div>
                      <div className="flex items-end text-[9px] text-slate-500 italic pb-2 font-medium">
                        This anchor date determines when "Week 1" cycle begins.
                      </div>
                    </div>
                  )}

                  {scheduleType !== 'flexible' && scheduleType !== 'custom-rotation' && (
                    <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                      {scheduleType === 'simple' ? (
                        <div className="space-y-1">
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Days Shift Settings</span>
                          <div className="grid grid-cols-4 gap-2">
                            {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map(day => (
                              <div key={day} className="flex flex-col gap-0.5">
                                <label className="text-[9px] font-bold text-slate-400 truncate">{day.slice(0, 3)}</label>
                                <select
                                  value={empWeeklySchedule[day] || 'G'}
                                  onChange={(e) => setEmpWeeklySchedule(prev => ({
                                    ...prev,
                                    [day]: e.target.value
                                  }))}
                                  className="border border-slate-200 rounded px-1.5 py-1 text-[10px] bg-white font-semibold text-slate-800 focus:outline-none cursor-pointer"
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
                      ) : (
                        <div className="space-y-3">
                          {/* Week Tabs */}
                          <div className="flex gap-1 border-b border-slate-200 pb-1">
                            {(scheduleType === 'rotating-3week' ? ['week1', 'week2', 'week3'] : ['week1', 'week2', 'week3', 'week4']).map(wk => (
                              <button
                                key={wk}
                                type="button"
                                onClick={() => setActiveRotatingWeek(wk as any)}
                                className={`px-3 py-1 rounded text-[9px] font-extrabold uppercase ${activeRotatingWeek === wk ? 'bg-blue-600 text-white shadow-xs' : 'bg-slate-200/60 text-slate-500 hover:text-slate-800'}`}
                              >
                                {wk.replace('week', 'W')}
                              </button>
                            ))}
                          </div>
                          
                          <div className="grid grid-cols-4 gap-2">
                            {getWeekdaysStartingFrom(empAnchorDate).map(day => (
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
                                  className="border border-slate-200 rounded px-1.5 py-1 text-[10px] bg-white font-semibold text-slate-800 focus:outline-none cursor-pointer"
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
                      )}
                    </div>
                  )}

                  {/* Custom Night Weeks (Override) */}
                  <div className="border-t border-slate-100 pt-3 space-y-2">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Custom Schedule Overrides</span>
                    <div className="grid grid-cols-4 gap-1.5 items-end">
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 truncate block mb-1">From Date</label>
                        <input 
                          type="date"
                          value={overrideFrom}
                          onChange={(e) => setOverrideFrom(e.target.value)}
                          className="w-full border border-slate-200 bg-white rounded px-2 py-1 text-[10px] focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 truncate block mb-1">To Date</label>
                        <input 
                          type="date"
                          value={overrideTo}
                          onChange={(e) => setOverrideTo(e.target.value)}
                          className="w-full border border-slate-200 bg-white rounded px-2 py-1 text-[10px] focus:outline-none focus:border-blue-500"
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-bold text-slate-400 truncate block mb-1">Override Shift</label>
                        <select
                          value={overrideShift}
                          onChange={(e) => setOverrideShift(e.target.value)}
                          className="w-full border border-slate-200 bg-white rounded px-2 py-1 text-[10px] focus:outline-none focus:border-blue-500 font-semibold cursor-pointer"
                        >
                          <option value="N">N (Night)</option>
                          <option value="E">E (Eve)</option>
                          <option value="G">G (Gen)</option>
                          <option value="M">M (Morn)</option>
                        </select>
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
                          setCustomNightWeeks(prev => [...prev, { from_date: overrideFrom, to_date: overrideTo, shift: overrideShift }]);
                          setOverrideFrom('');
                          setOverrideTo('');
                          setOverrideShift('N');
                        }}
                        className="bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold py-1.5 px-2 uppercase shadow-sm cursor-pointer"
                      >
                        Add Override
                      </button>
                    </div>

                    {customNightWeeks.length > 0 && (
                      <div className="max-h-24 overflow-y-auto bg-slate-100 border border-slate-200 rounded-lg p-2 space-y-1">
                        {customNightWeeks.map((w, index) => (
                          <div key={index} className="flex justify-between items-center text-[10px] font-semibold text-slate-700 border-b border-slate-200/50 pb-0.5">
                            <span>{w.from_date} to {w.to_date} ({w.shift || 'N'})</span>
                            <button
                              type="button"
                              onClick={() => setCustomNightWeeks(prev => prev.filter((_, idx) => idx !== index))}
                              className="text-red-500 hover:text-red-700 font-extrabold cursor-pointer bg-transparent border-none"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="pt-4 border-t border-slate-150 flex justify-end gap-2 text-xs">
                    <button 
                      type="button" 
                      onClick={() => setIsScheduleModalOpen(false)} 
                      className="px-4 py-2 border border-slate-200 rounded-lg text-slate-650 hover:bg-slate-50 font-bold transition cursor-pointer"
                    >
                      Apply & Close
                    </button>
                  </div>
                </div>
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

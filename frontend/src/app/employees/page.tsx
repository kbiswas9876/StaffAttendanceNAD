'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { createPortal } from 'react-dom';
import {
  Users,
  PlusCircle,
  Key,
  Calendar,
  ChevronRight,
  ShieldAlert,
  Clock,
  Database,
  FileText,
  MapPin,
  Milestone,
  ArrowLeft,
  ChevronLeft,
  CheckCircle,
  Briefcase,
  Layers,
  Sparkles,
  Inbox,
  Edit,
  GripVertical,
  ArrowLeftRight,
  CalendarDays,
  TrendingUp,
  Sun,
  Moon,
  Coffee,
  Sunrise,
  Sunset
} from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  getEmployees,
  createEmployee,
  updateEmployee,
  deleteEmployee,
  getSections,
  getEmployeeById,
  getLeaveBank,
  getEmployeeAttendanceLogs,
  getSpecialEvents,
  Section,
  Employee,
  LeaveBank,
  AttendanceLog,
  SpecialEvent,
  updateLeaveBank,
  getWeeklyScheduleDefault,
  reorderEmployees,
  getCRLedger,
  CRLedgerEntry,
  getRosterRules,
  RosterRule,
  parseLocalDate
} from '../../lib/api';
import { getTranslation } from '../../lib/translations';
import AdminAuthModal from '../components/AdminAuthModal';
import CustomSelect from '../components/CustomSelect';
import CustomDatePicker from '../components/CustomDatePicker';

// --- EMPLOYEE PROFILE 360 COMPONENT ---
interface ProfileProps {
  empId: number;
  onClose: () => void;
}

const getWeekdaysStartingFrom = (anchorDateStr: string) => {
  const defaultDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  if (!anchorDateStr) return defaultDays;
  try {
    const date = parseLocalDate(anchorDateStr);
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

export function EmployeeProfile360({ empId, onClose }: ProfileProps) {
  const [isClient, setIsClient] = useState(false);
  useEffect(() => {
    setIsClient(true);
  }, []);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [leaveBank, setLeaveBank] = useState<LeaveBank | null>(null);
  const [attendance, setAttendance] = useState<AttendanceLog[]>([]);
  const [specialEvents, setSpecialEvents] = useState<SpecialEvent[]>([]);
  const [crLedger, setCrLedger] = useState<CRLedgerEntry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedYear, setSelectedYear] = useState(2026);
  const [lang, setLang] = useState<'en' | 'bn' | 'hi'>('en');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedLang = (localStorage.getItem('erp_lang') || 'en') as 'en' | 'bn' | 'hi';
      setLang(savedLang);
    }
    const handleLangChange = () => {
      if (typeof window !== 'undefined') {
        const savedLang = (localStorage.getItem('erp_lang') || 'en') as 'en' | 'bn' | 'hi';
        setLang(savedLang);
      }
    };
    window.addEventListener('erp_lang_changed', handleLangChange);
    return () => window.removeEventListener('erp_lang_changed', handleLangChange);
  }, []);

  // Edit leave balances states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTotalCl, setEditTotalCl] = useState(8);
  const [editTotalLap, setEditTotalLap] = useState(30);
  const [editUsedCl, setEditUsedCl] = useState(0);
  const [editUsedLap, setEditUsedLap] = useState(0);
  const [editAccruedCr, setEditAccruedCr] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  // Edit schedule states
  const [isScheduleEditOpen, setIsScheduleEditOpen] = useState(false);
  const [scheduleType, setScheduleType] = useState<'simple' | 'rotating' | 'rotating-3week' | 'flexible' | 'custom-rotation'>('simple');
  const [rosterRules, setRosterRules] = useState<RosterRule[]>([]);
  const [selectedRuleId, setSelectedRuleId] = useState<number | null>(null);
  const [empRestDay, setEmpRestDay] = useState('Wednesday');
  const [empAnchorDate, setEmpAnchorDate] = useState('2026-06-01');
  const [empWeeklySchedule, setEmpWeeklySchedule] = useState<{ [day: string]: string }>({});
  const [rotatingSchedule, setRotatingSchedule] = useState<{
    [key: string]: { [day: string]: string };
  }>({
    week1: {},
  });
  const [activeRotatingWeek, setActiveRotatingWeek] = useState<string>('week1');
  const [customNightWeeks, setCustomNightWeeks] = useState<{ from_date: string; to_date: string; shift?: string }[]>([]);
  const [overrideFrom, setOverrideFrom] = useState('');
  const [overrideTo, setOverrideTo] = useState('');
  const [overrideShift, setOverrideShift] = useState('N');

  const getRotatingWeeks = () => {
    return Object.keys(rotatingSchedule)
      .filter(k => k.startsWith('week'))
      .sort((a, b) => {
        const numA = parseInt(a.replace('week', ''), 10);
        const numB = parseInt(b.replace('week', ''), 10);
        return numA - numB;
      });
  };

  const addWeek = () => {
    const weeks = getRotatingWeeks();
    const nextWeekNum = weeks.length + 1;
    const nextWeekKey = `week${nextWeekNum}`;
    setRotatingSchedule(prev => ({
      ...prev,
      [nextWeekKey]: getWeeklyScheduleDefault(empRestDay)
    }));
    setActiveRotatingWeek(nextWeekKey);
  };

  const removeWeek = (weekKey: string) => {
    const weeks = getRotatingWeeks();
    if (weeks.length <= 1) return;
    const targetIndex = parseInt(weekKey.replace('week', ''), 10);
    
    const newSchedule: typeof rotatingSchedule = {};
    let newIdx = 1;
    weeks.forEach(w => {
      const idx = parseInt(w.replace('week', ''), 10);
      if (idx !== targetIndex) {
        newSchedule[`week${newIdx}`] = rotatingSchedule[w];
        newIdx++;
      }
    });
    
    setRotatingSchedule(newSchedule);
    const activeNum = parseInt(activeRotatingWeek.replace('week', ''), 10);
    if (activeNum === targetIndex || activeNum > weeks.length - 1) {
      setActiveRotatingWeek(`week${Math.max(1, targetIndex - 1)}`);
    } else if (activeNum > targetIndex) {
      setActiveRotatingWeek(`week${activeNum - 1}`);
    }
  };

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pendingAuthAction, setPendingAuthAction] = useState<'edit-balances' | 'edit-pattern' | null>(null);

  const checkAuthAndExecute = (action: 'edit-balances' | 'edit-pattern') => {
    const isAuthenticated = sessionStorage.getItem('admin_authenticated') === 'true' || localStorage.getItem('admin_authenticated') === 'true';
    if (isAuthenticated) {
      if (action === 'edit-balances') {
        openEditModalActual();
      } else {
        openScheduleEditModalActual();
      }
    } else {
      setPendingAuthAction(action);
      setIsAuthModalOpen(true);
    }
  };

  const handleAuthSuccess = () => {
    if (pendingAuthAction === 'edit-balances') {
      openEditModalActual();
    } else if (pendingAuthAction === 'edit-pattern') {
      openScheduleEditModalActual();
    }
    setPendingAuthAction(null);
  };

  const openEditModal = () => checkAuthAndExecute('edit-balances');
  const openScheduleEditModal = () => checkAuthAndExecute('edit-pattern');

  const openEditModalActual = () => {
    if (leaveBank) {
      setEditTotalCl(leaveBank.total_cl);
      setEditTotalLap(leaveBank.total_lap);
      setEditUsedCl(leaveBank.used_cl);
      setEditUsedLap(leaveBank.used_lap);
      setEditAccruedCr(leaveBank.accrued_cr);
    }
    setIsEditModalOpen(true);
  };

  const handleUpdateBalances = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateLeaveBank({
        emp_id: empId,
        year: selectedYear,
        total_cl: Number(editTotalCl),
        total_lap: Number(editTotalLap),
        used_cl: Number(editUsedCl),
        used_lap: Number(editUsedLap),
        accrued_cr: Number(editAccruedCr)
      });
      const bank = await getLeaveBank(empId, selectedYear);
      setLeaveBank(bank);
      setIsEditModalOpen(false);
    } catch (err) {
      console.error(err);
      showToast("Failed to update leave balances", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const openScheduleEditModalActual = () => {
    if (!employee) return;
    setEmpRestDay(employee.default_rest_day);
    const sched = employee.weekly_schedule as any;
    if (sched && sched.type === 'rotating') {
      setScheduleType('rotating');
      setEmpAnchorDate(sched.anchor_date || '2026-06-01');
      
      const loadedSchedule: any = {};
      let numWeeks = 0;
      while (sched[`week${numWeeks + 1}`]) {
        numWeeks++;
        loadedSchedule[`week${numWeeks}`] = sched[`week${numWeeks}`];
      }
      if (numWeeks === 0) {
        loadedSchedule['week1'] = getWeeklyScheduleDefault(employee.default_rest_day);
      }
      setRotatingSchedule(loadedSchedule);
      setActiveRotatingWeek('week1');
      setCustomNightWeeks(sched.custom_night_weeks || []);
    } else if (sched && sched.type === 'rotating-3week') {
      setScheduleType('rotating');
      setEmpAnchorDate(sched.anchor_date || '2026-06-01');
      setRotatingSchedule({
        week1: sched.week1 || getWeeklyScheduleDefault(employee.default_rest_day),
        week2: sched.week2 || getWeeklyScheduleDefault(employee.default_rest_day),
        week3: sched.week3 || getWeeklyScheduleDefault(employee.default_rest_day),
      });
      setActiveRotatingWeek('week1');
      setCustomNightWeeks(sched.custom_night_weeks || []);
    } else if (sched && sched.type === 'flexible') {
      setScheduleType('flexible');
      setEmpAnchorDate('2026-06-01');
      setRotatingSchedule({
        week1: getWeeklyScheduleDefault(employee.default_rest_day),
      });
      setActiveRotatingWeek('week1');
      setCustomNightWeeks(sched.custom_night_weeks || []);
    } else if (sched && sched.type === 'custom-rotation') {
      setScheduleType('custom-rotation');
      setEmpAnchorDate(sched.anchor_date || '2026-06-01');
      const matchedRule = rosterRules.find(r => r.name === sched.rule_name);
      setSelectedRuleId(matchedRule ? matchedRule.id : null);
      setCustomNightWeeks(sched.custom_night_weeks || []);
    } else {
      setScheduleType('rotating');
      setEmpAnchorDate('2026-06-01');
      const baseSched = { ...((sched as { [day: string]: string }) || getWeeklyScheduleDefault(employee.default_rest_day)) };
      delete baseSched.type;
      delete baseSched.custom_night_weeks;
      setRotatingSchedule({
        week1: baseSched
      });
      setActiveRotatingWeek('week1');
      setCustomNightWeeks(sched?.custom_night_weeks || []);
    }
    setOverrideFrom('');
    setOverrideTo('');
    setOverrideShift('N');
    setIsScheduleEditOpen(true);
  };

  const handleUpdateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee) return;

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

    setIsSaving(true);

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
            : (() => {
                const payload: any = {
                  type: 'rotating',
                  anchor_date: empAnchorDate,
                  custom_night_weeks: customNightWeeks
                };
                getRotatingWeeks().forEach(wk => {
                  payload[wk] = rotatingSchedule[wk];
                });
                return payload;
              })();

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

    try {
      await updateEmployee({
        ...employee,
        default_rest_day: detectedRestDay,
        weekly_schedule: weeklySchedulePayload as any
      });
      showToast("Roster Schedule Pattern updated successfully!", "success");
      setIsScheduleEditOpen(false);
      loadProfileData(); // Reload employee profile details
    } catch (err) {
      console.error(err);
      showToast("Failed to update Roster Schedule Pattern.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const loadProfileData = async () => {
    setLoading(true);
    try {
      try {
        const rules = await getRosterRules();
        setRosterRules(rules);
      } catch (ruleErr) {
        console.error("Failed to load roster rules in profile view", ruleErr);
      }
      const emp = await getEmployeeById(empId);
      if (!emp) {
        setEmployee(null);
        setLoading(false);
        return;
      }
      setEmployee(emp);

      const bank = await getLeaveBank(empId, selectedYear);
      setLeaveBank(bank);

      const logs = await getEmployeeAttendanceLogs(empId, selectedYear);
      setAttendance(logs);

      const events = await getSpecialEvents();
      const empEvents = events.filter(e => e.emp_id === empId);
      setSpecialEvents(empEvents);

      const crData = await getCRLedger(empId);
      setCrLedger(crData);
    } catch (e) {
      console.error("Failed to load employee 360 profile", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (empId) {
      loadProfileData();
    }
  }, [empId, selectedYear]);

  if (loading) {
    return (
      <div className="h-[400px] flex items-center justify-center text-sm font-semibold text-slate-400">
        Loading employee 360° profile...
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="space-y-4">
        <button onClick={onClose} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-[var(--theme-icon-bg)] transition cursor-pointer">
          <ArrowLeft size={14} /> Back to Directory
        </button>
        <div className="glass-panel p-12 text-center rounded-xl bg-white border border-slate-200">
          <Inbox className="mx-auto text-slate-300 mb-2" size={32} />
          <p className="text-sm font-bold text-slate-500">Employee not found on system.</p>
        </div>
      </div>
    );
  }

  // Group attendance log
  const attendanceMap: { [date: string]: string } = {};
  attendance.forEach(log => {
    attendanceMap[log.date] = log.status;
  });

  // Compile timeline journey blocks
  const timelineJourney: { date: string; title: string; desc: string; type: 'milestone' | 'event' | 'leave' }[] = [];

  if (employee.joining_date) {
    timelineJourney.push({
      date: employee.joining_date,
      title: "Joined Metro Railway Kolkata S&T",
      desc: `Enrolled as ${employee.designation} in section ${employee.section_code} at level ${employee.level}`,
      type: 'milestone'
    });
  }

  specialEvents.forEach(evt => {
    timelineJourney.push({
      date: evt.from_date,
      title: `Event: ${evt.event_type}`,
      desc: `Order: ${evt.order_number} | Details/Location: ${evt.location} (Duration until ${evt.to_date})`,
      type: 'event'
    });
  });

  attendance
    .filter(a => ['CL', 'LAP', 'Sick', 'SCL'].includes(a.status))
    .forEach(a => {
      timelineJourney.push({
        date: a.date,
        title: `Leave Taken: ${a.status}`,
        desc: a.remarks || `Roster marked as ${a.status} leave`,
        type: 'leave'
      });
    });

  timelineJourney.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const getStatusColor = (status: string) => {
    if (!status) return 'bg-white hover:bg-slate-50 text-slate-300 border border-slate-200/60';
    const colors: { [key: string]: string } = {
      'P': 'bg-emerald-100 hover:bg-emerald-250 text-emerald-800 border border-emerald-300',
      'P/N': 'bg-violet-100 hover:bg-violet-200 text-violet-805 border border-violet-300',
      'R': 'bg-slate-105 hover:bg-slate-200 text-slate-500 border border-slate-200',
      'CR': 'bg-sky-100 hover:bg-sky-200 text-sky-800 border border-sky-300',
      'CL': 'bg-amber-100 hover:bg-amber-200 text-amber-805 border border-amber-305',
      'LAP': 'bg-orange-100 hover:bg-orange-200 text-orange-805 border border-orange-305',
      'Sick': 'bg-red-500 hover:bg-red-600 text-white border border-red-600',
      'SCL': 'bg-pink-100 hover:bg-pink-200 text-pink-800 border border-pink-305',
      'PH': 'bg-yellow-100 hover:bg-yellow-250 text-yellow-850 border border-yellow-305'
    };
    return colors[status] || 'bg-slate-50 hover:bg-slate-100 text-slate-400 border border-slate-200';
  };

  const renderHeatmap = () => {
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {months.map((mName, mIdx) => {
          const daysInMonth = new Date(selectedYear, mIdx + 1, 0).getDate();
          const firstDayOffset = new Date(selectedYear, mIdx, 1).getDay();
          const gridCells = [];

          for (let i = 0; i < (firstDayOffset === 0 ? 6 : firstDayOffset - 1); i++) {
            gridCells.push(<div key={`blank-${i}`} className="w-6 h-6 rounded bg-transparent"></div>);
          }

          for (let day = 1; day <= daysInMonth; day++) {
            const dateStr = `${selectedYear}-${String(mIdx + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const status = attendanceMap[dateStr];
            gridCells.push(
              <div
                key={dateStr}
                className={`w-6 h-6 rounded flex items-center justify-center text-[9px] font-black cursor-pointer transition ${getStatusColor(status)}`}
                title={`${dateStr}: ${status || 'No entry'}`}
              >
                {day}
              </div>
            );
          }

          return (
            <div key={mName} className="glass-panel p-3 rounded-xl flex flex-col bg-white border border-slate-150">
              <span className="text-xs font-black text-slate-700 mb-2">{mName}</span>
              <div className="grid grid-cols-7 gap-1 text-[8px] font-bold text-slate-400 text-center mb-1">
                <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span>
              </div>
              <div className="grid grid-cols-7 gap-1">
                {gridCells}
              </div>
            </div>
          );
        })}
      </div>
    );
  };
  // Dynamic shift calculation helpers (accessible by calculations and rendering)
  const getBaseRotatingShiftForDate = (dateStr: string) => {
    const s = employee?.weekly_schedule as any;
    if (!s) return null;
    if (s.type === 'flexible') return null;

    if (s.type === 'custom-rotation') {
      const pattern = s.pattern || [];
      if (pattern.length === 0) return null;
      const anchorStr = s.anchor_date || '2026-06-01';
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

    if (s.type !== 'rotating' && s.type !== 'rotating-3week') {
      const date = parseLocalDate(dateStr);
      const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
      return s[dayOfWeek] || null;
    }

    const anchorStr = s.anchor_date || '2026-06-01';
    const anchor = parseLocalDate(anchorStr);
    const target = parseLocalDate(dateStr);

    anchor.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);

    const diffTime = target.getTime() - anchor.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));

    // Determine how many weeks are configured dynamically
    let numWeeks = 0;
    while (s[`week${numWeeks + 1}`]) {
      numWeeks++;
    }
    if (numWeeks === 0) {
      numWeeks = s.type === 'rotating-3week' ? 3 : 4;
    }

    const cycleDays = numWeeks * 7;
    const cycleDay = ((diffDays % cycleDays) + cycleDays) % cycleDays;
    const weekNum = Math.floor(cycleDay / 7) + 1;
    const dayOfWeek = target.toLocaleDateString('en-US', { weekday: 'long' });
    const wk = `week${weekNum}`;
    return s[wk]?.[dayOfWeek] || null;
  };

  const getShiftForDate = (dateStr: string) => {
    const s = employee?.weekly_schedule as any;
    if (!s) return null;
    const overrides = s.custom_night_weeks;
    if (Array.isArray(overrides)) {
      const override = overrides.find(w => dateStr >= w.from_date && dateStr <= w.to_date);
      if (override) {
        const baseShift = getBaseRotatingShiftForDate(dateStr);
        if (baseShift === 'R') return 'R';
        return override.shift || 'N';
      }
    }
    return getBaseRotatingShiftForDate(dateStr);
  };

  const getLastWorkedShiftLabel = (status: string, dateStr: string) => {
    if (status === 'P/N') {
      return { label: 'Night Shift (P/N)', bg: 'bg-purple-50 text-purple-700 border-purple-200 text-[10px] font-extrabold px-2 py-0.5 rounded border' };
    }
    const schedShift = getShiftForDate(dateStr) || 'G';
    const code = schedShift.toUpperCase();
    if (code === 'M') {
      return { label: 'Morning Shift (M)', bg: 'bg-sky-50 text-sky-700 border-sky-200 text-[10px] font-extrabold px-2 py-0.5 rounded border' };
    } else if (code === 'E') {
      return { label: 'Evening Shift (E)', bg: 'bg-orange-50 text-orange-700 border-orange-200 text-[10px] font-extrabold px-2 py-0.5 rounded border' };
    } else if (code === 'N') {
      return { label: 'Night Shift (N)', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200 text-[10px] font-extrabold px-2 py-0.5 rounded border' };
    } else {
      return { label: 'General Shift (P)', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-extrabold px-2 py-0.5 rounded border' };
    }
  };

  // Presence & Duty Status Calculations
  const todayObjForDash = new Date();
  const DASHBOARD_TODAY = `${todayObjForDash.getFullYear()}-${String(todayObjForDash.getMonth() + 1).padStart(2, '0')}-${String(todayObjForDash.getDate()).padStart(2, '0')}`;
  const todayStatus = attendanceMap[DASHBOARD_TODAY] || 'No Log';

  const completedDuties = attendance.filter(log => log.date < DASHBOARD_TODAY && ['P', 'P/N'].includes(log.status));
  completedDuties.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const lastDuty = completedDuties[0] || null;

  const transfers = specialEvents.filter(evt => evt.event_type === 'Transfer');
  transfers.sort((a, b) => new Date(b.from_date).getTime() - new Date(a.from_date).getTime());

  const leaveLogs = attendance.filter(log => ['CL', 'LAP', 'Sick', 'SCL'].includes(log.status));
  leaveLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const getDutyBadgeDetails = (status: string, dateStr: string) => {
    switch (status) {
      case 'P': {
        const scheduledShift = getShiftForDate(dateStr) || 'G';
        const code = scheduledShift.toUpperCase();
        if (code === 'M') {
          return { label: 'ON DUTY (Morning Shift - M)', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold' };
        } else if (code === 'E') {
          return { label: 'ON DUTY (Evening Shift - E)', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold' };
        } else if (code === 'N' || code === 'P/N') {
          return { label: 'ON DUTY (Night Shift - N)', bg: 'bg-purple-50 text-purple-700 border-purple-200 font-bold' };
        } else {
          return { label: 'ON DUTY (General Shift - G)', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold' };
        }
      }
      case 'P/N':
        return { label: 'ON DUTY (Night Shift)', bg: 'bg-purple-50 text-purple-700 border-purple-200 font-bold' };
      case 'R':
        return { label: 'WEEKLY REST DAY', bg: 'bg-slate-100 text-slate-700 border-slate-200 font-bold' };
      case 'CR':
        return { label: 'COMPENSATORY REST', bg: 'bg-blue-50 text-blue-700 border-blue-200 font-bold' };
      case 'CL':
        return { label: 'ON CASUAL LEAVE', bg: 'bg-amber-50 text-amber-700 border-amber-200 font-bold' };
      case 'LAP':
        return { label: 'ON AVERAGE PAY LEAVE (LAP)', bg: 'bg-orange-50 text-orange-700 border-orange-200 font-bold' };
      case 'Sick':
        return { label: 'ON MEDICAL SICK LEAVE', bg: 'bg-red-50 text-red-700 border-red-200 font-bold' };
      case 'SCL':
        return { label: 'ON SPECIAL CASUAL LEAVE', bg: 'bg-rose-50 text-rose-700 border-rose-200 font-bold' };
      case 'PH':
        return { label: 'PUBLIC MASTER HOLIDAY', bg: 'bg-yellow-50 text-yellow-750 border-yellow-200 font-bold' };
      default:
        return { label: 'NO ROSTER LOG FOR TODAY', bg: 'bg-slate-50 text-slate-500 border-slate-200' };
    }
  };

  const getTodayBadge = () => {
    const loggedStatus = attendanceMap[DASHBOARD_TODAY];
    if (loggedStatus) {
      return getDutyBadgeDetails(loggedStatus, DASHBOARD_TODAY);
    }
    const scheduledShift = getShiftForDate(DASHBOARD_TODAY) || 'R';
    const code = scheduledShift.toUpperCase();
    
    if (code === 'R') {
      return { label: 'WEEKLY REST DAY (R)', bg: 'bg-slate-100 text-slate-700 border-slate-200 font-bold' };
    } else if (code === 'N' || code === 'P/N') {
      return { label: 'ON DUTY (Night Shift - N)', bg: 'bg-indigo-50 text-indigo-700 border-indigo-200 font-bold' };
    } else if (code === 'M') {
      return { label: 'ON DUTY (Morning Shift - M)', bg: 'bg-sky-50 text-sky-700 border-sky-200 font-bold' };
    } else if (code === 'E') {
      return { label: 'ON DUTY (Evening Shift - E)', bg: 'bg-orange-50 text-orange-700 border-orange-200 font-bold' };
    } else if (code === 'G' || code === 'P') {
      return { label: 'ON DUTY (General Shift - G)', bg: 'bg-emerald-50 text-emerald-700 border-emerald-200 font-bold' };
    } else {
      return { label: `ON DUTY (Shift: ${code})`, bg: 'bg-blue-50 text-blue-700 border-blue-200 font-bold' };
    }
  };

  const todayBadge = getTodayBadge();

  const renderScheduleCard = () => {
    const sched = employee?.weekly_schedule as any;
    if (!sched) return null;

    const type = sched.type || 'simple';
    const isRotating4Week = type === 'rotating';
    const isRotating3Week = type === 'rotating-3week';
    const isFlexible = type === 'flexible';
    const isCustomRotation = type === 'custom-rotation';
    const isSimple = type === 'simple';

    const anchorDate = sched.anchor_date || '2026-06-01';
    const weekdays = getWeekdaysStartingFrom(anchorDate);



    // Cycle Start Date and Length Calculations
    const todayObj = parseLocalDate(DASHBOARD_TODAY);
    todayObj.setHours(0,0,0,0);

    let cycleStartDateStr = anchorDate;
    let cycleLength = 7;
    
    if (type === 'rotating-3week') {
      cycleLength = 21;
    } else if (type === 'rotating') {
      let wkCount = 0;
      while (sched[`week${wkCount + 1}`]) {
        wkCount++;
      }
      if (wkCount === 0) wkCount = 4;
      cycleLength = wkCount * 7;
    } else if (type === 'custom-rotation') {
      cycleLength = sched.pattern?.length || 7;
    }
    
    const anchor = parseLocalDate(anchorDate);
    anchor.setHours(0,0,0,0);
    
    if (!isNaN(anchor.getTime()) && todayObj.getTime() >= anchor.getTime()) {
      const diffTime = todayObj.getTime() - anchor.getTime();
      const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
      const cycleNum = Math.floor(diffDays / cycleLength);
      const cycleStart = new Date(anchor.getTime() + cycleNum * cycleLength * 24 * 60 * 60 * 1000);
      cycleStartDateStr = `${cycleStart.getFullYear()}-${String(cycleStart.getMonth() + 1).padStart(2, '0')}-${String(cycleStart.getDate()).padStart(2, '0')}`;
    } else if (type === 'simple') {
      // Find current Monday
      const currentMonday = new Date(todayObj);
      const day = currentMonday.getDay();
      const diff = currentMonday.getDate() - day + (day === 0 ? -6 : 1);
      currentMonday.setDate(diff);
      cycleStartDateStr = `${currentMonday.getFullYear()}-${String(currentMonday.getMonth() + 1).padStart(2, '0')}-${String(currentMonday.getDate()).padStart(2, '0')}`;
    }

    let numWeeks = 0;
    if (type === 'simple') {
      numWeeks = 1;
    } else if (type === 'rotating-3week') {
      numWeeks = 3;
    } else if (type === 'rotating') {
      let wkCount = 0;
      while (sched[`week${wkCount + 1}`]) {
        wkCount++;
      }
      numWeeks = wkCount === 0 ? 4 : wkCount;
    } else if (type === 'custom-rotation') {
      numWeeks = Math.ceil(cycleLength / 7);
    }

    const renderDayPillWithDate = (dayName: string, dateStr: string, shift: string, isToday: boolean) => {
      const code = (shift || 'R').toUpperCase();
      let bgClass = '';
      let icon = null;
      let shiftLabel = '';
      let textClass = '';
      let weekdayClass = '';
      let dateClass = '';
      let iconWrapperClass = '';
      let iconColor = '';

      if (code === 'N' || code === 'P/N') {
        bgClass = 'bg-indigo-50 border-indigo-200 shadow-2xs';
        iconColor = 'text-indigo-600';
        iconWrapperClass = 'bg-indigo-100/80';
        icon = <Moon size={12} className={`${iconColor} animate-pulse fill-indigo-600/10`} />;
        shiftLabel = 'Night';
        textClass = 'text-indigo-900 font-extrabold';
        weekdayClass = 'text-indigo-950 font-black';
        dateClass = 'text-indigo-800/80 font-semibold text-[8px] mt-0.5';
      } else if (code === 'G' || code === 'P') {
        bgClass = 'bg-emerald-50 border-emerald-200 shadow-2xs';
        iconColor = 'text-emerald-600';
        iconWrapperClass = 'bg-emerald-100/80';
        icon = <Sun size={12} className={`${iconColor} fill-emerald-600/10`} />;
        shiftLabel = 'General';
        textClass = 'text-emerald-900 font-extrabold';
        weekdayClass = 'text-emerald-950 font-black';
        dateClass = 'text-emerald-800/80 font-semibold text-[8px] mt-0.5';
      } else if (code === 'M') {
        bgClass = 'bg-sky-50 border-sky-200 shadow-2xs';
        iconColor = 'text-sky-600';
        iconWrapperClass = 'bg-sky-100/80';
        icon = <Sunrise size={12} className={iconColor} />;
        shiftLabel = 'Morning';
        textClass = 'text-sky-900 font-extrabold';
        weekdayClass = 'text-sky-950 font-black';
        dateClass = 'text-sky-800/80 font-semibold text-[8px] mt-0.5';
      } else if (code === 'E') {
        bgClass = 'bg-orange-50 border-orange-200 shadow-2xs';
        iconColor = 'text-orange-600';
        iconWrapperClass = 'bg-orange-100/80';
        icon = <Sunset size={12} className={iconColor} />;
        shiftLabel = 'Evening';
        textClass = 'text-orange-900 font-extrabold';
        weekdayClass = 'text-orange-950 font-black';
        dateClass = 'text-orange-800/80 font-semibold text-[8px] mt-0.5';
      } else if (code === 'R') {
        bgClass = 'bg-slate-50 border-slate-200 shadow-2xs';
        iconColor = 'text-slate-550';
        iconWrapperClass = 'bg-slate-100';
        icon = <Coffee size={12} className={iconColor} />;
        shiftLabel = 'Rest';
        textClass = 'text-slate-600 font-extrabold';
        weekdayClass = 'text-slate-800 font-black';
        dateClass = 'text-slate-500/80 font-semibold text-[8px] mt-0.5';
      } else {
        bgClass = 'bg-blue-50 border-blue-200 shadow-2xs';
        iconColor = 'text-blue-600';
        iconWrapperClass = 'bg-blue-100/80';
        icon = <Sunrise size={12} className={iconColor} />;
        shiftLabel = code;
        textClass = 'text-blue-900 font-extrabold';
        weekdayClass = 'text-blue-950 font-black';
        dateClass = 'text-blue-800/80 font-semibold text-[8px] mt-0.5';
      }

      const dateObj = new Date(dateStr);
      const formattedDate = isNaN(dateObj.getTime()) ? '' : dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

      return (
        <div 
          key={dateStr} 
          className={`flex flex-col items-center justify-between py-2 px-1 rounded-xl border text-center transition hover:scale-[1.06] hover:shadow-md select-none relative ${bgClass} ${
            isToday 
              ? 'ring-4 ring-yellow-400 ring-offset-1 shadow-lg border-yellow-350 scale-[1.04]' 
              : 'border-slate-200'
          }`}
        >
          {isToday && (
            <span className="absolute -top-2.5 bg-yellow-400 text-slate-900 text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider shadow-xs animate-bounce">
              Today
            </span>
          )}
          <span className={`text-[8.5px] uppercase tracking-wider font-black ${weekdayClass}`}>{dayName.substring(0, 3)}</span>
          <span className={dateClass}>{formattedDate}</span>
          <div className={`w-7 h-7 rounded-full flex items-center justify-center my-1.5 shrink-0 ${iconWrapperClass}`}>
            {icon}
          </div>
          <span className={`text-[9.5px] tracking-tight leading-none truncate w-full ${textClass}`} title={shiftLabel}>{shiftLabel}</span>
        </div>
      );
    };

    // Calculate upcoming shifts starting from today date
    const todayObjForPreview = new Date();
    const today = `${todayObjForPreview.getFullYear()}-${String(todayObjForPreview.getMonth() + 1).padStart(2, '0')}-${String(todayObjForPreview.getDate()).padStart(2, '0')}`;
    const tomorrowObj = new Date(today);
    tomorrowObj.setDate(tomorrowObj.getDate() + 1);
    const tomorrow = tomorrowObj.toISOString().split('T')[0];

    const dayAfterObj = new Date(today);
    dayAfterObj.setDate(dayAfterObj.getDate() + 2);
    const dayAfter = dayAfterObj.toISOString().split('T')[0];

    const todayShift = getShiftForDate(today);
    const tomorrowShift = getShiftForDate(tomorrow);
    const dayAfterShift = getShiftForDate(dayAfter);

    const formatNextShiftText = (label: string, dateStr: string, shift: string | null) => {
      const dateLabel = new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
      if (isFlexible) {
        return (
          <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3 shadow-2xs">
            <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 shrink-0">
              <Clock size={15} />
            </div>
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-extrabold text-slate-400 block tracking-wide uppercase leading-none">{label} ({dateLabel})</span>
              <span className="text-[11px] font-black text-slate-550 mt-1 block leading-none">Manual / Flexible</span>
            </div>
          </div>
        );
      }
      const code = (shift || 'R').toUpperCase();
      let shiftText = 'Rest Shift';
      let icon = <Coffee size={15} className="text-slate-400" />;
      let bgIconClass = 'bg-slate-50 border-slate-100 text-slate-400';
      let textColor = 'text-slate-550';
      let badgeLabel = 'R (Rest)';

      if (code === 'N' || code === 'P/N') {
        shiftText = 'Night Shift';
        icon = <Moon size={15} className="text-purple-600 animate-pulse" />;
        bgIconClass = 'bg-purple-50 border-purple-100 text-purple-600';
        textColor = 'text-purple-700';
        badgeLabel = 'N (Night)';
      } else if (code === 'G' || code === 'P') {
        shiftText = 'General Shift';
        icon = <Sun size={15} className="text-emerald-600" />;
        bgIconClass = 'bg-emerald-50 border-emerald-100 text-emerald-600';
        textColor = 'text-emerald-805';
        badgeLabel = 'G (General)';
      } else if (code === 'M') {
        shiftText = 'Morning Shift';
        icon = <Sunrise size={15} className="text-sky-605" />;
        bgIconClass = 'bg-sky-50 border-sky-100 text-sky-600';
        textColor = 'text-sky-700';
        badgeLabel = 'M (Morning)';
      } else if (code === 'E') {
        shiftText = 'Evening Shift';
        icon = <Sunset size={15} className="text-orange-600" />;
        bgIconClass = 'bg-orange-50 border-orange-100 text-orange-605';
        textColor = 'text-orange-700';
        badgeLabel = 'E (Evening)';
      } else if (code !== 'R') {
        shiftText = `Duty Shift (${code})`;
        icon = <Sunrise size={15} className="text-sky-605" />;
        bgIconClass = 'bg-sky-50 border-sky-100 text-sky-605';
        textColor = 'text-sky-700';
        badgeLabel = `${code} (Duty)`;
      }

      return (
        <div className="bg-white border border-slate-200 rounded-xl p-3 flex items-center gap-3 shadow-2xs hover:border-slate-300 transition duration-200">
          <div className={`w-8 h-8 rounded-lg border flex items-center justify-center shrink-0 ${bgIconClass}`}>
            {icon}
          </div>
          <div className="flex-1 min-w-0">
            <span className="text-[10px] font-extrabold text-slate-400 block tracking-wide uppercase leading-none">{label} ({dateLabel})</span>
            <span className={`text-[11px] font-black mt-1 block leading-none ${textColor}`}>{shiftText}</span>
          </div>
          <span className="text-[9px] font-black text-slate-400 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded uppercase shrink-0">
            {badgeLabel}
          </span>
        </div>
      );
    };

    return (
      <div className="glass-panel p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-5">
        <div className="flex justify-between items-center border-b border-slate-200 pb-3">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <CalendarDays size={18} className="text-theme-primary" />
            Roster & Shift Schedule Pattern
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openScheduleEditModal}
              className="px-2.5 py-1 rounded bg-theme-primary hover-bg-theme-primary text-white text-[10px] font-extrabold uppercase transition shadow-sm cursor-pointer"
            >
              Edit Pattern
            </button>
            <span className="px-2.5 py-0.5 rounded-full bg-theme-active text-theme-active border border-theme-active text-[9px] font-black uppercase tracking-wider">
              {isFlexible ? 'Flexible' : isSimple ? 'Simple Weekly' : isCustomRotation ? 'Rule Cycle' : (() => {
                let wkCount = 0;
                while (sched[`week${wkCount + 1}`]) {
                  wkCount++;
                }
                if (wkCount === 0) wkCount = isRotating3Week ? 3 : 4;
                return `${wkCount}-Week Cycle`;
              })()}
            </span>
          </div>
        </div>

        {isFlexible && (
          <div className="p-4.5 bg-amber-50/20 backdrop-blur-md border border-amber-200/60 rounded-2xl flex items-start gap-3.5 shadow-xs relative overflow-hidden transition-all duration-300 hover:border-amber-300/80">
            <div className="absolute top-0 left-0 w-1 h-full bg-amber-500"></div>
            <div className="w-8 h-8 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center shrink-0">
              <ShieldAlert className="text-amber-600 animate-pulse" size={16} />
            </div>
            <div>
              <h4 className="text-xs font-black text-amber-855 uppercase tracking-wider">Flexible / No Fixed Roster Active</h4>
              <p className="text-[10.5px] text-amber-700 font-bold mt-1.5 leading-relaxed">
                This employee (e.g. SSE/JE) does not follow a fixed weekly roster. Shifts are entered manually in the attendance records.
              </p>
            </div>
          </div>
        )}

        {!isFlexible && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 text-xs font-semibold text-slate-500">
              <div>
                {type === 'custom-rotation' ? (
                  <span>Roster Rule: <span className="font-extrabold text-theme-accent">{sched.rule_name}</span></span>
                ) : (
                  <span>Roster Cycle: <span className="font-extrabold text-theme-accent">{
                    type === 'simple' ? 'Simple Weekly' : type === 'rotating-3week' ? '3-Week Rotating (21-Day HOER)' : (() => {
                      let wkCount = 0;
                      while (sched[`week${wkCount + 1}`]) {
                        wkCount++;
                      }
                      if (wkCount === 0) wkCount = 4;
                      return `${wkCount}-Week Rotating (${wkCount * 7}-Day HOER)`;
                    })()
                  }</span></span>
                )}
              </div>
              {type !== 'simple' && (
                <div>
                  Anchor Date: <span className="font-mono font-extrabold text-slate-800">{new Date(anchorDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {Array.from({ length: numWeeks }).map((_, wkIdx) => {
                const weekStart = new Date(cycleStartDateStr);
                weekStart.setDate(weekStart.getDate() + wkIdx * 7);
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekEnd.getDate() + 6);
                
                const weekRangeStr = `${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${weekEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
                
                return (
                  <div key={wkIdx} className="border border-slate-200 rounded-2xl p-4.5 bg-white flex flex-col space-y-3.5 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden group hover:border-[#00c2b2]/40">
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-[#00c2b2] to-[var(--theme-icon-bg)] opacity-80"></div>
                    <div className="text-xs font-black text-slate-800 border-b border-slate-100 pb-2.5 flex justify-between items-center pl-1.5">
                      <span className="flex items-center gap-1.5 text-[13px] font-black text-slate-850">
                        <CalendarDays size={14} className="text-[#00c2b2]" />
                        Week {wkIdx + 1}
                      </span>
                      <span className="text-[9px] font-black text-theme-accent bg-theme-active border border-theme-active px-2 py-0.5 rounded-full uppercase tracking-wider">
                        {weekRangeStr}
                      </span>
                    </div>
                    <div className="grid grid-cols-7 gap-1.5">
                      {weekdays.map((dayName, dayIdx) => {
                        const dayDate = new Date(weekStart);
                        dayDate.setDate(dayDate.getDate() + dayIdx);
                        const dayDateStr = `${dayDate.getFullYear()}-${String(dayDate.getMonth() + 1).padStart(2, '0')}-${String(dayDate.getDate()).padStart(2, '0')}`;
                        
                        // Get the shift for this date
                        const shift = getShiftForDate(dayDateStr) || 'R';
                        const isToday = dayDateStr === DASHBOARD_TODAY;
                        
                        return renderDayPillWithDate(dayName, dayDateStr, shift, isToday);
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Next Scheduled Shifts Preview Panel removed since it is merged into the top timeline */}

        <div className="pt-3 border-t border-slate-150">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2">Custom Schedule Overrides</span>
          {Array.isArray(sched.custom_night_weeks) && sched.custom_night_weeks.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {sched.custom_night_weeks.map((override: any, idx: number) => (
                <div key={idx} className="px-2.5 py-1 rounded-lg bg-purple-50 border border-purple-200 text-[10px] font-black text-purple-700 flex items-center gap-1">
                  <Clock size={10} />
                  <span>{new Date(override.from_date).toLocaleDateString('en-GB')} to {new Date(override.to_date).toLocaleDateString('en-GB')} ({override.shift || 'N'})</span>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-[11px] text-slate-450 italic font-semibold">No custom night duty week overrides configured for this employee.</span>
          )}
        </div>
      </div>
    );
  };

  // Timeline dates and helper configurations
  const yesterdayObj = new Date(DASHBOARD_TODAY);
  yesterdayObj.setDate(yesterdayObj.getDate() - 1);
  const yesterdayStr = `${yesterdayObj.getFullYear()}-${String(yesterdayObj.getMonth() + 1).padStart(2, '0')}-${String(yesterdayObj.getDate()).padStart(2, '0')}`;

  const tomorrowObj = new Date(DASHBOARD_TODAY);
  tomorrowObj.setDate(tomorrowObj.getDate() + 1);
  const tomorrowStr = `${tomorrowObj.getFullYear()}-${String(tomorrowObj.getMonth() + 1).padStart(2, '0')}-${String(tomorrowObj.getDate()).padStart(2, '0')}`;

  const dayAfterObj = new Date(DASHBOARD_TODAY);
  dayAfterObj.setDate(dayAfterObj.getDate() + 2);
  const dayAfterStr = `${dayAfterObj.getFullYear()}-${String(dayAfterObj.getMonth() + 1).padStart(2, '0')}-${String(dayAfterObj.getDate()).padStart(2, '0')}`;

  const yesterdayShift = getShiftForDate(yesterdayStr);
  const todayShift = getShiftForDate(DASHBOARD_TODAY);
  const tomorrowShift = getShiftForDate(tomorrowStr);
  const dayAfterShift = getShiftForDate(dayAfterStr);

  const yesterdayStatus = attendanceMap[yesterdayStr] || null;
  const todayStatusVal = attendanceMap[DASHBOARD_TODAY] || null;
  const tomorrowStatus = attendanceMap[tomorrowStr] || null;
  const dayAfterStatus = attendanceMap[dayAfterStr] || null;

  const renderStatusTimelineCard = (
    label: string,
    dateStr: string,
    shift: string | null,
    isToday: boolean,
    actualStatus?: string | null
  ) => {
    const code = (actualStatus || shift || 'R').toUpperCase();
    let bgClass = '';
    let borderClass = 'border-slate-200';
    let textClass = 'text-slate-800';
    let iconClass = 'bg-slate-50 text-slate-400 border-slate-100';
    let shiftText = 'Rest Day';
    let icon = <Coffee size={16} />;
    let statusLabel = '';

    if (actualStatus) {
      if (['CL', 'LAP', 'Sick', 'SCL'].includes(actualStatus)) {
        bgClass = 'bg-amber-50/50 hover:bg-amber-50';
        borderClass = 'border-amber-200';
        textClass = 'text-amber-805';
        iconClass = 'bg-amber-100 text-amber-600 border-amber-200';
        shiftText = actualStatus === 'CL' ? 'Casual Leave' : actualStatus === 'LAP' ? 'Average Pay Leave (LAP)' : actualStatus === 'Sick' ? 'Medical Sick' : 'Special Casual Leave';
        icon = <FileText size={16} />;
        statusLabel = 'On Leave';
      } else if (actualStatus === 'CR') {
        bgClass = 'bg-sky-50/50 hover:bg-sky-50';
        borderClass = 'border-sky-200';
        textClass = 'text-sky-800';
        iconClass = 'bg-sky-100 text-sky-600 border-sky-200';
        shiftText = 'Compensatory Rest';
        icon = <Coffee size={16} />;
        statusLabel = 'Off Duty';
      } else if (actualStatus === 'R') {
        bgClass = 'bg-slate-50/50 hover:bg-slate-100';
        borderClass = 'border-slate-200';
        textClass = 'text-slate-655';
        iconClass = 'bg-slate-100 text-slate-500 border-slate-200';
        shiftText = 'Weekly Rest Day';
        icon = <Coffee size={16} />;
        statusLabel = 'Weekly Off';
      } else if (actualStatus === 'PH') {
        bgClass = 'bg-yellow-50/50 hover:bg-yellow-50';
        borderClass = 'border-yellow-250';
        textClass = 'text-yellow-805';
        iconClass = 'bg-yellow-100 text-yellow-600 border-yellow-200';
        shiftText = 'Public Holiday';
        icon = <Calendar size={16} />;
        statusLabel = 'Holiday';
      } else if (actualStatus === 'P' || actualStatus === 'P/N') {
        const actShift = (shift || 'G').toUpperCase();
        if (actShift === 'N' || actualStatus === 'P/N') {
          bgClass = 'bg-purple-50/50 hover:bg-purple-50';
          borderClass = 'border-purple-200';
          textClass = 'text-purple-800';
          iconClass = 'bg-purple-100 text-purple-655 border-purple-200';
          shiftText = 'Night Shift';
          icon = <Moon size={16} className="animate-pulse" />;
          statusLabel = 'On Duty (N)';
        } else if (actShift === 'M') {
          bgClass = 'bg-sky-50/50 hover:bg-sky-50';
          borderClass = 'border-sky-200';
          textClass = 'text-sky-800';
          iconClass = 'bg-sky-100 text-sky-605 border-sky-200';
          shiftText = 'Morning Shift';
          icon = <Sunrise size={16} />;
          statusLabel = 'On Duty (M)';
        } else if (actShift === 'E') {
          bgClass = 'bg-orange-50/50 hover:bg-orange-50';
          borderClass = 'border-orange-200';
          textClass = 'text-orange-850';
          iconClass = 'bg-orange-100 text-orange-600 border-orange-200';
          shiftText = 'Evening Shift';
          icon = <Sunset size={16} />;
          statusLabel = 'On Duty (E)';
        } else {
          bgClass = 'bg-emerald-50/50 hover:bg-emerald-50';
          borderClass = 'border-emerald-200';
          textClass = 'text-emerald-800';
          iconClass = 'bg-emerald-100 text-emerald-600 border-emerald-200';
          shiftText = 'General Shift';
          icon = <Sun size={16} />;
          statusLabel = 'On Duty (G)';
        }
      }
    } else {
      if (code === 'R') {
        bgClass = 'bg-slate-50/50 hover:bg-slate-100';
        borderClass = 'border-slate-200';
        textClass = 'text-slate-550';
        iconClass = 'bg-slate-100 text-slate-450 border-slate-200';
        shiftText = 'Rest Day (Scheduled)';
        icon = <Coffee size={16} />;
        statusLabel = 'Rest (Sched)';
      } else if (code === 'N') {
        bgClass = 'bg-indigo-50/30 hover:bg-indigo-50/60';
        borderClass = 'border-indigo-150';
        textClass = 'text-indigo-800';
        iconClass = 'bg-indigo-50 text-indigo-650 border-indigo-150';
        shiftText = 'Night Shift (Scheduled)';
        icon = <Moon size={16} />;
        statusLabel = 'Scheduled (N)';
      } else if (code === 'M') {
        bgClass = 'bg-sky-50/30 hover:bg-sky-50/60';
        borderClass = 'border-sky-150';
        textClass = 'text-sky-800';
        iconClass = 'bg-sky-50 text-sky-600 border-sky-150';
        shiftText = 'Morning Shift (Scheduled)';
        icon = <Sunrise size={16} />;
        statusLabel = 'Scheduled (M)';
      } else if (code === 'E') {
        bgClass = 'bg-orange-50/30 hover:bg-orange-50/60';
        borderClass = 'border-orange-150';
        textClass = 'text-orange-855';
        iconClass = 'bg-orange-55 text-orange-605 border-orange-150';
        shiftText = 'Evening Shift (Scheduled)';
        icon = <Sunset size={16} />;
        statusLabel = 'Scheduled (E)';
      } else {
        bgClass = 'bg-emerald-50/30 hover:bg-emerald-50/60';
        borderClass = 'border-emerald-150';
        textClass = 'text-emerald-800';
        iconClass = 'bg-emerald-55 text-emerald-600 border-emerald-150';
        shiftText = 'General Shift (Scheduled)';
        icon = <Sun size={16} />;
        statusLabel = 'Scheduled (G)';
      }
    }

    const dateObj = new Date(dateStr);
    const dateLabel = isNaN(dateObj.getTime()) ? '' : dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

    return (
      <div 
        key={dateStr}
        className={`glass-panel p-4.5 rounded-2xl flex items-center gap-3.5 border transition-all duration-200 relative overflow-hidden shadow-2xs ${bgClass} ${borderClass} ${
          isToday ? 'ring-4 ring-yellow-400 ring-offset-1 scale-[1.02] shadow-xs border-yellow-350' : ''
        }`}
      >
        {isToday && (
          <span className="absolute top-2.5 right-3 z-10 bg-yellow-400 text-slate-900 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shadow-2xs animate-pulse">
            Today
          </span>
        )}
        <div className={`w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 shadow-2xs ${iconClass}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-[9px] font-black text-slate-400 block tracking-widest uppercase leading-none">{label} ({dateLabel})</span>
          <span className={`text-[12px] font-black mt-1 block truncate leading-tight ${textClass}`}>{shiftText}</span>
          <span className="text-[9.5px] font-bold text-slate-500 mt-1 block leading-none">{statusLabel}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="glass-panel p-5 rounded-2xl bg-white border border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-xs">
        <div className="flex items-center gap-4">
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white hover:bg-theme-active border border-slate-200 hover:border-theme-active text-slate-600 hover:text-theme-primary transition-all duration-200 cursor-pointer shadow-2xs hover:shadow-xs flex items-center justify-center shrink-0 hover:scale-105 active:scale-95"
            title="Back to Directory"
          >
            <ChevronLeft size={18} className="stroke-[3]" />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-2xl font-black tracking-tight text-slate-800 leading-tight">
                {employee.name}
              </h2>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-theme-active text-theme-primary border border-theme-active/50 text-[10px] font-black tracking-wider uppercase mt-0.5">
                PF: {employee.pf_number}
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-500 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-extrabold text-slate-700">{employee.designation}</span>
              <span className="text-slate-350">•</span>
              <span>Section: <strong className="text-slate-700">{employee.section_code}</strong></span>
              <span className="text-slate-350">•</span>
              <span>Pay Level: <strong className="text-theme-primary">Level {employee.level}</strong></span>
            </p>
          </div>
        </div>

        <CustomSelect
          value={selectedYear}
          onChange={(val) => setSelectedYear(Number(val))}
          options={[
            { value: 2026, label: '2026 Roster Heatmap' },
            { value: 2025, label: '2025 Roster Heatmap' }
          ]}
          className="w-52 shrink-0"
        />
      </div>

      {/* Unified Shift Status Timeline Panel */}
      <div className="space-y-3">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block pl-1">Roster Shift & Duty Status Timeline</span>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {renderStatusTimelineCard("Yesterday", yesterdayStr, yesterdayShift, false, yesterdayStatus)}
          {renderStatusTimelineCard("Today", DASHBOARD_TODAY, todayShift, true, todayStatusVal)}
          {renderStatusTimelineCard("Tomorrow", tomorrowStr, tomorrowShift, false, tomorrowStatus)}
          {renderStatusTimelineCard("Day After", dayAfterStr, dayAfterShift, false, dayAfterStatus)}
        </div>
        {lastDuty && (
          <div className="text-[10px] font-bold text-slate-500 bg-white border border-slate-200/80 rounded-xl px-3.5 py-2 w-max shadow-2xs flex items-center gap-1.5 ml-1">
            <Clock size={11} className="text-slate-400" />
            <span>Last Worked Duty:</span> 
            <span className="font-mono text-theme-primary font-black">{new Date(lastDuty.date).toLocaleDateString('en-GB')}</span> 
            <span className="text-slate-350">•</span>
            <span className="text-slate-700 font-extrabold">{getLastWorkedShiftLabel(lastDuty.status, lastDuty.date).label}</span>
          </div>
        )}
      </div>

      {renderScheduleCard()}

      {leaveBank && (
        <div className="flex justify-between items-center border-b border-slate-200 pb-3">
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
            <Database size={16} className="text-amber-500" />
            Leave Bank Ledger & Accounts ({selectedYear})
          </h3>
          <button
            onClick={openEditModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-theme-primary hover-bg-theme-primary text-white text-xs font-bold transition shadow-sm cursor-pointer"
          >
            <Edit size={13} />
            Edit Leave Balances
          </button>
        </div>
      )}

      {leaveBank && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="glass-panel p-5 rounded-2xl bg-white flex items-center justify-between border border-slate-200 shadow-sm">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Casual Leave (CL)</span>
              <h3 className="text-2xl font-black text-slate-800">{leaveBank.total_cl - leaveBank.used_cl} / {leaveBank.total_cl} <span className="text-xs font-semibold text-slate-400">Days Left</span></h3>
              <p className="text-[11px] text-slate-500 font-bold">Used: {leaveBank.used_cl} days this year</p>
            </div>
            {(() => {
              const remaining = leaveBank.total_cl - leaveBank.used_cl;
              const pct = leaveBank.total_cl > 0 ? Math.min(100, Math.max(0, (remaining / leaveBank.total_cl) * 100)) : 0;
              const r = 20;
              const circ = 2 * Math.PI * r;
              const offset = circ - (pct / 100) * circ;
              return (
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="32" cy="32" r={r} stroke="#fef3c7" strokeWidth="4" fill="transparent" />
                    <circle cx="32" cy="32" r={r} stroke="#f59e0b" strokeWidth="4" fill="transparent" strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
                  </svg>
                  <span className="absolute text-[10px] font-black text-slate-700">{Math.round(pct)}%</span>
                </div>
              );
            })()}
          </div>

          <div className="glass-panel p-5 rounded-2xl bg-white flex items-center justify-between border border-slate-200 shadow-sm">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Average Pay Leave (LAP)</span>
              <h3 className="text-2xl font-black text-slate-800">{leaveBank.total_lap - leaveBank.used_lap} / {leaveBank.total_lap} <span className="text-xs font-semibold text-slate-400">Days Left</span></h3>
              <p className="text-[11px] text-slate-500 font-bold">Used: {leaveBank.used_lap} days this year</p>
            </div>
            {(() => {
              const remaining = leaveBank.total_lap - leaveBank.used_lap;
              const pct = leaveBank.total_lap > 0 ? Math.min(100, Math.max(0, (remaining / leaveBank.total_lap) * 100)) : 0;
              const r = 20;
              const circ = 2 * Math.PI * r;
              const offset = circ - (pct / 100) * circ;
              return (
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="32" cy="32" r={r} stroke="#ffedd5" strokeWidth="4" fill="transparent" />
                    <circle cx="32" cy="32" r={r} stroke="#ea580c" strokeWidth="4" fill="transparent" strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" />
                  </svg>
                  <span className="absolute text-[10px] font-black text-slate-700">{Math.round(pct)}%</span>
                </div>
              );
            })()}
          </div>

          <div className="glass-panel p-5 rounded-2xl bg-white flex items-center justify-between border border-slate-200 shadow-sm">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Compensatory Rest Balance (CR)</span>
              <h3 className="text-2xl font-black text-slate-800">{leaveBank.accrued_cr} <span className="text-xs font-semibold text-slate-400">Accrued Balance</span></h3>
              <p className="text-[11px] text-slate-500 font-bold">Used: earned on Rest Day duties and manual credits</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-theme-active text-theme-primary flex items-center justify-center font-bold text-sm shadow-inner">
              CR
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-200 pb-3">
              <Calendar size={18} className="text-theme-primary" />
              Attendance Ledger Calendar Heatmap ({selectedYear})
            </h3>
            {renderHeatmap()}
            <div className="pt-3 border-t border-slate-200 flex flex-wrap gap-4 text-[10px] font-bold text-slate-500 items-center">
              <span>Roster Colors:</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-emerald-100 border border-emerald-300"></span> Present (P)</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-violet-100 border border-violet-300"></span> Night Duty (P/N)</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-slate-105 border border-slate-200"></span> Weekly Rest (R)</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-sky-100 border border-sky-300"></span> Comp Rest (CR)</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-amber-100 border border-amber-305"></span> Casual Leave (CL)</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-orange-100 border border-orange-305"></span> LAP Leave</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-red-500 border border-red-600"></span> Sick Leave</span>
            </div>
          </div>
        </div>

        <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-200 pb-3">
            <Milestone size={18} className="text-theme-primary" />
            Timeline Journey & Milestones
          </h3>
          <div className="flex-1 overflow-y-auto max-h-[500px] space-y-5 pr-2">
            {timelineJourney.length === 0 ? (
              <p className="text-center py-10 text-xs text-slate-400 font-bold">No registered milestones or timeline events.</p>
            ) : (
              <div className="relative border-l border-slate-200 ml-2.5 pl-6 space-y-6 text-xs">
                {timelineJourney.map((item, idx) => (
                  <div key={idx} className="relative">
                    <span className={`absolute -left-[30px] top-0.5 w-3 h-3 rounded-full border-2 ${item.type === 'milestone'
                        ? 'bg-theme-primary border-white ring-2 ring-[var(--theme-active-bg)]'
                        : item.type === 'event'
                          ? 'bg-purple-600 border-white ring-2 ring-purple-100'
                          : 'bg-amber-600 border-white ring-2 ring-amber-100'
                      }`}></span>
                    <span className="text-[10px] font-bold text-slate-400 block">{new Date(item.date).toLocaleDateString('en-GB')}</span>
                    <h4 className="font-bold text-slate-800 mt-1">{item.title}</h4>
                    <p className="text-slate-500 font-semibold mt-1 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* History, Leaves & CR Ledger Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Transfer History Card */}
          <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-200 pb-3">
              <ArrowLeftRight size={18} className="text-theme-primary font-bold" />
              Transfer & Posting History
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs table-fixed">
                <thead>
                  <tr className="border-b text-slate-500 uppercase font-bold bg-slate-50">
                    <th className="py-2.5 px-4 w-[20%]">Transfer Date</th>
                    <th className="py-2.5 px-4 w-[20%]">From Section</th>
                    <th className="py-2.5 px-4 w-[20%]">To Section</th>
                    <th className="py-2.5 px-4 w-[20%]">Order Number</th>
                    <th className="py-2.5 px-4 w-[20%]">Approved Signatory</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {transfers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400 font-bold italic">
                        No previous transfers recorded on database.
                      </td>
                    </tr>
                  ) : (
                    transfers.map(evt => (
                      <tr key={evt.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-4 font-mono">{new Date(evt.from_date).toLocaleDateString('en-GB')}</td>
                        <td className="py-2.5 px-4 uppercase text-slate-500">
                          {evt.from_section || evt.location?.split('➡️')?.[0]?.trim() || '—'}
                        </td>
                        <td className="py-2.5 px-4 uppercase text-slate-850 font-bold">
                          {evt.to_section || evt.location?.split('➡️')?.[1]?.trim() || evt.location || '—'}
                        </td>
                        <td className="py-2.5 px-4 font-mono bg-slate-50/50 text-slate-650">{evt.order_number}</td>
                        <td className="py-2.5 px-4">
                          {evt.signatory_name && evt.signatory_name !== 'N/A' ? (
                            <div className="flex flex-col">
                              <span className="font-bold text-slate-850">{evt.signatory_name}</span>
                              <span className="text-[10px] text-slate-400 uppercase tracking-wide font-medium">{evt.signatory_designation}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400 italic font-medium">Pre-migration record</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Leave Logs Card */}
          <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-200 pb-3">
              <CalendarDays size={18} className="text-theme-primary font-bold" />
              Detailed Leave Logs Ledger
            </h3>
            <div className="overflow-x-auto max-h-[300px]">
              <table className="w-full text-left border-collapse text-xs table-fixed">
                <thead>
                  <tr className="border-b text-slate-500 uppercase font-bold bg-slate-50">
                    <th className="py-2.5 px-4 w-[30%]">Leave Date</th>
                    <th className="py-2.5 px-4 w-[20%]">Leave Type</th>
                    <th className="py-2.5 px-4 w-[50%]">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                  {leaveLogs.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="py-8 text-center text-slate-400 font-bold italic">
                        No leaves logged for this calendar year.
                      </td>
                    </tr>
                  ) : (
                    leaveLogs.map(log => (
                      <tr key={log.id} className="hover:bg-slate-50/50">
                        <td className="py-2.5 px-4 font-mono">{new Date(log.date).toLocaleDateString('en-GB')}</td>
                        <td className="py-2.5 px-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-extrabold border ${log.status === 'CL'
                              ? 'bg-amber-50 text-amber-700 border-amber-250'
                              : log.status === 'LAP'
                                ? 'bg-orange-50 text-orange-700 border-orange-250'
                                : 'bg-red-50 text-red-700 border-red-250'
                            }`}>
                            {log.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-500 font-medium">{log.remarks || "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* CR Ledger Card */}
        <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-200 pb-3">
            <TrendingUp size={18} className="text-theme-primary font-bold" />
            CR Balance Credit/Debit Log
          </h3>
          <div className="overflow-y-auto max-h-[500px] space-y-3 pr-1">
            {crLedger.length === 0 ? (
              <p className="text-center py-10 text-xs text-slate-400 font-bold italic">No CR ledger records found.</p>
            ) : (
              <div className="space-y-2">
                {crLedger.map((cr, idx) => (
                  <div key={idx} className="p-3 bg-slate-50 border rounded-lg text-xs font-semibold space-y-1">
                    <div className="flex justify-between items-center text-[10px] font-bold text-slate-400">
                      <span>CR LOG ID: {cr.id || idx + 1}</span>
                      <span className="text-blue-600 font-extrabold">CREDIT</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-slate-550 font-bold">Rest Day Duty (Earned):</span>
                      <span className="font-mono text-slate-800 font-bold">{new Date(cr.earned_date).toLocaleDateString('en-GB')}</span>
                    </div>
                    <div className="flex justify-between items-center border-t border-slate-200/50 pt-1 mt-1">
                      <span className="text-slate-550 font-bold">Consumed (Debited):</span>
                      {cr.consumed_date ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-rose-50 text-rose-700 border border-rose-200 font-mono">
                          {new Date(cr.consumed_date).toLocaleDateString('en-GB')}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-250">
                          AVAILABLE
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {isEditModalOpen && isClient && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-slate-900/40">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                <Database size={16} className="text-theme-primary" />
                Edit Leave Balances ({selectedYear})
              </h3>
              <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold text-sm transition">✕</button>
            </div>
            <form onSubmit={handleUpdateBalances} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase">Total CL</label>
                  <input
                    type="number"
                    min="0"
                    value={editTotalCl}
                    onChange={(e) => setEditTotalCl(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-[var(--theme-icon-bg)]"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase">Used CL</label>
                  <input
                    type="number"
                    min="0"
                    value={editUsedCl}
                    onChange={(e) => setEditUsedCl(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-[var(--theme-icon-bg)]"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase">Total LAP</label>
                  <input
                    type="number"
                    min="0"
                    value={editTotalLap}
                    onChange={(e) => setEditTotalLap(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-[var(--theme-icon-bg)]"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-slate-500 uppercase">Used LAP</label>
                  <input
                    type="number"
                    min="0"
                    value={editUsedLap}
                    onChange={(e) => setEditUsedLap(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-[var(--theme-icon-bg)]"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-black text-slate-500 uppercase">Accrued CR Balance</label>
                <input
                  type="number"
                  min="0"
                  value={editAccruedCr}
                  onChange={(e) => setEditAccruedCr(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-[var(--theme-icon-bg)]"
                  required
                />
              </div>
              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2 text-xs">
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-slate-655 hover:bg-slate-50 font-bold transition" disabled={isSaving}>Cancel</button>
                <button type="submit" className="px-4 py-2 bg-theme-primary hover-bg-theme-primary text-white rounded-lg font-bold transition flex items-center gap-1.5 shadow-sm" disabled={isSaving}>
                  {isSaving ? "Saving..." : "Save Balances"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
      {isScheduleEditOpen && isClient && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-slate-900/40">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl animate-scale-up relative">
            <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50 rounded-t-2xl">
              <h3 className="font-black text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                <CalendarDays size={16} className="text-theme-primary" />
                Roster Schedule Configuration
              </h3>
              <button
                type="button"
                onClick={() => setIsScheduleEditOpen(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-sm transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateSchedule} className="p-5 space-y-4 text-xs font-bold text-slate-700">
              <div className="space-y-1">
                <label className="block text-[10px] uppercase text-slate-400 tracking-wider">Schedule Type</label>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-lg border border-slate-200">
                  {([ 'rotating', 'flexible', 'custom-rotation' ] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        setScheduleType(type);
                      }}
                      className={`py-1.5 rounded text-[9px] font-extrabold uppercase transition-all duration-200 text-center cursor-pointer ${scheduleType === type ? 'bg-theme-primary text-white shadow' : 'text-slate-500 hover:text-slate-800 border-none bg-transparent'}`}
                    >
                      {type === 'rotating' && 'Rotating Cycle'}
                      {type === 'flexible' && 'Flexible'}
                      {type === 'custom-rotation' && 'Rule'}
                    </button>
                  ))}
                </div>
              </div>

              {scheduleType === 'flexible' && (
                <div className="p-4 bg-theme-active border border-theme-active rounded-lg text-slate-655 text-[10px] font-semibold leading-relaxed">
                  <strong>Flexible / No Fixed Roster Mode:</strong> This employee (e.g. SSE/JE/IC) does not follow a strict weekly or rotating duty cycle. Shift rules will be left blank by default in the attendance sheet and can be manually inputted.
                </div>
              )}

              {scheduleType === 'custom-rotation' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Roster Rotation Rule</label>
                      <CustomSelect
                        value={selectedRuleId || ""}
                        onChange={(val) => setSelectedRuleId(val ? Number(val) : null)}
                        options={[
                          { value: "", label: "-- Select Rule --" },
                          ...rosterRules.map(r => ({ value: r.id, label: r.name }))
                        ]}
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Roster Anchor Date</label>
                      <CustomDatePicker
                        value={empAnchorDate}
                        onChange={(val) => setEmpAnchorDate(val)}
                        placeholder="Select Date"
                        required
                      />
                    </div>
                  </div>
                  {selectedRuleId && (() => {
                    const r = rosterRules.find(rule => rule.id === Number(selectedRuleId));
                    if (!r) return null;
                    return (
                      <div className="p-3.5 bg-theme-active border border-theme-active rounded-xl space-y-1.5 text-[10px]">
                        <div className="flex justify-between items-center text-slate-500 font-bold uppercase tracking-wider">
                          <span>Rule Pattern Details</span>
                          <span className="text-theme-primary bg-theme-active px-2 py-0.5 rounded-full text-[8.5px] font-extrabold uppercase">
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

              {scheduleType === 'rotating' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Roster Anchor Date</label>
                    <CustomDatePicker
                      value={empAnchorDate}
                      onChange={(val) => setEmpAnchorDate(val)}
                      placeholder="Select Date"
                      required={scheduleType === 'rotating'}
                    />
                  </div>
                  <div className="flex items-end text-[9px] text-slate-505 italic pb-2 font-medium">
                    This anchor date determines when "Week 1" cycle begins.
                  </div>
                </div>
              )}

              {scheduleType === 'rotating' && (
                <div className="space-y-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="space-y-3">
                    {/* Week Tabs */}
                    <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-2">
                      {getRotatingWeeks().map((wk, index) => {
                        const isActive = activeRotatingWeek === wk;
                        const weekNum = index + 1;
                        return (
                          <div key={wk} className="relative group flex items-center">
                            <button
                              type="button"
                              onClick={() => setActiveRotatingWeek(wk as any)}
                              className={`pl-3 pr-7 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all duration-200 flex items-center gap-1.5 cursor-pointer border-none ${
                                isActive 
                                  ? 'bg-theme-primary text-white shadow-sm' 
                                  : 'bg-slate-200/60 text-slate-500 hover:text-slate-800'
                              }`}
                            >
                              W{weekNum}
                            </button>
                            {getRotatingWeeks().length > 1 && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeWeek(wk);
                                }}
                                title={`Delete Week ${weekNum}`}
                                className={`absolute right-1 text-[9px] hover:scale-110 active:scale-95 transition-all w-3.5 h-3.5 rounded-full flex items-center justify-center font-extrabold cursor-pointer border-none bg-transparent ${
                                  isActive ? 'text-white/80 hover:text-white hover:bg-white/10' : 'text-slate-400 hover:text-red-500 hover:bg-slate-200'
                                }`}
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        onClick={addWeek}
                        title="Add Week"
                        className="px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 hover:border-theme-primary text-slate-400 hover:text-theme-primary text-[9px] font-black uppercase tracking-wider transition-all duration-200 flex items-center gap-1 bg-white hover:bg-theme-primary/5 cursor-pointer"
                      >
                        <span>+ Add Week</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-4 gap-2">
                      {getWeekdaysStartingFrom(empAnchorDate).map(day => (
                        <div key={day} className="flex flex-col gap-0.5">
                          <label className="text-[9px] font-bold text-slate-400 truncate">{day.slice(0, 3)}</label>
                          <CustomSelect
                            value={rotatingSchedule[activeRotatingWeek]?.[day] || 'G'}
                            onChange={(val) => setRotatingSchedule(prev => ({
                              ...prev,
                              [activeRotatingWeek]: {
                                ...prev[activeRotatingWeek],
                                [day]: val
                              }
                            }))}
                            options={[
                              { value: 'G', label: 'General (G)' },
                              { value: 'M', label: 'Morning (M)' },
                              { value: 'E', label: 'Evening (E)' },
                              { value: 'N', label: 'Night (N)' },
                              { value: 'R', label: 'Rest (R)' }
                            ]}
                            className="w-full text-[10px]"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Custom Overrides */}
              <div className="border-t border-slate-100 pt-3 space-y-2">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">Custom Schedule Overrides</span>
                <div className="grid grid-cols-4 gap-1.5 items-end">
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 truncate block mb-1">From Date</label>
                    <CustomDatePicker
                      value={overrideFrom}
                      onChange={(val) => setOverrideFrom(val)}
                      placeholder="Select Date"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 truncate block mb-1">To Date</label>
                    <CustomDatePicker
                      value={overrideTo}
                      onChange={(val) => setOverrideTo(val)}
                      placeholder="Select Date"
                    />
                  </div>
                  <div>
                    <label className="text-[9px] font-bold text-slate-400 truncate block mb-1">Override Shift</label>
                    <CustomSelect
                      value={overrideShift}
                      onChange={(val) => setOverrideShift(val)}
                      options={[
                        { value: 'G', label: 'General (G)' },
                        { value: 'M', label: 'Morning (M)' },
                        { value: 'E', label: 'Evening (E)' },
                        { value: 'N', label: 'Night (N)' },
                        { value: 'R', label: 'Rest (R)' }
                      ]}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      if (!overrideFrom || !overrideTo) {
                        showToast("Please select both start and end dates.", "error");
                        return;
                      }
                      if (overrideFrom > overrideTo) {
                        showToast("Start date cannot be after end date.", "error");
                        return;
                      }
                      setCustomNightWeeks(prev => [...prev, { from_date: overrideFrom, to_date: overrideTo, shift: overrideShift }]);
                      setOverrideFrom('');
                      setOverrideTo('');
                      setOverrideShift('N');
                    }}
                    className="bg-theme-primary hover-bg-theme-primary text-white rounded text-[10px] font-bold py-1.5 px-2 uppercase shadow-sm cursor-pointer border-none h-[28px]"
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
                          className="text-red-500 hover:text-red-700 font-extrabold cursor-pointer bg-transparent border-none transition active:scale-95"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Roster Section & Rest Day Persistence */}
              <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                <div>
                  <label className="block mb-1 text-[10px] uppercase text-slate-400 tracking-wider">Weekly Rest Day</label>
                  <CustomSelect
                    value={empRestDay}
                    onChange={(val) => {
                      setEmpRestDay(val);
                      setEmpWeeklySchedule(getWeeklyScheduleDefault(val));
                      setRotatingSchedule(prev => {
                        const resetSched: any = {};
                        Object.keys(prev).forEach(wk => {
                          resetSched[wk] = getWeeklyScheduleDefault(val);
                        });
                        return resetSched;
                      });
                    }}
                    options={['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Flexible'].map(d => ({
                      value: d,
                      label: d
                    }))}
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-150 flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setIsScheduleEditOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-655 hover:bg-slate-50 font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-theme-primary hover-bg-theme-primary text-white rounded-lg font-bold transition cursor-pointer shadow-sm"
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "Save Updates"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Admin Auth Modal */}
      <AdminAuthModal 
        isOpen={isAuthModalOpen} 
        onClose={() => {
          setIsAuthModalOpen(false);
          setPendingAuthAction(null);
        }} 
        onSuccess={handleAuthSuccess} 
      />
      {/* Premium Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-[9999] bg-slate-900 border border-slate-800 text-white rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 max-w-sm transition-all duration-300">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
          <p className="text-xs font-semibold text-slate-200">{toast.message}</p>
        </div>
      )}
    </div>
  );
}

// --- STAFF DIRECTORY MAIN LIST COMPONENT ---
function StaffDirectory() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [activeSection, setActiveSection] = useState<string>('KKVS');
  const [loading, setLoading] = useState<boolean>(true);
  const router = useRouter();
  const [lang, setLang] = useState<'en' | 'bn' | 'hi'>('en');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedLang = (localStorage.getItem('erp_lang') || 'en') as 'en' | 'bn' | 'hi';
      setLang(savedLang);
    }
    const handleLangChange = () => {
      if (typeof window !== 'undefined') {
        const savedLang = (localStorage.getItem('erp_lang') || 'en') as 'en' | 'bn' | 'hi';
        setLang(savedLang);
      }
    };
    window.addEventListener('erp_lang_changed', handleLangChange);
    return () => window.removeEventListener('erp_lang_changed', handleLangChange);
  }, []);

  // Drag and drop sorting states
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragEnabledId, setDragEnabledId] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };

  const handleDragEnter = (e: React.DragEvent, targetIndex: number) => {
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    const newEmployees = [...employees];
    const draggedItem = newEmployees[draggedIndex];
    newEmployees.splice(draggedIndex, 1);
    newEmployees.splice(targetIndex, 0, draggedItem);

    setEmployees(newEmployees);
    setDraggedIndex(targetIndex);
  };

  const handleDragEnd = async () => {
    setDraggedIndex(null);
    setDragEnabledId(null);
    const empIds = employees.map(emp => emp.emp_id);
    try {
      await reorderEmployees(empIds);
      showToast("Staff order updated successfully", "success");
    } catch (err) {
      console.error("Failed to save reordered employees:", err);
      showToast("Failed to save order updates", "error");
    }
  };

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const loadData = async (section: string) => {
    setLoading(true);
    try {
      const storedSecs = await getSections();
      setSections(storedSecs);

      const emps = await getEmployees(section === 'ALL' ? undefined : section);
      
      let activeSectionsList: string[] = [];
      if (section === 'ALL' && typeof window !== 'undefined') {
        const stored = localStorage.getItem('erp_join_sections');
        if (stored) {
          try {
            activeSectionsList = JSON.parse(stored);
          } catch (e) {}
        }
      }
      
      const filteredEmps = section === 'ALL'
        ? emps.filter(e => e.section_code && activeSectionsList.includes(e.section_code))
        : emps;

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
    } catch (e) {
      console.error(e);
      showToast("Failed to fetch employees", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const section = localStorage.getItem('erp_active_section') || 'KKVS';
      setActiveSection(section);
      loadData(section);

      const handleSectionChanged = () => {
        const sec = localStorage.getItem('erp_active_section') || 'KKVS';
        setActiveSection(sec);
        loadData(sec);
      };

      window.addEventListener('erp_section_changed', handleSectionChanged);
      return () => window.removeEventListener('erp_section_changed', handleSectionChanged);
    }
  }, []);

  const searchParams = useSearchParams();
  const empIdStr = searchParams.get('id');

  if (empIdStr) {
    return <EmployeeProfile360 empId={Number(empIdStr)} onClose={() => router.push('/employees')} />;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
            {getTranslation(lang, 'Staff Directory')}
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-theme-active text-theme-active border border-theme-active font-bold uppercase tracking-wider">
              {activeSection === 'ALL' ? getTranslation(lang, 'Joint View') : `${activeSection} ${getTranslation(lang, 'Section')}`}
            </span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            {getTranslation(lang, 'Maintain employee personal details, pay scale levels, and assign base stations / rest days.')}
          </p>
        </div>
      </div>

      <div className="glass-panel rounded-xl border border-slate-200 flex flex-col overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-fixed">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-bold text-slate-500 uppercase bg-slate-50">
                <th className="py-3 px-3 w-[5%] text-center no-print"></th>
                <th className="py-3 px-5 w-[15%]">{getTranslation(lang, 'PF Number')}</th>
                <th className="py-3 px-5 w-[25%]">{getTranslation(lang, 'Name')}</th>
                <th className="py-3 px-5 w-[15%]">{getTranslation(lang, 'Designation')}</th>
                <th className="py-3 px-5 w-[10%]">{getTranslation(lang, 'Pay Level')}</th>
                <th className="py-3 px-5 w-[15%]">{getTranslation(lang, 'Rest Day')}</th>
                <th className="py-3 px-5 w-[15%]">{getTranslation(lang, 'Joining Date')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-4 px-3 no-print"><div className="h-4 w-4 bg-[#E5E3DC] rounded mx-auto" /></td>
                    <td className="py-4 px-5"><div className="h-4 w-28 bg-[#E5E3DC] rounded" /></td>
                    <td className="py-4 px-5"><div className="h-4 w-36 bg-[#E5E3DC] rounded" /></td>
                    <td className="py-4 px-5"><div className="h-4 w-20 bg-[#E5E3DC] rounded" /></td>
                    <td className="py-4 px-5"><div className="h-4 w-16 bg-[#E5E3DC] rounded" /></td>
                    <td className="py-4 px-5"><div className="h-4 w-24 bg-[#E5E3DC] rounded" /></td>
                    <td className="py-4 px-5"><div className="h-4 w-24 bg-[#E5E3DC] rounded" /></td>
                  </tr>
                ))
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400 font-bold">
                    {getTranslation(lang, 'No employees enrolled in this section.')}
                  </td>
                </tr>
              ) : (
                (() => {
                  let lastSection = '';
                  return employees.flatMap((emp, index) => {
                    const showSectionHeader = activeSection === 'ALL' && emp.section_code !== lastSection;
                    if (showSectionHeader) {
                      lastSection = emp.section_code || '';
                    }

                    const rows = [];
                    if (showSectionHeader) {
                      const secName = emp.section_code === 'KKVS' ? 'KKVS Section' : emp.section_code === 'KMUK' ? 'KMUK Section' : emp.section_code === 'KNAP' ? 'KNAP Section' : `${emp.section_code} Section`;
                      rows.push(
                        <tr key={`sec-header-${emp.section_code}`} className="bg-slate-100 font-extrabold text-[11px] tracking-wider text-slate-700 uppercase no-print select-none">
                          <td colSpan={7} className="py-2 px-4 text-left border-y border-slate-200 bg-slate-150">
                            <span className="bg-theme-primary text-white font-black px-2 py-0.5 rounded mr-2 text-[9px] uppercase tracking-widest shadow-xs">Section</span>
                            <span className="font-black text-slate-800">{secName}</span>
                          </td>
                        </tr>
                      );
                    }

                    rows.push(
                      <tr
                        key={emp.emp_id}
                        draggable={dragEnabledId === emp.emp_id}
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDragEnter={(e) => handleDragEnter(e, index)}
                        onDragEnd={handleDragEnd}
                        className={`hover:bg-slate-50/50 transition-colors select-none ${draggedIndex === index ? 'opacity-40 bg-[var(--theme-active-bg)]/20' : ''}`}
                      >
                        <td
                          className="py-3.5 px-2 text-center no-print cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600"
                          onMouseDown={() => setDragEnabledId(emp.emp_id)}
                          onMouseUp={() => setDragEnabledId(null)}
                        >
                          <GripVertical size={16} />
                        </td>
                        <td className="py-3.5 px-5 font-mono text-slate-700 font-bold">{emp.pf_number}</td>
                        <td className="py-3.5 px-5 font-bold text-slate-800">
                          <button
                            onClick={() => router.push(`/employees?id=${emp.emp_id}`)}
                            className="hover:text-[var(--theme-icon-bg)] hover:underline font-bold text-slate-850 cursor-pointer text-left bg-transparent border-none"
                          >
                            {emp.name}
                          </button>
                        </td>
                        <td className="py-3.5 px-5 font-bold">
                          <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                            {emp.designation}
                          </span>
                        </td>
                        <td className="py-3.5 px-5 font-bold text-theme-active">Level {emp.level}</td>
                        <td className="py-3.5 px-5 font-semibold text-slate-700">{emp.default_rest_day}</td>
                        <td className="py-3.5 px-5 font-mono text-slate-600">{emp.joining_date || "—"}</td>
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

      {toast && (
        <div className="fixed top-6 right-6 z-[9999] bg-slate-900 border border-slate-800 text-white rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 max-w-sm">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
          <p className="text-xs font-semibold text-slate-200">{toast.message}</p>
        </div>
      )}
    </div>
  );
}

// --- DEFAULT EXPORT WITH SUSPENSE BOUNDARY ---
export default function StaffDirectoryPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-slate-400">Loading directory...</div>}>
      <StaffDirectory />
    </Suspense>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { EmployeeProfile360 } from './employees/page';
import { 
  Users, 
  Moon, 
  CalendarDays, 
  CalendarRange, 
  Award,
  ArrowRight,
  TrendingUp,
  UserCheck,
  CalendarCheck,
  Sun,
  Sunrise,
  Sunset,
  Coffee,
  FileText,
  Calendar,
  Clock
} from 'lucide-react';
import { getEmployees, getAttendanceLogs, getSpecialEvents, getSections, Employee, AttendanceLog, SpecialEvent, parseLocalDate } from '../lib/api';
import CustomDatePicker from './components/CustomDatePicker';

export default function Dashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const empIdStr = searchParams.get('id');
  const [activeSection, setActiveSection] = useState<string>('KKVS');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceLog[]>([]);
  const [specialEvents, setSpecialEvents] = useState<SpecialEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Availability Checker States
  const getTodayDateStr = () => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  };
  const [selectedDate, setSelectedDate] = useState<string>(getTodayDateStr());
  const [dateSpecificLogs, setDateSpecificLogs] = useState<AttendanceLog[]>([]);
  const [dateLogsLoading, setDateLogsLoading] = useState<boolean>(false);

  // Dynamically calculate current visual cycle range for dashboard KPI counts
  const { DASHBOARD_START, DASHBOARD_END, DASHBOARD_TODAY } = (() => {
    const today = new Date();
    const day = today.getDate();
    const month = today.getMonth();
    const year = today.getFullYear();

    let startYear = year;
    let startMonth = month;
    let endYear = year;
    let endMonth = month;

    if (day >= 11) {
      startMonth = month;
      endMonth = (month + 1) % 12;
      if (month === 11) {
        endYear = year + 1;
      }
    } else {
      startMonth = month - 1;
      if (startMonth < 0) {
        startMonth = 11;
        startYear = year - 1;
      }
      endMonth = month;
    }

    const startStr = `${startYear}-${String(startMonth + 1).padStart(2, '0')}-11`;
    const endStr = `${endYear}-${String(endMonth + 1).padStart(2, '0')}-10`;
    const todayStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    return { DASHBOARD_START: startStr, DASHBOARD_END: endStr, DASHBOARD_TODAY: todayStr };
  })();

  const fetchDashboardData = async (section: string) => {
    setLoading(true);
    try {
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
      const storedSections = await getSections();
      
      let jointLogs: AttendanceLog[] = [];
      if (section === 'ALL') {
        for (const sec of storedSections) {
          if (!activeSectionsList.includes(sec.section_code)) continue;
          try {
            const logs = await getAttendanceLogs(sec.section_code, DASHBOARD_START, DASHBOARD_END);
            jointLogs = [...jointLogs, ...logs];
          } catch (secErr) {
            console.error(`Failed to fetch logs for ${sec.section_code}`, secErr);
          }
        }
      } else {
        jointLogs = await getAttendanceLogs(section, DASHBOARD_START, DASHBOARD_END);
      }

      const events = await getSpecialEvents(section === 'ALL' ? undefined : section);
      const filteredEvents = section === 'ALL'
        ? events.filter(evt => filteredEmps.some(e => e.emp_id === evt.emp_id))
        : events;
      
      setEmployees(filteredEmps);
      setAttendance(jointLogs);
      setSpecialEvents(filteredEvents);
    } catch (e) {
      console.error("Failed to load dashboard data", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const section = localStorage.getItem('erp_active_section') || 'KKVS';
      setActiveSection(section);
      fetchDashboardData(section);

      const handleSectionChanged = () => {
        const sec = localStorage.getItem('erp_active_section') || 'KKVS';
        setActiveSection(sec);
        fetchDashboardData(sec);
      };

      window.addEventListener('erp_section_changed', handleSectionChanged);
      return () => {
        window.removeEventListener('erp_section_changed', handleSectionChanged);
      };
    }
  }, []);

  useEffect(() => {
    const fetchSpecificDateLogs = async () => {
      if (!selectedDate) return;
      
      // If selectedDate is within DASHBOARD_START and DASHBOARD_END, we filter the pre-loaded attendance in memory
      if (selectedDate >= DASHBOARD_START && selectedDate <= DASHBOARD_END) {
        const filtered = attendance.filter(log => log.date === selectedDate);
        setDateSpecificLogs(filtered);
        return;
      }

      // Otherwise, fetch dynamically from DB
      setDateLogsLoading(true);
      try {
        let dayLogs: AttendanceLog[] = [];
        if (activeSection === 'ALL') {
          let activeSectionsList: string[] = [];
          if (typeof window !== 'undefined') {
            const stored = localStorage.getItem('erp_join_sections');
            if (stored) {
              try {
                activeSectionsList = JSON.parse(stored);
              } catch (e) {}
            }
          }
          const storedSections = await getSections();
          for (const sec of storedSections) {
            if (!activeSectionsList.includes(sec.section_code)) continue;
            try {
              const logs = await getAttendanceLogs(sec.section_code, selectedDate, selectedDate);
              dayLogs = [...dayLogs, ...logs];
            } catch (err) {
              console.error(`Failed to fetch custom date logs for ${sec.section_code}`, err);
            }
          }
        } else {
          dayLogs = await getAttendanceLogs(activeSection, selectedDate, selectedDate);
        }
        setDateSpecificLogs(dayLogs);
      } catch (err) {
        console.error("Failed to load date specific logs", err);
      } finally {
        setDateLogsLoading(false);
      }
    };

    fetchSpecificDateLogs();
  }, [selectedDate, attendance, activeSection]);

  // Dynamic shift calculation helpers for checker
  const getBaseRotatingShiftForDate = (employee: Employee, dateStr: string) => {
    const s = employee.weekly_schedule as any;
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

    if (s.type === 'rotating-3week') {
      const cycleDay = ((diffDays % 21) + 21) % 21;
      const weekNum = Math.floor(cycleDay / 7) + 1;
      const dayOfWeek = target.toLocaleDateString('en-US', { weekday: 'long' });
      const wk = `week${weekNum}`;
      return s[wk]?.[dayOfWeek] || null;
    } else {
      const cycleDay = ((diffDays % 28) + 28) % 28;
      const weekNum = Math.floor(cycleDay / 7) + 1;
      const dayOfWeek = target.toLocaleDateString('en-US', { weekday: 'long' });
      const wk = `week${weekNum}`;
      return s[wk]?.[dayOfWeek] || null;
    }
  };

  const getShiftForDate = (employee: Employee, dateStr: string) => {
    const s = employee.weekly_schedule as any;
    if (!s) return null;
    const overrides = s.custom_night_weeks;
    if (Array.isArray(overrides)) {
      const override = overrides.find(w => dateStr >= w.from_date && dateStr <= w.to_date);
      if (override) {
        const baseShift = getBaseRotatingShiftForDate(employee, dateStr);
        if (baseShift === 'R') return 'R';
        return override.shift || 'N';
      }
    }
    return getBaseRotatingShiftForDate(employee, dateStr);
  };

  // Compute Metrics
  const totalStaff = employees.length;
  const sseCount = employees.filter(e => e.designation.toLowerCase().includes('sse')).length;
  const jeCount = employees.filter(e => e.designation.toLowerCase().includes('je')).length;
  const techCount = employees.filter(e => e.designation.toLowerCase().includes('tech')).length;
  const helperCount = employees.filter(e => e.designation.toLowerCase().includes('assist') || e.designation.toLowerCase().includes('help')).length;

  const totalNightDutyShifts = attendance.filter(a => a.status === 'P/N').length;
  const totalLeavesUsed = attendance.filter(a => ['CL', 'LAP', 'Sick', 'SCL'].includes(a.status)).length;
  
  // Leaves details
  const clCount = attendance.filter(a => a.status === 'CL').length;
  const lapCount = attendance.filter(a => a.status === 'LAP').length;
  const sickCount = attendance.filter(a => a.status === 'Sick').length;

  // CR tracking
  const totalCRAvailed = attendance.filter(a => a.status === 'CR').length;
  
  let totalCREarned = 0;
  employees.forEach(emp => {
    const empLogs = attendance.filter(a => a.emp_id === emp.emp_id);
    empLogs.forEach(log => {
      if (['P', 'P/N'].includes(log.status)) {
        const logDate = new Date(log.date);
        const weekday = logDate.toLocaleDateString('en-US', { weekday: 'long' });
        if (weekday === emp.default_rest_day) {
          totalCREarned++;
        }
      }
    });
  });
  const totalCRAccrued = Math.max(0, totalCREarned - totalCRAvailed);

  // Categorize staff shifts for checker
  const categorizeStaffAvailability = () => {
    const morningList: Employee[] = [];
    const eveningList: Employee[] = [];
    const nightList: Employee[] = [];
    const generalList: Employee[] = [];
    const restOrLeaveList: { emp: Employee; reason: string; labelBg: string }[] = [];

    employees.forEach(emp => {
      // Find log status if any
      const log = dateSpecificLogs.find(l => l.emp_id === emp.emp_id);
      
      if (log) {
        if (['CL', 'LAP', 'Sick', 'SCL'].includes(log.status)) {
          let reason = 'On Leave';
          let labelBg = 'bg-amber-100 text-amber-800 border-amber-300';
          if (log.status === 'CL') { reason = 'Casual Leave (CL)'; }
          else if (log.status === 'LAP') { reason = 'LAP Leave'; labelBg = 'bg-orange-100 text-orange-850 border-orange-300'; }
          else if (log.status === 'Sick') { reason = 'Medical Sick'; labelBg = 'bg-red-100 text-red-800 border-red-300'; }
          else if (log.status === 'SCL') { reason = 'Special CL'; labelBg = 'bg-pink-100 text-pink-850 border-pink-300'; }
          restOrLeaveList.push({ emp, reason, labelBg });
          return;
        }
        if (log.status === 'CR') {
          restOrLeaveList.push({ emp, reason: 'Compensatory Rest (CR)', labelBg: 'bg-sky-100 text-sky-850 border-sky-300' });
          return;
        }
        if (log.status === 'R') {
          restOrLeaveList.push({ emp, reason: 'Weekly Rest Day', labelBg: 'bg-slate-100 text-slate-500 border-slate-200' });
          return;
        }
        if (log.status === 'PH') {
          restOrLeaveList.push({ emp, reason: 'Public Holiday (PH)', labelBg: 'bg-yellow-100 text-yellow-805 border-yellow-300' });
          return;
        }
        
        // If present P or P/N
        if (log.status === 'P' || log.status === 'P/N') {
          const shift = getShiftForDate(emp, selectedDate) || 'G';
          const code = shift.toUpperCase();
          if (log.status === 'P/N' || log.is_night || code === 'N') {
            nightList.push(emp);
          } else if (code === 'M') {
            morningList.push(emp);
          } else if (code === 'E') {
            eveningList.push(emp);
          } else {
            generalList.push(emp);
          }
          return;
        }
      }

      // No log in database, check scheduled cycle
      const schedShift = getShiftForDate(emp, selectedDate) || 'R';
      const code = schedShift.toUpperCase();

      if (code === 'R') {
        restOrLeaveList.push({ emp, reason: 'Weekly Rest Day', labelBg: 'bg-slate-100 text-slate-500 border-slate-200' });
      } else if (code === 'N') {
        nightList.push(emp);
      } else if (code === 'M') {
        morningList.push(emp);
      } else if (code === 'E') {
        eveningList.push(emp);
      } else if (code === 'G' || code === 'P') {
        generalList.push(emp);
      } else {
        generalList.push(emp);
      }
    });

    return { morningList, eveningList, nightList, generalList, restOrLeaveList };
  };

  const { morningList, eveningList, nightList, generalList, restOrLeaveList } = categorizeStaffAvailability();

  if (empIdStr) {
    return <EmployeeProfile360 empId={Number(empIdStr)} onClose={() => router.push('/')} />;
  }

  return (
    <div className="p-6 space-y-6">
      
      {/* Title section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
            Dashboard Overview
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-theme-active text-theme-active border border-theme-active/30 font-semibold uppercase tracking-wider">
              {activeSection === 'ALL' ? 'Joint View' : `${activeSection} Section`}
            </span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Real-time operations, shift compliance, and attendance ratios for Kolkata Metro S&T staff.
          </p>
        </div>
        
        <div className="text-xs text-slate-600 font-bold bg-slate-100 px-4 py-2 rounded-lg border border-slate-200">
          Current Roster Period: <span className="text-theme-primary font-extrabold">{new Date(DASHBOARD_START).toLocaleDateString('en-GB').replace(/\//g, '.')} to {new Date(DASHBOARD_END).toLocaleDateString('en-GB').replace(/\//g, '.')}</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* Card 1: Total Staff */}
        <div className="relative overflow-hidden bg-gradient-to-br from-white to-[var(--theme-active-bg)]/20 border border-slate-200/80 hover:border-theme-active rounded-2xl p-5 pl-6 flex items-center gap-4 hover-lift cursor-pointer group">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-theme-primary opacity-85"></div>
          <div className="w-12 h-12 rounded-xl bg-theme-active border border-theme-active/40 flex items-center justify-center text-theme-primary shadow-inner transition-transform duration-300 group-hover:scale-105">
            <Users size={22} className="stroke-[2.5]" />
          </div>
          <div className="flex-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Staff Count</span>
            {loading ? (
              <div className="h-7 w-16 bg-[#E5E3DC] animate-pulse rounded mt-1" />
            ) : (
              <h3 className="text-2xl font-black text-slate-800 mt-0.5">{totalStaff}</h3>
            )}
            <p className="text-[11px] text-slate-500 font-bold mt-0.5">
              {sseCount} SSE | {jeCount} JE | {techCount + helperCount} Staff
            </p>
          </div>
        </div>

        {/* Card 2: Compensatory Rest (CR) */}
        <div className="relative overflow-hidden bg-gradient-to-br from-white to-emerald-50/10 border border-slate-200/80 hover:border-emerald-300 rounded-2xl p-5 pl-6 flex items-center gap-4 hover-lift cursor-pointer group">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-emerald-500 to-teal-500 opacity-85"></div>
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-inner transition-transform duration-300 group-hover:scale-105">
            <CalendarDays size={22} className="stroke-[2.5]" />
          </div>
          <div className="flex-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Compensatory Rest</span>
            {loading ? (
              <div className="h-7 w-24 bg-[#E5E3DC] animate-pulse rounded mt-1" />
            ) : (
              <h3 className="text-2xl font-black text-slate-800 mt-0.5">{totalCRAvailed} Consumed</h3>
            )}
            <p className="text-[11px] text-slate-500 font-bold mt-0.5">
              {totalCREarned} Earned | {totalCRAccrued} Accrued (Available)
            </p>
          </div>
        </div>

        {/* Card 3: Night Duty shifts */}
        <div className="relative overflow-hidden bg-gradient-to-br from-white to-purple-50/10 border border-slate-200/80 hover:border-purple-300 rounded-2xl p-5 pl-6 flex items-center gap-4 hover-lift cursor-pointer group">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-purple-500 to-pink-500 opacity-85"></div>
          <div className="w-12 h-12 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600 shadow-inner transition-transform duration-300 group-hover:scale-105">
            <Moon size={22} className="stroke-[2.5]" />
          </div>
          <div className="flex-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Night Duties</span>
            {loading ? (
              <div className="h-7 w-16 bg-[#E5E3DC] animate-pulse rounded mt-1" />
            ) : (
              <h3 className="text-2xl font-black text-slate-800 mt-0.5">{totalNightDutyShifts}</h3>
            )}
            <p className="text-[11px] text-slate-500 font-bold mt-0.5">
              Accumulated shifts in current cycle
            </p>
          </div>
        </div>

        {/* Card 4: Leaves Logged */}
        <div className="relative overflow-hidden bg-gradient-to-br from-white to-amber-50/10 border border-slate-200/80 hover:border-amber-300 rounded-2xl p-5 pl-6 flex items-center gap-4 hover-lift cursor-pointer group">
          <div className="absolute top-0 left-0 w-1.5 h-full bg-gradient-to-b from-amber-500 to-orange-500 opacity-85"></div>
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-inner transition-transform duration-300 group-hover:scale-105">
            <CalendarCheck size={22} className="stroke-[2.5]" />
          </div>
          <div className="flex-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Leaves Logged</span>
            {loading ? (
              <div className="h-7 w-16 bg-[#E5E3DC] animate-pulse rounded mt-1" />
            ) : (
              <h3 className="text-2xl font-black text-slate-800 mt-0.5">{totalLeavesUsed}</h3>
            )}
            <p className="text-[11px] text-slate-500 font-bold mt-0.5">
              {clCount} CL | {lapCount} LAP | {sickCount} Medical
            </p>
          </div>
        </div>
      </div>

      {/* Daily Shift & Roster Availability Checker Card */}
      <div className="glass-panel p-5 rounded-2xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4 border-b border-slate-150 pb-3">
          <div>
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <CalendarDays size={18} className="text-theme-primary font-bold" />
              Daily Shift & Roster Availability Board
            </h3>
            <p className="text-[11px] text-slate-550 font-semibold mt-0.5">
              Select a date to view dynamic staff availability across scheduled shifts and roster overrides.
            </p>
          </div>
          
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            {/* Quick date switches */}
            <div className="flex items-center gap-1 p-0.5 bg-slate-100 border border-slate-200 rounded-lg text-[10px] font-bold">
              {(() => {
                const getPastFutureDate = (diff: number) => {
                  const dObj = new Date();
                  dObj.setDate(dObj.getDate() + diff);
                  return `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}-${String(dObj.getDate()).padStart(2, '0')}`;
                };
                const yDate = getPastFutureDate(-1);
                const tDate = getTodayDateStr();
                const tmDate = getPastFutureDate(1);
                
                return (
                  <>
                    <button
                      type="button"
                      onClick={() => setSelectedDate(yDate)}
                      className={`px-2.5 py-1 rounded text-[9px] font-extrabold uppercase transition-all duration-150 cursor-pointer ${
                        selectedDate === yDate ? 'bg-theme-primary text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Yesterday
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDate(tDate)}
                      className={`px-2.5 py-1 rounded text-[9px] font-extrabold uppercase transition-all duration-150 cursor-pointer ${
                        selectedDate === tDate ? 'bg-theme-primary text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Today
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedDate(tmDate)}
                      className={`px-2.5 py-1 rounded text-[9px] font-extrabold uppercase transition-all duration-150 cursor-pointer ${
                        selectedDate === tmDate ? 'bg-theme-primary text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Tomorrow
                    </button>
                  </>
                );
              })()}
            </div>
            
            <div className="w-44 shrink-0">
              <CustomDatePicker
                value={selectedDate}
                onChange={(val) => val && setSelectedDate(val)}
                placeholder="Select Date"
              />
            </div>
          </div>
        </div>

        {dateLogsLoading || loading ? (
          <div className="py-12 text-center text-xs font-semibold text-slate-400 flex items-center justify-center gap-2">
            <Clock size={16} className="animate-spin text-theme-primary" />
            Recalculating shift compliance and staff roster availability...
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            
            {/* 1. Morning Shift (M) */}
            <div className="rounded-2xl p-4 bg-slate-50/50 flex flex-col space-y-3 shadow-2xs">
              <div className="flex justify-between items-center border-b border-slate-200/60 pb-1.5">
                <span className="text-[10px] font-black text-sky-700 tracking-wider uppercase flex items-center gap-1">
                  <Sunrise size={13} className="text-sky-500 fill-sky-50" />
                  Morning Shift (M)
                </span>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-sky-100 text-sky-850 font-black">
                  {morningList.length} Staff
                </span>
              </div>
              <div className="flex-1 space-y-2 max-h-56 overflow-y-auto pr-1">
                {morningList.length === 0 ? (
                  <span className="text-[10.5px] font-medium text-slate-400 italic block py-4 text-center">No staff scheduled</span>
                ) : (
                  morningList.map(emp => (
                    <div 
                      key={emp.emp_id} 
                      onClick={() => router.push(`/employees?id=${emp.emp_id}`)}
                      className="bg-white hover:bg-slate-50/30 rounded-xl p-3 flex items-center justify-between shadow-sm hover:shadow-md transition-all duration-205 cursor-pointer hover:-translate-y-0.5 transform"
                    >
                      <span className="text-[13px] font-bold text-slate-800 truncate mr-1.5">{emp.name}</span>
                      <span className="text-[9.5px] font-extrabold text-sky-750 bg-sky-50 px-2 py-0.5 rounded shrink-0 uppercase tracking-wider">{emp.designation}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 2. Evening Shift (E) */}
            <div className="rounded-2xl p-4 bg-slate-50/50 flex flex-col space-y-3 shadow-2xs">
              <div className="flex justify-between items-center border-b border-slate-200/60 pb-1.5">
                <span className="text-[10px] font-black text-orange-705 tracking-wider uppercase flex items-center gap-1">
                  <Sunset size={13} className="text-orange-500 fill-orange-50" />
                  Evening Shift (E)
                </span>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-orange-100 text-orange-850 font-black">
                  {eveningList.length} Staff
                </span>
              </div>
              <div className="flex-1 space-y-2 max-h-56 overflow-y-auto pr-1">
                {eveningList.length === 0 ? (
                  <span className="text-[10.5px] font-medium text-slate-400 italic block py-4 text-center">No staff scheduled</span>
                ) : (
                  eveningList.map(emp => (
                    <div 
                      key={emp.emp_id} 
                      onClick={() => router.push(`/employees?id=${emp.emp_id}`)}
                      className="bg-white hover:bg-slate-50/30 rounded-xl p-3 flex items-center justify-between shadow-sm hover:shadow-md transition-all duration-205 cursor-pointer hover:-translate-y-0.5 transform"
                    >
                      <span className="text-[13px] font-bold text-slate-800 truncate mr-1.5">{emp.name}</span>
                      <span className="text-[9.5px] font-extrabold text-orange-750 bg-orange-50 px-2 py-0.5 rounded shrink-0 uppercase tracking-wider">{emp.designation}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 3. Night Shift (N / P/N) */}
            <div className="rounded-2xl p-4 bg-slate-50/50 flex flex-col space-y-3 shadow-2xs">
              <div className="flex justify-between items-center border-b border-slate-200/60 pb-1.5">
                <span className="text-[10px] font-black text-purple-700 tracking-wider uppercase flex items-center gap-1">
                  <Moon size={13} className="text-purple-500 fill-purple-50" />
                  Night Shift (N)
                </span>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-850 font-black">
                  {nightList.length} Staff
                </span>
              </div>
              <div className="flex-1 space-y-2 max-h-56 overflow-y-auto pr-1">
                {nightList.length === 0 ? (
                  <span className="text-[10.5px] font-medium text-slate-400 italic block py-4 text-center">No staff scheduled</span>
                ) : (
                  nightList.map(emp => (
                    <div 
                      key={emp.emp_id} 
                      onClick={() => router.push(`/employees?id=${emp.emp_id}`)}
                      className="bg-white hover:bg-slate-50/30 rounded-xl p-3 flex items-center justify-between shadow-sm hover:shadow-md transition-all duration-205 cursor-pointer hover:-translate-y-0.5 transform"
                    >
                      <span className="text-[13px] font-bold text-slate-800 truncate mr-1.5">{emp.name}</span>
                      <span className="text-[9.5px] font-extrabold text-purple-750 bg-purple-50 px-2 py-0.5 rounded shrink-0 uppercase tracking-wider">{emp.designation}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 4. General Shift (G) */}
            <div className="rounded-2xl p-4 bg-slate-50/50 flex flex-col space-y-3 shadow-2xs">
              <div className="flex justify-between items-center border-b border-slate-200/60 pb-1.5">
                <span className="text-[10px] font-black text-emerald-700 tracking-wider uppercase flex items-center gap-1">
                  <Sun size={13} className="text-emerald-500 fill-emerald-50" />
                  General Shift (G)
                </span>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-850 font-black">
                  {generalList.length} Staff
                </span>
              </div>
              <div className="flex-1 space-y-2 max-h-56 overflow-y-auto pr-1">
                {generalList.length === 0 ? (
                  <span className="text-[10.5px] font-medium text-slate-400 italic block py-4 text-center">No staff scheduled</span>
                ) : (
                  generalList.map(emp => (
                    <div 
                      key={emp.emp_id} 
                      onClick={() => router.push(`/employees?id=${emp.emp_id}`)}
                      className="bg-white hover:bg-slate-50/30 rounded-xl p-3 flex items-center justify-between shadow-sm hover:shadow-md transition-all duration-205 cursor-pointer hover:-translate-y-0.5 transform"
                    >
                      <span className="text-[13px] font-bold text-slate-800 truncate mr-1.5">{emp.name}</span>
                      <span className="text-[9.5px] font-extrabold text-emerald-750 bg-emerald-50 px-2 py-0.5 rounded shrink-0 uppercase tracking-wider">{emp.designation}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 5. Rest Day / On Leave / Off Duty */}
            <div className="rounded-2xl p-4 bg-slate-50/50 flex flex-col space-y-3 shadow-2xs">
              <div className="flex justify-between items-center border-b border-slate-200/60 pb-1.5">
                <span className="text-[10px] font-black text-slate-600 tracking-wider uppercase flex items-center gap-1">
                  <Coffee size={13} className="text-slate-500" />
                  Rest & Off Duty
                </span>
                <span className="text-[9px] px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 font-black">
                  {restOrLeaveList.length} Staff
                </span>
              </div>
              <div className="flex-1 space-y-2 max-h-56 overflow-y-auto pr-1">
                {restOrLeaveList.length === 0 ? (
                  <span className="text-[10.5px] font-medium text-slate-400 italic block py-4 text-center">No off-duty staff</span>
                ) : (
                  restOrLeaveList.map(({ emp, reason, labelBg }) => (
                    <div 
                      key={emp.emp_id} 
                      onClick={() => router.push(`/employees?id=${emp.emp_id}`)}
                      className="bg-white hover:bg-slate-50/30 rounded-xl p-3 flex flex-col gap-2 shadow-sm hover:shadow-md transition-all duration-205 cursor-pointer hover:-translate-y-0.5 transform"
                    >
                      <div className="flex justify-between items-center w-full">
                        <span className="text-[13px] font-bold text-slate-800 truncate mr-1.5">{emp.name}</span>
                        <span className="text-[9.5px] font-extrabold text-slate-500 bg-slate-100 px-2 py-0.5 rounded shrink-0 uppercase tracking-wider">{emp.designation}</span>
                      </div>
                      <span className={`text-[8.5px] font-black px-2.5 py-0.5 rounded-full text-center w-max uppercase tracking-wider border ${labelBg}`}>
                        {reason}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

          </div>
        )}
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Section List (Left 2 cols) */}
        <div className="lg:col-span-2 glass-panel rounded-xl border border-slate-200 flex flex-col overflow-hidden bg-white">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h4 className="font-bold text-slate-855 flex items-center gap-2">
              <Award size={18} className="text-theme-primary" />
              S&T Staff Designations & Roster
            </h4>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
              {employees.length} Members
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse table-fixed">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-bold text-slate-500 uppercase bg-slate-50">
                  <th className="py-3 px-5 w-[25%]">PF Number</th>
                  <th className="py-3 px-5 w-[35%]">Name</th>
                  <th className="py-3 px-5 w-[20%]">Designation</th>
                  <th className="py-3 px-5 w-[10%]">Level</th>
                  <th className="py-3 px-5 w-[10%]">Rest Day</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="py-4 px-5"><div className="h-4 w-24 bg-[#E5E3DC] rounded" /></td>
                      <td className="py-4 px-5"><div className="h-4 w-32 bg-[#E5E3DC] rounded" /></td>
                      <td className="py-4 px-5"><div className="h-4 w-20 bg-[#E5E3DC] rounded" /></td>
                      <td className="py-4 px-5"><div className="h-4 w-12 bg-[#E5E3DC] rounded" /></td>
                      <td className="py-4 px-5"><div className="h-4 w-16 bg-[#E5E3DC] rounded" /></td>
                    </tr>
                  ))
                ) : employees.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No employees found for the selected section.
                    </td>
                  </tr>
                ) : (
                (() => {
                  let lastSection = '';
                  return employees.flatMap((emp) => {
                    const showSectionHeader = activeSection === 'ALL' && emp.section_code !== lastSection;
                    if (showSectionHeader) {
                      lastSection = emp.section_code || '';
                    }

                    const rows = [];
                    if (showSectionHeader) {
                      const secName = emp.section_code === 'KKVS' ? 'KKVS Section' : emp.section_code === 'KMUK' ? 'KMUK Section' : emp.section_code === 'KNAP' ? 'KNAP Section' : `${emp.section_code} Section`;
                      rows.push(
                        <tr key={`sec-header-${emp.section_code}`} className="bg-slate-100 font-extrabold text-[11px] tracking-wider text-slate-700 uppercase no-print select-none">
                          <td colSpan={5} className="py-2 px-4 text-left border-y border-slate-200 bg-slate-150">
                            <span className="bg-[#00c2b2] text-white font-black px-2 py-0.5 rounded mr-2 text-[9px] uppercase tracking-widest shadow-xs">Section</span>
                            <span className="font-black text-slate-800">{secName}</span>
                          </td>
                        </tr>
                      );
                    }

                    rows.push(
                      <tr key={emp.emp_id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => router.push(`/?id=${emp.emp_id}`)}>
                        <td className="py-3 px-5 font-mono text-slate-700 font-bold">{emp.pf_number}</td>
                        <td className="py-3 px-5 font-bold text-[#191919]">{emp.name}</td>
                        <td className="py-3 px-5">
                          <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold">
                            {emp.designation}
                          </span>
                        </td>
                        <td className="py-3 px-5">
                          <span className="text-xs font-extrabold text-theme-active">Lvl {emp.level}</span>
                        </td>
                        <td className="py-3 px-5">
                          <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold">
                            {emp.default_rest_day}
                          </span>
                        </td>
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

        {/* Sidebar events & activities (Right 1 col) */}
        <div className="glass-panel rounded-xl border border-slate-200 flex flex-col p-5 space-y-5 bg-white">
          <h4 className="font-bold text-slate-800 flex items-center gap-2 border-b border-slate-200 pb-3">
            <TrendingUp size={18} className="text-theme-primary" />
            Special Events & Orders
          </h4>

          <div className="space-y-4 flex-1 overflow-y-auto max-h-[350px]">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <div key={i} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2.5 animate-pulse">
                  <div className="flex justify-between items-center">
                    <div className="h-3.5 w-16 bg-[#E5E3DC] rounded" />
                    <div className="h-3.5 w-24 bg-[#E5E3DC] rounded" />
                  </div>
                  <div className="h-3 w-32 bg-[#E5E3DC] rounded" />
                  <div className="h-3 w-20 bg-[#E5E3DC] rounded" />
                </div>
              ))
            ) : specialEvents.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-8 text-center">
                <p className="text-xs text-slate-400 font-bold">No special events registered in this cycle.</p>
                <p className="text-[10px] text-slate-500 mt-1">Special events like Transfers or Training will display here.</p>
              </div>
            ) : (
              specialEvents.map((evt) => (
                <div key={evt.id} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-theme-accent uppercase tracking-wider">
                      {evt.event_type}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">
                      {new Date(evt.from_date).toLocaleDateString('en-GB')} - {new Date(evt.to_date).toLocaleDateString('en-GB')}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">
                    Employee ID: <span className="font-mono text-slate-500">{evt.emp_id}</span>
                  </p>
                  {evt.order_number && (
                    <div className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono w-max">
                      Order: {evt.order_number}
                    </div>
                  )}
                  {evt.location && (
                    <p className="text-[11px] text-slate-500">
                      Location: <span className="text-slate-700 font-semibold">{evt.location}</span>
                    </p>
                  )}
                </div>
              ))
            )}
          </div>

          <div className="pt-2 border-t border-slate-200">
            <Link 
              href="/attendance"
              className="flex items-center justify-between p-2.5 rounded bg-theme-primary hover-opacity-85 text-white font-bold text-xs tracking-wider uppercase transition shadow-md cursor-pointer"
            >
              Go to Smart Attendance Grid
              <ArrowRight size={14} />
            </Link>
          </div>
        </div>

      </div>

    </div>
  );
}

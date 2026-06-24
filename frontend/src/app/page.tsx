'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Users, 
  Moon, 
  CalendarDays, 
  CalendarRange, 
  Award,
  ArrowRight,
  TrendingUp,
  UserCheck,
  CalendarCheck
} from 'lucide-react';
import { getEmployees, getAttendanceLogs, getSpecialEvents, getSections, Employee, AttendanceLog, SpecialEvent } from '../lib/api';

export default function Dashboard() {
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<string>('KKVS');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceLog[]>([]);
  const [specialEvents, setSpecialEvents] = useState<SpecialEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

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
      const storedSections = await getSections();
      
      let jointLogs: AttendanceLog[] = [];
      if (section === 'ALL') {
        for (const sec of storedSections) {
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
      
      setEmployees(emps);
      setAttendance(jointLogs);
      setSpecialEvents(events);
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
                  employees.map((emp) => (
                    <tr key={emp.emp_id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => router.push(`/employees?id=${emp.emp_id}`)}>
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
                  ))
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

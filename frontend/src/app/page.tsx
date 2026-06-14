'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
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
  const [activeSection, setActiveSection] = useState<string>('KKVS');
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceLog[]>([]);
  const [specialEvents, setSpecialEvents] = useState<SpecialEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Hardcode current visual cycle range for dashboard KPI counts
  const DASHBOARD_START = '2026-05-11';
  const DASHBOARD_END = '2026-06-10';
  const DASHBOARD_TODAY = '2026-05-20'; // Mid-cycle mock date to calculate active presence

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
  
  // Today's presence metrics based on mid-cycle date representation
  const todayAttendance = attendance.filter(a => a.date === DASHBOARD_TODAY);
  const presentToday = todayAttendance.filter(a => ['P', 'P/N'].includes(a.status)).length;
  const onLeaveToday = todayAttendance.filter(a => ['CL', 'LAP', 'Sick', 'SCL'].includes(a.status)).length;
  const restToday = todayAttendance.filter(a => a.status === 'R' || a.status === 'CR').length;

  return (
    <div className="p-6 space-y-6">
      
      {/* Title section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
            Dashboard Overview
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 font-semibold uppercase tracking-wider">
              {activeSection === 'ALL' ? 'Joint View' : `${activeSection} Section`}
            </span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Real-time operations, shift compliance, and attendance ratios for Kolkata Metro S&T staff.
          </p>
        </div>
        
        <div className="text-xs text-slate-600 font-bold bg-slate-100 px-4 py-2 rounded-lg border border-slate-200">
          Current Roster Period: <span className="text-blue-600 font-extrabold">11.05.2026 to 10.06.2026</span>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
        
        {/* Card 1: Total Staff */}
        <div className="relative overflow-hidden bg-gradient-to-br from-white to-blue-50/10 border border-slate-200/80 hover:border-blue-300 rounded-2xl p-5 flex items-center gap-4 transition-all duration-300 shadow-sm hover:shadow-md cursor-pointer group">
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-600 shadow-inner transition-transform duration-300 group-hover:scale-105">
            <Users size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Staff Count</span>
            <h3 className="text-2xl font-black text-slate-800 mt-0.5">{loading ? '...' : totalStaff}</h3>
            <p className="text-[11px] text-slate-500 font-bold mt-0.5">
              {sseCount} SSE | {jeCount} JE | {techCount + helperCount} Staff
            </p>
          </div>
        </div>

        {/* Card 2: Today's Presence */}
        <div className="relative overflow-hidden bg-gradient-to-br from-white to-emerald-50/10 border border-slate-200/80 hover:border-emerald-300 rounded-2xl p-5 flex items-center gap-4 transition-all duration-300 shadow-sm hover:shadow-md cursor-pointer group">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-inner transition-transform duration-300 group-hover:scale-105">
            <UserCheck size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Today's Presence</span>
            <h3 className="text-2xl font-black text-slate-800 mt-0.5">
              {loading ? '...' : `${presentToday} / ${totalStaff}`}
            </h3>
            <p className="text-[11px] text-slate-500 font-bold mt-0.5">
              {onLeaveToday} On Leave | {restToday} Weekly Rest
            </p>
          </div>
        </div>

        {/* Card 3: Night Duty shifts */}
        <div className="relative overflow-hidden bg-gradient-to-br from-white to-purple-50/10 border border-slate-200/80 hover:border-purple-300 rounded-2xl p-5 flex items-center gap-4 transition-all duration-300 shadow-sm hover:shadow-md cursor-pointer group">
          <div className="w-12 h-12 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-600 shadow-inner transition-transform duration-300 group-hover:scale-105">
            <Moon size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Night Duties</span>
            <h3 className="text-2xl font-black text-slate-800 mt-0.5">{loading ? '...' : totalNightDutyShifts}</h3>
            <p className="text-[11px] text-slate-500 font-bold mt-0.5">
              Accumulated shifts in current cycle
            </p>
          </div>
        </div>

        {/* Card 4: Leaves Logged */}
        <div className="relative overflow-hidden bg-gradient-to-br from-white to-amber-50/10 border border-slate-200/80 hover:border-amber-300 rounded-2xl p-5 flex items-center gap-4 transition-all duration-300 shadow-sm hover:shadow-md cursor-pointer group">
          <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shadow-inner transition-transform duration-300 group-hover:scale-105">
            <CalendarCheck size={22} className="stroke-[2.5]" />
          </div>
          <div>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Leaves Logged</span>
            <h3 className="text-2xl font-black text-slate-800 mt-0.5">{loading ? '...' : totalLeavesUsed}</h3>
            <p className="text-[11px] text-slate-500 font-bold mt-0.5">
              Total CL & LAP entries this cycle
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Section List (Left 2 cols) */}
        <div className="lg:col-span-2 glass-panel rounded-xl border border-slate-200 flex flex-col overflow-hidden bg-white">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h4 className="font-bold text-slate-850 flex items-center gap-2">
              <Award size={18} className="text-blue-600" />
              S&T Staff Designations & Roster
            </h4>
            <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
              {employees.length} Members
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-bold text-slate-500 uppercase bg-slate-50">
                  <th className="py-3 px-5">PF Number</th>
                  <th className="py-3 px-5">Name</th>
                  <th className="py-3 px-5">Designation</th>
                  <th className="py-3 px-5">Level</th>
                  <th className="py-3 px-5">Rest Day</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      Loading employee directory...
                    </td>
                  </tr>
                ) : employees.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-400">
                      No employees found for the selected section.
                    </td>
                  </tr>
                ) : (
                  employees.map((emp) => (
                    <tr key={emp.emp_id} className="hover:bg-[#F5F3EF]/40 transition-colors cursor-pointer" onClick={() => window.location.href=`/employees/${emp.emp_id}`}>
                      <td className="py-3 px-5 font-mono text-slate-700 font-bold">{emp.pf_number}</td>
                      <td className="py-3 px-5 font-bold text-[#191919]">{emp.name}</td>
                      <td className="py-3 px-5">
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-bold">
                          {emp.designation}
                        </span>
                      </td>
                      <td className="py-3 px-5">
                        <span className="text-xs font-extrabold text-blue-700">Lvl {emp.level}</span>
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
            <TrendingUp size={18} className="text-blue-600" />
            Special Events & Orders
          </h4>

          <div className="space-y-4 flex-1 overflow-y-auto max-h-[350px]">
            {loading ? (
              <p className="text-center py-6 text-sm text-slate-400">Loading special orders...</p>
            ) : specialEvents.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center py-8 text-center">
                <p className="text-xs text-slate-400 font-bold">No special events registered in this cycle.</p>
                <p className="text-[10px] text-slate-500 mt-1">Special events like Transfers or Training will display here.</p>
              </div>
            ) : (
              specialEvents.map((evt) => (
                <div key={evt.id} className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-blue-600 uppercase tracking-wider">
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
              className="flex items-center justify-between p-2.5 rounded bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs tracking-wider uppercase transition shadow-md shadow-blue-500/10 cursor-pointer"
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

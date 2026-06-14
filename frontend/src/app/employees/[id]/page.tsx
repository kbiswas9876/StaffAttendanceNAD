'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { 
  User, 
  Calendar, 
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
  Edit
} from 'lucide-react';
import { getEmployeeById, getLeaveBank, getEmployeeAttendanceLogs, getSpecialEvents, Employee, LeaveBank, AttendanceLog, SpecialEvent, updateLeaveBank } from '../../../lib/api';

export default function EmployeeProfile360() {
  const params = useParams();
  const router = useRouter();
  const empId = Number(params.id);

  const [employee, setEmployee] = useState<Employee | null>(null);
  const [leaveBank, setLeaveBank] = useState<LeaveBank | null>(null);
  const [attendance, setAttendance] = useState<AttendanceLog[]>([]);
  const [specialEvents, setSpecialEvents] = useState<SpecialEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  // Calendar render states (Year: 2026)
  const [selectedYear, setSelectedYear] = useState(2026);

  // Edit leave balances states
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTotalCl, setEditTotalCl] = useState(8);
  const [editTotalLap, setEditTotalLap] = useState(30);
  const [editUsedCl, setEditUsedCl] = useState(0);
  const [editUsedLap, setEditUsedLap] = useState(0);
  const [editAccruedCr, setEditAccruedCr] = useState(0);
  const [isSaving, setIsSaving] = useState(false);

  const openEditModal = () => {
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
      alert("Failed to update leave balances");
    } finally {
      setIsSaving(false);
    }
  };

  const loadProfileData = async () => {
    setLoading(true);
    try {
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
      <div className="h-screen flex items-center justify-center text-sm font-semibold text-slate-400">
        Loading employee 360° profile...
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="p-6 space-y-4">
        <button onClick={() => router.push('/employees')} className="flex items-center gap-1 text-xs font-bold text-slate-650 hover:text-blue-600 transition">
          <ArrowLeft size={14} /> Back to Directory
        </button>
        <div className="glass-panel p-12 text-center rounded-xl">
          <Inbox className="mx-auto text-slate-300 mb-2" size={32} />
          <p className="text-sm font-bold text-slate-500">Employee not found on system.</p>
        </div>
      </div>
    );
  }

  // Group attendance log by date map for quick lookup
  const attendanceMap: { [date: string]: string } = {};
  attendance.forEach(log => {
    attendanceMap[log.date] = log.status;
  });

  // Compile timeline journey blocks in chronological order
  const timelineJourney: { date: string; title: string; desc: string; type: 'milestone' | 'event' | 'leave' }[] = [];
  
  // 1. Joining Date
  if (employee.joining_date) {
    timelineJourney.push({
      date: employee.joining_date,
      title: "Joined Metro Railway Kolkata S&T",
      desc: `Enrolled as ${employee.designation} in section ${employee.section_code} at level ${employee.level}`,
      type: 'milestone'
    });
  }

  // 2. Special events (Transfers/Training)
  specialEvents.forEach(evt => {
    timelineJourney.push({
      date: evt.from_date,
      title: `Event: ${evt.event_type}`,
      desc: `Order: ${evt.order_number} | Details/Location: ${evt.location} (Duration until ${evt.to_date})`,
      type: 'event'
    });
  });

  // 3. Leaf / Rest day blocks (CL, LAP, Sick)
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

  // Sort timeline journey chronologically (newest first)
  timelineJourney.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Roster status color mapping helper
  const getStatusColor = (status: string) => {
    if (!status) return 'bg-slate-100 hover:bg-slate-200/70 border border-slate-200';
    
    const colors: { [key: string]: string } = {
      'P': 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-250',
      'P/N': 'bg-purple-100 hover:bg-purple-200 text-purple-700 border border-purple-200',
      'R': 'bg-slate-200 hover:bg-slate-300 text-slate-500 border border-slate-300',
      'CR': 'bg-blue-100 hover:bg-blue-200 text-blue-700 border border-blue-200',
      'CL': 'bg-amber-100 hover:bg-amber-250 text-amber-700 border border-amber-200',
      'LAP': 'bg-orange-100 hover:bg-orange-200 text-orange-700 border border-orange-200',
      'Sick': 'bg-red-100 hover:bg-red-200 text-red-600 border border-red-200',
      'SCL': 'bg-rose-100 hover:bg-rose-200 text-rose-700 border border-rose-200',
      'PH': 'bg-yellow-100 hover:bg-yellow-200 text-yellow-600 border border-yellow-200'
    };

    return colors[status] || 'bg-slate-100 hover:bg-slate-200 border border-slate-200';
  };

  // Generate Year Heatmap Calendar Matrices (12 Months)
  const renderHeatmap = () => {
    const months = [
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December"
    ];

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {months.map((mName, mIdx) => {
          const daysInMonth = new Date(selectedYear, mIdx + 1, 0).getDate();
          const firstDayOffset = new Date(selectedYear, mIdx, 1).getDay(); // Sunday=0, Monday=1...
          
          const gridCells = [];
          
          // Offset blank cells
          for (let i = 0; i < (firstDayOffset === 0 ? 6 : firstDayOffset - 1); i++) {
            gridCells.push(<div key={`blank-${i}`} className="w-6 h-6 rounded bg-transparent"></div>);
          }

          // Month Day cells
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
            <div key={mName} className="glass-panel p-3 rounded-xl flex flex-col bg-white">
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

  return (
    <div className="p-6 space-y-6">
      
      {/* Header Profile toolbar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => router.push('/employees')}
            className="p-2 rounded bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 transition cursor-pointer"
          >
            <ChevronLeft size={16} />
          </button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
              {employee.name}
              <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 font-bold uppercase tracking-wider">
                PF: {employee.pf_number}
              </span>
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              {employee.designation} | Section: <strong>{employee.section_code}</strong> | Pay Level: <strong>{employee.level}</strong>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-lg p-1.5 text-sm font-bold text-slate-800">
          <Calendar size={15} className="text-slate-500 ml-1" />
          <select 
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="bg-transparent border-none focus:outline-none cursor-pointer"
          >
            <option value={2026}>2026 Roster Heatmap</option>
            <option value={2025}>2025 Roster Heatmap</option>
          </select>
        </div>
      </div>
      {/* Leave bank ledger header with Edit button */}
      {leaveBank && (
        <div className="flex justify-between items-center border-b border-slate-200 pb-3">
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
            <Database size={16} className="text-amber-500" />
            Leave Bank Ledger & Accounts ({selectedYear})
          </h3>
          <button
            onClick={openEditModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-750 text-white text-xs font-bold transition shadow-sm cursor-pointer"
          >
            <Edit size={13} />
            Edit Leave Balances
          </button>
        </div>
      )}

      {/* Leave bank ledger card info */}
      {leaveBank && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* CL Leave bank card */}
          <div className="glass-panel p-5 rounded-2xl bg-gradient-to-br from-white to-amber-50/10 flex items-center justify-between border border-slate-200/80 shadow-sm">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Casual Leave (CL)</span>
              <h3 className="text-2xl font-black text-slate-850">{leaveBank.total_cl - leaveBank.used_cl} / {leaveBank.total_cl} <span className="text-xs font-semibold text-slate-400">Days Left</span></h3>
              <p className="text-[11px] text-slate-500 font-bold">Used: {leaveBank.used_cl} days this year</p>
            </div>
            
            {/* Circular Progress Visual */}
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
                    <circle cx="32" cy="32" r={r} stroke="#f59e0b" strokeWidth="4" fill="transparent" strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-550" />
                  </svg>
                  <span className="absolute text-[10px] font-black text-slate-700">{Math.round(pct)}%</span>
                </div>
              );
            })()}
          </div>

          {/* LAP Leave bank card */}
          <div className="glass-panel p-5 rounded-2xl bg-gradient-to-br from-white to-orange-50/10 flex items-center justify-between border border-slate-200/80 shadow-sm">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Average Pay Leave (LAP)</span>
              <h3 className="text-2xl font-black text-slate-850">{leaveBank.total_lap - leaveBank.used_lap} / {leaveBank.total_lap} <span className="text-xs font-semibold text-slate-400">Days Left</span></h3>
              <p className="text-[11px] text-slate-500 font-bold">Used: {leaveBank.used_lap} days this year</p>
            </div>

            {/* Circular Progress Visual */}
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
                    <circle cx="32" cy="32" r={r} stroke="#ea580c" strokeWidth="4" fill="transparent" strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round" className="transition-all duration-550" />
                  </svg>
                  <span className="absolute text-[10px] font-black text-slate-700">{Math.round(pct)}%</span>
                </div>
              );
            })()}
          </div>

          {/* Accrued CR bank card */}
          <div className="glass-panel p-5 rounded-2xl bg-gradient-to-br from-white to-blue-50/10 flex items-center justify-between border border-slate-200/80 shadow-sm">
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Compensatory Rest Balance (CR)</span>
              <h3 className="text-2xl font-black text-slate-850">{leaveBank.accrued_cr} <span className="text-xs font-semibold text-slate-400">Accrued Balance</span></h3>
              <p className="text-[11px] text-slate-500 font-bold">Earned on Rest Day duties and manual credits</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm shadow-inner">
              CR
            </div>
          </div>
        </div>
      )}

      {/* Main Grid View */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Roster Calendar Heatmap (Left 2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-200 pb-3">
              <Calendar size={18} className="text-blue-600" />
              Attendance Ledger Calendar Heatmap ({selectedYear})
            </h3>
            
            {renderHeatmap()}
            
            {/* Guide panel */}
            <div className="pt-3 border-t border-slate-200 flex flex-wrap gap-4 text-[10px] font-bold text-slate-500 items-center">
              <span>Roster Colors:</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-white border border-slate-250"></span> Present (P)</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-purple-100 border border-purple-200"></span> Night Duty (P/N)</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-slate-200 border border-slate-300"></span> Weekly Rest (R)</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-blue-100 border border-blue-200"></span> Comp Rest (CR)</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-amber-100 border border-amber-200"></span> Casual Leave (CL)</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-orange-100 border border-orange-200"></span> LAP Leave</span>
              <span className="flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-red-100 border border-red-200"></span> Sick Leave</span>
            </div>
          </div>
        </div>

        {/* Timeline Journey View (Right 1 col) */}
        <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-200 pb-3">
            <Milestone size={18} className="text-blue-600" />
            Timeline Journey & Milestones
          </h3>

          <div className="flex-1 overflow-y-auto max-h-[500px] space-y-5 pr-2">
            {timelineJourney.length === 0 ? (
              <p className="text-center py-10 text-xs text-slate-400 font-bold">No registered milestones or timeline events.</p>
            ) : (
              <div className="relative border-l border-slate-200 ml-2.5 pl-6 space-y-6 text-xs">
                {timelineJourney.map((item, idx) => (
                  <div key={idx} className="relative">
                    {/* Node Dot icon */}
                    <span className={`absolute -left-[30px] top-0.5 w-3 h-3 rounded-full border-2 ${
                      item.type === 'milestone' 
                        ? 'bg-blue-600 border-white ring-2 ring-blue-100' 
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

      {/* Edit Leave Balances Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-slate-900/40">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                <Database size={16} className="text-blue-600" />
                Edit Leave Balances ({selectedYear})
              </h3>
              <button 
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-650 font-bold text-sm transition"
              >
                ✕
              </button>
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
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-500"
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
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-500"
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
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-500"
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
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-500"
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
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-slate-650 hover:bg-slate-50 font-bold transition"
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition flex items-center gap-1.5 shadow-sm"
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "Save Balances"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

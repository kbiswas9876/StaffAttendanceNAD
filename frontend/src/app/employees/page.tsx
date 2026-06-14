'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { 
  Users, 
  PlusCircle, 
  UserPlus, 
  Edit3, 
  Trash2, 
  User, 
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
  GripVertical
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
  reorderEmployees
} from '../../lib/api';

// --- EMPLOYEE PROFILE 360 COMPONENT ---
interface ProfileProps {
  empId: number;
  onClose: () => void;
}

function EmployeeProfile360({ empId, onClose }: ProfileProps) {
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [leaveBank, setLeaveBank] = useState<LeaveBank | null>(null);
  const [attendance, setAttendance] = useState<AttendanceLog[]>([]);
  const [specialEvents, setSpecialEvents] = useState<SpecialEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
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
      <div className="h-[400px] flex items-center justify-center text-sm font-semibold text-slate-400">
        Loading employee 360° profile...
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="space-y-4">
        <button onClick={onClose} className="flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-blue-600 transition cursor-pointer">
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

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <button 
            onClick={onClose}
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

      {leaveBank && (
        <div className="flex justify-between items-center border-b border-slate-200 pb-3">
          <h3 className="text-sm font-black text-slate-800 flex items-center gap-2">
            <Database size={16} className="text-amber-500" />
            Leave Bank Ledger & Accounts ({selectedYear})
          </h3>
          <button
            onClick={openEditModal}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition shadow-sm cursor-pointer"
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
              <p className="text-[11px] text-slate-500 font-bold">Earned on Rest Day duties and manual credits</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm shadow-inner">
              CR
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <div className="glass-panel p-5 rounded-xl bg-white border border-slate-200 shadow-sm flex flex-col space-y-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2 border-b border-slate-200 pb-3">
              <Calendar size={18} className="text-blue-600" />
              Attendance Ledger Calendar Heatmap ({selectedYear})
            </h3>
            {renderHeatmap()}
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

      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 backdrop-blur-sm bg-slate-900/40">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">
                <Database size={16} className="text-blue-600" />
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
                <button type="button" onClick={() => setIsEditModalOpen(false)} className="px-4 py-2 border border-slate-200 rounded-lg text-slate-650 hover:bg-slate-50 font-bold transition" disabled={isSaving}>Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition flex items-center gap-1.5 shadow-sm" disabled={isSaving}>
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

// --- STAFF DIRECTORY MAIN LIST COMPONENT ---
function StaffDirectory() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [activeSection, setActiveSection] = useState<string>('KKVS');
  const [loading, setLoading] = useState<boolean>(true);
  const router = useRouter();

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

  // Form states
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [pfNumber, setPfNumber] = useState('');
  const [name, setName] = useState('');
  const [designation, setDesignation] = useState('');
  const [level, setLevel] = useState(5);
  const [sectionId, setSectionId] = useState<number | null>(null);
  const [restDay, setRestDay] = useState('Wednesday');
  const [joiningDate, setJoiningDate] = useState('');

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
      setEmployees(emps);
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

  const openAddModal = () => {
    setEditingEmp(null);
    setPfNumber('');
    setName('');
    setDesignation('');
    setLevel(5);
    setRestDay('Wednesday');
    setJoiningDate('');
    if (sections.length > 0) setSectionId(sections[0].id);
    else setSectionId(null);
    setIsFormOpen(true);
  };

  const openEditModal = (emp: Employee) => {
    setEditingEmp(emp);
    setPfNumber(emp.pf_number);
    setName(emp.name);
    setDesignation(emp.designation);
    setLevel(emp.level);
    setSectionId(emp.primary_section_id || null);
    setRestDay(emp.default_rest_day);
    setJoiningDate(emp.joining_date || '');
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pfNumber.trim() || !name.trim() || !designation.trim()) {
      showToast("All fields are required.", "error");
      return;
    }

    const matchedSec = sections.find(s => s.id === Number(sectionId));
    const section_code = matchedSec ? matchedSec.section_code : null;

    const payload = {
      pf_number: pfNumber.trim(),
      name: name.trim(),
      designation: designation.trim(),
      level: Number(level),
      primary_section_id: matchedSec ? matchedSec.id : null,
      section_code,
      default_rest_day: restDay,
      joining_date: joiningDate || undefined
    };

    try {
      if (editingEmp) {
        await updateEmployee({
          ...editingEmp,
          ...payload
        });
        showToast("Employee updated successfully", "success");
      } else {
        await createEmployee({
          ...payload,
          weekly_schedule: getWeeklyScheduleDefault(restDay)
        });
        showToast("Employee enrolled successfully", "success");
      }
      setIsFormOpen(false);
      loadData(activeSection);
    } catch (err: any) {
      console.error(err);
      showToast(err.message || "Failed to save employee. Check duplicate PF.", "error");
    }
  };

  const handleDelete = async (empId: number) => {
    if (window.confirm("Are you sure you want to permanently delete this employee? All their attendance records and leave data will be deleted from the database.")) {
      try {
        await deleteEmployee(empId);
        showToast("Employee deleted from system", "success");
        loadData(activeSection);
      } catch (err) {
        showToast("Failed to delete employee", "error");
      }
    }
  };

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
            Staff Directory
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200 font-bold uppercase tracking-wider">
              {activeSection === 'ALL' ? 'Joint View' : `${activeSection} Section`}
            </span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Maintain employee personal details, pay scale levels, and assign base stations / rest days.
          </p>
        </div>

        <button 
          onClick={openAddModal}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs tracking-wider uppercase transition shadow-md shadow-blue-500/10 cursor-pointer"
        >
          <UserPlus size={14} />
          Enroll Employee
        </button>
      </div>

      <div className="glass-panel rounded-xl border border-slate-200 flex flex-col overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-bold text-slate-500 uppercase bg-slate-50">
                <th className="py-3 px-3 w-10 text-center no-print"></th>
                <th className="py-3 px-5">PF Number</th>
                <th className="py-3 px-5">Name</th>
                <th className="py-3 px-5">Designation</th>
                <th className="py-3 px-5">Pay Level</th>
                <th className="py-3 px-5">Rest Day</th>
                <th className="py-3 px-5">Joining Date</th>
                <th className="py-3 px-5 text-center no-print">Actions</th>
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
                    <td className="py-4 px-5 text-center"><div className="h-4 w-12 bg-[#E5E3DC] rounded mx-auto" /></td>
                  </tr>
                ))
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-400">
                    No employees enrolled in this section.
                  </td>
                </tr>
              ) : (
                employees.map((emp, index) => (
                  <tr 
                    key={emp.emp_id} 
                    draggable={dragEnabledId === emp.emp_id}
                    onDragStart={(e) => handleDragStart(e, index)}
                    onDragOver={(e) => handleDragOver(e, index)}
                    onDragEnter={(e) => handleDragEnter(e, index)}
                    onDragEnd={handleDragEnd}
                    className={`hover:bg-slate-50/50 transition-colors select-none ${
                      draggedIndex === index ? 'opacity-40 bg-blue-50/20' : ''
                    }`}
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
                        className="hover:text-blue-600 hover:underline font-bold text-slate-850 cursor-pointer text-left bg-transparent border-none"
                      >
                        {emp.name}
                      </button>
                    </td>
                    <td className="py-3.5 px-5 font-bold">
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-100 text-slate-800">
                        {emp.designation}
                      </span>
                    </td>
                    <td className="py-3.5 px-5 font-bold text-blue-700">Level {emp.level}</td>
                    <td className="py-3.5 px-5 font-semibold text-slate-700">{emp.default_rest_day}</td>
                    <td className="py-3.5 px-5 font-mono text-slate-600">{emp.joining_date || "—"}</td>
                    <td className="py-3.5 px-5 text-center space-x-2 no-print">
                      <button 
                        onClick={() => openEditModal(emp)}
                        className="p-1 rounded hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition cursor-pointer"
                        title="Edit Details"
                      >
                        <Edit3 size={15} />
                      </button>
                      <button 
                        onClick={() => handleDelete(emp.emp_id)}
                        className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition cursor-pointer"
                        title="Delete Employee"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#E2E0D9] w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                <User size={16} className="text-blue-600" />
                {editingEmp ? "Edit Employee Profile" : "Enroll New Employee"}
              </h3>
              <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs font-bold text-slate-700">
              <div>
                <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">P.F. Number</label>
                <input 
                  type="text" 
                  value={pfNumber}
                  onChange={(e) => setPfNumber(e.target.value)}
                  placeholder="e.g. 52229800622"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Employee Name</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Subrata Naskar"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Designation</label>
                <input 
                  type="text" 
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g. JE/Sig or Tech-II"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Pay Level</label>
                  <select 
                    value={level}
                    onChange={(e) => setLevel(Number(e.target.value))}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none cursor-pointer"
                  >
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(l => (
                      <option key={l} value={l}>Level {l}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Section Code</label>
                  <select 
                    value={sectionId || ""}
                    onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none cursor-pointer"
                  >
                    <option value="">-- No Section --</option>
                    {sections.map(s => (
                      <option key={s.id} value={s.id}>{s.section_code} - {s.section_name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Weekly Rest Day</label>
                  <select 
                    value={restDay}
                    onChange={(e) => setRestDay(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none cursor-pointer"
                  >
                    {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Joining Date</label>
                  <input 
                    type="date" 
                    value={joiningDate}
                    onChange={(e) => setJoiningDate(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 cursor-pointer"
                  />
                </div>
              </div>
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button type="button" onClick={() => setIsFormOpen(false)} className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase cursor-pointer">Cancel</button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase cursor-pointer">{editingEmp ? "Save Updates" : "Enroll Member"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 border border-slate-800 text-white rounded-xl shadow-2xl px-4 py-3 flex items-center gap-3 max-w-sm">
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

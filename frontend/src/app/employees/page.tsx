'use client';

import React, { useState, useEffect } from 'react';
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
  ShieldAlert
} from 'lucide-react';
import Link from 'next/link';
import { getEmployees, createEmployee, updateEmployee, deleteEmployee, getSections, Section, Employee, getWeeklyScheduleDefault } from '../../lib/api';

export default function StaffDirectory() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [activeSection, setActiveSection] = useState<string>('KKVS');
  const [loading, setLoading] = useState<boolean>(true);

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

  return (
    <div className="p-6 space-y-6">
      
      {/* Title block */}
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

      {/* Directory Table */}
      <div className="glass-panel rounded-xl border border-slate-200 flex flex-col overflow-hidden bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 text-xs font-bold text-slate-500 uppercase bg-slate-50">
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
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    Loading staff directory...
                  </td>
                </tr>
              ) : employees.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-slate-400">
                    No employees enrolled in this section.
                  </td>
                </tr>
              ) : (
                employees.map((emp) => (
                  <tr key={emp.emp_id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="py-3.5 px-5 font-mono text-slate-700 font-bold">{emp.pf_number}</td>
                    <td className="py-3.5 px-5 font-bold text-slate-800 flex items-center gap-1.5">
                      <Link href={`/employees/${emp.emp_id}`} className="hover:text-blue-600 hover:underline">
                        {emp.name}
                      </Link>
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

      {/* Add / Edit Modal Overlay */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#E2E0D9] w-full max-w-md rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-up">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider flex items-center gap-2">
                <User size={16} className="text-blue-600" />
                {editingEmp ? "Edit Employee Profile" : "Enroll New Employee"}
              </h3>
              <button 
                onClick={() => setIsFormOpen(false)}
                className="text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs font-bold text-slate-700">
              
              {/* PF Number */}
              <div>
                <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">P.F. Number (Primary Key)</label>
                <input 
                  type="text" 
                  value={pfNumber}
                  onChange={(e) => setPfNumber(e.target.value)}
                  placeholder="e.g. 52229800622"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              {/* Employee Name */}
              <div>
                <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Employee Name</label>
                <input 
                  type="text" 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Subrata Naskar"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              {/* Designation */}
              <div>
                <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Designation</label>
                <input 
                  type="text" 
                  value={designation}
                  onChange={(e) => setDesignation(e.target.value)}
                  placeholder="e.g. JE/Sig or Tech-II"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Pay Level */}
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Pay Level (1-12)</label>
                  <select 
                    value={level}
                    onChange={(e) => setLevel(Number(e.target.value))}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {[1,2,3,4,5,6,7,8,9,10,11,12].map(l => (
                      <option key={l} value={l}>Level {l}</option>
                    ))}
                  </select>
                </div>

                {/* Section Assignment */}
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Section Code</label>
                  <select 
                    value={sectionId || ""}
                    onChange={(e) => setSectionId(e.target.value ? Number(e.target.value) : null)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    <option value="">-- No Section --</option>
                    {sections.map(s => (
                      <option key={s.id} value={s.id}>{s.section_code} - {s.section_name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* Rest Day */}
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Weekly Rest Day</label>
                  <select 
                    value={restDay}
                    onChange={(e) => setRestDay(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                  >
                    {['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'].map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>

                {/* Joining Date */}
                <div>
                  <label className="block text-[10px] uppercase text-slate-400 tracking-wider mb-1">Joining Date (Optional)</label>
                  <input 
                    type="date" 
                    value={joiningDate}
                    onChange={(e) => setJoiningDate(e.target.value)}
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm font-semibold text-slate-800 focus:outline-none focus:border-blue-500 cursor-pointer"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button 
                  type="button" 
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase cursor-pointer"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs uppercase cursor-pointer"
                >
                  {editingEmp ? "Save Updates" : "Enroll Member"}
                </button>
              </div>
            </form>
          </div>
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

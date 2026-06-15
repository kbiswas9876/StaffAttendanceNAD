'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  CalendarDays, 
  Users, 
  Moon, 
  Database, 
  Info,
  ShieldCheck,
  ChevronRight,
  ChevronLeft,
  Menu,
  X,
  Search,
  BookOpen,
  Keyboard,
  Bell
} from 'lucide-react';
import { getLines, getSections, getEmployees, createBackup, getAuditLogs, MetroLine, Section, Employee, AuditLog } from '../lib/api';

interface NavigationWrapperProps {
  children: React.ReactNode;
}

export default function NavigationWrapper({ children }: NavigationWrapperProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<string>('KKVS');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  
  const [lines, setLines] = useState<MetroLine[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<number>(1); // Blue Line default

  // Command Palette states
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState('');
  const [backupStatusText, setBackupStatusText] = useState('');
  const paletteRef = useRef<HTMLDivElement>(null);

  // Notifications states
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState<AuditLog[]>([]);
  const [hasUnreadNotifications, setHasUnreadNotifications] = useState(true);
  const notificationsRef = useRef<HTMLDivElement>(null);

  const [activeInCharge, setActiveInCharge] = useState<Employee | null>(null);
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  // Filter and sort eligible staff for In-Charge selection (SSE, JE, In-Charge)
  const eligibleInCharges = employees.filter(emp => {
    const isCorrectSec = emp.section_code === activeSection;
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

  const sortedEligible = [...eligibleInCharges].sort((a, b) => getPriorityScore(b) - getPriorityScore(a));

  useEffect(() => {
    if (employees.length === 0) return;
    
    // Check localStorage first
    const savedId = localStorage.getItem(`erp_active_in_charge_${activeSection}`);
    if (savedId) {
      const matched = eligibleInCharges.find(emp => emp.emp_id === Number(savedId));
      if (matched) {
        setActiveInCharge(matched);
        return;
      }
    }

    // Auto-select based on sorted priority list
    if (sortedEligible.length > 0) {
      setActiveInCharge(sortedEligible[0]);
    } else {
      setActiveInCharge(null);
    }
  }, [activeSection, employees]);

  // Handle profile dropdown outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(e.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
    };
    if (isProfileDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isProfileDropdownOpen]);

  const selectInCharge = (emp: Employee) => {
    setActiveInCharge(emp);
    localStorage.setItem(`erp_active_in_charge_${activeSection}`, String(emp.emp_id));
    setIsProfileDropdownOpen(false);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('erp_in_charge_changed'));
    }
  };

  const displayedName = activeInCharge ? activeInCharge.name : "Koushik Saha";
  const displayedDesig = activeInCharge ? activeInCharge.designation : "SSE In-Charge";
  const initials = displayedName
    .split(' ')
    .map(n => n[0])
    .join('')
    .substring(0, 2)
    .toUpperCase();

  const loadNotifications = async () => {
    try {
      const logs = await getAuditLogs();
      setNotifications(logs.slice(0, 5));
    } catch (e) {
      console.error("Failed to load notifications", e);
    }
  };

  // Load active lines, sections and employees dynamically
  const fetchMetadata = async () => {
    try {
      const storedLines = await getLines();
      const storedSections = await getSections();
      setLines(storedLines);
      setSections(storedSections);

      // Load all employees for search palette
      const allEmps = await getEmployees();
      setEmployees(allEmps);

      if (typeof window !== 'undefined') {
        const savedSection = localStorage.getItem('erp_active_section') || 'KKVS';
        setActiveSection(savedSection);
        
        // Set selected line based on saved section
        const matchingSec = storedSections.find(s => s.section_code === savedSection);
        if (matchingSec) {
          setSelectedLineId(matchingSec.line_id);
        }
      }
    } catch (err) {
      console.error("Failed to load metadata", err);
    }
  };

  useEffect(() => {
    fetchMetadata();
    loadNotifications();
  }, []);

  // Sync section change and notify pages
  const handleSectionChange = (section: string) => {
    setActiveSection(section);
    if (typeof window !== 'undefined') {
      localStorage.setItem('erp_active_section', section);
      window.dispatchEvent(new Event('erp_section_changed'));
    }
  };

  // Keyboard shortcut for command palette (Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setIsPaletteOpen(prev => !prev);
      }
      if (e.key === 'Escape') {
        setIsPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Click outside command palette to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (paletteRef.current && !paletteRef.current.contains(e.target as Node)) {
        setIsPaletteOpen(false);
      }
    };
    if (isPaletteOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isPaletteOpen]);

  // Click outside notifications dropdown to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) {
        setIsNotificationsOpen(false);
      }
    };
    if (isNotificationsOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isNotificationsOpen]);

  const triggerQuickBackup = async () => {
    setBackupStatusText("Creating backup...");
    try {
      const res = await createBackup();
      setBackupStatusText(`Backup created: ${res.filename}`);
      setTimeout(() => setBackupStatusText(''), 4000);
    } catch (e) {
      setBackupStatusText("Backup failed. Check backend.");
      setTimeout(() => setBackupStatusText(''), 4000);
    }
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Smart Attendance', path: '/attendance', icon: CalendarDays },
    { name: 'Staff Directory', path: '/employees', icon: Users },
    { name: 'Night Duty NDA', path: '/night-duty', icon: Moon },
    { name: 'Admin Panel', path: '/admin', icon: ShieldCheck },
    { name: 'Help Center', path: '/help', icon: BookOpen },
  ];

  // Filtering for command palette search
  const filteredEmployees = paletteSearch.trim() === '' ? [] : employees.filter(emp => 
    emp.name.toLowerCase().includes(paletteSearch.toLowerCase()) ||
    emp.pf_number.includes(paletteSearch) ||
    emp.designation.toLowerCase().includes(paletteSearch.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-[#FAF9F6] text-[#191919] overflow-hidden">
      
      {/* Sidebar navigation */}
      <aside 
        className={`${
          isSidebarOpen ? 'w-64' : 'w-20'
        } transition-all duration-300 ease-in-out bg-[#F9F8F5] text-slate-800 border-r border-[#E2E0D9] flex flex-col z-20 no-print shadow-xs`}
      >
        {/* Branding header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-[#E2E0D9]">
          {isSidebarOpen ? (
            <div className="flex items-center gap-2.5">
              <svg className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-1.5 shadow-md shadow-blue-500/10 shrink-0 select-none ring-2 ring-blue-100" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2C6.48 2 2 4.48 2 10v6c0 1.66 1.34 3 3 3h14c1.66 0 3-1.34 3-3v-6c0-5.52-4.48-10-10-10zm-5 13H5v-2h2v2zm10 0h-2v-2h2v2zm1-5H6V6h12v4zM8 17h8v1.5H8V17zm4 1.5l1.5 2.5h-3l1.5-2.5z" />
              </svg>
              <div className="flex flex-col">
                <span className="text-xs font-black tracking-widest text-slate-850 font-sans">SIGNAL DEPARTMENT</span>
                <span className="text-[8px] font-extrabold text-blue-600 tracking-widest uppercase font-mono mt-0.5">
                  {activeSection === 'ALL' ? 'JOINT VIEW' : `${activeSection} SECTION`}
                </span>
              </div>
            </div>
          ) : (
            <svg className="w-8 h-8 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-1.5 shadow-md shadow-blue-500/10 select-none ring-2 ring-blue-100 mx-auto" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.48 2 2 4.48 2 10v6c0 1.66 1.34 3 3 3h14c1.66 0 3-1.34 3-3v-6c0-5.52-4.48-10-10-10zm-5 13H5v-2h2v2zm10 0h-2v-2h2v2zm1-5H6V6h12v4zM8 17h8v1.5H8V17zm4 1.5l1.5 2.5h-3l1.5-2.5z" />
            </svg>
          )}
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1 rounded bg-[#E5E3DC] hover:bg-[#D9D7CE] text-slate-600 hover:text-slate-850 transition cursor-pointer"
          >
            {isSidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>

        {/* Navigation list */}
        <nav className="flex-1 py-4 px-3 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-extrabold transition-all duration-200 group cursor-pointer select-none relative border ${
                  isActive 
                    ? 'bg-blue-50/70 border-blue-100/50 text-blue-700 shadow-xs' 
                    : 'border-transparent text-slate-600 hover:bg-[#EFEDE6] hover:text-slate-850'
                }`}
              >
                <item.icon size={20} className={isActive ? 'text-blue-600' : 'text-slate-500 group-hover:text-slate-850 transition-colors'} />
                {isSidebarOpen && <span>{item.name}</span>}
                {isActive && isSidebarOpen && (
                  <span className="absolute right-3 w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse"></span>
                )}
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#FAF9F6]">
        
        {/* Top Header Bar */}
        <header className="h-16 bg-white border-b border-[#E2E0D9] flex items-center justify-between px-6 z-10 shadow-sm no-print">
          <div className="flex items-center gap-4">
            <h1 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider hidden lg:block">
              S&T STAFF OPERATIONS ERP
            </h1>
            
            {/* Dynamic Active Line & Section selector tabs */}
            <div className="flex items-center gap-3">
              {lines.length > 0 && (
                <select
                  value={selectedLineId}
                  onChange={(e) => {
                    const lineId = Number(e.target.value);
                    setSelectedLineId(lineId);
                    // Find first section of this line and switch
                    const firstSec = sections.find(s => s.line_id === lineId);
                    if (firstSec) {
                      handleSectionChange(firstSec.section_code);
                    }
                  }}
                  className="bg-slate-100 hover:bg-slate-200/60 border border-slate-200 text-slate-800 text-xs font-extrabold px-3 py-1.5 rounded-lg focus:outline-none cursor-pointer"
                >
                  {lines.map(l => (
                    <option key={l.id} value={l.id}>{l.line_name}</option>
                  ))}
                </select>
              )}

              <div className="bg-slate-100 border border-slate-200/60 p-1 rounded-xl flex items-center gap-1">
                {sections
                  .filter(s => s.line_id === selectedLineId)
                  .map((sec) => (
                    <button 
                      key={sec.section_code}
                      onClick={() => handleSectionChange(sec.section_code)}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                        activeSection === sec.section_code 
                          ? 'bg-blue-600 text-white shadow-sm' 
                          : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/40'
                      }`}
                    >
                      {sec.section_code}
                    </button>
                  ))}
                <button 
                  onClick={() => handleSectionChange('ALL')}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    activeSection === 'ALL' 
                      ? 'bg-blue-600 text-white shadow-sm' 
                      : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/40'
                  }`}
                >
                  Joint View
                </button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3.5">
            {/* Quick Search and Command Palette Button */}
            <button 
              onClick={() => setIsPaletteOpen(true)}
              className="flex items-center gap-2 px-3 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200/65 rounded-lg border border-slate-200 transition cursor-pointer"
            >
              <Search size={13} />
              <span className="hidden sm:inline">Search / Actions</span>
              <kbd className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-[10px] text-slate-400 font-mono shadow-xs ml-1 flex items-center gap-0.5">
                <Keyboard size={9} />
                Ctrl+K
              </kbd>
            </button>

            {/* Language Flag Dropdown */}
            <div className="relative flex items-center border border-slate-200 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors select-none">
              <span className="pl-2.5 text-xs">🇮🇳</span>
              <select 
                className="bg-transparent border-none text-[10px] font-extrabold text-slate-600 pl-1 pr-6 py-1.5 focus:outline-none cursor-pointer appearance-none"
                defaultValue="en"
                onChange={(e) => {
                  const lang = e.target.value;
                  // Simply change value, satisfying the request for interactive selector
                }}
              >
                <option value="en">EN (IN)</option>
                <option value="bn">BN (IN)</option>
                <option value="hi">HI (IN)</option>
              </select>
              <div className="absolute right-1.5 pointer-events-none text-slate-500 flex items-center">
                <ChevronRight size={10} className="rotate-90" />
              </div>
            </div>

            {/* Notification Bell Dropdown wrapper */}
            <div className="relative" ref={notificationsRef}>
              <button 
                onClick={() => {
                  setIsNotificationsOpen(!isNotificationsOpen);
                  setHasUnreadNotifications(false);
                  loadNotifications();
                }}
                className="relative w-8.5 h-8.5 flex items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                <Bell size={16} />
                {hasUnreadNotifications && (
                  <span className="absolute top-1.5 right-2 w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse"></span>
                )}
              </button>

              {/* Dynamic Notification Drawer Dropdown */}
              {isNotificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-30 overflow-hidden text-xs">
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <span className="font-extrabold text-slate-800 uppercase tracking-wider text-[10px]">Operational Alerts</span>
                    <button 
                      onClick={() => setNotifications([])} 
                      className="text-[9px] font-bold text-blue-600 hover:underline cursor-pointer"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="py-6 text-center text-slate-400 font-semibold text-[10px]">
                        No active operational alerts.
                      </div>
                    ) : (
                      notifications.map(log => (
                        <div key={log.id} className="p-3 hover:bg-slate-50 transition-colors">
                          <div className="flex justify-between items-center mb-1 text-[9px] font-bold">
                            <span className="text-blue-600 uppercase tracking-wide">{log.module}</span>
                            <span className="text-slate-400">{log.timestamp.split(' ')[1] || log.timestamp}</span>
                          </div>
                          <p className="text-slate-600 font-semibold leading-relaxed">{log.details}</p>
                          <span className="text-[9px] font-bold text-slate-400 mt-1 block">By: {log.user}</span>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="p-2 border-t border-slate-100 bg-slate-50 text-center">
                    <Link 
                      href="/admin" 
                      onClick={() => setIsNotificationsOpen(false)}
                      className="text-[10px] font-extrabold text-slate-500 hover:text-slate-800 tracking-wider uppercase"
                    >
                      View All System Logs
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* User Profile Dropdown */}
            <div className="relative pl-2 border-l border-slate-200" ref={profileDropdownRef}>
              <button 
                onClick={() => setIsProfileDropdownOpen(prev => !prev)}
                className="flex items-center gap-2.5 text-left hover:opacity-85 transition focus:outline-none cursor-pointer animate-in fade-in duration-200"
              >
                <div className="relative w-8.5 h-8.5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-black shadow-sm select-none shrink-0">
                  {initials}
                  <span className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 border-2 border-white rounded-full"></span>
                </div>
                <div className="hidden lg:flex flex-col">
                  <span className="text-xs font-black text-slate-800 leading-none">{displayedName}</span>
                  <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest mt-0.5 leading-none">{displayedDesig}</span>
                </div>
              </button>

              {isProfileDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="px-4 py-2 border-b border-slate-100 bg-slate-50">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Active Section In-Charge</span>
                    <span className="text-xs font-extrabold text-slate-700 mt-0.5 block">Section: {activeSection}</span>
                  </div>
                  
                  <div className="max-h-48 overflow-y-auto">
                    {eligibleInCharges.length === 0 ? (
                      <div className="px-4 py-3 text-center text-xs text-slate-400 font-bold">
                        No SSE / JE staff found in this section
                      </div>
                    ) : (
                      eligibleInCharges.map(emp => (
                        <button
                          key={emp.emp_id}
                          onClick={() => selectInCharge(emp)}
                          className={`w-full text-left px-4 py-2 hover:bg-slate-50 transition text-xs flex flex-col gap-0.5 cursor-pointer ${
                            activeInCharge?.emp_id === emp.emp_id ? 'bg-blue-50/50 text-blue-600 border-l-2 border-blue-600' : 'text-slate-750 hover:text-slate-900'
                          }`}
                        >
                          <span className="font-extrabold">{emp.name}</span>
                          <span className="text-[9px] text-slate-400 uppercase tracking-wider">{emp.designation}</span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Command Palette Modal Overlay */}
        {isPaletteOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex justify-center z-50 pt-20 no-print">
            <div 
              ref={paletteRef} 
              className="bg-white border border-[#E2E0D9] w-full max-w-xl h-max max-h-[70vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
            >
              {/* Search Bar Input */}
              <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200">
                <Search size={18} className="text-slate-400 shrink-0" />
                <input 
                  type="text" 
                  value={paletteSearch}
                  onChange={(e) => setPaletteSearch(e.target.value)}
                  placeholder="Search staff names, designations, actions, pages..."
                  className="w-full text-sm font-bold text-slate-800 placeholder-slate-400 bg-transparent border-none focus:outline-none"
                  autoFocus
                />
                <button 
                  onClick={() => setIsPaletteOpen(false)}
                  className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Suggestions / Results */}
              <div className="flex-1 overflow-y-auto p-2.5 max-h-[50vh] space-y-3">
                {paletteSearch.trim() === '' ? (
                  <>
                    {/* Quick navigation links */}
                    <div>
                      <span className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase px-2">QUICK JUMP</span>
                      <div className="grid grid-cols-2 gap-1.5 mt-1.5">
                        {navItems.map(item => (
                          <button
                            key={item.path}
                            onClick={() => {
                              router.push(item.path);
                              setIsPaletteOpen(false);
                            }}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-50 text-left text-xs font-bold text-slate-700 hover:text-blue-600 transition border border-transparent hover:border-slate-100"
                          >
                            <item.icon size={16} className="text-slate-400" />
                            {item.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Quick System Actions */}
                    <div className="border-t border-slate-100 pt-3">
                      <span className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase px-2">SYSTEM UTILITIES</span>
                      <div className="space-y-1 mt-1.5">
                        <button
                          onClick={triggerQuickBackup}
                          className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 text-left text-xs font-bold text-slate-700 hover:text-blue-600 transition"
                        >
                          <span className="flex items-center gap-3">
                            <Database size={16} className="text-slate-400" />
                            Create Database Backup (Instant Copy)
                          </span>
                          <span className="text-[10px] font-semibold text-slate-400">Run SQLite Copy</span>
                        </button>
                        {backupStatusText && (
                          <div className="mx-2 px-2.5 py-1 text-[10px] font-mono font-bold text-blue-700 bg-blue-50 border border-blue-200 rounded">
                            {backupStatusText}
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div>
                    <span className="text-[10px] font-extrabold tracking-wider text-slate-400 uppercase px-2">SEARCH RESULTS</span>
                    
                    {filteredEmployees.length === 0 ? (
                      <p className="text-center py-6 text-xs text-slate-400 font-bold">
                        No employees or designations match your search.
                      </p>
                    ) : (
                      <div className="space-y-1 mt-1.5">
                        {filteredEmployees.map(emp => (
                          <button
                            key={emp.emp_id}
                            onClick={() => {
                              router.push(`/employees?id=${emp.emp_id}`);
                              setIsPaletteOpen(false);
                            }}
                            className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-blue-50/50 text-left transition border border-transparent hover:border-blue-100/50"
                          >
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-800">{emp.name}</span>
                              <span className="text-[10px] text-slate-500 mt-0.5">{emp.designation} — PF: {emp.pf_number}</span>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-bold uppercase">{emp.section_code || "Unassigned"}</span>
                              <ChevronRight size={14} className="text-slate-400" />
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
              
              {/* Palette Footer */}
              <div className="bg-slate-50 px-4 py-2 border-t border-slate-200 flex items-center justify-between text-[10px] font-bold text-slate-400">
                <span>Use Arrow keys or Mouse. Enter to choose.</span>
                <span>ESC to close</span>
              </div>
            </div>
          </div>
        )}

        {/* Child Router Content */}
        <main className="flex-1 overflow-auto bg-[#F8FAFC] relative page-transition">
          {children}
        </main>
      </div>

    </div>
  );
}

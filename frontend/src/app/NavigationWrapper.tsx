'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Bell,
  Milestone
} from 'lucide-react';
import { getLines, getSections, getEmployees, createBackup, getAuditLogs, MetroLine, Section, Employee, AuditLog } from '../lib/api';
import { getTranslation, translations } from '../lib/translations';

interface ThemeColors {
  activeBg: string;
  activeText: string;
  iconBg: string;
  iconGlow: string;
  logoBg: string;
  dotColor: string;
  accentText: string;
  accentRing: string;
  activeBorder: string;
}

interface NavigationWrapperProps {
  children: React.ReactNode;
}

export default function NavigationWrapper({ children }: NavigationWrapperProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [lang, setLang] = useState<'en' | 'bn' | 'hi'>('en');
  const [activeSection, setActiveSection] = useState<string>('KKVS');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [lines, setLines] = useState<MetroLine[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedLineId, setSelectedLineId] = useState<number>(1); // Blue Line default
  const [selectedJoinSections, setSelectedJoinSections] = useState<string[]>([]);

  // Compute theme dynamically based on active section's Metro Line
  const theme = useMemo<ThemeColors>(() => {
    if (activeSection === 'ALL') {
      return {
        activeBg: 'bg-indigo-50/90',
        activeText: 'text-indigo-700',
        iconBg: 'bg-indigo-600',
        iconGlow: 'shadow-indigo-500/20',
        logoBg: 'from-indigo-600 to-violet-600',
        dotColor: 'bg-indigo-600',
        accentText: 'text-indigo-650',
        accentRing: 'ring-indigo-100',
        activeBorder: 'border-indigo-600'
      };
    }
    const currentSectionObj = sections.find(s => s.section_code === activeSection);
    const currentLineObj = lines.find(l => l.id === currentSectionObj?.line_id);
    const lineName = (currentLineObj?.line_name || '').toLowerCase();

    if (lineName.includes('yellow')) {
      return {
        activeBg: 'bg-amber-50/90',
        activeText: 'text-amber-800',
        iconBg: 'bg-amber-500',
        iconGlow: 'shadow-amber-500/25',
        logoBg: 'from-amber-500 to-yellow-500',
        dotColor: 'bg-amber-600',
        accentText: 'text-amber-650',
        accentRing: 'ring-amber-100',
        activeBorder: 'border-amber-500'
      };
    } else if (lineName.includes('green')) {
      return {
        activeBg: 'bg-emerald-50/90',
        activeText: 'text-emerald-700',
        iconBg: 'bg-emerald-600',
        iconGlow: 'shadow-emerald-500/20',
        logoBg: 'from-emerald-600 to-teal-600',
        dotColor: 'bg-emerald-600',
        accentText: 'text-emerald-650',
        accentRing: 'ring-emerald-100',
        activeBorder: 'border-emerald-600'
      };
    } else if (lineName.includes('purple')) {
      return {
        activeBg: 'bg-purple-50/90',
        activeText: 'text-purple-700',
        iconBg: 'bg-purple-600',
        iconGlow: 'shadow-purple-500/20',
        logoBg: 'from-purple-600 to-fuchsia-600',
        dotColor: 'bg-purple-600',
        accentText: 'text-purple-650',
        accentRing: 'ring-purple-100',
        activeBorder: 'border-purple-600'
      };
    } else if (lineName.includes('noapara') || lineName.includes('car shed')) {
      return {
        activeBg: 'bg-slate-100/90',
        activeText: 'text-slate-800',
        iconBg: 'bg-slate-600',
        iconGlow: 'shadow-slate-500/20',
        logoBg: 'from-slate-600 to-slate-705',
        dotColor: 'bg-slate-600',
        accentText: 'text-slate-650',
        accentRing: 'ring-slate-100',
        activeBorder: 'border-slate-600'
      };
    } else {
      // Default to Blue Line theme
      return {
        activeBg: 'bg-blue-50/90',
        activeText: 'text-blue-700',
        iconBg: 'bg-blue-600',
        iconGlow: 'shadow-blue-500/20',
        logoBg: 'from-blue-600 to-indigo-600',
        dotColor: 'bg-blue-600',
        accentText: 'text-blue-650',
        accentRing: 'ring-blue-100',
        activeBorder: 'border-blue-600'
      };
    }
  }, [activeSection, sections, lines]);


  // Command Palette states
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [paletteSearch, setPaletteSearch] = useState('');
  const [backupStatusText, setBackupStatusText] = useState('');
  const paletteRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const sidebarTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
        // App must load this section by default on startup
        const mySec = localStorage.getItem('erp_my_section') || 'KKVS';
        setActiveSection(mySec);
        localStorage.setItem('erp_active_section', mySec);

        // Set selected line based on saved section
        const matchingSec = storedSections.find(s => s.section_code === mySec);
        if (matchingSec) {
          setSelectedLineId(matchingSec.line_id);
          localStorage.setItem('erp_active_line_id', String(matchingSec.line_id));
        }
      }
    } catch (err) {
      console.error("Failed to load metadata", err);
    }
  };

  useEffect(() => {
    fetchMetadata();
    loadNotifications();
    if (typeof window !== 'undefined') {
      const savedLang = (localStorage.getItem('erp_lang') || 'en') as 'en' | 'bn' | 'hi';
      setLang(savedLang);
    }

    const handleMetadataChange = () => {
      fetchMetadata();
      loadNotifications();
    };

    window.addEventListener('erp_metadata_changed', handleMetadataChange);
    return () => {
      window.removeEventListener('erp_metadata_changed', handleMetadataChange);
    };
  }, []);

  // Inject theme variables into document.documentElement dynamically
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const root = document.documentElement;

      const themeColorsMap: { [key: string]: { activeBg: string; activeText: string; iconBg: string; iconGlow: string; dotColor: string; accentText: string; activeBorder: string } } = {
        indigo: {
          activeBg: '#f5f7ff',
          activeText: '#4338ca',
          iconBg: '#4f46e5',
          iconGlow: '0 4px 6px -1px rgba(79, 70, 229, 0.2)',
          dotColor: '#4f46e5',
          accentText: '#4f46e5',
          activeBorder: '#4f46e5'
        },
        amber: {
          activeBg: '#fffbeb',
          activeText: '#92400e',
          iconBg: '#f59e0b',
          iconGlow: '0 4px 6px -1px rgba(245, 158, 11, 0.25)',
          dotColor: '#d97706',
          accentText: '#b45309',
          activeBorder: '#f59e0b'
        },
        emerald: {
          activeBg: '#ecfdf5',
          activeText: '#047857',
          iconBg: '#059669',
          iconGlow: '0 4px 6px -1px rgba(5, 150, 105, 0.2)',
          dotColor: '#059669',
          accentText: '#059669',
          activeBorder: '#059669'
        },
        purple: {
          activeBg: '#faf5ff',
          activeText: '#7e22ce',
          iconBg: '#9333ea',
          iconGlow: '0 4px 6px -1px rgba(147, 51, 234, 0.2)',
          dotColor: '#9333ea',
          accentText: '#9333ea',
          activeBorder: '#9333ea'
        },
        slate: {
          activeBg: '#f8fafc',
          activeText: '#1e293b',
          iconBg: '#475569',
          iconGlow: '0 4px 6px -1px rgba(71, 85, 105, 0.2)',
          dotColor: '#475569',
          accentText: '#475569',
          activeBorder: '#475569'
        },
        blue: {
          activeBg: '#eff6ff',
          activeText: '#1d4ed8',
          iconBg: '#2563eb',
          iconGlow: '0 4px 6px -1px rgba(37, 99, 235, 0.2)',
          dotColor: '#2563eb',
          accentText: '#2563eb',
          activeBorder: '#2563eb'
        }
      };

      // Determine color key based on the Tailwind classes in the active theme
      let colorKey = 'blue';
      if (theme.activeBg.includes('indigo')) colorKey = 'indigo';
      else if (theme.activeBg.includes('amber')) colorKey = 'amber';
      else if (theme.activeBg.includes('emerald')) colorKey = 'emerald';
      else if (theme.activeBg.includes('purple')) colorKey = 'purple';
      else if (theme.activeBg.includes('slate')) colorKey = 'slate';

      const selected = themeColorsMap[colorKey];

      // Fallback/Dynamic generator logic for custom line colors from DB
      const currentSectionObj = sections.find(s => s.section_code === activeSection);
      const currentLineObj = lines.find(l => l.id === currentSectionObj?.line_id);
      const dbColor = currentLineObj?.color_code;

      if (dbColor && !['indigo', 'amber', 'emerald', 'purple', 'slate', 'blue'].includes(colorKey)) {
        // Build styling dynamic variables for newly added lines
        root.style.setProperty('--theme-icon-bg', dbColor);
        root.style.setProperty('--theme-icon-glow', `0 4px 6px -1px ${dbColor}35`);
        root.style.setProperty('--theme-active-bg', `${dbColor}12`); // ~7% opacity
        root.style.setProperty('--theme-active-text', dbColor);
        root.style.setProperty('--theme-accent-text', dbColor);
        root.style.setProperty('--theme-accent-ring', `0 0 0 2px ${dbColor}20`);
        root.style.setProperty('--theme-active-border', dbColor);
      } else {
        root.style.setProperty('--theme-icon-bg', selected.iconBg);
        root.style.setProperty('--theme-icon-glow', selected.iconGlow);
        root.style.setProperty('--theme-active-bg', selected.activeBg);
        root.style.setProperty('--theme-active-text', selected.activeText);
        root.style.setProperty('--theme-accent-text', selected.accentText);
        root.style.setProperty('--theme-accent-ring', colorKey === 'amber' ? '0 0 0 2px #fde68a' : `0 0 0 2px ${selected.iconBg}20`);
        root.style.setProperty('--theme-active-border', selected.activeBorder);
      }
    }
  }, [theme, lines, sections, activeSection]);

  // Sync selected sections under Joint View when sections list changes
  useEffect(() => {
    if (sections.length === 0) return;
    const stored = localStorage.getItem('erp_join_sections');
    if (stored) {
      try {
        setSelectedJoinSections(JSON.parse(stored));
      } catch (e) {
        const defaultSecs = sections.filter(s => s.line_id === selectedLineId).map(s => s.section_code);
        setSelectedJoinSections(defaultSecs);
      }
    } else {
      const defaultSecs = sections.filter(s => s.line_id === selectedLineId).map(s => s.section_code);
      setSelectedJoinSections(defaultSecs);
      localStorage.setItem('erp_join_sections', JSON.stringify(defaultSecs));
    }
  }, [sections]);

  // Sync section preference and language preference changes
  useEffect(() => {
    const handleMySectionChange = () => {
      const mySec = localStorage.getItem('erp_my_section') || 'KKVS';
      setActiveSection(mySec);
      if (typeof window !== 'undefined') {
        localStorage.setItem('erp_active_section', mySec);
      }
      const matchingSec = sections.find(s => s.section_code === mySec);
      if (matchingSec) {
        setSelectedLineId(matchingSec.line_id);
        localStorage.setItem('erp_active_line_id', String(matchingSec.line_id));
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new Event('erp_section_changed'));
      }
    };

    const handleLangChange = () => {
      if (typeof window !== 'undefined') {
        const savedLang = (localStorage.getItem('erp_lang') || 'en') as 'en' | 'bn' | 'hi';
        setLang(savedLang);
      }
    };

    window.addEventListener('erp_my_section_changed', handleMySectionChange);
    window.addEventListener('erp_lang_changed', handleLangChange);
    return () => {
      window.removeEventListener('erp_my_section_changed', handleMySectionChange);
      window.removeEventListener('erp_lang_changed', handleLangChange);
    };
  }, [sections]);

  // Sync section change and notify pages
  const handleSectionChange = (section: string) => {
    setActiveSection(section);
    if (typeof window !== 'undefined') {
      localStorage.setItem('erp_active_section', section);
      window.dispatchEvent(new Event('erp_section_changed'));
    }
  };

  // Toggle sidebar with main-content width freeze to prevent table reflow during animation.
  // The sidebar animates smoothly via CSS transition, while <main> is locked at a fixed
  // pixel width so tables/grids inside never recalculate layout. After the transition
  // finishes, the lock is released and content adjusts in a single reflow.
  const handleToggleSidebar = (open: boolean) => {
    clearTimeout(sidebarTimerRef.current);
    const mainEl = mainRef.current;
    if (mainEl) {
      mainEl.style.width = `${mainEl.offsetWidth}px`;
    }
    setIsSidebarOpen(open);
    sidebarTimerRef.current = setTimeout(() => {
      if (mainEl) mainEl.style.width = '';
    }, 220);
  };

  const toggleJoinSection = (secCode: string) => {
    let updated = [...selectedJoinSections];
    if (updated.includes(secCode)) {
      updated = updated.filter(c => c !== secCode);
    } else {
      updated.push(secCode);
    }
    setSelectedJoinSections(updated);
    localStorage.setItem('erp_join_sections', JSON.stringify(updated));
    if (typeof window !== 'undefined') {
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
    { name: 'Travelling Allowance', path: '/travelling-allowance', icon: Milestone },
    { name: 'Admin Panel', path: '/admin', icon: ShieldCheck },
  ];

  // Filtering for command palette search
  const filteredEmployees = paletteSearch.trim() === '' ? [] : employees.filter(emp =>
    emp.name.toLowerCase().includes(paletteSearch.toLowerCase()) ||
    emp.pf_number.includes(paletteSearch) ||
    emp.designation.toLowerCase().includes(paletteSearch.toLowerCase())
  );

  return (
    <div className={`flex h-screen bg-[#FAF9F6] text-[#191919] overflow-hidden ${lang === 'bn' ? 'lang-bn' : ''}`}>

      {/* Sidebar navigation */}
      <aside
        className={`${isSidebarOpen ? 'w-64' : 'w-20'
          } shrink-0 overflow-hidden transition-[width] duration-200 ease-in-out bg-white text-slate-800 border-r border-slate-200/50 flex flex-col z-20 no-print shadow-xs`}
      >
        {/* Branding header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-100 overflow-hidden">
          {isSidebarOpen ? (
            <>
              <div className="flex items-center gap-2.5 min-w-0 animate-in fade-in duration-200">
                <img
                  src="/image.png"
                  alt="Metro Rail Logo"
                  className={`w-12 h-12 rounded-xl object-contain bg-white p-1 shadow-sm shrink-0 select-none ring-2 ${theme.accentRing}`}
                />
                <div className="flex flex-col min-w-0">
                  <span className="text-[13px] font-black tracking-wider text-slate-900 font-sans truncate leading-none uppercase">{getTranslation(lang, 'SIGNAL DEPT.')}</span>
                  <span className={`text-[9px] font-extrabold ${theme.accentText} tracking-widest uppercase font-mono mt-1 truncate leading-none`}>
                    {activeSection === 'ALL' ? getTranslation(lang, 'JOINT VIEW') : `${activeSection} ${getTranslation(lang, 'SEC.')}`}
                  </span>
                </div>
              </div>
              <button
                onClick={() => handleToggleSidebar(false)}
                className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 hover:text-slate-850 transition cursor-pointer shrink-0 ml-1"
              >
                <Menu size={18} />
              </button>
            </>
          ) : (
            <button
              onClick={() => handleToggleSidebar(true)}
              className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-600 hover:text-slate-800 transition cursor-pointer mx-auto animate-in fade-in duration-200"
            >
              <Menu size={18} />
            </button>
          )}
        </div>

        {/* Navigation list */}
        <nav className="flex-1 py-4 px-3 space-y-1.5 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.path || (item.path !== '/' && pathname.startsWith(item.path));
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`flex items-center p-2 rounded-xl text-sm font-extrabold transition-colors duration-200 group cursor-pointer select-none relative ${isActive
                  ? `${theme.activeBg} ${theme.activeText} shadow-xs`
                  : 'text-slate-655 hover:bg-[#EFEDE6]/70 hover:text-slate-900'
                  }`}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors duration-250 ${isActive
                  ? `${theme.iconBg} text-white shadow-sm ${theme.iconGlow}`
                  : 'bg-slate-200/50 text-slate-500 group-hover:bg-slate-300/60 group-hover:text-slate-800'
                  }`}>
                  <item.icon size={16} className="transition-transform duration-250 group-hover:scale-105" />
                </div>
                <span className={`overflow-hidden whitespace-nowrap ${isSidebarOpen
                  ? 'opacity-100 max-w-[155px] ml-3.5 transition-all duration-200 ease-in-out delay-75'
                  : 'opacity-0 max-w-0 ml-0 transition-none'
                  }`}>
                  {getTranslation(lang, item.name)}
                </span>
                {isActive && (
                  <span className={`absolute right-3.5 w-1.5 h-1.5 rounded-full ${theme.dotColor} animate-pulse ${isSidebarOpen
                    ? 'opacity-100 transition-opacity duration-200 delay-75'
                    : 'opacity-0 pointer-events-none transition-none'
                    }`}></span>
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
              {getTranslation(lang, 'S&T STAFF OPERATIONS ERP')}
            </h1>

            {/* Dynamic Active Line & Section selector tabs */}
            <div className="flex items-center gap-3">
              {lines.length > 0 && (
                <div className="relative flex items-center border border-slate-200/80 bg-slate-50 hover:bg-slate-100/80 rounded-xl transition-colors select-none">
                  <select
                    value={selectedLineId}
                    onChange={(e) => {
                      const lineId = Number(e.target.value);
                      setSelectedLineId(lineId);
                      localStorage.setItem('erp_active_line_id', String(lineId));
                      // Find first section of this line and switch
                      const firstSec = sections.find(s => s.line_id === lineId);
                      if (firstSec) {
                        handleSectionChange(firstSec.section_code);
                      }
                    }}
                    className="bg-transparent border-none text-[11px] font-black text-slate-700 pl-3.5 pr-8 py-2 focus:outline-none cursor-pointer appearance-none uppercase tracking-wider"
                  >
                    {lines.map(l => (
                      <option key={l.id} value={l.id}>{l.line_name.toUpperCase()}</option>
                    ))}
                  </select>
                  <div className="absolute right-2.5 pointer-events-none text-slate-400 flex items-center">
                    <ChevronRight size={11} className="rotate-90" />
                  </div>
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200/80 p-0.5 rounded-xl flex items-center gap-0.5 shadow-2xs">
                {sections
                  .filter(s => s.line_id === selectedLineId)
                  .map((sec) => (
                    <button
                      key={sec.section_code}
                      onClick={() => handleSectionChange(sec.section_code)}
                      className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-extrabold rounded-lg transition-all cursor-pointer ${activeSection === sec.section_code
                        ? `${theme.iconBg} text-white shadow-xs ${theme.iconGlow}`
                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-200/35'
                        }`}
                    >
                      {sec.section_code}
                    </button>
                  ))}
                <button
                  onClick={() => handleSectionChange('ALL')}
                  className={`px-3 py-1.5 text-[10px] uppercase tracking-wider font-extrabold rounded-lg transition-all cursor-pointer ${activeSection === 'ALL'
                    ? `${theme.iconBg} text-white shadow-xs ${theme.iconGlow}`
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-205/35'
                    }`}
                >
                  {getTranslation(lang, 'Joint View')}
                </button>
              </div>


              {/* Inline Checklist for selecting active sections under Joint View */}
              {activeSection === 'ALL' && (
                <div className="flex flex-wrap items-center gap-4 ml-2 px-3.5 py-1.5 bg-[#FDFDFD] border border-slate-200/80 rounded-xl shadow-2xs animate-in fade-in duration-200 select-none">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest shrink-0">{getTranslation(lang, 'Include')}:</span>
                  {lines.map((line) => {
                    const lineSections = sections.filter(s => s.line_id === line.id);
                    if (lineSections.length === 0) return null;
                    return (
                      <div key={line.id} className="flex items-center gap-2 border-r border-slate-100 pr-3.5 last:border-r-0 mr-1 shrink-0">
                        <span
                          className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded shadow-2xs leading-none shrink-0"
                          style={{
                            backgroundColor: line.color_code || '#64748B',
                            color: '#FFFFFF'
                          }}
                        >
                          {line.line_name.replace(' Line', '')}
                        </span>
                        <div className="flex items-center gap-2">
                          {lineSections.map((sec) => {
                            const isChecked = selectedJoinSections.includes(sec.section_code);
                            return (
                              <label
                                key={sec.section_code}
                                className="flex items-center gap-1 cursor-pointer text-[10.5px] font-black text-slate-750 hover:text-slate-900 select-none transition-colors"
                              >
                                <input
                                  type="checkbox"
                                  checked={isChecked}
                                  onChange={() => toggleJoinSection(sec.section_code)}
                                  className="w-3 h-3 text-blue-600 border-slate-350 rounded focus:ring-blue-500 cursor-pointer"
                                />
                                {sec.section_code}
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick Search and Command Palette Button */}
            <button
              onClick={() => setIsPaletteOpen(true)}
              className="flex items-center gap-2 px-3.5 py-2 text-xs font-extrabold text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100/90 rounded-xl border border-slate-250/60 shadow-2xs transition cursor-pointer"
            >
              <Search size={13} className="text-slate-400" />
              <span className="hidden sm:inline">{getTranslation(lang, 'Search / Actions')}</span>
              <kbd className="bg-white border border-slate-200 px-1.5 py-0.5 rounded text-[10px] text-slate-450 font-mono shadow-xs ml-1 flex items-center gap-0.5">
                <Keyboard size={9} />
                Ctrl+K
              </kbd>
            </button>

            {/* Help Button */}
            <Link
              href="/help"
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-extrabold text-slate-650 hover:text-slate-900 bg-slate-50 hover:bg-slate-100/90 rounded-xl border border-slate-250/60 shadow-2xs transition cursor-pointer"
            >
              <BookOpen size={13} className="text-slate-405" />
              <span>{getTranslation(lang, 'Help')}</span>
            </Link>

            {/* Language Flag Dropdown */}
            <div className="relative flex items-center border border-slate-250/60 bg-slate-50 hover:bg-slate-100/90 rounded-xl shadow-2xs transition-colors select-none">
              <span className="pl-2.5 text-xs">🇮🇳</span>
              <select
                className="bg-transparent border-none text-[10px] font-black text-slate-605 pl-1.5 pr-6 py-2 focus:outline-none cursor-pointer appearance-none uppercase tracking-wide"
                value={lang}
                onChange={(e) => {
                  const val = e.target.value as 'en' | 'bn' | 'hi';
                  setLang(val);
                  localStorage.setItem('erp_lang', val);
                  window.dispatchEvent(new Event('erp_lang_changed'));
                }}
              >
                <option value="en">EN (IN)</option>
                <option value="bn">BN (IN)</option>
                <option value="hi">HI (IN)</option>
              </select>
              <div className="absolute right-2 pointer-events-none text-slate-400 flex items-center">
                <ChevronRight size={9} className="rotate-90" />
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
                className="relative w-8.5 h-8.5 flex items-center justify-center rounded-xl border border-slate-250/60 bg-slate-50 hover:bg-slate-105 transition text-slate-505 hover:text-slate-800 shadow-2xs cursor-pointer"
              >
                <Bell size={15} />
                {hasUnreadNotifications && (
                  <span className="absolute top-1.5 right-2 w-1.5 h-1.5 bg-rose-500 rounded-full animate-pulse"></span>
                )}
              </button>

              {/* Dynamic Notification Drawer Dropdown */}
              {isNotificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 bg-white border border-slate-200 rounded-xl shadow-xl z-30 overflow-hidden text-xs">
                  <div className="px-4 py-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <span className="font-extrabold text-slate-800 uppercase tracking-wider text-[10px]">{getTranslation(lang, 'Operational Alerts')}</span>
                    <button
                      onClick={() => setNotifications([])}
                      className={`text-[9px] font-bold ${theme.accentText} hover:underline cursor-pointer`}
                    >
                      {getTranslation(lang, 'Clear All')}
                    </button>
                  </div>
                  <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="py-6 text-center text-slate-400 font-semibold text-[10px]">
                        {getTranslation(lang, 'No active operational alerts.')}
                      </div>
                    ) : (
                      notifications.map(log => (
                        <div key={log.id} className="p-3 hover:bg-slate-50 transition-colors">
                          <div className="flex justify-between items-center mb-1 text-[9px] font-bold">
                            <span className={`uppercase tracking-wide ${theme.accentText}`}>{log.module}</span>
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
                      {getTranslation(lang, 'View All System Logs')}
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
                <div className={`relative w-8.5 h-8.5 rounded-full ${theme.iconBg} text-white flex items-center justify-center text-xs font-black shadow-sm select-none shrink-0`}>
                  {initials}
                  <span className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 border-2 border-white rounded-full"></span>
                </div>
                <div className="hidden lg:flex flex-col">
                  <span className="text-xs font-black text-slate-800 leading-none">{displayedName}</span>
                  <span className={`text-[9px] font-black ${theme.accentText} uppercase tracking-widest mt-0.5 leading-none`}>{displayedDesig}</span>
                </div>
              </button>

              {isProfileDropdownOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden py-1 animate-in fade-in slide-in-from-top-1 duration-150">
                  <div className="px-4 py-2 border-b border-slate-100 bg-slate-50">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">{getTranslation(lang, 'Active Section In-Charge')}</span>
                    <span className="text-xs font-extrabold text-slate-700 mt-0.5 block">{getTranslation(lang, 'Section')}: {activeSection}</span>
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
                          className={`w-full text-left px-4 py-2 hover:bg-slate-50 transition text-xs flex flex-col gap-0.5 cursor-pointer ${activeInCharge?.emp_id === emp.emp_id ? `${theme.activeBg} ${theme.activeText} border-l-2 ${theme.activeBorder}` : 'text-slate-750 hover:text-slate-900'
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
        <main ref={mainRef} className="flex-1 overflow-auto bg-[#F8FAFC] relative">
          <div key={pathname} className="page-transition min-h-full">
            {children}
          </div>
        </main>
      </div>

    </div>
  );
}

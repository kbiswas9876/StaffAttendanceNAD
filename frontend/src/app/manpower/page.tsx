'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  FileSpreadsheet,
  Printer,
  PlusCircle,
  Search,
  UserPlus,
  ChevronUp,
  ChevronDown,
  X,
  ClipboardList,
  CalendarDays,
  FileText
} from 'lucide-react';
import {
  getEmployees,
  getSections,
  getManpowerPlans,
  getManpowerPlan,
  createManpowerPlan,
  updateManpowerPlan,
  deleteManpowerPlan,
  Employee,
  Section,
  ManpowerPlan,
  ManpowerPlanRow
} from '../../lib/api';
import { getTranslation } from '../../lib/translations';

// Common stations in Metro Kolkata for quick suggestions
const COMMON_STATIONS = [
  'KGTN [Indoor]',
  'KGTN [Outdoor]',
  'KKVS [Indoor]',
  'KKVS [Outdoor]',
  'KSKD [Indoor]',
  'KSKD [Outdoor]',
  'KSKD [Outdoor & Indoor]',
  'KMUK [Indoor]',
  'KMUK [Outdoor]',
  'KJHD [Indoor]',
  'KJHD [Outdoor]',
  'KJKA [Indoor]',
  'KJKA [Outdoor]'
];

// Common agency options for quick select
const COMMON_AGENCIES = [
  'M/s Eldyne (Wireman)',
  'M/s Eldyne',
  'M/s Siemens',
  'M/s Efftronics',
  'M/s Deltron',
  'M/s Statcon',
  "Contractor's labour",
  'Contractor'
];

type ListStyle = 'bullet' | 'circle' | 'square' | 'dash' | 'number' | 'check' | 'star' | 'diamond';

export default function ManpowerPlanning() {
  const [lang, setLang] = useState<'en' | 'bn' | 'hi'>('en');
  const [plans, setPlans] = useState<ManpowerPlan[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<ManpowerPlan | null>(null);
  
  // Loading and action states
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [exporting, setExporting] = useState<boolean>(false);
  
  // Modals and assistants states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [isEmployeeModalOpen, setIsEmployeeModalOpen] = useState<boolean>(false);
  const [isAgencyModalOpen, setIsAgencyModalOpen] = useState<boolean>(false);
  
  // Prefix configs inside Assign modals - supports all 8 formats + none
  const [employeePrefix, setEmployeePrefix] = useState<ListStyle | 'none'>('bullet');
  const [agencyPrefix, setAgencyPrefix] = useState<ListStyle | 'none'>('bullet');

  // Form states for creating a plan
  const [newPlanName, setNewPlanName] = useState<string>('');
  const [newPlanTitle, setNewPlanTitle] = useState<string>('INTEGRATED MANPOWER & WORK ACTIVITY PLAN');
  const [newPlanSubtitle, setNewPlanSubtitle] = useState<string>('Combined Schedule for Metro Railway Signaling Department');

  // Currently active cell indices being updated by the assistant modals
  const [activeRowIndex, setActiveRowIndex] = useState<number | null>(null);
  const [empSearchQuery, setEmpSearchQuery] = useState<string>('');
  const [empSectionFilter, setEmpSectionFilter] = useState<string>('ALL');
  
  // Custom rail designation / agency count
  const [customRailName, setCustomRailName] = useState<string>('');
  const [customRailDesig, setCustomRailDesig] = useState<string>('');
  const [customAgencyName, setCustomAgencyName] = useState<string>('');

  // Group delete confirmation modal state
  const [groupToDelete, setGroupToDelete] = useState<{ date: string; shift: string } | null>(null);

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  // Advanced Date / Shift picker states for custom group modal
  const [isGroupModalOpen, setIsGroupModalOpen] = useState<boolean>(false);
  const [dateType, setDateType] = useState<'single' | 'range' | 'custom'>('single');
  const [singleDate, setSingleDate] = useState<string>('2026-05-17');
  const [startDate, setStartDate] = useState<string>('2026-05-16');
  const [endDate, setEndDate] = useState<string>('2026-05-17');
  const [customDateText, setCustomDateText] = useState<string>("16/17 May '26");

  const [shiftType, setShiftType] = useState<'night' | 'day' | 'evening' | 'custom'>('night');
  const [startTime, setStartTime] = useState<string>('10:00');
  const [endTime, setEndTime] = useState<string>('18:00');
  const [customShiftText, setCustomShiftText] = useState<string>("10:00 hrs\nto\n18:00 hrs");
  const [includeDatesInShift, setIncludeDatesInShift] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setLang((localStorage.getItem('erp_lang') || 'en') as 'en' | 'bn' | 'hi');
    }
    const handleLangChange = () => {
      if (typeof window !== 'undefined') {
        setLang((localStorage.getItem('erp_lang') || 'en') as 'en' | 'bn' | 'hi');
      }
    };
    window.addEventListener('erp_lang_changed', handleLangChange);
    
    // Fetch initial data
    loadInitialData();

    return () => window.removeEventListener('erp_lang_changed', handleLangChange);
  }, []);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const plansList = await getManpowerPlans();
      const secs = await getSections();
      const emps = await getEmployees();
      setPlans(plansList);
      setSections(secs);
      setEmployees(emps);
    } catch (e) {
      console.error("Failed to load initial data:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenPlan = async (id: number) => {
    setLoading(true);
    try {
      const plan = await getManpowerPlan(id);
      setSelectedPlan(plan);
    } catch (e) {
      console.error("Failed to load plan details:", e);
      showToast("Error loading plan details.", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlanName.trim()) return;

    setSaving(true);
    try {
      const planData: ManpowerPlan = {
        name: newPlanName.trim(),
        title: newPlanTitle.trim(),
        subtitle: newPlanSubtitle.trim(),
        rows: [
          {
            date_text: "16/17 May '26",
            shift_text: "23:00 hrs (16th)\nto\n10:00 hrs",
            station_text: "KGTN [Indoor]",
            work_activity: "• Wiring and software update",
            railway_manpower: "• Sri Tanmoy Naskar, SSE/Sig/IC",
            agency_manpower: "• M/s Eldyne (Wireman)",
            row_order: 1
          }
        ]
      };
      const created = await createManpowerPlan(planData);
      setPlans([created, ...plans]);
      setSelectedPlan(created);
      setIsCreateModalOpen(false);
      
      // Reset forms
      setNewPlanName('');
      setNewPlanTitle('INTEGRATED MANPOWER & WORK ACTIVITY PLAN');
      setNewPlanSubtitle('Combined Schedule for Metro Railway Signaling Department');
      showToast("Plan created successfully!");
    } catch (e) {
      console.error("Error creating plan:", e);
      showToast("Failed to create plan.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleSavePlan = async () => {
    if (!selectedPlan || !selectedPlan.id) return;
    setSaving(true);
    try {
      const updated = await updateManpowerPlan(selectedPlan.id, selectedPlan);
      setSelectedPlan(updated);
      
      // Sync list
      const plansList = await getManpowerPlans();
      setPlans(plansList);
      showToast("Plan saved successfully!");
    } catch (e) {
      console.error("Error saving plan:", e);
      showToast("Failed to save plan.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDeletePlan = async (id: number, name: string) => {
    if (!confirm(`Are you sure you want to delete plan "${name}"?`)) return;
    try {
      await deleteManpowerPlan(id);
      setPlans(plans.filter(p => p.id !== id));
      if (selectedPlan && selectedPlan.id === id) {
        setSelectedPlan(null);
      }
      showToast("Plan deleted successfully!");
    } catch (e) {
      console.error("Failed to delete plan:", e);
      showToast("Error deleting plan.", "error");
    }
  };

  const handleExportExcel = async (planId: number, name: string) => {
    setExporting(true);
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/manpower-plans/${planId}/export-excel`);
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Manpower_Plan_${name.replace(/\s+/g, '_')}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showToast("Excel exported successfully!");
    } catch (e) {
      console.error("Excel export error:", e);
      showToast("Excel export failed.", "error");
    } finally {
      setExporting(false);
    }
  };

  // Reordering helpers
  const handleMoveRow = (index: number, direction: 'up' | 'down') => {
    if (!selectedPlan || !selectedPlan.rows) return;
    const newRows = [...selectedPlan.rows];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex < 0 || targetIndex >= newRows.length) return;
    
    // Swap row orders
    const tempOrder = newRows[index].row_order;
    newRows[index].row_order = newRows[targetIndex].row_order;
    newRows[targetIndex].row_order = tempOrder;
    
    // Swap items in array
    const tempItem = newRows[index];
    newRows[index] = newRows[targetIndex];
    newRows[targetIndex] = tempItem;
    
    setSelectedPlan({ ...selectedPlan, rows: newRows });
  };

  const handleUpdateRowValue = (index: number, key: keyof ManpowerPlanRow, value: any) => {
    if (!selectedPlan || !selectedPlan.rows) return;
    const newRows = [...selectedPlan.rows];
    
    // If updating date_text or shift_text, we update it for all rows in the same group
    const oldDate = newRows[index].date_text;
    const oldShift = newRows[index].shift_text;
    
    if (key === 'date_text') {
      newRows.forEach(r => {
        if (r.date_text === oldDate && r.shift_text === oldShift) {
          r.date_text = value;
        }
      });
    } else if (key === 'shift_text') {
      newRows.forEach(r => {
        if (r.date_text === oldDate && r.shift_text === oldShift) {
          r.shift_text = value;
        }
      });
    } else {
      newRows[index] = { ...newRows[index], [key]: value };
    }
    
    setSelectedPlan({ ...selectedPlan, rows: newRows });
  };

  const handleDeleteRow = (index: number) => {
    if (!selectedPlan || !selectedPlan.rows) return;
    const newRows = selectedPlan.rows.filter((_, idx) => idx !== index);
    
    // Reindex row_order
    newRows.forEach((r, idx) => {
      r.row_order = idx + 1;
    });
    
    setSelectedPlan({ ...selectedPlan, rows: newRows });
  };

  const handleAddRowToGroup = (dateText: string, shiftText: string) => {
    if (!selectedPlan || !selectedPlan.rows) return;
    
    // Find the insert position: right after the last row of this group
    let insertIndex = -1;
    for (let i = selectedPlan.rows.length - 1; i >= 0; i--) {
      if (selectedPlan.rows[i].date_text === dateText && selectedPlan.rows[i].shift_text === shiftText) {
        insertIndex = i + 1;
        break;
      }
    }
    
    if (insertIndex === -1) insertIndex = selectedPlan.rows.length;
    
    const newRow: ManpowerPlanRow = {
      date_text: dateText,
      shift_text: shiftText,
      station_text: 'KSKD [Indoor]',
      work_activity: '',
      railway_manpower: '',
      agency_manpower: '',
      row_order: insertIndex + 1
    };
    
    const newRows = [...selectedPlan.rows];
    newRows.splice(insertIndex, 0, newRow);
    
    // Re-index row orders
    newRows.forEach((r, idx) => {
      r.row_order = idx + 1;
    });
    
    setSelectedPlan({ ...selectedPlan, rows: newRows });
  };

  const handleAddNewGroup = () => {
    setDateType('single');
    setSingleDate('2026-05-17');
    setShiftType('night');
    setIsGroupModalOpen(true);
  };

  // Format single/range dates dynamically
  const formatDateString = (dateStr: string): string => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const day = d.getDate();
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[d.getMonth()];
    const yearStr = d.getFullYear().toString().substring(2);
    return `${day} ${month} '${yearStr}`;
  };

  const getGroupFormattedDate = (): string => {
    if (dateType === 'custom') return customDateText;
    if (dateType === 'range') {
      if (!startDate || !endDate) return '';
      const startD = new Date(startDate);
      const endD = new Date(endDate);
      if (isNaN(startD.getTime()) || isNaN(endD.getTime())) return '';
      
      const startDay = startD.getDate();
      const endDay = endD.getDate();
      
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      const startMonth = months[startD.getMonth()];
      const endMonth = months[endD.getMonth()];
      const startYear = startD.getFullYear().toString().substring(2);
      const endYear = endD.getFullYear().toString().substring(2);
      
      return `${startDay} ${startMonth} '${startYear} to ${endDay} ${endMonth} '${endYear}`;
    }
    return formatDateString(singleDate);
  };

  // Format shifts dynamically
  const getGroupFormattedShift = (): string => {
    let baseShift = '';
    if (shiftType === 'night') baseShift = '23:00 hrs to 07:00 hrs\n(Next Day)';
    else if (shiftType === 'day') baseShift = '08:00 hrs to 16:00 hrs';
    else if (shiftType === 'evening') baseShift = '16:00 hrs to 24:00 hrs';
    else if (shiftType === 'custom') {
      baseShift = `${startTime} hrs to ${endTime} hrs`;
    } else {
      baseShift = customShiftText;
    }

    if (includeDatesInShift) {
      if (dateType === 'single' && singleDate) {
        const formattedSingle = formatDateString(singleDate);
        return `From ${formattedSingle} ${startTime || '23:00'} hrs\nto\n${formattedSingle} ${endTime || '07:00'} hrs`;
      }
      if (dateType === 'range' && startDate && endDate) {
        const formattedStart = formatDateString(startDate);
        const formattedEnd = formatDateString(endDate);
        return `From ${formattedStart} ${startTime || '23:00'} hrs\nto\n${formattedEnd} ${endTime || '07:00'} hrs`;
      }
    }
    return baseShift;
  };

  const handleCreateGroup = () => {
    if (!selectedPlan || !selectedPlan.rows) return;
    
    const formattedDate = getGroupFormattedDate();
    const formattedShift = getGroupFormattedShift();
    
    if (!formattedDate.trim() || !formattedShift.trim()) {
      showToast("Please enter a valid date and shift.", "error");
      return;
    }
    
    const newRow: ManpowerPlanRow = {
      date_text: formattedDate.trim(),
      shift_text: formattedShift.trim(),
      station_text: '[Station]',
      work_activity: '',
      railway_manpower: '',
      agency_manpower: '',
      row_order: selectedPlan.rows.length + 1
    };
    
    setSelectedPlan({
      ...selectedPlan,
      rows: [...selectedPlan.rows, newRow]
    });
    
    setIsGroupModalOpen(false);
    showToast("Shift group added!");
  };

  const handleDeleteGroupConfirm = () => {
    if (!groupToDelete || !selectedPlan || !selectedPlan.rows) return;
    const remaining = selectedPlan.rows.filter(
      r => r.date_text !== groupToDelete.date || r.shift_text !== groupToDelete.shift
    );
    remaining.forEach((r, idx) => {
      r.row_order = idx + 1;
    });
    setSelectedPlan({ ...selectedPlan, rows: remaining });
    setGroupToDelete(null);
    showToast("Shift group deleted!");
  };

  // Advanced formatting toolbar helper
  const handleFormatText = (rowIndex: number, field: 'work_activity' | 'railway_manpower' | 'agency_manpower', type: ListStyle) => {
    if (!selectedPlan || !selectedPlan.rows) return;
    const currentVal = selectedPlan.rows[rowIndex][field] || '';
    
    let prefix = '• ';
    if (type === 'circle') prefix = '◦ ';
    else if (type === 'square') prefix = '▪ ';
    else if (type === 'dash') prefix = '- ';
    else if (type === 'check') prefix = '✓ ';
    else if (type === 'star') prefix = '✦ ';
    else if (type === 'diamond') prefix = '❖ ';
    else if (type === 'number') {
      const lines = currentVal.split('\n');
      let maxNum = 0;
      lines.forEach(l => {
        const m = l.match(/^\s*(\d+)\.\s+/);
        if (m) {
          const num = parseInt(m[1]);
          if (num > maxNum) maxNum = num;
        }
      });
      prefix = `${maxNum + 1}. `;
    }
    
    const updatedVal = currentVal 
      ? (currentVal.endsWith('\n') ? `${currentVal}${prefix}` : `${currentVal}\n${prefix}`)
      : prefix;
      
    handleUpdateRowValue(rowIndex, field, updatedVal);
  };

  // Listen to KeyDown to dynamically propagate bullets/numbers on pressing Enter (Word-like editor)
  const handleTextareaKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    rowIndex: number,
    field: 'work_activity' | 'railway_manpower' | 'agency_manpower'
  ) => {
    if (e.key === 'Enter') {
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const text = textarea.value;
      
      // Get the line text up to the cursor
      const beforeCursor = text.substring(0, start);
      const lastNewLine = beforeCursor.lastIndexOf('\n');
      const currentLine = beforeCursor.substring(lastNewLine + 1);
      
      // Matches list bullet/numbers formats: •, ◦, ▪, -, ✓, ✦, ❖ or \d+\.
      const listMatch = currentLine.match(/^\s*(•|◦|▪|-|✓|✦|❖|\d+\.)\s+/);
      
      if (listMatch) {
        e.preventDefault();
        const prefix = listMatch[0]; // full prefix string with spaces
        const bulletSymbol = listMatch[1]; // only the symbol
        
        let nextPrefix = prefix;
        if (bulletSymbol.endsWith('.')) {
          // Numbered list: increment next number
          const num = parseInt(bulletSymbol);
          const baseIndent = prefix.substring(0, prefix.indexOf(bulletSymbol));
          const afterSpace = prefix.substring(prefix.indexOf(bulletSymbol) + bulletSymbol.length);
          nextPrefix = `${baseIndent}${num + 1}.${afterSpace}`;
        }
        
        const newValue = text.substring(0, start) + '\n' + nextPrefix + text.substring(start);
        handleUpdateRowValue(rowIndex, field, newValue);
        
        // Restore cursor position after state sync
        setTimeout(() => {
          textarea.focus();
          const nextCursorPos = start + 1 + nextPrefix.length;
          textarea.setSelectionRange(nextCursorPos, nextCursorPos);
        }, 0);
      }
    }
  };

  // Group rows for rendering grouped cards
  const rowGroups = useMemo(() => {
    if (!selectedPlan || !selectedPlan.rows) return [];
    
    const groups: { key: string; date: string; shift: string; startIndex: number; rows: { originalIndex: number; data: ManpowerPlanRow }[] }[] = [];
    
    selectedPlan.rows.forEach((row, index) => {
      const key = `${row.date_text} || ${row.shift_text}`;
      const matchingGroup = groups.find(g => g.key === key);
      
      if (matchingGroup) {
        matchingGroup.rows.push({ originalIndex: index, data: row });
      } else {
        groups.push({
          key,
          date: row.date_text,
          shift: row.shift_text,
          startIndex: index,
          rows: [{ originalIndex: index, data: row }]
        });
      }
    });
    
    return groups;
  }, [selectedPlan]);

  // Employee modal lookup filtering
  const filteredEmployees = useMemo(() => {
    return employees.filter(e => {
      const matchesSection = empSectionFilter === 'ALL' || e.section_code === empSectionFilter;
      const matchesQuery = empSearchQuery.trim() === '' || 
        e.name.toLowerCase().includes(empSearchQuery.toLowerCase()) ||
        e.designation.toLowerCase().includes(empSearchQuery.toLowerCase()) ||
        e.pf_number.includes(empSearchQuery);
      return matchesSection && matchesQuery;
    });
  }, [employees, empSearchQuery, empSectionFilter]);

  // Helper to format prefix for insertions dynamically based on selected option
  const getInsertPrefix = (currentVal: string, isEmployee: boolean) => {
    const selectedOption = isEmployee ? employeePrefix : agencyPrefix;
    if (selectedOption === 'none') return '';
    if (selectedOption === 'circle') return '◦ ';
    if (selectedOption === 'square') return '▪ ';
    if (selectedOption === 'dash') return '- ';
    if (selectedOption === 'check') return '✓ ';
    if (selectedOption === 'star') return '✦ ';
    if (selectedOption === 'diamond') return '❖ ';
    if (selectedOption === 'number') {
      const lines = currentVal.split('\n');
      let maxNum = 0;
      lines.forEach(l => {
        const m = l.match(/^\s*(\d+)\.\s+/);
        if (m) {
          const num = parseInt(m[1]);
          if (num > maxNum) maxNum = num;
        }
      });
      return `${maxNum + 1}. `;
    }
    return '• '; // Default bullet
  };

  const handleSelectRailwayEmployee = (empName: string, empDesig: string) => {
    if (activeRowIndex === null || !selectedPlan || !selectedPlan.rows) return;
    
    const currentVal = selectedPlan.rows[activeRowIndex].railway_manpower || '';
    const prefix = getInsertPrefix(currentVal, true);
    const newBullet = `${prefix}Sri ${empName}, ${empDesig}`;
    const updatedVal = currentVal 
      ? (currentVal.endsWith('\n') ? `${currentVal}${newBullet}` : `${currentVal}\n${newBullet}`)
      : newBullet;
    
    handleUpdateRowValue(activeRowIndex, 'railway_manpower', updatedVal);
  };

  const handleAddCustomRailway = () => {
    if (activeRowIndex === null || !selectedPlan || !selectedPlan.rows || !customRailName.trim()) return;
    
    const currentVal = selectedPlan.rows[activeRowIndex].railway_manpower || '';
    const prefix = getInsertPrefix(currentVal, true);
    const newBullet = customRailDesig.trim() 
      ? `${prefix}${customRailName.trim()}, ${customRailDesig.trim()}`
      : `${prefix}${customRailName.trim()}`;
    const updatedVal = currentVal 
      ? (currentVal.endsWith('\n') ? `${currentVal}${newBullet}` : `${currentVal}\n${newBullet}`)
      : newBullet;
    
    handleUpdateRowValue(activeRowIndex, 'railway_manpower', updatedVal);
    
    // Clear custom fields
    setCustomRailName('');
    setCustomRailDesig('');
  };

  const handleSelectAgencyOption = (agency: string) => {
    if (activeRowIndex === null || !selectedPlan || !selectedPlan.rows) return;
    
    const currentVal = selectedPlan.rows[activeRowIndex].agency_manpower || '';
    const prefix = getInsertPrefix(currentVal, false);
    const newBullet = `${prefix}${agency}`;
    const updatedVal = currentVal 
      ? (currentVal.endsWith('\n') ? `${currentVal}${newBullet}` : `${currentVal}\n${newBullet}`)
      : newBullet;
    
    handleUpdateRowValue(activeRowIndex, 'agency_manpower', updatedVal);
  };

  const handleAddCustomAgency = () => {
    if (activeRowIndex === null || !selectedPlan || !selectedPlan.rows || !customAgencyName.trim()) return;
    
    const currentVal = selectedPlan.rows[activeRowIndex].agency_manpower || '';
    const prefix = getInsertPrefix(currentVal, false);
    const newBullet = `${prefix}${customAgencyName.trim()}`;
    const updatedVal = currentVal 
      ? (currentVal.endsWith('\n') ? `${currentVal}${newBullet}` : `${currentVal}\n${newBullet}`)
      : newBullet;
    
    handleUpdateRowValue(activeRowIndex, 'agency_manpower', updatedVal);
    setCustomAgencyName('');
  };

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-[#FAF9F6]">
      
      {/* Top Center Toast System - highly premium and never blocked */}
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 px-6 py-3.5 rounded-2xl shadow-xl flex items-center gap-3 animate-in fade-in slide-in-from-top duration-300 z-50 text-sm font-bold text-white tracking-wide ${
          toast.type === 'success' ? 'bg-emerald-600 shadow-emerald-600/20' : 'bg-rose-600 shadow-rose-600/20'
        }`}>
          <span>{toast.message}</span>
        </div>
      )}

      {/* 1. Main Interactive UI Wrapper (Hidden on print) */}
      <div className="no-print space-y-8">
        
        {/* Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-white border border-[#E2E0D9] p-6 rounded-2xl shadow-xs">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/20">
              <ClipboardList size={24} />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">
                {selectedPlan ? selectedPlan.name : getTranslation(lang, 'Manpower Planning')}
              </h1>
              <p className="text-sm text-slate-500 font-semibold mt-0.5">
                {selectedPlan 
                  ? "Configure integrated work schedules, assign manpower, print or export A4 sheets" 
                  : "Manage integrated manpower and activity schedules for special signaling works"}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {selectedPlan ? (
              <>
                <button
                  onClick={() => setSelectedPlan(null)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[#E2E0D9] hover:bg-slate-50 text-slate-700 font-bold transition-all text-sm cursor-pointer select-none"
                >
                  <ArrowLeft size={16} />
                  Back to Plans
                </button>
                <button
                  onClick={() => handleExportExcel(selectedPlan.id!, selectedPlan.name)}
                  disabled={exporting}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold transition-all text-sm cursor-pointer select-none shadow-sm shadow-emerald-500/10 disabled:opacity-50"
                >
                  <FileSpreadsheet size={16} />
                  {exporting ? "Exporting..." : "Export Excel"}
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold transition-all text-sm cursor-pointer select-none shadow-sm"
                >
                  <Printer size={16} />
                  Print Plan
                </button>
                <button
                  onClick={handleSavePlan}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all text-sm cursor-pointer select-none shadow-md shadow-indigo-500/20 disabled:opacity-50"
                >
                  <Save size={16} />
                  {saving ? "Saving..." : "Save Plan"}
                </button>
              </>
            ) : (
              <button
                onClick={() => setIsCreateModalOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all text-sm cursor-pointer select-none shadow-md shadow-indigo-500/20"
              >
                <PlusCircle size={16} />
                Create Manpower Plan
              </button>
            )}
          </div>
        </div>

        {selectedPlan ? (
          /* --- EDITOR VIEW --- */
          <div className="space-y-8 pb-16 animate-in fade-in slide-in-from-bottom-2 duration-200">
            
            {/* Plan Settings Card */}
            <div className="bg-white border border-[#E2E0D9] p-6 rounded-2xl shadow-xs space-y-4">
              <h2 className="text-lg font-bold text-slate-800 border-b border-slate-100 pb-3">Plan Sheet Configuration</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-extrabold text-slate-500 uppercase mb-2">Plan Name</label>
                  <input
                    type="text"
                    value={selectedPlan.name}
                    onChange={(e) => setSelectedPlan({ ...selectedPlan, name: e.target.value })}
                    className="w-full px-4 py-2.5 border border-[#E2E0D9] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-sm font-semibold animate-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-500 uppercase mb-2">Excel Title (Cell A1)</label>
                  <input
                    type="text"
                    value={selectedPlan.title}
                    onChange={(e) => setSelectedPlan({ ...selectedPlan, title: e.target.value })}
                    className="w-full px-4 py-2.5 border border-[#E2E0D9] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-sm font-semibold animate-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-500 uppercase mb-2">Excel Subtitle (Cell A2)</label>
                  <input
                    type="text"
                    value={selectedPlan.subtitle}
                    onChange={(e) => setSelectedPlan({ ...selectedPlan, subtitle: e.target.value })}
                    className="w-full px-4 py-2.5 border border-[#E2E0D9] rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 text-sm font-semibold animate-none"
                  />
                </div>
              </div>
            </div>

            {/* Groupings Card */}
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-extrabold text-slate-800">Date & Shift Schedule Groups</h2>
                <button
                  onClick={handleAddNewGroup}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl border border-indigo-600 hover:bg-indigo-50 text-indigo-700 font-bold transition-all text-xs cursor-pointer select-none"
                >
                  <Plus size={14} />
                  Add New Group
                </button>
              </div>

              {rowGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 bg-white border border-[#E2E0D9] border-dashed rounded-2xl">
                  <FileText className="text-slate-300 mb-3" size={40} />
                  <p className="text-sm font-bold text-slate-500">No shift groups in this plan yet.</p>
                  <button
                    onClick={handleAddNewGroup}
                    className="mt-3 text-xs font-extrabold text-indigo-600 hover:text-indigo-800"
                  >
                    Create a Date & Shift Group
                  </button>
                </div>
              ) : (
                rowGroups.map((group, groupIdx) => (
                  <div key={group.key} className="bg-white border border-[#E2E0D9] rounded-2xl shadow-xs overflow-hidden">
                    
                    {/* Group Header */}
                    <div className="bg-slate-50 border-b border-[#E2E0D9] p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                      <div className="flex flex-wrap items-center gap-4 w-full sm:w-auto">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-extrabold text-slate-400 uppercase">Date:</span>
                          <input
                            type="text"
                            value={group.date}
                            onChange={(e) => handleUpdateRowValue(group.rows[0].originalIndex, 'date_text', e.target.value)}
                            className="px-3 py-1.5 border border-[#E2E0D9] bg-white rounded-lg focus:outline-hidden text-sm font-bold text-slate-800"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-extrabold text-slate-400 uppercase">Shift / Time:</span>
                          <input
                            type="text"
                            value={group.shift}
                            onChange={(e) => handleUpdateRowValue(group.rows[0].originalIndex, 'shift_text', e.target.value)}
                            className="px-3 py-1.5 border border-[#E2E0D9] bg-white rounded-lg focus:outline-hidden text-sm font-bold text-slate-800 w-64 h-9"
                          />
                        </div>
                      </div>
                      
                      <button
                        onClick={() => setGroupToDelete({ date: group.date, shift: group.shift })}
                        className="text-xs font-extrabold text-red-600 hover:text-red-800 flex items-center gap-1 cursor-pointer select-none"
                      >
                        <Trash2 size={13} />
                        Delete Group
                      </button>
                    </div>

                    {/* Group Rows Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="bg-white border-b border-slate-100 text-left">
                            <th className="px-4 py-3 text-xs font-extrabold text-slate-500 uppercase tracking-wider w-1/5">Station & Domain</th>
                            <th className="px-4 py-3 text-xs font-extrabold text-slate-500 uppercase tracking-wider w-1/4">Planned Work Activity</th>
                            <th className="px-4 py-3 text-xs font-extrabold text-slate-500 uppercase tracking-wider w-1/4">Railway Manpower</th>
                            <th className="px-4 py-3 text-xs font-extrabold text-slate-500 uppercase tracking-wider w-1/5">Agency / Contractor</th>
                            <th className="px-4 py-3 text-xs font-extrabold text-slate-500 uppercase tracking-wider w-32 text-center">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {group.rows.map((rowWrapper, rIdx) => {
                            const origIdx = rowWrapper.originalIndex;
                            const row = rowWrapper.data;
                            
                            return (
                              <tr key={origIdx} className="hover:bg-slate-50/40 transition-colors">
                                {/* Station & Domain */}
                                <td className="px-4 py-3 align-top">
                                  <input
                                    type="text"
                                    list="stations-datalist"
                                    value={row.station_text}
                                    onChange={(e) => handleUpdateRowValue(origIdx, 'station_text', e.target.value)}
                                    className="w-full px-3 py-2 border border-[#E2E0D9] rounded-lg text-sm font-semibold focus:outline-hidden"
                                  />
                                  <datalist id="stations-datalist">
                                    {COMMON_STATIONS.map(s => <option key={s} value={s} />)}
                                  </datalist>
                                </td>

                                {/* Planned Work Activity */}
                                <td className="px-4 py-3 align-top">
                                  <div className="space-y-2">
                                    <textarea
                                      rows={3}
                                      value={row.work_activity}
                                      onChange={(e) => handleUpdateRowValue(origIdx, 'work_activity', e.target.value)}
                                      onKeyDown={(e) => handleTextareaKeyDown(e, origIdx, 'work_activity')}
                                      className="w-full px-3 py-2 border border-[#E2E0D9] rounded-lg text-sm font-medium focus:outline-hidden focus:ring-1 focus:ring-indigo-500/20 animate-none resize-y"
                                      placeholder="Type planned activities... (Auto-inserts prefix on Enter)"
                                    />
                                    {/* Advanced formatting toolbar - multi-choices */}
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                                      <span className="text-[9px] font-extrabold text-slate-400 uppercase mr-1">Insert Prefix:</span>
                                      <button
                                        type="button"
                                        onClick={() => handleFormatText(origIdx, 'work_activity', 'bullet')}
                                        className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[9px] font-bold text-slate-600 hover:text-indigo-700 rounded-md cursor-pointer transition-colors"
                                      >
                                        • Bullet
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleFormatText(origIdx, 'work_activity', 'circle')}
                                        className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[9px] font-bold text-slate-600 hover:text-indigo-700 rounded-md cursor-pointer transition-colors"
                                      >
                                        ◦ Circle
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleFormatText(origIdx, 'work_activity', 'square')}
                                        className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[9px] font-bold text-slate-600 hover:text-indigo-700 rounded-md cursor-pointer transition-colors"
                                      >
                                        ▪ Square
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleFormatText(origIdx, 'work_activity', 'dash')}
                                        className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[9px] font-bold text-slate-600 hover:text-indigo-700 rounded-md cursor-pointer transition-colors"
                                      >
                                        - Dash
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleFormatText(origIdx, 'work_activity', 'number')}
                                        className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[9px] font-bold text-slate-600 hover:text-indigo-700 rounded-md cursor-pointer transition-colors"
                                      >
                                        1. Num
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleFormatText(origIdx, 'work_activity', 'check')}
                                        className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[9px] font-bold text-slate-600 hover:text-indigo-700 rounded-md cursor-pointer transition-colors"
                                      >
                                        ✓ Tick
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleFormatText(origIdx, 'work_activity', 'star')}
                                        className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[9px] font-bold text-slate-600 hover:text-indigo-700 rounded-md cursor-pointer transition-colors"
                                      >
                                        ✦ Star
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleFormatText(origIdx, 'work_activity', 'diamond')}
                                        className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[9px] font-bold text-slate-600 hover:text-indigo-700 rounded-md cursor-pointer transition-colors"
                                      >
                                        ❖ Dia
                                      </button>
                                    </div>
                                  </div>
                                </td>

                                {/* Railway Manpower */}
                                <td className="px-4 py-3 align-top">
                                  <div className="space-y-2">
                                    <textarea
                                      rows={3}
                                      value={row.railway_manpower}
                                      onChange={(e) => handleUpdateRowValue(origIdx, 'railway_manpower', e.target.value)}
                                      onKeyDown={(e) => handleTextareaKeyDown(e, origIdx, 'railway_manpower')}
                                      className="w-full px-3 py-2 border border-[#E2E0D9] rounded-lg text-sm font-medium focus:outline-hidden focus:ring-1 focus:ring-indigo-500/20 resize-y"
                                      placeholder="Railway staff lists... (Press Enter to carry prefix)"
                                    />
                                    <div className="flex flex-wrap items-center justify-between gap-2 mt-1">
                                      {/* Format dropdown toolbar */}
                                      <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                                        <span className="text-[9px] font-extrabold text-slate-400 uppercase mr-1">Insert Prefix:</span>
                                        <button
                                          type="button"
                                          onClick={() => handleFormatText(origIdx, 'railway_manpower', 'bullet')}
                                          className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[9px] font-bold text-slate-600 hover:text-indigo-700 rounded-md cursor-pointer transition-colors"
                                        >
                                          • Bullet
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleFormatText(origIdx, 'railway_manpower', 'circle')}
                                          className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[9px] font-bold text-slate-600 hover:text-indigo-700 rounded-md cursor-pointer transition-colors"
                                        >
                                          ◦ Circle
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleFormatText(origIdx, 'railway_manpower', 'square')}
                                          className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[9px] font-bold text-slate-600 hover:text-indigo-700 rounded-md cursor-pointer transition-colors"
                                        >
                                          ▪ Square
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleFormatText(origIdx, 'railway_manpower', 'dash')}
                                          className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[9px] font-bold text-slate-600 hover:text-indigo-700 rounded-md cursor-pointer transition-colors"
                                        >
                                          - Dash
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleFormatText(origIdx, 'railway_manpower', 'number')}
                                          className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[9px] font-bold text-slate-600 hover:text-indigo-700 rounded-md cursor-pointer transition-colors"
                                        >
                                          1. Num
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleFormatText(origIdx, 'railway_manpower', 'check')}
                                          className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[9px] font-bold text-slate-600 hover:text-indigo-700 rounded-md cursor-pointer transition-colors"
                                        >
                                          ✓ Tick
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleFormatText(origIdx, 'railway_manpower', 'star')}
                                          className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[9px] font-bold text-slate-600 hover:text-indigo-700 rounded-md cursor-pointer transition-colors"
                                        >
                                          ✦ Star
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleFormatText(origIdx, 'railway_manpower', 'diamond')}
                                          className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[9px] font-bold text-slate-600 hover:text-indigo-700 rounded-md cursor-pointer transition-colors"
                                        >
                                          ❖ Dia
                                        </button>
                                      </div>
                                      <button
                                        onClick={() => {
                                          setActiveRowIndex(origIdx);
                                          setEmpSearchQuery('');
                                          setIsEmployeeModalOpen(true);
                                        }}
                                        className="text-xs font-bold text-indigo-600 hover:text-indigo-855 flex items-center gap-1 bg-indigo-50 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer select-none"
                                      >
                                        <UserPlus size={12} />
                                        Assign Railway Employee
                                      </button>
                                    </div>
                                  </div>
                                </td>

                                {/* Agency / Contractor */}
                                <td className="px-4 py-3 align-top">
                                  <div className="space-y-2">
                                    <textarea
                                      rows={3}
                                      value={row.agency_manpower}
                                      onChange={(e) => handleUpdateRowValue(origIdx, 'agency_manpower', e.target.value)}
                                      onKeyDown={(e) => handleTextareaKeyDown(e, origIdx, 'agency_manpower')}
                                      className="w-full px-3 py-2 border border-[#E2E0D9] rounded-lg text-sm font-medium focus:outline-hidden focus:ring-1 focus:ring-indigo-500/20 resize-y"
                                      placeholder="Agency/Contractor staff... (Auto list on Enter)"
                                    />
                                    <div className="flex flex-wrap items-center justify-between gap-2 mt-1">
                                      <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                                        <span className="text-[9px] font-extrabold text-slate-400 uppercase mr-1">Insert Prefix:</span>
                                        <button
                                          type="button"
                                          onClick={() => handleFormatText(origIdx, 'agency_manpower', 'bullet')}
                                          className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[9px] font-bold text-slate-600 hover:text-indigo-700 rounded-md cursor-pointer transition-colors"
                                        >
                                          • Bullet
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleFormatText(origIdx, 'agency_manpower', 'circle')}
                                          className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[9px] font-bold text-slate-600 hover:text-indigo-700 rounded-md cursor-pointer transition-colors"
                                        >
                                          ◦ Circle
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleFormatText(origIdx, 'agency_manpower', 'square')}
                                          className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[9px] font-bold text-slate-600 hover:text-indigo-700 rounded-md cursor-pointer transition-colors"
                                        >
                                          ▪ Square
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleFormatText(origIdx, 'agency_manpower', 'dash')}
                                          className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[9px] font-bold text-slate-600 hover:text-indigo-700 rounded-md cursor-pointer transition-colors"
                                        >
                                          - Dash
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleFormatText(origIdx, 'agency_manpower', 'number')}
                                          className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[9px] font-bold text-slate-600 hover:text-indigo-700 rounded-md cursor-pointer transition-colors"
                                        >
                                          1. Num
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleFormatText(origIdx, 'agency_manpower', 'check')}
                                          className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[9px] font-bold text-slate-600 hover:text-indigo-700 rounded-md cursor-pointer transition-colors"
                                        >
                                          ✓ Tick
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleFormatText(origIdx, 'agency_manpower', 'star')}
                                          className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[9px] font-bold text-slate-600 hover:text-indigo-700 rounded-md cursor-pointer transition-colors"
                                        >
                                          ✦ Star
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => handleFormatText(origIdx, 'agency_manpower', 'diamond')}
                                          className="px-1.5 py-0.5 border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-[9px] font-bold text-slate-600 hover:text-indigo-700 rounded-md cursor-pointer transition-colors"
                                        >
                                          ❖ Dia
                                        </button>
                                      </div>
                                      <button
                                        onClick={() => {
                                          setActiveRowIndex(origIdx);
                                          setIsAgencyModalOpen(true);
                                        }}
                                        className="text-xs font-bold text-emerald-600 hover:text-emerald-855 flex items-center gap-1 bg-emerald-50 px-2.5 py-1.5 rounded-md transition-colors cursor-pointer select-none"
                                      >
                                        <Plus size={12} />
                                        Add Agency Manpower
                                      </button>
                                    </div>
                                  </div>
                                </td>

                                {/* Reorder and Delete Actions */}
                                <td className="px-4 py-3 align-top text-center">
                                  <div className="flex items-center justify-center gap-1.5 h-10">
                                    <button
                                      onClick={() => handleMoveRow(origIdx, 'up')}
                                      disabled={origIdx === 0}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-20 cursor-pointer"
                                      title="Move Up"
                                    >
                                      <ChevronUp size={16} />
                                    </button>
                                    <button
                                      onClick={() => handleMoveRow(origIdx, 'down')}
                                      disabled={origIdx === selectedPlan.rows!.length - 1}
                                      className="p-1 hover:bg-slate-100 rounded text-slate-500 disabled:opacity-20 cursor-pointer"
                                      title="Move Down"
                                    >
                                      <ChevronDown size={16} />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteRow(origIdx)}
                                      className="p-1.5 hover:bg-red-50 text-red-600 hover:text-red-800 rounded cursor-pointer"
                                      title="Delete Row"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Add Row Button under Group */}
                    <div className="bg-slate-50/40 p-3 border-t border-[#E2E0D9] flex justify-center">
                      <button
                        onClick={() => handleAddRowToGroup(group.date, group.shift)}
                        className="text-xs font-extrabold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer select-none"
                      >
                        <Plus size={13} />
                        Add Row to Group
                      </button>
                    </div>

                  </div>
                ))
              )}
            </div>
          </div>
        ) : (
          /* --- LIST VIEW --- */
          <div className="bg-white border border-[#E2E0D9] rounded-2xl shadow-xs overflow-hidden">
            {plans.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
                <div className="w-16 h-16 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-4 animate-bounce">
                  <ClipboardList size={32} />
                </div>
                <h3 className="text-lg font-bold text-slate-700">No manpower plans created yet</h3>
                <p className="text-slate-400 text-sm max-w-sm mt-1">
                  Establish an integrated work and manpower activity schedule for blocks or signaling events.
                </p>
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="mt-6 flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold transition-all text-sm cursor-pointer select-none shadow-md shadow-indigo-500/20"
                >
                  <PlusCircle size={16} />
                  Create Manpower Plan
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {/* Header row */}
                <div className="grid grid-cols-12 bg-slate-50/70 p-4 text-xs font-extrabold text-slate-400 uppercase tracking-wider">
                  <div className="col-span-6 md:col-span-5">Plan Title</div>
                  <div className="col-span-6 md:col-span-3">Last Updated</div>
                  <div className="col-span-12 md:col-span-4 text-right">Actions</div>
                </div>
                
                {/* Data rows */}
                {plans.map((plan) => (
                  <div
                    key={plan.id}
                    className="grid grid-cols-12 p-4 items-center hover:bg-slate-50/50 transition-all duration-200"
                  >
                    <div className="col-span-6 md:col-span-5 flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold shrink-0">
                        MP
                      </div>
                      <div>
                        <h4
                          onClick={() => handleOpenPlan(plan.id!)}
                          className="font-bold text-slate-800 hover:text-indigo-600 transition-colors cursor-pointer text-sm"
                        >
                          {plan.name}
                        </h4>
                        <p className="text-xs font-semibold text-slate-400 mt-0.5 truncate max-w-xs md:max-w-md">
                          {plan.subtitle}
                        </p>
                      </div>
                    </div>
                    
                    <div className="col-span-6 md:col-span-3 text-sm text-slate-500 font-semibold">
                      {plan.updated_at ? new Date(plan.updated_at).toLocaleString() : 'N/A'}
                    </div>
                    
                    <div className="col-span-12 md:col-span-4 flex items-center justify-end gap-2 mt-4 md:mt-0">
                      <button
                        onClick={() => handleOpenPlan(plan.id!)}
                        className="px-3.5 py-1.5 rounded-lg border border-[#E2E0D9] hover:bg-slate-50 text-slate-700 font-bold text-xs cursor-pointer select-none transition-colors"
                      >
                        Edit Plan
                      </button>
                      <button
                        onClick={() => handleExportExcel(plan.id!, plan.name)}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 font-bold text-xs cursor-pointer select-none transition-colors flex items-center gap-1"
                      >
                        <FileSpreadsheet size={12} />
                        Export Excel
                      </button>
                      <button
                        onClick={() => handleDeletePlan(plan.id!, plan.name)}
                        className="p-2 hover:bg-red-50 text-red-600 hover:text-red-800 rounded-lg cursor-pointer transition-colors"
                        title="Delete Plan"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* --- 3. MODALS AND FLOATING DIALOGS (Hidden on Print) --- */}

        {/* 3a. CREATE PLAN MODAL */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <form
              onSubmit={handleCreatePlan}
              className="bg-white border border-[#E2E0D9] rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-150 overflow-hidden"
            >
              <div className="bg-slate-50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-extrabold text-slate-800">New Manpower Planning Sheet</h3>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="p-1 hover:bg-slate-200 rounded-full text-slate-400 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
              
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-xs font-extrabold text-slate-500 uppercase mb-2">Plan / Event Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. NI KSKD May 2026"
                    value={newPlanName}
                    onChange={(e) => setNewPlanName(e.target.value)}
                    className="w-full px-4 py-2.5 border border-[#E2E0D9] rounded-xl focus:outline-hidden text-sm font-semibold animate-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-500 uppercase mb-2">Excel Title (Cell A1)</label>
                  <input
                    type="text"
                    value={newPlanTitle}
                    onChange={(e) => setNewPlanTitle(e.target.value)}
                    className="w-full px-4 py-2.5 border border-[#E2E0D9] rounded-xl focus:outline-hidden text-sm font-semibold animate-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold text-slate-500 uppercase mb-2">Excel Subtitle (Cell A2)</label>
                  <input
                    type="text"
                    value={newPlanSubtitle}
                    onChange={(e) => setNewPlanSubtitle(e.target.value)}
                    className="w-full px-4 py-2.5 border border-[#E2E0D9] rounded-xl focus:outline-hidden text-sm font-semibold animate-none"
                  />
                </div>
              </div>
              
              <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-[#E2E0D9] hover:bg-slate-100 font-bold text-sm cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-500/20 cursor-pointer disabled:opacity-50"
                >
                  {saving ? "Creating..." : "Create Plan"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 3b. ASSIGN RAILWAY EMPLOYEE MODAL */}
        {isEmployeeModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white border border-[#E2E0D9] rounded-2xl w-full max-w-2xl shadow-2xl animate-in zoom-in-95 duration-150 overflow-hidden flex flex-col max-h-[85vh]">
              <div className="bg-slate-50 px-6 py-4 border-b border-[#E2E0D9] flex items-center justify-between shrink-0">
                <h3 className="font-extrabold text-slate-800">Assign Railway Employee</h3>
                <button
                  type="button"
                  onClick={() => setIsEmployeeModalOpen(false)}
                  className="p-1 hover:bg-slate-200 rounded-full text-slate-400 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>
              
              {/* Custom prefix selector settings inside employee assignment modal - supports all 8 list types */}
              <div className="px-6 py-3 bg-slate-100/60 border-b border-[#E2E0D9] flex flex-wrap items-center gap-3 shrink-0">
                <span className="text-xs font-extrabold text-slate-500 uppercase">Insert Format Prefix:</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {([
                    { id: 'bullet', label: '• Bullet' },
                    { id: 'circle', label: '◦ Circle' },
                    { id: 'square', label: '▪ Square' },
                    { id: 'dash', label: '- Dash' },
                    { id: 'number', label: '1. Num' },
                    { id: 'check', label: '✓ Tick' },
                    { id: 'star', label: '✦ Star' },
                    { id: 'diamond', label: '❖ Dia' },
                    { id: 'none', label: 'Plain text' }
                  ] as const).map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setEmployeePrefix(opt.id)}
                      className={`px-2.5 py-1 border text-xs font-bold rounded-lg transition-colors cursor-pointer select-none ${
                        employeePrefix === opt.id 
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Search filter block */}
              <div className="p-4 bg-slate-50/50 border-b border-[#E2E0D9] flex flex-col sm:flex-row gap-3 shrink-0">
                <div className="relative flex-1">
                  <Search className="absolute left-3.5 top-3 text-slate-400" size={16} />
                  <input
                    type="text"
                    placeholder="Search by name, PF number, designation..."
                    value={empSearchQuery}
                    onChange={(e) => setEmpSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-[#E2E0D9] rounded-xl text-sm font-semibold focus:outline-hidden bg-white"
                  />
                </div>
                <div className="w-full sm:w-48">
                  <select
                    value={empSectionFilter}
                    onChange={(e) => setEmpSectionFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-[#E2E0D9] rounded-xl text-sm font-bold focus:outline-hidden bg-white"
                  >
                    <option value="ALL">All Sections</option>
                    {sections.map(s => (
                      <option key={s.section_code} value={s.section_code}>{s.section_code} Section</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Employee List */}
              <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-2">
                {filteredEmployees.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 font-semibold">
                    No matching employees found in database.
                  </div>
                ) : (
                  filteredEmployees.map(emp => (
                    <div
                      key={emp.emp_id}
                      onClick={() => {
                        handleSelectRailwayEmployee(emp.name, emp.designation);
                        setIsEmployeeModalOpen(false);
                      }}
                      className="p-3 hover:bg-indigo-50/50 rounded-xl cursor-pointer transition-colors flex items-center justify-between group"
                    >
                      <div>
                        <h4 className="font-bold text-slate-800 group-hover:text-indigo-600 transition-colors text-sm">{emp.name}</h4>
                        <p className="text-xs font-semibold text-slate-400 mt-0.5">{emp.designation} • Level {emp.level} • {emp.section_code} Section</p>
                      </div>
                      <span className="text-xs font-bold text-indigo-600 bg-indigo-50 group-hover:bg-indigo-100 px-2.5 py-1 rounded-md opacity-0 group-hover:opacity-100 transition-all">
                        Select
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Custom Entry Block */}
              <div className="p-4 bg-slate-50 border-t border-[#E2E0D9] shrink-0 space-y-3">
                <h4 className="text-xs font-extrabold text-slate-500 uppercase">Or Add Custom Name (From other departments/contractors)</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input
                    type="text"
                    placeholder="Employee / Inspector Name"
                    value={customRailName}
                    onChange={(e) => setCustomRailName(e.target.value)}
                    className="px-3.5 py-2 border border-[#E2E0D9] bg-white rounded-xl text-sm font-semibold focus:outline-hidden animate-none"
                  />
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Designation (e.g. SSE/P-Way/IC)"
                      value={customRailDesig}
                      onChange={(e) => setCustomRailDesig(e.target.value)}
                      className="flex-1 px-3.5 py-2 border border-[#E2E0D9] bg-white rounded-xl text-sm font-semibold focus:outline-hidden animate-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomRailway}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm rounded-xl cursor-pointer shrink-0 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3c. ADD AGENCY MANPOWER MODAL */}
        {isAgencyModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
            <div className="bg-white border border-[#E2E0D9] rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-150 overflow-hidden">
              <div className="bg-slate-50 px-6 py-4 border-b border-[#E2E0D9] flex items-center justify-between">
                <h3 className="font-extrabold text-slate-800">Add Agency / Contractor Manpower</h3>
                <button
                  type="button"
                  onClick={() => setIsAgencyModalOpen(false)}
                  className="p-1 hover:bg-slate-200 rounded-full text-slate-400 cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Custom prefix selector settings inside agency assignment modal - supports all 8 formats */}
              <div className="px-6 py-3 bg-slate-100/60 border-b border-[#E2E0D9] flex flex-wrap items-center gap-3 shrink-0">
                <span className="text-xs font-extrabold text-slate-500 uppercase">Insert Format Prefix:</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  {([
                    { id: 'bullet', label: '• Bullet' },
                    { id: 'circle', label: '◦ Circle' },
                    { id: 'square', label: '▪ Square' },
                    { id: 'dash', label: '- Dash' },
                    { id: 'number', label: '1. Num' },
                    { id: 'check', label: '✓ Tick' },
                    { id: 'star', label: '✦ Star' },
                    { id: 'diamond', label: '❖ Dia' },
                    { id: 'none', label: 'Plain' }
                  ] as const).map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setAgencyPrefix(opt.id)}
                      className={`px-2 py-0.5 border text-[10px] font-bold rounded-lg transition-colors cursor-pointer select-none ${
                        agencyPrefix === opt.id 
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="p-6 space-y-6">
                {/* Quick options list */}
                <div className="space-y-2">
                  <h4 className="text-xs font-extrabold text-slate-500 uppercase">Quick Select Agencies</h4>
                  <div className="flex flex-wrap gap-2">
                    {COMMON_AGENCIES.map(agency => (
                      <button
                        key={agency}
                        type="button"
                        onClick={() => {
                          handleSelectAgencyOption(agency);
                          setIsAgencyModalOpen(false);
                        }}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-slate-700 hover:text-indigo-700 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                      >
                        {agency}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Custom input */}
                <div className="space-y-2 border-t border-slate-100 pt-4">
                  <h4 className="text-xs font-extrabold text-slate-500 uppercase">Custom Contractor Entry</h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. M/s Siemens (01 no wireman)"
                      value={customAgencyName}
                      onChange={(e) => setCustomAgencyName(e.target.value)}
                      className="flex-1 px-3.5 py-2 border border-[#E2E0D9] rounded-xl text-sm font-semibold focus:outline-hidden animate-none"
                    />
                    <button
                      type="button"
                      onClick={handleAddCustomAgency}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm rounded-xl cursor-pointer shrink-0 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsAgencyModalOpen(false)}
                  className="px-4 py-1.5 rounded-xl border border-[#E2E0D9] hover:bg-slate-100 font-bold text-xs cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      {/* 3d. CUSTOM GROUP CREATION MODAL (Replaces Prompt Dialogs with pickers) */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#E2E0D9] rounded-2xl w-full max-w-lg shadow-2xl animate-in zoom-in-95 duration-150 overflow-hidden">
            <div className="bg-slate-50 px-6 py-4 border-b border-[#E2E0D9] flex items-center justify-between">
              <h3 className="font-extrabold text-slate-800">Add Date & Shift Group</h3>
              <button
                type="button"
                onClick={() => setIsGroupModalOpen(false)}
                className="p-1 hover:bg-slate-200 rounded-full text-slate-400 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 space-y-6">
              
              {/* Date selection block */}
              <div className="space-y-3">
                <label className="block text-xs font-extrabold text-slate-500 uppercase">1. Date Configuration</label>
                <div className="flex gap-2">
                  {(['single', 'range', 'custom'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setDateType(type)}
                      className={`flex-1 py-2 border text-xs font-bold rounded-lg transition-colors cursor-pointer select-none ${
                        dateType === type 
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {type === 'single' && 'Single Date'}
                      {type === 'range' && 'Date Range'}
                      {type === 'custom' && 'Custom Text'}
                    </button>
                  ))}
                </div>
                
                {dateType === 'single' && (
                  <div>
                    <input
                      type="date"
                      value={singleDate}
                      onChange={(e) => setSingleDate(e.target.value)}
                      className="w-full px-4 py-2 border border-[#E2E0D9] rounded-xl text-sm font-semibold focus:outline-hidden bg-white"
                    />
                  </div>
                )}
                
                {dateType === 'range' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">Start Date</span>
                      <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-3 py-1.5 border border-[#E2E0D9] rounded-lg text-xs font-semibold focus:outline-hidden bg-white"
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">End Date</span>
                      <input
                        type="date"
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="w-full px-3 py-1.5 border border-[#E2E0D9] rounded-lg text-xs font-semibold focus:outline-hidden bg-white"
                      />
                    </div>
                  </div>
                )}
                
                {dateType === 'custom' && (
                  <div>
                    <input
                      type="text"
                      placeholder="e.g. 16/17 May '26"
                      value={customDateText}
                      onChange={(e) => setCustomDateText(e.target.value)}
                      className="w-full px-4 py-2 border border-[#E2E0D9] rounded-xl text-sm font-semibold focus:outline-hidden bg-white"
                    />
                  </div>
                )}
              </div>

              {/* Shift selection block */}
              <div className="space-y-3">
                <label className="block text-xs font-extrabold text-slate-500 uppercase">2. Shift & Timing</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['night', 'day', 'evening', 'custom'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setShiftType(type)}
                      className={`py-1.5 border text-xs font-bold rounded-lg transition-colors cursor-pointer select-none ${
                        shiftType === type 
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      {type === 'night' && 'Night Shift'}
                      {type === 'day' && 'Day Shift'}
                      {type === 'evening' && 'Evening Shift'}
                      {type === 'custom' && 'Custom Hours'}
                    </button>
                  ))}
                </div>
                
                {shiftType === 'custom' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">Start Time</span>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full px-3 py-1.5 border border-[#E2E0D9] rounded-lg text-xs font-semibold focus:outline-hidden bg-white"
                      />
                    </div>
                    <div>
                      <span className="block text-[10px] font-extrabold text-slate-400 uppercase mb-1">End Time</span>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full px-3 py-1.5 border border-[#E2E0D9] rounded-lg text-xs font-semibold focus:outline-hidden bg-white"
                      />
                    </div>
                  </div>
                )}
                
                {shiftType === 'custom' && (
                  <p className="text-[10px] text-slate-400 font-semibold italic">Formats to: {startTime} hrs to {endTime} hrs</p>
                )}
              </div>
              {/* Optional Date detail inside shift time */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <input
                  type="checkbox"
                  id="include-dates-toggle"
                  checked={includeDatesInShift}
                  onChange={(e) => setIncludeDatesInShift(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500/20 cursor-pointer"
                />
                <label htmlFor="include-dates-toggle" className="text-xs font-bold text-slate-600 cursor-pointer select-none">
                  Include explicit date details in Shift/Time column
                </label>
              </div>

              {/* Generated Group Preview */}
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-3.5 space-y-2">
                <span className="text-[10px] font-extrabold text-indigo-500 uppercase tracking-wider block">Generated Group Preview</span>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[9px] font-extrabold text-slate-400 uppercase block mb-0.5">Date Column</span>
                    <p className="font-bold text-slate-800">{getGroupFormattedDate() || '(select date)'}</p>
                  </div>
                  <div>
                    <span className="text-[9px] font-extrabold text-slate-400 uppercase block mb-0.5">Shift/Time Column</span>
                    <p className="font-bold text-slate-800 whitespace-pre-line">{getGroupFormattedShift() || '(select shift)'}</p>
                  </div>
                </div>
              </div>

            </div>
            
            <div className="bg-slate-50 px-6 py-4 border-t border-[#E2E0D9] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsGroupModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-[#E2E0D9] hover:bg-slate-100 font-bold text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateGroup}
                className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md shadow-indigo-500/20 cursor-pointer"
              >
                Add Group
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3e. GROUP DELETE CONFIRMATION MODAL */}
      {groupToDelete && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-[#E2E0D9] rounded-2xl w-full max-w-md shadow-2xl animate-in zoom-in-95 duration-150 overflow-hidden">
            <div className="bg-red-50 px-6 py-4 border-b border-red-100 flex items-center justify-between">
              <h3 className="font-extrabold text-red-800 flex items-center gap-2">
                <Trash2 size={18} />
                Delete Shift Group
              </h3>
              <button
                type="button"
                onClick={() => setGroupToDelete(null)}
                className="p-1 hover:bg-red-100 rounded-full text-red-400 cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 space-y-3">
              <p className="text-sm font-bold text-slate-800">
                Are you sure you want to delete all rows in the group for:
              </p>
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl space-y-1.5">
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase">Date</span>
                  <p className="text-sm font-extrabold text-slate-700">{groupToDelete.date}</p>
                </div>
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase">Shift / Time</span>
                  <p className="text-sm font-extrabold text-slate-700 whitespace-pre-line">{groupToDelete.shift}</p>
                </div>
              </div>
              <p className="text-xs font-semibold text-rose-500 italic mt-2">
                * Note: This will delete all work activity rows assigned under this specific date & shift. This action is permanent.
              </p>
            </div>
            
            <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setGroupToDelete(null)}
                className="px-4 py-2 rounded-xl border border-[#E2E0D9] hover:bg-slate-100 font-bold text-sm cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteGroupConfirm}
                className="px-5 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold text-sm shadow-md shadow-red-500/20 cursor-pointer"
              >
                Delete Group
              </button>
            </div>
          </div>
        </div>
      )}

      </div> {/* End of no-print UI container */}

      {/* --- 4. LANDSCAPE PRINT VIEW (VISIBLE ONLY ON PRINT) --- */}
      {selectedPlan && (
        <div className="print-only-layout hidden">
          <div className="print-title text-center text-2xl font-extrabold text-slate-900 mt-2 mb-0">
            {selectedPlan.title}
          </div>
          <div className="print-subtitle text-center text-sm font-bold text-slate-600 mt-1 mb-6">
            {selectedPlan.subtitle}
          </div>

          <table className="print-table w-full border-collapse border border-slate-700">
            <thead>
              <tr className="bg-slate-100 text-center font-bold text-slate-800 text-sm">
                <th className="border border-slate-700 p-2 w-28">Date</th>
                <th className="border border-slate-700 p-2 w-36">Shift / Time</th>
                <th className="border border-slate-700 p-2 w-32">Station & Domain</th>
                <th className="border border-slate-700 p-2">Planned Work Activity</th>
                <th className="border border-slate-700 p-2">Railway Manpower</th>
                <th className="border border-slate-700 p-2">Agency / Contractor</th>
              </tr>
            </thead>
            <tbody>
              {rowGroups.map((group, gIdx) => {
                const groupRows = group.rows;
                const k = groupRows.length;
                
                return groupRows.map((rowWrapper, rowIdx) => {
                  const row = rowWrapper.data;
                  const isFirstRow = rowIdx === 0;
                  
                  return (
                    <tr key={rowWrapper.originalIndex} className="text-xs text-slate-800 leading-relaxed font-semibold">
                      {isFirstRow && (
                        <td
                          rowSpan={k}
                          className="border border-slate-700 p-2 text-center align-middle font-bold bg-[#F3F6F8] w-28 whitespace-pre-line animate-none"
                        >
                          {group.date}
                        </td>
                      )}
                      {isFirstRow && (
                        <td
                          rowSpan={k}
                          className="border border-slate-700 p-2 text-center align-middle font-bold bg-[#F3F6F8] w-36 whitespace-pre-line animate-none"
                        >
                          {group.shift}
                        </td>
                      )}
                      
                      <td className="border border-slate-700 p-2 text-center font-bold whitespace-pre-line w-32">
                        {row.station_text}
                      </td>
                      <td className="border border-slate-700 p-2 text-left whitespace-pre-line">
                        {row.work_activity}
                      </td>
                      <td className="border border-slate-700 p-2 text-left whitespace-pre-line animate-none">
                        {row.railway_manpower}
                      </td>
                      <td className="border border-slate-700 p-2 text-left whitespace-pre-line">
                        {row.agency_manpower}
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Global CSS styles to handle browser printing orientation and details */}
      <style jsx global>{`
        @media print {
          /* Hide sidebar, header, navigation wrapper, top bar, and all buttons */
          aside, header, nav, button, select, input, textarea, datalist, .no-print, .no-print * {
            display: none !important;
            visibility: hidden !important;
          }
          
          /* Normalize wrapper heights and scrolling */
          body, html, main, div, .flex-1, .flex, .overflow-y-auto {
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
            background: white !important;
            color: black !important;
            position: static !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          
          /* Force printable grid to show up */
          .print-only-layout {
            display: block !important;
            visibility: visible !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          
          .print-only-layout * {
            visibility: visible !important;
          }
          
          .print-table {
            width: 100% !important;
            border-collapse: collapse !important;
            border: 1px solid #94a3b8 !important;
            margin-top: 15px !important;
          }
          
          .print-table th, .print-table td {
            border: 1px solid #94a3b8 !important;
            padding: 10px 8px !important;
            word-wrap: break-word !important;
            background-color: transparent !important;
          }
          
          .print-table th {
            background-color: #f8fafc !important;
            color: #0f172a !important;
            font-weight: 800 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          
          .print-table td {
            color: #334155 !important;
            font-weight: 500 !important;
            vertical-align: top !important;
            text-align: left !important;
          }
          
          @page {
            size: A4 landscape;
            margin: 0.4in;
          }
        }
      `}</style>

    </div>
  );
}

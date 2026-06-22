'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Plus, 
  Trash2, 
  Save, 
  FileSpreadsheet, 
  User, 
  Calendar, 
  BookOpen, 
  FileText, 
  PlusCircle, 
  AlertCircle, 
  CheckCircle,
  HelpCircle,
  TrendingUp,
  MapPin,
  Clock
} from 'lucide-react';
import { 
  getEmployees, 
  updateEmployee, 
  getTABills, 
  getTABillById, 
  saveTABill, 
  deleteTABill, 
  Employee, 
  TABill, 
  TAEntry 
} from '../../lib/api';

export default function TravellingAllowancePage() {
  // Metadata state
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [taBills, setTaBills] = useState<TABill[]>([]);
  
  // Selected state
  const [selectedEmpId, setSelectedEmpId] = useState<number | ''>('');
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  
  // Form fields
  const [billId, setBillId] = useState<number | undefined>(undefined);
  const [monthYear, setMonthYear] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [selectedYearVal, setSelectedYearVal] = useState<string>('');
  const [journeyType, setJourneyType] = useState<'NORMAL' | 'TRAINING'>('NORMAL');
  const [bookNo, setBookNo] = useState<string>('');
  const [pageNo, setPageNo] = useState<string>('');
  const [serialNoFrom, setSerialNoFrom] = useState<string>('');
  const [serialNoTo, setSerialNoTo] = useState<string>('');
  const [billUnit, setBillUnit] = useState<string>('');
  const [basicPay, setBasicPay] = useState<number>(0);

  const handleMonthChange = (m: string) => {
    setSelectedMonth(m);
    if (m && selectedYearVal) {
      setMonthYear(`${selectedYearVal}-${m}`);
    } else {
      setMonthYear('');
    }
  };

  const handleYearChange = (y: string) => {
    setSelectedYearVal(y);
    if (selectedMonth && y) {
      setMonthYear(`${y}-${selectedMonth}`);
    } else {
      setMonthYear('');
    }
  };

  
  // TA Entries state
  const [entries, setEntries] = useState<TAEntry[]>([]);
  
  // UI states
  const [activeSection, setActiveSection] = useState<string>('KKVS');
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [showHistory, setShowHistory] = useState<boolean>(false);
  const [historySearch, setHistorySearch] = useState<string>('');

  const filteredTaBills = useMemo(() => {
    if (!historySearch.trim()) return taBills;
    const q = historySearch.toLowerCase();
    return taBills.filter(bill => 
      (bill.emp_name || '').toLowerCase().includes(q) || 
      (bill.pf_number || '').toLowerCase().includes(q)
    );
  }, [taBills, historySearch]);

  // Load staff and bills
  const loadInitialData = async (sectionCode: string) => {
    try {
      setIsLoading(true);
      const emps = await getEmployees(sectionCode);
      setEmployees(emps);
      const bills = await getTABills(sectionCode);
      setTaBills(bills);
    } catch (e) {
      console.error("Failed to load data", e);
      showNotification("Failed to load staff/bills list", "error");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedSection = localStorage.getItem('erp_active_section') || 'KKVS';
      setActiveSection(savedSection);
      loadInitialData(savedSection);
      
      const handleSectionChange = () => {
        const currentSec = localStorage.getItem('erp_active_section') || 'KKVS';
        setActiveSection(currentSec);
        loadInitialData(currentSec);
        resetForm();
      };
      
      window.addEventListener('erp_section_changed', handleSectionChange);
      return () => window.removeEventListener('erp_section_changed', handleSectionChange);
    }
  }, []);

  // Update selected employee metadata
  useEffect(() => {
    if (selectedEmpId === '') {
      setSelectedEmp(null);
      setBasicPay(0);
      return;
    }
    const emp = employees.find(e => e.emp_id === Number(selectedEmpId));
    if (emp) {
      setSelectedEmp(emp);
      setBasicPay(emp.basic_pay || 0);
    }
  }, [selectedEmpId, employees]);

  // Show status notification
  const showNotification = (message: string, type: 'success' | 'error') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Reset page form
  const resetForm = () => {
    setBillId(undefined);
    setSelectedEmpId('');
    setSelectedEmp(null);
    setMonthYear('');
    setSelectedMonth('');
    setSelectedYearVal('');
    setJourneyType('NORMAL');
    setBookNo('');
    setPageNo('');
    setSerialNoFrom('');
    setSerialNoTo('');
    setBillUnit('');
    setBasicPay(0);
    setEntries([]);
  };

  // Helper: Calculate base rate from pay commission level
  const getBaseRate = (level: number): number => {
    // Levels 1-5 = Rs. 650; Levels 6-12 = Rs. 1000
    return level >= 6 ? 1000 : 650;
  };

  // Helper: Calculate absence duration and multiplier
  const calculateNormalLegAbsence = (timeOut: string, timeIn: string): { multiplier: number; fractionText: string } => {
    if (!timeOut || !timeIn) return { multiplier: 0, fractionText: '0.0' };
    
    try {
      // Parse HH:MM
      const [hOut, mOut] = timeOut.split(':').map(Number);
      const [hIn, mIn] = timeIn.split(':').map(Number);
      
      if (isNaN(hOut) || isNaN(mOut) || isNaN(hIn) || isNaN(mIn)) {
        return { multiplier: 0, fractionText: '0.0' };
      }
      
      const outMins = hOut * 60 + mOut;
      const inMins = hIn * 60 + mIn;
      
      let diffMins = inMins - outMins;
      if (diffMins < 0) {
        // Assume next day/cross midnight (though local journey usually same day)
        diffMins += 24 * 60;
      }
      
      const diffHours = diffMins / 60.0;
      
      // Rates:
      // <= 6 hrs = 30%
      // 6 to 12 hrs = 70%
      // > 12 hrs = 100%
      if (diffHours <= 6) {
        return { multiplier: 0.3, fractionText: '0.3' };
      } else if (diffHours <= 12) {
        return { multiplier: 0.7, fractionText: '0.7' };
      } else {
        return { multiplier: 1.0, fractionText: '1.0' };
      }
    } catch (e) {
      return { multiplier: 0, fractionText: '0.0' };
    }
  };

  // Helper: Compute date difference for stays
  const calculateStayDays = (startDate: string, endDate: string): number => {
    if (!startDate || !endDate) return 0;
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const diffTime = end.getTime() - start.getTime();
      if (diffTime < 0) return 0;
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // Inclusive
      return diffDays;
    } catch (e) {
      return 0;
    }
  };

  // Helper: Format Date for stayed details display (YYYY-MM-DD -> DD.MM.YY)
  const formatDateDisplay = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
      const [y, m, d] = dateStr.split('-');
      return `${d}.${m}.${y.substring(2)}`;
    } catch (e) {
      return dateStr;
    }
  };

  // Add Normal Journey Entry Pair (Leg 1 & Leg 2)
  const addNormalEntry = () => {
    if (!selectedEmp) {
      showNotification("Please select an employee first to determine Level & Rate.", "error");
      return;
    }
    
    const baseRate = getBaseRate(selectedEmp.level);
    
    // We add 2 entries in tandem: outward leg and return leg
    // Let's create an empty template
    const newOutward: TAEntry = {
      entry_date: '',
      train_no: 'By Metro',
      time_left: '11:10',
      time_arrived: '12:00',
      station_from: 'KKVS',
      station_to: 'M.Bhavan',
      is_stay: 0,
      days_nights: '0.7',
      object_journey: 'Attended Metro Bhavan for paper work as per instruction of higher authority.',
      rate: baseRate,
      amount: Math.round(baseRate * 0.7)
    };
    
    const newInward: TAEntry = {
      entry_date: '',
      train_no: 'By Metro',
      time_left: '19:20',
      time_arrived: '20:20',
      station_from: 'M.Bhavan',
      station_to: 'KKVS',
      is_stay: 0,
      days_nights: '',
      object_journey: '',
      rate: 0,
      amount: 0
    };
    
    setEntries([...entries, newOutward, newInward]);
  };

  // Add Training Journey Entry (can be travel leg or stay)
  const addTrainingEntry = (type: 'LEG' | 'STAY') => {
    if (!selectedEmp) {
      showNotification("Please select an employee first to determine Level & Rate.", "error");
      return;
    }
    
    const baseRate = getBaseRate(selectedEmp.level);
    
    if (type === 'LEG') {
      const newLeg: TAEntry = {
        entry_date: '',
        train_no: '12703',
        time_left: '07:25',
        time_arrived: '10:30',
        station_from: 'KKVS',
        station_to: 'IRISET SECUNDRABAD',
        is_stay: 0,
        days_nights: '1.0',
        object_journey: 'For on campus refresher course Letter no-MRTS/SG-501/23 pt .XIX Dt .29.01.2026',
        rate: baseRate,
        amount: baseRate
      };
      setEntries([...entries, newLeg]);
    } else {
      // Stay block
      const newStay: TAEntry = {
        entry_date: '', // Start Date
        train_no: 'STAYED AT IRISET hostel campus at SCR for refresher course from ... to ...', // Stay details
        time_left: '', // End Date stored temporarily in time_left
        time_arrived: '',
        station_from: '',
        station_to: '',
        is_stay: 1,
        days_nights: '100%X5',
        object_journey: '',
        rate: baseRate,
        amount: baseRate * 5
      };
      setEntries([...entries, newStay]);
    }
  };

  // Remove Entry row(s)
  const removeEntry = (index: number) => {
    const newEntries = [...entries];
    if (journeyType === 'NORMAL') {
      // For normal local journeys, we remove the pair!
      // If index is even, remove index and index + 1
      // If index is odd, remove index - 1 and index
      const startIdx = index % 2 === 0 ? index : index - 1;
      newEntries.splice(startIdx, 2);
    } else {
      // For training/stays, remove the single row
      newEntries.splice(index, 1);
    }
    setEntries(newEntries);
  };

  // Handle cell value change
  const handleEntryChange = (index: number, field: keyof TAEntry, value: any) => {
    if (!selectedEmp) return;
    const baseRate = getBaseRate(selectedEmp.level);
    const updated = [...entries];
    
    updated[index] = {
      ...updated[index],
      [field]: value
    };

    // Trigger recalculations based on changes
    if (journeyType === 'NORMAL') {
      const pairIndex = index % 2 === 0 ? index : index - 1;
      const legOut = updated[pairIndex];
      const legIn = updated[pairIndex + 1];
      
      // Update date of inward leg to match outward leg
      if (field === 'entry_date') {
        updated[pairIndex].entry_date = value;
        if (legIn) updated[pairIndex + 1].entry_date = value;
      }
      
      // Re-calculate absence duration if times change
      if (field === 'time_left' || field === 'time_arrived') {
        const timeOut = legOut.time_left || '';
        const timeIn = legIn ? (legIn.time_arrived || '') : '';
        
        const { multiplier, fractionText } = calculateNormalLegAbsence(timeOut, timeIn);
        
        updated[pairIndex].days_nights = fractionText;
        updated[pairIndex].amount = Math.round(baseRate * multiplier);
      }
    } else {
      // TRAINING Calculations
      const entry = updated[index];
      if (entry.is_stay === 1) {
        // Stay: entry_date is start, time_left is end, train_no holds stayed text, rate is baseRate
        const start = field === 'entry_date' ? value : entry.entry_date;
        const end = field === 'time_left' ? value : entry.time_left;
        const loc = field === 'station_from' ? value : (entry.station_from || 'IRISET');
        
        const numDays = calculateStayDays(start, end);
        
        const startDisplay = formatDateDisplay(start);
        const endDisplay = formatDateDisplay(end);
        
        updated[index].entry_date = start;
        updated[index].time_left = end;
        updated[index].station_from = loc;
        updated[index].days_nights = `100%X${numDays}`;
        updated[index].train_no = `STAYED AT ${loc} hostel campus for refresher course from ${startDisplay} to ${endDisplay}`;
        updated[index].amount = Math.round(numDays * baseRate);
      } else {
        // Training leg: manual multiplier input in days_nights
        if (field === 'days_nights') {
          try {
            const mult = parseFloat(value) || 0;
            updated[index].amount = Math.round(baseRate * mult);
          } catch (e) {}
        }
      }
    }
    
    setEntries(updated);
  };

  // Compute Total amount
  const calculateTotalAmount = (): number => {
    return Math.round(entries.reduce((sum, entry) => sum + (entry.amount || 0), 0));
  };

  // Save TA Bill to Database
  const handleSaveBill = async () => {
    if (!selectedEmpId || !monthYear) {
      showNotification("Please select an employee and Month/Year.", "error");
      return;
    }
    
    if (entries.length === 0) {
      showNotification("Please add at least one journey or stay entry.", "error");
      return;
    }
    
    // Check validation of basic pay
    if (basicPay <= 0) {
      showNotification("Employee basic pay must be set to a positive value.", "error");
      return;
    }

    try {
      setIsLoading(true);
      
      // 1. Sync basic pay to Employee profile if it changed
      if (selectedEmp && basicPay !== (selectedEmp.basic_pay || 0)) {
        const updatedEmp = {
          ...selectedEmp,
          basic_pay: basicPay
        };
        await updateEmployee(updatedEmp);
        // Refresh employees cache list
        const emps = await getEmployees(activeSection);
        setEmployees(emps);
      }

      // 2. Prepare payload
      const payload: TABill = {
        id: billId,
        emp_id: Number(selectedEmpId),
        month_year: monthYear,
        journey_type: journeyType,
        book_no: bookNo,
        page_no: pageNo,
        serial_no_from: serialNoFrom,
        serial_no_to: serialNoTo,
        bill_unit: billUnit,
        basic_pay: basicPay,
        entries: entries
      };
      
      const res = await saveTABill(payload);
      showNotification(billId ? "Travelling Allowance bill updated successfully!" : "Travelling Allowance bill saved successfully!", "success");
      
      // Reset and reload
      resetForm();
      const bills = await getTABills(activeSection);
      setTaBills(bills);
    } catch (e: any) {
      console.error(e);
      showNotification(e.message || "Failed to save TA bill", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Load a bill for editing
  const handleLoadBill = async (id: number) => {
    try {
      setIsLoading(true);
      const bill = await getTABillById(id);
      
      setBillId(bill.id);
      setSelectedEmpId(bill.emp_id);
      setMonthYear(bill.month_year);
      if (bill.month_year) {
        const parts = bill.month_year.split('-');
        if (parts.length === 2) {
          setSelectedYearVal(parts[0]);
          setSelectedMonth(parts[1]);
        }
      } else {
        setSelectedMonth('');
        setSelectedYearVal('');
      }
      setJourneyType(bill.journey_type);
      setBookNo(bill.book_no || '');
      setPageNo(bill.page_no || '');
      setSerialNoFrom(bill.serial_no_from || '');
      setSerialNoTo(bill.serial_no_to || '');
      setBillUnit(bill.bill_unit || '');
      setBasicPay(bill.basic_pay || 0);
      setEntries(bill.entries);
      
      setShowHistory(false);
      showNotification("Loaded TA Bill details.", "success");
    } catch (e) {
      console.error(e);
      showNotification("Failed to load TA Bill details.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Delete a saved bill
  const handleDeleteBill = async (id: number) => {
    if (!confirm("Are you sure you want to delete this Travelling Allowance Bill? This action is permanent.")) return;
    try {
      setIsLoading(true);
      await deleteTABill(id);
      showNotification("TA Bill deleted successfully.", "success");
      const bills = await getTABills(activeSection);
      setTaBills(bills);
      if (billId === id) resetForm();
    } catch (e) {
      console.error(e);
      showNotification("Failed to delete TA bill.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  // Download Excel Spreadsheet
  const handleExportExcel = (id: number) => {
    try {
      window.location.href = `http://127.0.0.1:8000/api/ta-bills/${id}/export-excel`;
      showNotification("Generating spreadsheet download...", "success");
    } catch (e) {
      console.error(e);
      showNotification("Failed to download Excel file.", "error");
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto h-full p-6 space-y-6">
      
      {/* Top Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between border border-slate-200 bg-white/70 backdrop-blur-md rounded-2xl p-6 shadow-sm gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-800 flex items-center gap-2">
            <span className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <TrendingUp className="w-6 h-6" />
            </span>
            Travelling Allowance (TA) Calculation & Export
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Create, calculate, and export Travelling Allowance journals matching the official TA bill format.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all duration-200 border ${
              showHistory 
                ? 'bg-slate-800 text-white border-slate-800 shadow-md' 
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 shadow-sm'
            }`}
          >
            Bill Register History ({taBills.length})
          </button>
          
          <button
            onClick={resetForm}
            className="px-4 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 shadow-sm transition-all duration-200"
          >
            Clear / New Bill
          </button>
        </div>
      </div>

      {/* Notification Toast */}
      {notification && (
        <div className={`flex items-center gap-3 p-4 rounded-xl shadow-lg border text-sm font-medium animate-in fade-in slide-in-from-top-4 duration-300 ${
          notification.type === 'success' 
            ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
            : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {notification.type === 'success' ? <CheckCircle className="w-5 h-5 text-emerald-600" /> : <AlertCircle className="w-5 h-5 text-rose-600" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Premium History Dialog Modal */}
      {showHistory && (
        <div className="fixed inset-0 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm z-50 p-4 animate-fade-in">
          <div className="bg-white w-full max-w-5xl max-h-[88vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-scale-up" style={{border: '1px solid #e2e8f0', boxShadow: '0 25px 60px -12px rgba(0,0,0,0.25), 0 0 0 1px rgba(99,102,241,0.08)'}}>
            
            {/* Premium Gradient Modal Header */}
            <div className="px-7 py-5 flex items-center justify-between" style={{background: 'linear-gradient(135deg, #f8fafc 0%, #eef2ff 100%)', borderBottom: '1px solid #e0e7ff'}}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md">
                  <BookOpen className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className="text-sm font-black text-slate-800 tracking-wide">TRAVELLING ALLOWANCE JOURNAL HISTORY</h2>
                  <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Section: {activeSection} · {taBills.length} record{taBills.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <button 
                onClick={() => { setShowHistory(false); setHistorySearch(''); }} 
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-700 hover:border-slate-300 hover:shadow-sm transition-all cursor-pointer text-base font-bold"
              >
                ✕
              </button>
            </div>
            
            {/* Search filter */}
            <div className="px-7 py-4 flex items-center gap-3" style={{background: '#f8fafc', borderBottom: '1px solid #f1f5f9'}}>
              <div className="relative flex-1">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input
                  type="text"
                  placeholder="Search by Employee Name or PF Number..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 transition-all placeholder:font-normal placeholder:text-slate-400"
                />
              </div>
            </div>
            
            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto px-7 py-5">
              {filteredTaBills.length === 0 ? (
                <div className="text-center py-20 text-slate-400 font-semibold italic text-xs flex flex-col items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center">
                    <BookOpen className="w-6 h-6 text-slate-300" />
                  </div>
                  {taBills.length === 0 ? "No Travelling Allowance bills found in this section. Create one below!" : "No matching journals found for your search query."}
                </div>
              ) : (
                <div className="rounded-2xl overflow-hidden" style={{border: '1px solid #e8ecf0'}}>
                  {/* Column Header Bar */}
                  <div className="grid items-center px-5 py-3 gap-3" style={{gridTemplateColumns: '1.6fr 1.4fr 1fr 0.9fr 0.9fr 1.8fr', background: 'linear-gradient(to right, #f8fafc, #f1f5f9)'}}>
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Employee</div>
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">PF Number</div>
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Month / Year</div>
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Type</div>
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Amount</div>
                    <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest text-right pr-1">Actions</div>
                  </div>
                  {/* Card Rows — no dividers */}
                  <div className="flex flex-col" style={{background: '#fafbfc'}}>
                    {filteredTaBills.map((bill, idx) => (
                      <div
                        key={bill.id}
                        className="grid items-center px-5 py-3.5 gap-3 hover:bg-indigo-50/40 transition-all group"
                        style={{
                          gridTemplateColumns: '1.6fr 1.4fr 1fr 0.9fr 0.9fr 1.8fr',
                          borderTop: idx === 0 ? '1px solid #e8ecf0' : '1px solid #f1f5f9',
                        }}
                      >
                        <div className="font-bold text-slate-800 text-xs truncate">{bill.emp_name}</div>
                        <div className="text-slate-500 text-xs truncate">
                          {bill.pf_number}
                          {bill.bill_unit && <span className="text-slate-400 font-normal ml-1">(BU: {bill.bill_unit})</span>}
                        </div>
                        <div className="text-slate-600 font-semibold text-xs">
                          {(() => {
                            try {
                              const d = new Date(bill.month_year + "-01");
                              return d.toLocaleString('default', { month: 'long', year: 'numeric' });
                            } catch (e) {
                              return bill.month_year;
                            }
                          })()}
                        </div>
                        <div>
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black ${
                            bill.journey_type === 'NORMAL' 
                              ? 'bg-sky-50 text-sky-700 border border-sky-200/70' 
                              : 'bg-amber-50 text-amber-700 border border-amber-200/70'
                          }`}>
                            {bill.journey_type === 'NORMAL' ? 'Local Duties' : 'Training'}
                          </span>
                        </div>
                        <div className="font-black text-indigo-700 text-xs">Rs. {bill.total_amount}</div>
                        {/* Actions — right-aligned with overflow-visible so nothing clips */}
                        <div className="flex items-center justify-end gap-1.5 min-w-0">
                          <button
                            onClick={() => { handleLoadBill(bill.id!); setHistorySearch(''); }}
                            className="flex-shrink-0 inline-flex items-center px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-700 border border-indigo-200 rounded-lg text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap"
                          >
                            View / Edit
                          </button>
                          <button
                            onClick={() => handleExportExcel(bill.id!)}
                            className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <FileSpreadsheet className="w-3 h-3" /> Excel
                          </button>
                          <button
                            onClick={() => handleDeleteBill(bill.id!)}
                            className="flex-shrink-0 inline-flex items-center px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 text-rose-600 border border-rose-200 rounded-lg text-[10px] font-bold transition-colors cursor-pointer whitespace-nowrap"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Modal Footer */}
            <div className="px-7 py-4 flex items-center justify-between" style={{background: '#f8fafc', borderTop: '1px solid #f1f5f9'}}>
              <p className="text-[10px] text-slate-400 font-semibold">
                Showing {filteredTaBills.length} of {taBills.length} records
              </p>
              <button 
                onClick={() => { setShowHistory(false); setHistorySearch(''); }}
                className="px-5 py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-600 font-bold text-xs uppercase tracking-wide transition-all cursor-pointer shadow-sm"
              >
                Close Register
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Primary Input Form & Table */}
      <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 items-start">
        
        {/* Sidebar: Details Form */}
        <div className="xl:col-span-1 border border-slate-200 bg-white rounded-2xl p-6 shadow-sm space-y-6">
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2 pb-3 border-b border-slate-100">
            <FileText className="w-5 h-5 text-indigo-600" />
            Bill Master Details
          </h2>
          
          {/* Staff selection */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">Select Employee</label>
            <div className="relative">
              <select
                value={selectedEmpId}
                onChange={(e) => setSelectedEmpId(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all appearance-none"
              >
                <option value="">-- Choose Employee --</option>
                {employees.map(emp => (
                  <option key={emp.emp_id} value={emp.emp_id}>
                    {emp.name} ({emp.designation})
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-slate-500">
                <User className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Dynamic staff details panel */}
          {selectedEmp && (
            <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-2.5">
              <h3 className="text-xs font-bold text-indigo-800 uppercase tracking-wider">Employee Profile Metadata</h3>
              <div className="grid grid-cols-2 gap-y-2 text-xs text-slate-600">
                <div>PF Number:</div>
                <div className="font-semibold text-slate-800 text-right">{selectedEmp.pf_number}</div>
                
                <div>Level / Base Rate:</div>
                <div className="font-semibold text-slate-800 text-right">
                  Level-{selectedEmp.level} (Rs. {getBaseRate(selectedEmp.level)}/day)
                </div>
                
                <div>Joined Date:</div>
                <div className="font-semibold text-slate-800 text-right">{selectedEmp.joining_date || 'N/A'}</div>
              </div>
              
              <div className="pt-2 border-t border-indigo-100/70 space-y-1.5">
                <label className="block text-xs font-semibold text-indigo-900">
                  Basic Pay (Rs.) <span className="text-slate-400 font-normal">(Syncs to profile)</span>
                </label>
                <input
                  type="number"
                  value={basicPay || ''}
                  onChange={(e) => setBasicPay(Number(e.target.value))}
                  placeholder="Enter Basic Pay"
                  className="w-full bg-white border border-indigo-200 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-800 outline-none focus:border-indigo-500 transition-all"
                />
              </div>
            </div>
          )}

          {/* Custom Month & Year Selector */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">Month & Year</label>
            <div className="grid grid-cols-2 gap-2">
              <div className="relative">
                <select
                  value={selectedMonth}
                  onChange={(e) => {
                    handleMonthChange(e.target.value);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-750 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer appearance-none"
                >
                  <option value="">Month</option>
                  <option value="01">January</option>
                  <option value="02">February</option>
                  <option value="03">March</option>
                  <option value="04">April</option>
                  <option value="05">May</option>
                  <option value="06">June</option>
                  <option value="07">July</option>
                  <option value="08">August</option>
                  <option value="09">September</option>
                  <option value="10">October</option>
                  <option value="11">November</option>
                  <option value="12">December</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                  <Calendar className="w-3.5 h-3.5" />
                </div>
              </div>
              <div className="relative">
                <select
                  value={selectedYearVal}
                  onChange={(e) => {
                    handleYearChange(e.target.value);
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-750 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all cursor-pointer appearance-none font-mono"
                >
                  <option value="">Year</option>
                  <option value="2024">2024</option>
                  <option value="2025">2025</option>
                  <option value="2026">2026</option>
                  <option value="2027">2027</option>
                  <option value="2028">2028</option>
                  <option value="2029">2029</option>
                  <option value="2030">2030</option>
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-slate-500">
                  <Calendar className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
          </div>


          {/* Journey type */}
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-slate-700">Journey Nature</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => { setJourneyType('NORMAL'); setEntries([]); }}
                className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                  journeyType === 'NORMAL'
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Local Journeys
              </button>
              <button
                type="button"
                onClick={() => { setJourneyType('TRAINING'); setEntries([]); }}
                className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                  journeyType === 'TRAINING'
                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-md'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Training / Stays
              </button>
            </div>
          </div>

          {/* Book, Page details */}
          <div className="pt-2 border-t border-slate-100 space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Official Ledger Metadata</h3>
            
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-600">Book Number</label>
                <input
                  type="text"
                  value={bookNo}
                  onChange={(e) => setBookNo(e.target.value)}
                  placeholder="e.g. 03"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 outline-none focus:border-indigo-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-600">Page Number</label>
                <input
                  type="text"
                  value={pageNo}
                  onChange={(e) => setPageNo(e.target.value)}
                  placeholder="e.g. 04"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-600">Serial From</label>
                <input
                  type="text"
                  value={serialNoFrom}
                  onChange={(e) => setSerialNoFrom(e.target.value)}
                  placeholder="e.g. 28"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 outline-none focus:border-indigo-500"
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-slate-600">Serial To</label>
                <input
                  type="text"
                  value={serialNoTo}
                  onChange={(e) => setSerialNoTo(e.target.value)}
                  placeholder="e.g. 31"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-semibold text-slate-600">Bill Unit (B.U. Number)</label>
              <input
                type="text"
                value={billUnit}
                onChange={(e) => setBillUnit(e.target.value)}
                placeholder="e.g. 2201-806"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-700 outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Action Save Button */}
          <button
            type="button"
            disabled={isLoading || !selectedEmpId || !monthYear}
            onClick={handleSaveBill}
            className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold py-3 rounded-xl shadow-md disabled:shadow-none hover:shadow-lg transition-all duration-200 flex items-center justify-center gap-2 text-sm"
          >
            <Save className="w-5 h-5" />
            {billId ? "Update Saved Bill" : "Save Journal Bill"}
          </button>
        </div>

        {/* Right Table Panel: Entry Journal Rows */}
        <div className="xl:col-span-3 border border-slate-200 bg-white rounded-2xl p-6 shadow-sm flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-600" />
                Journal Entry Ledger
              </h2>
              <p className="text-slate-500 text-xs mt-0.5">
                {journeyType === 'NORMAL' 
                  ? 'Add local journeys. Outward leg and Inward leg are entered in pairs for each duty day.' 
                  : 'Add travel legs or continuous stayed intervals at training centers.'}
              </p>
            </div>
            
            {/* Add row buttons */}
            <div className="flex items-center gap-2">
              {journeyType === 'NORMAL' ? (
                <button
                  type="button"
                  onClick={addNormalEntry}
                  disabled={!selectedEmp}
                  className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 disabled:bg-slate-50 disabled:text-slate-400 text-indigo-700 font-bold border border-indigo-200 rounded-xl text-xs transition-colors flex items-center gap-1.5"
                >
                  <PlusCircle className="w-4 h-4" /> Add Local Journey
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => addTrainingEntry('LEG')}
                    disabled={!selectedEmp}
                    className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 disabled:bg-slate-50 disabled:text-slate-400 text-indigo-700 font-bold border border-indigo-200 rounded-xl text-xs transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" /> Add Travel Leg
                  </button>
                  <button
                    type="button"
                    onClick={() => addTrainingEntry('STAY')}
                    disabled={!selectedEmp}
                    className="px-3 py-2 bg-amber-50 hover:bg-amber-100 disabled:bg-slate-50 disabled:text-slate-400 text-amber-700 font-bold border border-amber-200 rounded-xl text-xs transition-colors flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" /> Add Stay Block
                  </button>
                </>
              )}
            </div>
          </div>

          {/* The Entries Table */}
          {entries.length === 0 ? (
            <div className="text-center py-20 bg-slate-50 border border-dashed border-slate-200 rounded-2xl text-slate-400 flex flex-col items-center justify-center gap-3">
              <AlertCircle className="w-10 h-10 text-slate-300" />
              <div>
                <p className="font-semibold text-slate-500">Journal Ledger is Empty</p>
                <p className="text-xs text-slate-400 mt-0.5">Please select an employee and add entries using the action buttons above.</p>
              </div>
            </div>
          ) : (
            <div className="overflow-x-auto border border-slate-100 rounded-xl">
              <table className="min-w-full divide-y divide-slate-200 text-xs table-fixed">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider w-[100px]">Date</th>
                    <th className="px-3 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider min-w-[120px]">
                      {journeyType === 'NORMAL' ? 'Leg type' : 'Details / Mode'}
                    </th>
                    <th className="px-3 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider w-[80px]">Dep. Time</th>
                    <th className="px-3 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider w-[80px]">Arr. Time</th>
                    <th className="px-3 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider">From</th>
                    <th className="px-3 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider">To</th>
                    <th className="px-3 py-3 text-center font-semibold text-slate-500 uppercase tracking-wider w-[70px]">Absence</th>
                    <th className="px-3 py-3 text-left font-semibold text-slate-500 uppercase tracking-wider min-w-[140px]">Object of Journey</th>
                    <th className="px-3 py-3 text-right font-semibold text-slate-500 uppercase tracking-wider w-[70px]">Rate (Rs)</th>
                    <th className="px-3 py-3 text-right font-semibold text-slate-500 uppercase tracking-wider w-[70px]">Amount (Rs)</th>
                    <th className="px-2 py-3 text-center w-[40px]"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {entries.map((entry, idx) => {
                    const isEvenRow = idx % 2 === 0;
                    
                    if (journeyType === 'NORMAL') {
                      return (
                        <tr key={idx} className={`${isEvenRow ? 'bg-white' : 'bg-slate-50/30'} border-b border-slate-100 hover:bg-indigo-50/20 transition-colors`}>
                          {/* Date (Merge visually) */}
                          <td className="px-3 py-2">
                            {isEvenRow ? (
                              <input
                                type="date"
                                value={entry.entry_date}
                                onChange={(e) => handleEntryChange(idx, 'entry_date', e.target.value)}
                                className="w-full bg-slate-50/70 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-500 transition-all cursor-pointer"
                              />
                            ) : (
                              <div className="text-slate-400 font-bold text-center italic text-[10px] tracking-wider uppercase">Inward Leg</div>
                            )}
                          </td>
                          
                          {/* Mode/Train */}
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={entry.train_no || ''}
                              onChange={(e) => handleEntryChange(idx, 'train_no', e.target.value)}
                              placeholder="e.g. By Metro"
                              className="w-full bg-slate-50/70 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-indigo-500 transition-all"
                            />
                          </td>
                          
                          {/* Departure time */}
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={entry.time_left || ''}
                              onChange={(e) => handleEntryChange(idx, 'time_left', e.target.value)}
                              placeholder="11:10"
                              className="w-full bg-slate-50/70 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-indigo-500 transition-all text-center"
                            />
                          </td>
                          
                          {/* Arrival time */}
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={entry.time_arrived || ''}
                              onChange={(e) => handleEntryChange(idx, 'time_arrived', e.target.value)}
                              placeholder="12:00"
                              className="w-full bg-slate-50/70 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-indigo-500 transition-all text-center"
                            />
                          </td>
                          
                          {/* From station */}
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={entry.station_from || ''}
                              onChange={(e) => handleEntryChange(idx, 'station_from', e.target.value)}
                              placeholder="KKVS"
                              className="w-full bg-slate-50/70 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-indigo-500 transition-all"
                            />
                          </td>
                          
                          {/* To station */}
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={entry.station_to || ''}
                              onChange={(e) => handleEntryChange(idx, 'station_to', e.target.value)}
                              placeholder="M.Bhavan"
                              className="w-full bg-slate-50/70 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-indigo-500 transition-all"
                            />
                          </td>
                          
                          {/* Absence Multiplier (only display on outward leg row) */}
                          <td className="px-3 py-2 text-center font-bold text-slate-700">
                            {isEvenRow ? entry.days_nights : ''}
                          </td>
                          
                          {/* Object (only display on outward leg row) */}
                          <td className="px-3 py-2">
                            {isEvenRow ? (
                              <input
                                type="text"
                                value={entry.object_journey || ''}
                                onChange={(e) => handleEntryChange(idx, 'object_journey', e.target.value)}
                                placeholder="Object of journey details"
                                className="w-full bg-slate-50/70 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-indigo-500 transition-all"
                              />
                            ) : null}
                          </td>
                          
                          {/* Rate (only display on outward leg row) */}
                          <td className="px-3 py-2 text-right font-bold text-slate-600">
                            {isEvenRow ? `Rs. ${entry.rate}` : ''}
                          </td>
                          
                          {/* Amount (only display on outward leg row) */}
                          <td className="px-3 py-2 text-right font-bold text-slate-800">
                            {isEvenRow ? `Rs. ${entry.amount}` : ''}
                          </td>
                          
                          {/* Delete (shows on outward row for pair) */}
                          <td className="px-2 py-2 text-center">
                            {isEvenRow ? (
                              <button
                                type="button"
                                onClick={() => removeEntry(idx)}
                                className="p-1.5 hover:bg-rose-50 rounded-lg text-rose-500 hover:text-rose-600 transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      );
                    } else {
                      // TRAINING Ledger Render (Journey Leg or Stay Block)
                      const isStay = entry.is_stay === 1;
                      
                      return (
                        <tr key={idx} className={`border-b border-slate-100 hover:bg-indigo-50/20 transition-colors ${
                          isStay ? 'bg-amber-50/10' : 'bg-white'
                        }`}>
                          {/* Date (Start Date for stay) */}
                          <td className="px-3 py-2">
                            <input
                              type="date"
                              value={entry.entry_date}
                              onChange={(e) => handleEntryChange(idx, 'entry_date', e.target.value)}
                              className="w-full bg-slate-50/70 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-500 transition-all cursor-pointer"
                            />
                            {isStay && <span className="text-[10px] text-amber-600 block mt-0.5 font-bold uppercase tracking-wider">Stay Start</span>}
                          </td>
                          
                          {/* Mode/Train details or Stay Campus Details */}
                          <td className="px-3 py-2" colSpan={isStay ? 5 : 1}>
                            {isStay ? (
                              <div className="flex flex-col gap-1.5">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-bold text-slate-400">Campus:</span>
                                  <input
                                    type="text"
                                    value={entry.station_from || ''}
                                    onChange={(e) => handleEntryChange(idx, 'station_from', e.target.value)}
                                    placeholder="e.g. IRISET hostel campus at SCR"
                                    className="flex-1 bg-amber-50/30 border border-amber-250/60 rounded-lg px-2.5 py-1.5 text-xs font-bold text-amber-900 outline-none focus:bg-white focus:border-amber-500 transition-all"
                                  />
                                </div>
                                <div className="text-[10px] text-slate-400 font-semibold italic truncate">
                                  {entry.train_no}
                                </div>
                              </div>
                            ) : (
                              <input
                                type="text"
                                value={entry.train_no || ''}
                                onChange={(e) => handleEntryChange(idx, 'train_no', e.target.value)}
                                placeholder="Train/Metro Mode"
                                className="w-full bg-slate-50/70 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-indigo-500 transition-all"
                              />
                            )}
                          </td>
                          
                          {/* Departure time / Stay End Date */}
                          {!isStay ? (
                            <>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={entry.time_left || ''}
                                  onChange={(e) => handleEntryChange(idx, 'time_left', e.target.value)}
                                  placeholder="07:25"
                                  className="w-full bg-slate-50/70 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-indigo-500 transition-all text-center"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={entry.time_arrived || ''}
                                  onChange={(e) => handleEntryChange(idx, 'time_arrived', e.target.value)}
                                  placeholder="10:30"
                                  className="w-full bg-slate-50/70 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-indigo-500 transition-all text-center"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={entry.station_from || ''}
                                  onChange={(e) => handleEntryChange(idx, 'station_from', e.target.value)}
                                  placeholder="KKVS"
                                  className="w-full bg-slate-50/70 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-indigo-500 transition-all"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="text"
                                  value={entry.station_to || ''}
                                  onChange={(e) => handleEntryChange(idx, 'station_to', e.target.value)}
                                  placeholder="IRISET"
                                  className="w-full bg-slate-50/70 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-indigo-500 transition-all"
                                />
                              </td>
                            </>
                          ) : (
                            <td className="px-3 py-2" colSpan={4}>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap">Stay End Date:</span>
                                <input
                                  type="date"
                                  value={entry.time_left || ''}
                                  onChange={(e) => handleEntryChange(idx, 'time_left', e.target.value)}
                                  className="bg-amber-50/30 border border-amber-200/60 rounded-lg px-2.5 py-1.5 text-xs font-bold text-amber-900 outline-none focus:bg-white focus:border-amber-500 transition-all cursor-pointer"
                                />
                              </div>
                            </td>
                          )}
                          
                          {/* Days/Nights display multiplier */}
                          <td className="px-3 py-2 text-center font-bold text-slate-700">
                            {isStay ? (
                              <span className="text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                                {entry.days_nights}
                              </span>
                            ) : (
                              <input
                                type="text"
                                value={entry.days_nights || ''}
                                onChange={(e) => handleEntryChange(idx, 'days_nights', e.target.value)}
                                placeholder="1.0"
                                className="w-16 bg-slate-50/70 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-indigo-500 transition-all text-center"
                              />
                            )}
                          </td>
                          
                          {/* Object of journey */}
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={entry.object_journey || ''}
                              onChange={(e) => handleEntryChange(idx, 'object_journey', e.target.value)}
                              placeholder="Object / Training letter reference details"
                              className="w-full bg-slate-50/70 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-indigo-500 transition-all"
                              disabled={isStay}
                            />
                          </td>
                          
                          {/* Rate */}
                          <td className="px-3 py-2 text-right font-bold text-slate-600">
                            Rs. {entry.rate}
                          </td>
                          
                          {/* Amount */}
                          <td className="px-3 py-2 text-right font-bold text-slate-800">
                            Rs. {entry.amount}
                          </td>
                          
                          {/* Delete */}
                          <td className="px-2 py-2 text-center">
                            <button
                              type="button"
                              onClick={() => removeEntry(idx)}
                              className="p-1.5 hover:bg-rose-50 rounded-lg text-rose-500 hover:text-rose-600 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    }
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Summary and Calculation Total */}
          {entries.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl gap-4">
              <div className="text-xs text-slate-500 space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-600">Total Entries:</span> 
                  <span>{entries.length} rows ({journeyType === 'NORMAL' ? `${entries.length / 2} pairs` : 'training/stays'})</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-600">Absence Rule:</span>
                  <span>Absence &gt;12h (100%), 6-12h (70%), &lt;=6h (30%). Stays computed at 100% daily rate.</span>
                </div>
              </div>
              
              <div className="text-right">
                <div className="text-xs font-semibold text-slate-500">Gross Allowance Claim:</div>
                <div className="text-xl font-black text-indigo-700">Rs. {calculateTotalAmount()}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

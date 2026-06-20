export interface Employee {
  emp_id: number;
  pf_number: string;
  name: string;
  designation: string;
  level: number;
  primary_section_id?: number | null;
  section_code?: string | null;
  default_rest_day: string;
  joining_date?: string;
  weekly_schedule?: 
    | {
        type: 'simple';
        [day: string]: any;
        custom_night_weeks?: { from_date: string; to_date: string; shift?: string }[];
      }
    | {
        type: 'flexible';
        custom_night_weeks?: { from_date: string; to_date: string; shift?: string }[];
      }
    | {
        type: 'rotating-3week';
        anchor_date?: string;
        week1: { [day: string]: string };
        week2: { [day: string]: string };
        week3: { [day: string]: string };
        custom_night_weeks?: { from_date: string; to_date: string; shift?: string }[];
      }
    | {
        type: 'rotating';
        anchor_date?: string;
        week1: { [day: string]: string };
        week2: { [day: string]: string };
        week3: { [day: string]: string };
        week4: { [day: string]: string };
        custom_night_weeks?: { from_date: string; to_date: string; shift?: string }[];
      }
    | { [day: string]: string };
  display_order?: number;
  basic_pay?: number;
}

export interface AttendanceCode {
  code: string;
  description: string;
  bg_color: string;
  text_color: string;
  is_leave: boolean;
  leave_type: 'CL' | 'LAP' | 'CR' | 'Sick' | 'None';
}

export interface CRLedgerEntry {
  id?: number;
  emp_id: number;
  earned_date: string;
  consumed_date: string | null;
}

export interface MetroLine {
  id: number;
  line_name: string;
  color_code: string;
}

export interface Section {
  id: number;
  line_id: number;
  section_code: string;
  section_name: string;
  base_location: string;
}

export interface ShiftRule {
  id: number;
  section_id: number;
  shift_code: string;
  start_time: string;
  end_time: string;
  working_days: string[];
  is_night_duty: boolean;
  duty_type?: string;
}

export interface LeaveBank {
  emp_id: number;
  year: number;
  total_cl: number;
  total_lap: number;
  used_cl: number;
  used_lap: number;
  accrued_cr: number;
}

export interface AttendanceLog {
  id?: number;
  emp_id: number;
  date: string;
  status: 'P' | 'R' | 'CR' | 'CL' | 'LAP' | 'Sick' | 'SCL' | 'PH' | 'P/N';
  is_night: boolean;
  shift_id?: number | null;
  remarks?: string;
}

export interface SpecialEvent {
  id: number;
  emp_id: number;
  event_type: string;
  from_date: string;
  to_date: string;
  order_number: string;
  location: string;
  from_section?: string | null;
  to_section?: string | null;
  signatory_name?: string | null;
  signatory_designation?: string | null;
}

export interface Holiday {
  id?: number;
  holiday_date: string;
  name: string;
  holiday_type: string;
  applicability: string | null;
}

export interface AuditLog {
  id: number;
  timestamp: string;
  user: string;
  module: string;
  action: string;
  details: string;
}

const API_BASE = "http://127.0.0.1:8000/api";

// Helper fetch wrapper
async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {})
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API Error ${res.status}: ${text || res.statusText}`);
  }
  return res.json() as Promise<T>;
}

// 1. Lines CRUD
export const getLines = async (): Promise<MetroLine[]> => {
  return apiFetch<MetroLine[]>("/lines");
};

export const createLine = async (line: Omit<MetroLine, 'id'>): Promise<MetroLine> => {
  return apiFetch<MetroLine>("/lines", {
    method: "POST",
    body: JSON.stringify(line)
  });
};

export const updateLine = async (line: MetroLine): Promise<MetroLine> => {
  return apiFetch<MetroLine>(`/lines/${line.id}`, {
    method: "PUT",
    body: JSON.stringify(line)
  });
};

export const deleteLine = async (lineId: number): Promise<void> => {
  await apiFetch<any>(`/lines/${lineId}`, {
    method: "DELETE"
  });
};

// 2. Sections CRUD
export const getSections = async (): Promise<Section[]> => {
  return apiFetch<Section[]>("/sections");
};

export const createSection = async (section: Omit<Section, 'id'>): Promise<Section> => {
  return apiFetch<Section>("/sections", {
    method: "POST",
    body: JSON.stringify(section)
  });
};

export const updateSection = async (section: Section): Promise<Section> => {
  return apiFetch<Section>(`/sections/${section.id}`, {
    method: "PUT",
    body: JSON.stringify(section)
  });
};

export const deleteSection = async (sectionId: number): Promise<void> => {
  await apiFetch<any>(`/sections/${sectionId}`, {
    method: "DELETE"
  });
};

// 3. Employees CRUD
export const getEmployees = async (sectionCode?: string): Promise<Employee[]> => {
  const path = sectionCode ? `/employees?section_code=${sectionCode}` : "/employees";
  return apiFetch<Employee[]>(path);
};

export const getEmployeeById = async (empId: number): Promise<Employee | null> => {
  try {
    return await apiFetch<Employee>(`/employees/${empId}`);
  } catch (err) {
    console.error("Failed to load employee", err);
    return null;
  }
};

export const createEmployee = async (employee: Omit<Employee, 'emp_id'>): Promise<Employee> => {
  return apiFetch<Employee>("/employees", {
    method: "POST",
    body: JSON.stringify(employee)
  });
};

export const updateEmployee = async (employee: Employee): Promise<Employee> => {
  return apiFetch<Employee>(`/employees/${employee.emp_id}`, {
    method: "PUT",
    body: JSON.stringify(employee)
  });
};

export const deleteEmployee = async (empId: number): Promise<void> => {
  await apiFetch<any>(`/employees/${empId}`, {
    method: "DELETE"
  });
};

export const reorderEmployees = async (empIds: number[]): Promise<{ status: string }> => {
  return apiFetch<{ status: string }>("/employees/reorder", {
    method: "POST",
    body: JSON.stringify({ emp_ids: empIds })
  });
};

// 4. Shift Rules
export const getShiftRules = async (sectionCode: string): Promise<ShiftRule[]> => {
  return apiFetch<ShiftRule[]>(`/shift-rules?section_code=${sectionCode}`);
};

export const createShiftRule = async (rule: Omit<ShiftRule, 'id'>): Promise<ShiftRule> => {
  return apiFetch<ShiftRule>("/shift-rules", {
    method: "POST",
    body: JSON.stringify(rule)
  });
};

export const updateShiftRule = async (ruleId: number, rule: Omit<ShiftRule, 'id'>): Promise<ShiftRule> => {
  return apiFetch<ShiftRule>(`/shift-rules/${ruleId}`, {
    method: "PUT",
    body: JSON.stringify(rule)
  });
};

export const deleteShiftRule = async (ruleId: number): Promise<{ status: string }> => {
  return apiFetch<{ status: string }>(`/shift-rules/${ruleId}`, {
    method: "DELETE"
  });
};

// 5. Attendance Codes
export const getAttendanceCodes = async (): Promise<AttendanceCode[]> => {
  return apiFetch<AttendanceCode[]>("/attendance-codes");
};

export const createAttendanceCode = async (code: AttendanceCode): Promise<AttendanceCode> => {
  return apiFetch<AttendanceCode>("/attendance-codes", {
    method: "POST",
    body: JSON.stringify(code)
  });
};

export const updateAttendanceCode = async (code: AttendanceCode): Promise<AttendanceCode> => {
  return apiFetch<AttendanceCode>(`/attendance-codes/${code.code}`, {
    method: "PUT",
    body: JSON.stringify(code)
  });
};

export const deleteAttendanceCode = async (code: string): Promise<void> => {
  await apiFetch<any>(`/attendance-codes/${code}`, {
    method: "DELETE"
  });
};

// 6. CR Ledger
export const getCRLedger = async (empId: number): Promise<CRLedgerEntry[]> => {
  return apiFetch<CRLedgerEntry[]>(`/compensatory-rest-ledger/${empId}`);
};

export const addCRLedgerEntry = async (entry: Omit<CRLedgerEntry, 'id'>): Promise<CRLedgerEntry> => {
  return apiFetch<CRLedgerEntry>("/compensatory-rest-ledger", {
    method: "POST",
    body: JSON.stringify(entry)
  });
};

export const deleteCRLedgerEntry = async (id: number): Promise<void> => {
  await apiFetch<any>(`/compensatory-rest-ledger/${id}`, {
    method: "DELETE"
  });
};

export const updateCRLedgerEntry = async (entry: CRLedgerEntry): Promise<void> => {
  await apiFetch<any>(`/compensatory-rest-ledger/${entry.id}`, {
    method: "PUT",
    body: JSON.stringify(entry)
  });
};

// 7. Leave Bank
export const getLeaveBank = async (empId: number, year: number = 2026): Promise<LeaveBank> => {
  return apiFetch<LeaveBank>(`/leave-bank/${empId}?year=${year}`);
};

export const updateLeaveBank = async (leave: LeaveBank): Promise<void> => {
  await apiFetch<any>("/leave-bank", {
    method: "PUT",
    body: JSON.stringify(leave)
  });
};

// 8. Attendance Logs
export const getAttendanceLogs = async (
  sectionCode: string,
  startDate: string,
  endDate: string
): Promise<AttendanceLog[]> => {
  return apiFetch<AttendanceLog[]>(`/attendance-log?section_code=${sectionCode}&start_date=${startDate}&end_date=${endDate}`);
};

export const getEmployeeAttendanceLogs = async (
  empId: number,
  year: number = 2026
): Promise<AttendanceLog[]> => {
  return apiFetch<AttendanceLog[]>(`/attendance-log/${empId}?year=${year}`);
};


export const saveAttendanceLog = async (log: AttendanceLog): Promise<void> => {
  await apiFetch<any>("/attendance-log", {
    method: "POST",
    body: JSON.stringify(log)
  });
};

export const saveAttendanceLogsBulk = async (logs: AttendanceLog[]): Promise<void> => {
  await apiFetch<any>("/attendance-log/bulk", {
    method: "POST",
    body: JSON.stringify(logs)
  });
};

// 9. Special Events
export const getSpecialEvents = async (sectionCode?: string): Promise<SpecialEvent[]> => {
  const path = sectionCode ? `/special-events?section_code=${sectionCode}` : "/special-events";
  return apiFetch<SpecialEvent[]>(path);
};

export const addSpecialEvent = async (event: Omit<SpecialEvent, 'id'>): Promise<SpecialEvent> => {
  return apiFetch<SpecialEvent>("/special-events", {
    method: "POST",
    body: JSON.stringify(event)
  });
};

export const deleteSpecialEvent = async (id: number): Promise<void> => {
  await apiFetch<any>(`/special-events/${id}`, {
    method: "DELETE"
  });
};

// 10. Holidays Master
export const getHolidays = async (): Promise<Holiday[]> => {
  return apiFetch<Holiday[]>("/holidays");
};

export const createHoliday = async (holiday: Omit<Holiday, 'id'>): Promise<Holiday> => {
  return apiFetch<Holiday>("/holidays", {
    method: "POST",
    body: JSON.stringify(holiday)
  });
};

export const updateHoliday = async (holiday: Holiday): Promise<Holiday> => {
  return apiFetch<Holiday>(`/holidays/${holiday.id}`, {
    method: "PUT",
    body: JSON.stringify(holiday)
  });
};

export const deleteHoliday = async (id: number): Promise<void> => {
  await apiFetch<any>(`/holidays/${id}`, {
    method: "DELETE"
  });
};

// 11. Audit Logs
export const getAuditLogs = async (): Promise<AuditLog[]> => {
  return apiFetch<AuditLog[]>("/audit-logs");
};

// 12. Backup and Restore
export const getBackupsList = async (): Promise<string[]> => {
  return apiFetch<string[]>("/backups");
};

export const createBackup = async (): Promise<{ status: string; filename: string }> => {
  return apiFetch<{ status: string; filename: string }>("/backups/create", {
    method: "POST"
  });
};

export const restoreBackup = async (filename: string): Promise<{ status: string }> => {
  return apiFetch<{ status: string }>("/backups/restore", {
    method: "POST",
    body: JSON.stringify({ filename })
  });
};

export const getBackupStatus = async (): Promise<{ integrity: string; last_backup: string; database_size_bytes: number }> => {
  return apiFetch<{ integrity: string; last_backup: string; database_size_bytes: number }>("/backups/status");
};

export const deleteAttendanceLog = async (empId: number, date: string): Promise<{ status: string }> => {
  return apiFetch<{ status: string }>(`/attendance-log?emp_id=${empId}&date=${date}`, {
    method: "DELETE"
  });
};

export const deleteAttendanceLogsRange = async (
  sectionCode: string,
  startDate: string,
  endDate: string
): Promise<{ status: string; count: number }> => {
  const path = `/attendance-log/range?start_date=${startDate}&end_date=${endDate}` + 
    (sectionCode && sectionCode !== 'ALL' ? `&section_code=${sectionCode}` : '');
  return apiFetch<{ status: string; count: number }>(path, {
    method: "DELETE"
  });
};

export const deleteBackup = async (filename: string): Promise<{ status: string }> => {
  return apiFetch<{ status: string }>(`/backups/${filename}`, {
    method: "DELETE"
  });
};

export const getAppVersion = async (): Promise<{ version: string }> => {
  return apiFetch<{ version: string }>("/version");
};

// Helper for weekly schedule defaults
export const getWeeklyScheduleDefault = (restDay: string): { [day: string]: string } => {
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const sched: { [key: string]: string } = {};
  days.forEach(d => {
    sched[d] = d === restDay ? 'R' : 'G';
  });
  return sched;
};

export interface UpdaterStatus {
  status: 'idle' | 'downloading' | 'completed' | 'error';
  progress: number;
  filename: string;
  path: string;
  error_message: string;
}

export const triggerUpdateDownload = async (): Promise<{ status: string; filename: string; path: string }> => {
  return apiFetch<{ status: string; filename: string; path: string }>("/updater/download", {
    method: "POST"
  });
};

export const getUpdateDownloadStatus = async (): Promise<UpdaterStatus> => {
  return apiFetch<UpdaterStatus>("/updater/status");
};

// 13. Traveling Allowance (TA) Calculations & Export APIs
export interface TAEntry {
  id?: number;
  entry_date: string;
  train_no?: string;
  time_left?: string;
  time_arrived?: string;
  station_from?: string;
  station_to?: string;
  is_stay?: number;
  stay_details?: string;
  days_nights?: string;
  object_journey?: string;
  rate: number;
  amount: number;
}

export interface TABill {
  id?: number;
  emp_id: number;
  emp_name?: string;
  pf_number?: string;
  designation?: string;
  level?: number;
  month_year: string;
  journey_type: 'NORMAL' | 'TRAINING';
  book_no?: string;
  page_no?: string;
  serial_no_from?: string;
  serial_no_to?: string;
  bill_unit?: string;
  basic_pay?: number;
  total_amount?: number;
  created_at?: string;
  entries: TAEntry[];
}

export const getTABills = async (sectionCode?: string): Promise<TABill[]> => {
  const path = sectionCode ? `/ta-bills?section_code=${sectionCode}` : "/ta-bills";
  return apiFetch<TABill[]>(path);
};

export const getTABillById = async (id: number): Promise<TABill> => {
  return apiFetch<TABill>(`/ta-bills/${id}`);
};

export const saveTABill = async (bill: TABill): Promise<{ id: number; status: string }> => {
  if (bill.id) {
    return apiFetch<{ id: number; status: string }>(`/ta-bills/${bill.id}`, {
      method: "PUT",
      body: JSON.stringify(bill)
    });
  } else {
    return apiFetch<{ id: number; status: string }>("/ta-bills", {
      method: "POST",
      body: JSON.stringify(bill)
    });
  }
};

export const deleteTABill = async (id: number): Promise<void> => {
  await apiFetch<any>(`/ta-bills/${id}`, {
    method: "DELETE"
  });
};


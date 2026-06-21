import io
import os
import sys
import json
import sqlite3
import shutil
import pandas as pd
import xlsxwriter
from datetime import datetime, date
from typing import List, Optional
from pydantic import BaseModel
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import StreamingResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware

# ReportLab imports
from reportlab.lib.pagesizes import letter, A4, landscape
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.pdfgen import canvas

# Setup persistent directory in User's Documents to keep Desktop clean
doc_dir = os.path.join(os.path.expanduser("~"), "Documents", "MetroRailwayERP")
os.makedirs(doc_dir, exist_ok=True)
DB_PATH = os.path.join(doc_dir, "database.db")
BACKUP_DIR = os.path.join(doc_dir, "backups")

# Ensure directories exist
os.makedirs(BACKUP_DIR, exist_ok=True)

# Copy default database from PyInstaller bundle if it doesn't exist
if not os.path.exists(DB_PATH):
    if getattr(sys, 'frozen', False):
        default_db = os.path.join(sys._MEIPASS, "database.db")
    else:
        default_db = os.path.join(os.path.dirname(os.path.abspath(__file__)), "database.db")
        
    if os.path.exists(default_db):
        try:
            shutil.copy(default_db, DB_PATH)
        except Exception as e:
            print(f"Failed to copy default database: {e}")

TA_TEMPLATE_PATH = os.path.join(doc_dir, "TA bill.xlsx")
if not os.path.exists(TA_TEMPLATE_PATH):
    if getattr(sys, 'frozen', False):
        default_ta = os.path.join(sys._MEIPASS, "TA bill.xlsx")
    else:
        default_ta = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "TA bill.xlsx")
    if os.path.exists(default_ta):
        try:
            shutil.copy(default_ta, TA_TEMPLATE_PATH)
        except Exception as e:
            print(f"Failed to copy default TA template: {e}")

app = FastAPI(title="Metro Railway Kolkata S&T Staff Management System Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- SQLite Database Helper ---
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.row_factory = sqlite3.Row
    return conn

# --- Audit Logging Utility ---
def log_audit(action: str, module: str, details: str, user: str = "System Admin"):
    try:
        conn = get_db()
        conn.execute("""
            INSERT INTO audit_logs (timestamp, user, module, action, details)
            VALUES (?, ?, ?, ?, ?)
        """, (datetime.now().strftime("%Y-%m-%d %H:%M:%S"), user, module, action, details))
        conn.commit()
        conn.close()
    except Exception as e:
        print("Audit log failed:", e)

# --- Recalculate Leave Bank & Sync CR Ledger ---
def sync_leave_and_ledger(emp_id: int, year: int):
    conn = get_db()
    cursor = conn.cursor()
    try:
        # Get employee rest day
        cursor.execute("SELECT default_rest_day FROM employees WHERE emp_id = ?", (emp_id,))
        emp = cursor.fetchone()
        if not emp:
            return
        rest_day = emp['default_rest_day']

        start_date = f"{year}-01-01"
        end_date = f"{year}-12-31"

        # Get all logs for employee in that year
        cursor.execute("""
            SELECT date, status, remarks FROM attendance_log 
            WHERE emp_id = ? AND date >= ? AND date <= ?
        """, (emp_id, start_date, end_date))
        logs = cursor.fetchall()

        used_cl = sum(1 for log in logs if log['status'] == 'CL')
        used_lap = sum(1 for log in logs if log['status'] == 'LAP')

        # Earned CRs (Working P or P/N on their rest day)
        earned_dates = []
        for log in logs:
            if log['status'] in ['P', 'P/N']:
                dt = datetime.strptime(log['date'], "%Y-%m-%d")
                day_name = dt.strftime("%A")
                if day_name == rest_day:
                    earned_dates.append(log['date'])

        # Gather explicitly mapped CRs and unassociated CRs
        consumed_dates = [log['date'] for log in logs if log['status'] == 'CR']
        explicit_mappings = {} # consumed_date -> earned_date
        unassociated_consumed = []
        for log in logs:
            if log['status'] == 'CR':
                cdate = log['date']
                remarks = log['remarks'] or ''
                if "CR_EARNED_DATE:" in remarks:
                    try:
                        parts = remarks.split("CR_EARNED_DATE:")
                        if len(parts) > 1:
                            edate = parts[1].strip()[:10]
                            datetime.strptime(edate, "%Y-%m-%d")
                            explicit_mappings[cdate] = edate
                            continue
                    except Exception:
                        pass
                unassociated_consumed.append(cdate)

        # Update Compensatory Rest Ledger
        # Fetch current ledger
        cursor.execute("SELECT id, earned_date, consumed_date FROM compensatory_rest_ledger WHERE emp_id = ?", (emp_id,))
        ledger = {row['earned_date']: dict(row) for row in cursor.fetchall()}

        # Insert missing earned dates
        for edate in earned_dates:
            if edate not in ledger:
                cursor.execute("INSERT INTO compensatory_rest_ledger (emp_id, earned_date, consumed_date) VALUES (?, ?, NULL)", (emp_id, edate))
                ledger[edate] = {'earned_date': edate, 'consumed_date': None}

        # Delete invalid earned dates
        for edate in list(ledger.keys()):
            if edate not in earned_dates:
                cursor.execute("DELETE FROM compensatory_rest_ledger WHERE emp_id = ? AND earned_date = ?", (emp_id, edate))
                del ledger[edate]

        # Reset all consumed dates to NULL first
        cursor.execute("UPDATE compensatory_rest_ledger SET consumed_date = NULL WHERE emp_id = ?", (emp_id,))

        # Apply explicit mappings
        paired_earned = set()
        for cdate, edate in explicit_mappings.items():
            cursor.execute("""
                INSERT INTO compensatory_rest_ledger (emp_id, earned_date, consumed_date)
                VALUES (?, ?, ?)
                ON CONFLICT(emp_id, earned_date) DO UPDATE SET consumed_date = excluded.consumed_date
            """, (emp_id, edate, cdate))
            paired_earned.add(edate)

        # Pair remaining unassociated consumed CRs with remaining unconsumed earned CRs chronologically
        remaining_earned = [edate for edate in earned_dates if edate not in paired_earned]
        remaining_earned.sort()
        unassociated_consumed.sort()

        c_idx = 0
        for edate in remaining_earned:
            if c_idx < len(unassociated_consumed):
                cursor.execute("""
                    UPDATE compensatory_rest_ledger 
                    SET consumed_date = ? 
                    WHERE emp_id = ? AND earned_date = ?
                """, (unassociated_consumed[c_idx], emp_id, edate))
                c_idx += 1

        # Save accrued_cr count
        accrued_cr = max(0, len(earned_dates) - len(consumed_dates))

        # Upsert leave bank
        cursor.execute("""
            INSERT INTO leave_bank (emp_id, year, total_cl, total_lap, used_cl, used_lap, accrued_cr)
            VALUES (?, ?, 8, 30, ?, ?, ?)
            ON CONFLICT(emp_id, year) DO UPDATE SET
                used_cl = excluded.used_cl,
                used_lap = excluded.used_lap,
                accrued_cr = excluded.accrued_cr
        """, (emp_id, year, used_cl, used_lap, accrued_cr))

        conn.commit()
    except Exception as e:
        conn.rollback()
        print(f"Failed to sync leave & ledger for employee {emp_id}:", e)
    finally:
        conn.close()

# --- Database Initialization & Seeding ---
def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Rebuild tables referencing employees_old if any are corrupted by SQLite RENAME
    for table_name in ('compensatory_rest_ledger', 'leave_bank', 'attendance_log', 'special_events'):
        cursor.execute(f"SELECT sql FROM sqlite_master WHERE type='table' AND name='{table_name}'")
        row = cursor.fetchone()
        if row and 'employees_old' in row[0]:
            print(f"Repairing table {table_name} to reference new employees table...")
            try:
                cursor.execute("PRAGMA foreign_keys = OFF;")
                cursor.execute(f"ALTER TABLE {table_name} RENAME TO {table_name}_old;")
                
                if table_name == 'compensatory_rest_ledger':
                    cursor.execute("""
                        CREATE TABLE compensatory_rest_ledger (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            emp_id INTEGER REFERENCES employees(emp_id) ON DELETE CASCADE,
                            earned_date TEXT NOT NULL,
                            consumed_date TEXT,
                            UNIQUE (emp_id, earned_date)
                        );
                    """)
                    cursor.execute("""
                        INSERT INTO compensatory_rest_ledger (id, emp_id, earned_date, consumed_date)
                        SELECT id, emp_id, earned_date, consumed_date FROM compensatory_rest_ledger_old;
                    """)
                elif table_name == 'leave_bank':
                    cursor.execute("""
                        CREATE TABLE leave_bank (
                            emp_id INTEGER REFERENCES employees(emp_id) ON DELETE CASCADE,
                            year INTEGER NOT NULL,
                            total_cl INTEGER NOT NULL DEFAULT 8,
                            total_lap INTEGER NOT NULL DEFAULT 30,
                            used_cl INTEGER NOT NULL DEFAULT 0,
                            used_lap INTEGER NOT NULL DEFAULT 0,
                            accrued_cr INTEGER NOT NULL DEFAULT 0,
                            PRIMARY KEY (emp_id, year)
                        );
                    """)
                    cursor.execute("""
                        INSERT INTO leave_bank (emp_id, year, total_cl, total_lap, used_cl, used_lap, accrued_cr)
                        SELECT emp_id, year, total_cl, total_lap, used_cl, used_lap, accrued_cr FROM leave_bank_old;
                    """)
                elif table_name == 'attendance_log':
                    cursor.execute("""
                        CREATE TABLE attendance_log (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            emp_id INTEGER REFERENCES employees(emp_id) ON DELETE CASCADE,
                            date TEXT NOT NULL,
                            status TEXT NOT NULL,
                            is_night INTEGER NOT NULL DEFAULT 0,
                            shift_id INTEGER REFERENCES shift_rules(id) ON DELETE SET NULL,
                            remarks TEXT,
                            UNIQUE (emp_id, date)
                        );
                    """)
                    cursor.execute("""
                        INSERT INTO attendance_log (id, emp_id, date, status, is_night, shift_id, remarks)
                        SELECT id, emp_id, date, status, is_night, shift_id, remarks FROM attendance_log_old;
                    """)
                elif table_name == 'special_events':
                    cursor.execute("""
                        CREATE TABLE special_events (
                            id INTEGER PRIMARY KEY AUTOINCREMENT,
                            emp_id INTEGER REFERENCES employees(emp_id) ON DELETE CASCADE,
                            event_type TEXT NOT NULL,
                            from_date TEXT NOT NULL,
                            to_date TEXT NOT NULL,
                            order_number TEXT,
                            location TEXT,
                            from_section TEXT,
                            to_section TEXT,
                            signatory_name TEXT,
                            signatory_designation TEXT
                        );
                    """)
                    cursor.execute("""
                        INSERT INTO special_events (id, emp_id, event_type, from_date, to_date, order_number, location, from_section, to_section, signatory_name, signatory_designation)
                        SELECT id, emp_id, event_type, from_date, to_date, order_number, location, from_section, to_section, signatory_name, signatory_designation FROM special_events_old;
                    """)
                
                cursor.execute(f"DROP TABLE {table_name}_old;")
                cursor.execute("PRAGMA foreign_keys = ON;")
                conn.commit()
                print(f"Table {table_name} repaired successfully.")
            except Exception as e:
                conn.rollback()
                print(f"Error repairing table {table_name}: {e}")

    # 1. Lines Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            line_name TEXT NOT NULL UNIQUE,
            color_code TEXT NOT NULL
        );
    """)
    
    # 2. Sections Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            line_id INTEGER REFERENCES lines(id) ON DELETE CASCADE,
            section_code TEXT NOT NULL UNIQUE,
            section_name TEXT NOT NULL,
            base_location TEXT NOT NULL
        );
    """)

    # 3. Employees Table
    cursor.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='employees'")
    row = cursor.fetchone()
    if row and 'Flexible' not in row[0]:
        print("Migrating employees table to allow 'Flexible' as default_rest_day...")
        try:
            cursor.execute("PRAGMA foreign_keys = OFF;")
            cursor.execute("ALTER TABLE employees RENAME TO employees_old;")
            cursor.execute("""
                CREATE TABLE employees (
                    emp_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    pf_number TEXT NOT NULL UNIQUE,
                    name TEXT NOT NULL,
                    designation TEXT NOT NULL,
                    level INTEGER NOT NULL CHECK (level >= 1 AND level <= 12),
                    primary_section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL,
                    default_rest_day TEXT NOT NULL CHECK (default_rest_day IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Flexible')),
                    joining_date TEXT,
                    weekly_schedule TEXT,
                    display_order INTEGER DEFAULT 0
                );
            """)
            cursor.execute("""
                INSERT INTO employees (emp_id, pf_number, name, designation, level, primary_section_id, default_rest_day, joining_date, weekly_schedule, display_order)
                SELECT emp_id, pf_number, name, designation, level, primary_section_id, default_rest_day, joining_date, weekly_schedule, display_order FROM employees_old;
            """)
            cursor.execute("DROP TABLE employees_old;")
            cursor.execute("PRAGMA foreign_keys = ON;")
            conn.commit()
            print("Migration of employees table successful.")
        except Exception as e:
            conn.rollback()
            print(f"Error migrating employees table: {e}")

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS employees (
            emp_id INTEGER PRIMARY KEY AUTOINCREMENT,
            pf_number TEXT NOT NULL UNIQUE,
            name TEXT NOT NULL,
            designation TEXT NOT NULL,
            level INTEGER NOT NULL CHECK (level >= 1 AND level <= 12),
            primary_section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL,
            default_rest_day TEXT NOT NULL CHECK (default_rest_day IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday', 'Flexible')),
            joining_date TEXT,
            weekly_schedule TEXT,
            display_order INTEGER DEFAULT 0
        );
    """)

    # 4. Compensatory Rest Ledger Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS compensatory_rest_ledger (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            emp_id INTEGER REFERENCES employees(emp_id) ON DELETE CASCADE,
            earned_date TEXT NOT NULL,
            consumed_date TEXT,
            UNIQUE (emp_id, earned_date)
        );
    """)

    # 5. Shift Rules Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS shift_rules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            section_id INTEGER REFERENCES sections(id) ON DELETE CASCADE,
            shift_code TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            working_days TEXT NOT NULL,
            is_night_duty INTEGER NOT NULL DEFAULT 0,
            duty_type TEXT,
            UNIQUE (section_id, shift_code)
        );
    """)

    # 6. Leave Bank Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS leave_bank (
            emp_id INTEGER REFERENCES employees(emp_id) ON DELETE CASCADE,
            year INTEGER NOT NULL,
            total_cl INTEGER NOT NULL DEFAULT 8,
            total_lap INTEGER NOT NULL DEFAULT 30,
            used_cl INTEGER NOT NULL DEFAULT 0,
            used_lap INTEGER NOT NULL DEFAULT 0,
            accrued_cr INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (emp_id, year)
        );
    """)

    # 7. Attendance Log Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS attendance_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            emp_id INTEGER REFERENCES employees(emp_id) ON DELETE CASCADE,
            date TEXT NOT NULL,
            status TEXT NOT NULL,
            is_night INTEGER NOT NULL DEFAULT 0,
            shift_id INTEGER REFERENCES shift_rules(id) ON DELETE SET NULL,
            remarks TEXT,
            UNIQUE (emp_id, date)
        );
    """)

    # 8. Special Events Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS special_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            emp_id INTEGER REFERENCES employees(emp_id) ON DELETE CASCADE,
            event_type TEXT NOT NULL,
            from_date TEXT NOT NULL,
            to_date TEXT NOT NULL,
            order_number TEXT,
            location TEXT,
            from_section TEXT,
            to_section TEXT,
            signatory_name TEXT,
            signatory_designation TEXT
        );
    """)

    # 9. Attendance Codes Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS attendance_codes (
            code TEXT PRIMARY KEY,
            description TEXT NOT NULL,
            bg_color TEXT NOT NULL DEFAULT '#FFFFFF',
            text_color TEXT NOT NULL DEFAULT '#1E293B',
            is_leave INTEGER NOT NULL DEFAULT 0,
            leave_type TEXT NOT NULL CHECK (leave_type IN ('CL', 'LAP', 'CR', 'Sick', 'None')) DEFAULT 'None'
        );
    """)

    # 10. Holidays Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS holidays (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            holiday_date TEXT UNIQUE NOT NULL,
            name TEXT NOT NULL,
            holiday_type TEXT NOT NULL,
            applicability TEXT
        );
    """)

    # 11. Audit Logs Table
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp TEXT NOT NULL,
            user TEXT NOT NULL,
            module TEXT NOT NULL,
            action TEXT NOT NULL,
            details TEXT NOT NULL
        );
    """)

    # Seed Default Roster Status Codes
    cursor.execute("SELECT count(*) FROM attendance_codes")
    if cursor.fetchone()[0] == 0:
        default_codes = [
            ('P', 'Present (General/Day Shift)', '#FFFFFF', '#1E293B', 0, 'None'),
            ('P/N', 'Present (Night Shift)', '#F3E8FF', '#7E22CE', 0, 'None'),
            ('R', 'Weekly Rest Day', '#F1F5F9', '#64748B', 0, 'None'),
            ('CR', 'Compensatory Rest', '#EFF6FF', '#1D4ED8', 1, 'CR'),
            ('CL', 'Casual Leave', '#FFFBEB', '#B45309', 1, 'CL'),
            ('LAP', 'Average Pay Leave (LAP)', '#FFF7ED', '#C2410C', 1, 'LAP'),
            ('Sick', 'Sick Leave / Medical Memo', '#FEF2F2', '#B91C1C', 1, 'Sick'),
            ('SCL', 'Special Casual Leave', '#FFF1F2', '#BE123C', 1, 'None'),
            ('PH', 'Public / National Holiday', '#FEF9C3', '#A16207', 0, 'None')
        ]
        cursor.executemany("""
            INSERT INTO attendance_codes (code, description, bg_color, text_color, is_leave, leave_type)
            VALUES (?, ?, ?, ?, ?, ?)
        """, default_codes)

    # Seed Default Lines and Sections
    cursor.execute("SELECT count(*) FROM lines")
    if cursor.fetchone()[0] == 0:
        cursor.execute("INSERT INTO lines (line_name, color_code) VALUES ('Blue Line', '#005EA6')")
        cursor.execute("INSERT INTO lines (line_name, color_code) VALUES ('Yellow Line', '#FFD100')")
        cursor.execute("INSERT INTO lines (line_name, color_code) VALUES ('Green Line', '#009639')")
        cursor.execute("INSERT INTO lines (line_name, color_code) VALUES ('Purple Line', '#7B2E8D')")
        cursor.execute("INSERT INTO lines (line_name, color_code) VALUES ('Noapara Car Shed', '#475569')")

        cursor.execute("INSERT INTO sections (line_id, section_code, section_name, base_location) VALUES (1, 'KKVS', 'Kavi Subhash Section', 'Kavi Subhash')")
        cursor.execute("INSERT INTO sections (line_id, section_code, section_name, base_location) VALUES (1, 'KMUK', 'Tollygunge Section', 'Mahanayak Uttam Kumar')")
        cursor.execute("INSERT INTO sections (line_id, section_code, section_name, base_location) VALUES (1, 'KNAP', 'Noapara Section', 'Noapara')")
        cursor.execute("INSERT INTO sections (line_id, section_code, section_name, base_location) VALUES (2, 'KJHD', 'Joy Hind Section', 'Joy Hind')")
        cursor.execute("INSERT INTO sections (line_id, section_code, section_name, base_location) VALUES (4, 'KJKA', 'Joka Section', 'Joka')")
        cursor.execute("INSERT INTO sections (line_id, section_code, section_name, base_location) VALUES (5, 'KNCS', 'Noapara Car Shed Section', 'Noapara Car Shed')")
        
        # Seed default shift rules for all sections
        cursor.execute("SELECT id FROM sections")
        sec_ids = [r[0] for r in cursor.fetchall()]
        for sec_id in sec_ids:
            cursor.execute("INSERT INTO shift_rules (section_id, shift_code, start_time, end_time, working_days, is_night_duty) VALUES (?, 'M', '06:00:00', '14:00:00', 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday', 0)", (sec_id,))
            cursor.execute("INSERT INTO shift_rules (section_id, shift_code, start_time, end_time, working_days, is_night_duty) VALUES (?, 'E', '14:00:00', '22:00:00', 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday', 0)", (sec_id,))
            cursor.execute("INSERT INTO shift_rules (section_id, shift_code, start_time, end_time, working_days, is_night_duty) VALUES (?, 'N', '22:00:00', '06:00:00', 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday', 1)", (sec_id,))
            cursor.execute("INSERT INTO shift_rules (section_id, shift_code, start_time, end_time, working_days, is_night_duty) VALUES (?, 'G', '09:00:00', '17:30:00', 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday', 0)", (sec_id,))

    conn.commit()

    # Auto-seed employees from local Excel list if employees list is currently empty
    cursor.execute("SELECT count(*) FROM employees")
    if cursor.fetchone()[0] == 0:
        excel_path = "Staff list for KKVS and KMUK section (1).xlsx"
        if not os.path.exists(excel_path):
            excel_path = os.path.join("..", excel_path)
        if os.path.exists(excel_path):
            try:
                df = pd.read_excel(excel_path, sheet_name="Staff List", header=None)
                current_section = "KKVS"
                for idx, row in df.iterrows():
                    if idx < 10:
                        continue
                    sl = row[0]
                    pf = row[1]
                    name = row[3]
                    desig = row[4]
                    if pd.isna(sl) and pd.isna(pf) and pd.isna(name) and pd.isna(desig):
                        continue
                    if str(sl).strip() in ["KKVS", "KMUK"]:
                        current_section = str(sl).strip()
                        continue
                    if pd.notna(pf) and pd.notna(name):
                        pf_str = str(pf).strip().split('.')[0]
                        name_str = str(name).replace("Sri ", "").replace("MD ", "Md. ").strip(" .")
                        desig_str = str(desig).strip(" .")
                        rest_day = "Wednesday" if current_section == "KKVS" else "Sunday"
                        
                        level = 1
                        if "sse" in desig_str.lower():
                            level = 8 if "ic" in desig_str.lower() else 7
                        elif "je" in desig_str.lower():
                            level = 6
                        elif "sr. tech" in desig_str.lower() or "sr.tech" in desig_str.lower():
                            level = 6
                        elif "tech -i" in desig_str.lower() or "tech-i" in desig_str.lower():
                            level = 5
                        elif "tech -ii" in desig_str.lower() or "tech-ii" in desig_str.lower():
                            level = 4
                        elif "tech -iii" in desig_str.lower() or "tech-iii" in desig_str.lower():
                            level = 3
                        
                        schedule = {
                            "Monday": "G", "Tuesday": "G", 
                            "Wednesday": "R" if rest_day == "Wednesday" else "G",
                            "Thursday": "G", "Friday": "G", "Saturday": "G",
                            "Sunday": "R" if rest_day == "Sunday" else "G"
                        }
                        
                        cursor.execute("""
                            INSERT INTO employees (pf_number, name, designation, level, primary_section_id, default_rest_day, weekly_schedule)
                            VALUES (?, ?, ?, ?, (SELECT id FROM sections WHERE section_code = ?), ?, ?)
                        """, (pf_str, name_str, desig_str, level, current_section, rest_day, json.dumps(schedule)))
                        
                        # Add initial leave bank
                        emp_id = cursor.lastrowid
                        cursor.execute("""
                            INSERT INTO leave_bank (emp_id, year, total_cl, total_lap, used_cl, used_lap, accrued_cr)
                            VALUES (?, 2026, 8, 30, 0, 0, 0)
                        """, (emp_id,))
                conn.commit()
                log_audit("Auto-Seed", "Database", "Initial database seeded with staff from Excel list.")
            except Exception as e:
                print("Excel seeding failed:", e)
                
    # Ensure display_order column exists in employees table (migration for existing DBs)
    try:
        cursor.execute("ALTER TABLE employees ADD COLUMN display_order INTEGER DEFAULT 0;")
        conn.commit()
    except sqlite3.OperationalError:
        pass # Column already exists

    # Ensure transfer and signatory columns exist in special_events table
    for col in ["from_section", "to_section", "signatory_name", "signatory_designation"]:
        try:
            cursor.execute(f"ALTER TABLE special_events ADD COLUMN {col} TEXT;")
            conn.commit()
        except sqlite3.OperationalError:
            pass # Column already exists
            
    # Ensure duty_type column exists in shift_rules table
    try:
        cursor.execute("ALTER TABLE shift_rules ADD COLUMN duty_type TEXT;")
        conn.commit()
    except sqlite3.OperationalError:
        pass # Column already exists

    # Ensure basic_pay column exists in employees table (migration for existing DBs)
    try:
        cursor.execute("ALTER TABLE employees ADD COLUMN basic_pay INTEGER DEFAULT 0;")
        conn.commit()
    except sqlite3.OperationalError:
        pass # Column already exists

    # Create ta_bills and ta_entries tables
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ta_bills (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            emp_id INTEGER NOT NULL REFERENCES employees(emp_id) ON DELETE CASCADE,
            month_year TEXT NOT NULL,
            journey_type TEXT NOT NULL,
            book_no TEXT DEFAULT '',
            page_no TEXT DEFAULT '',
            serial_no_from TEXT DEFAULT '',
            serial_no_to TEXT DEFAULT '',
            bill_unit TEXT DEFAULT '',
            basic_pay INTEGER DEFAULT 0,
            created_at TEXT NOT NULL
        );
    """)
    try:
        cursor.execute("ALTER TABLE ta_bills ADD COLUMN bill_unit TEXT DEFAULT '';")
        conn.commit()
    except sqlite3.OperationalError:
        pass # Column already exists

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS ta_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            bill_id INTEGER NOT NULL REFERENCES ta_bills(id) ON DELETE CASCADE,
            entry_date TEXT NOT NULL,
            train_no TEXT DEFAULT '',
            time_left TEXT DEFAULT '',
            time_arrived TEXT DEFAULT '',
            station_from TEXT DEFAULT '',
            station_to TEXT DEFAULT '',
            is_stay INTEGER DEFAULT 0,
            stay_details TEXT DEFAULT '',
            days_nights TEXT DEFAULT '',
            object_journey TEXT DEFAULT '',
            rate INTEGER NOT NULL,
            amount INTEGER NOT NULL,
            display_order INTEGER DEFAULT 0
        );
    """)
    conn.commit()
        
    conn.close()

init_db()

# --- Pydantic Models for API Requests ---
class LineSchema(BaseModel):
    line_name: str
    color_code: str

class SectionSchema(BaseModel):
    line_id: int
    section_code: str
    section_name: str
    base_location: str

class EmployeeSchema(BaseModel):
    pf_number: str
    name: str
    designation: str
    level: int
    primary_section_id: Optional[int] = None
    default_rest_day: str
    joining_date: Optional[str] = None
    weekly_schedule: Optional[dict] = None
    display_order: Optional[int] = 0
    basic_pay: Optional[int] = 0

class ReorderPayload(BaseModel):
    emp_ids: List[int]

class ShiftRuleSchema(BaseModel):
    section_id: int
    shift_code: str
    start_time: str
    end_time: str
    working_days: List[str]
    is_night_duty: bool
    duty_type: Optional[str] = None

class AttendanceCodeSchema(BaseModel):
    code: str
    description: str
    bg_color: str
    text_color: str
    is_leave: bool
    leave_type: str

class HolidaySchema(BaseModel):
    holiday_date: str
    name: str
    holiday_type: str
    applicability: Optional[str] = None

class AttendanceLogSchema(BaseModel):
    emp_id: int
    date: str
    status: str
    is_night: bool
    shift_id: Optional[int] = None
    remarks: Optional[str] = ""

class SpecialEventSchema(BaseModel):
    emp_id: int
    event_type: str
    from_date: str
    to_date: str
    order_number: Optional[str] = None
    location: Optional[str] = None
    from_section: Optional[str] = None
    to_section: Optional[str] = None
    signatory_name: Optional[str] = None
    signatory_designation: Optional[str] = None

class RestoreSchema(BaseModel):
    filename: str

class NightDutyRow(BaseModel):
    sl: int
    pf_number: str
    name: str
    designation: str
    level: int
    dates: str # Comma-separated days, e.g. "20,21,24,30"
    total_days: int
    remarks: Optional[str] = ""

class NightDutyExportRequest(BaseModel):
    month_name: str # e.g. "APRIL-2026"
    section_code: str # KKVS, KMUK, etc.
    section_name: str # e.g. "Kavi Subhash Section"
    ref_no: str # e.g. "SSE/Sig/KKVS/05/26"
    bill_unit: str # e.g. "2201-806"
    date_str: str # e.g. "30.05.2026"
    signatory_left: str # "SSE/Sig/KKVS/IC"
    signatory_right: str # "Dy. CPO"
    rows: List[NightDutyRow]

class AttendanceDay(BaseModel):
    day: int
    weekday: str # "Mon", "Tue", etc.
    status: str # "P", "R", "CR", etc.
    is_holiday: bool = False
    remarks: Optional[str] = ""

class AttendanceRow(BaseModel):
    sl: int
    pf_number: str
    name: str
    designation: str
    days: List[AttendanceDay]
    remarks: Optional[str] = ""

class AttendanceExportRequest(BaseModel):
    period_start: str # "11.05.2026"
    period_end: str # "10.06.2026"
    section_code: str # KKVS
    section_name: str # KAVI SUBHASH (KKVS)
    submission_date: str # 10.06.2026
    signatory_left: str # SSE/SIG/KKVS/IC
    signatory_right: str # Dy. CPO
    rows: List[AttendanceRow]

# --- Helper Functions for Weightage ---
def calculate_weightage(total_days: int):
    # 8 hours per shift. Weightage = 10 mins per hour = 80 mins per shift.
    total_mins = total_days * 80
    hours = total_mins // 60
    minutes = total_mins % 60
    return f"{hours:02d} HRS", f"{minutes:02d} MIN."

def calculate_weightage_numeric(total_days: int):
    total_mins = total_days * 80
    hours = total_mins // 60
    minutes = total_mins % 60
    return hours, minutes

# --- Numbered Canvas for PDF page counting ---
class NumberedCanvas(canvas.Canvas):
    def __init__(self, *args, **kwargs):
        super(NumberedCanvas, self).__init__(*args, **kwargs)
        self._saved_page_states = []
        self._pageCompression = 0

    def showPage(self):
        self._saved_page_states.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        num_pages = len(self._saved_page_states)
        for state in self._saved_page_states:
            self.__dict__.update(state)
            self.draw_page_number(num_pages)
            canvas.Canvas.showPage(self)
        canvas.Canvas.save(self)

    def draw_page_number(self, page_count):
        self.saveState()
        self.setFont("Helvetica", 9)
        self.setFillColor(colors.HexColor("#4A5568"))
        # Header
        self.drawString(36, self._pagesize[1] - 30, "Metro Railway, Kolkata — Signalling & Telecommunication Department")
        self.setLineWidth(0.5)
        self.setStrokeColor(colors.HexColor("#CBD5E1"))
        self.line(36, self._pagesize[1] - 35, self._pagesize[0] - 36, self._pagesize[1] - 35)
        
        # Footer
        page_text = f"Page {self._pageNumber} of {page_count}"
        self.drawRightString(self._pagesize[0] - 36, 30, page_text)
        self.drawString(36, 30, f"Generated on {date.today().strftime('%d.%m.%Y')} | Official S&T ERP Report")
        self.line(36, 40, self._pagesize[0] - 36, 40)
        self.restoreState()


# --- API ENDPOINTS ---

try:
    from version import VERSION
except ImportError:
    VERSION = "1.2.0"

@app.get("/api/version")
def get_version():
    return {"version": VERSION}

# --- Background Updater State & Endpoints ---
import threading
import urllib.request
import json
import os

download_state = {
    "status": "idle", # "idle", "downloading", "completed", "error"
    "progress": 0,
    "filename": "",
    "path": "",
    "error_message": ""
}

def download_file_worker(download_url, dest_path):
    global download_state
    try:
        req = urllib.request.Request(
            download_url, 
            headers={"User-Agent": "StaffAttendanceERPUpdater"}
        )
        with urllib.request.urlopen(req) as response:
            total_size = int(response.headers.get('content-length', 0))
            block_size = 1024 * 16
            downloaded = 0
            
            with open(dest_path, "wb") as f:
                while True:
                    chunk = response.read(block_size)
                    if not chunk:
                        break
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0:
                        download_state["progress"] = int((downloaded / total_size) * 100)
                    else:
                        download_state["progress"] = 50
            
            download_state["status"] = "completed"
            download_state["progress"] = 100
    except Exception as e:
        download_state["status"] = "error"
        download_state["error_message"] = str(e)
        print(f"Update download failed: {e}")

@app.post("/api/updater/download")
def trigger_update_download():
    global download_state
    if download_state["status"] == "downloading":
        return {"status": "already_downloading"}
        
    try:
        req = urllib.request.Request(
            "https://api.github.com/repos/kbiswas9876/StaffAttendanceNAD/releases/latest",
            headers={"User-Agent": "StaffAttendanceERPUpdater"}
        )
        with urllib.request.urlopen(req) as response:
            release_data = json.loads(response.read().decode())
            
        assets = release_data.get("assets", [])
        exe_asset = None
        for asset in assets:
            if asset.get("name", "").endswith(".exe"):
                exe_asset = asset
                break
                
        if not exe_asset:
            if assets:
                exe_asset = assets[0]
            else:
                raise HTTPException(status_code=404, detail="No assets found in the latest release.")
                
        download_url = exe_asset["browser_download_url"]
        filename = exe_asset["name"]
        
        downloads_dir = os.path.join(os.path.expanduser("~"), "Downloads")
        os.makedirs(downloads_dir, exist_ok=True)
        dest_path = os.path.join(downloads_dir, filename)
        
        download_state["status"] = "downloading"
        download_state["progress"] = 0
        download_state["filename"] = filename
        download_state["path"] = dest_path
        download_state["error_message"] = ""
        
        t = threading.Thread(target=download_file_worker, args=(download_url, dest_path), daemon=True)
        t.start()
        
        return {
            "status": "started",
            "filename": filename,
            "path": dest_path
        }
    except Exception as e:
        download_state["status"] = "error"
        download_state["error_message"] = str(e)
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/updater/status")
def get_updater_status():
    global download_state
    return download_state


# 1. Lines CRUD
@app.get("/api/lines")
def read_lines():
    conn = get_db()
    lines = [dict(row) for row in conn.execute("SELECT * FROM lines").fetchall()]
    conn.close()
    return lines

@app.post("/api/lines")
def add_line(payload: LineSchema):
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("INSERT INTO lines (line_name, color_code) VALUES (?, ?)", (payload.line_name, payload.color_code))
        conn.commit()
        log_audit("Insert", "Lines", f"Created line: {payload.line_name}")
        return {"id": cursor.lastrowid, **payload.dict()}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Line name already exists.")
    finally:
        conn.close()

@app.put("/api/lines/{id}")
def edit_line(id: int, payload: LineSchema):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE lines SET line_name = ?, color_code = ? WHERE id = ?", (payload.line_name, payload.color_code, id))
    conn.commit()
    conn.close()
    log_audit("Update", "Lines", f"Updated line ID {id}: {payload.line_name}")
    return {"id": id, **payload.dict()}

@app.delete("/api/lines/{id}")
def remove_line(id: int):
    conn = get_db()
    conn.execute("DELETE FROM lines WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    log_audit("Delete", "Lines", f"Deleted line ID {id}")
    return {"status": "success"}

# 2. Sections CRUD
@app.get("/api/sections")
def read_sections():
    conn = get_db()
    sections = [dict(row) for row in conn.execute("SELECT * FROM sections").fetchall()]
    conn.close()
    return sections

@app.post("/api/sections")
def add_section(payload: SectionSchema):
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO sections (line_id, section_code, section_name, base_location)
            VALUES (?, ?, ?, ?)
        """, (payload.line_id, payload.section_code, payload.section_name, payload.base_location))
        conn.commit()
        log_audit("Insert", "Sections", f"Created section: {payload.section_code}")
        return {"id": cursor.lastrowid, **payload.dict()}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Section code already exists.")
    finally:
        conn.close()

@app.put("/api/sections/{id}")
def edit_section(id: int, payload: SectionSchema):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE sections SET line_id = ?, section_code = ?, section_name = ?, base_location = ?
        WHERE id = ?
    """, (payload.line_id, payload.section_code, payload.section_name, payload.base_location, id))
    conn.commit()
    conn.close()
    log_audit("Update", "Sections", f"Updated section ID {id}: {payload.section_code}")
    return {"id": id, **payload.dict()}

@app.delete("/api/sections/{id}")
def remove_section(id: int):
    conn = get_db()
    conn.execute("DELETE FROM sections WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    log_audit("Delete", "Sections", f"Deleted section ID {id}")
    return {"status": "success"}

# 3. Employees CRUD
@app.get("/api/employees")
def read_employees(section_code: Optional[str] = None):
    conn = get_db()
    query = """
        SELECT e.*, s.section_code 
        FROM employees e
        LEFT JOIN sections s ON e.primary_section_id = s.id
    """
    if section_code:
        query += " WHERE s.section_code = ? ORDER BY e.display_order ASC, e.emp_id ASC"
        rows = conn.execute(query, (section_code,)).fetchall()
    else:
        query += " ORDER BY e.display_order ASC, e.emp_id ASC"
        rows = conn.execute(query).fetchall()
        
    employees = []
    for r in rows:
        d = dict(r)
        d['weekly_schedule'] = json.loads(d['weekly_schedule']) if d['weekly_schedule'] else {}
        employees.append(d)
    conn.close()
    return employees

@app.get("/api/employees/{emp_id}")
def read_employee(emp_id: int):
    conn = get_db()
    row = conn.execute("""
        SELECT e.*, s.section_code 
        FROM employees e
        LEFT JOIN sections s ON e.primary_section_id = s.id
        WHERE e.emp_id = ?
    """, (emp_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Employee not found")
    d = dict(row)
    d['weekly_schedule'] = json.loads(d['weekly_schedule']) if d['weekly_schedule'] else {}
    return d

@app.post("/api/employees")
def add_employee(payload: EmployeeSchema):
    conn = get_db()
    try:
        cursor = conn.cursor()
        sched_str = json.dumps(payload.weekly_schedule) if payload.weekly_schedule else "{}"
        cursor.execute("""
            INSERT INTO employees (pf_number, name, designation, level, primary_section_id, default_rest_day, joining_date, weekly_schedule, display_order, basic_pay)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (payload.pf_number, payload.name, payload.designation, payload.level, payload.primary_section_id, payload.default_rest_day, payload.joining_date, sched_str, payload.display_order or 0, payload.basic_pay or 0))
        emp_id = cursor.lastrowid
        
        # Create initial leave bank record
        cursor.execute("""
            INSERT INTO leave_bank (emp_id, year, total_cl, total_lap, used_cl, used_lap, accrued_cr)
            VALUES (?, 2026, 8, 30, 0, 0, 0)
        """, (emp_id,))
        conn.commit()
        log_audit("Insert", "Employees", f"Enrolled employee {payload.name} (PF: {payload.pf_number})")
        return {"emp_id": emp_id, **payload.dict()}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="PF Number already exists.")
    finally:
        conn.close()

@app.put("/api/employees/{emp_id}")
def edit_employee(emp_id: int, payload: EmployeeSchema):
    conn = get_db()
    cursor = conn.cursor()
    sched_str = json.dumps(payload.weekly_schedule) if payload.weekly_schedule else "{}"
    cursor.execute("""
        UPDATE employees SET pf_number = ?, name = ?, designation = ?, level = ?, 
            primary_section_id = ?, default_rest_day = ?, joining_date = ?, weekly_schedule = ?, display_order = ?, basic_pay = ?
        WHERE emp_id = ?
    """, (payload.pf_number, payload.name, payload.designation, payload.level, payload.primary_section_id, payload.default_rest_day, payload.joining_date, sched_str, payload.display_order or 0, payload.basic_pay or 0, emp_id))
    conn.commit()
    conn.close()
    
    # Recalculate leaves for 2026
    sync_leave_and_ledger(emp_id, 2026)
    log_audit("Update", "Employees", f"Updated employee ID {emp_id}: {payload.name}")
    return {"emp_id": emp_id, **payload.dict()}

@app.delete("/api/employees/{emp_id}")
def remove_employee(emp_id: int):
    conn = get_db()
    conn.execute("DELETE FROM employees WHERE emp_id = ?", (emp_id,))
    conn.commit()
    conn.close()
    log_audit("Delete", "Employees", f"Deleted employee ID {emp_id}")
    return {"status": "success"}

@app.post("/api/employees/reorder")
def reorder_employees(payload: ReorderPayload):
    conn = get_db()
    cursor = conn.cursor()
    try:
        for idx, emp_id in enumerate(payload.emp_ids):
            cursor.execute("UPDATE employees SET display_order = ? WHERE emp_id = ?", (idx, emp_id))
        conn.commit()
        log_audit("Reorder", "Employees", f"Reordered {len(payload.emp_ids)} employees")
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# 4. Shift Rules
@app.get("/api/shift-rules")
def read_shift_rules(section_code: str):
    conn = get_db()
    rules = [dict(row) for row in conn.execute("""
        SELECT r.* FROM shift_rules r
        JOIN sections s ON r.section_id = s.id
        WHERE s.section_code = ?
    """, (section_code,)).fetchall()]
    for r in rules:
        r['working_days'] = r['working_days'].split(',')
        r['is_night_duty'] = bool(r['is_night_duty'])
        if not r.get('duty_type'):
            r['duty_type'] = 'Night Shift' if r['is_night_duty'] else 'General / Day Shift'
    conn.close()
    return rules

@app.post("/api/shift-rules")
def add_shift_rule(payload: ShiftRuleSchema):
    conn = get_db()
    try:
        cursor = conn.cursor()
        days_str = ",".join(payload.working_days)
        duty_type_val = payload.duty_type
        if not duty_type_val:
            duty_type_val = 'Night Shift' if payload.is_night_duty else 'General / Day Shift'
        cursor.execute("""
            INSERT INTO shift_rules (section_id, shift_code, start_time, end_time, working_days, is_night_duty, duty_type)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (payload.section_id, payload.shift_code, payload.start_time, payload.end_time, days_str, int(payload.is_night_duty), duty_type_val))
        conn.commit()
        log_audit("Insert", "Shift Rules", f"Added shift rule {payload.shift_code} for Section ID {payload.section_id}")
        return {"id": cursor.lastrowid, **payload.dict()}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Shift code already exists for this section.")
    finally:
        conn.close()

@app.put("/api/shift-rules/{rule_id}")
def update_shift_rule(rule_id: int, payload: ShiftRuleSchema):
    conn = get_db()
    try:
        cursor = conn.cursor()
        existing = cursor.execute("SELECT id FROM shift_rules WHERE id = ?", (rule_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Shift rule not found.")
        days_str = ",".join(payload.working_days)
        duty_type_val = payload.duty_type
        if not duty_type_val:
            duty_type_val = 'Night Shift' if payload.is_night_duty else 'General / Day Shift'
        cursor.execute("""
            UPDATE shift_rules 
            SET section_id = ?, shift_code = ?, start_time = ?, end_time = ?, working_days = ?, is_night_duty = ?, duty_type = ?
            WHERE id = ?
        """, (payload.section_id, payload.shift_code, payload.start_time, payload.end_time, days_str, int(payload.is_night_duty), duty_type_val, rule_id))
        conn.commit()
        log_audit("Update", "Shift Rules", f"Updated shift rule {payload.shift_code} (ID: {rule_id}) for Section ID {payload.section_id}")
        return {"id": rule_id, **payload.dict()}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Shift code already exists for this section.")
    finally:
        conn.close()

@app.delete("/api/shift-rules/{rule_id}")
def delete_shift_rule(rule_id: int):
    conn = get_db()
    try:
        cursor = conn.cursor()
        existing = cursor.execute("SELECT id, shift_code, section_id FROM shift_rules WHERE id = ?", (rule_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Shift rule not found.")
        cursor.execute("DELETE FROM shift_rules WHERE id = ?", (rule_id,))
        conn.commit()
        log_audit("Delete", "Shift Rules", f"Deleted shift rule {existing['shift_code']} (ID: {rule_id})")
        return {"status": "success"}
    finally:
        conn.close()

# 5. Attendance Codes
@app.get("/api/attendance-codes")
def read_attendance_codes():
    conn = get_db()
    codes = [dict(row) for row in conn.execute("SELECT * FROM attendance_codes").fetchall()]
    for c in codes:
        c['is_leave'] = bool(c['is_leave'])
    conn.close()
    return codes

@app.post("/api/attendance-codes")
def add_attendance_code(payload: AttendanceCodeSchema):
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO attendance_codes (code, description, bg_color, text_color, is_leave, leave_type)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (payload.code, payload.description, payload.bg_color, payload.text_color, int(payload.is_leave), payload.leave_type))
        conn.commit()
        log_audit("Insert", "Attendance Codes", f"Created roster code: {payload.code}")
        return payload.dict()
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Roster status code already exists.")
    finally:
        conn.close()

@app.put("/api/attendance-codes/{code}")
def edit_attendance_code(code: str, payload: AttendanceCodeSchema):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE attendance_codes SET description = ?, bg_color = ?, text_color = ?, is_leave = ?, leave_type = ?
        WHERE code = ?
    """, (payload.description, payload.bg_color, payload.text_color, int(payload.is_leave), payload.leave_type, code))
    conn.commit()
    conn.close()
    log_audit("Update", "Attendance Codes", f"Updated roster code: {code}")
    return payload.dict()

@app.delete("/api/attendance-codes/{code}")
def remove_attendance_code(code: str):
    conn = get_db()
    conn.execute("DELETE FROM attendance_codes WHERE code = ?", (code,))
    conn.commit()
    conn.close()
    log_audit("Delete", "Attendance Codes", f"Deleted roster code: {code}")
    return {"status": "success"}

# 6. CR Ledger
@app.get("/api/compensatory-rest-ledger/{emp_id}")
def read_cr_ledger(emp_id: int):
    conn = get_db()
    rows = [dict(row) for row in conn.execute("SELECT * FROM compensatory_rest_ledger WHERE emp_id = ?", (emp_id,)).fetchall()]
    conn.close()
    return rows

@app.post("/api/compensatory-rest-ledger")
def add_cr_ledger_entry(payload: dict):
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO compensatory_rest_ledger (emp_id, earned_date, consumed_date)
            VALUES (?, ?, NULL)
        """, (payload['emp_id'], payload['earned_date']))
        conn.commit()
        log_audit("Insert", "CR Ledger", f"Manually logged extra-duty earned CR on {payload['earned_date']} for Employee ID {payload['emp_id']}")
        return {"id": cursor.lastrowid, **payload}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="CR record already exists for this date.")
    finally:
        conn.close()

@app.delete("/api/compensatory-rest-ledger/{id}")
def remove_cr_ledger_entry(id: int):
    conn = get_db()
    conn.execute("DELETE FROM compensatory_rest_ledger WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    log_audit("Delete", "CR Ledger", f"Deleted CR entry ID {id}")
    return {"status": "success"}

@app.put("/api/compensatory-rest-ledger/{id}")
def update_cr_ledger_consumed(id: int, payload: dict):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE compensatory_rest_ledger SET consumed_date = ? WHERE id = ?
    """, (payload.get('consumed_date'), id))
    conn.commit()
    conn.close()
    return {"status": "success"}

# 7. Leave Bank
@app.get("/api/leave-bank/{emp_id}")
def read_leave_bank(emp_id: int, year: int = 2026):
    conn = get_db()
    row = conn.execute("SELECT * FROM leave_bank WHERE emp_id = ? AND year = ?", (emp_id, year)).fetchone()
    if not row:
        # Create default
        cursor = conn.cursor()
        cursor.execute("INSERT INTO leave_bank (emp_id, year, total_cl, total_lap, used_cl, used_lap, accrued_cr) VALUES (?, ?, 8, 30, 0, 0, 0)", (emp_id, year))
        conn.commit()
        row = conn.execute("SELECT * FROM leave_bank WHERE emp_id = ? AND year = ?", (emp_id, year)).fetchone()
    conn.close()
    return dict(row)

@app.put("/api/leave-bank")
def edit_leave_bank(payload: dict):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO leave_bank (emp_id, year, total_cl, total_lap, used_cl, used_lap, accrued_cr)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(emp_id, year) DO UPDATE SET
            total_cl = excluded.total_cl,
            total_lap = excluded.total_lap,
            used_cl = excluded.used_cl,
            used_lap = excluded.used_lap,
            accrued_cr = excluded.accrued_cr
    """, (payload['emp_id'], payload['year'], payload['total_cl'], payload['total_lap'], payload['used_cl'], payload['used_lap'], payload['accrued_cr']))
    conn.commit()
    conn.close()
    log_audit("Update", "Leave Bank", f"Adjusted leave balances for Employee ID {payload['emp_id']}")
    return payload

# 8. Attendance Logs (Cycle Retrieval)
@app.get("/api/attendance-log")
def read_attendance_logs(section_code: str, start_date: str, end_date: str):
    conn = get_db()
    query = """
        SELECT l.* FROM attendance_log l
        JOIN employees e ON l.emp_id = e.emp_id
        JOIN sections s ON e.primary_section_id = s.id
        WHERE s.section_code = ? AND l.date >= ? AND l.date <= ?
    """
    rows = [dict(row) for row in conn.execute(query, (section_code, start_date, end_date)).fetchall()]
    for r in rows:
        r['is_night'] = bool(r['is_night'])
    conn.close()
    return rows

@app.get("/api/attendance-log/{emp_id}")
def read_employee_attendance_logs(emp_id: int, year: int = 2026):
    conn = get_db()
    start_date = f"{year}-01-01"
    end_date = f"{year}-12-31"
    query = """
        SELECT * FROM attendance_log
        WHERE emp_id = ? AND date >= ? AND date <= ?
        ORDER BY date ASC
    """
    rows = [dict(row) for row in conn.execute(query, (emp_id, start_date, end_date)).fetchall()]
    for r in rows:
        r['is_night'] = bool(r['is_night'])
    conn.close()
    return rows


@app.post("/api/attendance-log")
def add_attendance_log(payload: AttendanceLogSchema):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO attendance_log (emp_id, date, status, is_night, shift_id, remarks)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(emp_id, date) DO UPDATE SET
            status = excluded.status,
            is_night = excluded.is_night,
            shift_id = excluded.shift_id,
            remarks = excluded.remarks
    """, (payload.emp_id, payload.date, payload.status, int(payload.is_night), payload.shift_id, payload.remarks))
    conn.commit()
    conn.close()
    
    # Recalculate leaves
    year = int(payload.date.split("-")[0])
    sync_leave_and_ledger(payload.emp_id, year)
    log_audit("Update", "Attendance", f"Logged attendance for Employee ID {payload.emp_id} on {payload.date} as {payload.status}")
    return {"status": "success"}

@app.post("/api/attendance-log/bulk")
def add_attendance_logs_bulk(logs: List[AttendanceLogSchema]):
    conn = get_db()
    cursor = conn.cursor()
    emp_years = set()
    for log in logs:
        cursor.execute("""
            INSERT INTO attendance_log (emp_id, date, status, is_night, shift_id, remarks)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(emp_id, date) DO UPDATE SET
                status = excluded.status,
                is_night = excluded.is_night,
                shift_id = excluded.shift_id,
                remarks = excluded.remarks
        """, (log.emp_id, log.date, log.status, int(log.is_night), log.shift_id, log.remarks))
        
        year = int(log.date.split("-")[0])
        emp_years.add((log.emp_id, year))
        
    conn.commit()
    conn.close()
    
    # Recalculate logs triggers
    for emp_id, year in emp_years:
        sync_leave_and_ledger(emp_id, year)
        
    log_audit("Update", "Attendance", f"Bulk logged {len(logs)} attendance roster records.")
    return {"status": "success"}

@app.delete("/api/attendance-log")
def delete_attendance_log(emp_id: int = Query(...), date: str = Query(...)):
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("SELECT count(*) FROM attendance_log WHERE emp_id = ? AND date = ?", (emp_id, date))
        if cursor.fetchone()[0] == 0:
            raise HTTPException(status_code=404, detail="Log entry not found")
        cursor.execute("DELETE FROM attendance_log WHERE emp_id = ? AND date = ?", (emp_id, date))
        conn.commit()
        
        # Recalculate leaves
        year = int(date.split("-")[0])
        sync_leave_and_ledger(emp_id, year)
        log_audit("Delete", "Attendance", f"Deleted attendance log for Employee ID {emp_id} on {date}")
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/attendance-log/range")
def delete_attendance_logs_range(
    start_date: str = Query(...),
    end_date: str = Query(...),
    section_code: Optional[str] = Query(None)
):
    conn = get_db()
    try:
        cursor = conn.cursor()
        if section_code and section_code != 'ALL':
            cursor.execute("""
                SELECT emp_id FROM employees
                WHERE primary_section_id = (SELECT id FROM sections WHERE section_code = ?)
            """, (section_code,))
            affected_emps = [row['emp_id'] for row in cursor.fetchall()]
            if not affected_emps:
                return {"status": "success", "count": 0}
                
            placeholders = ",".join("?" for _ in affected_emps)
            query = f"""
                DELETE FROM attendance_log
                WHERE emp_id IN ({placeholders}) AND date >= ? AND date <= ?
            """
            cursor.execute(query, affected_emps + [start_date, end_date])
        else:
            cursor.execute("SELECT DISTINCT emp_id FROM attendance_log WHERE date >= ? AND date <= ?", (start_date, end_date))
            affected_emps = [row['emp_id'] for row in cursor.fetchall()]
            cursor.execute("DELETE FROM attendance_log WHERE date >= ? AND date <= ?", (start_date, end_date))
        
        conn.commit()
        
        # Recalculate leaves for all affected employees
        year = int(start_date.split("-")[0])
        for emp_id in affected_emps:
            sync_leave_and_ledger(emp_id, year)
            
        log_audit("Delete Range", "Attendance", f"Deleted attendance logs from {start_date} to {end_date} for section {section_code or 'ALL'}")
        return {"status": "success", "count": len(affected_emps)}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

# 9. Special Events (Transfers & Training)
@app.get("/api/special-events")
def read_special_events(section_code: Optional[str] = None):
    conn = get_db()
    query = """
        SELECT ev.* FROM special_events ev
        JOIN employees e ON ev.emp_id = e.emp_id
        LEFT JOIN sections s ON e.primary_section_id = s.id
    """
    if section_code and section_code != 'ALL':
        query += " WHERE s.section_code = ?"
        rows = [dict(row) for row in conn.execute(query, (section_code,)).fetchall()]
    else:
        rows = [dict(row) for row in conn.execute(query).fetchall()]
    conn.close()
    return rows

@app.post("/api/special-events")
def add_special_event(payload: SpecialEventSchema):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO special_events (emp_id, event_type, from_date, to_date, order_number, location, from_section, to_section, signatory_name, signatory_designation)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (payload.emp_id, payload.event_type, payload.from_date, payload.to_date, payload.order_number, payload.location, payload.from_section, payload.to_section, payload.signatory_name, payload.signatory_designation))
    conn.commit()
    conn.close()
    log_audit("Insert", "Special Events", f"Logged event {payload.event_type} for Employee ID {payload.emp_id}")
    return {"id": cursor.lastrowid, **payload.dict()}

@app.delete("/api/special-events/{id}")
def remove_special_event(id: int):
    conn = get_db()
    conn.execute("DELETE FROM special_events WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    log_audit("Delete", "Special Events", f"Deleted event record ID {id}")
    return {"status": "success"}

# 10. Holiday Master
@app.get("/api/holidays")
def read_holidays():
    conn = get_db()
    rows = [dict(row) for row in conn.execute("SELECT * FROM holidays ORDER BY holiday_date ASC").fetchall()]
    conn.close()
    return rows

@app.post("/api/holidays")
def add_holiday(payload: HolidaySchema):
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO holidays (holiday_date, name, holiday_type, applicability)
            VALUES (?, ?, ?, ?)
        """, (payload.holiday_date, payload.name, payload.holiday_type, payload.applicability))
        conn.commit()
        log_audit("Insert", "Holidays", f"Created holiday: {payload.name} ({payload.holiday_date})")
        return {"id": cursor.lastrowid, **payload.dict()}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Holiday date already registered.")
    finally:
        conn.close()

@app.put("/api/holidays/{id}")
def edit_holiday(id: int, payload: HolidaySchema):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
        UPDATE holidays SET holiday_date = ?, name = ?, holiday_type = ?, applicability = ?
        WHERE id = ?
    """, (payload.holiday_date, payload.name, payload.holiday_type, payload.applicability, id))
    conn.commit()
    conn.close()
    log_audit("Update", "Holidays", f"Updated holiday ID {id}: {payload.name}")
    return {"id": id, **payload.dict()}

@app.delete("/api/holidays/{id}")
def remove_holiday(id: int):
    conn = get_db()
    conn.execute("DELETE FROM holidays WHERE id = ?", (id,))
    conn.commit()
    conn.close()
    log_audit("Delete", "Holidays", f"Deleted holiday record ID {id}")
    return {"status": "success"}

# 11. Audit Logs Endpoint
@app.get("/api/audit-logs")
def read_audit_logs():
    conn = get_db()
    logs = [dict(row) for row in conn.execute("SELECT * FROM audit_logs ORDER BY id DESC LIMIT 500").fetchall()]
    conn.close()
    return logs

# 12. Database Backup and Restore
@app.get("/api/backups")
def list_backups():
    files = [f for f in os.listdir(BACKUP_DIR) if f.endswith(".db")]
    files.sort(reverse=True)
    return files

@app.post("/api/backups/create")
def create_backup():
    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"backup_{timestamp}.db"
        dest = os.path.join(BACKUP_DIR, backup_name)
        
        # Verify db integrity check before backing up
        conn = get_db()
        check = conn.execute("PRAGMA integrity_check;").fetchone()[0]
        conn.close()
        
        if check != "ok":
            raise HTTPException(status_code=500, detail="Database integrity check failed. Cannot backup corrupt file.")
            
        shutil.copy2(DB_PATH, dest)
        log_audit("Backup", "System", f"Created database backup snapshot: {backup_name}")
        return {"status": "success", "filename": backup_name}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backup failed: {str(e)}")

@app.post("/api/backups/restore")
def restore_backup(payload: RestoreSchema):
    try:
        src = os.path.join(BACKUP_DIR, payload.filename)
        if not os.path.exists(src):
            raise HTTPException(status_code=404, detail="Backup file not found.")
            
        # Verify backup file integrity
        conn = sqlite3.connect(src)
        check = conn.execute("PRAGMA integrity_check;").fetchone()[0]
        conn.close()
        
        if check != "ok":
            raise HTTPException(status_code=500, detail="Backup file integrity verification failed. Restore aborted.")
            
        # Make a safety backup of current state
        if os.path.exists(DB_PATH):
            shutil.copy2(DB_PATH, os.path.join(BACKUP_DIR, "pre_restore_safety.db"))
        
        # Replace
        shutil.copy2(src, DB_PATH)
        log_audit("Restore", "System", f"Restored database from snapshot: {payload.filename}")
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Restore failed: {str(e)}")

@app.delete("/api/backups/{filename}")
def delete_backup(filename: str):
    try:
        filename = os.path.basename(filename)
        file_path = os.path.join(BACKUP_DIR, filename)
        if not os.path.exists(file_path):
            raise HTTPException(status_code=404, detail="Backup file not found.")
        os.remove(file_path)
        log_audit("Delete Backup", "System", f"Permanently deleted database backup: {filename}")
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Delete backup failed: {str(e)}")

@app.get("/api/backups/status")
def get_backup_status():
    conn = get_db()
    integrity = conn.execute("PRAGMA integrity_check;").fetchone()[0]
    conn.close()
    
    last_backup = "None"
    files = [f for f in os.listdir(BACKUP_DIR) if f.endswith(".db") and f.startswith("backup_")]
    if files:
        files.sort(reverse=True)
        last_backup = files[0]
        
    return {
        "integrity": integrity,
        "last_backup": last_backup,
        "database_size_bytes": os.path.getsize(DB_PATH) if os.path.exists(DB_PATH) else 0
    }


# ==========================================
# --- EXCEL/PDF EXPORT SERVICES ---
# ==========================================

# --- Endpoint 1: Export Night Duty Excel ---
@app.post("/api/export/night-duty/excel")
async def export_night_duty_excel(req: NightDutyExportRequest):
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})
    sheet = workbook.add_worksheet("Night Duty Statement")

    # --- Page Setup ---
    sheet.set_landscape()
    sheet.set_paper(9)  # A4
    sheet.set_margins(0.4, 0.4, 0.5, 0.5)
    sheet.set_header('&C&"Segoe UI,Bold"&10METRO RAILWAY, KOLKATA — SIGNALLING & TELECOMMUNICATION DEPT.')
    sheet.set_footer('&L&8Generated on ' + date.today().strftime('%d.%m.%Y') + '&R&8Page &P of &N')

    # --- Formats ---
    org_title_fmt = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 14, 'bold': True,
        'align': 'center', 'valign': 'vcenter', 'font_color': '#1E3A8A'
    })
    org_sub_fmt = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 10, 'bold': False,
        'align': 'center', 'valign': 'vcenter', 'font_color': '#374151'
    })
    letter_key_fmt = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 10, 'bold': True, 'align': 'left', 'valign': 'vcenter'
    })
    letter_val_fmt = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 10, 'align': 'left', 'valign': 'vcenter'
    })
    sub_banner_fmt = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 11, 'bold': True,
        'align': 'center', 'valign': 'vcenter',
        'bg_color': '#EFF6FF', 'font_color': '#1E3A8A',
        'border': 1, 'border_color': '#BFDBFE'
    })
    header_fmt = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 9, 'bold': True,
        'border': 1, 'border_color': '#CBD5E1',
        'bg_color': '#1E3A8A', 'font_color': '#FFFFFF',
        'align': 'center', 'valign': 'vcenter', 'text_wrap': True
    })
    data_center_fmt = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 9,
        'border': 1, 'border_color': '#E2E8F0',
        'align': 'center', 'valign': 'vcenter', 'text_wrap': True
    })
    data_alt_fmt = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 9,
        'border': 1, 'border_color': '#E2E8F0',
        'bg_color': '#F8FAFC',
        'align': 'center', 'valign': 'vcenter', 'text_wrap': True
    })
    name_fmt = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 9, 'bold': True,
        'border': 1, 'border_color': '#E2E8F0',
        'align': 'left', 'valign': 'vcenter'
    })
    name_alt_fmt = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 9, 'bold': True,
        'border': 1, 'border_color': '#E2E8F0',
        'bg_color': '#F8FAFC',
        'align': 'left', 'valign': 'vcenter'
    })
    wt_fmt = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 9, 'bold': True,
        'border': 1, 'border_color': '#E2E8F0',
        'bg_color': '#EFF6FF', 'font_color': '#1D4ED8',
        'align': 'center', 'valign': 'vcenter'
    })
    nil_fmt = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 9, 'italic': True,
        'border': 1, 'border_color': '#E2E8F0',
        'font_color': '#94A3B8', 'align': 'center', 'valign': 'vcenter'
    })
    sig_fmt = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 10, 'bold': True,
        'align': 'center', 'valign': 'vcenter',
        'top': 2, 'top_color': '#1E3A8A',
        'text_wrap': True
    })
    total_label_fmt = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 9, 'bold': True,
        'border': 1, 'border_color': '#CBD5E1',
        'bg_color': '#F1F5F9', 'font_color': '#1E3A8A',
        'align': 'right', 'valign': 'vcenter'
    })
    total_val_fmt = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 9, 'bold': True,
        'border': 1, 'border_color': '#CBD5E1',
        'bg_color': '#F1F5F9', 'font_color': '#1E3A8A',
        'align': 'center', 'valign': 'vcenter'
    })

    # --- Column Widths ---
    # Cols: SL | PF | Name | Desig | Level | Dates | Total Days | Total Hours | Weightage Hrs | Weightage Mins | Remarks
    widths = [4, 16, 28, 14, 7, 60, 10, 12, 12, 12, 16]
    for col_idx, w in enumerate(widths):
        sheet.set_column(col_idx, col_idx, w)

    # ====== SECTION A: LETTERHEAD ======
    sheet.set_row(0, 30)
    sheet.merge_range(0, 0, 0, 10, "METRO RAILWAY, KOLKATA", org_title_fmt)
    sheet.set_row(1, 18)
    sheet.merge_range(1, 0, 1, 10, "Office of the Senior Divisional Signal & Telecommunication Engineer", org_sub_fmt)
    # Separator row
    sheet.set_row(2, 6)

    # ====== SECTION B: LETTER HEADER ======
    sheet.set_row(3, 18)
    sheet.write(3, 0, "No:", letter_key_fmt)
    sheet.merge_range(3, 1, 3, 4, req.ref_no, letter_val_fmt)
    sheet.write(3, 8, "Date:", letter_key_fmt)
    sheet.merge_range(3, 9, 3, 10, req.date_str, letter_val_fmt)

    sheet.set_row(4, 15)
    sheet.write(4, 0, "To,", letter_val_fmt)
    sheet.set_row(5, 15)
    sheet.merge_range(5, 0, 5, 10, f"The {req.signatory_right}, Metro Railway, Kolkata", letter_val_fmt)

    # ====== SECTION C: SUBJECT LINE ======
    sheet.set_row(6, 8)  # Small gap
    sheet.set_row(7, 30)
    sheet.merge_range(7, 0, 7, 10,
        f"Sub:  Night Duty Allowance Statement of Signal Staff (S&T Dept.) for the Month of {req.month_name}",
        sub_banner_fmt)
    sheet.set_row(8, 20)
    sheet.merge_range(8, 0, 8, 10,
        f"Ref:  Bill Unit No. {req.bill_unit}  |  Section: {req.section_name}",
        sub_banner_fmt)

    # ====== SECTION D: TABLE HEADERS ======
    sheet.set_row(9, 8)  # Gap row
    sheet.set_row(10, 20)
    sheet.set_row(11, 20)
    
    sheet.merge_range(10, 0, 11, 0, "SL\nNo.", header_fmt)
    sheet.merge_range(10, 1, 11, 1, "P.F. No.", header_fmt)
    sheet.merge_range(10, 2, 11, 2, "Name of Staff", header_fmt)
    sheet.merge_range(10, 3, 11, 3, "Designation", header_fmt)
    sheet.merge_range(10, 4, 11, 4, "Pay\nLevel", header_fmt)
    sheet.merge_range(10, 5, 11, 5, f"Dates of Night Duty\n({req.month_name})", header_fmt)
    sheet.merge_range(10, 6, 11, 6, "Total\nDays", header_fmt)
    sheet.merge_range(10, 7, 11, 7, "Total\nHours", header_fmt)
    
    # Horizontally merged header for Weightage
    sheet.merge_range(10, 8, 10, 9, "Weightage Time", header_fmt)
    sheet.write(11, 8, "Hrs", header_fmt)
    sheet.write(11, 9, "Mins", header_fmt)
    
    sheet.merge_range(10, 10, 11, 10, "Remarks", header_fmt)

    # ====== SECTION E: TABLE DATA ======
    nd_rows_with_data = 0
    current_row = 12
    for idx, row in enumerate(req.rows):
        is_alt = idx % 2 == 1
        d_fmt = data_alt_fmt if is_alt else data_center_fmt
        n_fmt = name_alt_fmt if is_alt else name_fmt
        
        wt_hrs_val, wt_mins_val = calculate_weightage_numeric(row.total_days)
        total_hrs = row.total_days * 8
        has_dates = row.dates and row.dates.strip()
        
        # Estimate number of lines needed for the Dates string
        dates_str = row.dates or ""
        # Width of col 5 is 60. Segoe UI 9pt can fit about 1.4 characters per unit of width.
        # So width 60 fits about 84 characters in one line. Let's use ~80 characters per line safety limit.
        lines_needed = max(1, (len(dates_str) + 75) // 80)
        row_height = max(22, lines_needed * 14 + 6)
        
        sheet.set_row(current_row, row_height)
        sheet.write(current_row, 0, row.sl, d_fmt)
        sheet.write(current_row, 1, row.pf_number, d_fmt)
        sheet.write(current_row, 2, row.name, n_fmt)
        sheet.write(current_row, 3, row.designation, d_fmt)
        sheet.write(current_row, 4, row.level, d_fmt)
        
        # Dates with Nil for empty
        if has_dates:
            sheet.write(current_row, 5, row.dates, d_fmt)
            sheet.write(current_row, 6, row.total_days, d_fmt)
            sheet.write(current_row, 7, total_hrs, d_fmt)
            sheet.write(current_row, 8, wt_hrs_val, wt_fmt)
            sheet.write(current_row, 9, wt_mins_val, wt_fmt)
            nd_rows_with_data += 1
        else:
            sheet.write(current_row, 5, "Nil", nil_fmt)
            sheet.write(current_row, 6, 0, d_fmt)
            sheet.write(current_row, 7, 0, d_fmt)
            sheet.write(current_row, 8, "—", d_fmt)
            sheet.write(current_row, 9, "—", d_fmt)
        
        sheet.write(current_row, 10, row.remarks or "", d_fmt)
        current_row += 1

    # ====== SECTION F: TOTALS ROW ======
    sheet.set_row(current_row, 22)
    total_days_sum = sum(r.total_days for r in req.rows)
    total_hrs_sum = total_days_sum * 8
    sheet.merge_range(current_row, 0, current_row, 5, "TOTAL", total_label_fmt)
    sheet.write(current_row, 6, total_days_sum, total_val_fmt)
    sheet.write(current_row, 7, total_hrs_sum, total_val_fmt)
    wt_total_hrs_val, wt_total_mins_val = calculate_weightage_numeric(total_days_sum)
    sheet.write(current_row, 8, wt_total_hrs_val, total_val_fmt)
    sheet.write(current_row, 9, wt_total_mins_val, total_val_fmt)
    sheet.write(current_row, 10, f"{nd_rows_with_data} staff on night duty", total_label_fmt)
    current_row += 1

    # ====== SECTION G: SIGNATURES ======
    sheet.set_row(current_row, 8)
    current_row += 1
    sheet.set_row(current_row, 8)
    current_row += 1
    sheet.set_row(current_row, 8)
    sig_row = current_row + 3
    sheet.set_row(sig_row, 45)
    sheet.merge_range(sig_row, 0, sig_row, 3, req.signatory_left, sig_fmt)
    sheet.merge_range(sig_row, 7, sig_row, 10, f"For {req.signatory_right}", sig_fmt)
    sheet.set_row(sig_row + 1, 16)
    sheet.merge_range(sig_row + 1, 0, sig_row + 1, 3, "S&T Dept., Metro Railway, Kolkata",
                      workbook.add_format({'font_name': 'Segoe UI', 'font_size': 9, 'align': 'center', 'font_color': '#64748B'}))
    sheet.merge_range(sig_row + 1, 7, sig_row + 1, 10, "Metro Railway, Kolkata",
                      workbook.add_format({'font_name': 'Segoe UI', 'font_size': 9, 'align': 'center', 'font_color': '#64748B'}))

    workbook.close()
    output.seek(0)
    
    filename = f"Night_Duty_{req.section_code}_{req.month_name}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )

# --- Endpoint 2: Export Night Duty PDF ---
@app.post("/api/export/night-duty/pdf")
async def export_night_duty_pdf(req: NightDutyExportRequest):
    pdf_buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        pdf_buffer,
        pagesize=landscape(A4),
        rightMargin=36,
        leftMargin=36,
        topMargin=54,
        bottomMargin=54
    )

    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'DocTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        leading=14,
        alignment=1, # Center
        textColor=colors.HexColor("#1B365D")
    )
    normal_style = ParagraphStyle(
        'DocNormal',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=9,
        leading=11
    )
    bold_style = ParagraphStyle(
        'DocBold',
        parent=normal_style,
        fontName='Helvetica-Bold'
    )
    header_style = ParagraphStyle(
        'TableHeader',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=9,
        leading=11,
        alignment=1, # Center
        textColor=colors.white
    )

    story = []

    # Title Banner
    story.append(Paragraph("METRO RAILWAY, KOLKATA", title_style))
    story.append(Paragraph("SIGNALLING & TELECOMMUNICATION DEPARTMENT", ParagraphStyle('DocSubTitle', parent=title_style, fontSize=10)))
    story.append(Spacer(1, 15))

    # Details Block
    details_data = [
        [Paragraph(f"<b>No:</b> {req.ref_no}", normal_style), Paragraph(f"<b>Date:</b> {req.date_str}", normal_style)],
        [Paragraph("<b>To,</b>", normal_style), ""],
        [Paragraph(f"The {req.signatory_right},", normal_style), ""],
        [Paragraph("Metro Railway, Kolkata", normal_style), ""]
    ]
    details_table = Table(details_data, colWidths=[400, 350])
    details_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('SPAN', (0,1), (1,1)),
        ('SPAN', (0,2), (1,2)),
        ('SPAN', (0,3), (1,3)),
    ]))
    story.append(details_table)
    story.append(Spacer(1, 15))

    # Subject line
    story.append(Paragraph(f"<b>Sub:</b> Night Duty Statement of Signal Staffs of S&T Deptt. for the Month of <b>{req.month_name}</b>", normal_style))
    story.append(Paragraph(f"<b>Ref:</b> Bill Unit No. {req.bill_unit}", normal_style))
    story.append(Spacer(1, 10))

    # Table Grid
    table_headers = [
        Paragraph("SL", header_style),
        Paragraph("P.F. No.", header_style),
        Paragraph("Name of Staff", header_style),
        Paragraph("Desig", header_style),
        Paragraph("Level", header_style),
        Paragraph(f"Date of Night Duty in {req.month_name}", header_style),
        Paragraph("Total Days", header_style),
        Paragraph("Total Hours", header_style),
        Paragraph("Weightage Hrs", header_style),
        Paragraph("Weightage Mins", header_style),
        Paragraph("Remarks", header_style)
    ]
    
    table_data = [table_headers]
    for row in req.rows:
        wt_hrs, wt_mins = calculate_weightage(row.total_days)
        tot_hrs = row.total_days * 8
        has_dates = row.dates and row.dates.strip()
        table_data.append([
            Paragraph(str(row.sl), normal_style),
            Paragraph(row.pf_number, normal_style),
            Paragraph(row.name, normal_style),
            Paragraph(row.designation, normal_style),
            Paragraph(str(row.level), normal_style),
            Paragraph(row.dates or "Nil", normal_style),
            Paragraph(str(row.total_days), normal_style),
            Paragraph(f"{tot_hrs} Hrs", normal_style),
            Paragraph(str(wt_hrs) if has_dates else "—", normal_style),
            Paragraph(str(wt_mins) if has_dates else "—", normal_style),
            Paragraph(row.remarks or "", normal_style)
        ])

    grid_table = Table(table_data, colWidths=[20, 75, 105, 60, 35, 210, 40, 45, 45, 45, 90])
    t_style = [
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1B365D")),
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('ALIGN', (2,1), (2,-1), 'LEFT'), # Left align names
        ('BOTTOMPADDING', (0,0), (-1,0), 6),
        ('TOPPADDING', (0,0), (-1,0), 6),
    ]
    for r_idx in range(1, len(table_data)):
        row_bg = colors.HexColor("#F8FAFC") if r_idx % 2 == 1 else colors.white
        t_style.append(('BACKGROUND', (0, r_idx), (-1, r_idx), row_bg))
        
    grid_table.setStyle(TableStyle(t_style))
    story.append(grid_table)
    story.append(Spacer(1, 30))

    # Signature blocks
    sig_data = [
        [Paragraph(f"<b>{req.signatory_left}</b>", normal_style), Paragraph(f"<b>For {req.signatory_right}</b>", ParagraphStyle('RightSig', parent=normal_style, alignment=2))],
        ["S&T Dept., Metro Railway, Kolkata", "Metro Railway, Kolkata"]
    ]
    sig_table = Table(sig_data, colWidths=[400, 370])
    story.append(sig_table)

    doc.build(story, canvasmaker=NumberedCanvas)
    pdf_buffer.seek(0)
    
    filename = f"Night_Duty_{req.section_code}_{req.month_name}.pdf"
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )

# --- Endpoint 3: Export Attendance Sheet Excel ---
@app.post("/api/export/attendance/excel")
async def export_attendance_excel(req: AttendanceExportRequest):
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})
    sheet = workbook.add_worksheet("Attendance")

    # Layout Setup
    sheet.set_landscape()
    sheet.set_paper(9) # A4
    sheet.set_margins(0.3, 0.3, 0.3, 0.3)

    # Styles
    title_format = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 14, 'bold': True, 'align': 'center', 'valign': 'vcenter', 'font_color': '#1E3A8A'
    })
    subtitle_format = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 11, 'bold': True, 'align': 'center', 'valign': 'vcenter'
    })
    sig_format = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 10, 'bold': True, 'align': 'center', 'valign': 'vcenter', 'text_wrap': True
    })
    meta_format = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 10, 'align': 'center', 'valign': 'vcenter'
    })
    header_format = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 9, 'bold': True, 'border': 1, 'bg_color': '#F1F5F9', 'align': 'center', 'valign': 'vcenter'
    })
    data_format = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 9, 'border': 1, 'align': 'center', 'valign': 'vcenter'
    })
    name_pf_format = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 9, 'border': 1, 'align': 'center', 'valign': 'vcenter', 'text_wrap': True
    })
    
    # CR rich text elements formats (bg_color is inherited from parent cell_format in write_rich_string)
    cr_text_fmt = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 9, 'bold': True, 'font_color': '#1D4ED8'
    })
    cr_date_fmt = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 7, 'bold': False, 'font_color': '#1D4ED8'
    })
    
    # Conditional formatting color registers
    sunday_format = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 9, 'border': 1, 'align': 'center', 'valign': 'vcenter', 'bg_color': '#FEE2E2', 'font_color': '#991B1B'
    })
    holiday_format = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 9, 'border': 1, 'align': 'center', 'valign': 'vcenter', 'bg_color': '#FEF3C7', 'font_color': '#92400E'
    })

    # Soft dynamic styles for roster codes
    pn_format = workbook.add_format({'font_name': 'Segoe UI', 'font_size': 9, 'border': 1, 'align': 'center', 'valign': 'vcenter', 'bg_color': '#F3E8FF', 'font_color': '#7E22CE', 'bold': True, 'text_wrap': True})
    r_format = workbook.add_format({'font_name': 'Segoe UI', 'font_size': 9, 'border': 1, 'align': 'center', 'valign': 'vcenter', 'bg_color': '#F1F5F9', 'font_color': '#64748B', 'text_wrap': True})
    cr_format = workbook.add_format({'font_name': 'Segoe UI', 'font_size': 9, 'border': 1, 'align': 'center', 'valign': 'vcenter', 'bg_color': '#EFF6FF', 'font_color': '#1D4ED8', 'bold': True, 'text_wrap': True})
    cl_format = workbook.add_format({'font_name': 'Segoe UI', 'font_size': 9, 'border': 1, 'align': 'center', 'valign': 'vcenter', 'bg_color': '#FFFBEB', 'font_color': '#B45309', 'bold': True, 'text_wrap': True})
    lap_format = workbook.add_format({'font_name': 'Segoe UI', 'font_size': 9, 'border': 1, 'align': 'center', 'valign': 'vcenter', 'bg_color': '#FFF7ED', 'font_color': '#C2410C', 'bold': True, 'text_wrap': True})
    sick_format = workbook.add_format({'font_name': 'Segoe UI', 'font_size': 9, 'border': 1, 'align': 'center', 'valign': 'vcenter', 'bg_color': '#FEF2F2', 'font_color': '#B91C1C', 'bold': True, 'text_wrap': True})
    scl_format = workbook.add_format({'font_name': 'Segoe UI', 'font_size': 9, 'border': 1, 'align': 'center', 'valign': 'vcenter', 'bg_color': '#FFF1F2', 'font_color': '#BE123C', 'bold': True, 'text_wrap': True})
    ph_format = workbook.add_format({'font_name': 'Segoe UI', 'font_size': 9, 'border': 1, 'align': 'center', 'valign': 'vcenter', 'bg_color': '#FEF9C3', 'font_color': '#A16207', 'bold': True, 'text_wrap': True})
    custom_format = workbook.add_format({'font_name': 'Segoe UI', 'font_size': 9, 'border': 1, 'align': 'center', 'valign': 'vcenter', 'bg_color': '#E6FFFA', 'font_color': '#047487', 'bold': True, 'text_wrap': True})

    # 1. Header Information (spans A to AI, since we combine Name & PF into 1 col)
    sheet.merge_range("A1:AI1", "METRO RAILWAY, KOLKATA", title_format)
    sheet.merge_range("A2:AI2", f"ATTENDANCE SHEET OF SIGNAL DEPARTMENT ({req.section_name.upper()}) — For the Period from {req.period_start} to {req.period_end}", subtitle_format)

    # 2. Setup Columns & Headers (2 header rows: Row 3 & Row 4 / Index 2 & Index 3)
    sheet.merge_range("A3:A4", "SL", header_format)
    sheet.merge_range("B3:B4", "Name of Staff / P.F. No.", header_format)
    sheet.merge_range("C3:C4", "Designation", header_format)

    # Column widths
    sheet.set_column(0, 0, 4)   # SL
    sheet.set_column(1, 1, 26)  # Name / PF
    sheet.set_column(2, 2, 16)  # Designation

    # Set cell sizes for dates (31 columns: index 3 to 33)
    for c in range(3, 34):
        sheet.set_column(c, c, 6.0)
    sheet.set_column(34, 34, 28) # Remarks (index 34)

    # Days arrays
    days_in_grid = req.rows[0].days if req.rows else []
    
    # Write dates (11, 12, etc.) and weekdays (Mon, Tue, etc.)
    for d_idx, day_obj in enumerate(days_in_grid):
        col_c = 3 + d_idx
        # Date number written in Row 3 (index 2)
        sheet.write(2, col_c, day_obj.day, header_format)
        # Weekday written in Row 4 (index 3)
        sheet.write(3, col_c, day_obj.weekday, header_format)

    sheet.merge_range("AI3:AI4", "Remarks / Special Events", header_format)

    # 3. Write Data
    curr_row = 4
    for emp_idx, emp in enumerate(req.rows):
        sheet.set_row(curr_row, 35) # Row height set to 35 to cleanly fit name/PF and custom code/order details
        sheet.write(curr_row, 0, emp.sl, data_format)
        
        # Combined Name & PF
        name_pf_text = f"{emp.name}\n(PF: {emp.pf_number})"
        sheet.write(curr_row, 1, name_pf_text, name_pf_format)
        
        sheet.write(curr_row, 2, emp.designation, data_format)
        
        # Compute spans for leaves & rest
        spans = []
        n = len(emp.days)
        i = 0
        while i < n:
            status = emp.days[i].status
            start_idx = i
            while i < n - 1 and emp.days[i+1].status == status:
                i += 1
            end_idx = i
            spans.append((start_idx, end_idx, status))
            i += 1

        for start_idx, end_idx, status in spans:
            start_col = 3 + start_idx
            end_col = 3 + end_idx
            val = status
            
            # Select format based on status code
            if val == 'P/N':
                cell_format = pn_format
            elif val == 'R':
                cell_format = r_format
            elif val == 'CR':
                cell_format = cr_format
            elif val == 'CL':
                cell_format = cl_format
            elif val == 'LAP':
                cell_format = lap_format
            elif val == 'Sick':
                cell_format = sick_format
            elif val == 'SCL':
                cell_format = scl_format
            elif val == 'PH':
                cell_format = ph_format
            elif val not in ('P', '', None):
                cell_format = custom_format
            elif emp.days[start_idx].weekday == "Sun":
                cell_format = sunday_format
            elif emp.days[start_idx].is_holiday:
                cell_format = holiday_format
            else:
                cell_format = data_format

            # If it's a default/empty/present or CR, write individually to avoid merging Present/CR status
            if val in ('P', 'CR', '', None):
                for col_idx in range(start_col, end_col + 1):
                    day_obj = emp.days[col_idx - 3]
                    day_format = cell_format if val == 'CR' else data_format
                    
                    if val == 'CR':
                        display_val = 'CR'
                        has_rich = False
                        if day_obj.remarks and "CR_EARNED_DATE:" in day_obj.remarks:
                            edate = day_obj.remarks.split("CR_EARNED_DATE:")[1].strip()[:10]
                            try:
                                dt = datetime.strptime(edate, "%Y-%m-%d")
                                date_str = dt.strftime('%d.%m')
                                cell_format.set_text_wrap()
                                sheet.write_rich_string(curr_row, col_idx, cr_text_fmt, 'CR\n', cr_date_fmt, date_str, cell_format)
                                has_rich = True
                            except Exception:
                                pass
                        if not has_rich:
                            sheet.write(curr_row, col_idx, display_val, day_format)
                    else:
                        if day_obj.weekday == "Sun":
                            day_format = sunday_format
                        elif day_obj.is_holiday:
                            day_format = holiday_format
                        sheet.write(curr_row, col_idx, val, day_format)
            else:
                # Merge consecutive identical status cells (e.g. Sick, CL, R)
                order_text = emp.days[start_idx].remarks
                display_val = val
                # Format custom codes as Code\n(Order) if order/remarks exist
                if val not in ('CL', 'LAP', 'Sick', 'SCL', 'PH', 'R', 'P/N') and order_text:
                    display_val = f"{val}\n({order_text})"
                
                if start_col == end_col:
                    sheet.write(curr_row, start_col, display_val, cell_format)
                else:
                    sheet.merge_range(curr_row, start_col, curr_row, end_col, display_val, cell_format)
            
        sheet.write(curr_row, 34, emp.remarks, data_format)
        curr_row += 1

    # 4. Signatures
    sig_row = curr_row + 3
    sheet.set_row(sig_row, 40)
    sig_left_format = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 10, 'bold': True, 'align': 'left', 'valign': 'top', 'text_wrap': True
    })
    sig_right_format = workbook.add_format({
        'font_name': 'Segoe UI', 'font_size': 10, 'bold': True, 'align': 'right', 'valign': 'top', 'text_wrap': True
    })
    sheet.merge_range(sig_row, 1, sig_row, 3, req.signatory_left, sig_left_format)
    sheet.merge_range(sig_row, 28, sig_row, 34, f"For {req.signatory_right}", sig_right_format)

    workbook.close()
    output.seek(0)
    
    filename = f"Attendance_Sheet_{req.section_code}_{req.period_start}_{req.period_end}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )

# --- Endpoint 4: Export Attendance PDF ---
@app.post("/api/export/attendance/pdf")
async def export_attendance_pdf(req: AttendanceExportRequest):
    pdf_buffer = io.BytesIO()
    
    # Needs landscape and centered margins to fit 31 columns of attendance
    doc = SimpleDocTemplate(
        pdf_buffer,
        pagesize=landscape(A4),
        rightMargin=56,
        leftMargin=56,
        topMargin=36,
        bottomMargin=36
    )

    styles = getSampleStyleSheet()
    
    title_style = ParagraphStyle(
        'AttTitle',
        parent=styles['Normal'],
        fontName='Helvetica-Bold',
        fontSize=12,
        alignment=1,
        textColor=colors.HexColor("#1B365D")
    )
    
    meta_style = ParagraphStyle(
        'AttMeta',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=8,
        alignment=1
    )

    cell_style = ParagraphStyle(
        'AttCell',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=5.5,
        leading=6.5,
        alignment=1,
        textColor=colors.HexColor('#0F172A')
    )
    
    cell_bold_style = ParagraphStyle(
        'AttCellBold',
        parent=cell_style,
        fontName='Helvetica-Bold',
        fontSize=5.5,
        leading=6.5,
        textColor=colors.HexColor('#0F172A')
    )

    day_header_style = ParagraphStyle(
        'AttDayHeader',
        parent=cell_bold_style,
        fontSize=5.5,
        leading=6
    )

    att_header_text_style = ParagraphStyle(
        'AttTableHeaderText',
        parent=cell_bold_style,
        textColor=colors.white
    )

    att_day_header_text_style = ParagraphStyle(
        'AttTableDayHeaderText',
        parent=day_header_style,
        textColor=colors.white
    )

    name_style = ParagraphStyle(
        'AttName',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7,
        leading=8
    )

    name_pf_style = ParagraphStyle(
        'AttNamePF',
        parent=styles['Normal'],
        fontName='Helvetica',
        fontSize=7,
        leading=8.5,
        alignment=1 # Center
    )

    story = []

    story.append(Paragraph("METRO RAILWAY, KOLKATA", title_style))
    story.append(Paragraph(f"ATTENDANCE SHEET OF SIGNAL DEPARTMENT ({req.section_name.upper()}) — For the Period from {req.period_start} to {req.period_end}", ParagraphStyle('AttSub', parent=title_style, fontSize=10)))
    story.append(Spacer(1, 10))

    # Table headers (Name and PF combined in column 2)
    header_row_1 = [
        Paragraph("<b>SL</b>", att_header_text_style),
        Paragraph("<b>Name of Staff / P.F. No.</b>", att_header_text_style),
        Paragraph("<b>Designation</b>", att_header_text_style)
    ]
    
    days_in_grid = req.rows[0].days if req.rows else []
    for day in days_in_grid:
        header_row_1.append(Paragraph(f"<b>{day.day}</b><br/>{day.weekday[0]}", att_day_header_text_style))
        
    header_row_1.append(Paragraph("<b>Remarks</b>", att_header_text_style))

    table_data = [header_row_1]

    # Construct grid styles, highlight sundays in table style backgrounds
    t_style = [
        ('GRID', (0,0), (-1,-1), 0.5, colors.HexColor("#CBD5E1")),
        ('BACKGROUND', (0,0), (-1,0), colors.HexColor("#1B365D")),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('ALIGN', (1,1), (1,-1), 'CENTER'), # Center Name/PF
        ('BOTTOMPADDING', (0,0), (-1,-1), 1.5),
        ('TOPPADDING', (0,0), (-1,-1), 1.5),
        ('LEFTPADDING', (0,0), (-1,-1), 1),
        ('RIGHTPADDING', (0,0), (-1,-1), 1),
    ]

    # Apply alternating background color for rows (excluding Sunday/Holiday day cols)
    for r_idx in range(1, len(req.rows) + 1):
        row_bg = colors.HexColor("#F8FAFC") if r_idx % 2 == 1 else colors.white
        t_style.append(('BACKGROUND', (0, r_idx), (2, r_idx), row_bg))
        t_style.append(('BACKGROUND', (-1, r_idx), (-1, r_idx), row_bg))

    # Color Sundays columns dynamically (starting at index 3 and row 1 to preserve header background)
    for d_idx, day in enumerate(days_in_grid):
        if day.weekday == "Sun":
            col_c = 3 + d_idx
            t_style.append(('BACKGROUND', (col_c, 1), (col_c, -1), colors.HexColor("#FEE2E2")))
        elif day.is_holiday:
            col_c = 3 + d_idx
            t_style.append(('BACKGROUND', (col_c, 1), (col_c, -1), colors.HexColor("#FEF3C7")))

    # Fill data & build SPAN merges for consecutive leave/rest days
    for r_idx, row in enumerate(req.rows):
        row_num = r_idx + 1
        name_pf_html = f"<b>{row.name}</b><br/><font size=5.5 color='#4A5568'>PF: {row.pf_number}</font>"
        
        data_line = [
            Paragraph(str(row.sl), cell_style),
            Paragraph(name_pf_html, name_pf_style),
            Paragraph(row.designation, cell_style)
        ]
        
        # Spans logic
        spans = []
        n = len(row.days)
        i = 0
        while i < n:
            status = row.days[i].status
            start_idx = i
            while i < n - 1 and row.days[i+1].status == status:
                i += 1
            end_idx = i
            spans.append((start_idx, end_idx, status))
            i += 1
            
        day_cells = [None] * len(days_in_grid)
        for start_idx, end_idx, status in spans:
            # Merging consecutive identical statuses except P, CR, empty
            should_merge = status not in ('P', 'CR', '', None) and start_idx < end_idx
            
            if should_merge:
                order = row.days[start_idx].remarks
                if status not in ('CL', 'LAP', 'Sick', 'SCL', 'PH', 'R', 'P/N') and order:
                    status_html = f"<b>{status}</b><br/><font size=4>{order}</font>"
                else:
                    status_html = f"<b>{status}</b>"
                day_cells[start_idx] = Paragraph(status_html, cell_bold_style)
                for idx in range(start_idx + 1, end_idx + 1):
                    day_cells[idx] = ""
                # Span indices shifted left by 1: starts at 3
                t_style.append(('SPAN', (3 + start_idx, row_num), (3 + end_idx, row_num)))
            else:
                for idx in range(start_idx, end_idx + 1):
                    val = row.days[idx].status
                    day_obj = row.days[idx]
                    
                    display_html = val
                    if val == 'CR' and day_obj.remarks:
                        if "CR_EARNED_DATE:" in day_obj.remarks:
                            edate = day_obj.remarks.split("CR_EARNED_DATE:")[1].strip()[:10]
                            try:
                                dt = datetime.strptime(edate, "%Y-%m-%d")
                                display_html = f"<b>CR</b><br/><font size=4 color='#1D4ED8'>{dt.strftime('%d.%m')}</font>"
                            except Exception:
                                display_html = f"<b>{val}</b>"
                        else:
                            display_html = f"<b>{val}</b>"
                    elif val in ('R', 'Sick', 'CL', 'LAP', 'SCL', 'PH', 'P/N'):
                        display_html = f"<b>{val}</b>"
                    elif val not in ('P', '', None):
                        if day_obj.remarks:
                            display_html = f"<b>{val}</b><br/><font size=4>{day_obj.remarks}</font>"
                        else:
                            display_html = f"<b>{val}</b>"
                        
                    day_cells[idx] = Paragraph(display_html, cell_bold_style if val not in ('P', '', None) else cell_style)
                    
        for val in day_cells:
            data_line.append(val)
            
        data_line.append(Paragraph(row.remarks or "", cell_style))
        table_data.append(data_line)

        # Apply coloring to individual/span cells
        for d_idx, day in enumerate(row.days):
            col_c = 3 + d_idx
            val = day.status
            color_map = {
                'P/N': '#F3E8FF',
                'R': '#F1F5F9',
                'CR': '#EFF6FF',
                'CL': '#FFFBEB',
                'LAP': '#FFF7ED',
                'Sick': '#FEF2F2',
                'SCL': '#FFF1F2',
                'PH': '#FEF9C3',
            }
            if val in color_map:
                t_style.append(('BACKGROUND', (col_c, row_num), (col_c, row_num), colors.HexColor(color_map[val])))
            elif val not in ('P', '', None):
                t_style.append(('BACKGROUND', (col_c, row_num), (col_c, row_num), colors.HexColor('#E6FFFA')))

    # Printable area centered with margins
    # Total width for landscape A4 = 841.89 - 56*2 = 729.89pt
    # col widths safely within boundaries to avoid page overflow:
    col_widths = [14, 90, 60] + [15] * len(days_in_grid) + [45]
    total_table_width = 14 + 90 + 60 + (15 * len(days_in_grid)) + 45
    
    grid_table = Table(table_data, colWidths=col_widths, repeatRows=1)
    grid_table.setStyle(TableStyle(t_style))
    story.append(grid_table)
    story.append(Spacer(1, 15))
 
    # Signatures aligned dynamically to match total grid table width
    sig_left_text = req.signatory_left.replace('\n', '<br/>')
    sig_right_text = f"For {req.signatory_right}".replace('\n', '<br/>')
    
    sig_data = [
        [Paragraph(f"<b>{sig_left_text}</b>", ParagraphStyle('LeftSigP', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8, leading=10, alignment=0)),
         Paragraph(f"<b>{sig_right_text}</b>", ParagraphStyle('RightSigP', parent=styles['Normal'], fontName='Helvetica-Bold', fontSize=8, leading=10, alignment=2))],
        [Paragraph("S&T Dept., Metro Railway, Kolkata", ParagraphStyle('LeftSigSub', parent=styles['Normal'], fontName='Helvetica', fontSize=7.5, leading=9, alignment=0, textColor=colors.HexColor("#4A5568"))),
         Paragraph("Metro Railway, Kolkata", ParagraphStyle('RightSigSub', parent=styles['Normal'], fontName='Helvetica', fontSize=7.5, leading=9, alignment=2, textColor=colors.HexColor("#4A5568")))]
    ]
    sig_col_width = total_table_width / 2.0
    sig_table = Table(sig_data, colWidths=[sig_col_width, sig_col_width])
    sig_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('TOPPADDING', (0,0), (-1,-1), 2),
    ]))
    story.append(sig_table)

    doc.build(story, canvasmaker=NumberedCanvas)
    pdf_buffer.seek(0)
    
    filename = f"Attendance_Sheet_{req.section_code}_{req.period_start}_{req.period_end}.pdf"
    return StreamingResponse(
        pdf_buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"inline; filename={filename}"}
    )

# --- Traveling Allowance Pydantic Schemas & Endpoints ---
class TAEntrySchema(BaseModel):
    id: Optional[int] = None
    entry_date: str
    train_no: Optional[str] = ""
    time_left: Optional[str] = ""
    time_arrived: Optional[str] = ""
    station_from: Optional[str] = ""
    station_to: Optional[str] = ""
    is_stay: Optional[int] = 0
    stay_details: Optional[str] = ""
    days_nights: Optional[str] = ""
    object_journey: Optional[str] = ""
    rate: int
    amount: int

class TABillSchema(BaseModel):
    id: Optional[int] = None
    emp_id: int
    month_year: str
    journey_type: str
    book_no: Optional[str] = ""
    page_no: Optional[str] = ""
    serial_no_from: Optional[str] = ""
    serial_no_to: Optional[str] = ""
    bill_unit: Optional[str] = ""
    basic_pay: Optional[int] = 0
    entries: List[TAEntrySchema]

@app.get("/api/ta-bills")
def get_ta_bills(section_code: Optional[str] = None):
    conn = get_db()
    query = """
        SELECT b.*, e.name as emp_name, e.pf_number, e.designation, e.level
        FROM ta_bills b
        JOIN employees e ON b.emp_id = e.emp_id
        LEFT JOIN sections s ON e.primary_section_id = s.id
    """
    params = []
    if section_code and section_code != 'ALL':
        query += " WHERE s.section_code = ?"
        params.append(section_code)
    
    query += " ORDER BY b.month_year DESC, b.id DESC"
    rows = conn.execute(query, params).fetchall()
    
    bills = []
    for row in rows:
        b = dict(row)
        total_amount = conn.execute("SELECT SUM(amount) FROM ta_entries WHERE bill_id = ?", (b['id'],)).fetchone()[0] or 0
        b['total_amount'] = total_amount
        bills.append(b)
        
    conn.close()
    return bills

@app.get("/api/ta-bills/{id}")
def get_ta_bill(id: int):
    conn = get_db()
    row = conn.execute("""
        SELECT b.*, e.name as emp_name, e.pf_number, e.designation, e.level
        FROM ta_bills b
        JOIN employees e ON b.emp_id = e.emp_id
        WHERE b.id = ?
    """, (id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="TA Bill not found")
    
    bill = dict(row)
    entries = [dict(r) for r in conn.execute("SELECT * FROM ta_entries WHERE bill_id = ? ORDER BY id ASC", (id,)).fetchall()]
    bill['entries'] = entries
    conn.close()
    return bill

@app.post("/api/ta-bills")
def create_ta_bill(payload: TABillSchema):
    conn = get_db()
    cursor = conn.cursor()
    try:
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        cursor.execute("""
            INSERT INTO ta_bills (emp_id, month_year, journey_type, book_no, page_no, serial_no_from, serial_no_to, bill_unit, basic_pay, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (payload.emp_id, payload.month_year, payload.journey_type, payload.book_no, payload.page_no, payload.serial_no_from, payload.serial_no_to, payload.bill_unit or "", payload.basic_pay or 0, now_str))
        bill_id = cursor.lastrowid
        
        for entry in payload.entries:
            cursor.execute("""
                INSERT INTO ta_entries (bill_id, entry_date, train_no, time_left, time_arrived, station_from, station_to, is_stay, stay_details, days_nights, object_journey, rate, amount)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (bill_id, entry.entry_date, entry.train_no, entry.time_left, entry.time_arrived, entry.station_from, entry.station_to, entry.is_stay, entry.stay_details, entry.days_nights, entry.object_journey, entry.rate, entry.amount))
            
        conn.commit()
        log_audit("Insert", "TA Bills", f"Created TA Bill ID {bill_id} for Employee ID {payload.emp_id}")
        return {"id": bill_id, "status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
 
@app.put("/api/ta-bills/{id}")
def update_ta_bill(id: int, payload: TABillSchema):
    conn = get_db()
    cursor = conn.cursor()
    try:
        cursor.execute("""
            UPDATE ta_bills 
            SET emp_id = ?, month_year = ?, journey_type = ?, book_no = ?, page_no = ?, serial_no_from = ?, serial_no_to = ?, bill_unit = ?, basic_pay = ?
            WHERE id = ?
        """, (payload.emp_id, payload.month_year, payload.journey_type, payload.book_no, payload.page_no, payload.serial_no_from, payload.serial_no_to, payload.bill_unit or "", payload.basic_pay or 0, id))
        
        cursor.execute("DELETE FROM ta_entries WHERE bill_id = ?", (id,))
        for entry in payload.entries:
            cursor.execute("""
                INSERT INTO ta_entries (bill_id, entry_date, train_no, time_left, time_arrived, station_from, station_to, is_stay, stay_details, days_nights, object_journey, rate, amount)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (id, entry.entry_date, entry.train_no, entry.time_left, entry.time_arrived, entry.station_from, entry.station_to, entry.is_stay, entry.stay_details, entry.days_nights, entry.object_journey, entry.rate, entry.amount))
            
        conn.commit()
        log_audit("Update", "TA Bills", f"Updated TA Bill ID {id} for Employee ID {payload.emp_id}")
        return {"id": id, "status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

@app.delete("/api/ta-bills/{id}")
def delete_ta_bill(id: int):
    conn = get_db()
    try:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM ta_bills WHERE id = ?", (id,))
        conn.commit()
        log_audit("Delete", "TA Bills", f"Deleted TA Bill ID {id}")
        return {"status": "success"}
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()

def num_to_words(n):
    if n == 0:
        return "Zero"
    
    units = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", 
             "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"]
    tens = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]
    
    def helper(num):
        if num < 20:
            return units[num]
        elif num < 100:
            return tens[num // 10] + (" " + units[num % 10] if num % 10 != 0 else "")
        elif num < 1000:
            return units[num // 100] + " Hundred" + (" and " + helper(num % 100) if num % 100 != 0 else "")
        elif num < 100000:
            return helper(num // 1000) + " Thousand" + (" " + helper(num % 1000) if num % 1000 != 0 else "")
        else:
            return helper(num // 100000) + " Lakh" + (" " + helper(num % 100000) if num % 100000 != 0 else "")
            
    res = helper(n)
    return res

def delete_rows_clean(ws, start_row, amount):
    import openpyxl
    new_ranges = []
    for r in list(ws.merged_cells.ranges):
        min_col, min_row, max_col, max_row = r.bounds
        if min_row >= start_row and max_row < start_row + amount:
            continue
        if min_row >= start_row + amount:
            r.shift(row_shift=-amount)
            new_ranges.append(r)
        elif max_row < start_row:
            new_ranges.append(r)
        else:
            new_max_row = max_row
            if max_row >= start_row:
                if max_row < start_row + amount:
                    new_max_row = start_row - 1
                else:
                    new_max_row = max_row - amount
            if new_max_row >= min_row:
                r.max_row = new_max_row
                new_ranges.append(r)
    ws.merged_cells.ranges.clear()
    for r in new_ranges:
        ws.merged_cells.ranges.add(r)
    ws.delete_rows(start_row, amount)

def insert_rows_clean(ws, start_row, amount):
    import openpyxl
    new_ranges = []
    for r in list(ws.merged_cells.ranges):
        min_col, min_row, max_col, max_row = r.bounds
        if min_row >= start_row:
            r.shift(row_shift=amount)
            new_ranges.append(r)
        elif max_row < start_row:
            new_ranges.append(r)
        else:
            r.max_row = max_row + amount
            new_ranges.append(r)
    ws.merged_cells.ranges.clear()
    for r in new_ranges:
        ws.merged_cells.ranges.add(r)
    ws.insert_rows(start_row, amount)

def copy_row_style(ws, src_row, dst_row):
    import openpyxl
    for col in range(1, ws.max_column + 1):
        src_cell = ws.cell(row=src_row, column=col)
        dst_cell = ws.cell(row=dst_row, column=col)
        if src_cell.has_style:
            dst_cell.font = openpyxl.styles.Font(
                name=src_cell.font.name,
                size=src_cell.font.size,
                bold=src_cell.font.bold,
                italic=src_cell.font.italic,
                charset=src_cell.font.charset,
                color=src_cell.font.color,
                underline=src_cell.font.underline,
                strike=src_cell.font.strike,
                vertAlign=src_cell.font.vertAlign,
                scheme=src_cell.font.scheme
            )
            dst_cell.border = openpyxl.styles.Border(
                left=src_cell.border.left,
                right=src_cell.border.right,
                top=src_cell.border.top,
                bottom=src_cell.border.bottom
            )
            dst_cell.fill = openpyxl.styles.PatternFill(
                fill_type=src_cell.fill.fill_type,
                start_color=src_cell.fill.start_color,
                end_color=src_cell.fill.end_color
            )
            dst_cell.alignment = openpyxl.styles.Alignment(
                horizontal=src_cell.alignment.horizontal,
                vertical=src_cell.alignment.vertical,
                text_rotation=src_cell.alignment.text_rotation,
                wrap_text=src_cell.alignment.wrap_text,
                shrink_to_fit=src_cell.alignment.shrink_to_fit,
                indent=src_cell.alignment.indent
            )
            dst_cell.number_format = src_cell.number_format

@app.get("/api/ta-bills/{id}/export-excel")
def export_ta_bill_excel(id: int):
    import openpyxl
    import re
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    
    def apply_premium_styling(ws, journey_type, required_rows):
        # Fonts
        title_font = Font(name="Segoe UI", size=14, bold=True, color="1B365D")
        meta_font = Font(name="Segoe UI", size=9.5, bold=False, color="333333")
        header_font = Font(name="Segoe UI", size=10, bold=True, color="FFFFFF")
        data_font = Font(name="Segoe UI", size=9.5, color="222222")
        data_bold_font = Font(name="Segoe UI", size=9.5, bold=True, color="222222")
        total_font = Font(name="Segoe UI", size=10.5, bold=True, color="1B365D")
        
        # Fills
        header_fill = PatternFill(start_color="1B365D", end_color="1B365D", fill_type="solid")
        alt_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
        white_fill = PatternFill(start_color="FFFFFF", end_color="FFFFFF", fill_type="solid")
        total_fill = PatternFill(start_color="F1F5F9", end_color="F1F5F9", fill_type="solid")
        
        # Borders
        thin_border_side = Side(border_style="thin", color="CBD5E1")
        thick_border_side = Side(border_style="medium", color="1B365D")
        double_border_side = Side(border_style="double", color="1B365D")
        
        data_border = Border(left=thin_border_side, right=thin_border_side, top=thin_border_side, bottom=thin_border_side)
        header_border = Border(left=thin_border_side, right=thin_border_side, top=thick_border_side, bottom=thick_border_side)
        total_border = Border(top=thin_border_side, bottom=double_border_side, left=thin_border_side, right=thin_border_side)

        # Column count
        max_col = 10 if journey_type == "NORMAL" else 11
        
        # Row Heights
        ws.row_dimensions[1].height = 24
        ws.row_dimensions[2].height = 24
        ws.row_dimensions[4].height = 24
        ws.row_dimensions[5].height = 24
        ws.row_dimensions[7].height = 28
        ws.row_dimensions[8].height = 20

        # 2. Format Headers (Rows 7 and 8)
        for r in [7, 8]:
            for c in range(1, max_col + 1):
                cell = ws.cell(row=r, column=c)
                cell.font = header_font
                cell.fill = header_fill
                cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
                cell.border = header_border

        # 3. Format Data Rows (Row 9 to 8+required_rows)
        data_start = 9
        data_end = 8 + required_rows
        
        for r in range(data_start, data_end + 1):
            ws.row_dimensions[r].height = 22
            if journey_type == "NORMAL":
                pair_idx = (r - data_start) // 2
                fill_to_use = alt_fill if pair_idx % 2 == 1 else white_fill
            else:
                fill_to_use = alt_fill if (r % 2 == 1) else white_fill
                
            for c in range(1, max_col + 1):
                cell = ws.cell(row=r, column=c)
                cell.font = data_font
                cell.fill = fill_to_use
                cell.border = data_border
                
                # Alignments & formatting based on columns
                if c == 1:
                    cell.alignment = Alignment(horizontal="center", vertical="center")
                elif c == 2:
                    val_str = str(cell.value or "")
                    if "STAYED AT" in val_str:
                        cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
                        cell.font = data_bold_font
                    else:
                        cell.alignment = Alignment(horizontal="left", vertical="center")
                elif c in [3, 4, 5, 6]:
                    cell.alignment = Alignment(horizontal="center", vertical="center")
                elif c == 7:
                    cell.alignment = Alignment(horizontal="center", vertical="center")
                elif c == 8:
                    if journey_type == "NORMAL":
                        cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
                    else:
                        cell.alignment = Alignment(horizontal="center", vertical="center")
                elif c == 9:
                    if journey_type == "NORMAL":
                        cell.alignment = Alignment(horizontal="right", vertical="center")
                        cell.number_format = '#,##0'
                    else:
                        cell.alignment = Alignment(horizontal="left", vertical="center", wrap_text=True)
                elif c == 10:
                    cell.alignment = Alignment(horizontal="right", vertical="center")
                    cell.number_format = '#,##0'
                elif c == 11:
                    cell.alignment = Alignment(horizontal="right", vertical="center")
                    cell.number_format = '#,##0'

        # 4. Format Total Row
        total_row = 9 + required_rows
        ws.row_dimensions[total_row].height = 26
        
        for c in range(1, max_col + 1):
            cell = ws.cell(row=total_row, column=c)
            cell.fill = total_fill
            cell.border = total_border
            if cell.value:
                cell.font = total_font
                cell.alignment = Alignment(horizontal="left", vertical="center")
                
        # 5. Format Bottom Certification and Signature block
        cert_start = total_row + 1
        for r in range(cert_start, ws.max_row + 1):
            # Check if row has text to shrink empty spacing rows
            row_has_text = any(ws.cell(row=r, column=c).value is not None for c in range(1, max_col + 1))
            if row_has_text:
                ws.row_dimensions[r].height = 18
            else:
                ws.row_dimensions[r].height = 10
            for c in range(1, max_col + 1):
                cell = ws.cell(row=r, column=c)
                if cell.value and isinstance(cell.value, str):
                    if "I hereby certify that" in cell.value:
                        cell.font = Font(name="Segoe UI", size=9, italic=True, color="475569")
                        cell.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
                    elif any(k in cell.value for k in ["Countersigned", "Signature of Officer", "Controlling Officer", "Head of Office"]):
                        cell.font = Font(name="Segoe UI", size=9.5, bold=True, color="1B365D")
                    elif "Note:" in cell.value:
                        cell.font = Font(name="Segoe UI", size=8, italic=True, color="64748B")
                        cell.alignment = Alignment(horizontal="left", vertical="top", wrap_text=True)
        
        # Ensure grid lines are shown
        ws.views.sheetView[0].showGridLines = True

    conn = get_db()
    bill_row = conn.execute("""
        SELECT b.*, e.name as emp_name, e.pf_number, e.designation, e.level, e.joining_date, s.section_code
        FROM ta_bills b
        JOIN employees e ON b.emp_id = e.emp_id
        LEFT JOIN sections s ON e.primary_section_id = s.id
        WHERE b.id = ?
    """, (id,)).fetchone()
    
    if not bill_row:
        conn.close()
        raise HTTPException(status_code=404, detail="TA Bill not found")
        
    bill = dict(bill_row)
    entries_rows = conn.execute("SELECT * FROM ta_entries WHERE bill_id = ? ORDER BY id ASC", (id,)).fetchall()
    entries = [dict(r) for r in entries_rows]
    conn.close()
    
    if not os.path.exists(TA_TEMPLATE_PATH):
        raise HTTPException(status_code=500, detail="TA template Excel file not found on server.")
        
    try:
        wb = openpyxl.load_workbook(TA_TEMPLATE_PATH)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load TA template: {e}")
        
    journey_type = bill.get("journey_type", "NORMAL")
    sheet_to_keep = "format" if journey_type == "NORMAL" else "SUBRATA"
    
    if sheet_to_keep not in wb.sheetnames:
        raise HTTPException(status_code=500, detail=f"Template sheet '{sheet_to_keep}' not found in workbook.")
        
    ws = wb[sheet_to_keep]
    
    emp_name = bill.get("emp_name", "") or ""
    pf_number = bill.get("pf_number", "") or ""
    designation = bill.get("designation", "") or ""
    level = bill.get("level", 1) or 1
    basic_pay = bill.get("basic_pay", 0) or 0
    joining_date = bill.get("joining_date", "") or ""
    month_year = bill.get("month_year", "") or ""
    book_no = bill.get("book_no", "") or ""
    page_no = bill.get("page_no", "") or ""
    serial_no_from = bill.get("serial_no_from", "") or ""
    serial_no_to = bill.get("serial_no_to", "") or ""
    bill_unit = bill.get("bill_unit", "") or ""
    section_code = bill.get("section_code", "") or "KKVS"

    # Helpers to dynamically unmerge and format premium header blocks
    def write_meta_box(ws, start_row, start_col, end_row, end_col, label, value, bold_val=False, alignment="center"):
        for r_range in list(ws.merged_cells.ranges):
            min_col, min_row, max_col, max_row = r_range.bounds
            if (start_row <= max_row and end_row >= min_row) and (start_col <= max_col and end_col >= min_col):
                try:
                    ws.unmerge_cells(start_row=min_row, start_column=min_col, end_row=max_row, end_column=max_col)
                except Exception:
                    pass
        thin_border = Border(
            left=Side(border_style="thin", color="CBD5E1"),
            right=Side(border_style="thin", color="CBD5E1"),
            top=Side(border_style="thin", color="CBD5E1"),
            bottom=Side(border_style="thin", color="CBD5E1")
        )
        bg_fill = PatternFill(start_color="F8FAFC", end_color="F8FAFC", fill_type="solid")
        font_color = "1B365D" if bold_val else "333333"
        cell_font = Font(name="Segoe UI", size=9.5, bold=bold_val, color=font_color)
        for r in range(start_row, end_row + 1):
            for c in range(start_col, end_col + 1):
                cell = ws.cell(row=r, column=c)
                cell.value = None
                cell.fill = bg_fill
                cell.border = thin_border
                cell.font = cell_font
                cell.alignment = Alignment(horizontal=alignment, vertical="center", wrap_text=True)
        top_left_cell = ws.cell(row=start_row, column=start_col)
        top_left_cell.value = f"{label}: {value}" if label else value
        if start_row != end_row or start_col != end_col:
            ws.merge_cells(start_row=start_row, start_column=start_col, end_row=end_row, end_column=end_col)

    def write_title_box(ws, start_row, start_col, end_row, end_col, title):
        for r_range in list(ws.merged_cells.ranges):
            min_col, min_row, max_col, max_row = r_range.bounds
            if (start_row <= max_row and end_row >= min_row) and (start_col <= max_col and end_col >= min_col):
                try:
                    ws.unmerge_cells(start_row=min_row, start_column=min_col, end_row=max_row, end_column=max_col)
                except Exception:
                    pass
        title_font = Font(name="Segoe UI", size=13, bold=True, color="1B365D")
        for r in range(start_row, end_row + 1):
            for c in range(start_col, end_col + 1):
                cell = ws.cell(row=r, column=c)
                cell.value = None
                cell.font = title_font
                cell.fill = PatternFill(fill_type=None)
                cell.border = Border()
                cell.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        ws.cell(row=start_row, column=start_col).value = title
        if start_row != end_row or start_col != end_col:
            ws.merge_cells(start_row=start_row, start_column=start_col, end_row=end_row, end_column=end_col)

    try:
        dt = datetime.strptime(month_year, "%Y-%m")
        month_year_display = dt.strftime("%B  %Y").upper()
    except Exception:
        month_year_display = month_year.upper()

    joining_date_display = joining_date or ""
    if joining_date:
        try:
            dt_ap = datetime.strptime(joining_date, "%Y-%m-%d")
            joining_date_display = dt_ap.strftime("%d.%m.%Y")
        except Exception:
            pass

    # Build the header grid fields cleanly
    if journey_type == "NORMAL":
        # Row 1
        write_meta_box(ws, 1, 1, 1, 4, "", f"TA Movement Register Book No. {book_no} at {section_code}", bold_val=True, alignment="left")
        write_meta_box(ws, 1, 9, 1, 10, "", f"P.F. No. {pf_number}", bold_val=True, alignment="right")
        # Row 2
        write_meta_box(ws, 2, 1, 2, 2, "", f"Page No. {page_no}", alignment="left")
        write_meta_box(ws, 2, 3, 2, 4, "", f"Serial No. from {serial_no_from} to {serial_no_to}", alignment="center")
        write_meta_box(ws, 2, 9, 2, 10, "", f"B.U. No. {bill_unit}", alignment="right")
        write_title_box(ws, 1, 5, 2, 8, "TRAVELLING ALLOWANCE JOURNAL")
        # Row 4
        write_meta_box(ws, 4, 1, 4, 2, "Department", "S&T", alignment="left")
        write_meta_box(ws, 4, 3, 4, 4, "Division Headquarters at", section_code, alignment="center")
        write_meta_box(ws, 4, 5, 4, 8, "Journal of duties performed by", f"Sri {emp_name}", bold_val=True, alignment="left")
        write_meta_box(ws, 4, 9, 4, 10, "For which allowance is claimed", month_year_display, alignment="right")
        # Row 5
        write_meta_box(ws, 5, 1, 5, 1, "is claimed", "TA", alignment="left")
        write_meta_box(ws, 5, 2, 5, 3, "Designation", designation, alignment="left")
        write_meta_box(ws, 5, 4, 5, 5, "Pay", f"Rs. {basic_pay}", alignment="center")
        write_meta_box(ws, 5, 6, 5, 6, "Level", level, alignment="center")
        write_meta_box(ws, 5, 7, 5, 8, "Date of appointment", joining_date_display, alignment="center")
        write_meta_box(ws, 5, 9, 5, 10, "Rule by which governed", "SRTA", alignment="right")
    else:
        # Row 1
        write_meta_box(ws, 1, 1, 1, 4, "", f"TA Movement Register Book No. {book_no} at {section_code}", bold_val=True, alignment="left")
        write_meta_box(ws, 1, 10, 1, 11, "", f"P.F. No. {pf_number}", bold_val=True, alignment="right")
        # Row 2
        write_meta_box(ws, 2, 1, 2, 2, "", f"Page No. {page_no}", alignment="left")
        write_meta_box(ws, 2, 3, 2, 4, "", f"Serial No. from {serial_no_from} to {serial_no_to}", alignment="center")
        write_meta_box(ws, 2, 10, 2, 11, "", f"B.U. No. {bill_unit}", alignment="right")
        write_title_box(ws, 1, 5, 2, 9, "TRAVELLING ALLOWANCE JOURNAL")
        # Row 4
        write_meta_box(ws, 4, 1, 4, 2, "Department", "S&T", alignment="left")
        write_meta_box(ws, 4, 3, 4, 4, "Division Headquarters at", section_code, alignment="center")
        write_meta_box(ws, 4, 5, 4, 9, "Journal of duties performed by", f"Sri {emp_name}", bold_val=True, alignment="left")
        write_meta_box(ws, 4, 10, 4, 11, "For which allowance is claimed", month_year_display, alignment="right")
        # Row 5
        write_meta_box(ws, 5, 1, 5, 1, "is claimed", "TA", alignment="left")
        write_meta_box(ws, 5, 2, 5, 3, "Designation", designation, alignment="left")
        write_meta_box(ws, 5, 4, 5, 5, "Pay", f"Rs. {basic_pay}", alignment="center")
        write_meta_box(ws, 5, 6, 5, 6, "Level", level, alignment="center")
        write_meta_box(ws, 5, 7, 5, 9, "Date of appointment", joining_date_display, alignment="center")
        write_meta_box(ws, 5, 10, 5, 11, "Rule by which governed", "SRTA", alignment="right")

    # Write data
    total_amount = 0
    if journey_type == "NORMAL":
        num_pairs = (len(entries) + 1) // 2
        required_rows = num_pairs * 2
        
        if required_rows > 18:
            insert_rows_clean(ws, 27, required_rows - 18)
            for r in range(27, 27 + required_rows - 18):
                if r % 2 == 1:
                    copy_row_style(ws, 9, r)
                else:
                    copy_row_style(ws, 10, r)
        elif required_rows < 18:
            delete_rows_clean(ws, 9 + required_rows, 18 - required_rows)
            
        entry_start = 9
        entry_end = 8 + required_rows
        for r in list(ws.merged_cells.ranges):
            min_col, min_row, max_col, max_row = r.bounds
            if min_row >= entry_start and max_row <= entry_end:
                ws.merged_cells.ranges.remove(r)
                
        for i in range(num_pairs):
            r1_idx = 9 + 2 * i
            r2_idx = 10 + 2 * i
            
            leg_out = entries[2 * i]
            leg_in = entries[2 * i + 1] if (2 * i + 1) < len(entries) else None
            
            date_val = leg_out.get("entry_date", "")
            try:
                dt_d = datetime.strptime(date_val, "%Y-%m-%d")
                date_display = dt_d.strftime("%d.%m.%y")
            except Exception:
                date_display = date_val
                
            ws.cell(row=r1_idx, column=1).value = date_display
            ws.cell(row=r1_idx, column=2).value = leg_out.get("train_no", "")
            
            t_left = leg_out.get("time_left", "")
            if t_left and not any(h in t_left.lower() for h in ("hrs", "hr")):
                t_left = f"{t_left} hrs"
            ws.cell(row=r1_idx, column=3).value = t_left
            
            t_arr = leg_out.get("time_arrived", "")
            if t_arr and not any(h in t_arr.lower() for h in ("hrs", "hr")):
                t_arr = f"{t_arr} hrs"
            ws.cell(row=r1_idx, column=4).value = t_arr
            
            ws.cell(row=r1_idx, column=5).value = leg_out.get("station_from", "")
            ws.cell(row=r1_idx, column=6).value = leg_out.get("station_to", "")
            
            days_nights_val = leg_out.get("days_nights", "")
            try:
                days_nights_display = float(days_nights_val) if days_nights_val else None
            except Exception:
                days_nights_display = days_nights_val
            ws.cell(row=r1_idx, column=7).value = days_nights_display
            
            ws.cell(row=r1_idx, column=8).value = leg_out.get("object_journey", "")
            ws.cell(row=r1_idx, column=9).value = leg_out.get("rate", 0)
            ws.cell(row=r1_idx, column=10).value = leg_out.get("amount", 0)
            total_amount += leg_out.get("amount", 0)
            
            if leg_in:
                ws.cell(row=r2_idx, column=2).value = leg_in.get("train_no", "")
                
                t_left_in = leg_in.get("time_left", "")
                if t_left_in and not any(h in t_left_in.lower() for h in ("hrs", "hr")):
                    t_left_in = f"{t_left_in} hrs"
                ws.cell(row=r2_idx, column=3).value = t_left_in
                
                t_arr_in = leg_in.get("time_arrived", "")
                if t_arr_in and not any(h in t_arr_in.lower() for h in ("hrs", "hr")):
                    t_arr_in = f"{t_arr_in} hrs"
                ws.cell(row=r2_idx, column=4).value = t_arr_in
                
                ws.cell(row=r2_idx, column=5).value = leg_in.get("station_from", "")
                ws.cell(row=r2_idx, column=6).value = leg_in.get("station_to", "")
            else:
                for c in range(2, 7):
                    ws.cell(row=r2_idx, column=c).value = ""
                    
            ws.merge_cells(start_row=r1_idx, start_column=1, end_row=r2_idx, end_column=1)
            ws.merge_cells(start_row=r1_idx, start_column=7, end_row=r2_idx, end_column=7)
            ws.merge_cells(start_row=r1_idx, start_column=8, end_row=r2_idx, end_column=8)
            ws.merge_cells(start_row=r1_idx, start_column=9, end_row=r2_idx, end_column=9)
            ws.merge_cells(start_row=r1_idx, start_column=10, end_row=r2_idx, end_column=10)
            
        total_row_idx = 9 + required_rows
        ws.cell(row=total_row_idx, column=8).value = f"Total :Rupees {num_to_words(total_amount)} only                     Rs.              {total_amount}"
        ws.merge_cells(start_row=total_row_idx, start_column=8, end_row=total_row_idx, end_column=10)

    else:
        N = len(entries)
        required_rows = N * 2
        
        if required_rows > 10:
            insert_rows_clean(ws, 19, required_rows - 10)
            for r in range(19, 19 + required_rows - 10):
                if r % 2 == 1:
                    copy_row_style(ws, 9, r)
                else:
                    copy_row_style(ws, 10, r)
        elif required_rows < 10:
            delete_rows_clean(ws, 9 + required_rows, 10 - required_rows)
            
        entry_start = 9
        entry_end = 8 + required_rows
        for r in list(ws.merged_cells.ranges):
            min_col, min_row, max_col, max_row = r.bounds
            if min_row >= entry_start and max_row <= entry_end:
                ws.merged_cells.ranges.remove(r)
                
        for i in range(N):
            r1_idx = 9 + 2 * i
            r2_idx = 10 + 2 * i
            entry = entries[i]
            is_stay = entry.get("is_stay", 0)
            
            date_val = entry.get("entry_date", "")
            try:
                dt_d = datetime.strptime(date_val, "%Y-%m-%d")
                date_display = dt_d.strftime("%d.%m.%y")
            except Exception:
                date_display = date_val
                
            ws.cell(row=r1_idx, column=1).value = date_display
            ws.merge_cells(start_row=r1_idx, start_column=1, end_row=r2_idx, end_column=1)
            
            days_nights_val = entry.get("days_nights", "")
            ws.cell(row=r1_idx, column=8).value = days_nights_val
            ws.merge_cells(start_row=r1_idx, start_column=8, end_row=r2_idx, end_column=8)
            
            ws.cell(row=r1_idx, column=9).value = entry.get("object_journey", "")
            ws.merge_cells(start_row=r1_idx, start_column=9, end_row=r2_idx, end_column=9)
            
            ws.cell(row=r1_idx, column=10).value = entry.get("rate", 0)
            ws.merge_cells(start_row=r1_idx, start_column=10, end_row=r2_idx, end_column=10)
            
            ws.cell(row=r1_idx, column=11).value = entry.get("amount", 0)
            ws.merge_cells(start_row=r1_idx, start_column=11, end_row=r2_idx, end_column=11)
            total_amount += entry.get("amount", 0)
            
            ws.cell(row=r1_idx, column=7).value = None
            ws.merge_cells(start_row=r1_idx, start_column=7, end_row=r2_idx, end_column=7)
            
            if is_stay:
                stay_text = entry.get("stay_details") or entry.get("train_no") or ""
                ws.cell(row=r1_idx, column=2).value = stay_text
                ws.merge_cells(start_row=r1_idx, start_column=2, end_row=r2_idx, end_column=6)
            else:
                ws.cell(row=r1_idx, column=2).value = entry.get("train_no", "")
                
                t_left = entry.get("time_left", "")
                if t_left and not any(h in t_left.lower() for h in ("hrs", "hr")):
                    t_left = f"{t_left} hrs"
                ws.cell(row=r1_idx, column=3).value = t_left
                
                t_arr = entry.get("time_arrived", "")
                if t_arr and not any(h in t_arr.lower() for h in ("hrs", "hr")):
                    t_arr = f"{t_arr} hrs"
                ws.cell(row=r1_idx, column=4).value = t_arr
                
                ws.cell(row=r1_idx, column=5).value = entry.get("station_from", "")
                ws.cell(row=r1_idx, column=6).value = entry.get("station_to", "")
                
                ws.merge_cells(start_row=r1_idx, start_column=2, end_row=r2_idx, end_column=2)
                ws.merge_cells(start_row=r1_idx, start_column=3, end_row=r2_idx, end_column=3)
                ws.merge_cells(start_row=r1_idx, start_column=4, end_row=r2_idx, end_column=4)
                ws.merge_cells(start_row=r1_idx, start_column=5, end_row=r2_idx, end_column=5)
                ws.merge_cells(start_row=r1_idx, start_column=6, end_row=r2_idx, end_column=6)
                
        total_row_idx = 9 + required_rows
        ws.cell(row=total_row_idx, column=9).value = f"Total :Rupees {num_to_words(total_amount)} only                     Rs.              {total_amount}"
        ws.merge_cells(start_row=total_row_idx, start_column=9, end_row=total_row_idx, end_column=11)

    for r in range(1, ws.max_row + 1):
        for c in range(1, ws.max_column + 1):
            cell_val = ws.cell(row=r, column=c).value
            if cell_val and isinstance(cell_val, str) and "I hereby certify that above mentioned" in cell_val:
                new_text = re.sub(
                    r"(above mentioned\s+)(.*?)(absent on duty)", 
                    r"\g<1>  Sri " + emp_name + r"  \g<3>", 
                    cell_val
                )
                ws.cell(row=r, column=c).value = new_text

    # Apply dynamic premium layout styling
    apply_premium_styling(ws, journey_type, required_rows)

    sheet_name_clean = emp_name[:30].strip()
    ws.title = sheet_name_clean
    for s in list(wb.sheetnames):
        if s != sheet_name_clean:
            wb.remove(wb[s])
            
    file_stream = io.BytesIO()
    wb.save(file_stream)
    file_stream.seek(0)
    
    filename = f"TA_Bill_{emp_name.replace(' ', '_')}_{month_year}.xlsx"
    return StreamingResponse(
        file_stream,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

# Resolve frontend/out directory
if getattr(sys, 'frozen', False):
    frontend_out_dir = os.path.join(sys._MEIPASS, "out")
else:
    frontend_out_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend", "out"))

# Mount _next folder for static resources
if os.path.exists(os.path.join(frontend_out_dir, "_next")):
    app.mount("/_next", StaticFiles(directory=os.path.join(frontend_out_dir, "_next")), name="next-assets")

# Route to serve other static files or HTML clean URLs
@app.get("/{path_name:path}")
async def serve_frontend(path_name: str):
    # Strip leading/trailing slashes
    clean_path = path_name.strip("/")
    
    if not clean_path:
        index_path = os.path.join(frontend_out_dir, "index.html")
        if os.path.isfile(index_path):
            return FileResponse(index_path)
            
    # 1. Try to serve exact file from out directory (e.g. favicon.ico, app_logo.png, etc.)
    file_path = os.path.join(frontend_out_dir, clean_path)
    if os.path.isfile(file_path):
        return FileResponse(file_path)
        
    # 2. Try clean routing (e.g. clean_path = "employees" -> employees.html)
    html_path = os.path.join(frontend_out_dir, f"{clean_path}.html")
    if os.path.isfile(html_path):
        return FileResponse(html_path)
        
    # 3. Fallback to 404 or index.html for client-side routing
    four_oh_four = os.path.join(frontend_out_dir, "404.html")
    if os.path.isfile(four_oh_four):
        return FileResponse(four_oh_four)
    return FileResponse(os.path.join(frontend_out_dir, "index.html"))

if __name__ == "__main__":
    import uvicorn
    is_frozen = getattr(sys, 'frozen', False)
    if is_frozen:
        # Pass the app object directly and disable reload to avoid multiprocessing issues in PyInstaller
        uvicorn.run(app, host="127.0.0.1", port=8000)
    else:
        uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)



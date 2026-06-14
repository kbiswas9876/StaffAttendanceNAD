import os
import re
import json
import sqlite3
import pandas as pd
import numpy as np

DB_PATH = "database.db"
if os.path.exists("backend"):
    DB_PATH = os.path.join("backend", DB_PATH)

excel_path = "Night Duty MONTH WISE B,Y&P LINE (1).xlsx"
if not os.path.exists(excel_path):
    excel_path = os.path.join("..", excel_path)

if not os.path.exists(excel_path):
    print(f"Error: {excel_path} not found.")
    exit(1)

xl = pd.ExcelFile(excel_path)
print("Using database:", DB_PATH)
print("Using excel:", excel_path)

# Load existing employees mapping to keep joining date or schedules if customized
existing_custom = {}
try:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    for r in conn.execute("SELECT pf_number, joining_date, weekly_schedule FROM employees").fetchall():
        existing_custom[r['pf_number']] = {
            "joining_date": r['joining_date'],
            "weekly_schedule": r['weekly_schedule']
        }
    conn.close()
except Exception:
    pass

# Map for months
month_map = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12
}

def normalize_name(name):
    if pd.isna(name):
        return ""
    s = str(name).strip().replace(".", "").replace(",", "")
    s = re.sub(r"\s+", " ", s)
    s = s.replace("Sri ", "").replace("MD ", "Md. ")
    # Replace ending dot or whitespace
    s = s.strip(" .")
    return s

def parse_month_year_from_sheet(sheet_name, df):
    # Try sheet name first
    match = re.search(r"([a-zA-Z]+)[,\s]*(\d+)", sheet_name)
    if match:
        m_name = match.group(1).lower()[:3]
        yr = int(match.group(2))
        yr = 2000 + yr if yr < 100 else yr
        if m_name in month_map:
            return month_map[m_name], yr
            
    # Try searching cells
    for r_idx in range(min(df.shape[0], 25)):
        for c_idx in range(df.shape[1]):
            val = str(df.iloc[r_idx, c_idx])
            match = re.search(r"Month\s+of\s+([a-zA-Z]+)-(\d+)", val, re.IGNORECASE)
            if not match:
                match = re.search(r"month\s+of\s+([a-zA-Z]+)\s+(\d+)", val, re.IGNORECASE)
            if match:
                m_name = match.group(1).lower()[:3]
                yr = int(match.group(2))
                if m_name in month_map:
                    return month_map[m_name], yr
                    
    # Fallback to column header
    for r_idx in range(min(df.shape[0], 25)):
        row_vals = [str(x).strip() for x in df.iloc[r_idx].tolist()]
        if any(v.lower() == "sl" for v in row_vals):
            for cell in row_vals:
                match = re.search(r"Month\s+of\s+([a-zA-Z]+)-(\d+)", cell, re.IGNORECASE)
                if not match:
                    match = re.search(r"month\s+of\s+([a-zA-Z]+)\s+(\d+)", cell, re.IGNORECASE)
                if match:
                    m_name = match.group(1).lower()[:3]
                    yr = int(match.group(2))
                    if m_name in month_map:
                        return month_map[m_name], yr
                        
    return None, None

# Key employees to classify sub-tables
kkvs_keys = {
    "tonmoy naskar", "subrata naskar", "mdhasmat raza", "hasmat raza", 
    "suvendu bikas", "sabyasachi bandopadhyay", "nabanil ghosh", 
    "samir mallick", "alauddin", "golam muz", "kundan kr das", 
    "akul naru", "silendra kumar", "sabyasachi sarkar"
}
kmuk_keys = {
    "abhishek gupta", "abhishek barnwal", "pravin kumar", "sujay bhattacharya", 
    "nantu passi", "sudhanshu ghosh", "manoj kumar", "suresh das", 
    "rishi shaw", "mukesh chaurasiya", "azizul hoque", "souvik sarkar"
}
knap_keys = {
    "sandip ghosh", "bappa biswas", "kaustav maiti", "samir dutta", 
    "asish kr malik", "ranjit mallick", "sandeep singh", "sabir ali", 
    "sanjay kr tiwari", "priyam pal", "saumya pakray", "sourav roy", "kanai roy"
}
kncs_keys = {
    "ujjwal halder", "bhairav karmakar", "mrityunjoy paul", "binod prasad", 
    "satyanath sing", "subir kumar das", "tanmoy das", "anup kr das", 
    "surajit mallick", "debasish sarkar", "birendra kumar", "birendra das"
}
joka_keys = {
    "santosh kumar", "dipak kumar prasad", "akib javed"
}
kjhd_keys = {
    "raj kumar thakur", "patrick"
}

def classify_table(names):
    names_lower = [n.lower() for n in names]
    for name in names_lower:
        if any(k in name for k in kkvs_keys):
            return "KKVS"
        elif any(k in name for k in kmuk_keys):
            return "KMUK"
        elif any(k in name for k in knap_keys):
            return "KNAP"
        elif any(k in name for k in kncs_keys):
            return "KNCS"
        elif any(k in name for k in joka_keys):
            return "KJKA"
        elif any(k in name for k in kjhd_keys):
            return "KJHD"
    return "KKVS" # default fallback

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.row_factory = sqlite3.Row
    return conn

# Pre-seeding sections & lines
def setup_sections():
    conn = get_db()
    cursor = conn.cursor()
    
    # Delete existing logs and setup clean
    cursor.execute("DELETE FROM attendance_log")
    cursor.execute("DELETE FROM compensatory_rest_ledger")
    cursor.execute("DELETE FROM shift_rules")
    cursor.execute("DELETE FROM leave_bank")
    cursor.execute("DELETE FROM employees")
    cursor.execute("DELETE FROM sections")
    cursor.execute("DELETE FROM lines")
    
    # Re-insert lines
    cursor.execute("INSERT INTO lines (line_name, color_code) VALUES ('Blue Line', '#005EA6')")
    cursor.execute("INSERT INTO lines (line_name, color_code) VALUES ('Yellow Line', '#FFD100')")
    cursor.execute("INSERT INTO lines (line_name, color_code) VALUES ('Green Line', '#009639')")
    cursor.execute("INSERT INTO lines (line_name, color_code) VALUES ('Purple Line', '#7B2E8D')")
    cursor.execute("INSERT INTO lines (line_name, color_code) VALUES ('Noapara Car Shed', '#475569')")
    
    # Re-insert sections
    cursor.execute("INSERT INTO sections (line_id, section_code, section_name, base_location) VALUES ((SELECT id FROM lines WHERE line_name='Blue Line'), 'KKVS', 'Kavi Subhash Section', 'Kavi Subhash')")
    cursor.execute("INSERT INTO sections (line_id, section_code, section_name, base_location) VALUES ((SELECT id FROM lines WHERE line_name='Blue Line'), 'KMUK', 'Tollygunge Section', 'Mahanayak Uttam Kumar')")
    cursor.execute("INSERT INTO sections (line_id, section_code, section_name, base_location) VALUES ((SELECT id FROM lines WHERE line_name='Blue Line'), 'KNAP', 'Noapara Section', 'Noapara')")
    cursor.execute("INSERT INTO sections (line_id, section_code, section_name, base_location) VALUES ((SELECT id FROM lines WHERE line_name='Yellow Line'), 'KJHD', 'Joy Hind Section', 'Joy Hind')")
    cursor.execute("INSERT INTO sections (line_id, section_code, section_name, base_location) VALUES ((SELECT id FROM lines WHERE line_name='Purple Line'), 'KJKA', 'Joka Section', 'Joka')")
    cursor.execute("INSERT INTO sections (line_id, section_code, section_name, base_location) VALUES ((SELECT id FROM lines WHERE line_name='Noapara Car Shed'), 'KNCS', 'Noapara Car Shed Section', 'Noapara Car Shed')")
    
    # Seed default shift rules for all sections
    cursor.execute("SELECT id FROM sections")
    sec_ids = [r[0] for r in cursor.fetchall()]
    for sec_id in sec_ids:
        cursor.execute("INSERT INTO shift_rules (section_id, shift_code, start_time, end_time, working_days, is_night_duty) VALUES (?, 'M', '06:00:00', '14:00:00', 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday', 0)", (sec_id,))
        cursor.execute("INSERT INTO shift_rules (section_id, shift_code, start_time, end_time, working_days, is_night_duty) VALUES (?, 'E', '14:00:00', '22:00:00', 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday', 0)", (sec_id,))
        cursor.execute("INSERT INTO shift_rules (section_id, shift_code, start_time, end_time, working_days, is_night_duty) VALUES (?, 'N', '22:00:00', '06:00:00', 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday,Sunday', 1)", (sec_id,))
        cursor.execute("INSERT INTO shift_rules (section_id, shift_code, start_time, end_time, working_days, is_night_duty) VALUES (?, 'G', '09:00:00', '17:30:00', 'Monday,Tuesday,Wednesday,Thursday,Friday,Saturday', 0)", (sec_id,))
        
    conn.commit()
    conn.close()

setup_sections()

# 1. Parse Employees & Night Duty data across all sheets
staff_records = {} # pf -> {name, desig, level, section}
night_duty_logs = [] # list of (pf, date)

sheets = ["march 25", "April 25", "AUG 25", "SEPT 25", "NOV 25", "DEC25", "JAN 26", "FEB,26", "MARCH,26", "April 26", "MAY,26", "Night APRIL", "Night May", "Night Oct", "Night Nov"]

for sheet in sheets:
    df = xl.parse(sheet, header=None)
    m, y = parse_month_year_from_sheet(sheet, df)
    if not m or not y:
        print(f"Skipping sheet {sheet} due to unparsed month/year.")
        continue
    
    # Find table dividers (SL headers)
    header_indices = []
    for r_idx in range(df.shape[0]):
        row_vals = [str(x).strip().lower() for x in df.iloc[r_idx].tolist()]
        if any(v == "sl" for v in row_vals):
            header_indices.append(r_idx)
    header_indices.append(df.shape[0])
    
    print(f"Parsing sheet: {sheet} ({m}/{y}), found {len(header_indices)-1} tables.")
    for i in range(len(header_indices) - 1):
        start_row = header_indices[i] + 1
        end_row = header_indices[i+1]
        
        # Read names first to classify table section
        table_rows = []
        names_in_table = []
        for r_idx in range(start_row, end_row):
            row = df.iloc[r_idx].tolist()
            sl = row[0]
            pf = row[1]
            name = row[3] if len(row) > 3 else None
            desig = row[4] if len(row) > 4 else ""
            level = row[5] if len(row) > 5 else None
            dates = row[6] if len(row) > 6 else ""
            
            if pd.notna(sl) and str(sl).strip().lower() not in ["nan", "sl"]:
                try:
                    float(sl)
                    if pd.notna(name) and pd.notna(pf):
                        n_name = normalize_name(name)
                        pf_str = str(pf).strip().split('.')[0]
                        if pf_str.isdigit() and len(pf_str) > 5:
                            names_in_table.append(n_name)
                            table_rows.append((pf_str, n_name, desig, level, dates))
                except ValueError:
                    pass
                    
        section = classify_table(names_in_table)
        
        # Save staff records & logs
        for pf, name, desig, level, dates in table_rows:
            # Clean level
            lvl_val = 1
            if pd.notna(level):
                try:
                    lvl_val = int(float(level))
                except ValueError:
                    pass
            else:
                # heuristic
                if "sse" in str(desig).lower():
                    lvl_val = 7
                elif "je" in str(desig).lower():
                    lvl_val = 6
                elif "sr.tech" in str(desig).lower() or "sr. tech" in str(desig).lower():
                    lvl_val = 6
                elif "tech-i" in str(desig).lower() or "tech -i" in str(desig).lower():
                    lvl_val = 5
                elif "tech-ii" in str(desig).lower() or "tech -ii" in str(desig).lower():
                    lvl_val = 4
                elif "tech-iii" in str(desig).lower() or "tech -iii" in str(desig).lower():
                    lvl_val = 3
            
            # Save or update staff info
            # Only update section if the current sheet partitions staff into multiple tables (indicating a multi-section sheet).
            # Otherwise, preserve the section.
            is_multi_table = (len(header_indices) - 1) > 1
            existing_section = staff_records[pf]["section"] if pf in staff_records else None
            new_section = section if (is_multi_table or not existing_section) else existing_section
            
            staff_records[pf] = {
                "name": name,
                "desig": str(desig).strip() if pd.notna(desig) else "",
                "level": lvl_val,
                "section": new_section
            }
            
            # Parse dates performed
            if pd.notna(dates) and str(dates).strip().lower() not in ["nil", "", "nan"]:
                # split by commas or spaces
                day_tokens = re.split(r"[\s,]+", str(dates).strip())
                for tok in day_tokens:
                    tok_clean = tok.strip(" .`'")
                    if tok_clean.isdigit():
                        day_num = int(tok_clean)
                        # Check validity of day
                        try:
                            # Verify valid date
                            date_str = f"{y}-{m:02d}-{day_num:02d}"
                            pd.to_datetime(date_str) # test validity
                            night_duty_logs.append((pf, date_str))
                        except Exception:
                            # Skip invalid date token
                            pass

# Seed missing from Total Staff list
df_total = xl.parse("Total Staff list", header=None)
for r_idx, row in df_total.iterrows():
    name = row[1]
    desig = row[2]
    pf = row[3]
    if pd.notna(name) and pd.notna(pf):
        pf_str = str(pf).strip().split('.')[0]
        if pf_str.isdigit() and len(pf_str) > 5:
            if pf_str not in staff_records:
                desig_str = str(desig).strip()
                lvl = 7 if "sse" in desig_str.lower() else (6 if "je" in desig_str.lower() else 1)
                # Use key names mapping to classify employee section
                norm_name = normalize_name(name)
                sec = "KKVS"
                name_lower = norm_name.lower()
                if any(k in name_lower for k in kkvs_keys):
                    sec = "KKVS"
                elif any(k in name_lower for k in kmuk_keys):
                    sec = "KMUK"
                elif any(k in name_lower for k in knap_keys):
                    sec = "KNAP"
                elif any(k in name_lower for k in kncs_keys):
                    sec = "KNCS"
                elif any(k in name_lower for k in joka_keys):
                    sec = "KJKA"
                elif any(k in name_lower for k in kjhd_keys):
                    sec = "KJHD"
                
                staff_records[pf_str] = {
                    "name": norm_name,
                    "desig": desig_str,
                    "level": lvl,
                    "section": sec
                }

# Write employees to database
conn = get_db()
cursor = conn.cursor()

# Re-insert employees
print(f"Inserting {len(staff_records)} employees into DB...")
for pf, info in staff_records.items():
    section_code = info['section']
    cursor.execute("SELECT id FROM sections WHERE section_code = ?", (section_code,))
    sec_row = cursor.fetchone()
    if sec_row:
        sec_id = sec_row['id']
    else:
        sec_id = 1 # fallback
        
    rest_day = "Wednesday" if section_code in ["KKVS", "KJHD"] else "Sunday"
    
    # Use existing custom schedule/joining date if available
    if pf in existing_custom:
        joining_date = existing_custom[pf]['joining_date']
        weekly_schedule = existing_custom[pf]['weekly_schedule']
    else:
        joining_date = None
        week_default = {
            "Monday": "G", "Tuesday": "G",
            "Wednesday": "R" if rest_day == "Wednesday" else "G",
            "Thursday": "G", "Friday": "G", "Saturday": "G",
            "Sunday": "R" if rest_day == "Sunday" else "G"
        }
        weekly_schedule = json.dumps({
            "type": "rotating",
            "anchor_date": "2026-06-01",
            "week1": week_default,
            "week2": week_default,
            "week3": week_default,
            "week4": week_default,
            "custom_night_weeks": []
        })
        
    cursor.execute("""
        INSERT INTO employees (pf_number, name, designation, level, primary_section_id, default_rest_day, joining_date, weekly_schedule)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (pf, info['name'], info['desig'], info['level'], sec_id, rest_day, joining_date, weekly_schedule))

conn.commit()

# Re-map pf_number to emp_id
cursor.execute("SELECT emp_id, pf_number, primary_section_id FROM employees")
emp_map = {row['pf_number']: (row['emp_id'], row['primary_section_id']) for row in cursor.fetchall()}

# Clear logs for seeded years (2024, 2025, 2026) to prevent duplicates
cursor.execute("DELETE FROM attendance_log WHERE date >= '2024-01-01' AND date <= '2026-12-31'")
conn.commit()

# Insert night duty logs as attendance log 'P/N'
print(f"Seeding {len(night_duty_logs)} night duty attendance records...")
seeded_count = 0
for pf, date_str in night_duty_logs:
    if pf in emp_map:
        emp_id, sec_id = emp_map[pf]
        
        # Get shift ID for night shift 'N' in this section
        cursor.execute("SELECT id FROM shift_rules WHERE section_id = ? AND shift_code = 'N'", (sec_id,))
        shift_row = cursor.fetchone()
        shift_id = shift_row['id'] if shift_row else None
        
        # Insert log
        cursor.execute("""
            INSERT INTO attendance_log (emp_id, date, status, is_night, shift_id, remarks)
            VALUES (?, ?, 'P/N', 1, ?, 'Seeded Night Duty')
            ON CONFLICT(emp_id, date) DO UPDATE SET
                status = excluded.status,
                is_night = excluded.is_night,
                shift_id = excluded.shift_id,
                remarks = excluded.remarks
        """, (emp_id, date_str, shift_id))
        seeded_count += 1

conn.commit()
print(f"Seeded {seeded_count} night duty logs successfully.")

# Sync leave bank and compensatory rest ledgers for all employees for years 2024, 2025, 2026
# Import sync utility
conn.close()

# We can run sync utility by calling it in python
from main import sync_leave_and_ledger, log_audit

print("Syncing leave banks and compensatory rest ledgers...")
for pf, (emp_id, _) in emp_map.items():
    for year in [2024, 2025, 2026]:
        sync_leave_and_ledger(emp_id, year)
        
log_audit("Auto-Seed", "System", "Full night duty database sync completed from Excel workbook.")
print("All completed successfully!")

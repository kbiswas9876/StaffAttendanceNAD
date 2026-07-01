import sqlite3
import os
import json

db_path = os.path.join(os.path.expanduser("~"), "Documents", "MetroRailwayERP", "database.db")
conn = sqlite3.connect(db_path)
conn.row_factory = sqlite3.Row
cursor = conn.cursor()

print("TA CONFIG IN DATABASE:")
row = cursor.execute("SELECT value FROM system_settings WHERE key = 'ta_config'").fetchone()
if row:
    print(row[0])

print("\nBILLS IN DATABASE:")
bills = cursor.execute("SELECT id, emp_id, month_year, journey_type FROM ta_bills").fetchall()
for b in bills:
    print(dict(b))
    tot = cursor.execute("SELECT SUM(amount) FROM ta_entries WHERE bill_id = ?", (b['id'],)).fetchone()[0]
    print(f"  Sum of entries: {tot}")
    
    entries = cursor.execute("SELECT id, entry_date, days_nights, rate, amount FROM ta_entries WHERE bill_id = ?", (b['id'],)).fetchall()
    for e in entries:
        print(f"    Entry: {dict(e)}")

conn.close()

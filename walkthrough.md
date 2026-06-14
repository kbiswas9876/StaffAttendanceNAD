# Roster Attendance Delete and Rotating Schedule Adjustments Walkthrough

Here is a summary of all the modifications made to the Signalling & Telecommunication Department Staff Attendance Management System.

## Features Implemented & Tested

### 1. Attendance Log Deletions
- **Single Cell Deletion**: Select **Delete** from a cell's dropdown. A confirmation dialog will prompt you to make sure it is not accidental. On confirmation, it will create a database backup snapshot and permanently delete the SQL record (cell becomes fresh/empty `—`).
- **Month Roster Deletion**: The **Clear Grid** button is updated to **Delete Roster Month**. This completely deletes all logs for the loaded month and section from the database (making the sheet completely blank and fresh). It requires typing `DELETE` to confirm.

### 2. Designation and Pay Level Adjustments
- Designation label `SSE (In-Charge)` is updated to the required value `SSE/Sig/IC`.
- Designation `Assistant` option value is simplified to match exactly.
- **Pay Level Auto-Adjustment**: In the Admin Panel employee enrollment/update form, selecting a designation automatically adjusts the Pay Level state to its correct default:
  - `SSE/Sig/IC` -> Level 8
  - `SSE/Sig` -> Level 7
  - `JE/Sig` -> Level 6
  - `Sr. Tech` -> Level 6
  - `Tech-I` -> Level 5
  - `Tech-II` -> Level 4
  - `Tech-III` -> Level 3
  - `Assistant` -> Level 1
- You can still edit the Pay Level manually after selection if needed.

### 3. Rotating Schedule Templates
- **Day of Anchor Date logic**: Modulo 28-day rotating math is implemented dynamically mapping to Week 1, Week 2, Week 3, and Week 4, transitioning boundaries on the exact day of the week matching the `anchor_date` (e.g., if anchor date is a Wednesday, Week 1 maps starting Wednesday, and transition to Week 2 occurs on the next Wednesday).
- **Custom Night Week Overrides**: If the date is within a custom night week override, the shift maps to Night `N` (Present with Night Duty `P/N`), unless it is a rest day `R`.
- **Shift to Roster Code Auto-Fill Mapper**: Shift codes `G`, `M`, `E` map to Roster Code `P`, `N` maps to `P/N`, and `R` maps to `R`. All other codes are preserved.

### 4. Case-Insensitive Validation Challenge
- The DELETE roster verification input field checks case-insensitively, enabling the delete button when you type `delete`, `DELETE`, or `Delete` regardless of Caps Lock state.

### 5. Snapshot Backup Deletion
- A **Delete Snapshot** button is added next to the "Restore State" button under the backups list tab. Prompts for confirmation before permanently deleting the SQLite copy from the disk.

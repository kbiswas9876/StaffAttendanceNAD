# Roster Attendance and Backup Delete Actions Implementation Plan

This plan details the design and implementation of the delete/wiping feature requested for attendance logs (single cell and entire month/section roster) and database backup snapshots, including safety checks (automatic database backup before deletions and explicit user confirmation dialogs).

## User Review Required

> [!IMPORTANT]
> **Safety Backups**: Deleting an attendance record or an entire roster month will automatically generate a database snapshot (stored in `backups/`) prior to executing the SQLite deletion.
> **Confirmations**: Deleting a single cell will show a confirmation modal. Deleting an entire month roster will require typing the verification code `DELETE` (instead of `CLEAR`).

## Proposed Changes

---

### Backend

#### [MODIFY] [main.py](file:///c:/Users/koush/OneDrive/Documents/KKVS/backend/main.py)
- **New endpoint**: `DELETE /api/attendance-log` to delete a single attendance record by `emp_id` and `date`. Calls `sync_leave_and_ledger` to recalculate leaves.
- **New endpoint**: `DELETE /api/attendance-log/range` to delete all attendance logs for a given section (or all sections) and date range. Recalculates leaves for all affected employees.
- **New endpoint**: `DELETE /api/backups/{filename}` to permanently delete a database backup snapshot.

---

### Frontend

#### [MODIFY] [api.ts](file:///c:/Users/koush/OneDrive/Documents/KKVS/frontend/src/lib/api.ts)
- Add typed functions for the new delete endpoints:
  - `deleteAttendanceLog(empId, date)`
  - `deleteAttendanceLogsRange(sectionCode, startDate, endDate)`
  - `deleteBackup(filename)`

#### [MODIFY] [page.tsx](file:///c:/Users/koush/OneDrive/Documents/KKVS/frontend/src/app/attendance/page.tsx)
- Add a **Delete** option to the status dropdown in the grid.
- Selecting **Delete** opens a custom confirmation modal. Upon confirmation:
  1. Trigger database backup.
  2. Execute single cell deletion via API.
  3. Reload the grid.
- Update **Clear Grid** button to **Delete Roster Month**:
  - Requires typing the verification word `DELETE` (instead of `CLEAR`).
  - Upon confirmation, triggers database backup, executes range deletion via API, and reloads the grid (all cells will return to their blank/empty `—` state).

#### [MODIFY] [page.tsx](file:///c:/Users/koush/OneDrive/Documents/KKVS/frontend/src/app/admin/page.tsx)
- In the **Backups** tab:
  - Add a **Delete Snapshot** button next to each backup item.
  - Prompts with a standard confirmation dialog.
  - Upon confirmation, deletes the backup file via API and refreshes the backup list.

## Verification Plan

### Automated Tests
- Run FastAPI server locally and execute deletion calls using curl/Postman (or check via logs).

### Manual Verification
1. Open the Attendance Grid.
2. Select **Delete** on a cell: verify confirmation shows up, backup is created, cell is deleted in SQLite database, and grid reloads correctly.
3. Click **Delete Roster Month**: verify typing `DELETE` is required, database backup is created, logs are deleted from SQLite, and grid becomes blank.
4. Go to Admin Panel -> Backups: verify the list shows the newly created backups, click **Delete Snapshot** on one, and check that it is removed from the list and disk.

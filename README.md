# Metro Railway S&T Staff Attendance & Management System

A **premium-quality, fully offline desktop application** for managing Signal & Telecommunications department staff at **Metro Railway Kolkata**. Designed for daily office operations — no internet, no cloud, all data stays local.

---

## Features

- 👥 **Staff Directory** — Employee profiles with PF number, designation, pay level, section, and joining date
- 📅 **Smart Attendance Roster** — Monthly calendar grids with auto-fill from weekly shift schedules; supports 4-week rotating schedules
- 🌙 **Night Duty Register** — Filter and export P/N duty records month-wise for B, Y & P Lines
- 🏖️ **Leave Bank Management** — CL, LAP & Compensatory Rest (CR) balance tracking per employee per year; visual circular progress indicators
- 📋 **Employee 360° Profile** — Full attendance heatmap, career timeline, and leave ledger per employee
- 🔔 **Live Audit Notifications** — Bell icon shows recent system activity from the audit log
- 🖊️ **Dynamic Signatories** — Export reports with auto-populated or custom-typed In-Charge names/designations
- 📤 **Export to Excel & PDF** — Formatted monthly reports via FastAPI backend
- 🏛️ **Line & Section Management** — Multi-line (Blue, Green, Orange…) and multi-section (KKVS, KMUK…) support
- 🔁 **Backup & Restore** — One-click SQLite backups with database integrity check

---

## Tech Stack

| Layer     | Technology                          |
|-----------|-------------------------------------|
| Frontend  | Next.js 16 (App Router), TypeScript, Tailwind CSS |
| Backend   | FastAPI (Python), SQLite, XlsxWriter, ReportLab |
| Runtime   | Node.js 20+, Python 3.10+, Windows 10/11 |

---

## Getting Started

### Prerequisites

- **Python 3.10+** with `pip`
- **Node.js 20+** with `npm`
- **Windows 10 / 11**

### Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/kbiswas9876/StaffAttendanceNAD.git
   cd StaffAttendanceNAD
   ```

2. **Set up the Python backend**
   ```bash
   cd backend
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Set up the Next.js frontend**
   ```bash
   cd frontend
   npm install
   ```

### Running Locally

**Option A — Standalone Desktop Launcher (Recommended & Easiest)**

Simply run the compiled executable: **`dist/MetroRailwayERP.exe`** (you can create a Desktop shortcut to it for quick access). 
* **Zero Configuration**: On the first run, the launcher automatically checks for Node.js, sets up the Python backend virtual environment, installs any missing Python/NPM packages in the background, and runs the servers invisibly.
* **App Window Mode**: Opens the application interface directly in Microsoft Edge App Mode, making it look and feel like a native desktop application.
* **Process Safety**: Prevents duplicate instances using a single-instance lock and forcefully terminates all background process trees (`taskkill /F /T`) upon window closure to ensure zero memory leaks and free ports.

To compile or re-package the launcher after code edits:
```bash
python build_launcher.py
```

**Option B — Batch Launcher**

Double-click `run_app.bat` from the project root. It will start both backend and frontend servers in separate command prompt windows.

**Option C — Manual**

```bash
# Terminal 1 — Backend
cd backend
.venv\Scripts\python.exe main.py

# Terminal 2 — Frontend
cd frontend
npm run dev
```

Then open `http://localhost:3000` in your browser.

---

## Project Structure

```
StaffAttendanceNAD/
├── backend/
│   ├── main.py              # FastAPI app, SQLite ORM, export generators
│   └── requirements.txt     # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── app/             # Next.js App Router pages
│   │   │   ├── page.tsx           # Dashboard
│   │   │   ├── attendance/        # Monthly Roster
│   │   │   ├── night-duty/        # Night Duty Register
│   │   │   ├── employees/         # Staff Directory & 360° Profile
│   │   │   ├── admin/             # System Administration Panel
│   │   │   └── NavigationWrapper.tsx  # Sidebar + Header
│   │   └── lib/api.ts       # Typed API client
│   └── package.json
├── run_app.bat              # One-click launcher
└── .gitignore
```

---

## License

Internal use — Metro Railway Kolkata, Signal & Telecommunication Department.

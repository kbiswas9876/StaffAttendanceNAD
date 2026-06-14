@echo off
title Metro Railway Kolkata S&T ERP Startup Manager
color 0b

echo ====================================================================
echo      METRO RAILWAY KOLKATA S^&T STAFF ERP SYSTEM INITIALIZATION
echo ====================================================================
echo.
echo  [1/4] Checking local folder structure...
if not exist "backend\database.db" (
    echo  [OK] Database file database.db will be auto-seeded on first run.
) else (
    echo  [OK] Local SQLite database found.
)

echo.
echo  [2/4] Starting Python export microservice in a new console window...
start "S^&T ERP Python Backend" cmd /c "cd backend && .venv\Scripts\python.exe main.py"

echo.
echo  [3/4] Starting Next.js frontend server in a new console window...
start "S^&T ERP Next.js Frontend" cmd /c "cd frontend && npm run dev"

echo.
echo  [4/4] Warming up servers...
echo  Please wait 5 seconds for local services to initialize...
timeout /t 5 /nobreak > nul

echo.
echo  ====================================================================
echo  Launching Web Roster Client in Standalone Microsoft Edge App Mode:
echo  http://localhost:3000
echo  ====================================================================
start msedge --app=http://localhost:3000

echo.
echo  ERP is running successfully. 
echo  Keep the two background console windows open while using the app.
echo  You can close this control window now.
echo.
pause

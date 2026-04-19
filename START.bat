@echo off
title Sakhi Sang - Devotee Management System
echo.
echo  OM Namah  -  Sakhi Sang Attendance System
echo  ==========================================
echo.

:: Install dependencies if needed
python -m pip show flask >nul 2>&1
if %errorlevel% neq 0 (
    echo  Installing required packages...
    python -m pip install flask openpyxl
    echo.
)

echo  Starting server at http://localhost:3000
echo  Press Ctrl+C to stop.
echo.

:: Open browser after 2 seconds
start /b cmd /c "timeout /t 2 /nobreak >nul && start http://localhost:3000"

:: Start server
python server.py

pause

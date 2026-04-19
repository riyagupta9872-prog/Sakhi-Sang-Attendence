@echo off
title Sakhi Sang – Local Server
echo.
echo  OM Shri Radhe!  Sakhi Sang Attendance System
echo  Starting local web server on http://localhost:8080
echo.
echo  Open your browser at: http://localhost:8080
echo  Press Ctrl+C to stop.
echo.
cd /d "%~dp0"
python -m http.server 8080
pause

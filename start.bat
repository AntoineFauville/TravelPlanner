@echo off
rem Double-click to open TravelPlanner. Keep this window open while you use it.
cd /d "%~dp0"
start "" http://localhost:5173
python serve.py
pause

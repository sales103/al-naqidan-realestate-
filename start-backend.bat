@echo off
chcp 65001 > nul
cd /d "%~dp0backend"
echo Starting Al-Naqidan Backend on port 3000...
node dist\index.js
pause

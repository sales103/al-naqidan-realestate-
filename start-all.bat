@echo off
chcp 65001 > nul
echo ============================================
echo   Al-Naqidan Real Estate AI System
echo   شركة عبدالحكيم النقيدان للاستثمارات العقارية
echo ============================================
echo.

echo [1/2] Starting Backend (port 3000)...
start "Al-Naqidan Backend" cmd /k "cd /d "%~dp0backend" && node dist\index.js"

timeout /t 3 /nobreak > nul

echo [2/2] Starting Frontend (port 5173)...
start "Al-Naqidan Frontend" cmd /k "cd /d "%~dp0frontend" && npm run dev"

timeout /t 4 /nobreak > nul

echo.
echo ============================================
echo System is starting...
echo.
echo Backend API:  http://localhost:3000
echo Frontend UI:  http://localhost:5173
echo.
echo Login: admin@naqidan.com / Admin@123456
echo ============================================
echo.
start "" "http://localhost:5173"
pause

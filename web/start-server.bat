@echo off
rem Startet den Life Hub so, dass auch das Handy im selben WLAN ihn erreicht.
chcp 65001 >nul
cd /d "%~dp0backend"

if not exist ".venv\Scripts\python.exe" (
  echo Die Python-Umgebung fehlt noch. Einmalig einrichten:
  echo   python -m venv .venv
  echo   .venv\Scripts\python -m pip install -r requirements.txt
  echo   copy .env.example .env   ^(dann Werte eintragen^)
  pause
  exit /b 1
)

echo.
echo  Life Hub startet. Adressen:
echo    Dieser Rechner:   http://localhost:8000
powershell -NoProfile -Command "Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -like '192.168.*' -or $_.IPAddress -like '172.16.*' -or $_.IPAddress -like '10.0.*' } | ForEach-Object { '   Handy (WLAN):     http://' + $_.IPAddress + ':8000' }"
echo.
echo  Handy und Rechner muessen im selben WLAN sein, mobile Daten am Handy aus.
echo  Zum Beenden dieses Fenster schliessen oder Strg+C druecken.
echo.

".venv\Scripts\python.exe" -m uvicorn main:app --host 0.0.0.0 --port 8000
pause

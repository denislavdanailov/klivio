@echo off
:: Klivio X Daily Scheduler — Task Scheduler Setup
:: Run once as Administrator

set TASK_NAME=KlivioXDaily
set NODE_PATH=C:\Program Files\nodejs\node.exe
set SCRIPT=D:\KLIVIO\twitter\scheduler.js
set LOG=D:\KLIVIO\twitter\logs\scheduler.log

if not exist "D:\KLIVIO\twitter\logs" mkdir "D:\KLIVIO\twitter\logs"

schtasks /Create /F /TN "%TASK_NAME%" ^
  /TR "\"%NODE_PATH%\" \"%SCRIPT%\" >> \"%LOG%\" 2>&1" ^
  /SC DAILY ^
  /ST 08:00 ^
  /RU "%USERNAME%"

echo.
echo Task "%TASK_NAME%" created — runs daily at 08:00
echo Preview mode: node twitter/scheduler.js --dry
echo.
pause

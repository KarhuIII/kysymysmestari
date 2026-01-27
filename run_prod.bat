@echo off
TITLE Kysymysmestari - PRODUCTION MODE
echo Rakennetaan projekti ja kaynnistetaan...
echo.
call npm run build
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo VIRHE: Build epaonnistui.
    pause
    exit /b %ERRORLEVEL%
)
echo.
echo Kaynnistetaan serveri...
npm run start
pause

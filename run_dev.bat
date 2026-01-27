@echo off
TITLE Kysymysmestari - DEVELOPMENT MODE

:start
cls
echo ======================================================
echo   Kysymysmestari - Kehitystila
echo ======================================================
echo.
echo Serveri seuraa tiedostoja ja paivittyy automaattisesti.
echo Jos haluat pakottaa uudelleenkaynnistyksen:
echo 1. Paina Ctrl+C
echo 2. Vastaa N (jos kysytaan)
echo 3. Paina mita tahansa nappainta
echo.

cmd /c npm run dev

echo.
echo Serveri pysaytetty.
echo Paina mita tahansa nappainta kaynnistaaksesi uudelleen...
echo (Tai sulje ikkuna lopettaaksesi)
pause >nul
goto start

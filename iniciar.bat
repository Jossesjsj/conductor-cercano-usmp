@echo off
REM Doble clic para iniciar la presentacion (evita la politica de ejecucion de PowerShell)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar.ps1" %*
if errorlevel 1 pause

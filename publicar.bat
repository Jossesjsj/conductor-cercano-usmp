@echo off
REM Doble clic: publica la presentacion en un link https (Cloudflare Tunnel)
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0publicar.ps1" %*

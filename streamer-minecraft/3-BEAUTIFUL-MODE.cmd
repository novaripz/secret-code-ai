@echo off
title Beautiful mode
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\Set-Mode.ps1" -Mode beautiful
if errorlevel 1 pause

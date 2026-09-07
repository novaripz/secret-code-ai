@echo off
title Performance mode
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\Set-Mode.ps1" -Mode performance
if errorlevel 1 pause

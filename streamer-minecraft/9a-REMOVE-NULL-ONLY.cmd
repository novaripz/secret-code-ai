@echo off
title Remove Null only
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\Set-Horror.ps1" -State off -Which null
if errorlevel 1 pause

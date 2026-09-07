@echo off
title Remove Verity only
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\Set-Horror.ps1" -State off -Which verity
if errorlevel 1 pause

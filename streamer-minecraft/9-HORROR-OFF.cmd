@echo off
title Horror addons off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\Set-Horror.ps1" -State off
if errorlevel 1 pause

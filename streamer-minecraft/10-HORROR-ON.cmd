@echo off
title Horror addons on
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\Set-Horror.ps1" -State on
if errorlevel 1 pause

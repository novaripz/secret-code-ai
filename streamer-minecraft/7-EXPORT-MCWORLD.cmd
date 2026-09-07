@echo off
title Export .mcworld
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\Export-World.ps1" 
if errorlevel 1 pause

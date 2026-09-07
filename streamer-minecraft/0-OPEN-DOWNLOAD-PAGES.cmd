@echo off
title Open download pages
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\Open-Pages.ps1" 
if errorlevel 1 pause

@echo off
title Restore backup
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\Restore-Backup.ps1" 
if errorlevel 1 pause

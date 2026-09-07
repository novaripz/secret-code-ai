@echo off
title Backup world
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\Backup-World.ps1" 
if errorlevel 1 pause

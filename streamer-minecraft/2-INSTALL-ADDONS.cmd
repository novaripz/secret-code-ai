@echo off
title Install addons
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\Install-Addons.ps1" 
if errorlevel 1 pause

@echo off
title Check setup
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\Check-Setup.ps1" 
if errorlevel 1 pause

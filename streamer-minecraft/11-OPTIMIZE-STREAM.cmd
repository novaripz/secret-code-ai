@echo off
title Optimize - stream
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\Optimize.ps1" -Preset stream
if errorlevel 1 pause

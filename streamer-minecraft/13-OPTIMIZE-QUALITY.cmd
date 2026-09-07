@echo off
title Optimize - quality
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\Optimize.ps1" -Preset quality
if errorlevel 1 pause

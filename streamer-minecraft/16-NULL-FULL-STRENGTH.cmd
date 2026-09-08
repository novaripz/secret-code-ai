@echo off
title Null - full strength
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\Tune-Null.ps1" -Action revert
if errorlevel 1 pause

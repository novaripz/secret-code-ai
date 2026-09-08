@echo off
title Null - what's inside
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\Tune-Null.ps1" -Action report
if errorlevel 1 pause

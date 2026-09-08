@echo off
title Null - background only
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\Tune-Null.ps1" -Action ambient
if errorlevel 1 pause

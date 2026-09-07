@echo off
title Horror test world
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\Set-Mode.ps1" -Mode null-test
if errorlevel 1 pause

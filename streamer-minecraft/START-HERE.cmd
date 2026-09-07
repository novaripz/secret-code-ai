@echo off
title Streamer pack setup
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install\Setup.ps1" -Mode beautiful
if errorlevel 1 pause

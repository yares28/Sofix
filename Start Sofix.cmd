@echo off
cd /d "%~dp0"
node --experimental-strip-types --no-warnings scripts/local.mjs --background
if errorlevel 1 pause

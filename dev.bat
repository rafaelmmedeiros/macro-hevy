@echo off
rem Starts the dev server and opens the app in the default browser.
cd /d "%~dp0"

where npm >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install version 22.12 or newer from https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

call npm run dev -- --open

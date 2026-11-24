@echo off
REM dev/creator=tubakhxn
setlocal
cd /d "%~dp0"
title Gesture Text Editor

set "PY="
where py >nul 2>nul
if not errorlevel 1 set "PY=py -3"
if defined PY goto havepy
where python >nul 2>nul
if not errorlevel 1 set "PY=python"
:havepy
if not defined PY goto nopython

echo Using: %PY%
%PY% -c "import flask" >nul 2>nul
if not errorlevel 1 goto run
echo Flask is missing - installing it (only missing packages are installed)...
%PY% -m pip install "flask>=2.2"
if errorlevel 1 goto pipfail

:run
%PY% app.py
if errorlevel 1 pause
exit /b 0

:nopython
echo Python 3.9+ was not found. Install it from https://www.python.org/downloads/
echo and tick "Add python.exe to PATH", then run this file again.
pause
exit /b 1

:pipfail
echo Could not install Flask. Check your internet connection, then run:  pip install flask
pause
exit /b 1

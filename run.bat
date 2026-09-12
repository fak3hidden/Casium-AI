@echo off
title Casium AI
where pythonw >nul 2>nul
if %errorlevel%==0 (
  start "" pythonw "%~dp0server.py"
) else (
  python "%~dp0server.py"
)

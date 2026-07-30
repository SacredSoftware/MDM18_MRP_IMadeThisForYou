@echo off
REM ============================================================
REM  start.bat
REM  Launches the Electron app using the portable Node runtime
REM  sitting in this same folder (node-runtime\).
REM
REM  Run install.bat first if you haven't already.
REM ============================================================

setlocal

set NODE_DIR=%~dp0node-runtime
set APP_DIR=%~dp0..\Scripts_and_Archive\Algorithmic_Mirror_Collage

if not exist "%NODE_DIR%\node.exe" (
    echo.
    echo ERROR: Could not find node.exe in:
    echo   %NODE_DIR%
    echo.
    pause
    exit /b 1
)

if not exist "%APP_DIR%\node_modules" (
    echo.
    echo ERROR: node_modules not found in:
    echo   %APP_DIR%
    echo Run install.bat first.
    echo.
    pause
    exit /b 1
)

set PATH=%NODE_DIR%;%PATH%

cd /d "%APP_DIR%"

REM --- Default: uses the "start" script in package.json (npm start) ---
call npm start

REM --- If package.json has no "start" script, comment out the line
REM     above and uncomment the line below instead: ---
REM call npx electron .

echo.
echo App closed. Press any key to close this window.
pause

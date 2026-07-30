@echo off
REM ============================================================
REM  install.bat
REM  One-time dependency install using the portable Node runtime
REM  sitting in this same folder (node-runtime\). Nothing is
REM  installed system-wide on this machine.
REM
REM  Requires internet access to fetch packages from npm.
REM ============================================================

setlocal

set NODE_DIR=%~dp0node-runtime
set APP_DIR=%~dp0..\Scripts_and_Archive\Algorithmic_Mirror_Collage

if not exist "%NODE_DIR%\node.exe" (
    echo.
    echo ERROR: Could not find node.exe in:
    echo   %NODE_DIR%
    echo Check that the portable Node zip was extracted and renamed
    echo to "node-runtime" inside this Windows_InstallGuide folder.
    echo.
    pause
    exit /b 1
)

if not exist "%APP_DIR%\package.json" (
    echo.
    echo ERROR: Could not find package.json in:
    echo   %APP_DIR%
    echo Check that Windows_InstallGuide and Scripts_and_Archive are
    echo sitting side by side in the project folder, unchanged.
    echo.
    pause
    exit /b 1
)

REM Put the portable node/npm ahead of anything else on PATH,
REM just for this terminal session.
set PATH=%NODE_DIR%;%PATH%

echo Using Node from: %NODE_DIR%
node -v
echo.
echo Installing dependencies into:
echo   %APP_DIR%
echo.

cd /d "%APP_DIR%"
call npm install

echo.
echo Done. Check above for any errors before continuing to start.bat.
pause

@echo off
chcp 65001 >nul

:: ==========================================================
::  Keyboard Editor - Build Portable EXE
::  Usage: build-portable.bat [--skip-npm]
::    --skip-npm  Skip npm run build (only recompile Rust)
:: ==========================================================

set PROJECT_DIR=K:\0AMAC\kle-editor\website-clone
set TARGET_DIR=%PROJECT_DIR%\src-tauri\target\x86_64-pc-windows-msvc\release
set DIST_DIR=%PROJECT_DIR%\dist-portable
set SRC_EXE=%TARGET_DIR%\custom-key-pcb-tool.exe
set DST_EXE=%DIST_DIR%\K���ų�������.exe

echo ========================================================
echo   Keyboard Editor - Portable EXE Build
echo ========================================================
echo.

:: 1. Frontend build (skip with --skip-npm)
if "%1"=="--skip-npm" goto skip_npm
echo [1/3] Building frontend (Next.js + obfuscate)...
cd /d "%PROJECT_DIR%"
call npm run build
if %ERRORLEVEL% neq 0 (
    echo [FAIL] Frontend build failed
    pause
    exit /b 1
)
echo [OK] Frontend build complete
echo.
:skip_npm

:: 2. Tauri Rust compilation
echo [2/3] Compiling Rust backend (Tauri)...
cd /d "%PROJECT_DIR%"
call npx tauri build --target x86_64-pc-windows-msvc
if %ERRORLEVEL% neq 0 (
    echo [FAIL] Tauri build failed
    pause
    exit /b 1
)
echo [OK] Rust compilation complete
echo.

:: 3. Copy exe to dist-portable
echo [3/3] Copying EXE to dist-portable...
if not exist "%DIST_DIR%" mkdir "%DIST_DIR%"
copy /y "%SRC_EXE%" "%DST_EXE%"
if %ERRORLEVEL% neq 0 (
    echo [FAIL] Copy failed
    pause
    exit /b 1
)
echo [OK] EXE updated: %DST_EXE%
echo.

:: Show file size
for %%I in ("%DST_EXE%") do echo File size: %%~zI bytes
echo.

echo ========================================================
echo   [OK] Build complete!
echo   Run: dist-portable\K���ų�������.exe
echo ========================================================
pause

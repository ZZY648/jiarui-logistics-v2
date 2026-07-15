@echo off
chcp 65001 >nul
title Jiarui Logistics V2.0

cd /d "%~dp0server"

echo.
echo ========================================
echo   Jiarui Logistics V2.0
echo ========================================
echo.

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js not found. Please install Node.js first.
    echo Download: https://nodejs.org/
    pause
    exit /b
)

echo [OK] Node.js: 
node --version

if not exist "server.js" (
    echo [ERROR] server.js not found!
    pause
    exit /b
)

if not exist "node_modules" (
    echo [INFO] Installing dependencies...
    npm install
    if %errorlevel% neq 0 (
        echo [ERROR] npm install failed
        pause
        exit /b
    )
)

echo [OK] All checks passed.
echo.
echo ========================================
echo   STARTING SERVER...
echo   Open: http://localhost:3000
echo   Login: admin / jiarui123
echo ========================================
echo.

node server.js

echo.
echo Server stopped.
pause

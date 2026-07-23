@echo off
echo ========================================
echo   ProdRank Shopify App - Deploy Script
echo ========================================
echo.
echo Make sure your VPN/proxy is ON before continuing.
echo.

set HTTPS_PROXY=http://127.0.0.1:7890
set HTTP_PROXY=http://127.0.0.1:7890
set PATH=D:\node_global;%PATH%

echo [1/3] Login to Shopify...
D:\node_global\shopify.cmd auth login
if %ERRORLEVEL% NEQ 0 (
    echo Login failed! Check VPN/proxy.
    echo If proxy port is different, edit deploy.bat line 9-10.
    pause
    exit /b 1
)

echo.
echo [2/3] Link app...
cd /d D:\site\prodrank\shopify-app
D:\node_global\shopify.cmd app config link

echo.
echo [3/3] Deploy extension...
D:\node_global\shopify.cmd app deploy

echo.
echo ========================================
echo   Done! Check Partner Dashboard.
echo ========================================
pause

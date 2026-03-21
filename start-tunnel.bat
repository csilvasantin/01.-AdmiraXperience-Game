@echo off
echo ===============================================
echo   XTANCO GAME + ELGATO LIGHT (Remote Access)
echo ===============================================
echo.
echo Starting local proxy + game server...
start /B node elgato-proxy.js
timeout /t 2 /nobreak >nul
echo.
echo Starting ngrok tunnel...
echo The public HTTPS URL will appear below.
echo Share it to control your Elgato light remotely!
echo.
ngrok http 9124

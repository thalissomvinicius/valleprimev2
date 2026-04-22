@echo off
color 0A
title API Ponte Local - UAU Database

echo =========================================================
echo    INICIANDO API PONTE - UAU DATABASE
echo    (Servidor Local + Tunel Cloudflare)
echo =========================================================
echo.

cd /d "%~dp0"

echo [1/2] Verificando dependencias...
python -m pip install -r requirements.txt -q

echo.
echo [2/2] Iniciando o servidor Uvicorn + Tunel...
echo Pressione CTRL+C para parar o servidor em qualquer momento.
echo.

python ligar_api_publica.py

pause

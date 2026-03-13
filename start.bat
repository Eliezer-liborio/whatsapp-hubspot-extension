@echo off
title WhatsApp → HubSpot Middleware
color 0A

echo.
echo  ╔══════════════════════════════════════╗
echo  ║   WhatsApp → HubSpot Middleware      ║
echo  ╚══════════════════════════════════════╝
echo.

:: Verifica se Node.js está instalado
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo  ❌ Node.js não encontrado!
    echo  Baixe em: https://nodejs.org
    pause
    exit /b 1
)

:: Verifica se o .env existe
if not exist ".env" (
    echo  ⚠️  Arquivo .env não encontrado!
    echo  Copiando .env.example para .env...
    copy .env.example .env
    echo.
    echo  ⚠️  ATENÇÃO: Edite o arquivo .env e adicione seu token HubSpot!
    echo  Abra o arquivo .env com o Bloco de Notas e substitua:
    echo  HUBSPOT_API_KEY=pat-na1-cole-seu-token-aqui
    echo.
    pause
    exit /b 1
)

:: Instala dependências se necessário
if not exist "node_modules" (
    echo  📦 Instalando dependências...
    npm install
    echo.
)

:: Inicia o servidor
echo  🚀 Iniciando servidor...
echo  Pressione Ctrl+C para parar.
echo.
node middleware.js
pause

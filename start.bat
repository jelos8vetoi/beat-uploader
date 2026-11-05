@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo Первый запуск: ставлю зависимости, это займёт пару минут...
  call npm install
)
call npm start

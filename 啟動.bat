@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 啟動世新校友抽獎伺服器（port 8123）...
start "shu-lottery-server" /min cmd /c "伺服器-自動重開.bat"
timeout /t 2 >nul
echo 開啟 Cloudflare 臨時網址，請在下方找 https://xxxx.trycloudflare.com
echo 前台＝該網址，後台＝該網址/admin，密碼在 admin-password.txt
cloudflared tunnel --no-autoupdate --url http://localhost:8123

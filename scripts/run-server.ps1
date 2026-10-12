# 伺服器自動重開：node server.js 意外結束 3 秒後自動重啟（與 伺服器-自動重開.bat 相同，但檔名為英文，方便排程／背景啟動）
$repo = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $repo
$node = 'C:\Program Files\nodejs\node.exe'
while ($true) {
  & $node server.js
  Start-Sleep -Seconds 3
}

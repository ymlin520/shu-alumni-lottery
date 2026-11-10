# 世新校友抽獎系統 — 給 Claude 的工作說明

功能、頁面、API、資料格式的完整說明都在 [README.md](README.md)，這裡只放改程式時要注意的事。

## 基本

- Node.js 零相依套件，**不要加 npm 套件**、不要建 package.json。
- `node server.js` 啟動，port 8123。平常用 `啟動.bat`（伺服器 ＋ cloudflared 臨時網址）。
- 改 `server.js`、`design-defaults.js` 要**重啟 Node**；`public/` 底下的頁面每次請求都重讀，重新整理即可。
- 伺服器啟動時把 `data/db.json` 讀進記憶體並定時寫回：**手動改 db.json 一定要先停伺服器**，否則會被覆寫。
- trycloudflare 網址每次重開都會變，重開後要把新網址告訴使用者（網址在 `data/tunnel.log`）。

## 個資（最重要）

- repo 是**公開的**（github.com/ymlin520/shu-alumni-lottery）。`data/`、`admin-password.txt`、`*.log`、`backups/`、`*.bak-*` 都在 `.gitignore`，絕對不能被 commit。
- `data/db.json` 有 2667 筆校友的身分證字號、電話、Email。不要把內容貼到回覆、截圖、README 或測試資料裡；範例一律用假資料（A123456789、王小明）。
- 投影的 `/draw` 只能顯示遮罩後的證件號（`A1*****789`），後台需登入才看得到完整號碼。改顯示邏輯時別把完整號碼送到 `/draw` 或不需登入的 API。
- `scripts/auto-push.ps1` 由 Windows 排程定時推 GitHub，偵測到資料檔進版控會中止推送。

## 兄弟專案：在校生場

- `..\shu-student-lottery`（port 8124）是同一套程式的在校生版，大部分功能兩邊要**一起改**。
- `server.js` 以 `SIBLING_DIR` 找到對方，讀對方的 `data/tunnel.log` 取得當下的臨時網址（抽獎畫面按 Q／A 切場用）。
- 兩邊的差異：身分識別標籤／浮水印（ALUMNI vs 在校生）、在校生版有 `studentNo` 與世新 SSO 登入。

## 改檔習慣

- 改檔前先把原檔備份到 `backups/`，檔名格式 `<檔名>.bak-<簡短說明>-<時間>`（兩個專案同步改時加專案名前綴，例如 `shu-student-lottery-draw.html.bak-...`）。
- 可調整的外觀與文字定義在 `design-defaults.js`，新加的尺寸／文案優先做成設計後台可調，不要寫死。
- `/draw` 是固定 4096 × 2048 的版面再整塊縮放，字級與間距以這塊版面為準；頂端列高度由 JS 量測寫進 `--topbar-h`，不要寫死；版面本身不畫背景。
- 承載度：報到寫檔是 200ms 合併寫一次＋`data/checkin-journal.log` 日誌，改報到流程時不要退回每筆整份重寫。
- 有改功能就在 README 的「更新紀錄」最上面加一段（日期 `YYYY/MM/DD`），寫給使用者看的白話說明。

## 測試

用另一份資料夾跑測試站，不碰正式資料：

```bash
PORT=8125 DATA_DIR=/tmp/lottery-test ADMIN_PASSWORD=test123 node server.js
```

## 溝通

- 一律用繁體中文回覆，README、介面文字也是繁體中文。

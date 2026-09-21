# 世新校友抽獎系統

校友線上登記 ＋ 大樂透風格現場抽獎。零相依（只需要 Node.js），資料存在本機 JSON 檔。

## 畫面

| 路徑 | 說明 | 需要密碼 |
|---|---|---|
| `/` | 校友登記表（身分證字號／護照號碼、姓名、曾改名、系所、學號） | 否 |
| `/draw` | 投影用抽獎畫面，彩球攪拌約 5 秒後掉出中獎姓名 | 是 |
| `/admin` | 抽獎設定、中獎紀錄、名單管理（手動新增／修改、清空名單、重新抽獎、匯出 CSV） | 是 |
| `/design` | 設計後台：改前台顏色、字型、尺寸、所有文字，也能寫自訂 CSS，右側即時預覽 | 是 |

## 啟動

```bash
node server.js
```

預設 port 8123，可用環境變數 `PORT`、`DATA_DIR`、`ADMIN_PASSWORD` 覆寫。
Windows 可直接雙擊 `啟動.bat`，會一併開 Cloudflare 臨時網址。

首次啟動會在 `admin-password.txt` 產生隨機管理密碼。

## 主要行為

- 身分證字號有檢查碼驗證，護照號碼為 5–20 碼英數字；同一證件號碼只能登記一次。
- 抽獎由伺服器端 `crypto.randomInt` 決定，每位校友只會中獎一次。
- 中獎紀錄可單筆撤銷或整批清空（＝重新抽獎），撤銷後該人回到待抽名單。
- 匯出 CSV 為 UTF-8 with BOM，Excel 可直接開啟。

## 資料與隱私

報名資料存在 `data/db.json`，含完整證件號碼，**已在 `.gitignore` 排除，不會上傳**。
後台畫面上的證件號碼一律遮蔽顯示，只有匯出的 CSV 含完整號碼。

## 檔案

```
server.js            伺服器、API、資料存取
design-defaults.js   設計後台的預設顏色、尺寸、文字
public/index.html    登記頁
public/draw.html     抽獎畫面
public/admin.html    後台
public/design.html   設計後台
public/assets/       共用樣式與套用設計的腳本
```

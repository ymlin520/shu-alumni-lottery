// 前台（登記頁 / 抽獎頁）可在 /design 調整的 CSS 變數與文字預設值
const vars = [
  // 配色（世新 70 週年校友返校日：紅金）
  { key: 'bg', group: '配色', label: '頁面底色（上）', type: 'color', default: '#6d0a10' },
  { key: 'bg2', group: '配色', label: '頁面底色（下）', type: 'color', default: '#4e0509' },
  { key: 'glow1', group: '配色', label: '中央紅光', type: 'color', default: '#c0161f' },
  { key: 'glow2', group: '配色', label: '右下紅光', type: 'color', default: '#8f0d14' },
  { key: 'card', group: '配色', label: '卡片底色', type: 'color', default: 'rgba(74, 6, 12, 0.62)' },
  { key: 'gold', group: '配色', label: '主色（按鈕、外框）', type: 'color', default: '#d8ac5a' },
  { key: 'gold-hi', group: '配色', label: '亮金（標題、中獎姓名）', type: 'color', default: '#f7e3b0' },
  { key: 'gold-lo', group: '配色', label: '按鈕陰影', type: 'color', default: '#8a5a1c' },
  { key: 'btn-text', group: '配色', label: '按鈕文字', type: 'color', default: '#7a0c12' },
  { key: 'text', group: '配色', label: '主要文字', type: 'color', default: '#fbeed6' },
  { key: 'muted', group: '配色', label: '次要文字', type: 'color', default: '#e2bba3' },
  { key: 'danger', group: '配色', label: '警示顏色', type: 'color', default: '#ffd166' },
  { key: 'input-bg', group: '配色', label: '輸入框底色', type: 'color', default: 'rgba(40, 2, 6, 0.45)' },
  // 抽獎機
  { key: 'ring-a', group: '抽獎機', label: '外環亮部', type: 'color', default: '#fff4d2' },
  { key: 'ring-b', group: '抽獎機', label: '外環主色', type: 'color', default: '#d8ac5a' },
  { key: 'ring-c', group: '抽獎機', label: '外環暗部', type: 'color', default: '#8a5a1c' },
  { key: 'drum-a', group: '抽獎機', label: '球槽中心', type: 'color', default: '#b3141c' },
  { key: 'drum-b', group: '抽獎機', label: '球槽邊緣', type: 'color', default: '#3e0205' },
  { key: 'ball-1', group: '抽獎機', label: '彩球 1（金）', type: 'color', default: '#e5b54a' },
  { key: 'ball-2', group: '抽獎機', label: '彩球 2（象牙白）', type: 'color', default: '#f3e3c3' },
  { key: 'ball-3', group: '抽獎機', label: '彩球 3（朱紅）', type: 'color', default: '#e0303a' },
  { key: 'ball-4', group: '抽獎機', label: '彩球 4（古銅）', type: 'color', default: '#c9793f' },
  { key: 'ball-5', group: '抽獎機', label: '彩球 5（香檳）', type: 'color', default: '#d8c08a' },
  { key: 'tray-ball', group: '抽獎機', label: '中獎球', type: 'color', default: '#f0c75e' },
  // 圖片與 Logo
  { key: 'logo-height', group: '圖片與 Logo', label: '左上角 Logo 高度', type: 'text', default: '48px' },
  { key: 'hub-logo-size', group: '圖片與 Logo', label: '抽獎機中心 Logo 大小', type: 'text', default: '74%' },
  { key: 'bg-deco-opacity', group: '圖片與 Logo', label: '背景裝飾圖透明度（0～1）', type: 'text', default: '0.9' },
  // 字型與尺寸
  { key: 'font', group: '字型與尺寸', label: '內文字型', type: 'text', default: '"Noto Sans TC", "Microsoft JhengHei", "PingFang TC", system-ui, sans-serif' },
  { key: 'font-display', group: '字型與尺寸', label: '標題字型（標題、中獎姓名）', type: 'text', default: '"Noto Serif TC", "PMingLiU", "Songti TC", serif' },
  { key: 'radius', group: '字型與尺寸', label: '卡片圓角', type: 'text', default: '20px' },
  { key: 'btn-radius', group: '字型與尺寸', label: '按鈕圓角', type: 'text', default: '14px' },
  { key: 'reg-title-size', group: '字型與尺寸', label: '登記頁標題字級', type: 'text', default: 'clamp(28px, 5vw, 40px)' },
  { key: 'draw-title-size', group: '字型與尺寸', label: '抽獎頁標題字級', type: 'text', default: 'clamp(22px, 3vw, 34px)' },
  { key: 'winner-size', group: '字型與尺寸', label: '中獎姓名字級', type: 'text', default: 'clamp(44px, 7vw, 76px)' },
  { key: 'machine-size', group: '字型與尺寸', label: '抽獎機大小', type: 'text', default: 'min(40vh, 80vw, 480px)' },
];

const texts = [
  // 登記頁
  { key: 'reg.brand', group: '登記頁', label: '左上角名稱', default: '世新大學 70 週年' },
  { key: 'reg.title', group: '登記頁', label: '大標題（也是瀏覽器分頁名稱）', default: '世新大學校友抽獎活動' },
  { key: 'reg.intro', group: '登記頁', label: '標題下說明', multiline: true, default: `填寫校友資料完成登記，即可參加現場抽獎。
每人限登記一次，祝您好運！` },
  { key: 'reg.formTitle', group: '登記頁', label: '表單標題', default: '校友登記' },
  { key: 'reg.formSub', group: '登記頁', label: '表單副標', default: '標示 * 為必填' },
  { key: 'reg.idType', group: '登記頁', label: '「證件類別」', default: '證件類別' },
  { key: 'reg.twid', group: '登記頁', label: '「身分證字號」', default: '身分證字號' },
  { key: 'reg.passport', group: '登記頁', label: '「護照號碼」', default: '護照號碼' },
  { key: 'reg.twidPh', group: '登記頁', label: '身分證欄提示字', default: '例：A123456789' },
  { key: 'reg.passportPh', group: '登記頁', label: '護照欄提示字', default: '請填寫護照上的號碼' },
  { key: 'reg.idHint', group: '登記頁', label: '證件欄下方說明', default: '僅作為身分核對與避免重複登記使用，不會公開顯示。' },
  { key: 'reg.name', group: '登記頁', label: '「姓名」', default: '姓名' },
  { key: 'reg.namePh', group: '登記頁', label: '姓名欄提示字', default: '請填寫目前的姓名' },
  { key: 'reg.renamed', group: '登記頁', label: '改名勾選文字', default: '我曾改過姓名' },
  { key: 'reg.former', group: '登記頁', label: '「改名前姓名」', default: '改名前姓名（在校時使用的姓名）' },
  { key: 'reg.formerPh', group: '登記頁', label: '改名前姓名提示字', default: '請填寫改名前的姓名' },
  { key: 'reg.optional', group: '登記頁', label: '選填分隔線文字', default: '以下為選填' },
  { key: 'reg.optTag', group: '登記頁', label: '「選填」小標', default: '選填' },
  { key: 'reg.dept', group: '登記頁', label: '「系所」', default: '系所' },
  { key: 'reg.deptPh', group: '登記頁', label: '系所提示字', default: '例：新聞學系' },
  { key: 'reg.studentNo', group: '登記頁', label: '「學號」', default: '學號' },
  { key: 'reg.studentNoPh', group: '登記頁', label: '學號提示字', default: '例：A10501234' },
  { key: 'reg.submit', group: '登記頁', label: '送出按鈕', default: '送出登記' },
  { key: 'reg.privacy', group: '登記頁', label: '個資說明', multiline: true, default: '您提供的個人資料僅用於本次校友抽獎活動之身分核對與得獎聯繫，活動結束後依規定銷毀。' },
  { key: 'reg.doneTitle', group: '登記頁', label: '完成畫面標題', default: '登記完成' },
  { key: 'reg.doneText', group: '登記頁', label: '完成畫面內容（{name} 會換成姓名）', default: '{name} 校友，感謝您的參與，祝您中大獎！' },
  { key: 'reg.doneNo', group: '登記頁', label: '登記編號（{no} 會換成編號）', default: '登記編號 {no}' },
  { key: 'reg.closedTitle', group: '登記頁', label: '截止畫面標題', default: '登記已截止' },
  { key: 'reg.closedText', group: '登記頁', label: '截止畫面內容', default: '本次活動已停止登記，感謝您的關注。' },
  // 抽獎頁
  { key: 'draw.brand', group: '抽獎頁', label: '左上角名稱', default: '世新大學 70 週年' },
  { key: 'draw.heading', group: '抽獎頁', label: '大標題', default: '今天的幸運校友是誰？' },
  { key: 'draw.leftPre', group: '抽獎頁', label: '剩餘人數（數字前）', default: '還有' },
  { key: 'draw.leftPost', group: '抽獎頁', label: '剩餘人數（數字後）', default: '位校友待抽' },
  { key: 'draw.hub', group: '抽獎頁', label: '轉盤中心文字（預設顯示 logo，留空即可）', multiline: true, default: '' },
  { key: 'draw.button', group: '抽獎頁', label: '抽獎按鈕', default: '開始抽獎' },
  { key: 'draw.drawing', group: '抽獎頁', label: '抽獎中按鈕', default: '抽獎中…' },
  { key: 'draw.allDone', group: '抽獎頁', label: '抽完時按鈕', default: '全部抽完了' },
  { key: 'draw.congrats', group: '抽獎頁', label: '中獎標語', default: '恭喜抽中' },
  { key: 'draw.former', group: '抽獎頁', label: '原名前綴', default: '原名' },
];

// 可在設計後台上傳替換的圖片（沒上傳就用 default）
const assets = [
  { key: 'logo', label: '左上角 Logo', hint: '登記頁、抽獎頁、後台左上角。建議透明背景 PNG／WebP，高度 200px 以上。', default: 'assets/logo-70-sm.webp', allowNone: true },
  { key: 'hub', label: '抽獎機中心 Logo', hint: '抽獎機中央的圓形區域，攪拌時會跟著轉。建議正方形、透明背景。選「不顯示」可改用「抽獎頁文字」裡的轉盤中心文字。', default: 'assets/logo-70-sm.webp', allowNone: true },
  { key: 'favicon', label: '瀏覽器分頁圖示', hint: '分頁標籤上的小圖示。建議正方形 PNG，128×128 以上。', default: 'assets/favicon.png', allowNone: false },
  { key: 'bg', label: '背景裝飾圖', hint: '整頁背景上的裝飾（目前是同心金圈與紅綢）。會鋪滿畫面，建議 1600×900 以上，或選「不顯示」只留底色。', default: 'assets/bg-deco.svg', allowNone: true },
];

module.exports = { vars, texts, assets };

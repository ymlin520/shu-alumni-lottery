// 世新校友抽獎活動：零相依 Node 伺服器
// 前台 /        校友登記
// 抽獎 /draw    投影用大樂透抽獎頁
// 後台 /admin   抽獎設定、中獎紀錄、名單管理
// 設計 /design  前台 CSS 與文字
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const DESIGN_SCHEMA = require('./design-defaults.js');

const PORT = Number(process.env.PORT) || 8123;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
// 另一場的資料夾（抽獎畫面按 Q／A 切過去用）
const SIBLING_DIR = process.env.SIBLING_DIR || path.join(ROOT, '..', 'shu-student-lottery');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const PW_FILE = path.join(ROOT, 'admin-password.txt');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads'); // 設計後台上傳的圖片（不進版控）
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------- 管理密碼 ----------
let ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  if (fs.existsSync(PW_FILE)) ADMIN_PASSWORD = fs.readFileSync(PW_FILE, 'utf8').trim();
  else {
    ADMIN_PASSWORD = 'shu' + crypto.randomInt(100000, 999999);
    fs.writeFileSync(PW_FILE, ADMIN_PASSWORD + '\n');
  }
}

// ---------- 資料 ----------
const EMPTY = { settings: { title: '世新大學校友抽獎活動', open: true, maskName: false, prize: '', showFsBtn: false, lenientPass: false, lenientCount: 0 }, design: { vars: {}, texts: {}, customCss: '', assets: {} }, entries: [], winners: [] };
let db = EMPTY;
if (fs.existsSync(DB_FILE)) {
  try { const saved = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); db = { ...EMPTY, ...saved, settings: { ...EMPTY.settings, ...saved.settings }, design: { ...EMPTY.design, assets: {}, ...saved.design } }; } catch (e) { console.error('db.json 讀取失敗，另存備份', e); fs.copyFileSync(DB_FILE, DB_FILE + '.broken-' + Date.now()); }
}
// 寫檔：整份 db.json 有 1 MB 以上，現場排隊報到時每個人都整份重寫會塞住，
// 所以把 200 毫秒內的多次變更合併成一次寫入；關掉程式前一定會補寫，資料不會少。
let saveTimer = null, savePending = false;
function writeNow() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
  // db.json 已經包含全部內容，日誌可以清掉
  try { if (fs.existsSync(JOURNAL) && fs.statSync(JOURNAL).size) fs.writeFileSync(JOURNAL, ''); } catch {}
}
// save()：後台操作等等要馬上落地，直接寫。
// save(true)：現場報到用，允許延後 200 毫秒合併寫，期間靠報到日誌保命。
function save(deferred) {
  if (!deferred) {
    savePending = false;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    return writeNow();
  }
  savePending = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (savePending) { savePending = false; writeNow(); }
  }, 200);
}
// ---------- 報到日誌（斷電／強制關閉的保險） ----------
// 報到當下只 append 一行（幾十位元組），很快；db.json 寫成功後日誌就清空。
const JOURNAL = path.join(DATA_DIR, 'checkin-journal.log');
function journal(entry) {
  try { fs.appendFileSync(JOURNAL, JSON.stringify(entry) + '\n'); } catch (e) { console.error('報到日誌寫入失敗', e); }
}
function replayJournal() {
  if (!fs.existsSync(JOURNAL)) return;
  let text = '';
  try { text = fs.readFileSync(JOURNAL, 'utf8'); } catch { return; }
  let n = 0;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      const e = db.entries.find((x) => x.id === r.id);
      if (e) { if (!e.registered) { Object.assign(e, r); n++; } } else { db.entries.push(r); n++; }
    } catch {}
  }
  if (n) { console.log(`[復原] 從報到日誌補回 ${n} 筆報到紀錄`); writeNow(); }
  else { try { fs.writeFileSync(JOURNAL, ''); } catch {} }
}
function flushSave() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  if (savePending) { savePending = false; try { writeNow(); } catch (e) { console.error('關閉前寫檔失敗', e); } }
}
process.on('exit', flushSave);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(sig, () => { flushSave(); process.exit(0); });
}
replayJournal(); // 上次若被強制關掉，把日誌裡還沒寫進 db.json 的報到補回來

// ---------- 驗證 ----------
const LETTER_CODE = { A:10,B:11,C:12,D:13,E:14,F:15,G:16,H:17,I:34,J:18,K:19,L:20,M:21,N:22,O:35,P:23,Q:24,R:25,S:26,T:27,U:28,V:29,W:32,X:30,Y:31,Z:33 };
function validTwId(id) {
  // 身分證 A123456789；新式居留證 A800000014（第二碼 8/9）
  if (!/^[A-Z][1289]\d{8}$/.test(id)) return false;
  const n = LETTER_CODE[id[0]];
  let sum = Math.floor(n / 10) + (n % 10) * 9;
  const w = [8, 7, 6, 5, 4, 3, 2, 1];
  for (let i = 0; i < 8; i++) sum += Number(id[i + 1]) * w[i];
  sum += Number(id[9]);
  return sum % 10 === 0;
}
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, max);
const maskId = (id) => id.length <= 4 ? id[0] + '***' : id.slice(0, 2) + '*'.repeat(Math.max(3, id.length - 5)) + id.slice(-3);

// ---------- 工具 ----------
const sessions = new Map(); // token -> 到期時間
const rate = new Map();     // ip -> [時間戳]
function limited(ip, max = 20, windowMs = 60_000) {
  const now = Date.now();
  const arr = (rate.get(ip) || []).filter((t) => now - t < windowMs);
  arr.push(now);
  rate.set(ip, arr);
  return arr.length > max;
}
function send(res, code, obj, headers = {}) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 120_000) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}
function cookie(req, name) {
  const m = (req.headers.cookie || '').match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return m ? decodeURIComponent(m[1]) : null;
}
function isAdmin(req) {
  const t = cookie(req, 'sid');
  const exp = t && sessions.get(t);
  if (!exp || exp < Date.now()) return false;
  sessions.set(t, Date.now() + 12 * 3600_000);
  return true;
}
// 設計後台獨立登入：就算已登入後台，進 /design 也要再輸入密碼；2 小時後失效，不會自動延長
const designSessions = new Map(); // token -> 到期時間
const DESIGN_TTL = 2 * 3600_000;
function isDesigner(req) {
  const t = cookie(req, 'dsid');
  const exp = t && designSessions.get(t);
  if (!exp || exp < Date.now()) { if (t) designSessions.delete(t); return false; }
  return true;
}
const DESIGN_APIS = new Set(['/api/admin/design', '/api/admin/upload', '/api/admin/design-logout']);
const clientIp = (req) => req.headers['cf-connecting-ip'] || req.socket.remoteAddress || '';

const publicEntry = (e, winnerSet) => ({
  id: e.id, no: e.no, name: e.name, renamed: e.renamed, formerName: e.formerName,
  dept: e.dept, className: e.className || '', phone: e.phone || '', email: e.email || '',
  studentNo: e.studentNo, idType: e.idType, idNo: e.idNo, idMasked: maskId(e.idNo),
  source: e.source || '', registered: !!e.registered, registeredAt: e.registeredAt || null,
  createdAt: e.createdAt, won: winnerSet.has(e.id),
});

// ---------- 現場登記＝用身分證號在校友名冊裡核對姓名 ----------
// 名冊由 data/db.json 的 entries 匯入而來；核對成功才把那筆標成「已登記」，
// 抽獎只從已登記的人裡面抽。
const normId = (v) => clean(v, 30).toUpperCase().replace(/[\s-]/g, '');
const normName = (v) => clean(v, 40).replace(/\s/g, '').replace(/臺/g, '台');

function checkIn(b) {
  const idNo = normId(b.idNo);
  const name = clean(b.name, 40);
  if (!idNo) return { code: 400, error: '請填寫身分證號。', field: 'idNo' };
  if (!name) return { code: 400, error: '請填寫姓名。', field: 'name' };
  const entry = db.entries.find((e) => e.idNo === idNo);
  if (!entry) {
    // 寬鬆登記：名冊查無這個號碼時不擋，前台照樣顯示「已完成登記」，
    // 但不建立任何資料、不進抽獎池，後台只累加一個不含個資的次數。
    if (db.settings.lenientPass) {
      db.settings.lenientCount = (db.settings.lenientCount || 0) + 1;
      save();
      return { skipped: true, name };
    }
    return { code: 404, error: '查無此身分證號，請確認輸入是否正確，或洽現場服務台。', field: 'idNo' };
  }
  if (normName(entry.name) !== normName(name)) return { code: 400, error: '姓名有誤，請確認與校友名冊上的姓名一致。', field: 'name' };
  if (entry.registered) return { already: true, entry };
  entry.registered = true;
  entry.registeredAt = new Date().toISOString();
  journal({ id: entry.id, registered: true, registeredAt: entry.registeredAt });
  save(true);
  return { entry };
}
function parseEntry(b, selfId) {
  const idType = b.idType === 'passport' ? 'passport' : 'twid';
  const idNo = clean(b.idNo, 20).toUpperCase().replace(/\s|-/g, '');
  const name = clean(b.name, 40);
  const renamed = !!b.renamed;
  const formerName = renamed ? clean(b.formerName, 40) : '';
  const dept = clean(b.dept, 60);
  const className = clean(b.className, 120);
  const phone = clean(b.phone, 40);
  const email = clean(b.email, 120);
  const studentNo = clean(b.studentNo, 20).toUpperCase();
  // 匯入的名冊裡有舊式、居留證、外籍等非標準號碼，編輯時只要號碼沒動就不檢查格式，
  // 真的要改成非標準號碼時，前端會再問一次並帶 idNoConfirmed 過來。
  const self = selfId ? db.entries.find((e) => e.id === selfId) : null;
  const idUnchanged = !!self && self.idNo === idNo;
  if (!idNo) return { error: '請填寫證件號碼。', field: 'idNo' };
  if (!idUnchanged && !b.idNoConfirmed) {
    if (idType === 'twid' && !validTwId(idNo)) return { error: '身分證字號格式不正確，請再確認。', field: 'idNo', confirmable: true };
    if (idType === 'passport' && !/^[A-Z0-9]{5,20}$/.test(idNo)) return { error: '護照號碼格式不正確（5–20 碼英數字）。', field: 'idNo', confirmable: true };
  }
  if (!name) return { error: '請填寫姓名。', field: 'name' };
  if (renamed && !formerName) return { error: '勾選曾改名，請填寫改名前的姓名。', field: 'formerName' };
  if (!dept) return { error: '請填寫系所。', field: 'dept' };
  const dup = db.entries.find((e) => e.idNo === idNo && e.id !== selfId);
  if (dup) return { code: 409, error: `名冊裡已經有這個證件號碼了（編號 ${dup.no}　${dup.name}），不能重複。`, field: 'idNo' };
  return { data: { idType, idNo, name, renamed, formerName, dept, className, phone, email, studentNo } };
}
function addEntry(data) {
  const no = 'A' + String(db.entries.reduce((mx, e) => Math.max(mx, Number(e.no.slice(1))), 0) + 1).padStart(4, '0');
  const entry = { id: crypto.randomUUID(), no, ...data, createdAt: new Date().toISOString() };
  db.entries.push(entry); save();
  return entry;
}
function remaining() {
  const won = new Set(db.winners.map((w) => w.entryId));
  return db.entries.filter((e) => e.registered && !won.has(e.id));
}

// ---------- 設計（前台 CSS 變數、文字、自訂 CSS） ----------
function currentDesign() {
  const vars = {}, texts = {};
  for (const v of DESIGN_SCHEMA.vars) vars[v.key] = db.design.vars[v.key] ?? v.default;
  for (const t of DESIGN_SCHEMA.texts) texts[t.key] = db.design.texts[t.key] ?? t.default;
  return { vars, texts, customCss: db.design.customCss || '', assets: { ...(db.design.assets || {}) } };
}
const safeCssValue = (v) => String(v ?? '').replace(/[;{}<>]/g, '').trim().slice(0, 300);
function designHead() {
  const d = currentDesign();
  const rootVars = ':root{' + Object.entries(d.vars).map(([k, v]) => `--${k}:${safeCssValue(v)};`).join('') + '}';
  // 用 encodeURIComponent 包 JSON，避免內容裡的 </script> 之類字元破壞頁面
  return `<style id="design-vars">${rootVars}</style><style id="design-custom">${d.customCss.replace(/</g, '')}</style>`
    + `<script>window.__DESIGN__=JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(d))}"));</script>`;
}

// 從另一場的 tunnel.log 讀出它「目前」的 Cloudflare 臨時網址
// （臨時網址每次重開都會變，寫死在設定裡會失效）
function siblingDrawUrl() {
  try {
    const txt = fs.readFileSync(path.join(SIBLING_DIR, 'data', 'tunnel.log'), 'utf8');
    const all = txt.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/g);
    if (all && all.length) return all[all.length - 1] + '/draw';
  } catch {}
  return null;
}

// ---------- 設計後台上傳的圖片 ----------
const ASSET_SLOTS = Object.fromEntries(DESIGN_SCHEMA.assets.map((a) => [a.key, a]));
const BLANK_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
function readRaw(req, max) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > max) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
// 用檔頭判斷圖片格式，不相信副檔名或 Content-Type
function sniffImage(b) {
  if (b.length < 12) return null;
  if (b[0] === 0x89 && b.toString('latin1', 1, 4) === 'PNG') return 'png';
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b.toString('latin1', 0, 4) === 'GIF8') return 'gif';
  if (b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (b[0] === 0 && b[1] === 0 && b[2] === 1 && b[3] === 0) return 'ico';
  const head = b.toString('utf8', 0, Math.min(b.length, 2048)).replace(/^\uFEFF/, '').trimStart();
  if ((head.startsWith('<?xml') || head.startsWith('<svg') || head.startsWith('<!--')) && head.includes('<svg')) return 'svg';
  return null;
}
function serveFile(res, file, extraHeaders = {}) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('找不到圖片'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', ...extraHeaders });
    res.end(buf);
  });
}
// 上傳的 SVG 可能夾帶程式碼，一律用沙盒 CSP 送出，直接開網址也不會執行
const UPLOAD_HEADERS = { 'Content-Security-Policy': "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox" };
function serveUpload(res, file) { serveFile(res, path.join(UPLOAD_DIR, file), UPLOAD_HEADERS); }
function serveBrand(req, res, slot, forceDefault) {
  const a = ASSET_SLOTS[slot];
  if (!a) { res.writeHead(404); return res.end(); }
  const v = forceDefault ? null : (db.design.assets || {})[slot];
  if (v === 'none') { res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-cache' }); return res.end(BLANK_SVG); }
  if (v && fs.existsSync(path.join(UPLOAD_DIR, v))) return serveUpload(res, v);
  return serveFile(res, path.join(ROOT, 'public', a.default));
}
// 刪掉沒被使用、且超過 1 小時的上傳檔（留 1 小時給還沒按儲存的編輯）
function cleanupUploads() {
  const used = new Set(Object.values(db.design.assets || {}));
  for (const f of fs.readdirSync(UPLOAD_DIR)) {
    const full = path.join(UPLOAD_DIR, f);
    try { if (!used.has(f) && Date.now() - fs.statSync(full).mtimeMs > 3600_000) fs.unlinkSync(full); } catch {}
  }
}

// ---------- 靜態檔 ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
function serveStatic(req, res, file) {
  const p = path.join(ROOT, 'public', file);
  if (!p.startsWith(path.join(ROOT, 'public'))) return send(res, 403, { error: 'forbidden' });
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('找不到頁面'); }
    if (file === 'index.html' || file === 'draw.html') buf = Buffer.from(buf.toString('utf8').replace('</head>', designHead() + '</head>'));
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
    res.end(buf);
  });
}

// ---------- 路由 ----------
async function handle(req, res) {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const m = req.method;

  if (m === 'GET' && (p === '/' || p === '/index.html')) return serveStatic(req, res, 'index.html');
  if (m === 'GET' && (p === '/admin' || p === '/admin/')) return serveStatic(req, res, 'admin.html');
  if (m === 'GET' && (p === '/draw' || p === '/draw/')) return serveStatic(req, res, 'draw.html');
  if (m === 'GET' && (p === '/design' || p === '/design/')) return serveStatic(req, res, 'design.html');
  if (m === 'GET' && /^\/assets\/[\w.-]+$/.test(p)) return serveStatic(req, res, p.slice(1));
  let bm;
  if (m === 'GET' && (bm = p.match(/^\/brand\/([a-z]+)$/))) return serveBrand(req, res, bm[1], url.searchParams.has('default'));
  if (m === 'GET' && (bm = p.match(/^\/uploads\/([a-z]+-\d+\.(?:png|jpg|jpeg|gif|webp|svg|ico))$/))) return serveUpload(res, bm[1]);

  // 前台
  if (m === 'GET' && p === '/api/status') {
    // count = 現場已報到人數；remaining = 已報到且還沒中獎
    return send(res, 200, { title: db.settings.title, open: db.settings.open, count: db.entries.filter((e) => e.registered).length, remaining: remaining().length });
  }
  if (m === 'POST' && p === '/api/register') {
    if (!db.settings.open) return send(res, 403, { error: '本次登記已截止，感謝您的參與。' });
    let b; try { b = await readBody(req); } catch { return send(res, 400, { error: '資料格式錯誤' }); }
    // 現場上千人共用校內 Wi-Fi 會是同一個對外 IP，所以流量限制改用「證號」為單位：
    // 同一個號碼每分鐘最多試 12 次（擋住猜姓名），不同人之間不會互相影響。
    // 另外保留一個很寬的整體上限，純粹擋住異常洪水。
    if (limited('id:' + normId(b.idNo), 12)) return send(res, 429, { error: '這組號碼嘗試太多次，請稍候一分鐘再試，或洽現場服務台。', field: 'idNo' });
    if (limited('all', 3000)) return send(res, 429, { error: '目前報到人數太多，請稍等幾秒再送出一次。' });
    const v = checkIn(b);
    if (v.error) return send(res, v.code || 400, { error: v.error, field: v.field });
    if (v.skipped) return send(res, 200, { ok: true, already: false, no: '', name: v.name, dept: '' });
    return send(res, 200, { ok: true, already: !!v.already, no: v.entry.no, name: v.entry.name, dept: v.entry.dept });
  }

  // 後台登入
  if (m === 'POST' && p === '/api/admin/login') {
    if (limited('login:' + clientIp(req), 10)) return send(res, 429, { error: '嘗試太多次，請稍候一分鐘。' });
    let b; try { b = await readBody(req); } catch { return send(res, 400, { error: '資料格式錯誤' }); }
    const a = Buffer.from(String(b.password || '')), c = Buffer.from(ADMIN_PASSWORD);
    if (a.length !== c.length || !crypto.timingSafeEqual(a, c)) return send(res, 401, { error: '密碼錯誤' });
    const t = crypto.randomBytes(24).toString('hex');
    if (b.scope === 'design') { // 設計後台用自己的登入
      designSessions.set(t, Date.now() + DESIGN_TTL);
      return send(res, 200, { ok: true }, { 'Set-Cookie': `dsid=${t}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${DESIGN_TTL / 1000}` });
    }
    sessions.set(t, Date.now() + 12 * 3600_000);
    return send(res, 200, { ok: true }, { 'Set-Cookie': `sid=${t}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200` });
  }
  if (p.startsWith('/api/admin/')) {
    // 設計相關 API 只認設計後台的登入；其他後台 API 只認後台登入
    if (DESIGN_APIS.has(p) ? !isDesigner(req) : !isAdmin(req)) return send(res, 401, { error: '請先登入' });
    if (m === 'POST' && p === '/api/admin/design-logout') { designSessions.delete(cookie(req, 'dsid')); return send(res, 200, { ok: true }, { 'Set-Cookie': 'dsid=; Path=/; Max-Age=0' }); }
    const winnerSet = new Set(db.winners.map((w) => w.entryId));

    if (m === 'POST' && p === '/api/admin/logout') { sessions.delete(cookie(req, 'sid')); return send(res, 200, { ok: true }, { 'Set-Cookie': 'sid=; Path=/; Max-Age=0' }); }
    if (m === 'GET' && p === '/api/admin/state') {
      return send(res, 200, {
        settings: db.settings,
        entries: db.entries.map((e) => publicEntry(e, winnerSet)),
        winners: db.winners.map((w) => ({ ...w, idNo: (db.entries.find((e) => e.id === w.entryId) || {}).idNo || '' })),
        remaining: remaining().length,
      });
    }
    if (m === 'GET' && p === '/api/admin/switch-url') return send(res, 200, { url: siblingDrawUrl() });
    if (m === 'GET' && p === '/api/admin/draw-info') {
      return send(res, 200, { settings: db.settings, remaining: remaining().length });
    }
    if (m === 'POST' && p === '/api/admin/upload') {
      const slot = url.searchParams.get('slot');
      if (!ASSET_SLOTS[slot]) return send(res, 400, { error: '不支援的圖片位置' });
      let buf; try { buf = await readRaw(req, 5 * 1024 * 1024); } catch { return send(res, 413, { error: '圖片太大，請小於 5 MB。' }); }
      const ext = sniffImage(buf);
      if (!ext) return send(res, 400, { error: '只接受 PNG、JPG、GIF、WebP、SVG、ICO 圖片。' });
      const file = `${slot}-${Date.now()}.${ext}`;
      fs.writeFileSync(path.join(UPLOAD_DIR, file), buf);
      return send(res, 200, { ok: true, file, url: '/uploads/' + file, size: buf.length });
    }
    if (m === 'GET' && p === '/api/admin/design') {
      return send(res, 200, { schema: DESIGN_SCHEMA, design: currentDesign() });
    }
    if (m === 'POST' && p === '/api/admin/design') {
      let b; try { b = await readBody(req); } catch { return send(res, 400, { error: '資料格式錯誤' }); }
      const vars = {}, texts = {};
      for (const v of DESIGN_SCHEMA.vars) {
        const val = safeCssValue(b.vars?.[v.key]);
        if (val && val !== v.default) vars[v.key] = val;
      }
      for (const t of DESIGN_SCHEMA.texts) {
        const val = String(b.texts?.[t.key] ?? '').slice(0, 500);
        if (val !== t.default && b.texts && t.key in b.texts) texts[t.key] = val;
      }
      const assets = {};
      for (const a of DESIGN_SCHEMA.assets) {
        const v = b.assets?.[a.key];
        if (v === 'none' && a.allowNone) assets[a.key] = 'none';
        else if (typeof v === 'string' && new RegExp('^' + a.key + '-\\d+\\.(png|jpg|jpeg|gif|webp|svg|ico)$').test(v) && fs.existsSync(path.join(UPLOAD_DIR, v))) assets[a.key] = v;
      }
      db.design = { vars, texts, customCss: String(b.customCss || '').slice(0, 50_000), assets };
      save();
      cleanupUploads();
      return send(res, 200, { ok: true, design: currentDesign() });
    }
    if (m === 'POST' && p === '/api/admin/settings') {
      const b = await readBody(req).catch(() => ({}));
      if (typeof b.open === 'boolean') db.settings.open = b.open;
      if (typeof b.maskName === 'boolean') db.settings.maskName = b.maskName;
      if (typeof b.showFsBtn === 'boolean') db.settings.showFsBtn = b.showFsBtn;
      if (typeof b.lenientPass === 'boolean') db.settings.lenientPass = b.lenientPass;
      if (b.resetLenientCount === true) db.settings.lenientCount = 0;
      if (typeof b.title === 'string' && b.title.trim()) db.settings.title = clean(b.title, 60);
      if (typeof b.prize === 'string') db.settings.prize = clean(b.prize, 30); // 可留空
      save(); return send(res, 200, { ok: true, settings: db.settings });
    }
    if (m === 'POST' && p === '/api/admin/draw') {
      const b = await readBody(req).catch(() => ({}));
      const pool = remaining();
      if (!pool.length) return send(res, 400, { error: '已經沒有待抽的校友了。' });
      const e = pool[crypto.randomInt(pool.length)];
      const w = { id: crypto.randomUUID(), entryId: e.id, no: e.no, name: e.name, formerName: e.formerName, dept: e.dept,
        className: e.className || '', phone: e.phone || '', email: e.email || '', studentNo: e.studentNo, idMasked: maskId(e.idNo),
        prize: clean(b.prize, 30) || db.settings.prize || '', drawnAt: new Date().toISOString() };
      db.winners.push(w); save();
      return send(res, 200, { ok: true, winner: w, remaining: pool.length - 1 });
    }
    let mm;
    if (m === 'DELETE' && (mm = p.match(/^\/api\/admin\/winners\/([\w-]+)$/))) {
      db.winners = db.winners.filter((w) => w.id !== mm[1]); save(); return send(res, 200, { ok: true });
    }
    if (m === 'POST' && p === '/api/admin/winners/reset') { db.winners = []; save(); return send(res, 200, { ok: true }); }
    if (m === 'POST' && p === '/api/admin/entries') {
      let b; try { b = await readBody(req); } catch { return send(res, 400, { error: '資料格式錯誤' }); }
      const v = parseEntry(b);
      if (v.error) return send(res, v.code || 400, { error: v.error, field: v.field, confirmable: v.confirmable });
      const entry = addEntry({ ...v.data, addedBy: 'admin', source: 'manual', registered: true, registeredAt: new Date().toISOString() });
      return send(res, 200, { ok: true, entry: publicEntry(entry, winnerSet) });
    }
    if (m === 'POST' && (mm = p.match(/^\/api\/admin\/entries\/([\w-]+)\/unregister$/))) {
      // 單筆取消登記（報到按錯人時用）；已中獎的要先撤銷中獎紀錄
      const e = db.entries.find((x) => x.id === mm[1]);
      if (!e) return send(res, 404, { error: '找不到這筆資料' });
      if (db.winners.some((w) => w.entryId === e.id)) return send(res, 409, { error: '這位校友已經中獎，請先到「中獎紀錄」撤銷那一筆，再取消登記。' });
      e.registered = false; e.registeredAt = null; save();
      return send(res, 200, { ok: true, entry: publicEntry(e, winnerSet) });
    }
    if (m === 'POST' && p === '/api/admin/entries/unregister') {
      // 名冊保留，只把全部人改回「未登記」（活動前清掉測試報到用）
      let n = 0;
      for (const e of db.entries) if (e.registered) { e.registered = false; e.registeredAt = null; n++; }
      db.winners = []; save();
      return send(res, 200, { ok: true, reset: n });
    }
    if (m === 'POST' && p === '/api/admin/entries/reset') {
      const n = db.entries.length;
      db.entries = []; db.winners = []; save();
      return send(res, 200, { ok: true, removed: n });
    }
    if (m === 'GET' && (mm = p.match(/^\/api\/admin\/entries\/([\w-]+)$/))) {
      const e = db.entries.find((x) => x.id === mm[1]);
      if (!e) return send(res, 404, { error: '找不到這筆資料' });
      return send(res, 200, { entry: e }); // 編輯用，含完整證件號碼
    }
    if (m === 'PUT' && (mm = p.match(/^\/api\/admin\/entries\/([\w-]+)$/))) {
      const e = db.entries.find((x) => x.id === mm[1]);
      if (!e) return send(res, 404, { error: '找不到這筆資料' });
      let b; try { b = await readBody(req); } catch { return send(res, 400, { error: '資料格式錯誤' }); }
      const v = parseEntry(b, e.id);
      if (v.error) return send(res, v.code || 400, { error: v.error, field: v.field, confirmable: v.confirmable });
      Object.assign(e, v.data, { updatedAt: new Date().toISOString() });
      // 中獎紀錄一併同步，投影畫面與匯出才不會顯示舊資料
      for (const w of db.winners) if (w.entryId === e.id) Object.assign(w, { name: e.name, formerName: e.formerName, dept: e.dept,
        className: e.className || '', phone: e.phone || '', email: e.email || '', studentNo: e.studentNo, idMasked: maskId(e.idNo) });
      save();
      return send(res, 200, { ok: true, entry: publicEntry(e, winnerSet) });
    }
    if (m === 'DELETE' && (mm = p.match(/^\/api\/admin\/entries\/([\w-]+)$/))) {
      db.entries = db.entries.filter((e) => e.id !== mm[1]);
      db.winners = db.winners.filter((w) => w.entryId !== mm[1]);
      save(); return send(res, 200, { ok: true });
    }
    if (m === 'GET' && p === '/api/admin/export.csv') {
      const q = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
      const winMap = new Map(db.winners.map((w) => [w.entryId, w]));
      const when = (v) => (v ? new Date(v).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) : '');
      // ?only=registered 只匯出報名完成的人，照報到時間排序
      const onlyReg = url.searchParams.get('only') === 'registered';
      const list = onlyReg
        ? db.entries.filter((e) => e.registered).sort((a, b) => String(a.registeredAt).localeCompare(String(b.registeredAt)))
        : db.entries;
      const rows = [['編號', '身分證號', '姓名', '系所', '班級', '電話', 'Email', '是否已登記', '登記時間', '來源', '中獎獎項', '抽出時間']];
      for (const e of list) {
        const w = winMap.get(e.id);
        rows.push([e.no, e.idNo, e.name, e.dept, e.className || '', e.phone || '', e.email || '',
          e.registered ? '已登記' : '', when(e.registeredAt), e.source === 'manual' ? '後台補登' : '匯入名冊',
          w ? w.prize : '', w ? when(w.drawnAt) : '']);
      }
      const csv = '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n');
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(onlyReg ? '世新校友抽獎-報名完成名單.csv' : '世新校友抽獎-校友名冊.csv'), 'Cache-Control': 'no-store' });
      return res.end(csv);
    }
    return send(res, 404, { error: 'not found' });
  }
  return send(res, 404, { error: 'not found' });
}

// ---------- 啟動伺服器 ----------
// 現場可能上千支手機同時送出，這裡把連線佇列開大、加上逾時，
// 並且確保任何意外都只記錄不結束程式（報到不能中斷）。
process.on('uncaughtException', (e) => console.error('[未攔截的例外，已忽略繼續服務]', e));
process.on('unhandledRejection', (e) => console.error('[未處理的 Promise，已忽略繼續服務]', e));

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => { console.error(e); if (!res.headersSent) send(res, 500, { error: '伺服器錯誤' }); });
});
server.headersTimeout = 15_000;   // 15 秒還沒把表頭送完就放掉
server.requestTimeout = 20_000;   // 單一請求最多 20 秒
server.keepAliveTimeout = 10_000; // 閒置連線 10 秒回收
server.on('clientError', (err, socket) => {            // 壞掉的連線不要讓程式倒
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  socket.destroy();
});
// 每 5 分鐘清掉過期的流量計數與登入權杖，活動開一整天也不會越吃越多記憶體
setInterval(() => {
  const now = Date.now();
  for (const [k, arr] of rate) { const live = arr.filter((t) => now - t < 60_000); live.length ? rate.set(k, live) : rate.delete(k); }
  for (const [t, exp] of sessions) if (exp < now) sessions.delete(t);
  for (const [t, exp] of designSessions) if (exp < now) designSessions.delete(t);
}, 300_000).unref();

server.listen(PORT, 2048, () => {  // 2048 = 連線佇列長度，瞬間湧入也排得下
  console.log(`世新校友抽獎：http://localhost:${PORT}  後台 /admin  密碼：${ADMIN_PASSWORD}`);
});


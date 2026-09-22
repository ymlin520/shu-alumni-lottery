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
const EMPTY = { settings: { title: '世新大學校友抽獎活動', open: true, maskName: false, prize: '' }, design: { vars: {}, texts: {}, customCss: '', assets: {} }, entries: [], winners: [] };
let db = EMPTY;
if (fs.existsSync(DB_FILE)) {
  try { const saved = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); db = { ...EMPTY, ...saved, settings: { ...EMPTY.settings, ...saved.settings }, design: { ...EMPTY.design, assets: {}, ...saved.design } }; } catch (e) { console.error('db.json 讀取失敗，另存備份', e); fs.copyFileSync(DB_FILE, DB_FILE + '.broken-' + Date.now()); }
}
function save() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}

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
  dept: e.dept, studentNo: e.studentNo, idType: e.idType, idMasked: maskId(e.idNo),
  createdAt: e.createdAt, won: winnerSet.has(e.id),
});
function parseEntry(b, selfId) {
  const idType = b.idType === 'passport' ? 'passport' : 'twid';
  const idNo = clean(b.idNo, 20).toUpperCase().replace(/\s|-/g, '');
  const name = clean(b.name, 40);
  const renamed = !!b.renamed;
  const formerName = renamed ? clean(b.formerName, 40) : '';
  const dept = clean(b.dept, 60);
  const studentNo = clean(b.studentNo, 20).toUpperCase();
  if (idType === 'twid' && !validTwId(idNo)) return { error: '身分證字號格式不正確，請再確認。', field: 'idNo' };
  if (idType === 'passport' && !/^[A-Z0-9]{5,20}$/.test(idNo)) return { error: '護照號碼格式不正確（5–20 碼英數字）。', field: 'idNo' };
  if (!name) return { error: '請填寫姓名。', field: 'name' };
  if (renamed && !formerName) return { error: '勾選曾改名，請填寫改名前的姓名。', field: 'formerName' };
  const dup = db.entries.find((e) => e.idNo === idNo && e.id !== selfId);
  if (dup) return { code: 409, error: `此證件號碼已於 ${new Date(dup.createdAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })} 完成登記（登記編號 ${dup.no}），每人限登記一次。`, field: 'idNo' };
  return { data: { idType, idNo, name, renamed, formerName, dept, studentNo } };
}
function addEntry(data) {
  const no = 'A' + String(db.entries.reduce((mx, e) => Math.max(mx, Number(e.no.slice(1))), 0) + 1).padStart(4, '0');
  const entry = { id: crypto.randomUUID(), no, ...data, createdAt: new Date().toISOString() };
  db.entries.push(entry); save();
  return entry;
}
function remaining() {
  const won = new Set(db.winners.map((w) => w.entryId));
  return db.entries.filter((e) => !won.has(e.id));
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
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.ico': 'image/x-icon' };
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
    return send(res, 200, { title: db.settings.title, open: db.settings.open, count: db.entries.length });
  }
  if (m === 'POST' && p === '/api/register') {
    if (limited(clientIp(req))) return send(res, 429, { error: '送出太頻繁，請稍候一分鐘再試。' });
    if (!db.settings.open) return send(res, 403, { error: '本次登記已截止，感謝您的參與。' });
    let b; try { b = await readBody(req); } catch { return send(res, 400, { error: '資料格式錯誤' }); }
    const v = parseEntry(b);
    if (v.error) return send(res, v.code || 400, { error: v.error, field: v.field });
    const entry = addEntry(v.data);
    return send(res, 200, { ok: true, no: entry.no, name: entry.name });
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
        winners: db.winners,
        remaining: remaining().length,
      });
    }
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
      if (typeof b.title === 'string' && b.title.trim()) db.settings.title = clean(b.title, 60);
      if (typeof b.prize === 'string') db.settings.prize = clean(b.prize, 30); // 可留空
      save(); return send(res, 200, { ok: true, settings: db.settings });
    }
    if (m === 'POST' && p === '/api/admin/draw') {
      const b = await readBody(req).catch(() => ({}));
      const pool = remaining();
      if (!pool.length) return send(res, 400, { error: '已經沒有待抽的校友了。' });
      const e = pool[crypto.randomInt(pool.length)];
      const w = { id: crypto.randomUUID(), entryId: e.id, no: e.no, name: e.name, formerName: e.formerName, dept: e.dept, studentNo: e.studentNo, idMasked: maskId(e.idNo), prize: clean(b.prize, 30) || db.settings.prize || '', drawnAt: new Date().toISOString() };
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
      if (v.error) return send(res, v.code || 400, { error: v.error, field: v.field });
      const entry = addEntry({ ...v.data, addedBy: 'admin' });
      return send(res, 200, { ok: true, entry: publicEntry(entry, winnerSet) });
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
      if (v.error) return send(res, v.code || 400, { error: v.error, field: v.field });
      Object.assign(e, v.data, { updatedAt: new Date().toISOString() });
      // 中獎紀錄一併同步，投影畫面與匯出才不會顯示舊資料
      for (const w of db.winners) if (w.entryId === e.id) Object.assign(w, { name: e.name, formerName: e.formerName, dept: e.dept, studentNo: e.studentNo, idMasked: maskId(e.idNo) });
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
      const rows = [['登記編號', '證件類別', '證件號碼', '姓名', '曾改名', '原姓名', '系所', '學號', '登記時間', '中獎獎項', '抽出時間']];
      for (const e of db.entries) {
        const w = winMap.get(e.id);
        rows.push([e.no, e.idType === 'passport' ? '護照' : '身分證', e.idNo, e.name, e.renamed ? '是' : '', e.formerName, e.dept, e.studentNo,
          new Date(e.createdAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }), w ? w.prize : '', w ? new Date(w.drawnAt).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) : '']);
      }
      const csv = '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n');
      res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent('世新校友抽獎名單.csv'), 'Cache-Control': 'no-store' });
      return res.end(csv);
    }
    return send(res, 404, { error: 'not found' });
  }
  return send(res, 404, { error: 'not found' });
}

http.createServer((req, res) => {
  handle(req, res).catch((e) => { console.error(e); if (!res.headersSent) send(res, 500, { error: '伺服器錯誤' }); });
}).listen(PORT, () => {
  console.log(`世新校友抽獎：http://localhost:${PORT}  後台 /admin  密碼：${ADMIN_PASSWORD}`);
});

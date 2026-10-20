// ============================================================
//  To be done · 验证码后台 (Render 版)
//  Express server + Vercel Blob 存储（复用已搭好的 frost-vercel Blob）
//  朋友只连 *.onrender.com（国内可达），server 在境外调 Blob API
// ============================================================

const express = require('express');
const path = require('path');
const { put, list } = require('@vercel/blob');

const app = express();
const PORT = process.env.PORT || 3000;

// 密码（中文数字逐位核对：二零零一零三一八）
const ADMIN_PWD = process.env.ADMIN_PWD || '20010318';
const STATE_KEY = 'frost-state.json';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-admin-pwd');
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

// ---- 工具 ----
function now() { return new Date().toISOString(); }

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function genLogId() { return 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); }

// ---- 状态读写（Vercel Blob） ----
async function readState() {
  try {
    const ls = await list({ prefix: STATE_KEY });
    const blob = ls.blobs.find((b) => b.pathname === STATE_KEY);
    if (!blob) return { codes: {}, logs: [] };
    const res = await fetch(blob.url, { cache: 'no-store' });
    if (!res.ok) return { codes: {}, logs: [] };
    const data = await res.json();
    if (!data.codes) data.codes = {};
    if (!data.logs) data.logs = [];
    return data;
  } catch (e) {
    console.error('readState error:', e.message);
    return { codes: {}, logs: [] };
  }
}

async function writeState(state) {
  await put(STATE_KEY, JSON.stringify(state), {
    access: 'public',
    allowOverwrite: true,
    addRandomSuffix: false,
    contentType: 'application/json',
  });
}

async function writeLog(state, code, deviceId, action, ok, detail) {
  state.logs.unshift({
    id: genLogId(),
    code: code || '',
    deviceId: deviceId || '',
    action,
    ok,
    detail: detail || '',
    at: now(),
  });
  if (state.logs.length > 300) state.logs = state.logs.slice(0, 300);
}

// ============================================================
//  路由
// ============================================================

// ---- App 端验证 ----
app.post('/api/verify', async (req, res) => {
  const { code, deviceId, deviceLabel } = req.body || {};
  if (!code || !deviceId) return res.json({ ok: false, msg: '参数缺失' });

  try {
    const state = await readState();
    const row = state.codes[code];

    if (!row) {
      await writeLog(state, code, deviceId, 'verify', false, '码不存在');
      await writeState(state);
      return res.json({ ok: false, msg: '验证码不存在' });
    }

    if (row.status === 'revoked') {
      await writeLog(state, code, deviceId, 'verify', false, '已作废');
      await writeState(state);
      return res.json({ ok: false, msg: '该验证码已作废，请联系发放人' });
    }

    // 首次激活
    if (row.status === 'unused' && !row.deviceId) {
      row.deviceId = deviceId;
      row.deviceLabel = deviceLabel || '';
      row.status = 'active';
      row.activatedAt = now();
      row.lastCheckAt = now();
      await writeLog(state, code, deviceId, 'activate', true, deviceLabel || '');
      await writeState(state);
      return res.json({ ok: true, msg: '验证成功，已绑定本设备' });
    }

    // 后续校验：同一设备
    if (row.deviceId === deviceId) {
      row.lastCheckAt = now();
      await writeLog(state, code, deviceId, 'verify', true, '重复校验');
      await writeState(state);
      return res.json({ ok: true, msg: '验证通过' });
    }

    await writeLog(state, code, deviceId, 'verify', false, '设备不匹配（原绑 ' + (row.deviceLabel || row.deviceId) + '）');
    await writeState(state);
    return res.json({ ok: false, msg: '此验证码已绑定其他设备，不能在新设备使用' });
  } catch (e) {
    console.error('verify error:', e);
    return res.json({ ok: false, msg: '服务器错误' });
  }
});

// ---- 管理后台登录 ----
app.post('/api/admin/auth', (req, res) => {
  const { pwd } = req.body || {};
  return res.json({ ok: pwd === ADMIN_PWD });
});

// ---- 以下需要密码 ----
app.use('/api/admin', (req, res, next) => {
  // auth 路由已在上面处理，这里只保护其他 admin 路由
  if (req.path === '/auth') return next();
  const pwd = req.headers['x-admin-pwd'];
  if (pwd !== ADMIN_PWD) return res.status(401).json({ ok: false, msg: '密码错误' });
  next();
});

// 列表
app.get('/api/admin/list', async (req, res) => {
  const state = await readState();
  const rows = Object.entries(state.codes).map(([code, val]) => ({
    code,
    note: val.note || '',
    device_label: val.deviceLabel || '',
    status: val.status,
    created_at: val.createdAt,
    activated_at: val.activatedAt,
    last_check_at: val.lastCheckAt,
  }));
  rows.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  res.json({ ok: true, rows });
});

// 生成
app.post('/api/admin/generate', async (req, res) => {
  const { count = 1, note = '' } = req.body || {};
  const n = Math.min(50, Math.max(1, parseInt(count) || 1));
  const made = [];
  const state = await readState();
  for (let i = 0; i < n; i++) {
    const code = genCode();
    state.codes[code] = {
      note,
      deviceId: null,
      deviceLabel: '',
      status: 'unused',
      createdAt: now(),
      activatedAt: null,
      lastCheckAt: null,
    };
    made.push(code);
  }
  await writeState(state);
  res.json({ ok: true, codes: made });
});

// 作废
app.post('/api/admin/revoke', async (req, res) => {
  const { code } = req.body || {};
  const state = await readState();
  const row = state.codes[code];
  if (!row) return res.json({ ok: false, msg: '码不存在' });
  row.status = 'revoked';
  await writeLog(state, code, row.deviceId, 'revoke', true, '');
  await writeState(state);
  res.json({ ok: true });
});

// 删除
app.post('/api/admin/delete', async (req, res) => {
  const { code } = req.body || {};
  const state = await readState();
  delete state.codes[code];
  await writeState(state);
  res.json({ ok: true });
});

// 备注
app.post('/api/admin/note', async (req, res) => {
  const { code, note } = req.body || {};
  const state = await readState();
  const row = state.codes[code];
  if (!row) return res.json({ ok: false, msg: '码不存在' });
  row.note = note || '';
  await writeState(state);
  res.json({ ok: true });
});

// 日志
app.get('/api/admin/logs', async (req, res) => {
  const state = await readState();
  const rows = [...state.logs].sort((a, b) => (b.at || '').localeCompare(a.at || ''));
  res.json({ ok: true, rows: rows.slice(0, 300) });
});

// 健康检查（保活 ping 用）
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

// 默认首页 → 下载页
app.get('/', (req, res) => res.redirect('/activate.html'));

app.listen(PORT, () => {
  console.log(`✅ To be done 验证后台已启动，端口 ${PORT}`);
});

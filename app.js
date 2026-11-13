import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, signOut, updateProfile } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore, collection, doc, getDoc, setDoc, addDoc, updateDoc, onSnapshot, arrayUnion, arrayRemove } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js?v=20261112a';
import { HOTEL, DAYS, CATS, SITES as ALL_SITES, SUGGEST, PRESET_NAME, byId } from './data.js?v=20261112a';

// 只考虑单程车程 1 小时以内的地方；更远的保留在 data.js 里但不在页面上出现
const MAX_DRIVE = 60;
const SITES = ALL_SITES.filter(s => s.drive <= MAX_DRIVE);

'use strict';

// ---------- helpers ----------
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDrive = m0 => { const m = Math.round(m0 / 5) * 5; return m === 0 ? '在酒店' : m < 60 ? `${m} 分钟` : `${Math.floor(m / 60)} 小时${m % 60 ? ' ' + (m % 60) + ' 分' : ''}`; };
const fmtHours = h => `${h} 小时`;
const km = (a, b) => { const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLon = (b.lon - a.lon) * Math.PI / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s)); };
const outing = s => Math.round((s.hours + s.drive * 2 / 60) * 2) / 2;   // door-to-door hours, half-hour steps
const isHalf = s => s.drive > 0 && outing(s) <= 5.5;
const dayByKey = Object.fromEntries(DAYS.map(d => [d.key, d]));
const PALETTE = ['#0d8a86', '#a3622a', '#7a4fb3', '#2a74c2', '#bf355e', '#3f8a3c', '#c97a1f', '#2e7a4e'];
const colorFor = str => { let h = 0; for (const c of String(str || '')) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };
const initialOf = (name, email) => { const s = (name || email || '?').trim(); return s ? s[0].toUpperCase() : '?'; };
const lsGet = k => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } };
let toastTimer = null;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2000); }
function copyText(text, okMsg) {
  const done = () => toast(okMsg);
  const fallback = () => { const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动选择文字'); } ta.remove(); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fallback); else fallback();
}
function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts; if (diff < 60e3) return '刚刚'; if (diff < 3600e3) return `${Math.round(diff / 60e3)} 分钟前`;
  const d = new Date(ts), now = new Date(); const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  return d.toDateString() === now.toDateString() ? `今天 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

// ---------- state ----------
const LS_PLAN = 'cancun-plan-v2', LS_UI = 'cancun-ui-v2';
const emptyPlan = () => ({ days: Object.fromEntries(DAYS.map(d => [d.key, []])), notes: {}, meta: {}, updatedAt: 0 });
const normalize = raw => {
  const p = emptyPlan();
  if (raw && typeof raw === 'object') {
    for (const d of DAYS) {
      const arr = raw.days && Array.isArray(raw.days[d.key]) ? raw.days[d.key] : [];
      p.days[d.key] = arr.filter(id => byId[id]).filter((id, i, a) => a.indexOf(id) === i);
      if (raw.notes && typeof raw.notes[d.key] === 'string') p.notes[d.key] = raw.notes[d.key].slice(0, 2000);
      const m = raw.meta && raw.meta[d.key];
      if (m && typeof m === 'object') p.meta[d.key] = { updatedAt: Number(m.updatedAt) || 0, updatedBy: typeof m.updatedBy === 'string' ? m.updatedBy : null };
    }
    p.updatedAt = Number(raw.updatedAt) || 0;
  }
  return p;
};
let plan = normalize(lsGet(LS_PLAN) || lsGet('cancun-plan-v1'));
let ui = Object.assign({ cat: 'all', sort: 'cat', unplanned: false, half: false, eve: false, open: null }, lsGet(LS_UI) || {});
const plannedDays = id => DAYS.filter(d => plan.days[d.key].includes(id));

// cloud state
let db = null, fbAuth = null, me = null, myEmail = null, tripId = null, tripDoc = null, dbReadOnly = false;
let members = {};            // uid -> { email, name, color, lastSeen }
let unsubDays = null, unsubTrip = null, unsubMembers = null, presenceTimer = null, saveTimer = null;
const configured = () => !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);
const memberByEmail = email => Object.values(members).find(m => m && m.email === email) || null;
const nameFor = email => { if (!email) return ''; if (email === myEmail && me && me.displayName) return me.displayName; const m = memberByEmail(email); return (m && m.name) || email.split('@')[0]; };
const isOnline = m => !!(m && Date.now() - (m.lastSeen || 0) < 90000);

// ---------- router ----------
const VIEWS = ['overview', 'plan', 'sites', 'hotel', 'people'];
function currentView() { const h = location.hash.replace('#', ''); return VIEWS.includes(h) ? h : 'overview'; }
function showView() {
  const v = currentView();
  $$('.view').forEach(s => { s.hidden = s.dataset.view !== v; });
  $$('.nav a, .tabbar a').forEach(a => { if (a.dataset.view === v) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  window.scrollTo({ top: 0 });
}
window.addEventListener('hashchange', showView);

// ---------- persistence: localStorage always, one Firestore document per day when signed in ----------
const daySig = k => JSON.stringify([plan.days[k], plan.notes[k] || '']);
const lastSig = {}; DAYS.forEach(d => { lastSig[d.key] = daySig(d.key); });
const dirty = new Set();
function setSync(mode, text) { const s = $('#sync'); s.className = 'sync ' + mode; s.textContent = text; }
function commit() {
  const now = Date.now();
  for (const d of DAYS) { const sig = daySig(d.key); if (sig !== lastSig[d.key]) { lastSig[d.key] = sig; plan.meta[d.key] = { updatedAt: now, updatedBy: myEmail }; dirty.add(d.key); } }
  plan.updatedAt = now;
  lsSet(LS_PLAN, plan);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(pushDirty, 600);
}
const writing = new Set(), queued = new Set();
async function pushDay(key) {
  if (!(db && tripId && me) || dbReadOnly) return;
  if (writing.has(key)) { queued.add(key); return; }
  writing.add(key);
  const meta = plan.meta[key] || {};
  const body = { items: [...plan.days[key]], note: plan.notes[key] || '', updatedAt: meta.updatedAt || Date.now(), updatedBy: meta.updatedBy || myEmail || null };
  try { await setDoc(doc(db, 'trips', tripId, 'days', key), body); dirty.delete(key); setSync('cloud', '已同步到云端'); }
  catch (e) {
    if (e && e.code === 'permission-denied') { dbReadOnly = true; setSync('local', '没有这份行程的编辑权限 · 改动只保存在本机'); }
    else setSync('cache', '云端暂时无法保存 · 已存本机');
  }
  writing.delete(key);
  if (queued.has(key)) { queued.delete(key); pushDay(key); }
}
function pushDirty() { for (const k of [...dirty]) pushDay(k); }
function applyRemoteDay(key, data) {
  const items = Array.isArray(data.items) ? data.items.filter(id => byId[id]).filter((id, i, a) => a.indexOf(id) === i) : [];
  const note = typeof data.note === 'string' ? data.note.slice(0, 2000) : '';
  const updatedAt = Number(data.updatedAt) || 0, updatedBy = typeof data.updatedBy === 'string' ? data.updatedBy : null;
  const localAt = (plan.meta[key] && plan.meta[key].updatedAt) || 0;
  if (updatedAt < localAt) { if (!dbReadOnly) dirty.add(key); return false; }
  const same = daySig(key) === JSON.stringify([items, note]);
  plan.meta[key] = { updatedAt, updatedBy };
  if (same) return false;
  plan.days[key] = items; plan.notes[key] = note; lastSig[key] = daySig(key); dirty.delete(key);
  return true;
}

// ---------- cloud: auth, trip, members ----------
const authMsg = e => ({
  'auth/invalid-credential': '邮箱或密码不对。第一次使用请点「注册新账号」。',
  'auth/wrong-password': '密码不对。',
  'auth/user-not-found': '这个邮箱还没注册，点「注册新账号」。',
  'auth/email-already-in-use': '这个邮箱已经注册过了，直接登录即可。',
  'auth/weak-password': '密码至少 6 位。',
  'auth/invalid-email': '邮箱格式不对。',
  'auth/too-many-requests': '尝试太多次了，稍后再试。',
  'auth/network-request-failed': '网络不通，稍后再试。',
})[e && e.code] || (e && e.message) || '出错了';

function connectCloud() {
  if (!configured()) { setSync('local', '云端未配置 · 保存在这台设备'); renderPeople(); renderSideFoot(); return; }
  try { const app = initializeApp(firebaseConfig); fbAuth = getAuth(app); db = getFirestore(app); }
  catch (e) { setSync('local', 'Firebase 配置有误 · 保存在这台设备'); renderPeople(); renderSideFoot(); return; }
  onAuthStateChanged(fbAuth, async user => {
    me = user; myEmail = user && user.email ? user.email.toLowerCase() : null;
    if (user) { try { await openTrip(); } catch (e) { setSync('local', '打开云端行程失败 · ' + (e.code || e.message || '')); } }
    else { closeTrip(); setSync('local', '未登录 · 保存在这台设备'); }
    renderPeople(); renderSideFoot(); renderNameBanner(); renderPlanner();
  });
}
async function openTrip() {
  closeTrip();
  const invRef = doc(db, 'invites', myEmail);
  let ids = [];
  try { const inv = await getDoc(invRef); if (inv.exists() && Array.isArray(inv.data().trips)) ids = inv.data().trips; } catch (e) { /* none yet */ }
  let found = null;
  for (const id of ids) { try { const t = await getDoc(doc(db, 'trips', id)); if (t.exists() && (t.data().members || []).includes(myEmail)) { found = t; break; } } catch (e) { /* not a member */ } }
  if (found) tripId = found.id;
  else {
    const ref = await addDoc(collection(db, 'trips'), { name: '坎昆旅行 2026.11.20–25', ownerUid: me.uid, ownerEmail: myEmail, members: [myEmail], createdAt: Date.now() });
    await setDoc(invRef, { trips: arrayUnion(ref.id) }, { merge: true });
    tripId = ref.id;
  }
  dbReadOnly = false;
  unsubTrip = onSnapshot(doc(db, 'trips', tripId), s => { tripDoc = s.exists() ? s.data() : null; renderPeople(); renderSideFoot(); }, () => {});
  let first = true;
  const timer = setTimeout(() => setSync('cache', '云端连接慢 · 先用本机版本'), 10000);
  unsubDays = onSnapshot(collection(db, 'trips', tripId, 'days'), qs => {
    if (!qs.metadata.fromCache) clearTimeout(timer);
    let changed = false;
    qs.docs.forEach(d => { if (plan.days[d.id] !== undefined) changed = applyRemoteDay(d.id, d.data() || {}) || changed; });
    if (changed) { lsSet(LS_PLAN, plan); renderAll(); }
    if (first && !qs.metadata.fromCache) {
      first = false;
      for (const x of DAYS) { if (!qs.docs.some(d => d.id === x.key) && (plan.days[x.key].length || plan.notes[x.key])) { plan.meta[x.key] = plan.meta[x.key] || { updatedAt: plan.updatedAt || Date.now(), updatedBy: myEmail }; dirty.add(x.key); } }
    }
    if (dirty.size && !dbReadOnly) { clearTimeout(saveTimer); saveTimer = setTimeout(pushDirty, 300); }
    setSync(qs.metadata.fromCache ? 'cache' : 'cloud', qs.metadata.fromCache ? '同步中…' : '已同步到云端');
  }, () => { clearTimeout(timer); setSync('local', '云端不可用 · 保存在这台设备'); });
  // my member record doubles as presence: heartbeat every 30 s while the tab is visible
  beat(); presenceTimer = setInterval(beat, 30000);
  document.addEventListener('visibilitychange', beat);
  unsubMembers = onSnapshot(collection(db, 'trips', tripId, 'members'), qs => {
    members = {}; qs.docs.forEach(d => { members[d.id] = d.data(); });
    renderPeople(); renderSideFoot(); renderPlanner();
  }, () => {});
}
function beat() {
  if (!(db && tripId && me) || document.visibilityState !== 'visible') return;
  setDoc(doc(db, 'trips', tripId, 'members', me.uid), { email: myEmail, name: me.displayName || '', color: colorFor(myEmail), lastSeen: Date.now() }, { merge: true }).catch(() => {});
}
function closeTrip() {
  if (unsubDays) unsubDays(); if (unsubTrip) unsubTrip(); if (unsubMembers) unsubMembers();
  clearInterval(presenceTimer); document.removeEventListener('visibilitychange', beat);
  unsubDays = unsubTrip = unsubMembers = null; tripId = null; tripDoc = null; members = {};
}
async function saveName(name) {
  name = String(name || '').trim().slice(0, 20); if (!name || !me) return;
  try { await updateProfile(me, { displayName: name }); me = fbAuth.currentUser; beat(); toast(`用户名已设为 ${name}`); renderNameBanner(); renderPeople(); renderSideFoot(); renderPlanner(); }
  catch (e) { toast('保存用户名失败：' + (e.code || e.message)); }
}
async function invite(email) {
  email = String(email || '').trim().toLowerCase(); if (!email || !tripId) return;
  if (((tripDoc && tripDoc.members) || []).includes(email)) { toast('这个邮箱已经是成员了'); return; }
  try {
    await updateDoc(doc(db, 'trips', tripId), { members: arrayUnion(email) });
    await setDoc(doc(db, 'invites', email), { trips: arrayUnion(tripId) }, { merge: true });
    toast(`已邀请 ${email}，对方用这个邮箱注册登录即可`);
  } catch (e) { toast('邀请失败：' + (e.code || e.message)); }
}

// ---------- people view, side foot, name banner ----------
function renderPeople() {
  const box = $('#people-body'); if (!box) return;
  if (!configured()) { box.innerHTML = `<div class="card"><p class="status-line">云端登录还没配置，改动只保存在这台设备。</p></div>`; return; }
  if (!me) {
    box.innerHTML = `<div class="card auth">
      <p class="status-line">用邮箱登录后，两个人可以共同编辑同一份行程。</p>
      <form id="login-form" class="auth">
        <input type="email" id="login-email" placeholder="你的邮箱" autocomplete="email" required>
        <input type="password" id="login-pass" placeholder="密码（至少 6 位）" autocomplete="current-password" minlength="6" required>
        <div class="auth-actions"><button class="btn primary" type="submit">登录</button><button class="btn" type="button" data-act="signup">注册新账号</button><button class="btn" type="button" data-act="reset-pass">忘记密码</button></div>
        <p class="sub">第一次用先填邮箱和密码点「注册新账号」。登录后在这里输入朋友的邮箱邀请 TA。</p>
      </form></div>`;
    return;
  }
  const list = (tripDoc && Array.isArray(tripDoc.members)) ? tripDoc.members : [myEmail];
  const isOwner = !!(tripDoc && tripDoc.ownerUid === me.uid);
  const rows = list.map(email => {
    const m = email === myEmail ? { email, name: me.displayName || '', lastSeen: Date.now() } : memberByEmail(email);
    const name = email === myEmail ? (me.displayName || '你') : (m && m.name) || email.split('@')[0];
    const st = email === myEmail ? '<span class="st on"><span class="dot on"></span>在线（你）</span>'
      : !m ? '<span class="st">还没登录过</span>'
      : isOnline(m) ? '<span class="st on"><span class="dot on"></span>在线</span>' : `<span class="st"><span class="dot"></span>${esc(timeAgo(m.lastSeen))}在线</span>`;
    const remove = isOwner && email !== myEmail ? `<button class="x" data-act="remove-member" data-email="${esc(email)}" aria-label="移除">✕</button>` : '';
    return `<div class="member-row"><span class="avatar" style="--c:${colorFor(email)}">${esc(initialOf(name, email))}</span><div class="who"><b>${esc(name)}</b><span>${esc(email)}</span></div>${st}${remove}</div>`;
  }).join('');
  box.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <h2 class="card-title">我的资料</h2>
        <div class="me" style="margin-bottom:12px"><span class="avatar" style="--c:${colorFor(myEmail)}">${esc(initialOf(me.displayName, myEmail))}</span><div class="who"><b>${esc(me.displayName || '还没有用户名')}</b><span class="sub">${esc(myEmail)}</span></div></div>
        <form id="profile-form" class="name-form"><input id="profile-name" maxlength="20" placeholder="用户名" value="${esc(me.displayName || '')}" autocomplete="nickname" required><button class="btn primary" type="submit">保存</button></form>
        <div class="auth-actions" style="margin-top:14px"><button class="btn" type="button" data-act="signout">退出登录</button></div>
      </div>
      <div class="card">
        <h2 class="card-title">成员</h2>
        <div id="members">${rows}</div>
        <form id="invite-form" class="invite-form"><input type="email" id="invite-email" placeholder="朋友的邮箱" autocomplete="off" required><button class="btn primary" type="submit">邀请</button></form>
        <p class="sub" style="margin-top:8px">对方用被邀请的邮箱注册并登录后，看到的就是这份行程。两人同时改同一天时，后保存的覆盖先保存的；改不同的天互不影响。</p>
      </div>
    </div>`;
}
function renderSideFoot() {
  const box = $('#side-foot'); if (!box) return;
  if (!configured() || !me) { box.innerHTML = `<a class="btn" href="#people">登录以共同编辑</a><p class="sub" style="opacity:.75;color:inherit">未登录时改动只保存在这台设备</p>`; return; }
  const others = ((tripDoc && tripDoc.members) || []).filter(e => e !== myEmail);
  const online = others.map(memberByEmail).filter(isOnline);
  const line = !others.length ? '还没有邀请同伴' : online.length ? `<span class="dot on"></span>${esc(nameFor(online[0].email))} 在线` : `<span class="dot"></span>${esc(nameFor(others[0]))} 不在线`;
  box.innerHTML = `<div class="me"><span class="avatar" style="--c:${colorFor(myEmail)}">${esc(initialOf(me.displayName, myEmail))}</span><div class="who"><b>${esc(me.displayName || myEmail)}</b><span>${line}</span></div></div><a class="btn" href="#people">同伴与设置</a>`;
}
let nameDismissed = false;
function renderNameBanner() {
  const b = $('#name-banner'); if (!b) return;
  b.hidden = !(configured() && me && !me.displayName && !nameDismissed);
}

// ---------- map ----------
const B = { lonMin: -87.9, lonMax: -86.55, latMin: 20.1, latMax: 21.2 }, MW = 900, MH = 780;
const P = (lat, lon) => [((lon - B.lonMin) / (B.lonMax - B.lonMin) * MW).toFixed(1), ((B.latMax - lat) / (B.latMax - B.latMin) * MH).toFixed(1)];
const poly = pts => pts.map(p => P(p[0], p[1]).join(',')).join(' ');
function renderMap() {
  const coastN = [[21.70, -88.75], [21.62, -88.60], [21.60, -88.20], [21.55, -87.95], [21.48, -87.70], [21.45, -87.45], [21.50, -87.25], [21.60, -87.08]];
  const coastE = [[21.52, -86.95], [21.45, -86.80], [21.25, -86.76], [21.14, -86.74], [21.03, -86.78], [20.93, -86.83], [20.85, -86.87], [20.76, -86.93], [20.70, -86.96], [20.63, -87.07], [20.58, -87.12], [20.50, -87.23], [20.39, -87.31], [20.32, -87.36], [20.21, -87.43], [20.10, -87.46], [19.95, -87.47], [19.95, -88.75]];
  const cozumel = [[20.59, -86.75], [20.52, -86.80], [20.42, -86.86], [20.30, -86.96], [20.27, -87.00], [20.32, -87.03], [20.42, -87.00], [20.51, -86.96], [20.57, -86.84]];
  const holbox = [[21.52, -87.42], [21.54, -87.28], [21.56, -87.15]];
  const mujeres = [[21.27, -86.75], [21.20, -86.72]];
  const road180 = [[21.05, -86.85], [20.98, -87.20], [20.90, -87.60], [20.78, -88.00], [20.72, -88.20], [20.69, -88.45], [20.68, -88.57]];
  const roadCoba = [[20.21, -87.46], [20.35, -87.60], [20.49, -87.73], [20.60, -87.95], [20.69, -88.20]];
  const labels = [[21.16, -86.85, '坎昆', 1], [20.63, -87.12, '普拉亚卡门', 1], [20.21, -87.50, '图卢姆（1 小时以外）', 0], [20.42, -86.80, '科苏梅尔', 0], [20.85, -86.84, '莫雷洛斯港', 0], [20.40, -87.36, '阿库马尔', 0], [20.50, -87.28, '阿文图拉斯港', 0]];
  let svg = `<svg viewBox="0 0 ${MW} ${MH}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="周边景点示意图">`;
  svg += `<polygon class="m-land" points="${poly([...coastN, ...coastE])}"/><polygon class="m-land" points="${poly(cozumel)}"/>`;
  svg += `<polyline class="m-land" points="${poly(holbox)}" stroke-width="5" stroke-linecap="round"/><polyline class="m-land" points="${poly(mujeres)}" stroke-width="4" stroke-linecap="round"/>`;
  svg += `<polyline class="m-road" points="${poly(road180)}"/><polyline class="m-road" points="${poly(roadCoba)}"/>`;
  for (const [lat, lon, t, big] of labels) { const [x, y] = P(lat, lon); svg += `<text class="m-label${big ? ' big' : ''}" x="${x}" y="${y}" text-anchor="${lon < -87.9 || lon > -86.9 && lat > 21 ? 'end' : 'start'}" dy="${big ? -10 : 14}">${t}</text>`; }
  for (const s of SITES) { if (!s.drive) continue; const [x, y] = P(s.lat, s.lon); svg += `<circle class="m-dot" data-id="${s.id}" cx="${x}" cy="${y}" r="5.5" fill="${CATS[s.cat].color}"><title>${esc(s.zh)} · 车程 ${fmtDrive(s.drive)}</title></circle>`; }
  const [hx, hy] = P(HOTEL.lat, HOTEL.lon);
  svg += `<path class="m-hotel" transform="translate(${hx} ${hy})" d="M0,-9 L2.6,-2.8 L9,-2.8 L3.8,1.2 L5.6,7.6 L0,3.8 L-5.6,7.6 L-3.8,1.2 L-9,-2.8 L-2.6,-2.8 Z"><title>酒店 · Impression Moxché</title></path><text class="m-label big" x="${hx}" y="${hy}" dx="12" dy="4">酒店</text>`;
  svg += `<g id="m-tip" style="display:none"><rect class="m-tip-bg" rx="4" height="20"/><text class="m-tip" dy="14" dx="6"></text></g></svg>`;
  $('#map').innerHTML = svg;
  $('#legend').innerHTML = Object.entries(CATS).filter(([k]) => k !== 'rest').map(([k, c]) => `<span style="--c:${c.color}">${c.label}</span>`).join('') + '<span style="--c:var(--sun)">★ 酒店</span>';
  const tip = $('#m-tip');
  $('#map').addEventListener('pointerover', e => { const d = e.target.closest('.m-dot'); if (!d) return; const s = byId[d.dataset.id];
    const t = tip.querySelector('text'); t.textContent = `${s.zh} · ${fmtDrive(s.drive)}`; tip.style.display = '';
    const w = t.getComputedTextLength() + 12; const x = Math.min(parseFloat(d.getAttribute('cx')) + 10, MW - w - 4), y = parseFloat(d.getAttribute('cy')) - 26;
    tip.querySelector('rect').setAttribute('width', w); tip.setAttribute('transform', `translate(${x} ${Math.max(y, 2)})`); });
  $('#map').addEventListener('pointerout', e => { if (e.target.closest('.m-dot')) tip.style.display = 'none'; });
}
function refreshMapDots() { $$('.m-dot').forEach(d => d.classList.toggle('planned', plannedDays(d.dataset.id).length > 0)); }

// ---------- site cards ----------
function renderFilters() {
  const chips = [['all', '全部', null], ...Object.entries(CATS).filter(([k]) => k !== 'rest' && SITES.some(s => s.cat === k)).map(([k, c]) => [k, c.label, c.color])];
  $('#filters').innerHTML = chips.map(([k, label, color]) => `<button class="chip" data-act="cat" data-cat="${k}" aria-pressed="${ui.cat === k}" ${color ? `style="--c:${color}"` : ''}>${color ? '<span class="sw"></span>' : ''}${label}</button>`).join('')
    + `<span class="spacer"></span>
       <button class="chip" data-act="flag" data-flag="half" aria-pressed="${ui.half}">半天可回酒店</button>
       <button class="chip" data-act="flag" data-flag="eve" aria-pressed="${ui.eve}">傍晚出发</button>
       <button class="chip" data-act="flag" data-flag="unplanned" aria-pressed="${ui.unplanned}">只看未安排</button>
       <select id="f-sort" aria-label="排序"><option value="cat" ${ui.sort === 'cat' ? 'selected' : ''}>按类别</option><option value="drive" ${ui.sort === 'drive' ? 'selected' : ''}>按车程</option><option value="hours" ${ui.sort === 'hours' ? 'selected' : ''}>按所需时间</option></select>`;
}
function visibleSites() {
  let list = SITES.filter(s => s.cat !== 'rest').filter(s => ui.cat === 'all' || s.cat === ui.cat);
  if (ui.unplanned) list = list.filter(s => plannedDays(s.id).length === 0);
  if (ui.half) list = list.filter(isHalf);
  if (ui.eve) list = list.filter(s => s.slot === 'eve' && s.drive > 0);
  const order = Object.keys(CATS);
  if (ui.sort === 'drive') list.sort((a, b) => a.drive - b.drive);
  else if (ui.sort === 'hours') list.sort((a, b) => a.hours - b.hours);
  else list.sort((a, b) => order.indexOf(a.cat) - order.indexOf(b.cat) || a.drive - b.drive);
  return list;
}
function cardHtml(s) {
  const c = CATS[s.cat]; const pd = plannedDays(s.id);
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.q || s.en)}`;
  const open = ui.open === s.id;
  return `<article class="scard" id="card-${s.id}" style="--c:${c.color}">
    <div class="top"><div><div class="cat">${c.label}</div><h3>${esc(s.zh)}</h3><div class="en">${esc(s.en)}</div></div>
      <div class="planned-badges">${pd.map(d => `<span class="pbadge">${d.md}</span>`).join('')}</div></div>
    <div class="meta">${s.drive ? `<span>车程 <b>${fmtDrive(s.drive)}</b></span>` : ''}<span>约 <b>${fmtHours(s.hours)}</b></span>${s.drive ? `<span>来回共 <b>${fmtHours(outing(s))}</b></span>` : ''}</div>
    <div class="meta"><span>费用 <b style="font-weight:400">${esc(s.cost)}</b></span></div>
    <p class="blurb">${esc(s.blurb)}</p>
    <div class="tagrow">${isHalf(s) ? '<span class="tag good">半天往返</span>' : ''}${s.slot === 'eve' && s.drive > 0 ? '<span class="tag good">傍晚出发</span>' : ''}${(s.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('')}${s.closedNote ? `<span class="tag warn">${esc(s.closedNote)}</span>` : ''}${s.warn ? `<span class="tag warn">${esc(s.warn)}</span>` : ''}</div>
    ${s.tips && s.tips.length ? `<details class="more"><summary>详情 & 小贴士</summary><ul>${s.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>` : ''}
    <div class="foot">
      <div class="links">${s.link ? `<a href="${s.link}" target="_blank" rel="noopener">官网 ↗</a>` : ''}${s.drive ? `<a href="${maps}" target="_blank" rel="noopener">地图 ↗</a>` : '<span class="sub">酒店内 · 找管家预订</span>'}</div>
      <button class="add" data-act="pick" data-id="${s.id}" aria-expanded="${open}">${pd.length ? '调整日期' : '加入行程'}</button>
    </div>
    ${open ? `<div class="daypick" role="group" aria-label="选择日期">${DAYS.map(d => { const on = plan.days[d.key].includes(s.id); const shut = s.closed && s.closed.includes(d.wd);
      return `<button data-act="toggle" data-id="${s.id}" data-day="${d.key}" aria-pressed="${on}" title="${shut ? esc(s.closedNote) : ''}"><span class="d">${d.md}</span><span class="w">${d.dow}${d.tag ? ' · ' + d.tag : shut ? ' · 休' : ''}</span></button>`; }).join('')}</div>` : ''}
  </article>`;
}
function renderCards() {
  const list = visibleSites();
  $('#cards').innerHTML = list.length ? list.map(cardHtml).join('') : `<div class="empty">这个筛选下没有景点了。</div>`;
  renderHotelTiles();
}
function tileHtml(s) {
  const pd = plannedDays(s.id); const open = ui.open === s.id;
  const inc = /^含|已含|含一次/.test(s.cost), extra = /加价|US\$|否则/.test(s.cost);
  return `<article class="htile" id="card-${s.id}" style="--tone:${s.tone || 'var(--cat-rest)'}">
    <div class="cover"><svg aria-hidden="true"><use href="#p-${s.icon || 'umbrella'}"/></svg>
      <span class="kind">${s.meal === 'dinner' ? 'Dinner' : s.meal === 'lunch' ? 'Lunch' : 'Resort'}</span>
      <div class="badges">${pd.map(d => `<span class="pbadge">${d.md}</span>`).join('')}</div></div>
    <div class="body">
      <h3>${esc(s.zh)}</h3>
      <div class="when">${esc(s.when || '')}${s.hours ? ` · 约 ${fmtHours(s.hours)}` : ''}</div>
      <div class="tagrow">${inc ? '<span class="tag good">含</span>' : ''}${extra ? '<span class="tag warn">加价</span>' : ''}${s.closedNote ? `<span class="tag warn">${esc(s.closedNote)}</span>` : ''}${s.verified === false ? '<span class="tag warn">官网未列 · 住客反映</span>' : s.verified === 'partial' ? '<span class="tag">部分细节待确认</span>' : ''}</div>
      <div class="cost" title="${esc(s.cost)}">${esc(s.cost)}</div>
      <div class="foot"><button class="add" data-act="pick" data-id="${s.id}" aria-expanded="${open}">${pd.length ? '调整' : '加入'}</button>${s.link ? `<a href="${s.link}" target="_blank" rel="noopener">官方页面 ↗</a>` : ''}</div>
    </div>
    ${open ? `<div class="daypick" role="group" aria-label="选择日期">${DAYS.map(d => { const on = plan.days[d.key].includes(s.id); const shut = s.closed && s.closed.includes(d.wd);
      return `<button data-act="toggle" data-id="${s.id}" data-day="${d.key}" aria-pressed="${on}"><span class="d">${d.md}</span><span class="w">${d.dow}${d.tag ? ' · ' + d.tag : shut ? ' · 休' : ''}</span></button>`; }).join('')}</div>` : ''}
    ${s.tips && s.tips.length ? `<details class="more"><summary>说明 & 贴士</summary><ul>${s.tips.map(x => `<li>${esc(x)}</li>`).join('')}</ul><p class="sub" style="margin-top:6px">${esc(s.blurb)}</p></details>` : ''}
  </article>`;
}
function renderHotelTiles() {
  const box = $('#hotel-tiles'); if (!box) return;
  box.innerHTML = SITES.filter(s => s.cat === 'rest').map(tileHtml).join('');
}

// ---------- planner ----------
function dayStats(d) {
  const ids = plan.days[d.key]; const sites = ids.map(id => byId[id]);
  const out = sites.filter(s => s.drive > 0);
  if (!sites.length) return { hours: 0, travel: 0, total: 0, out: 0, warns: [] };
  const onsite = out.reduce((a, s) => a + s.hours, 0);
  let travel = 0, maxGap = 0;
  if (out.length) {
    travel = out[0].drive + out[out.length - 1].drive;
    for (let i = 1; i < out.length; i++) travel += km(out[i - 1], out[i]) * 1.3 / 55 * 60;
    for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) maxGap = Math.max(maxGap, km(out[i], out[j]));
  }
  const total = onsite + travel / 60;
  const warns = [];
  if (out.length && total > d.cap) warns.push({ bad: total > d.cap + 3, text: d.tag === '抵达日' ? '抵达日 15:00 才入住，这天只适合傍晚去一个近的地方' : d.tag === '退房日' ? '退房日 16:00 起飞，12:45 前得出发去机场，只够顺路停一处' : `这一天约 ${total.toFixed(0)} 小时太满了，建议减到 ${d.cap} 小时以内` });
  if (maxGap > 90) warns.push({ bad: false, text: '当天景点之间相距超过 90 公里，路上会很赶' });
  for (const s of sites) { if (s.closed && s.closed.includes(d.wd)) warns.push({ bad: true, text: `${s.zh}：${s.closedNote || '这天不开放'}` }); }
  const dinners = sites.filter(s => s.meal === 'dinner').length; if (dinners > 1) warns.push({ bad: false, text: `这天排了 ${dinners} 顿晚餐，留一顿就好` });
  const lunches = sites.filter(s => s.meal === 'lunch').length; if (lunches > 1) warns.push({ bad: false, text: `这天排了 ${lunches} 顿午餐` });
  if (d.wd === 0 && sites.some(s => s.cat === 'ruin')) warns.push({ bad: false, text: '周日墨西哥居民免费参观遗址，人会非常多，建议换一天' });
  if (sites.some(s => s.id === 'rio-secreto') && (d.wd === 0 || d.wd === 6)) warns.push({ bad: false, text: 'Río Secreto 周末只有 9/11/13 点三场，记得提前订' });
  return { hours: onsite, travel, total, out: out.length, warns };
}
function blankText(d) {
  if (d.tag === '抵达日') return '入住后在酒店安顿、看日落、吃晚餐。';
  if (d.tag === '退房日') return '早餐后收拾，退房去机场。';
  return '这一天整天在酒店：泳池、海滩、SPA、餐厅都已包含。';
}
function mealHint(total) {
  if (total <= 5.5) return '半天往返，回酒店吃午饭或晚饭';
  if (total <= 9) return `外出约 ${total.toFixed(0)} 小时，会错过酒店的一顿正餐`;
  return '全天在外，酒店的午餐和晚餐都会错过';
}
function nearbyFor(d) {
  const ids = plan.days[d.key]; if (!ids.length) return [];
  const clusters = new Set(ids.map(id => byId[id].cluster));
  return SITES.filter(s => !ids.includes(s.id) && clusters.has(s.cluster) && s.cluster !== 'hotel' && plannedDays(s.id).length === 0 && !(s.closed && s.closed.includes(d.wd))).slice(0, 3);
}
function renderPlanner() {
  const total = DAYS.reduce((a, d) => a + plan.days[d.key].length, 0);
  $$('.nav-count').forEach(e => { e.textContent = total ? total : ''; });
  const outDays = DAYS.filter(d => plan.days[d.key].some(id => byId[id].drive > 0)).length;
  $('#plan-sum').textContent = total ? `出门 ${outDays} 天 · 其余 ${DAYS.length - outDays} 天在酒店` : '还没排任何项目。点一天里的「添加」，或者先用一套推荐。';
  $('#days').innerHTML = DAYS.map(d => {
    const ids = plan.days[d.key]; const st = dayStats(d); const near = nearbyFor(d); const m = plan.meta[d.key];
    return `<section class="day" aria-label="${d.md} ${d.dow}">
      <div class="day-head"><span class="date">${d.md}</span><span class="dow">${d.dow}</span>${d.tag ? `<span class="daytag">${d.tag}</span>` : ''}
        ${ids.length ? `<span class="load ${st.out && st.total > d.cap ? 'over' : ''}" title="含往返车程">${st.out ? `外出 ≈ ${st.total.toFixed(1)} h · 车程 ${Math.round(st.travel)} 分` : '整天在酒店'}</span>` : ''}
        ${m && m.updatedAt ? `<span class="who">${m.updatedBy ? esc(m.updatedBy === myEmail ? '你' : nameFor(m.updatedBy)) + '改于 ' : '改于 '}${timeAgo(m.updatedAt)}</span>` : ''}</div>
      ${d.note ? `<div class="day-note">${esc(d.note)}</div>` : ''}
      ${ids.length ? `<ol class="items">${ids.map((id, i) => { const s = byId[id]; return `<li class="item" style="--c:${CATS[s.cat].color}">
          <span class="num">${i + 1}</span>
          <div style="min-width:0"><div class="n">${esc(s.zh)}</div><div class="m">${fmtDrive(s.drive)} · ${fmtHours(s.hours)}${s.drive > MAX_DRIVE ? ' · <span style="color:var(--sun)">超过 1 小时</span>' : ''}</div></div>
          <div class="ctl"><button data-act="move" data-day="${d.key}" data-i="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''} aria-label="上移">↑</button><button data-act="move" data-day="${d.key}" data-i="${i}" data-dir="1" ${i === ids.length - 1 ? 'disabled' : ''} aria-label="下移">↓</button><button class="x" data-act="remove" data-day="${d.key}" data-id="${id}" aria-label="移除">✕</button></div>
        </li>`; }).join('')}</ol>`
        : `<div class="blank">${blankText(d)}</div>`}
      <button class="day-add" data-act="open-sheet" data-day="${d.key}"><svg><use href="#i-plus"/></svg>添加景点或酒店活动</button>
      ${st.out && !d.tag ? `<div class="meal">${mealHint(st.total)}</div>` : ''}
      ${st.warns.length ? `<div class="warns">${st.warns.map(w => `<div class="warn ${w.bad ? 'bad' : ''}">⚠ <span>${esc(w.text)}</span></div>`).join('')}</div>` : ''}
      ${near.length ? `<div class="nearby">顺路还可以加：${near.map(s => `<button data-act="quick" data-id="${s.id}" data-day="${d.key}">+ ${esc(s.zh)}</button>`).join('')}</div>` : ''}
      <textarea id="note-${d.key}" data-day="${d.key}" rows="1" placeholder="备注：餐厅预订、出发时间、租车…">${esc(plan.notes[d.key] || '')}</textarea>
    </section>`;
  }).join('');
  renderMiniDays();
}
function renderMiniDays() {
  $('#mini-days').innerHTML = DAYS.map(d => {
    const ids = plan.days[d.key]; const out = ids.filter(id => byId[id].drive > 0);
    const restLabel = d.tag === '抵达日' ? '抵达 · 住进酒店' : d.tag === '退房日' ? '退房 · 去机场' : '酒店日';
    const body = !ids.length ? `<span class="rest">${restLabel}</span>` : `<ul>${ids.slice(0, 3).map(id => `<li>${esc(byId[id].zh)}</li>`).join('')}${ids.length > 3 ? `<li>…还有 ${ids.length - 3} 项</li>` : ''}</ul>`;
    return `<a class="mini" href="#plan"><span class="d">${d.md}<small>${d.dow}${d.tag ? ' · ' + d.tag : ''}</small></span>${body}${ids.length && !out.length ? '<span class="rest">整天在酒店</span>' : ''}</a>`;
  }).join('');
}
function renderAll() { renderCards(); renderPlanner(); refreshMapDots(); }

function planText() {
  const lines = ['坎昆旅行行程 2026.11.20–11.25', 'Impression Moxché by Secrets · Carr. Cancún-Tulum km 294, Corasol, Playa del Carmen', ''];
  for (const d of DAYS) {
    const ids = plan.days[d.key]; lines.push(`${d.md} ${d.dow}${d.tag ? '（' + d.tag + '）' : ''}`);
    if (!ids.length) lines.push('  （在酒店）');
    ids.forEach((id, i) => { const s = byId[id]; lines.push(`  ${i + 1}. ${s.zh} ${s.en} · ${fmtDrive(s.drive)} · ${fmtHours(s.hours)}`); });
    if (plan.notes[d.key]) lines.push(`  备注：${plan.notes[d.key]}`);
    lines.push('');
  }
  return lines.join('\n');
}
function showConfirm(text, onYes) {
  const slot = $('#confirm-slot');
  slot.innerHTML = `<div class="confirm"><span>${esc(text)}</span><span class="acts"><button class="btn" data-act="confirm-no">取消</button><button class="btn primary" data-act="confirm-yes">确定</button></span></div>`;
  slot.querySelector('[data-act="confirm-yes"]').onclick = () => { slot.innerHTML = ''; onYes(); };
  slot.querySelector('[data-act="confirm-no"]').onclick = () => { slot.innerHTML = ''; };
}
function applySuggest(preset) {
  const src = SUGGEST[preset] || SUGGEST.light;
  plan.days = Object.fromEntries(DAYS.map(d => [d.key, [...(src[d.key] || [])]]));
  commit(); renderAll();
  toast(preset === 'full' ? '已填入「多出去玩」，可以随意调整' : '已填入「酒店为主」：三次出门，其余在酒店');
}

// ---------- picker sheet ----------
let sheetDay = null, sheetCat = 'all', sheetQ = '';
function openSheet(dayKey) {
  sheetDay = dayKey; sheetCat = 'all'; sheetQ = '';
  const d = dayByKey[dayKey];
  $('#sheet-title').textContent = `添加到 ${d.md} ${d.dow}${d.tag ? ' · ' + d.tag : ''}`;
  $('#sheet-q').value = '';
  $('#sheet').hidden = false; document.body.style.overflow = 'hidden';
  renderSheet();
  setTimeout(() => $('#sheet-q').focus(), 50);
}
function closeSheet() { $('#sheet').hidden = true; document.body.style.overflow = ''; sheetDay = null; }
function renderSheet() {
  if (!sheetDay) return;
  const d = dayByKey[sheetDay];
  const chips = [['all', '全部', null], ...Object.entries(CATS).map(([k, c]) => [k, c.label, c.color])];
  $('#sheet-filters').innerHTML = chips.map(([k, label, color]) => `<button class="chip" data-act="sheet-cat" data-cat="${k}" aria-pressed="${sheetCat === k}" ${color ? `style="--c:${color}"` : ''}>${color ? '<span class="sw"></span>' : ''}${label}</button>`).join('');
  const q = sheetQ.trim().toLowerCase();
  let list = SITES.filter(s => sheetCat === 'all' || s.cat === sheetCat);
  if (q) list = list.filter(s => (s.zh + ' ' + s.en + ' ' + (s.tags || []).join(' ')).toLowerCase().includes(q));
  const order = Object.keys(CATS);
  list.sort((a, b) => order.indexOf(a.cat) - order.indexOf(b.cat) || a.drive - b.drive);
  $('#sheet-list').innerHTML = list.length ? list.map(s => { const on = plan.days[sheetDay].includes(s.id); const shut = s.closed && s.closed.includes(d.wd); const other = plannedDays(s.id).filter(x => x.key !== sheetDay);
    return `<div class="pick" style="--c:${CATS[s.cat].color}"><div style="min-width:0"><div class="n">${esc(s.zh)}</div><div class="m">${fmtDrive(s.drive)} · ${fmtHours(s.hours)}${shut ? ' · <span style="color:var(--sun)">' + esc(s.closedNote || '这天不开放') + '</span>' : ''}${other.length ? ' · 已排 ' + other.map(x => x.md).join('/') : ''}</div></div><button data-act="toggle" data-id="${s.id}" data-day="${sheetDay}" aria-pressed="${on}">${on ? '已加入 ✓' : '加入'}</button></div>`; }).join('')
    : `<div class="empty">没有匹配的项目</div>`;
}

// ---------- events ----------
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const a = b.dataset.act;
  if (a === 'copy-addr') copyText($('#addr').textContent, '地址已复制');
  else if (a === 'cat') { ui.cat = b.dataset.cat; lsSet(LS_UI, ui); renderFilters(); renderCards(); }
  else if (a === 'flag') { const f = b.dataset.flag; ui[f] = !ui[f]; lsSet(LS_UI, ui); renderFilters(); renderCards(); }
  else if (a === 'pick') { ui.open = ui.open === b.dataset.id ? null : b.dataset.id; renderCards(); }
  else if (a === 'toggle') { const { id, day } = b.dataset; const arr = plan.days[day]; const i = arr.indexOf(id);
    if (i >= 0) { arr.splice(i, 1); toast(`已从 ${day.slice(5).replace('-', '/')} 移除`); } else { arr.push(id); toast(`已加入 ${day.slice(5).replace('-', '/')}`); }
    commit(); renderAll(); if (sheetDay) renderSheet(); }
  else if (a === 'quick') { const { id, day } = b.dataset; if (!plan.days[day].includes(id)) { plan.days[day].push(id); commit(); renderAll(); toast(`已加入 ${byId[id].zh}`); } }
  else if (a === 'remove') { const { id, day } = b.dataset; plan.days[day] = plan.days[day].filter(x => x !== id); commit(); renderAll(); }
  else if (a === 'move') { const { day } = b.dataset; const i = +b.dataset.i, dir = +b.dataset.dir; const arr = plan.days[day]; const j = i + dir; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; commit(); renderPlanner(); }
  else if (a === 'suggest') { const preset = b.dataset.preset || 'light'; const has = DAYS.some(d => plan.days[d.key].length);
    if (has) showConfirm(`会覆盖现在的安排（备注会保留），确定填入「${PRESET_NAME[preset]}」？`, () => applySuggest(preset)); else applySuggest(preset); }
  else if (a === 'clear') showConfirm('清空全部六天的安排？备注会保留。', () => { plan.days = emptyPlan().days; commit(); renderAll(); toast('已清空'); });
  else if (a === 'copy-plan') copyText(planText(), '行程文字已复制，可以直接粘贴到微信');
  else if (a === 'open-sheet') openSheet(b.dataset.day);
  else if (a === 'close-sheet') closeSheet();
  else if (a === 'sheet-cat') { sheetCat = b.dataset.cat; renderSheet(); }
  else if (a === 'signup') { const email = $('#login-email').value.trim(), pass = $('#login-pass').value;
    if (!email || pass.length < 6) { toast('填好邮箱和至少 6 位的密码再点注册'); return; }
    try { await createUserWithEmailAndPassword(fbAuth, email, pass); toast('注册成功，已登录'); } catch (err) { toast(authMsg(err)); } }
  else if (a === 'reset-pass') { const email = $('#login-email').value.trim(); if (!email) { toast('先填邮箱'); return; }
    try { await sendPasswordResetEmail(fbAuth, email); toast('重置密码的邮件已发出，请查收'); } catch (err) { toast(authMsg(err)); } }
  else if (a === 'signout') { try { await signOut(fbAuth); toast('已退出'); } catch (err) { toast(authMsg(err)); } }
  else if (a === 'remove-member') { const email = b.dataset.email; if (!email || !tripId) return;
    try { await updateDoc(doc(db, 'trips', tripId), { members: arrayRemove(email) }); toast(`已移除 ${email}`); } catch (err) { toast('移除失败：' + (err.code || err.message)); } }
});
document.addEventListener('submit', async e => {
  const f = e.target;
  if (f.id === 'login-form') { e.preventDefault(); try { await signInWithEmailAndPassword(fbAuth, $('#login-email').value.trim(), $('#login-pass').value); toast('已登录'); } catch (err) { toast(authMsg(err)); } }
  else if (f.id === 'invite-form') { e.preventDefault(); const inp = $('#invite-email'); await invite(inp.value); inp.value = ''; }
  else if (f.id === 'name-form') { e.preventDefault(); await saveName($('#name-input').value); }
  else if (f.id === 'profile-form') { e.preventDefault(); await saveName($('#profile-name').value); }
});
document.addEventListener('change', e => { if (e.target.id === 'f-sort') { ui.sort = e.target.value; lsSet(LS_UI, ui); renderCards(); } });
document.addEventListener('input', e => {
  const t = e.target;
  if (t.id === 'sheet-q') { sheetQ = t.value; renderSheet(); return; }
  if (t.tagName === 'TEXTAREA' && t.dataset.day) { plan.notes[t.dataset.day] = t.value.slice(0, 2000); clearTimeout(noteTimer); noteTimer = setTimeout(commit, 800); }
});
let noteTimer = null;
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#sheet').hidden) closeSheet(); });
$('#sheet').addEventListener('click', e => { if (e.target === $('#sheet')) closeSheet(); });
document.addEventListener('click', e => {
  const dot = e.target.closest('.m-dot'); if (!dot) return;
  const id = dot.dataset.id;
  if (ui.cat !== 'all' && byId[id].cat !== ui.cat) { ui.cat = 'all'; lsSet(LS_UI, ui); renderFilters(); }
  if (ui.unplanned && plannedDays(id).length) { ui.unplanned = false; lsSet(LS_UI, ui); renderFilters(); }
  renderCards();
  const card = $('#card-' + id); if (card) { card.scrollIntoView({ behavior: 'smooth', block: 'center' }); card.classList.remove('flash'); void card.offsetWidth; card.classList.add('flash'); }
});

// ---------- boot ----------
renderMap(); renderFilters(); renderAll(); renderSideFoot(); renderPeople(); showView(); connectCloud();

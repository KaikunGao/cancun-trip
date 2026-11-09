  // ---------- cloud (Firebase): email login, trip members, one document per day, presence ----------
  // Replaces the Claude-artifact persistence layer. Everything above this block is shared with the artifact page.
  function setSync(mode, text) { const s = $('#sync'); if (s) { s.className = 'sync ' + mode; s.textContent = text; } }
  const daySig = k => JSON.stringify([plan.days[k], plan.notes[k] || '']);
  const lastSig = {}; DAYS.forEach(d => { lastSig[d.key] = daySig(d.key); });
  const dirty = new Set();
  function commit() {
    const now = Date.now();
    for (const d of DAYS) { const sig = daySig(d.key); if (sig !== lastSig[d.key]) { lastSig[d.key] = sig; plan.meta[d.key] = { updatedAt: now, updatedBy: myId }; dirty.add(d.key); } }
    plan.updatedAt = now;
    lsSet(LS_PLAN, plan);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(pushDirty, 600);
  }
  let fbAuth = null, me = null, myEmail = null, tripId = null, tripDoc = null, unsubDays = null, unsubTrip = null, unsubPresence = null, presenceTimer = null;
  const cloudReady = () => !!(db && tripId && me);
  const writing = new Set(), queued = new Set();
  async function pushDay(key) {
    if (!cloudReady() || dbReadOnly) return;
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
  // returns true when the local plan changed
  function applyRemoteDay(key, data) {
    const items = Array.isArray(data.items) ? data.items.filter(id => byId[id]).filter((id, i, a) => a.indexOf(id) === i) : [];
    const note = typeof data.note === 'string' ? data.note.slice(0, 2000) : '';
    const updatedAt = Number(data.updatedAt) || 0, updatedBy = typeof data.updatedBy === 'string' ? data.updatedBy : null;
    const localAt = (plan.meta[key] && plan.meta[key].updatedAt) || 0;
    if (updatedAt < localAt) { if (!dbReadOnly) dirty.add(key); return false; }   // ours is newer: it will be pushed
    const same = daySig(key) === JSON.stringify([items, note]);
    plan.meta[key] = { updatedAt, updatedBy };
    if (same) return false;
    plan.days[key] = items; plan.notes[key] = note; lastSig[key] = daySig(key); dirty.delete(key);
    return true;
  }
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
  const configured = () => !!(firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId);
  function connectCloud() {
    renderShare();
    if (!configured()) { setSync('local', '云端未配置 · 保存在这台设备'); return; }
    try { const app = initializeApp(firebaseConfig); fbAuth = getAuth(app); db = getFirestore(app); }
    catch (e) { setSync('local', 'Firebase 配置有误 · 保存在这台设备'); return; }
    onAuthStateChanged(fbAuth, async user => {
      me = user; myEmail = user && user.email ? user.email.toLowerCase() : null; myId = myEmail;
      if (user) { try { await openTrip(); } catch (e) { setSync('local', '打开云端行程失败 · ' + (e.code || e.message || '')); } }
      else { closeTrip(); setSync('local', '未登录 · 保存在这台设备'); }
      renderShare();
    });
    $('#login-form').addEventListener('submit', async e => {
      e.preventDefault();
      const email = $('#login-email').value.trim(), pass = $('#login-pass').value;
      try { await signInWithEmailAndPassword(fbAuth, email, pass); toast('已登录'); } catch (err) { toast(authMsg(err)); }
    });
    $('#invite-form').addEventListener('submit', async e => {
      e.preventDefault();
      const email = $('#invite-email').value.trim().toLowerCase(); if (!email || !tripId) return;
      if (((tripDoc && tripDoc.members) || []).includes(email)) { toast('这个邮箱已经是成员了'); return; }
      try {
        await updateDoc(doc(db, 'trips', tripId), { members: arrayUnion(email) });
        await setDoc(doc(db, 'invites', email), { trips: arrayUnion(tripId) }, { merge: true });
        $('#invite-email').value = ''; toast(`已邀请 ${email}，对方用这个邮箱注册登录即可`);
      } catch (err) { toast('邀请失败：' + (err.code || err.message)); }
    });
    document.addEventListener('click', async e => {
      const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
      if (a === 'signup') {
        const email = $('#login-email').value.trim(), pass = $('#login-pass').value;
        if (!email || pass.length < 6) { toast('填好邮箱和至少 6 位的密码再点注册'); return; }
        try { await createUserWithEmailAndPassword(fbAuth, email, pass); toast('注册成功，已登录'); } catch (err) { toast(authMsg(err)); }
      } else if (a === 'reset-pass') {
        const email = $('#login-email').value.trim(); if (!email) { toast('先填邮箱'); return; }
        try { await sendPasswordResetEmail(fbAuth, email); toast('重置密码的邮件已发出，请查收'); } catch (err) { toast(authMsg(err)); }
      } else if (a === 'signout') {
        try { await signOut(fbAuth); toast('已退出'); } catch (err) { toast(authMsg(err)); }
      } else if (a === 'remove-member') {
        const email = b.dataset.email; if (!email || !tripId) return;
        try { await updateDoc(doc(db, 'trips', tripId), { members: arrayRemove(email) }); toast(`已移除 ${email}`); } catch (err) { toast('移除失败：' + (err.code || err.message)); }
      }
    });
  }
  async function openTrip() {
    closeTrip();
    // invites/<email> lists the trips this email was added to; the trip's own members list is what grants access
    const invRef = doc(db, 'invites', myEmail);
    let ids = [];
    try { const inv = await getDoc(invRef); if (inv.exists() && Array.isArray(inv.data().trips)) ids = inv.data().trips; } catch (e) { /* none yet */ }
    let found = null;
    for (const id of ids) { try { const t = await getDoc(doc(db, 'trips', id)); if (t.exists() && (t.data().members || []).includes(myEmail)) { found = t; break; } } catch (e) { /* not a member any more */ } }
    if (found) tripId = found.id;
    else {
      const ref = await addDoc(collection(db, 'trips'), { name: '里维埃拉玛雅 2026.11.20–25', ownerUid: me.uid, ownerEmail: myEmail, members: [myEmail], createdAt: Date.now() });
      await setDoc(invRef, { trips: arrayUnion(ref.id) }, { merge: true });
      tripId = ref.id;
    }
    dbReadOnly = false;
    unsubTrip = onSnapshot(doc(db, 'trips', tripId), s => { tripDoc = s.exists() ? s.data() : null; renderShare(); }, () => {});
    let first = true;
    const timer = setTimeout(() => setSync('cache', '云端连接慢 · 先用本机版本'), 10000);
    unsubDays = onSnapshot(collection(db, 'trips', tripId, 'days'), qs => {
      if (!qs.metadata.fromCache) clearTimeout(timer);
      let changed = false;
      qs.docs.forEach(d => { if (plan.days[d.id] !== undefined) changed = applyRemoteDay(d.id, d.data() || {}) || changed; });
      if (changed) { lsSet(LS_PLAN, plan); renderAll(); }
      if (first && !qs.metadata.fromCache) {   // days only this device knows about go up once
        first = false;
        for (const x of DAYS) { if (!qs.docs.some(d => d.id === x.key) && (plan.days[x.key].length || plan.notes[x.key])) { plan.meta[x.key] = plan.meta[x.key] || { updatedAt: plan.updatedAt || Date.now(), updatedBy: myEmail }; dirty.add(x.key); } }
      }
      if (dirty.size && !dbReadOnly) { clearTimeout(saveTimer); saveTimer = setTimeout(pushDirty, 300); }
      setSync(qs.metadata.fromCache ? 'cache' : 'cloud', qs.metadata.fromCache ? '同步中…' : '已同步到云端');
    }, () => { clearTimeout(timer); setSync('local', '云端不可用 · 保存在这台设备'); });
    const pRef = doc(db, 'trips', tripId, 'presence', me.uid);
    const beat = () => { if (document.visibilityState === 'visible') setDoc(pRef, { email: myEmail, lastSeen: Date.now() }).catch(() => {}); };
    beat(); presenceTimer = setInterval(beat, 30000);
    unsubPresence = onSnapshot(collection(db, 'trips', tripId, 'presence'), qs => {
      const now = Date.now();
      renderPeers(qs.docs.map(d => d.data()).filter(p => p && p.email !== myEmail && now - (p.lastSeen || 0) < 90000));
    }, () => {});
  }
  function closeTrip() {
    if (unsubDays) unsubDays(); if (unsubTrip) unsubTrip(); if (unsubPresence) unsubPresence();
    clearInterval(presenceTimer); unsubDays = unsubTrip = unsubPresence = null; tripId = null; tripDoc = null; renderPeers([]);
  }
  function renderPeers(others) {
    const box = $('#peers'); if (!box) return;
    if (!others.length) { box.textContent = ''; box.hidden = true; return; }
    box.hidden = false; box.textContent = '';
    const lead = document.createElement('span'); lead.textContent = '👀 正在一起看：'; box.appendChild(lead);
    others.forEach(p => { const chip = document.createElement('span'); chip.className = 'peer'; chip.textContent = (p.email || '同伴').split('@')[0]; box.appendChild(chip); });
  }
  function renderShare() {
    const st = $('#auth-status'), lf = $('#login-form'), ai = $('#auth-in'); if (!st) return;
    if (!configured()) { st.textContent = '云端登录还没配置。按 README 填好 firebase-config.js 之后，这里就能用邮箱登录、邀请朋友。现在改动只保存在这台设备。'; lf.hidden = true; ai.hidden = true; return; }
    if (!me) { st.textContent = '用邮箱登录后，两个人可以共同编辑同一份行程。'; lf.hidden = false; ai.hidden = true; return; }
    st.textContent = `已登录：${myEmail}`; lf.hidden = true; ai.hidden = false;
    const mem = $('#members'); mem.textContent = '';
    const members = (tripDoc && Array.isArray(tripDoc.members)) ? tripDoc.members : [myEmail];
    const isOwner = !!(tripDoc && tripDoc.ownerUid === me.uid);
    members.forEach(m => {
      const chip = document.createElement('span'); chip.className = 'member';
      const t = document.createElement('span'); t.textContent = m === myEmail ? `${m}（你）` : m; chip.appendChild(t);
      if (isOwner && m !== myEmail) { const x = document.createElement('button'); x.type = 'button'; x.dataset.act = 'remove-member'; x.dataset.email = m; x.setAttribute('aria-label', '移除'); x.textContent = '✕'; chip.appendChild(x); }
      mem.appendChild(chip);
    });
  }
  function timeAgo(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts; if (diff < 60e3) return '刚刚'; if (diff < 3600e3) return `${Math.round(diff / 60e3)} 分钟前`;
    const d = new Date(ts), now = new Date(); const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
    return d.toDateString() === now.toDateString() ? `今天 ${hm}` : `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
  }
  function fillNames() {
    document.querySelectorAll('.who[data-ts]').forEach(e => {
      const uid = e.dataset.uid; const t = timeAgo(+e.dataset.ts);
      const who = !uid ? '' : uid === myEmail ? '你' : uid.split('@')[0];
      e.textContent = who ? `${who}改于 ${t}` : `改于 ${t}`;
    });
  }

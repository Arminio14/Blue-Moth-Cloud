'use strict';
/* Blue Moth 2.2 – Frontend (Anmeldung, Bibliothek, Synchronisierung) */
const CFG = window.BLUE_MOTH_CONFIG || {};
const BUCKET = 'blue-moth-files';
const KINDS = { web: ['WEB-APP', '↗'], app: ['PROGRAMM', 'EXE'], pcgame: ['PC-SPIEL', '🕹'], game: ['SPIEL', '🎮'], file: ['DATEI', '📁'] };
const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let sb = null, user = null, items = [], filter = 'all', authMode = 'login', channel = null, authBusy = false;

/* ---------- Hilfsfunktionen ---------- */
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 3800); }
function friendly(e) {
  const m = String(e?.message || e || '');
  const map = [
    [/invalid login credentials/i, 'E-Mail oder Passwort ist falsch.'],
    [/user already registered|already been registered/i, 'Diese E-Mail ist bereits registriert.'],
    [/email not confirmed/i, 'Bitte bestätige zuerst deine E-Mail-Adresse (Link im Postfach).'],
    [/password should be at least|weak password|password.*short/i, 'Das Passwort ist zu kurz oder zu schwach (mindestens 6 Zeichen).'],
    [/unable to validate email|invalid email|invalid format|email address.*invalid/i, 'Bitte gib eine gültige E-Mail-Adresse ein.'],
    [/rate limit|too many requests/i, 'Zu viele Versuche. Bitte warte kurz und versuche es erneut.'],
    [/failed to fetch|networkerror|load failed|network request failed/i, 'Keine Verbindung. Bitte prüfe deine Internetverbindung.'],
    [/signups? (not allowed|(is )?disabled)/i, 'Neue Registrierungen sind derzeit nicht möglich.'],
    [/row-level security|permission denied|not authorized/i, 'Keine Berechtigung. Bitte melde dich neu an.'],
    [/exceeded the maximum allowed size|payload too large/i, 'Die Datei ist zu groß.'],
    [/bucket not found/i, 'Der Speicher ist noch nicht eingerichtet. Bitte wende dich an den Entwickler.'],
    [/relation .* does not exist|could not find the table/i, 'Die Bibliothek ist noch nicht eingerichtet. Bitte wende dich an den Entwickler.']
  ];
  for (const [re, txt] of map) if (re.test(m)) return txt;
  return m || 'Unbekannter Fehler.';
}
const enc = new TextEncoder();
const sha256hex = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map(x => x.toString(16).padStart(2, '0')).join('');
const same = (a, b) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
function openExternal(url) {
  if (!/^https?:\/\//i.test(url)) throw new Error('Ungültige Adresse.');
  const o = window.__TAURI__?.opener;
  if (o?.openUrl) return o.openUrl(url);
  window.open(url, '_blank', 'noopener');
}

/* ---------- Dienst (zentral konfiguriert in config.js) ---------- */
function initService() {
  if (!CFG.SUPABASE_URL || !CFG.SUPABASE_KEY) { console.warn('[Blue Moth] config.js: SUPABASE_URL und SUPABASE_KEY fehlen.'); return; }
  if (!window.supabase?.createClient) { console.warn('[Blue Moth] vendor/supabase.js fehlt – "node scripts/prepare-web.mjs" ausführen.'); return; }
  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false } });
}
function needService() { if (!sb) throw new Error('Die App ist noch nicht vollständig eingerichtet. Bitte wende dich an den Entwickler.'); }

/* ---------- Anmeldung ---------- */
function setAuthMode(mode) {
  authMode = mode; const reg = mode === 'register';
  $('tabLogin').classList.toggle('active', !reg); $('tabRegister').classList.toggle('active', reg);
  $('pass2Row').hidden = !reg; $('authPass').autocomplete = reg ? 'new-password' : 'current-password';
  $('authSubmit').textContent = reg ? 'Konto erstellen' : 'Anmelden';
  $('authHint').textContent = reg ? 'Erstelle dein Konto mit E-Mail und Passwort.' : 'Melde dich an, um deine Bibliothek zu öffnen.';
  $('authMsg').textContent = '';
}
function setAuthMsg(text, ok) { const m = $('authMsg'); m.textContent = text || ''; m.style.color = ok ? '#8fe5ff' : ''; }
function enter(u) {
  user = u;
  $('userName').textContent = '👤 ' + (u.email || 'Konto');
  filter = 'all'; document.querySelectorAll('nav .tab').forEach(t => t.classList.toggle('active', t.dataset.filter === 'all'));
  document.body.classList.remove('locked'); items = []; render(); loadItems(); subscribe();
}
function leave() {
  if (!user) return;
  unsubscribe(); user = null; items = []; render();
  document.body.classList.add('locked'); $('authForm').reset(); setAuthMode('login');
}
async function register(email, password) {
  needService();
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;
  if (data.session) return enter(data.session.user);
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) throw new Error('Diese E-Mail ist bereits registriert.');
  setAuthMode('login');
  setAuthMsg('Konto erstellt. Bitte bestätige deine E-Mail-Adresse (Link im Postfach) und melde dich danach an.', true);
}
async function login(email, password) {
  needService();
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
  enter(data.user);
}
async function logout() {
  const u = user; leave();
  try { if (sb && u) await sb.auth.signOut(); } catch (e) { console.warn(e); }
}
// Interne Kennung des Creator-Kontos. CREATOR_EMAIL darf ein beliebiger Name sein (z. B. "BLUE MOTH");
// daraus wird intern eine technische Adresse gebildet. Es wird nie eine E-Mail verschickt.
function creatorEmail() {
  const raw = String(CFG.CREATOR_EMAIL || 'creator').trim();
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) return raw.toLowerCase();
  const slug = raw.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'creator';
  return slug + '@example.com';
}
async function creatorLogin(file) {
  needService();
  if (!CFG.CREATOR_KEY_HASH) throw new Error('Der Creator-Zugang ist nicht eingerichtet.');
  if (!file || file.size > 5000) throw new Error('Kein gültiger Creator-Schlüssel.');
  const token = ((await file.text()).trim().split(/\s+/).pop()) || '';
  if (!same(await sha256hex(token), CFG.CREATOR_KEY_HASH)) throw new Error('Kein gültiger Creator-Schlüssel. Der Creator-Zugang ist nur für den Entwickler.');
  // Der geheime Schlüssel ist zugleich das Passwort des Creator-Kontos: ohne die Datei ist keine Anmeldung möglich.
  const first = await sb.auth.signInWithPassword({ email: creatorEmail(), password: token });
  if (!first.error) return enter(first.data.user);
  if (!/invalid login credentials/i.test(first.error.message)) throw first.error;
  const up = await sb.auth.signUp({ email: creatorEmail(), password: token });
  if (up.error) throw up.error;
  if (!up.data.session) throw new Error('Creator-Konto konnte nicht angemeldet werden. Prüfe die E-Mail-Bestätigung des Creator-Kontos.');
  enter(up.data.session.user);
}
$('tabLogin').onclick = () => setAuthMode('login');
$('tabRegister').onclick = () => setAuthMode('register');
$('authForm').onsubmit = async e => {
  e.preventDefault(); if (authBusy) return; setAuthMsg('');
  const email = $('authEmail').value.trim(), password = $('authPass').value;
  try {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Bitte gib eine gültige E-Mail-Adresse ein.');
    if (password.length < 6) throw new Error('Das Passwort muss mindestens 6 Zeichen lang sein.');
    if (authMode === 'register' && password !== $('authPass2').value) throw new Error('Die Passwörter stimmen nicht überein.');
    authBusy = true; $('authSubmit').disabled = true;
    if (authMode === 'register') await register(email, password); else await login(email, password);
    if (user) $('authForm').reset();
  } catch (err) { setAuthMsg(friendly(err)); }
  finally { authBusy = false; $('authSubmit').disabled = false; }
};
$('creatorBtn').onclick = () => $('creatorInput').click();
$('creatorInput').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; setAuthMsg('');
  try { await creatorLogin(f); } catch (err) { setAuthMsg(friendly(err)); }
};
$('logout').onclick = logout;

/* ---------- Bibliothek & Synchronisierung ---------- */
function subscribe() {
  unsubscribe(); if (!sb || !user) return;
  channel = sb.channel('items-' + user.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items', filter: `owner=eq.${user.id}` }, () => loadItems())
    .subscribe();
}
function unsubscribe() { if (channel && sb) { sb.removeChannel(channel); } channel = null; }
async function loadItems() {
  if (!sb || !user) return;
  const uid = user.id;
  const { data, error } = await sb.from('items').select('*').order('created_at', { ascending: false });
  if (!user || user.id !== uid) return;
  if (error) { toast(friendly(error)); return; }
  items = data || []; render();
}
window.addEventListener('focus', () => { if (user) loadItems(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden && user) loadItems(); });

function render() {
  const shown = items.filter(x => filter === 'all' || x.kind === filter);
  $('count').textContent = `${items.length} ${items.length === 1 ? 'Eintrag' : 'Einträge'}`;
  $('empty').hidden = shown.length > 0;
  $('grid').innerHTML = shown.map(x => {
    const [label, sym] = KINDS[x.kind] || KINDS.file;
    let host = ''; try { host = new URL(x.url).hostname; } catch {}
    const ext = (x.file_path || '').split('.').pop().toLowerCase();
    const tag = ext === 'exe' || ext === 'msi' ? '<span class="tag">NUR WINDOWS</span>' : ext === 'apk' ? '<span class="tag">NUR ANDROID</span>' : '';
    const symbol = x.kind === 'web' && host ? `<img class="fav" alt="" src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64">` : sym;
    return `<article class="card"><div class="symbol">${symbol}</div><div class="kind">${label}${tag}</div><h3>${esc(x.name)}</h3><p class="filename">${esc(x.url || (x.file_path || '').split('/').pop().replace(/^\d+-/, ''))}</p><div class="cardActions">${
      x.url ? `<button class="primary" data-url="${esc(x.id)}">Öffnen ↗</button>` : ''}${
      x.file_path ? `<button class="${x.url ? 'secondary' : 'primary'}" data-file="${esc(x.id)}">Datei laden ⬇</button>` : ''}<button class="delete" data-del="${esc(x.id)}" title="Entfernen">×</button></div></article>`;
  }).join('');
  $('grid').querySelectorAll('img.fav').forEach(img => img.addEventListener('error', () => { const s = document.createElement('span'); s.textContent = '↗'; img.replaceWith(s); }));
}
$('grid').addEventListener('click', async e => {
  const u = e.target.closest('[data-url]'), f = e.target.closest('[data-file]'), d = e.target.closest('[data-del]');
  try {
    if (u) openExternal(items.find(x => x.id === u.dataset.url).url);
    if (f) {
      const it = items.find(x => x.id === f.dataset.file);
      const { data, error } = await sb.storage.from(BUCKET).createSignedUrl(it.file_path, 3600);
      if (error) throw error; openExternal(data.signedUrl);
    }
    if (d && confirm('Diesen Eintrag entfernen?')) await removeItem(d.dataset.del);
  } catch (err) { toast(friendly(err)); }
});
async function removeItem(id) {
  needService();
  const it = items.find(x => x.id === id);
  const { error } = await sb.from('items').delete().eq('id', id);
  if (error) throw error;
  if (it?.file_path) { const r = await sb.storage.from(BUCKET).remove([it.file_path]); if (r.error) console.warn(r.error); }
  items = items.filter(x => x.id !== id); render(); toast('Eintrag entfernt.');
}
document.querySelectorAll('nav .tab').forEach(b => b.onclick = () => { filter = b.dataset.filter; document.querySelectorAll('nav .tab').forEach(t => t.classList.toggle('active', t === b)); render(); });
document.querySelectorAll('.close').forEach(b => b.onclick = () => b.closest('dialog').close());
$('addItem').onclick = () => { $('addMsg').textContent = ''; $('addDialog').showModal(); };
$('addForm').onsubmit = async e => {
  e.preventDefault(); const msg = $('addMsg'); msg.textContent = ''; let uploaded = null;
  try {
    needService();
    const name = $('itemName').value.trim(), kind = $('itemKind').value, rawUrl = $('itemUrl').value.trim(), file = $('itemFile').files[0];
    if (!name) throw new Error('Bitte einen Namen eingeben.');
    let url = null; if (rawUrl) { const p = new URL(rawUrl); if (!['http:', 'https:'].includes(p.protocol)) throw new Error('Nur http:// und https:// sind erlaubt.'); url = p.href; }
    if (!url && !file) throw new Error('Bitte eine Webadresse oder eine Datei angeben.');
    if (file && file.size > (CFG.MAX_FILE_MB || 50000) * 1024 * 1024) throw new Error(`Die Datei ist größer als ${CFG.MAX_FILE_MB || 50000} MB.`);
    $('addSubmit').disabled = true; msg.style.color = '#8fe5ff'; if (file) msg.textContent = 'Wird hochgeladen …';
    let filePath = null;
    if (file) {
      filePath = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
      const up = await sb.storage.from(BUCKET).upload(filePath, file, { upsert: false }); if (up.error) throw up.error; uploaded = filePath;
    }
    const { error } = await sb.from('items').insert({ owner: user.id, name, kind, url, file_path: filePath });
    if (error) throw error;
    uploaded = null; $('addForm').reset(); $('addDialog').close(); toast('Hinzugefügt und synchronisiert ✓'); loadItems();
  } catch (err) {
    if (uploaded) sb.storage.from(BUCKET).remove([uploaded]).catch(() => {});
    msg.style.color = ''; msg.textContent = friendly(err);
  } finally { $('addSubmit').disabled = false; }
};

/* ---------- Start ---------- */
(async () => {
  setAuthMode('login'); initService();
  setTimeout(() => $('splash').classList.add('hide'), 1500);
  if (!sb) { setAuthMsg('Die App ist noch nicht vollständig eingerichtet. Bitte wende dich an den Entwickler.'); return; }
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') leave(); });
  try { const { data } = await sb.auth.getSession(); if (data.session) enter(data.session.user); } catch (e) { console.warn(e); }
})();

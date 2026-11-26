// Wird vor jedem Build/Start ausgeführt:
//  1) übernimmt Werte aus Umgebungsvariablen / GitHub-Secrets in web/config.js
//  2) kopiert supabase-js nach web/vendor (kein CDN nötig, App läuft ohne externe Skripte)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfgFile = path.join(root, 'web', 'config.js');
let text = fs.readFileSync(cfgFile, 'utf8');

for (const key of ['SUPABASE_URL', 'SUPABASE_KEY', 'CREATOR_EMAIL', 'CREATOR_KEY_HASH']) {
  const v = (process.env[key] || '').trim();
  if (!v) continue;
  const re = new RegExp(`(${key}:\\s*)"[^"]*"`);
  if (!re.test(text)) throw new Error(`web/config.js: Eintrag ${key} nicht gefunden.`);
  text = text.replace(re, (_m, p1) => p1 + JSON.stringify(v));
}
fs.writeFileSync(cfgFile, text);

const get = k => (text.match(new RegExp(`${k}:\\s*"([^"]*)"`)) || [])[1] || '';
const url = get('SUPABASE_URL'), anon = get('SUPABASE_KEY');
if (!url || !anon) console.warn('\n[Blue Moth] WARNUNG: SUPABASE_URL / SUPABASE_KEY sind leer (web/config.js oder Secrets). Die App kann sich dann nicht anmelden.\n');
else if (!/^https:\/\/[a-z0-9-]+\.supabase\.(co|in)\/?$/i.test(url)) console.warn('\n[Blue Moth] WARNUNG: SUPABASE_URL sieht ungewöhnlich aus: ' + url + '\n');
let role = '';
try { if (anon.startsWith('eyJ')) role = JSON.parse(Buffer.from(anon.split('.')[1] || '', 'base64url').toString()).role; } catch {}
if (role === 'service_role') throw new Error('STOPP: Das ist ein service_role-Key! Niemals in die App eintragen. Nimm den anon/publishable Key.');
if (/service_role|sb_secret_/.test(anon)) throw new Error('STOPP: Das sieht nach einem geheimen Key aus. Nimm den öffentlichen anon/publishable Key.');

const src = path.join(root, 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js');
if (!fs.existsSync(src)) throw new Error('supabase-js fehlt. Bitte zuerst "pnpm install" ausführen.');
fs.mkdirSync(path.join(root, 'web', 'vendor'), { recursive: true });
fs.copyFileSync(src, path.join(root, 'web', 'vendor', 'supabase.js'));
console.log('[Blue Moth] Konfiguration und supabase-js vorbereitet.');

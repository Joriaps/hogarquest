// Servidor de sincronización de HogarQuest (Node 18+, sin dependencias).
// Cada familia se guarda en families/<CODIGO>.json:
//   - en disco local (DATA_DIR), que en Render gratis se borra al reiniciar, y
//   - en un repositorio de GitHub (si hay GITHUB_TOKEN y GITHUB_REPO), que es lo permanente.
// Los móviles guardan también su copia completa: si el servidor lo pierde todo, el primero que
// se conecta se la vuelve a subir.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { merge, migrate, summary } from '../src/model.js';

const PORT = +process.env.PORT || 8787;
const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const GH_TOKEN = process.env.GITHUB_TOKEN || '';
const GH_REPO = process.env.GITHUB_REPO || ''; // "usuario/hogarquest-datos"
const GH_BRANCH = process.env.GITHUB_BRANCH || 'main';
const GH_API = (process.env.GITHUB_API || 'https://api.github.com').replace(/\/$/, '');
const SAVE_DELAY = +process.env.SAVE_DELAY_MS || 8000;
const MAX_BODY = 5 * 1024 * 1024;
const useGitHub = !!(GH_TOKEN && GH_REPO);

const families = new Map(); // code -> { state, sha, timer, saving }
const log = (...a) => console.log(new Date().toISOString(), ...a);

export const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const validCode = (c) => /^[A-HJ-NP-Z2-9]{8}$/.test(c); // el mismo alfabeto y longitud que genCode()

// Límites globales (no dependen de la IP): un extraño no agota el token de GitHub ni llena la memoria.
const MAX_NEW_BODY = 1024 * 1024;
const MAX_CACHED = 30;
const bucket = (max, ms) => { let n = 0, t = 0; return () => { const now = Date.now(); if (now - t > ms) { t = now; n = 0; } return ++n <= max; }; };
const allowLookup = bucket(60, 60_000);     // códigos fuera de memoria: cada uno cuesta una llamada a GitHub
const allowCreate = bucket(20, 3_600_000);  // familias nuevas por hora
const busy = () => Object.assign(new Error('Servidor ocupado, inténtalo en un momento'), { status: 429 });
function evict() {
  for (const [c, f] of families) {
    if (families.size <= MAX_CACHED) break;
    if (!f.dirty && !f.saving) families.delete(c);
  }
}

// ---------- GitHub ----------
async function gh(method, url, body) {
  const res = await fetch(GH_API + url, {
    method,
    headers: { Authorization: `Bearer ${GH_TOKEN}`, Accept: 'application/vnd.github+json', 'User-Agent': 'hogarquest-sync', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch {}
  return { status: res.status, json };
}
const ghPath = (code) => `/repos/${GH_REPO}/contents/families/${code}.json`;

async function ghLoad(code) {
  const r = await gh('GET', `${ghPath(code)}?ref=${encodeURIComponent(GH_BRANCH)}`);
  if (r.status === 404) return null;
  if (r.status !== 200) throw new Error(`GitHub GET ${r.status}`);
  let text;
  if (r.json.content) text = Buffer.from(r.json.content, 'base64').toString('utf8');
  else {
    const raw = await fetch(r.json.download_url, { headers: { Authorization: `Bearer ${GH_TOKEN}` } });
    text = await raw.text();
  }
  const file = JSON.parse(text);
  return { state: file.estado || file.state || file, sha: r.json.sha };
}

async function ghSave(code, fam) {
  const content = Buffer.from(fileContent(fam.state), 'utf8').toString('base64');
  const body = { message: `Puntos ${fam.state.familyName || code} · ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`, content, branch: GH_BRANCH, ...(fam.sha ? { sha: fam.sha } : {}) };
  let r = await gh('PUT', ghPath(code), body);
  if (r.status === 409 || r.status === 422) {
    // El archivo cambió por otro lado: fusionamos con lo que hay y reintentamos
    const remote = await ghLoad(code);
    if (remote) { fam.state = merge(remote.state, fam.state); fam.sha = remote.sha; }
    r = await gh('PUT', ghPath(code), { ...body, content: Buffer.from(fileContent(fam.state), 'utf8').toString('base64'), sha: fam.sha });
  }
  if (r.status !== 200 && r.status !== 201) throw new Error(`GitHub PUT ${r.status} ${JSON.stringify(r.json)?.slice(0, 200)}`);
  fam.sha = r.json.content.sha;
}

function fileContent(state) {
  return JSON.stringify({ actualizado: new Date().toISOString(), familia: state.familyName, resumen: summary(state), estado: state }, null, 1);
}

// ---------- Almacenamiento ----------
const localFile = (code) => path.join(DATA_DIR, `${code}.json`);

// Dos móviles que llegan a la vez con el servidor recién despierto comparten la misma carga.
const loading = new Map();
function load(code) {
  if (!loading.has(code)) loading.set(code, loadNow(code).finally(() => loading.delete(code)));
  return loading.get(code);
}

async function loadNow(code) {
  if (families.has(code)) { const f = families.get(code); families.delete(code); families.set(code, f); return f; }
  if (!allowLookup()) throw busy();
  let fam = null;
  try {
    const file = JSON.parse(await fs.readFile(localFile(code), 'utf8'));
    fam = { state: migrate(file.estado || file), sha: file.__sha || null };
  } catch {}
  if (useGitHub) {
    try {
      const remote = await ghLoad(code);
      if (remote) fam = fam ? { state: merge(remote.state, fam.state), sha: remote.sha } : { state: migrate(remote.state), sha: remote.sha };
    } catch (e) {
      log('GitHub load error', code, e.message);
      // Sin GitHub no se sabe si la familia existe: decir «no existe» o crearla de cero sería un error.
      if (!fam) throw Object.assign(new Error('No se puede acceder a los datos, inténtalo en un momento'), { status: 503 });
    }
  }
  if (fam) { families.set(code, fam); evict(); }
  return fam;
}

function scheduleSave(code) {
  const fam = families.get(code);
  clearTimeout(fam.timer);
  fam.dirty = true;
  fam.timer = setTimeout(() => persist(code), SAVE_DELAY);
}

async function persist(code) {
  const fam = families.get(code);
  if (!fam || !fam.dirty) return;
  if (fam.saving) { await fam.saving; return persist(code); }
  fam.dirty = false;
  fam.saving = (async () => {
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(localFile(code), fileContent(fam.state));
      if (useGitHub) await ghSave(code, fam);
      log('guardado', code, useGitHub ? '(disco + GitHub)' : '(disco)');
    } catch (e) {
      log('error al guardar', code, e.message);
      fam.dirty = true;
      clearTimeout(fam.timer);
      fam.timer = setTimeout(() => persist(code), 30000);
    }
  })();
  await fam.saving;
  fam.saving = null;
}

async function persistAll() {
  await Promise.all([...families.keys()].map((c) => { clearTimeout(families.get(c).timer); return persist(c); }));
}

// ---------- HTTP ----------
function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => { size += c.length; req.bodySize = size; if (size > MAX_BODY) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    const url = new URL(req.url, 'http://x');
    const parts = url.pathname.split('/').filter(Boolean);
    if (url.pathname === '/' || url.pathname === '/api/health') return send(res, 200, { ok: true, app: 'hogarquest-sync', github: useGitHub });
    if (parts[0] !== 'api' || parts.length !== 3) return send(res, 404, { error: 'not found' });
    const code = normCode(parts[2]);
    if (!validCode(code)) return send(res, 400, { error: 'código no válido' });

    if (req.method === 'GET' && parts[1] === 'family') {
      const fam = await load(code);
      if (!fam) return send(res, 404, { error: 'familia no encontrada' });
      return send(res, 200, { state: fam.state });
    }
    if (req.method === 'POST' && parts[1] === 'sync') {
      const body = await readBody(req);
      if (!body.state || !Array.isArray(body.state.members)) return send(res, 400, { error: 'datos no válidos' });
      let fam = await load(code);
      let changed = true;
      if (!fam) {
        if (!body.create) return send(res, 404, { error: 'familia no encontrada' });
        if (req.bodySize > MAX_NEW_BODY) return send(res, 413, { error: 'datos demasiado grandes' });
        if (!allowCreate()) throw busy();
        fam = { state: migrate(body.state), sha: null };
        families.set(code, fam);
        evict();
        log('familia nueva', code);
      } else {
        const before = JSON.stringify(fam.state);
        fam.state = merge(fam.state, body.state);
        changed = JSON.stringify(fam.state) !== before;
      }
      if (changed) scheduleSave(code); // una consulta sin novedades no genera un commit en GitHub
      return send(res, 200, { state: fam.state });
    }
    send(res, 404, { error: 'not found' });
  } catch (e) {
    if (e.status) return send(res, e.status, { error: e.message });
    log('error', e.message);
    send(res, 500, { error: 'error del servidor' });
  }
});

server.listen(PORT, () => log(`HogarQuest sync en :${PORT} · GitHub ${useGitHub ? GH_REPO : 'desactivado'} · datos en ${DATA_DIR}`));

// Render avisa con SIGTERM antes de dormir o reiniciar el servicio: guardamos lo pendiente.
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    log('cerrando, guardando cambios pendientes…');
    const t = setTimeout(() => process.exit(0), 20000);
    await persistAll();
    clearTimeout(t);
    process.exit(0);
  });
}

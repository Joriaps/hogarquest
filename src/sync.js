// Sincronización con el servidor de la familia. Cada móvil guarda su copia completa; aquí solo se
// envía la copia local, el servidor la fusiona con la suya y devuelve el resultado.
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import * as S from './store.js';
import { merge } from './model.js';

const KEY = 'hogarquest.sync.v1';
const POLL_MS = 15000;
const PUSH_DELAY = 1200;
const TIMEOUT_MS = 75000; // el plan gratis de Render tarda hasta ~1 min en despertar

export const DEFAULT_SERVER = (import.meta.env.VITE_SYNC_URL || '').replace(/\/$/, '');
// me: de quién es este móvil (id de miembro), 'shared' si es un móvil compartido, '' si aún no se ha elegido.
// admin: el modo admin está activado en este móvil. No caduca: se entra y se sale a mano desde Ajustes.
export const sync = { server: DEFAULT_SERVER, code: '', me: '', admin: false, status: 'off', lastOk: 0, error: '' };

let onRemote = () => {};
let onStatus = () => {};
let pushTimer = null, pollTimer = null, inFlight = null, dirty = false, created = false;
const native = Capacitor.isNativePlatform();

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function genCode() {
  let s = '';
  const rnd = crypto.getRandomValues(new Uint32Array(8));
  for (let i = 0; i < 8; i++) s += ALPHA[rnd[i] % ALPHA.length];
  return s.slice(0, 4) + '-' + s.slice(4);
}
export const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const prettyCode = (c) => { const n = normCode(c); return n.length === 8 ? n.slice(0, 4) + '-' + n.slice(4) : n; };
const cleanServer = (u) => {
  u = String(u || '').trim().replace(/\/$/, '');
  if (u && !/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'https://' + u;
  return /^(https:\/\/|http:\/\/(localhost|127\.0\.0\.1)(:|$))/i.test(u) ? u : '';
};

async function saveCfg() {
  const raw = JSON.stringify({ server: sync.server, code: sync.code, me: sync.me, admin: sync.admin, created });
  try { localStorage.setItem(KEY, raw); } catch {}
  if (native) { try { await Preferences.set({ key: KEY, value: raw }); } catch {} }
}
async function loadCfg() {
  let raw = null;
  try { if (native) raw = (await Preferences.get({ key: KEY })).value; } catch {}
  if (!raw) { try { raw = localStorage.getItem(KEY); } catch {} }
  if (raw) {
    try {
      const c = JSON.parse(raw);
      sync.server = c.server || DEFAULT_SERVER;
      sync.code = c.code || '';
      sync.me = c.me || '';
      sync.admin = !!c.admin;
      created = !!c.created;
    } catch {}
  }
}

function setStatus(st, error = '') {
  sync.status = st;
  sync.error = error;
  if (st === 'ok') sync.lastOk = Date.now();
  onStatus(sync);
}
export const enabled = () => !!(sync.server && sync.code);

async function request(method, path, body) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(sync.server + path, { method, signal: ctrl.signal, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(json.error || 'HTTP ' + res.status); e.status = res.status; throw e; }
    return json;
  } finally { clearTimeout(t); }
}

// Fusiona lo que llega del servidor con la copia local y avisa si ha cambiado algo.
function absorb(remote) {
  // Se compara en forma canónica: si solo cambia el orden de los campos, no hay nada nuevo que pintar.
  const before = JSON.stringify(merge(S.state, S.state));
  const seen = new Set(S.state.log.map((l) => l.id));
  const merged = merge(S.state, remote);
  if (JSON.stringify(merged) === before) return;
  S.replaceState(merged, { local: false });
  onRemote(merged.log.filter((l) => !seen.has(l.id)));
}

export async function syncNow() {
  if (!enabled()) return;
  if (inFlight) { dirty = true; return inFlight; }
  dirty = false;
  setStatus('syncing');
  inFlight = (async () => {
    try {
      const code = sync.code;
      const r = await request('POST', `/api/sync/${normCode(code)}`, { state: S.state, create: created });
      if (sync.code !== code) return; // se desconectó mientras esperaba: no hay que recuperar lo borrado
      absorb(r.state);
      setStatus('ok');
    } catch (e) {
      setStatus(e.status === 404 ? 'error' : 'offline', e.status === 404 ? 'La familia no existe en el servidor' : e.message);
    } finally {
      inFlight = null;
    }
  })();
  await inFlight;
  if (dirty) schedulePush();
}

export function schedulePush() {
  if (!enabled()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(syncNow, PUSH_DELAY);
}

function startPolling() {
  clearInterval(pollTimer);
  if (!enabled()) return;
  pollTimer = setInterval(() => { if (!document.hidden) syncNow(); }, POLL_MS);
}

// Activa la familia compartida desde este móvil (crea un código nuevo).
export async function createFamily(server) {
  sync.server = cleanServer(server || sync.server);
  if (!sync.server) throw new Error('Falta la dirección del servidor');
  sync.code = genCode();
  created = true;
  await saveCfg();
  startPolling();
  await syncNow();
  if (sync.status !== 'ok') throw new Error('No se pudo conectar con el servidor. Se reintentará solo.');
  return sync.code;
}

// Descarga una familia existente con su código (sustituye los datos de este móvil).
export async function joinFamily(server, code) {
  const srv = cleanServer(server || sync.server);
  const c = normCode(code);
  if (!srv) throw new Error('Falta la dirección del servidor');
  if (c.length < 6) throw new Error('El código no es válido');
  const prev = { server: sync.server, code: sync.code };
  Object.assign(sync, { server: srv, code: prettyCode(c) });
  setStatus('syncing');
  try {
    const r = await request('GET', `/api/family/${c}`);
    created = true; // la familia ya existe en el servidor
    S.replaceState(r.state, { local: false });
    await saveCfg();
    setStatus('ok');
    startPolling();
    return r.state;
  } catch (e) {
    Object.assign(sync, prev);
    setStatus(enabled() ? 'offline' : 'off');
    throw new Error(e.status === 404 ? 'No hay ninguna familia con ese código' : e.name === 'AbortError' ? 'El servidor no responde' : 'No se pudo conectar: ' + e.message);
  }
}

export async function setMe(id) {
  sync.me = id || '';
  sync.admin = false; // quien entra siempre empieza como jugador
  await saveCfg();
}

export async function setAdmin(on) {
  sync.admin = !!on;
  await saveCfg();
}

export async function disconnect() {
  clearInterval(pollTimer);
  sync.code = '';
  created = false;
  await saveCfg();
  setStatus('off');
}

export const loadDeviceConfig = loadCfg;

export async function initSync({ remote, status }) {
  onRemote = remote || onRemote;
  onStatus = status || onStatus;
  S.subscribe((kind) => { if (kind === 'local') schedulePush(); });
  if (enabled()) {
    setStatus('syncing');
    startPolling();
    syncNow();
  }
  window.addEventListener('online', () => syncNow());
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow(); });
}

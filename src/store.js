// Estado de la app, persistencia local y acciones del juego. La lógica pura está en model.js.
import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';
import { emptyState, migrate, recompute, levelInfo, dayKey, weekStart, weekPointsOf, memberStats as statsOf } from './model.js';

export { dayKey, addDays, weekStart, levelInfo, xpForLevel, BADGES } from './model.js';

const KEY = 'hogarquest.state.v1';

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const now = () => Date.now();
const touch = (o) => { o.u = now(); return o; };

// ---------- Plantillas ----------
export const TASK_TEMPLATES = [
  { title: 'Hacer la cama', icon: '🛏️', points: 10, freq: 'daily' },
  { title: 'Poner la mesa', icon: '🍽️', points: 10, freq: 'daily' },
  { title: 'Quitar la mesa', icon: '🧽', points: 10, freq: 'daily' },
  { title: 'Fregar los platos', icon: '🫧', points: 20, freq: 'daily' },
  { title: 'Sacar la basura', icon: '🗑️', points: 15, freq: 'daily' },
  { title: 'Ordenar la habitación', icon: '🧸', points: 20, freq: 'daily' },
  { title: 'Hacer los deberes', icon: '📚', points: 15, freq: 'daily' },
  { title: 'Dar de comer a la mascota', icon: '🐶', points: 10, freq: 'daily' },
  { title: 'Lavarse los dientes', icon: '🪥', points: 5, freq: 'daily' },
  { title: 'Barrer o aspirar', icon: '🧹', points: 30, freq: 'weekly' },
  { title: 'Doblar la ropa', icon: '👕', points: 20, freq: 'weekly' },
  { title: 'Poner la lavadora', icon: '🧺', points: 20, freq: 'weekly' },
  { title: 'Limpiar el baño', icon: '🚽', points: 40, freq: 'weekly' },
  { title: 'Regar las plantas', icon: '🪴', points: 10, freq: 'weekly' },
  { title: 'Ayudar a cocinar', icon: '👩‍🍳', points: 20, freq: 'weekly' },
  { title: 'Ir a la compra', icon: '🛒', points: 25, freq: 'weekly' },
];

export const REWARD_TEMPLATES = [
  { title: '30 min de tablet', icon: '📱', cost: 50 },
  { title: 'Postre especial', icon: '🍦', cost: 60 },
  { title: 'Acostarse 30 min más tarde', icon: '🌙', cost: 70 },
  { title: 'Elegir la cena', icon: '🍕', cost: 80 },
  { title: 'Peli en familia (tú eliges)', icon: '🎬', cost: 100 },
  { title: 'Paga extra', icon: '💶', cost: 120 },
  { title: 'Día libre de tareas', icon: '🏖️', cost: 200 },
  { title: 'Excursión especial', icon: '🏞️', cost: 300 },
];

export const TASK_ICONS = ['🛏️', '🍽️', '🧽', '🫧', '🗑️', '🧸', '📚', '🐶', '🐱', '🪥', '🧹', '👕', '🧺', '🚽', '🪴', '👩‍🍳', '🛒', '🚗', '🧼', '🪟', '🍳', '🥗', '🧦', '👟', '🎒', '🐟', '🌳', '♻️', '📦', '🛁', '🧴', '🪣', '🎹', '⚽', '📖', '💤', '🦷', '🧃', '🍎', '⭐'];
export const REWARD_ICONS = ['📱', '🍦', '🌙', '🍕', '🎬', '💶', '🏖️', '🏞️', '🎮', '🍫', '🧁', '🎁', '🚲', '🏊', '🎨', '🧩', '🎢', '🛝', '📺', '🍿', '🎟️', '🦄', '🏆', '👑'];

export const FREQ_LABEL = { daily: 'Diaria', weekly: 'Semanal', once: 'Una vez' };

// ---------- Estado ----------
export { emptyState };
export let state = emptyState();
const listeners = new Set();
export const subscribe = (fn) => listeners.add(fn);

const native = Capacitor.isNativePlatform();
export async function load() {
  try {
    let raw = null;
    if (native) raw = (await Preferences.get({ key: KEY })).value;
    if (!raw) { try { raw = localStorage.getItem(KEY); } catch {} }
    if (raw) state = migrate(JSON.parse(raw));
    if (state.pin) { await setPin(state.pin); commit(); } // datos antiguos con el PIN en claro
  } catch (e) { console.warn('load', e); }
  return state;
}
let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 150);
}
export async function flush() {
  const raw = JSON.stringify(state);
  try { localStorage.setItem(KEY, raw); } catch {}
  if (native) { try { await Preferences.set({ key: KEY, value: raw }); } catch (e) { console.warn('save', e); } }
}
// Guarda y avisa a los oyentes (p. ej. la sincronización) de que hay cambios locales.
export function commit() { save(); listeners.forEach((fn) => fn('local')); }
// Sustituye el estado por uno que viene de fuera (servidor o importación) sin marcarlo como cambio local.
export function replaceState(obj, { local = true } = {}) {
  state = migrate(obj);
  save();
  if (local) listeners.forEach((fn) => fn('local'));
}
export function resetAll() { state = emptyState(); save(); }
export function touchMeta() { state.metaU = now(); }

// PIN: nunca se guarda ni se sincroniza en claro.
async function pinDigest(pin, salt) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: enc.encode(salt), iterations: 300000 }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}
export async function setPin(pin) {
  const salt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const hash = await pinDigest(pin, salt);
  Object.assign(state, { pinSalt: salt, pinHash: hash, pin: '' });
  touchMeta();
}
// Dos PIN distintos: checkPin es el de admin, compartido por los adultos; checkMemberPin es el personal, para entrar con tu usuario.
export const checkPin = async (pin) => !!state.pinHash && (await pinDigest(pin, state.pinSalt)) === state.pinHash;
export const hasPin = (m) => !!m && !!m.pinHash;
export async function checkMemberPin(memberId, pin) {
  const m = member(memberId);
  return !!m && !!m.pinHash && (await pinDigest(pin, m.pinSalt)) === m.pinHash;
}
export async function hashPin(pin) {
  const pinSalt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  return { pinSalt, pinHash: await pinDigest(pin, pinSalt) };
}
export async function setMemberPin(memberId, pin) {
  updateMember(memberId, await hashPin(pin));
}

function addLog(type, memberId, text, icon = '•') {
  state.log.unshift({ id: uid(), ts: now(), type, memberId, text, icon });
  if (state.log.length > 300) state.log.length = 300;
}
function remove(coll, id) {
  state[coll] = state[coll].filter((x) => x.id !== id);
  state.deleted[id] = now();
}

// ---------- Miembros ----------
export const member = (id) => state.members.find((m) => m.id === id);
export function addMember({ name, avatar, role = 'kid' }) {
  const m = touch({ id: uid(), name: name.trim(), avatar, role, points: 0, total: 0, streak: 0, bestStreak: 0, lastDay: null, badges: [], createdAt: now() });
  state.members.push(m);
  addLog('member', m.id, `${m.name} se ha unido a la familia`, '👋');
  return m;
}
// Otro móvil puede haber borrado el elemento mientras se editaba: entonces no hay nada que actualizar.
export function updateMember(id, patch) { const m = member(id); if (m) touch(Object.assign(m, patch)); }
export function removeMember(id) {
  remove('members', id);
  state.tasks.forEach((t) => {
    if (!t.assignees.includes(id)) return;
    t.assignees = t.assignees.filter((a) => a !== id);
    if (!t.assignees.length) t.active = false; // sin esto, la tarea exclusiva pasaría a ser de todos
    touch(t);
  });
  ['completions', 'redemptions', 'adjustments'].forEach((k) => state[k].filter((x) => x.memberId === id).forEach((x) => remove(k, x.id)));
}
export function currentStreak(m) {
  if (!m.lastDay) return 0;
  const today = dayKey();
  return m.lastDay === today || m.lastDay === addDaysLocal(today, -1) ? m.streak : 0;
}
function addDaysLocal(key, n) {
  const [y, mo, d] = key.split('-').map(Number);
  return dayKey(new Date(y, mo - 1, d + n));
}

// ---------- Tareas ----------
export const task = (id) => state.tasks.find((t) => t.id === id);
export function addTask(t) {
  const nt = touch({ id: uid(), title: t.title.trim(), icon: t.icon || '⭐', points: Math.max(1, +t.points || 10), freq: t.freq || 'daily', assignees: t.assignees || [], approval: !!t.approval, active: true, createdAt: now() });
  state.tasks.push(nt);
  return nt;
}
export function updateTask(id, patch) { const t = task(id); if (t) touch(Object.assign(t, patch)); }
export function removeTask(id) { remove('tasks', id); }

function periodStart(freq) {
  if (freq === 'daily') return dayKey();
  if (freq === 'weekly') return weekStart();
  return '0000-00-00';
}

// Tarea x2 del día: elegida de forma determinista por fecha (igual en todos los móviles)
export function bonusTaskId() {
  const actives = state.tasks.filter((t) => t.active && t.freq !== 'once');
  if (!actives.length) return null;
  const k = dayKey();
  const hash = (x) => { let h = 7; for (const ch of x) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
  // Se elige por id: cambiar otras tareas no mueve la estrella salvo que la nueva gane el sorteo.
  return actives.reduce((best, t) => (hash(k + t.id) < hash(k + best.id) ? t : best)).id;
}

// Estado de una tarea para un miembro: 'todo' | 'pending' | 'done' | 'taken'
export function taskStatus(t, memberId) {
  const start = periodStart(t.freq);
  const shared = t.assignees.length === 0;
  const c = state.completions.find((c) => c.taskId === t.id && c.status !== 'rejected' && c.day >= start && (shared || c.memberId === memberId));
  if (!c) return { status: 'todo' };
  if (c.memberId !== memberId) return { status: 'taken', by: c.memberId, completion: c };
  return { status: c.status === 'pending' ? 'pending' : 'done', completion: c };
}
export function tasksFor(memberId) {
  return state.tasks.filter((t) => t.active && (t.assignees.length === 0 || t.assignees.includes(memberId)));
}

// Aplica un cambio que da o quita puntos y devuelve subida de nivel y logros nuevos.
function rescore(memberId, mutate) {
  const m = member(memberId);
  const before = levelInfo(m.total).level;
  mutate();
  const fresh = recompute(state);
  const after = levelInfo(m.total).level;
  const newBadges = fresh[memberId] || [];
  newBadges.forEach((b) => addLog('badge', m.id, `${m.name} desbloqueó «${b.title}»`, b.icon));
  return { levelUp: after > before ? after : null, newBadges };
}

// Completa una tarea. Devuelve info para las animaciones.
export function completeTask(taskId, memberId) {
  const t = task(taskId), m = member(memberId);
  if (!t || !m || taskStatus(t, memberId).status !== 'todo') return null;
  const bonus = bonusTaskId() === t.id;
  const d = new Date();
  // Id fijo por tarea, persona y periodo: la misma persona en dos móviles solo cobra una vez.
  const id = `c-${taskId}-${memberId}-${periodStart(t.freq)}`;
  state.completions = state.completions.filter((x) => x.id !== id); // una rechazada se puede volver a hacer
  const c = touch({ id, taskId, memberId, ts: d.getTime(), day: dayKey(d), points: t.points * (bonus ? 2 : 1), bonus, status: t.approval ? 'pending' : 'approved', title: t.title, icon: t.icon });
  if (c.status === 'pending') {
    state.completions.push(c);
    addLog('pending', memberId, `${m.name} ha hecho «${t.title}» (pendiente de aprobar)`, '⏳');
    return { pending: true, completion: c };
  }
  const res = rescore(memberId, () => state.completions.push(c));
  addLog('done', m.id, `${m.name} completó «${c.title}» +${c.points}${c.bonus ? ' (x2)' : ''}`, c.icon);
  return { pending: false, completion: c, ...withGameRewards(memberId, res) };
}

export function approve(completionId) {
  const c = state.completions.find((x) => x.id === completionId);
  if (!c || c.status !== 'pending') return null;
  const m = member(c.memberId);
  if (!m) return null;
  const res = rescore(c.memberId, () => { c.status = 'approved'; touch(c); });
  addLog('done', m.id, `${m.name} completó «${c.title}» +${c.points}${c.bonus ? ' (x2)' : ''}`, c.icon);
  return withGameRewards(c.memberId, res, c.day); // cuenta para el día en que se hizo, aunque se apruebe más tarde
}
export function reject(completionId) {
  const c = state.completions.find((x) => x.id === completionId);
  if (!c || c.status !== 'pending') return;
  c.status = 'rejected'; touch(c);
  const m = member(c.memberId);
  addLog('rejected', c.memberId, `«${c.title}» de ${m ? m.name : '?'} no se aprobó`, '↩️');
}
export const pendingList = () => state.completions.filter((c) => c.status === 'pending' && member(c.memberId)).sort((a, b) => b.ts - a.ts);

// ---------- Premios ----------
export const reward = (id) => state.rewards.find((r) => r.id === id);
export function addReward(r) {
  const nr = touch({ id: uid(), title: r.title.trim(), icon: r.icon || '🎁', cost: Math.max(1, +r.cost || 50), createdAt: now() });
  state.rewards.push(nr);
  return nr;
}
export function updateReward(id, patch) { const r = reward(id); if (r) touch(Object.assign(r, patch)); }
export function removeReward(id) { remove('rewards', id); }
export function redeem(rewardId, memberId) {
  const r = reward(rewardId), m = member(memberId);
  if (!r || !m || m.points < r.cost) return null;
  const res = rescore(memberId, () => state.redemptions.unshift(touch({ id: uid(), rewardId, memberId, ts: now(), cost: r.cost, title: r.title, icon: r.icon, delivered: false })));
  addLog('redeem', memberId, `${m.name} canjeó «${r.title}» (-${r.cost})`, r.icon);
  return res;
}
export function setDelivered(id, v) { const r = state.redemptions.find((x) => x.id === id); if (r && !r.rejected) { r.delivered = v; touch(r); } }
// Rechazar un canje que aún no se ha entregado: la persona recupera sus puntos.
export function rejectRedemption(id) {
  const r = state.redemptions.find((x) => x.id === id);
  if (!r || r.delivered || r.rejected) return false;
  r.rejected = true;
  touch(r);
  recompute(state);
  const m = member(r.memberId);
  addLog('refund', r.memberId, `«${r.title}» de ${m ? m.name : '?'} se rechazó: +${r.cost} devueltos`, '↩️');
  return true;
}
export const pendingRedemptions = () => state.redemptions.filter((r) => !r.delivered && !r.rejected && member(r.memberId));
// Lo que espera a un adulto en el panel
export const adminTodo = () => pendingList().length + pendingRedemptions().length;

export function adjustPoints(memberId, delta, reason) {
  const m = member(memberId);
  if (!m || !delta) return null;
  if (delta < 0) delta = -Math.min(m.points, -delta);
  if (!delta) return null;
  const res = rescore(memberId, () => state.adjustments.push(touch({ id: uid(), memberId, delta, reason: reason || '', ts: now(), day: dayKey() })));
  addLog('adjust', memberId, `${delta > 0 ? '+' : ''}${delta} para ${m.name}${reason ? ': ' + reason : ''}`, delta > 0 ? '🎉' : '⚖️');
  return { ...res, delta };
}
export function resetPoints() {
  state.members.forEach((m) => { if (m.points > 0) state.adjustments.push(touch({ id: uid(), memberId: m.id, delta: -m.points, reason: 'Reinicio de puntos', ts: now() })); });
  recompute(state);
  addLog('adjust', null, 'Se reiniciaron los puntos de todos', '🔄');
}

// ---------- Juego: combos, retos, ruleta y cofres ----------
// Cada premio tiene un id fijo por persona y día: aunque dos móviles lo den a la vez, solo cuenta una vez.
export const gameOn = () => state.settings.gameBonus !== false;
const hasAdj = (id) => state.adjustments.some((a) => a.id === id) || !!state.deleted[id];
const doneToday = (memberId, day = dayKey()) => state.completions.filter((c) => c.memberId === memberId && c.status === 'approved' && c.day === day);
function grant(id, memberId, delta, reason, icon) {
  const m = member(memberId);
  if (!m || hasAdj(id)) return null;
  const res = rescore(memberId, () => state.adjustments.push(touch({ id, kind: 'game', memberId, delta, reason, ts: now(), day: dayKey() })));
  state.log.unshift({ id: 'log-' + id, ts: now(), type: 'bonus', memberId, text: `${m.name}: ${reason} +${delta}`, icon });
  if (state.log.length > 300) state.log.length = 300;
  return res;
}

export const COMBO_STEPS = [{ count: 3, bonus: 5 }, { count: 5, bonus: 10 }, { count: 8, bonus: 20 }];
const CHALLENGES = [
  { id: 'two', icon: '✌️', title: 'Completa 2 misiones', bonus: 5, test: (d) => d.length >= 2, can: (l) => l.length >= 2 },
  { id: 'three', icon: '🎯', title: 'Completa 3 misiones', bonus: 8, test: (d) => d.length >= 3, can: (l) => l.length >= 3 },
  { id: 'four', icon: '🚀', title: 'Completa 4 misiones', bonus: 12, test: (d) => d.length >= 4, can: (l) => l.length >= 4 },
  { id: 'star', icon: '⚡', title: 'Haz la misión estrella', bonus: 10, test: (d) => d.some((c) => c.bonus), can: (l) => l.some((t) => t.id === bonusTaskId()) },
  { id: 'early', icon: '🌅', title: 'Haz una misión antes de las 12', bonus: 10, test: (d) => d.some((c) => new Date(c.ts).getHours() < 12), can: (l, d) => new Date().getHours() < 12 || d.some((c) => new Date(c.ts).getHours() < 12) },
  { id: 'weekly', icon: '📅', title: 'Haz una misión semanal', bonus: 10, test: (d) => d.some((c) => task(c.taskId)?.freq === 'weekly'), can: (l) => l.some((t) => t.freq === 'weekly') },
  { id: 'big', icon: '💪', title: 'Haz una misión de 20 puntos o más', bonus: 10, test: (d) => d.some((c) => c.points >= 20), can: (l) => l.some((t) => t.points >= 20) },
];
// Tres retos al día, los mismos para toda la familia salvo los que no pueda hacer esa persona.
export function challengesToday(memberId, day = dayKey()) {
  if (!gameOn()) return [];
  const done = doneToday(memberId, day);
  // Solo cuenta lo que aún se puede hacer ese día: una semanal ya hecho el lunes no sirve para un reto del jueves.
  const list = tasksFor(memberId).filter((t) => { const ts = taskStatus(t, memberId); return ts.status === 'todo' || ts.completion?.day === day; });
  const hash = (s) => { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return h; };
  return CHALLENGES.filter((c) => !c.can || c.can(list, done) || hasAdj(`challenge-${c.id}-${memberId}-${day}`))
    .sort((a, b) => hash(day + a.id) - hash(day + b.id))
    .slice(0, 3)
    .map((c) => ({ ...c, done: c.test(done), claimed: hasAdj(`challenge-${c.id}-${memberId}-${day}`) }));
}

// Da los combos y retos conseguidos. Se llama al aprobar una misión, desde cualquier móvil.
function withGameRewards(memberId, res, day = dayKey()) {
  const out = { ...res, combo: null, challenges: [] };
  if (!gameOn()) return out;
  const merge = (r) => { if (r.levelUp) out.levelUp = r.levelUp; out.newBadges = [...(out.newBadges || []), ...r.newBadges]; };
  const count = doneToday(memberId, day).length;
  for (const s of COMBO_STEPS) {
    if (count < s.count) continue;
    const r = grant(`combo${s.count}-${memberId}-${day}`, memberId, s.bonus, `combo de ${s.count} misiones`, '🔥');
    if (r) { merge(r); out.combo = { count: s.count, bonus: s.bonus }; }
  }
  for (const c of challengesToday(memberId, day)) {
    if (!c.done || c.claimed) continue;
    const r = grant(`challenge-${c.id}-${memberId}-${day}`, memberId, c.bonus, `reto «${c.title}»`, c.icon);
    if (r) { merge(r); out.challenges.push(c); }
  }
  return out;
}
// Por si el móvil que aprobó no tenía todo: al sincronizar, cada móvil revisa los premios de su dueño.
export const checkGameRewards = (memberId) => withGameRewards(memberId, { levelUp: null, newBadges: [] });
export function comboInfo(memberId) {
  const count = doneToday(memberId).length;
  return { count, next: COMBO_STEPS.find((s) => count < s.count) || null };
}

// Ruleta: una tirada al día, tras completar la primera misión.
export const WHEEL = [{ pts: 5, w: 30 }, { pts: 20, w: 10 }, { pts: 10, w: 30 }, { pts: 50, w: 2 }, { pts: 5, w: 30 }, { pts: 15, w: 15 }, { pts: 10, w: 30 }, { pts: 30, w: 5 }];
export function wheelState(memberId) {
  if (!gameOn()) return 'off';
  if (hasAdj(`wheel-${memberId}-${dayKey()}`)) return 'spun';
  return doneToday(memberId).length ? 'ready' : 'locked';
}
export function spinWheel(memberId) {
  if (wheelState(memberId) !== 'ready') return null;
  let roll = Math.random() * WHEEL.reduce((a, s) => a + s.w, 0), index = 0;
  for (; index < WHEEL.length - 1; index++) { roll -= WHEEL[index].w; if (roll < 0) break; }
  const res = grant(`wheel-${memberId}-${dayKey()}`, memberId, WHEEL[index].pts, 'ruleta diaria', '🎡');
  return res && { index, pts: WHEEL[index].pts, ...res };
}

// Cofres: uno seguro al terminar las diarias y uno sorpresa, como mucho, al día.
const chestPrize = () => [10, 10, 15, 15, 20, 30][Math.floor(Math.random() * 6)];
export function dailyChestReady(memberId) {
  if (!gameOn() || hasAdj(`chest-${memberId}-${dayKey()}`)) return false;
  const p = todayProgress(memberId);
  const pendingDaily = tasksFor(memberId).some((t) => t.freq === 'daily' && taskStatus(t, memberId).status === 'pending');
  return p.total > 0 && p.done === p.total && !pendingDaily && doneToday(memberId).length > 0;
}
export function openDailyChest(memberId) {
  if (!dailyChestReady(memberId)) return null;
  const pts = chestPrize();
  const res = grant(`chest-${memberId}-${dayKey()}`, memberId, pts, 'cofre del día', '🎁');
  return res && { pts, ...res };
}
export function rollLuckyChest(memberId, chance = 0.2) {
  if (!gameOn() || Math.random() >= chance) return null;
  const pts = chestPrize();
  const res = grant(`lucky-${memberId}-${dayKey()}`, memberId, pts, 'cofre sorpresa', '🧰');
  return res && { pts, ...res };
}

// Accesorios que se ganan subiendo de nivel
export const ACCESSORY_LEVEL = { none: 1, party: 1, flower: 1, bow: 1, cap: 2, glasses: 2, catEars: 3, sunglasses: 3, headphones: 4, halo: 5, wizard: 6, crown: 8 };

// ---------- Estadísticas ----------
export const memberStats = (m) => statsOf(state, m);
export const weekPoints = (memberId) => weekPointsOf(state, memberId);
// Puesto en el ranking semanal: los empatados comparten puesto.
export function weekRank(memberId) {
  const mine = weekPoints(memberId);
  return 1 + state.members.filter((m) => weekPoints(m.id) > mine).length;
}
export const familyWeekPoints = () => state.members.reduce((a, m) => a + weekPoints(m.id), 0);
export function todayProgress(memberId) {
  const list = tasksFor(memberId).filter((t) => t.freq === 'daily');
  const done = list.filter((t) => taskStatus(t, memberId).status !== 'todo').length;
  return { done, total: list.length };
}
export function ranking(mode = 'week') {
  return state.members
    .map((m) => ({ m, pts: mode === 'week' ? weekPoints(m.id) : m.total }))
    .sort((a, b) => b.pts - a.pts);
}

// ---------- Datos de ejemplo ----------
export function seedDemo(avatars) {
  state = emptyState();
  state.setup = true;
  state.familyName = 'Familia Demo';
  touchMeta();
  const names = [['Mamá', 'adult'], ['Papá', 'adult'], ['Lucía', 'kid'], ['Leo', 'kid']];
  names.forEach(([n, role], i) => addMember({ name: n, avatar: avatars[i], role }));
  TASK_TEMPLATES.slice(0, 12).forEach((t, i) => addTask({ ...t, approval: i % 4 === 3 }));
  REWARD_TEMPLATES.forEach((r) => addReward(r));
  commit();
}

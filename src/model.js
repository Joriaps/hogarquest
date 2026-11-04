// Lógica pura del modelo (sin dependencias): la usan la app y el servidor de sincronización.
// Los puntos, rachas y totales se DERIVAN del historial (tareas aprobadas, ajustes y canjes),
// así dos móviles que suman puntos a la vez nunca se pisan.

export const SCHEMA = 2;
export const COLLECTIONS = ['members', 'tasks', 'rewards', 'completions', 'redemptions', 'adjustments'];
const META_KEYS = ['familyName', 'pin', 'pinHash', 'pinSalt', 'settings', 'setup'];

// ---------- Fechas ----------
const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + n));
}
export function weekStart(key = dayKey()) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const dow = (dt.getDay() + 6) % 7; // lunes = 0
  return dayKey(new Date(y, m - 1, d - dow));
}

// ---------- Niveles ----------
const LEVEL_TITLES = ['Aprendiz', 'Ayudante', 'Ayudante Pro', 'Héroe del Hogar', 'Súper Héroe', 'Maestro Limpiador', 'Campeón', 'Gran Campeón', 'Leyenda', 'Leyenda Épica', 'Mito del Hogar'];
export const xpForLevel = (n) => 25 * n * (n - 1); // XP acumulada para llegar al nivel n (1→0, 2→50, 3→150...)
export function levelInfo(xp) {
  let lvl = 1;
  while (xp >= xpForLevel(lvl + 1)) lvl++;
  const cur = xpForLevel(lvl), next = xpForLevel(lvl + 1);
  return { level: lvl, title: LEVEL_TITLES[Math.min(lvl - 1, LEVEL_TITLES.length - 1)], into: xp - cur, need: next - cur, pct: Math.round(((xp - cur) / (next - cur)) * 100) };
}

// ---------- Logros ----------
export const BADGES = [
  { id: 'first', icon: '🌱', title: 'Primer paso', desc: 'Completa tu primera tarea', test: (s) => s.count >= 1 },
  { id: 'ten', icon: '🔟', title: 'En racha de trabajo', desc: 'Completa 10 tareas', test: (s) => s.count >= 10 },
  { id: 'fifty', icon: '💪', title: 'Imparable', desc: 'Completa 50 tareas', test: (s) => s.count >= 50 },
  { id: 'hundred', icon: '💯', title: 'Centenario', desc: 'Completa 100 tareas', test: (s) => s.count >= 100 },
  { id: 'streak3', icon: '🔥', title: 'Calentando', desc: 'Racha de 3 días', test: (s) => s.bestStreak >= 3 },
  { id: 'streak7', icon: '☄️', title: 'Semana perfecta', desc: 'Racha de 7 días', test: (s) => s.bestStreak >= 7 },
  { id: 'streak30', icon: '🌋', title: 'Volcán', desc: 'Racha de 30 días', test: (s) => s.bestStreak >= 30 },
  { id: 'lvl5', icon: '🦸', title: 'Súper Héroe', desc: 'Llega al nivel 5', test: (s) => s.level >= 5 },
  { id: 'lvl10', icon: '🐉', title: 'Leyenda', desc: 'Llega al nivel 10', test: (s) => s.level >= 10 },
  { id: 'rich', icon: '💰', title: 'Ahorrador', desc: 'Gana 500 puntos en total', test: (s) => s.total >= 500 },
  { id: 'shopper', icon: '🛍️', title: 'De compras', desc: 'Canjea tu primer premio', test: (s) => s.redeemed >= 1 },
  { id: 'early', icon: '🐓', title: 'Madrugador', desc: 'Haz una tarea antes de las 9:00', test: (s) => s.early },
  { id: 'weekend', icon: '🏖️', title: 'Finde productivo', desc: 'Haz una tarea en fin de semana', test: (s) => s.weekend },
  { id: 'bonus', icon: '🎯', title: 'Cazabonus', desc: 'Completa una tarea x2 del día', test: (s) => s.bonus },
  { id: 'variety', icon: '🌈', title: 'Todoterreno', desc: 'Haz 5 tareas distintas', test: (s) => s.distinct >= 5 },
];

export function emptyState() {
  return {
    version: SCHEMA,
    setup: false,
    familyName: '',
    pin: '', // solo datos antiguos: store.load() lo convierte a pinHash
    pinHash: '',
    pinSalt: '',
    settings: { sound: true, weeklyGoal: 400, goalReward: 'Noche de pizza en familia 🍕', gameBonus: true },
    metaU: 0,
    members: [],
    tasks: [],
    rewards: [],
    completions: [],
    redemptions: [],
    adjustments: [],
    deleted: {},
    log: [],
  };
}

// ---------- Valores derivados ----------
export function memberStats(state, m) {
  const done = state.completions.filter((c) => c.memberId === m.id && c.status === 'approved');
  return {
    count: done.length,
    total: m.total || 0,
    level: levelInfo(m.total || 0).level,
    bestStreak: m.bestStreak || 0,
    redeemed: state.redemptions.filter((r) => r.memberId === m.id && !r.rejected).length,
    early: done.some((c) => new Date(c.ts).getHours() < 9),
    weekend: done.some((c) => [0, 6].includes(new Date(c.ts).getDay())),
    bonus: done.some((c) => c.bonus),
    distinct: new Set(done.map((c) => c.taskId)).size,
  };
}

// Recalcula puntos, total, rachas y logros de cada miembro. Devuelve {memberId: [logros nuevos]}.
export function recompute(state) {
  const fresh = {};
  for (const m of state.members) {
    let earned = 0, adjPos = 0, adjAll = 0, spent = 0;
    const days = new Set();
    for (const c of state.completions) if (c.memberId === m.id && c.status === 'approved') { earned += c.points; days.add(c.day); }
    for (const a of state.adjustments) if (a.memberId === m.id) { adjAll += a.delta; if (a.delta > 0) adjPos += a.delta; }
    for (const r of state.redemptions) if (r.memberId === m.id && !r.rejected) spent += r.cost; // un canje rechazado devuelve sus puntos
    m.total = earned + adjPos;
    m.points = Math.max(0, earned + adjAll - spent);
    const sorted = [...days].sort();
    let best = 0, run = 0, prev = null;
    for (const d of sorted) { run = prev && addDays(prev, 1) === d ? run + 1 : 1; best = Math.max(best, run); prev = d; }
    m.streak = run;
    m.bestStreak = best;
    m.lastDay = prev;
    if (!Array.isArray(m.badges)) m.badges = [];
    const s = memberStats(state, m);
    const nb = BADGES.filter((b) => !m.badges.includes(b.id) && b.test(s));
    if (nb.length) { m.badges.push(...nb.map((b) => b.id)); fresh[m.id] = nb; }
  }
  return fresh;
}

// ---------- Saneado: todo lo que entra (servidor, otro móvil, importación, disco) pasa por aquí ----------
const LIMITS = { members: 30, tasks: 300, rewards: 200, completions: 50000, redemptions: 5000, adjustments: 50000 };
const AVATAR_KEYS = ['skin', 'hair', 'hairColor', 'eyes', 'mouth', 'accessory', 'bg'];
const isId = (v) => typeof v === 'string' && /^[\w-]{1,100}$/.test(v);
const ref = (v) => (isId(v) ? v : null);
const txt = (v, max, d = '') => (typeof v === 'string' ? v.slice(0, max) : d);
const int = (v, min, max, d = 0) => (Number.isFinite(v) ? Math.min(max, Math.max(min, Math.trunc(v))) : d);
const when = (v) => int(v, 0, Date.now() + 864e5); // como mucho un día en el futuro: nadie «bloquea» un dato para siempre
const dayOf = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '2000-01-01');
const ico = (v, d) => (typeof v === 'string' && v.length <= 16 && !/[\x00-\x7f]/.test(v) ? v : d); // emoji: sin ASCII no cabe HTML
const avatarOf = (a) => Object.fromEntries(AVATAR_KEYS.filter((k) => a && typeof a[k] === 'string').map((k) => [k, a[k].slice(0, 20)]));
const CLEAN = {
  members: (m) => ({ id: m.id, name: txt(m.name, 30, '?'), avatar: avatarOf(m.avatar), role: m.role === 'adult' ? 'adult' : 'kid', pinHash: typeof m.pinHash === 'string' && /^[A-Za-z0-9+/=]{1,100}$/.test(m.pinHash) ? m.pinHash : '', pinSalt: txt(m.pinSalt, 64), points: int(m.points, 0, 1e7), badges: Array.isArray(m.badges) ? m.badges.filter(isId).slice(0, 50) : [], createdAt: when(m.createdAt), u: when(m.u) }),
  tasks: (t) => ({ id: t.id, title: txt(t.title, 60, '?'), icon: ico(t.icon, '⭐'), points: int(t.points, 1, 1000, 10), freq: ['daily', 'weekly', 'once'].includes(t.freq) ? t.freq : 'daily', assignees: Array.isArray(t.assignees) ? t.assignees.filter(isId).slice(0, 30) : [], approval: !!t.approval, active: t.active !== false, createdAt: when(t.createdAt), u: when(t.u) }),
  rewards: (r) => ({ id: r.id, title: txt(r.title, 60, '?'), icon: ico(r.icon, '🎁'), cost: int(r.cost, 1, 100000, 50), createdAt: when(r.createdAt), u: when(r.u) }),
  completions: (c) => ({ id: c.id, taskId: ref(c.taskId), memberId: ref(c.memberId), ts: when(c.ts), day: dayOf(c.day), points: int(c.points, 0, 2000), bonus: !!c.bonus, status: ['pending', 'approved', 'rejected'].includes(c.status) ? c.status : 'pending', title: txt(c.title, 60, '?'), icon: ico(c.icon, '⭐'), u: when(c.u) }),
  redemptions: (r) => ({ id: r.id, rewardId: ref(r.rewardId), memberId: ref(r.memberId), ts: when(r.ts), cost: int(r.cost, 0, 100000), title: txt(r.title, 60, '?'), icon: ico(r.icon, '🎁'), delivered: !!r.delivered, rejected: !!r.rejected, u: when(r.u) }),
  adjustments: (a) => ({ id: a.id, ...(a.kind === 'game' ? { kind: 'game' } : {}), memberId: ref(a.memberId), delta: int(a.delta, -1e6, 1e6), reason: txt(a.reason, 80), ts: when(a.ts), ...(a.day ? { day: dayOf(a.day) } : {}), u: when(a.u) }),
};
const isEntity = (e) => !!e && typeof e === 'object' && isId(e.id);
function sanitize(raw) {
  const s = emptyState();
  const st = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  s.version = int(raw.version, 1, SCHEMA, 1);
  s.setup = !!raw.setup;
  s.familyName = txt(raw.familyName, 40);
  s.pinHash = typeof raw.pinHash === 'string' && /^[A-Za-z0-9+/=]{1,100}$/.test(raw.pinHash) ? raw.pinHash : '';
  s.pinSalt = txt(raw.pinSalt, 64);
  s.pin = !s.pinHash && typeof raw.pin === 'string' && /^\d{4}$/.test(raw.pin) ? raw.pin : '';
  s.settings = { sound: st.sound !== false, weeklyGoal: int(st.weeklyGoal, 10, 1e6, 400), goalReward: txt(st.goalReward, 80, s.settings.goalReward), gameBonus: st.gameBonus !== false };
  s.metaU = when(raw.metaU);
  for (const k of COLLECTIONS) s[k] = (Array.isArray(raw[k]) ? raw[k] : []).filter(isEntity).slice(-LIMITS[k]).map(CLEAN[k]);
  if (raw.deleted && typeof raw.deleted === 'object') for (const [id, t] of Object.entries(raw.deleted).slice(-100000)) if (isId(id) && Number.isFinite(t)) s.deleted[id] = when(t);
  s.log = (Array.isArray(raw.log) ? raw.log : []).filter(isEntity).slice(0, 300).map((l) => ({ id: l.id, ts: when(l.ts), type: txt(l.type, 20), memberId: ref(l.memberId), text: txt(l.text, 200), icon: ico(l.icon, '•') }));
  return s;
}

// Pasa datos antiguos (puntos guardados a mano) al esquema actual sin perder puntos.
export function migrate(state) {
  const s = sanitize(state);
  if ((state.version || 1) < 2) {
    const stored = new Map(s.members.map((m) => [m.id, m.points || 0]));
    recompute(s);
    for (const m of s.members) {
      const diff = (stored.get(m.id) || 0) - m.points;
      if (diff) s.adjustments.push({ id: 'mig' + m.id, memberId: m.id, delta: diff, reason: 'Saldo anterior', ts: Date.now(), u: 1 });
    }
    s.version = SCHEMA;
  }
  recompute(s);
  return s;
}

// ---------- Fusión de dos copias (móvil ↔ servidor) ----------
const byCreated = (a, b) => (a.createdAt || a.ts || 0) - (b.createdAt || b.ts || 0);
export function merge(aIn, bIn) {
  const a = migrate(aIn), b = migrate(bIn);
  const out = emptyState();
  const meta = (b.metaU || 0) > (a.metaU || 0) ? b : a;
  META_KEYS.forEach((k) => (out[k] = JSON.parse(JSON.stringify(meta[k]))));
  out.metaU = Math.max(a.metaU || 0, b.metaU || 0);
  out.setup = !!(a.setup || b.setup);
  out.deleted = { ...a.deleted };
  for (const [id, t] of Object.entries(b.deleted)) out.deleted[id] = Math.max(out.deleted[id] || 0, t);
  for (const k of COLLECTIONS) {
    const map = new Map();
    for (const e of a[k]) map.set(e.id, e);
    for (const e of b[k]) {
      const cur = map.get(e.id);
      if (!cur) { map.set(e.id, e); continue; }
      // En un empate se decide por contenido: si no, cada móvil se quedaría con una versión distinta.
      const win = (e.u || 0) !== (cur.u || 0) ? ((e.u || 0) > (cur.u || 0) ? e : cur) : (JSON.stringify(e) > JSON.stringify(cur) ? e : cur);
      if (k === 'members') win.badges = [...new Set([...(cur.badges || []), ...(e.badges || [])])];
      map.set(e.id, win);
    }
    out[k] = [...map.values()].filter((e) => !out.deleted[e.id]).map((e) => JSON.parse(JSON.stringify(e)));
  }
  out.members.sort(byCreated); out.tasks.sort(byCreated); out.rewards.sort(byCreated);
  out.completions.sort((x, y) => x.ts - y.ts);
  out.adjustments.sort((x, y) => x.ts - y.ts);
  out.redemptions.sort((x, y) => y.ts - x.ts);
  const logs = new Map();
  [...a.log, ...b.log].forEach((l) => logs.set(l.id, l));
  out.log = [...logs.values()].sort((x, y) => y.ts - x.ts).slice(0, 300);
  recompute(out);
  return out;
}

// Puntos de la semana: misiones aprobadas más bonus y ajustes con fecha (los reinicios no llevan fecha).
export function weekPointsOf(state, memberId, ws = weekStart()) {
  const done = state.completions.filter((c) => c.memberId === memberId && c.status === 'approved' && c.day >= ws).reduce((a, c) => a + c.points, 0);
  const adj = state.adjustments.filter((a) => a.memberId === memberId && a.day && a.day >= ws).reduce((t, a) => t + a.delta, 0);
  return Math.max(0, done + adj);
}

// Resumen legible de la puntuación (se guarda también en el archivo del servidor)
export function summary(state) {
  return state.members.map((m) => ({
    nombre: m.name,
    puntos: m.points,
    puntosTotales: m.total,
    nivel: levelInfo(m.total).level,
    puntosEstaSemana: weekPointsOf(state, m.id),
    racha: m.streak,
    logros: m.badges.length,
  }));
}

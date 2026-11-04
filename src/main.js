import '@fontsource-variable/fredoka';
import './styles.css';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import * as S from './store.js';
import { avatarSVG, defaultAvatar, randomAvatar, AVATAR_PARTS, PART_LABELS, partPreviewSVG } from './avatar.js';
import * as fx from './fx.js';
import * as Sync from './sync.js';
import * as G from './game-fx.js';

const $app = document.getElementById('app');
const $modal = document.getElementById('modal');
const $toasts = document.getElementById('toasts');

// ---------- Estado de la interfaz ----------
const ui = {
  screen: 'setup',
  setupStep: 0,
  memberId: null,
  tab: 'tasks',
  adminTab: 'approve',
  rankMode: 'week',
  anim: true,
  shownPts: {},
};
let draft = {}; // borrador del formulario abierto en el modal
let modalOnClose = null;
let confirmAnswer = false;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const av = (m, size = 64) => `<span class="av">${avatarSVG(m.avatar || defaultAvatar(), size)}</span>`;
const st = () => S.state;

function ago(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'ayer' : `hace ${d} días`;
}
function greeting() {
  const h = new Date().getHours();
  return h < 13 ? '¡Buenos días!' : h < 21 ? '¡Buenas tardes!' : '¡Buenas noches!';
}

function go(screen, extra = {}) {
  Object.assign(ui, { screen }, extra);
  ui.anim = true;
  ui.list = true;
  window.scrollTo(0, 0);
  render();
}

// ---------- De quién es este móvil ----------
// Si el móvil es de una persona, la app se abre siempre en su perfil; si es compartido, se elige cada vez.
const myId = () => (Sync.sync.me && Sync.sync.me !== 'shared' && S.member(Sync.sync.me) ? Sync.sync.me : null);
const personal = () => !!myId();
const needWhoami = () => st().setup && st().members.length > 0 && !personal() && Sync.sync.me !== 'shared';
const adultHere = () => personal() && S.member(myId()).role === 'adult';
// El modo admin se activa con el PIN de admin compartido y sigue activo hasta salir a mano desde Ajustes.
const adminDevice = () => adultHere() && Sync.sync.admin;
const adultCount = () => st().members.filter((m) => m.role === 'adult').length;
// Pantallas con campos fuera de un modal: repintarlas borraría lo que se está escribiendo.
const formOnScreen = () => ui.screen === 'setup' || (ui.screen === 'admin' && ui.adminTab === 'settings');
const canRepaint = () => !modalOpen() && !formOnScreen();
// El sonido es de cada móvil, no de la familia.
const SOUND_KEY = 'hogarquest.sound';
const soundOn = () => { try { return localStorage.getItem(SOUND_KEY) !== 'off'; } catch { return true; } };
const setSound = (on) => { try { localStorage.setItem(SOUND_KEY, on ? 'on' : 'off'); } catch {} fx.setSoundEnabled(on); };
function goHome() {
  ui.pinAdmin = false;
  if (personal()) go('member', { memberId: myId(), tab: ui.screen === 'member' ? ui.tab : 'tasks' });
  else if (needWhoami()) go('whoami');
  else go('home');
}

// ---------- Render principal ----------
function render() {
  const s = st();
  if (!s.setup && ui.screen !== 'setup') ui.screen = 'setup';
  // Si a este móvil le quitan el rol de adulto desde otro, deja de ver el panel (salvo que entrara con PIN).
  if (ui.screen === 'admin' && personal() && !adminDevice() && !ui.pinAdmin) Object.assign(ui, { screen: 'member', memberId: myId(), tab: 'tasks' });
  if (s.setup && ui.screen !== 'admin' && ui.screen !== 'setup') {
    if (personal()) { if (ui.screen !== 'member' || ui.memberId !== myId()) Object.assign(ui, { screen: 'member', memberId: myId() }); }
    else if (needWhoami()) ui.screen = 'whoami';
  }
  if (ui.screen === 'member' && !S.member(ui.memberId)) ui.screen = 'home';
  if (personal()) {
    ui.myLevel = S.levelInfo(S.member(myId()).total).level;
    ui.myRank = S.weekRank(myId());
  }
  let html = '';
  if (ui.screen === 'setup') html = viewSetup();
  else if (ui.screen === 'whoami') html = viewWhoami();
  else if (ui.screen === 'home') html = viewHome();
  else if (ui.screen === 'member') html = viewMember();
  else if (ui.screen === 'admin') html = viewAdmin();
  // Repintar no debe mover el menú deslizable (el del panel es el único de esta capa)
  const prevMenuScroll = $app.querySelector('.segWrap > .seg')?.scrollLeft ?? null;
  $app.innerHTML = html;
  if (ui.anim) {
    const sc = $app.querySelector('.screen');
    if (sc) sc.classList.add('enter');
    ui.anim = false;
  }
  // Las listas solo entran animadas al cambiar de pantalla o pestaña, no en cada actualización
  if (!ui.list) $app.querySelectorAll('.stagger').forEach((el) => el.classList.remove('stagger'));
  ui.list = false;
  const seg = $app.querySelector('.segWrap > .seg');
  if (seg) {
    if (prevMenuScroll == null) showActiveInMenu(seg);
    else { seg.scrollLeft = prevMenuScroll; updateScrollHint(seg); }
  }
  animateCounters();
}

// Menús deslizables: la flechita indica hacia qué lado hay más opciones.
function updateScrollHint(seg) {
  const wrap = seg.parentElement;
  wrap.classList.toggle('moreLeft', seg.scrollLeft > 2);
  wrap.classList.toggle('moreRight', seg.scrollLeft + seg.clientWidth < seg.scrollWidth - 2);
}
// Al entrar en un menú se muestra la opción activa; después se queda donde lo deje quien lo usa.
function showActiveInMenu(seg) {
  const on = seg.querySelector('.on');
  if (on) seg.scrollLeft = on.offsetLeft - (seg.clientWidth - on.offsetWidth) / 2;
  updateScrollHint(seg);
}

function animateCounters() {
  $app.querySelectorAll('[data-count]').forEach((el) => {
    const key = el.dataset.countKey, to = +el.dataset.count;
    const from = ui.shownPts[key] ?? to;
    ui.shownPts[key] = to;
    if (from === to) { el.textContent = to; return; }
    const t0 = performance.now(), dur = 900;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    el.parentElement.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 600, easing: 'ease-out' });
  });
}

// ---------- Configuración inicial ----------
function viewSetup() {
  const s = st(), step = ui.setupStep;
  const dots = `<div class="steps">${[0, 1, 2, 3].map((i) => `<i class="${i <= step ? 'on' : ''}"></i>`).join('')}</div>`;
  if (step === 0) {
    return `<div class="screen noNav center" style="padding-top:calc(var(--safe-top) + 60px)">
      <div><span class="logo">🏡</span></div>
      <h1 class="title-grad" style="font-size:42px;margin-top:6px">HogarQuest</h1>
      <p class="muted" style="font-size:18px;margin:8px 10px 26px">Convierte las tareas de casa en una aventura familiar: gana puntos, sube de nivel, desbloquea logros y canjea premios.</p>
      <div class="card" style="text-align:left">
        <div class="row" style="margin-bottom:10px"><span style="font-size:28px">✅</span><div>Tareas diarias y semanales con puntos</div></div>
        <div class="row" style="margin-bottom:10px"><span style="font-size:28px">🧑‍🎤</span><div>Un avatar personalizado para cada uno</div></div>
        <div class="row" style="margin-bottom:10px"><span style="font-size:28px">🏆</span><div>Niveles, rachas, logros y ranking</div></div>
        <div class="row"><span style="font-size:28px">🎁</span><div>Tienda de premios decidida por los adultos</div></div>
      </div>
      <div style="margin-top:26px" class="list">
        <button class="btn block" data-a="setupNext">¡Empezar! 🚀</button>
        <button class="btn pink block" data-a="joinSheet">👨‍👩‍👧 Unirme a mi familia con un código</button>
        <button class="btn ghost block" data-a="demo">Probar con una familia de ejemplo</button>
      </div>
    </div>`;
  }
  if (step === 1) {
    return `<div class="screen noNav">
      ${dots}
      <div class="center"><span class="mascot">👨‍👩‍👧‍👦</span><h1>Vuestra familia</h1><p class="muted">Pon un nombre y el PIN de admin que compartiréis los adultos para entrar al panel. Cada persona tendrá además su PIN personal.</p></div>
      <div class="card" style="margin-top:14px">
        <label class="f"><span>Nombre de la familia</span><input class="inp" id="fName" maxlength="30" placeholder="Familia García" value="${esc(s.familyName)}"></label>
        <label class="f"><span>PIN de admin compartido (4 cifras)</span><input class="inp" id="fPin" type="password" inputmode="numeric" maxlength="4" placeholder="••••"></label>
        <label class="f" style="margin:0"><span>Repite el PIN</span><input class="inp" id="fPin2" type="password" inputmode="numeric" maxlength="4" placeholder="••••"></label>
      </div>
      <div class="row" style="margin-top:20px"><button class="btn ghost" data-a="setupBack">Atrás</button><button class="btn grow" data-a="setupFamily">Siguiente</button></div>
    </div>`;
  }
  if (step === 2) {
    return `<div class="screen noNav">
      ${dots}
      <div class="center"><span class="mascot">🦸</span><h1>¿Quiénes sois?</h1><p class="muted">Añade a cada miembro y diseña su avatar.</p></div>
      <div class="profiles stagger" style="margin-top:16px">
        ${s.members.map((m) => `<button class="profile" data-a="editMember" data-id="${m.id}">${av(m, 92)}<div class="nm">${esc(m.name)}</div><div class="lv">${m.role === 'adult' ? 'Adulto' : 'Peque'}</div></button>`).join('')}
        <button class="profile add" data-a="newMember"><div><div style="font-size:40px">➕</div>Añadir</div></button>
      </div>
      <div class="row" style="margin-top:22px"><button class="btn ghost" data-a="setupBack">Atrás</button><button class="btn grow" data-a="setupMembers" ${s.members.length ? '' : 'disabled'}>Siguiente</button></div>
    </div>`;
  }
  // paso 3: tareas y premios iniciales
  return `<div class="screen noNav">
    ${dots}
    <div class="center"><span class="mascot">📋</span><h1>Tareas y premios</h1><p class="muted">Marca con qué empezar. Podrás cambiarlo todo en el panel de admin.</p></div>
    <h2>Tareas</h2>
    <div class="tplList" id="tplTasks">${S.TASK_TEMPLATES.map((t, i) => `<label><input type="checkbox" value="${i}" ${i < 10 ? 'checked' : ''}><span class="e">${t.icon}</span><span class="grow">${esc(t.title)}<br><span class="small muted">${S.FREQ_LABEL[t.freq]} · ${t.points} pts</span></span></label>`).join('')}</div>
    <h2>Premios</h2>
    <div class="tplList" id="tplRewards">${S.REWARD_TEMPLATES.map((r, i) => `<label><input type="checkbox" value="${i}" checked><span class="e">${r.icon}</span><span class="grow">${esc(r.title)}<br><span class="small muted">${r.cost} pts</span></span></label>`).join('')}</div>
    <div class="row" style="margin-top:20px"><button class="btn ghost" data-a="setupBack">Atrás</button><button class="btn mint grow" data-a="setupFinish">¡Listo! 🎉</button></div>
  </div>`;
}

// ---------- ¿Quién eres? (al entrar; la sesión sigue abierta hasta cerrarla en Ajustes) ----------
function viewWhoami() {
  return `<div class="screen noNav">
    <div class="center" style="margin-top:30px"><span class="mascot" style="font-size:56px">👋</span><h1>¿Quién eres?</h1>
      <p class="muted" style="margin:6px 8px 18px">Elige tu perfil y entra con tu PIN. La sesión seguirá abierta hasta que la cierres en Ajustes.</p></div>
    <div class="profiles stagger">
      ${st().members.map((m) => `<button class="profile ${Sync.sync.me === m.id ? 'mine' : ''}" data-a="setMe" data-id="${m.id}">${av(m, 96)}<div class="nm ellipsis">${esc(m.name)}</div><div class="lv">${m.role === 'adult' ? 'Adulto' : 'Peque'}</div></button>`).join('')}
    </div>
    <button class="btn ghost block" style="margin-top:20px" data-a="setMe" data-id="shared">📱 Este móvil lo usa toda la familia<br><span class="small muted" style="font-weight:400">(se elige quién es cada vez)</span></button>
  </div>`;
}

// ---------- Inicio: selector de perfil ----------
function viewHome() {
  const s = st();
  const pend = S.adminTodo();
  const goalPts = S.familyWeekPoints(), goal = s.settings.weeklyGoal;
  const pct = Math.min(100, Math.round((goalPts / goal) * 100));
  const bonus = S.task(S.bonusTaskId());
  return `<div class="screen noNav">
    <div class="topbar">
      <div class="grow"><div class="muted small">${greeting()}</div><h1 class="ellipsis">${esc(s.familyName)}</h1></div>
      ${cloudChip()}
      <button class="iconBtn badgeDot" data-a="openAdmin" aria-label="Panel de admin">⚙️${pend ? `<b>${pend}</b>` : ''}</button>
    </div>
    <p class="muted" style="margin:0 0 12px;font-size:17px">¿Quién va a ayudar hoy?</p>
    <div class="profiles stagger">
      ${s.members.map((m) => {
        const li = S.levelInfo(m.total), str = S.currentStreak(m);
        return `<button class="profile" data-a="pickMember" data-id="${m.id}">
          <span class="pts">⭐ ${m.points}</span>${str > 1 ? `<span class="streak">🔥${str}</span>` : ''}
          ${av(m, 96)}<div class="nm ellipsis">${esc(m.name)}</div><div class="lv">Nv. ${li.level} · ${li.title}</div>
        </button>`;
      }).join('')}
    </div>
    <div class="card goal">
      <div class="row between"><h3>🎯 Meta familiar semanal</h3><span class="small muted">${goalPts}/${goal}</span></div>
      <div class="bar" style="margin:10px 0 8px"><i style="width:${pct}%"></i></div>
      <div class="small muted">${pct >= 100 ? '¡Meta conseguida! 🎉 ' : 'Premio: '}${esc(s.settings.goalReward)}</div>
    </div>
    ${bonus ? `<div class="card row"><span style="font-size:34px">${bonus.icon}</span><div class="grow"><div class="small muted">Tarea estrella de hoy</div><b>${esc(bonus.title)}</b></div><span class="chip tag x2">x2 puntos</span></div>` : ''}
    <div class="card">
      <div class="row between"><h3>📰 Últimas noticias</h3><button class="small muted" data-a="go" data-to="rank">Ranking 🏆</button></div>
      ${feedHTML(s.log.slice(0, 6))}
    </div>
    <button class="btn sm ghost block" style="margin-top:14px" data-a="leaveShared">👤 Usar este móvil con mi usuario</button>
  </div>`;
}

function cloudChip() {
  if (!Sync.enabled()) return '';
  const s = Sync.sync.status;
  const [ic, cls] = s === 'ok' ? ['☁️', 'ok'] : s === 'syncing' ? ['🔄', 'spin'] : ['📴', 'off'];
  return `<button class="iconBtn cloud ${cls}" data-a="cloudInfo" aria-label="Sincronización">${ic}</button>`;
}
function syncText() {
  const s = Sync.sync;
  if (s.status === 'ok') return `Sincronizado ${ago(s.lastOk)}`;
  if (s.status === 'syncing') return 'Sincronizando… (si el servidor dormía puede tardar hasta 1 min)';
  if (s.status === 'error') return s.error || 'Error';
  return 'Sin conexión con el servidor: los cambios se guardan en el móvil y se enviarán solos';
}

function feedHTML(items) {
  if (!items.length) return `<div class="empty small">Todavía no ha pasado nada. ¡A por la primera tarea!</div>`;
  return `<div class="feed">${items.map((l) => `<div class="it"><span class="e">${l.icon}</span><span class="grow">${esc(l.text)}</span><span class="w">${ago(l.ts)}</span></div>`).join('')}</div>`;
}

// ---------- Pantalla de cada miembro ----------
function viewMember() {
  const m = S.member(ui.memberId);
  const li = S.levelInfo(m.total), str = S.currentStreak(m);
  const tabs = [['tasks', '⚔️', 'Misiones'], ['rewards', '🎁', 'Premios'], ['badges', '🏅', 'Logros'], ['family', '👨‍👩‍👧', 'Familia']];
  const todo = S.tasksFor(m.id).filter((t) => S.taskStatus(t, m.id).status === 'todo').length;
  const pend = S.adminTodo();
  let body = '';
  if (ui.tab === 'tasks') body = memberTasks(m);
  else if (ui.tab === 'rewards') body = memberRewards(m);
  else if (ui.tab === 'badges') body = memberBadges(m);
  else if (ui.tab === 'settings') body = memberSettings(m);
  else body = familyView();
  // Un adulto fuera del modo admin ve aquí que hay misiones por revisar o premios por entregar
  const gear = `<button class="iconBtn badgeDot ${ui.tab === 'settings' ? 'gearOn' : ''}" data-a="tab" data-tab="settings" aria-label="Ajustes">⚙️${pend && adultHere() && !adminDevice() ? `<b>${pend}</b>` : ''}</button>`;
  const top = personal()
    ? `<div class="topbar">
        <div class="grow"><div class="muted small">${greeting()}</div><div class="ellipsis" style="font-weight:600;font-size:18px">${esc(st().familyName)}</div></div>
        ${cloudChip()}
        ${gear}
      </div>`
    : `<div class="topbar">
        <button class="iconBtn" data-a="home" aria-label="Volver">⬅️</button>
        <div class="grow muted">Cambiar de jugador</div>
        ${cloudChip()}
        ${gear}
      </div>`;
  return `<div class="screen">
    ${top}
    <div class="card heroCard">
      <div class="hero">
        ${personal() ? `<button class="heroAv" data-a="editSelf" aria-label="Personalizar mi avatar">${av(m, 68)}<span class="editDot">✏️</span></button>` : `<span class="heroAv">${av(m, 68)}</span>`}
        <div class="grow">
          <h1 class="ellipsis" style="font-size:22px">${esc(m.name)}</h1>
          <div class="muted small">${li.title}</div>
          <div class="stats">
            <span class="chip gold pointsChip">⭐ <span data-count="${m.points}" data-count-key="${m.id}">${m.points}</span></span>
            <span class="chip fire"><span class="fl">🔥</span>${str} ${str === 1 ? 'día' : 'días'}</span>
            <span class="chip lvl">Nv. ${li.level}</span>
          </div>
        </div>
      </div>
      <div class="xp"><div class="lbl"><span>Experiencia</span><span>${li.into}/${li.need} XP</span></div><div class="bar pink thin"><i style="width:${li.pct}%"></i></div></div>
    </div>
    ${body}
    <nav class="nav">${tabs.map(([k, e, l]) => `<button class="${ui.tab === k ? 'on' : ''}" data-a="tab" data-tab="${k}"><span class="e">${e}</span>${l}${k === 'tasks' && todo ? `<b>${todo}</b>` : ''}</button>`).join('')}${adminDevice() ? `<button data-a="openAdmin"><span class="e">🛠️</span>Panel${pend ? `<b>${pend}</b>` : ''}</button>` : ''}</nav>
  </div>`;
}

// Ajustes de cada persona: su PIN, su sesión y, si es adulto, entrar o salir del modo admin
function memberSettings(m) {
  const adminOn = adminDevice();
  return `<h2>Ajustes</h2>
    <div class="card">
      <h3>👤 Mi cuenta</h3>
      <div class="row" style="margin:12px 0">${av(m, 52)}<div class="grow"><b>${esc(m.name)}</b><div class="small muted">${m.role === 'adult' ? 'Adulto' : 'Peque'}</div></div></div>
      <div class="row wrap"><button class="btn sm ghost grow" data-a="editSelf">🎨 Mi avatar</button><button class="btn sm ghost grow" data-a="changeMyPin">🔢 Cambiar mi PIN</button></div>
    </div>
    ${adultHere() ? `<div class="card">
      <h3>🛠️ Modo admin ${adminOn ? '<span class="chip tag ok">Activado</span>' : ''}</h3>
      <p class="small muted">${adminOn ? 'Sigue activado hasta que salgas, aunque cierres la app. Puedes jugar igual.' : 'Con el PIN de admin compartido puedes gestionar tareas, puntos, premios y familia. Mientras tanto sigues como jugador.'}</p>
      ${adminOn ? `<div class="row wrap"><button class="btn sm grow" data-a="openAdmin">Abrir panel</button><button class="btn sm ghost grow" data-a="exitAdmin">Salir del modo admin</button></div>`
        : '<button class="btn sm block" data-a="openAdmin">🔐 Entrar en modo admin</button>'}
    </div>` : ''}
    <div class="card">
      <h3>📱 Este móvil</h3>
      <label class="switch" style="margin-top:10px"><span>🔊 Sonidos</span><input type="checkbox" data-a="toggleSound" ${soundOn() ? 'checked' : ''}><span class="tg"></span></label>
      ${personal() ? '<button class="btn sm danger block" data-a="logout">Cerrar sesión</button><p class="small muted" style="margin:8px 0 0">No se borra nada. Para volver a entrar hará falta tu PIN.</p>' : ''}
    </div>`;
}

// Ruleta, cofre, combo y retos del día
function gameStrip(m) {
  if (!S.gameOn()) return '';
  const wheel = S.wheelState(m.id), chest = S.dailyChestReady(m.id), combo = S.comboInfo(m.id), retos = S.challengesToday(m.id);
  const wheelText = wheel === 'ready' ? '¡Gira y gana!' : wheel === 'spun' ? 'Vuelve mañana' : 'Haz 1 misión';
  const second = chest
    ? `<button class="gameBtn ready" data-a="chestDaily"><span class="gi">🎁</span><b>Cofre del día</b><small>¡Ábrelo!</small></button>`
    : `<div class="gameBtn"><span class="gi fl">🔥</span><b>Combo ${combo.count}</b><small>${combo.next ? `Faltan ${combo.next.count - combo.count} para +${combo.next.bonus}` : '¡Combo máximo!'}</small></div>`;
  return `<div class="gameRow">
      <button class="gameBtn ${wheel === 'ready' ? 'ready' : ''}" data-a="wheelOpen" ${wheel === 'ready' ? '' : 'disabled'}><span class="gi">🎡</span><b>Ruleta</b><small>${wheelText}</small></button>
      ${second}
    </div>
    ${retos.length ? `<div class="retos">${retos.map((r) => `<div class="reto ${r.claimed ? 'got' : ''}"><span class="gi">${r.claimed ? '✅' : r.icon}</span><div><div class="rt">${esc(r.title)}</div><div class="rp">+${r.bonus} ⭐</div></div></div>`).join('')}</div>` : ''}`;
}

function taskCard(t, m, bonusId) {
  const ts = S.taskStatus(t, m.id);
  const isBonus = bonusId === t.id;
  const pts = t.points * (isBonus ? 2 : 1);
  let right, cls = '';
  if (ts.status === 'todo') right = `<button class="doneBtn" data-a="complete" data-id="${t.id}" aria-label="Hecho">✓</button>`;
  else if (ts.status === 'pending') { right = `<span class="doneMark wait">⏳</span>`; cls = 'done'; }
  else if (ts.status === 'taken') { const by = S.member(ts.by); right = by ? `<span title="${esc(by.name)}">${av(by, 44)}</span>` : '<span class="doneMark">✓</span>'; cls = 'done'; }
  else { right = `<span class="doneMark">✓</span>`; cls = 'done'; }
  const tags = [`<span class="chip tag">${S.FREQ_LABEL[t.freq]}</span>`];
  if (isBonus && ts.status === 'todo') tags.unshift('<span class="chip tag x2">⚡ x2</span>');
  if (t.approval && ts.status === 'todo') tags.push('<span class="chip tag">👀 Con revisión</span>');
  if (ts.status === 'pending') tags.push('<span class="chip tag wait">Esperando aprobación</span>');
  if (ts.status === 'done') tags.push('<span class="chip tag ok">¡Hecha!</span>');
  if (ts.status === 'taken') { const by = S.member(ts.by); tags.push(`<span class="chip tag ok">La hizo ${esc(by ? by.name : '')}</span>`); }
  return `<div class="task ${cls} ${isBonus && ts.status === 'todo' ? 'bonus' : ''}" data-task="${t.id}">
    <div class="ic">${t.icon}</div>
    <div class="info"><div class="t">${esc(t.title)}</div><div class="meta"><span class="pts">+${pts} ⭐</span>${tags.join('')}</div></div>
    ${right}
  </div>`;
}

function memberTasks(m) {
  const list = S.tasksFor(m.id);
  const bonusId = S.bonusTaskId();
  const order = { daily: 0, weekly: 1, once: 2 };
  const sorted = list.slice().sort((a, b) => order[a.freq] - order[b.freq]);
  const todo = sorted.filter((t) => S.taskStatus(t, m.id).status === 'todo');
  const rest = sorted.filter((t) => S.taskStatus(t, m.id).status !== 'todo');
  const tp = S.todayProgress(m.id);
  const pct = tp.total ? Math.round((tp.done / tp.total) * 100) : 0;
  if (!list.length) return `<div class="empty"><span class="big">🦗</span>No tienes tareas asignadas.<br>Pide a un adulto que añada alguna desde ⚙️.</div>`;
  return `
    <div class="card" style="margin-top:12px">
      <div class="row between"><h3>Misiones de hoy</h3><span class="small muted">${tp.done}/${tp.total} diarias</span></div>
      <div class="bar gold" style="margin-top:10px"><i style="width:${pct}%"></i></div>
    </div>
    ${gameStrip(m)}
    ${todo.length ? `<h2>Misiones pendientes <span class="muted small">(${todo.length})</span></h2><div class="list stagger">${todo.map((t) => taskCard(t, m, bonusId)).join('')}</div>`
      : `<div class="allDone" style="margin-top:16px"><span class="big">🏆</span><h3>¡Todo hecho por ahora!</h3><div class="small muted" style="margin-top:4px">Eres un crack. Vuelve mañana para más misiones.</div></div>`}
    ${rest.length ? `<h2>Completadas</h2><div class="list">${rest.map((t) => taskCard(t, m, bonusId)).join('')}</div>` : ''}`;
}

function memberRewards(m) {
  const rs = st().rewards.slice().sort((a, b) => a.cost - b.cost);
  const mine = st().redemptions.filter((r) => r.memberId === m.id).slice(0, 8);
  return `
    <h2>Tienda de premios</h2>
    ${rs.length ? `<div class="rewards stagger">${rs.map((r) => {
      const can = m.points >= r.cost;
      const pct = Math.min(100, Math.round((m.points / r.cost) * 100));
      return `<div class="reward ${can ? 'can' : ''}">
        <div class="ic">${r.icon}</div><div class="t">${esc(r.title)}</div><div class="cost">⭐ ${r.cost}</div>
        ${can ? `<button class="btn sm pink" data-a="redeem" data-id="${r.id}">Canjear</button>`
          : `<div><div class="bar thin"><i style="width:${pct}%"></i></div><div class="small muted" style="margin-top:5px">Te faltan ${r.cost - m.points}</div></div>`}
      </div>`;
    }).join('')}</div>` : `<div class="empty"><span class="big">🎁</span>Aún no hay premios. Los adultos pueden crearlos en ⚙️.</div>`}
    ${mine.length ? `<h2>Mis canjes</h2><div class="card feed">${mine.map((r) => `<div class="it"><span class="e">${r.icon}</span><span class="grow">${esc(r.title)}</span><span class="chip tag ${r.rejected ? '' : r.delivered ? 'ok' : 'wait'}">${r.rejected ? 'Rechazado · puntos devueltos' : r.delivered ? 'Entregado' : 'Pendiente'}</span></div>`).join('')}</div>` : ''}`;
}

function memberBadges(m) {
  const got = m.badges.length;
  const s = S.memberStats(m);
  return `
    <div class="kpis" style="margin-top:12px">
      <div class="kpi"><div class="v">${s.count}</div><div class="l">Tareas hechas</div></div>
      <div class="kpi"><div class="v">${m.total}</div><div class="l">Puntos totales</div></div>
      <div class="kpi"><div class="v">${s.bestStreak}</div><div class="l">Mejor racha</div></div>
    </div>
    <h2>Logros <span class="muted small">${got}/${S.BADGES.length}</span></h2>
    <div class="badges stagger">${S.BADGES.map((b) => {
      const ok = m.badges.includes(b.id);
      return `<div class="badge ${ok ? 'got' : 'locked'}"><span class="ic">${ok ? b.icon : '🔒'}</span><div class="t">${b.title}</div><div class="d">${b.desc}</div></div>`;
    }).join('')}</div>`;
}

// Pestaña Familia: puntos de todos, podio, meta común y novedades
function familyView() {
  const me = myId() || ui.memberId;
  return `${rankView()}
    <h2>Todos</h2>
    <div class="list">${st().members.map((x) => {
      const li = S.levelInfo(x.total), str = S.currentStreak(x);
      return `<div class="rankRow ${x.id === me ? 'meRow' : ''}">${av(x, 44)}<div class="grow"><b>${esc(x.name)}</b>${x.id === me ? ' <span class="chip tag">tú</span>' : ''}<div class="small muted">Nv. ${li.level} · ${li.title}${str > 1 ? ` · 🔥${str}` : ''}</div></div><b style="color:var(--gold)">⭐ ${x.points}</b></div>`;
    }).join('')}</div>
    <div class="card" style="margin-top:14px"><h3>📰 Últimas noticias</h3>${feedHTML(st().log.slice(0, 12))}</div>`;
}

function rankView() {
  const r = S.ranking(ui.rankMode);
  const top = [r[1], r[0], r[2]];
  const goalPts = S.familyWeekPoints(), goal = st().settings.weeklyGoal;
  return `
    <div class="seg" style="margin-top:16px"><button class="${ui.rankMode === 'week' ? 'on' : ''}" data-a="rankMode" data-v="week">Esta semana</button><button class="${ui.rankMode === 'all' ? 'on' : ''}" data-a="rankMode" data-v="all">Desde siempre</button></div>
    <div class="podium">${top.map((x, i) => x ? `<div class="pod p${[2, 1, 3][i]}">${i === 1 ? '<span class="crown">👑</span>' : ''}${av(x.m, i === 1 ? 76 : 62)}<div class="nm ellipsis">${esc(x.m.name)}</div><div class="ptsl">⭐ ${x.pts}</div><div class="blk">${[2, 1, 3][i]}</div></div>` : '<div class="pod"></div>').join('')}</div>
    ${r.length > 3 ? `<div class="list">${r.slice(3).map((x, i) => `<div class="rankRow"><span class="pos">${i + 4}</span>${av(x.m, 40)}<span class="grow">${esc(x.m.name)}</span><b style="color:var(--gold)">⭐ ${x.pts}</b></div>`).join('')}</div>` : ''}
    <div class="card goal">
      <div class="row between"><h3>🎯 Meta familiar</h3><span class="small muted">${goalPts}/${goal}</span></div>
      <div class="bar" style="margin:10px 0 8px"><i style="width:${Math.min(100, Math.round((goalPts / goal) * 100))}%"></i></div>
      <div class="small muted">Entre todos: ${esc(st().settings.goalReward)}</div>
    </div>`;
}

// ---------- Panel de administración ----------
function viewAdmin() {
  const pend = S.pendingList().length;
  const undelivered = S.pendingRedemptions().length;
  // Primero lo que espera a un adulto; después, lo que se configura
  const tabs = [['approve', '✅ Misiones por revisar', pend], ['redeems', '🛍️ Premios por entregar', undelivered], ['tasks', '📋 Tareas'], ['rewards', '🎁 Tienda'], ['members', '👨‍👩‍👧 Familia'], ['settings', '⚙️ Ajustes']];
  let body = '';
  switch (ui.adminTab) {
    case 'approve': body = adminApprove(); break;
    case 'tasks': body = adminTasks(); break;
    case 'members': body = adminMembers(); break;
    case 'rewards': body = adminRewards(); break;
    case 'redeems': body = adminRedeems(); break;
    default: body = adminSettings();
  }
  return `<div class="screen noNav">
    <div class="topbar"><button class="iconBtn" data-a="home" aria-label="Salir">⬅️</button><div class="grow"><div class="small muted">Modo admin</div><h1>Panel de control</h1></div>${adminDevice() ? '<button class="btn sm ghost" data-a="exitAdmin">Salir</button>' : '<span class="mascot" style="font-size:32px">🛠️</span>'}</div>
    <div class="segWrap"><div class="seg scroll">${tabs.map(([k, l, n]) => `<button class="${ui.adminTab === k ? 'on' : ''}" data-a="adminTab" data-tab="${k}">${n ? `<b>${n}</b>` : ''}${l}</button>`).join('')}</div></div>
    <div style="margin-top:14px">${body}</div>
  </div>`;
}

function adminApprove() {
  const list = S.pendingList();
  const hint = '<p class="panelHint">Aquí llegan las misiones marcadas con 👀 «Con revisión». Comprueba que están hechas: ✔️ da los puntos y ✖️ no los da.</p>';
  if (!list.length) return `${hint}<div class="empty"><span class="big">😎</span>No hay misiones por revisar.</div>`;
  return `${hint}<div class="list stagger">${list.map((c) => {
    const m = S.member(c.memberId);
    return `<div class="approval" data-comp="${c.id}">${m ? av(m, 44) : ''}<div class="grow"><b>${c.icon} ${esc(c.title)}</b><div class="small muted">${esc(m ? m.name : '?')} · ${ago(c.ts)} · +${c.points} ⭐${c.bonus ? ' (x2)' : ''}</div></div>
      <button class="iconBtn" data-a="reject" data-id="${c.id}" aria-label="Rechazar">✖️</button><button class="iconBtn" style="background:#3ee6a833" data-a="approve" data-id="${c.id}" aria-label="Aprobar">✔️</button></div>`;
  }).join('')}</div>`;
}

function adminTasks() {
  const ts = st().tasks;
  const names = (t) => (t.assignees.length ? t.assignees.map((id) => S.member(id)?.name).filter(Boolean).join(', ') : 'Cualquiera');
  return `<div class="row" style="margin-bottom:12px"><button class="btn sm grow" data-a="newTask">➕ Nueva tarea</button><button class="btn sm ghost grow" data-a="taskTemplates">📚 Plantillas</button></div>
    ${ts.length ? `<div class="list stagger">${ts.map((t) => `<div class="adminItem taskRow ${t.active ? '' : 'off'}"><div class="row grow" style="flex-basis:100%"><span class="ic">${t.icon}</span><div class="grow"><b class="ellipsis" style="display:block">${esc(t.title)}</b><div class="small muted">${S.FREQ_LABEL[t.freq]} · ${esc(names(t))}${t.approval ? ' · 👀 con revisión' : ''}</div></div></div>
      <div class="stepper sm"><button data-a="taskPts" data-id="${t.id}" data-d="-5" aria-label="Menos puntos">−</button><span class="v" id="tp-${t.id}">${t.points}</span><button data-a="taskPts" data-id="${t.id}" data-d="5" aria-label="Más puntos">+</button></div>
      <span class="grow"></span>
      <label class="switch" style="margin:0"><input type="checkbox" data-a="toggleTask" data-id="${t.id}" ${t.active ? 'checked' : ''}><span class="tg"></span></label>
      <button class="iconBtn" data-a="editTask" data-id="${t.id}" aria-label="Editar">✏️</button>
      <button class="iconBtn" data-a="removeTaskRow" data-id="${t.id}" aria-label="Quitar">🗑️</button></div>`).join('')}</div>`
      : `<div class="empty"><span class="big">📝</span>No hay tareas. ¡Crea la primera!</div>`}`;
}

function adminMembers() {
  return `<button class="btn sm block" data-a="newMember" style="margin-bottom:12px">➕ Añadir miembro</button>
    <div class="list stagger">${st().members.map((m) => {
      const li = S.levelInfo(m.total);
      return `<div class="adminItem">${av(m, 48)}<div class="grow"><b>${esc(m.name)}</b><div class="small muted">${m.role === 'adult' ? 'Adulto' : 'Peque'} · Nv. ${li.level} · ⭐ ${m.points}</div></div>
        <button class="iconBtn" data-a="adjust" data-id="${m.id}" aria-label="Puntos">±</button><button class="iconBtn" data-a="editMember" data-id="${m.id}" aria-label="Editar">✏️</button></div>`;
    }).join('')}</div>`;
}

function adminRewards() {
  const rs = st().rewards;
  return `<button class="btn sm block" data-a="newReward" style="margin-bottom:12px">➕ Nuevo premio</button>
    ${rs.length ? `<div class="list stagger">${rs.map((r) => `<div class="adminItem"><span class="ic">${r.icon}</span><div class="grow"><b>${esc(r.title)}</b><div class="small muted">⭐ ${r.cost}</div></div><button class="iconBtn" data-a="editReward" data-id="${r.id}" aria-label="Editar">✏️</button></div>`).join('')}</div>`
      : `<div class="empty"><span class="big">🎁</span>Sin premios todavía.</div>`}`;
}

function adminRedeems() {
  const hint = '<p class="panelHint">Al canjear un premio, los puntos se descuentan al momento. Pulsa <b>Entregar</b> cuando lo hayas dado, o <b>Rechazar</b> para devolver los puntos.</p>';
  const waiting = (r) => !r.delivered && !r.rejected;
  // Los que esperan, primero; dentro de cada grupo, los más recientes
  const rs = st().redemptions.slice().sort((a, b) => waiting(b) - waiting(a) || b.ts - a.ts);
  if (!rs.length) return `${hint}<div class="empty"><span class="big">🛍️</span>Nadie ha canjeado premios aún.</div>`;
  return `${hint}<div class="list">${rs.slice(0, 60).map((r) => {
    const m = S.member(r.memberId);
    const actions = r.rejected ? '<span class="chip tag">Rechazado · puntos devueltos</span>'
      : r.delivered ? `<button class="btn sm ghost" data-a="deliver" data-id="${r.id}">Entregado ✓</button>`
      : `<button class="btn sm ghost" data-a="rejectRedeem" data-id="${r.id}">Rechazar</button><button class="btn sm mint" data-a="deliver" data-id="${r.id}">Entregar</button>`;
    return `<div class="adminItem taskRow ${waiting(r) ? '' : 'off'}"><div class="row grow" style="flex-basis:100%"><span class="ic">${r.icon}</span><div class="grow"><b>${esc(r.title)}</b><div class="small muted">${esc(m ? m.name : '?')} · ${ago(r.ts)} · ⭐ ${r.cost}</div></div></div>
      <span class="grow"></span>${actions}</div>`;
  }).join('')}</div>`;
}

function adminSettings() {
  const s = st();
  return `<div class="card">
      <label class="f"><span>Nombre de la familia</span><input class="inp" id="setName" maxlength="30" value="${esc(s.familyName)}"></label>
      <label class="switch"><span>🎡 Puntos extra del juego (ruleta, cofres, combos y retos)</span><input type="checkbox" id="setGame" ${S.gameOn() ? 'checked' : ''}><span class="tg"></span></label>
      <label class="f"><span>Meta familiar semanal (puntos)</span><input class="inp" id="setGoal" type="number" inputmode="numeric" min="10" step="10" value="${s.settings.weeklyGoal}"></label>
      <label class="f"><span>Premio de la meta familiar</span><input class="inp" id="setGoalReward" maxlength="60" value="${esc(s.settings.goalReward)}"></label>
      <label class="f"><span>Nuevo PIN de admin compartido (déjalo vacío para no cambiarlo)</span><input class="inp" id="setPin" type="password" inputmode="numeric" maxlength="4" placeholder="••••"></label>
      <button class="btn block" data-a="saveSettings">Guardar ajustes</button>
    </div>
    ${familyShareCard()}
    <div class="card">
      <h3>💾 Copia de seguridad</h3>
      <p class="small muted">Exporta los datos para pasarlos a otro móvil o guardarlos.</p>
      <div class="row"><button class="btn sm ghost grow" data-a="exportData">Exportar</button><button class="btn sm ghost grow" data-a="importData">Importar</button></div>
    </div>
    <div class="card"><h3>📰 Historial</h3>${feedHTML(s.log.slice(0, 40))}</div>
    <div class="card"><h3>⚠️ Zona peligrosa</h3><p class="small muted">Pon los puntos de todos a cero o borra los datos de este móvil${Sync.enabled() ? ' (la familia sigue guardada en el servidor y en los demás móviles)' : ''}.</p>
      <div class="row wrap"><button class="btn sm ghost grow" data-a="resetPoints">Poner puntos a 0</button><button class="btn sm danger grow" data-a="resetAll">Borrar de este móvil</button></div></div>`;
}

function familyShareCard() {
  const s = Sync.sync;
  if (Sync.enabled()) {
    return `<div class="card shareCard">
      <h3>👨‍👩‍👧 Familia compartida</h3>
      <p class="small muted">Todos los móviles con este código ven los mismos puntos, tareas y premios.</p>
      <div class="familyCode">${esc(Sync.prettyCode(s.code))}</div>
      <div class="small muted center" id="syncState">${esc(syncText())}</div>
      <div class="row wrap" style="margin-top:12px"><button class="btn sm grow" data-a="shareCode">📤 Compartir código</button><button class="btn sm ghost grow" data-a="syncNow">🔄 Sincronizar</button></div>
      <p class="small muted" style="margin:12px 0 4px">En otro móvil: instala HogarQuest, pulsa «Unirme a mi familia con un código» y escribe el código.</p>
      <button class="btn sm ghost block" data-a="disconnect">Desconectar este móvil</button>
      <div class="small muted" style="margin-top:8px;word-break:break-all">Servidor: ${esc(s.server)}</div>
    </div>`;
  }
  return `<div class="card shareCard">
    <h3>👨‍👩‍👧 Compartir con toda la familia</h3>
    <p class="small muted">Activa la familia compartida para que cada uno use su propio móvil (Android o iPhone) y todos veáis las puntuaciones de todos.</p>
    <label class="f"><span>Servidor de sincronización</span><input class="inp" id="srvUrl" placeholder="https://hogarquest-sync.onrender.com" value="${esc(s.server)}"></label>
    <button class="btn block pink" data-a="createShared">☁️ Activar familia compartida</button>
  </div>`;
}

function joinSheet() {
  draft = { kind: 'join' };
  const hasDefault = !!Sync.DEFAULT_SERVER;
  openModal(`${sheetHead('Unirme a mi familia')}
    <p class="muted small" style="margin-top:0">Pide el código a un adulto: está en Panel → Ajustes → Familia compartida.</p>
    <label class="f"><span>Código de la familia (o pega el mensaje que te enviaron)</span><input class="inp codeInp" id="joinCode" maxlength="300" placeholder="ABCD-1234" autocapitalize="characters" autocomplete="off"></label>
    ${hasDefault ? `<details class="small muted" style="margin-bottom:14px"><summary>Opciones avanzadas</summary><label class="f" style="margin-top:10px"><span>Servidor</span><input class="inp" id="joinSrv" value="${esc(Sync.sync.server || Sync.DEFAULT_SERVER)}"></label></details>`
      : `<label class="f"><span>Servidor de sincronización</span><input class="inp" id="joinSrv" placeholder="https://hogarquest-sync.onrender.com" value="${esc(Sync.sync.server)}"></label>`}
    <button class="btn block mint" data-a="doJoin" id="joinBtn">Unirme</button>`);
}

// ---------- Modales ----------
function openModal(html, { dialog = false, onClose = null } = {}) {
  modalOnClose = onClose;
  ui.modalAt = performance.now();
  $modal.innerHTML = `<div class="overlay ${dialog ? 'centered' : ''}" data-a="overlay">${dialog ? `<div class="dialog">${html}</div>` : `<div class="sheet"><div class="grab"></div>${html}</div>`}</div>`;
}
function closeModal() {
  const ov = $modal.querySelector('.overlay');
  if (!ov) return;
  ov.classList.add('closing');
  const cb = modalOnClose;
  modalOnClose = null;
  setTimeout(() => {
    if ($modal.contains(ov)) $modal.innerHTML = '';
    cb && cb();
    if (ui.pendingRender && !modalOpen()) { ui.pendingRender = false; render(); }
    pumpModals();
  }, 200);
}
const modalOpen = () => !!$modal.querySelector('.overlay:not(.closing)');
// Las celebraciones esperan su turno: nunca tapan un formulario ni se pisan entre ellas.
const modalQueue = [];
function enqueueModal(fn) { modalQueue.push(fn); pumpModals(); }
function pumpModals() {
  if (ui.pumpTimer || !modalQueue.length) return;
  ui.pumpTimer = setTimeout(() => {
    ui.pumpTimer = null;
    if (modalOpen()) return;
    const fn = modalQueue.shift();
    if (fn) fn();
  }, 800);
}
const sheetHead = (title) => `<div class="hd"><h3>${title}</h3><button class="iconBtn" data-a="close" aria-label="Cerrar">✖️</button></div>`;

function confirmDialog({ icon = '❓', title, text = '', ok = 'Aceptar', cancel = 'Cancelar', danger = false }) {
  return new Promise((resolve) => {
    confirmAnswer = false;
    openModal(`<span class="big">${icon}</span><h3 style="font-size:22px">${title}</h3>${text ? `<p class="muted">${text}</p>` : ''}
      <div class="btns"><button class="btn ghost" data-a="dlgNo">${cancel}</button><button class="btn ${danger ? 'danger' : ''}" data-a="dlgYes">${ok}</button></div>`, { dialog: true, onClose: () => resolve(confirmAnswer) });
    draft = { kind: 'confirm' };
  });
}

function toast(icon, text, ms = 2800) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span class="e">${icon}</span><span>${text}</span>`;
  $toasts.appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, ms);
}

// --- Editor de miembro con avatar ---
function memberEditor(id, { self = false } = {}) {
  const m = id ? S.member(id) : null;
  // La primera persona de la familia suele ser quien la crea: empieza como adulto.
  draft = { kind: 'member', id, self, avatar: { ...(m ? m.avatar : randomAvatar()) }, part: self ? 'accessory' : 'skin', role: m ? m.role : st().members.length ? 'kid' : 'adult' };
  const parts = Object.keys(PART_LABELS);
  openModal(`${sheetHead(self ? 'Tu avatar' : m ? 'Editar miembro' : 'Nuevo miembro')}
    <div class="avEdit">
      <div class="prev"><span id="avPrev">${av({ avatar: draft.avatar }, 150)}</span></div>
      <div class="row" style="justify-content:center;margin-bottom:12px"><button class="btn sm ghost" data-a="avRandom">🎲 Sorpréndeme</button></div>
      <div class="segWrap"><div class="seg scroll" id="avParts">${parts.map((p) => `<button class="${p === draft.part ? 'on' : ''}" data-a="avPart" data-part="${p}">${PART_LABELS[p]}</button>`).join('')}</div></div>
      <div class="opts" id="avOpts"></div>
    </div>
    <div class="sep"></div>
    ${self ? '' : `<label class="f"><span>Nombre</span><input class="inp" id="mName" maxlength="20" placeholder="Nombre" value="${esc(m ? m.name : '')}"></label>
    <label class="f"><span>${m && S.hasPin(m) ? 'Nuevo PIN personal (déjalo vacío para no cambiarlo)' : 'PIN personal de 4 cifras (opcional: si no lo pones, lo creará al entrar por primera vez)'}</span><input class="inp" id="mPin" type="password" inputmode="numeric" maxlength="4" placeholder="••••" autocomplete="new-password"></label>
    <div class="f" style="margin-bottom:18px"><span class="muted small" style="display:block;margin-bottom:6px">Tipo (los adultos tienen el panel de administración)</span>
      <div class="pick"><button class="${draft.role === 'kid' ? 'on' : ''}" data-a="pick" data-k="role" data-v="kid">🧒 Peque</button><button class="${draft.role === 'adult' ? 'on' : ''}" data-a="pick" data-k="role" data-v="adult">🧑 Adulto</button></div></div>`}
    <button class="btn block mint" data-a="saveMember">Guardar</button>
    ${m && !self ? `<button class="btn block danger" style="margin-top:12px" data-a="deleteMember">Eliminar a ${esc(m.name)}</button>` : ''}`);
  showActiveInMenu(document.getElementById('avParts'));
  renderAvOpts();
}
// Nivel que falta para poder elegir un accesorio en tu propio avatar (0 si ya se puede)
function lockedLevel(part, id) {
  if (!draft.self || part !== 'accessory') return 0;
  const need = S.ACCESSORY_LEVEL[id] || 1;
  return S.levelInfo(S.member(draft.id)?.total ?? 0).level >= need ? 0 : need;
}
function renderAvOpts() {
  const box = document.getElementById('avOpts');
  if (!box) return;
  const part = draft.part;
  const isColor = ['skin', 'hairColor', 'bg'].includes(part);
  box.innerHTML = AVATAR_PARTS[part].map((o) => {
    const lock = lockedLevel(part, o.id);
    return `<button class="${draft.avatar[part] === o.id ? 'on' : ''} ${lock ? 'lockedOpt' : ''}" data-a="avOpt" data-id="${o.id}" ${lock ? `data-lock="${lock}"` : ''} title="${esc(o.label)}">${isColor ? `<span class="sw" style="background:${o.value}"></span>` : `<span class="av">${partPreviewSVG(part, o.id, draft.avatar, 54)}</span>`}${lock ? `<span class="lockTag">🔒 ${lock}</span>` : ''}</button>`;
  }).join('');
  document.getElementById('avPrev').innerHTML = av({ avatar: draft.avatar }, 150);
}

// --- Editor de tarea ---
function taskEditor(id) {
  const t = id ? S.task(id) : null;
  draft = { kind: 'task', id, icon: t ? t.icon : '⭐', points: t ? t.points : 10, freq: t ? t.freq : 'daily', assignees: t ? [...t.assignees] : [] };
  const ms = st().members;
  openModal(`${sheetHead(t ? 'Editar tarea' : 'Nueva tarea')}
    <label class="f"><span>¿Qué hay que hacer?</span><input class="inp" id="tTitle" maxlength="40" placeholder="Ej: Recoger los juguetes" value="${esc(t ? t.title : '')}"></label>
    <div class="f"><span class="muted small" style="display:block;margin-bottom:6px">Icono</span><div class="emojis">${S.TASK_ICONS.map((e) => `<button class="${draft.icon === e ? 'on' : ''}" data-a="pick" data-k="icon" data-v="${e}">${e}</button>`).join('')}</div></div>
    <div class="row between f"><span class="muted">Puntos</span><div class="stepper"><button data-a="step" data-k="points" data-d="-5">−</button><span class="v" id="v-points">${draft.points}</span><button data-a="step" data-k="points" data-d="5">+</button></div></div>
    <div class="f"><span class="muted small" style="display:block;margin-bottom:6px">Frecuencia</span><div class="pick">${Object.entries(S.FREQ_LABEL).map(([k, l]) => `<button class="${draft.freq === k ? 'on' : ''}" data-a="pick" data-k="freq" data-v="${k}">${l}</button>`).join('')}</div></div>
    <div class="f"><span class="muted small" style="display:block;margin-bottom:6px">¿Quién puede hacerla?</span><div class="pick" id="assignPick">
      <button class="${draft.assignees.length ? '' : 'on'}" data-a="anyone">🙋 Cualquiera (el primero)</button>
      ${ms.map((m) => `<button class="${draft.assignees.includes(m.id) ? 'on' : ''}" data-a="assign" data-id="${m.id}">${esc(m.name)}</button>`).join('')}
    </div><div class="small muted" style="margin-top:6px">Si eliges personas, cada una tiene que hacer la suya.</div></div>
    <label class="switch"><span>👀 Requiere aprobación de un adulto</span><input type="checkbox" id="tApproval" ${t && t.approval ? 'checked' : ''}><span class="tg"></span></label>
    <button class="btn block mint" data-a="saveTask">Guardar tarea</button>
    ${t ? `<button class="btn block danger" style="margin-top:12px" data-a="deleteTask">Eliminar tarea</button>` : ''}`);
}

function rewardEditor(id) {
  const r = id ? S.reward(id) : null;
  draft = { kind: 'reward', id, icon: r ? r.icon : '🎁', cost: r ? r.cost : 50 };
  openModal(`${sheetHead(r ? 'Editar premio' : 'Nuevo premio')}
    <label class="f"><span>Premio</span><input class="inp" id="rTitle" maxlength="40" placeholder="Ej: Ir al parque de bolas" value="${esc(r ? r.title : '')}"></label>
    <div class="f"><span class="muted small" style="display:block;margin-bottom:6px">Icono</span><div class="emojis">${S.REWARD_ICONS.map((e) => `<button class="${draft.icon === e ? 'on' : ''}" data-a="pick" data-k="icon" data-v="${e}">${e}</button>`).join('')}</div></div>
    <div class="row between f"><span class="muted">Precio en puntos</span><div class="stepper"><button data-a="step" data-k="cost" data-d="-10">−</button><span class="v" id="v-cost">${draft.cost}</span><button data-a="step" data-k="cost" data-d="10">+</button></div></div>
    <button class="btn block mint" data-a="saveReward">Guardar premio</button>
    ${r ? `<button class="btn block danger" style="margin-top:12px" data-a="deleteReward">Eliminar premio</button>` : ''}`);
}

// check: comprueba el PIN escrito (con espera tras varios fallos). Sin check, solo recoge 4 cifras para crear uno nuevo.
function pinDialog({ title, subtitle, check = null, onOk }) {
  draft = { kind: 'pin', buf: '', check, onOk };
  openModal(`<span class="big" style="font-size:52px">🔐</span><h3 style="font-size:22px">${title}</h3><p class="muted" style="margin:4px 0 0">${subtitle}</p>
    <div class="pinDots" id="pinDots">${'<i></i>'.repeat(4)}</div>
    <div class="pinPad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-a="pin" data-v="${n}">${n}</button>`).join('')}<button data-a="close" style="font-size:16px">Salir</button><button data-a="pin" data-v="0">0</button><button data-a="pin" data-v="del">⌫</button></div>`, { dialog: true });
}

// ---------- Celebraciones ----------
function celebrateLevel(m, level) {
  enqueueModal(() => {
    fx.sfx('levelup'); fx.haptic('heavy');
    fx.confetti({ count: 180, emoji: ['⭐', '✨'] });
    const li = S.levelInfo(m.total);
    const unlocked = AVATAR_PARTS.accessory.filter((o) => S.ACCESSORY_LEVEL[o.id] === level).map((o) => o.label);
    draft = { kind: 'level' };
    openModal(`<div class="levelUp"><div class="rays"></div><div class="muted">¡Subida de nivel!</div><div class="num">${level}</div>
      <div style="margin:10px 0">${av(m, 90)}</div><h3 style="font-size:22px">${esc(m.name)} ahora es<br><span class="title-grad">${li.title}</span></h3>
      ${unlocked.length ? `<p class="muted small" style="margin:8px 0 0">🔓 Nuevo para tu avatar: <b style="color:#fff">${esc(unlocked.join(', '))}</b></p>` : ''}
      <div class="btns"><button class="btn block" data-a="close">¡Genial! 🙌</button></div></div>`, { dialog: true });
  });
}
// Abre un cofre. pts ya concedidos en el sorpresa; el del día se concede al tocarlo.
function chestModal(title, memberId, pts = null) {
  draft = { kind: 'chest', memberId, pts, opening: false };
  openModal(`<h3 style="font-size:22px">${title}</h3><button class="chestTap" id="chestBox" data-a="chestTap" aria-label="Abrir cofre">${G.chestHTML()}</button><p class="muted" id="chestMsg" style="margin:6px 0 0">¡Tócalo para abrirlo!</p><div class="btns" id="chestBtns"></div>`, { dialog: true });
  fx.sfx('whoosh');
}
function showPrize(boxMsg, btns, pts) {
  fx.sfx('redeem'); fx.haptic('success'); fx.coinRain(14);
  fx.confetti({ count: 120, emoji: ['⭐'] });
  if (boxMsg) boxMsg.innerHTML = `<span class="prize">+${pts} ⭐</span>`;
  if (btns) btns.innerHTML = '<button class="btn block" data-a="close">¡Genial! 🙌</button>';
  ui.pendingRender = true;
}
function showBadges(badges, delay = 900) {
  badges.forEach((b, i) => setTimeout(() => { fx.sfx('badge'); fx.haptic('success'); toast(b.icon, `<b>¡Logro desbloqueado!</b><br>${b.title}`, 3500); }, delay + i * 1200));
}
function handleAward(res, m, goalBefore) {
  if (!res) return;
  // Si un adulto aprueba desde su móvil, la celebración personal sale en el móvil del peque.
  const forMe = !personal() || m.id === myId();
  if (forMe && res.levelUp) { ui.myLevel = res.levelUp; celebrateLevel(m, res.levelUp); }
  if (forMe && res.newBadges && res.newBadges.length) showBadges(res.newBadges, res.levelUp ? 2200 : 900);
  const goal = st().settings.weeklyGoal;
  if (goalBefore < goal && S.familyWeekPoints() >= goal) {
    setTimeout(() => { fx.sfx('levelup'); fx.confetti({ count: 220, emoji: ['🎉', '⭐', '🏆'] }); toast('🎯', `<b>¡Meta familiar conseguida!</b><br>${esc(st().settings.goalReward)}`, 5000); }, res.levelUp ? 3500 : 1200);
  }
}

// Abre la sesión de este móvil con una persona (o lo deja compartido).
async function claimDevice(id) {
  await Sync.setMe(id);
  if (id === 'shared') { fx.sfx('tap'); toast('📱', 'Móvil compartido: se elegirá quién es cada vez'); }
  else {
    const m = S.member(id);
    fx.sfx('levelup'); fx.haptic('success'); fx.confetti({ count: 120, emoji: ['⭐'] });
    toast('👋', `¡Hola, ${esc(m.name)}!`);
  }
  goHome();
}

// Pide dos veces el PIN personal nuevo y lo guarda.
function newPinFlow(memberId, then, title = 'Crea tu PIN') {
  pinDialog({
    title,
    subtitle: 'Elige 4 cifras que solo sepas tú',
    onOk: (first) => pinDialog({
      title: 'Repite tu PIN',
      subtitle: 'Escríbelo otra vez para comprobarlo',
      onOk: async (second) => {
        if (first !== second) { fail('Los PIN no coinciden'); return newPinFlow(memberId, then, title); }
        await S.setMemberPin(memberId, first);
        S.commit();
        then();
      },
    }),
  });
}
// Entrar como una persona: con su PIN personal o, la primera vez, creándolo.
function loginAs(m, then) {
  if (!S.hasPin(m)) return newPinFlow(m.id, then, `Hola, ${esc(m.name)}: crea tu PIN`);
  pinDialog({ title: `Hola, ${esc(m.name)}`, subtitle: 'Tu PIN personal. Si lo olvidas, un adulto puede cambiarlo.', check: (buf) => S.checkMemberPin(m.id, buf), onOk: then });
}
const adminPinDialog = (onOk) => pinDialog({ title: 'Modo admin', subtitle: 'PIN de admin compartido', check: (buf) => S.checkPin(buf), onOk });

// ---------- Acciones ----------
const actions = {
  // configuración inicial
  setupNext() { ui.setupStep++; go('setup'); },
  setupBack() { ui.setupStep = Math.max(0, ui.setupStep - 1); go('setup'); },
  async demo() {
    S.seedDemo([randomAvatar(), randomAvatar(), randomAvatar(), randomAvatar()]);
    await S.setPin('1234');
    const demoPin = await S.hashPin('1234');
    st().members.forEach((m) => S.updateMember(m.id, demoPin));
    S.commit();
    fx.confetti(); fx.sfx('levelup');
    toast('👋', 'Familia de ejemplo creada. Todos los PIN son <b>1234</b>', 4500);
    Sync.setMe('').then(goHome);
  },
  async setupFamily() {
    const name = document.getElementById('fName').value.trim();
    const p1 = document.getElementById('fPin').value, p2 = document.getElementById('fPin2').value;
    if (!name) return fail('Escribe el nombre de la familia');
    if (!/^\d{4}$/.test(p1)) return fail('El PIN debe tener 4 números');
    if (p1 !== p2) return fail('Los PIN no coinciden');
    S.state.familyName = name; await S.setPin(p1); S.commit();
    ui.setupStep = 2; go('setup');
  },
  setupMembers() {
    if (!st().members.length) return;
    if (!adultCount()) return fail('Tiene que haber al menos un adulto para administrar la familia');
    ui.setupStep = 3; go('setup');
  },
  setupFinish() {
    document.querySelectorAll('#tplTasks input:checked').forEach((i) => S.addTask(S.TASK_TEMPLATES[+i.value]));
    document.querySelectorAll('#tplRewards input:checked').forEach((i) => S.addReward(S.REWARD_TEMPLATES[+i.value]));
    S.state.setup = true; S.touchMeta(); S.commit();
    fx.sfx('levelup'); fx.confetti({ count: 200, emoji: ['🏡', '⭐'] });
    Sync.setMe('').then(goHome); // el móvil que crea la familia elige también quién es
    // Con servidor configurado, la familia queda compartida desde el principio
    if (Sync.sync.server && !Sync.enabled()) {
      Sync.createFamily().then((code) => toast('☁️', `Familia compartida. Código: <b>${esc(code)}</b>`, 6000)).catch(() => {});
    }
  },
  joinSheet() { joinSheet(); },
  async doJoin() {
    // Acepta el código suelto o el mensaje compartido completo (que incluye el servidor)
    let code = document.getElementById('joinCode').value;
    let srv = document.getElementById('joinSrv') ? document.getElementById('joinSrv').value : '';
    const urlInMsg = code.match(/https?:\/\/[^\s]+/);
    if (urlInMsg) { if (!Sync.DEFAULT_SERVER) srv = urlInMsg[0].replace(/[.,)]+$/, ''); code = code.replace(urlInMsg[0], ''); } // un mensaje pegado no cambia el servidor de la app
    const codeInMsg = code.toUpperCase().match(/\b[A-Z0-9]{4}-?[A-Z0-9]{4}\b/);
    if (codeInMsg) code = codeInMsg[0];
    const btn = document.getElementById('joinBtn');
    btn.disabled = true; btn.textContent = 'Conectando… (puede tardar hasta 1 min)';
    try {
      const st0 = await Sync.joinFamily(srv, code);
      $modal.innerHTML = '';
      fx.sfx('levelup'); fx.confetti({ count: 160, emoji: ['🏡', '⭐'] });
      toast('🎉', `¡Bienvenido a ${esc(st0.familyName)}!`);
      await Sync.setMe('');
      goHome(); // → «¿Quién eres?»
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Unirme';
      fail(e.message);
    }
  },
  cloudInfo() {
    draft = { kind: 'cloud' };
    openModal(`<span class="big" style="font-size:52px">☁️</span><h3 style="font-size:22px">Familia compartida</h3>
      ${adminDevice() || ui.screen === 'admin' ? `<div class="familyCode">${esc(Sync.prettyCode(Sync.sync.code))}</div>` : ''}<p class="muted small">${esc(syncText())}</p>
      <div class="btns"><button class="btn ghost" data-a="close">Cerrar</button><button class="btn" data-a="syncNow">🔄 Ahora</button></div>`, { dialog: true });
  },
  async syncNow() {
    fx.sfx('tap');
    if (modalOpen() && draft.kind !== 'pin') closeModal();
    toast('🔄', 'Sincronizando…', 1500);
    await Sync.syncNow();
    if (Sync.sync.status === 'ok') toast('☁️', 'Todo al día'); else fail(syncText());
  },
  async shareCode() {
    const code = Sync.prettyCode(Sync.sync.code);
    const text = `Únete a nuestra familia en HogarQuest con el código ${code} (servidor: ${Sync.sync.server} )`;
    try {
      if (navigator.share) { await navigator.share({ title: 'HogarQuest', text }); return; }
    } catch { return; }
    try { await navigator.clipboard.writeText(text); toast('📋', `Código ${esc(code)} copiado`); } catch { toast('👨‍👩‍👧', `Código: <b>${esc(code)}</b>`, 6000); }
  },
  async createShared() {
    const srv = document.getElementById('srvUrl').value;
    try {
      toast('☁️', 'Conectando con el servidor…', 2000);
      const code = await Sync.createFamily(srv);
      fx.sfx('levelup'); fx.confetti({ count: 120 });
      toast('🎉', `¡Familia compartida! Código: <b>${esc(code)}</b>`, 6000);
    } catch (e) { fail(e.message); }
    render();
  },
  disconnect() {
    confirmDialog({ icon: '📴', title: '¿Desconectar este móvil?', text: 'Dejará de recibir los cambios de la familia. Los datos actuales se quedan en este móvil.', ok: 'Desconectar', danger: true }).then(async (yes) => {
      if (!yes) return;
      await Sync.disconnect(); render(); toast('📴', 'Móvil desconectado');
    });
  },

  // navegación
  home() { goHome(); },
  pickMember(el) {
    const m = S.member(el.dataset.id);
    if (!m) return;
    fx.sfx('whoosh');
    loginAs(m, () => go('member', { memberId: m.id, tab: 'tasks' }));
  },
  tab(el) { if (ui.tab !== el.dataset.tab) { fx.sfx('tap'); fx.haptic('light'); ui.tab = el.dataset.tab; ui.anim = false; ui.list = true; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); } },
  go(el) { if (el.dataset.to === 'rank' && st().members[0]) go('member', { memberId: ui.memberId && S.member(ui.memberId) ? ui.memberId : st().members[0].id, tab: 'family' }); },
  setMe(el) {
    const id = el.dataset.id;
    if (id === 'shared') return claimDevice(id);
    const m = S.member(id);
    if (m) loginAs(m, () => claimDevice(id));
  },
  logout() {
    confirmDialog({ icon: '👋', title: '¿Cerrar sesión?', text: 'No se borra nada. Para volver a entrar hará falta tu PIN.', ok: 'Cerrar sesión', danger: true }).then(async (yes) => {
      if (!yes) return;
      await Sync.setMe('');
      go('whoami', { memberId: null, tab: 'tasks' });
    });
  },
  leaveShared() { Sync.setMe('').then(() => go('whoami')); },
  changeMyPin() {
    const m = S.member(ui.memberId);
    if (!m) return;
    const done = () => { fx.sfx('complete'); toast('🔢', 'PIN cambiado'); };
    if (!S.hasPin(m)) return newPinFlow(m.id, done, 'Crea tu PIN');
    pinDialog({ title: 'Cambiar mi PIN', subtitle: 'Primero, tu PIN actual', check: (buf) => S.checkMemberPin(m.id, buf), onOk: () => newPinFlow(m.id, done, 'Tu PIN nuevo') });
  },
  toggleSound(el) { setSound(el.checked); fx.sfx('tap'); },
  exitAdmin() {
    Sync.setAdmin(false).then(() => {
      ui.pinAdmin = false;
      fx.sfx('tap');
      toast('🎮', 'Modo admin cerrado. Sigues como jugador');
      go('member', { memberId: myId(), tab: 'tasks' });
    });
  },
  rankMode(el) { ui.rankMode = el.dataset.v; fx.sfx('tap'); render(); },
  openAdmin() {
    fx.sfx('tap');
    const open = (pinAdmin) => go('admin', { pinAdmin, adminTab: S.pendingList().length ? 'approve' : S.pendingRedemptions().length ? 'redeems' : 'tasks' });
    if (adminDevice()) return open(false);
    if (adultHere()) return adminPinDialog(async () => { await Sync.setAdmin(true); toast('🛠️', 'Modo admin activado'); open(false); });
    if (!personal()) adminPinDialog(() => open(true)); // móvil compartido: el panel se cierra al salir de él
  },
  adminTab(el) { ui.adminTab = el.dataset.tab; fx.sfx('tap'); ui.anim = false; ui.list = true; render(); },

  // misiones
  complete(el) {
    const m = S.member(ui.memberId);
    const goalBefore = S.familyWeekPoints();
    const rankBefore = S.weekRank(m.id);
    const t = S.task(el.dataset.id);
    const res = S.completeTask(el.dataset.id, ui.memberId);
    if (!res) return;
    const chestWasReady = !res.pending && S.dailyChestReady(m.id);
    const lucky = !res.pending && !chestWasReady ? S.rollLuckyChest(m.id) : null;
    if (lucky) {
      if (lucky.levelUp) res.levelUp = lucky.levelUp;
      res.newBadges = [...(res.newBadges || []), ...lucky.newBadges];
    }
    S.commit(); // guarda y sincroniza; el render llega tras la animación
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const card = el.closest('.task');
    el.textContent = res.pending ? '⏳' : '✓';
    el.disabled = true;
    fx.haptic('success');
    if (res.pending) {
      fx.sfx('pending');
      fx.burst(cx, cy, { count: 16, emoji: ['⏳'] });
      toast('⏳', `¡Bien hecho! Un adulto revisará «${esc(t.title)}»`);
    } else {
      fx.sfx('complete');
      fx.burst(cx, cy, { emoji: ['⭐'] });
      fx.floatText(cx, cy - 20, `+${res.completion.points} ⭐`);
      setTimeout(() => fx.sfx('coin'), 280);
      G.flyStars(cx, cy, $app.querySelector('.pointsChip'));
      G.jump($app.querySelector('.heroAv'));
      if (res.completion.bonus) G.bigText('¡Misión estrella!', `x2 · +${res.completion.points} ⭐`);
      if (res.combo) { G.shake($app); G.bigText(`¡Combo de ${res.combo.count}!`, `+${res.combo.bonus} ⭐ extra`, '#ff9f43'); fx.sfx('badge'); }
      res.challenges.forEach((c) => { G.bigText('¡Reto superado!', `${c.title} · +${c.bonus} ⭐`, '#3ee6a8'); });
      const rankNow = S.weekRank(m.id);
      if (rankNow < rankBefore) toast('🏅', `<b>¡Subes al puesto ${rankNow} de la semana!</b>`);
      if (chestWasReady) {
        fx.confetti({ count: 160, emoji: ['🏆', '⭐'] });
        enqueueModal(() => chestModal('¡Todas las misiones de hoy hechas!', m.id));
      }
      if (lucky) enqueueModal(() => chestModal('¡Cofre sorpresa!', m.id, lucky.pts));
      handleAward(res, m, goalBefore);
    }
    (card ? G.completeCard(card) : Promise.resolve()).then(() => { if (modalOpen()) ui.pendingRender = true; else render(); });
  },
  async chestTap() {
    if (draft.kind !== 'chest' || draft.opening) return;
    draft.opening = true;
    const { memberId } = draft;
    const box = document.getElementById('chestBox');
    const goalBefore = S.familyWeekPoints();
    let pts = draft.pts, res = null;
    if (pts == null) {
      res = S.openDailyChest(memberId);
      if (!res) return closeModal();
      pts = res.pts;
      S.commit();
    }
    document.getElementById('chestMsg').textContent = '';
    await G.openChest(box.querySelector('.gc') || box);
    if (draft.kind !== 'chest') return;
    showPrize(document.getElementById('chestMsg'), document.getElementById('chestBtns'), pts);
    if (res) handleAward(res, S.member(memberId), goalBefore);
  },
  chestDaily() { chestModal('Cofre del día', ui.memberId); },
  wheelOpen() {
    if (S.wheelState(ui.memberId) !== 'ready') return;
    draft = { kind: 'wheel', memberId: ui.memberId, spinning: false };
    openModal(`<h3 style="font-size:22px">🎡 Ruleta diaria</h3><p class="muted small" style="margin:4px 0 12px">Una tirada al día. ¡Suerte!</p>
      <div id="wheelBox">${G.wheelHTML(S.WHEEL)}</div><p id="wheelMsg" style="margin:10px 0 0"></p>
      <div class="btns" id="wheelBtns"><button class="btn block" data-a="wheelSpin">¡Girar!</button></div>`, { dialog: true });
    fx.sfx('whoosh');
  },
  async wheelSpin() {
    if (draft.kind !== 'wheel' || draft.spinning) return;
    draft.spinning = true;
    const { memberId } = draft;
    const goalBefore = S.familyWeekPoints();
    const res = S.spinWheel(memberId);
    if (!res) return closeModal();
    S.commit(); // se guarda antes de girar: cerrar la app no da otra tirada
    document.getElementById('wheelBtns').innerHTML = '';
    fx.haptic('medium');
    let lastTick = 0;
    await G.spinWheel(document.querySelector('#wheelBox .gw'), res.index, S.WHEEL.length, {
      onTick: () => {
        const t = performance.now();
        if (t - lastTick < 40) return; // al principio gira tan rápido que los tics zumbarían
        lastTick = t;
        fx.sfx('tap');
        fx.haptic('light');
      },
    });
    if (draft.kind !== 'wheel') return;
    showPrize(document.getElementById('wheelMsg'), document.getElementById('wheelBtns'), res.pts);
    handleAward(res, S.member(memberId), goalBefore);
  },
  editSelf() { memberEditor(ui.memberId, { self: true }); },
  taskPts(el) {
    const t = S.task(el.dataset.id);
    if (!t) return;
    const points = Math.min(1000, Math.max(5, t.points + +el.dataset.d));
    S.updateTask(t.id, { points });
    S.commit();
    document.getElementById('tp-' + t.id).textContent = points;
    fx.sfx('tap'); fx.haptic('light');
  },
  removeTaskRow(el) {
    const t = S.task(el.dataset.id);
    confirmDialog({ icon: '🗑️', title: `¿Quitar «${esc(t.title)}»?`, text: 'Los puntos ya ganados con esta tarea no se pierden.', ok: 'Quitar', danger: true }).then((yes) => {
      if (!yes) return;
      S.removeTask(t.id); S.commit(); render();
    });
  },

  redeem(el) {
    const r = S.reward(el.dataset.id), m = S.member(ui.memberId);
    if (!r || m.points < r.cost) { fail('No tienes puntos suficientes para este premio'); return render(); }
    confirmDialog({ icon: r.icon, title: `¿Canjear «${esc(r.title)}»?`, text: `Gastarás ⭐ ${r.cost}. Te quedarán ${m.points - r.cost}.`, ok: '¡Sí, lo quiero!', cancel: 'Mejor no' }).then((yes) => {
      if (!yes) return;
      const res = S.redeem(r.id, m.id);
      if (!res) { fail('No tienes puntos suficientes para este premio'); return render(); }
      S.commit();
      render(); // puntos, botones y barras de la tienda cambian en cuanto se gasta
      fx.sfx('redeem'); fx.haptic('success'); fx.coinRain(16);
      setTimeout(() => {
        fx.confetti({ count: 140, emoji: [r.icon] });
        openModal(`<span class="big" style="animation:pop .6s">${r.icon}</span><h3 style="font-size:24px">¡Premio conseguido!</h3><p class="muted">Enséñale esta pantalla a un adulto para recibir:<br><b style="color:#fff">${esc(r.title)}</b></p><div class="btns"><button class="btn block" data-a="close">¡Gracias! 😍</button></div>`, { dialog: true });
      }, 400);
      showBadges(res.newBadges, 1600);
    });
  },

  // modales comunes
  // Las celebraciones solo se cierran con su botón: tocar fuera las haría desaparecer sin verlas.
  overlay(el, ev) { if (ev.target === el && !['pin', 'chest', 'wheel', 'level'].includes(draft.kind)) closeModal(); },
  close() { closeModal(); },
  dlgYes() { confirmAnswer = true; closeModal(); },
  dlgNo() { confirmAnswer = false; closeModal(); },
  pick(el) {
    draft[el.dataset.k] = el.dataset.v;
    el.parentElement.querySelectorAll('.on').forEach((b) => b.classList.remove('on'));
    el.classList.add('on');
    fx.sfx('tap');
  },
  step(el) {
    const k = el.dataset.k;
    draft[k] = Math.min(1000, Math.max(5, draft[k] + +el.dataset.d));
    document.getElementById('v-' + k).textContent = draft[k];
    fx.sfx('tap'); fx.haptic('light');
  },
  anyone(el) {
    draft.assignees = [];
    el.parentElement.querySelectorAll('.on').forEach((b) => b.classList.remove('on'));
    el.classList.add('on');
  },
  assign(el) {
    const id = el.dataset.id;
    draft.assignees = draft.assignees.includes(id) ? draft.assignees.filter((x) => x !== id) : [...draft.assignees, id];
    el.classList.toggle('on', draft.assignees.includes(id));
    el.parentElement.querySelector('[data-a="anyone"]').classList.toggle('on', !draft.assignees.length);
    fx.sfx('tap');
  },

  // PIN
  async pin(el) {
    if (draft.checking) return;
    const v = el.dataset.v;
    fx.haptic('light'); fx.sfx('tap');
    draft.buf = v === 'del' ? draft.buf.slice(0, -1) : (draft.buf + v).slice(0, 4);
    const dots = document.getElementById('pinDots');
    dots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i < draft.buf.length));
    if (draft.buf.length === 4) {
      const buf = draft.buf, finish = draft.onOk;
      const accept = () => {
        fx.sfx('complete');
        setTimeout(() => { $modal.innerHTML = ''; finish(buf); pumpModals(); }, 150);
      };
      if (!draft.check) return accept(); // PIN nuevo: no hay nada que comprobar
      const wait = pinWait();
      if (wait) fail(`Demasiados intentos. Espera ${wait} s`);
      draft.checking = true;
      const good = !wait && await draft.check(buf);
      draft.checking = false;
      if (draft.kind !== 'pin') return;
      if (!wait) pinTried(good);
      if (good) accept();
      else {
        fx.sfx('error'); fx.haptic('warning');
        dots.classList.remove('bad'); void dots.offsetWidth; dots.classList.add('bad');
        draft.buf = '';
        setTimeout(() => dots.querySelectorAll('i').forEach((d) => d.classList.remove('on')), 350);
      }
    }
  },

  // miembros
  newMember() { memberEditor(null); },
  editMember(el) { memberEditor(el.dataset.id); },
  avPart(el) {
    draft.part = el.dataset.part;
    document.querySelectorAll('#avParts button').forEach((b) => b.classList.toggle('on', b.dataset.part === draft.part));
    fx.sfx('tap');
    renderAvOpts();
  },
  avOpt(el) {
    if (el.dataset.lock) {
      fx.sfx('error');
      el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 250 });
      return toast('🔒', `Se desbloquea en el nivel ${el.dataset.lock}. ¡Sigue haciendo misiones!`);
    }
    draft.avatar[draft.part] = el.dataset.id;
    fx.sfx('tap'); fx.haptic('light');
    renderAvOpts();
    const p = document.getElementById('avPrev');
    p.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12) rotate(-4deg)' }, { transform: 'scale(1)' }], { duration: 350, easing: 'ease-out' });
  },
  avRandom() {
    const accessory = draft.avatar.accessory;
    draft.avatar = randomAvatar();
    if (lockedLevel('accessory', draft.avatar.accessory)) draft.avatar.accessory = accessory;
    fx.sfx('whoosh');
    renderAvOpts();
    document.getElementById('avPrev').animate([{ transform: 'rotate(0) scale(.8)' }, { transform: 'rotate(360deg) scale(1)' }], { duration: 500, easing: 'cubic-bezier(.2,.9,.3,1.3)' });
  },
  async saveMember() {
    if (draft.self) {
      S.updateMember(draft.id, { avatar: draft.avatar });
      fx.sfx('complete'); fx.confetti({ count: 60 });
      S.commit(); closeModal(); render();
      return;
    }
    const name = document.getElementById('mName').value.trim();
    if (!name) return fail('Escribe un nombre');
    const editing = draft.id ? S.member(draft.id) : null;
    if (editing && editing.role === 'adult' && draft.role !== 'adult' && adultCount() === 1) return fail('Tiene que quedar al menos un adulto en la familia');
    const pin = document.getElementById('mPin').value.trim();
    if (pin && !/^\d{4}$/.test(pin)) return fail('El PIN debe tener 4 números');
    let id = draft.id;
    if (id) S.updateMember(id, { name, avatar: draft.avatar, role: draft.role });
    else { id = S.addMember({ name, avatar: draft.avatar, role: draft.role }).id; fx.confetti({ count: 80 }); }
    fx.sfx('complete');
    closeModal();
    if (pin) await S.setMemberPin(id, pin);
    S.commit(); render();
  },
  deleteMember() {
    const m = S.member(draft.id);
    if (m.role === 'adult' && adultCount() === 1) return fail('Tiene que quedar al menos un adulto en la familia');
    confirmDialog({ icon: '😢', title: `¿Eliminar a ${esc(m.name)}?`, text: 'Se borrarán sus puntos, tareas hechas y canjes.', ok: 'Eliminar', danger: true }).then((yes) => {
      if (!yes) return;
      S.removeMember(m.id); S.commit(); render(); toast('👋', `${esc(m.name)} ya no está en la familia`);
    });
  },
  adjust(el) {
    const m = S.member(el.dataset.id);
    draft = { kind: 'adjust', id: m.id, amount: 10 };
    openModal(`${sheetHead('Puntos para ' + esc(m.name))}
      <p class="muted small" style="margin-top:0">Da puntos extra por algo especial o quita puntos si hace falta.</p>
      <div class="row" style="justify-content:center;margin:10px 0 18px"><div class="stepper"><button data-a="step" data-k="amount" data-d="-5">−</button><span class="v" id="v-amount">10</span><button data-a="step" data-k="amount" data-d="5">+</button></div></div>
      <label class="f"><span>Motivo (opcional)</span><input class="inp" id="adjReason" maxlength="40" placeholder="Ej: Ayudó a la abuela"></label>
      <div class="row"><button class="btn danger grow" data-a="doAdjust" data-sign="-1">Quitar</button><button class="btn mint grow" data-a="doAdjust" data-sign="1">Dar puntos</button></div>`);
  },
  doAdjust(el) {
    const m = S.member(draft.id);
    const delta = draft.amount * +el.dataset.sign;
    const res = S.adjustPoints(m.id, delta, document.getElementById('adjReason').value.trim());
    S.commit(); closeModal(); render();
    if (!res) { fx.sfx('error'); toast('⚖️', `${esc(m.name)} no tiene puntos que quitar`); }
    else if (delta > 0) { fx.sfx('coin'); fx.coinRain(8); toast('🎉', `+${res.delta} ⭐ para ${esc(m.name)}`); handleAward(res, m, Infinity); }
    else { fx.sfx('whoosh'); toast('⚖️', `${res.delta} ⭐ para ${esc(m.name)}`); }
  },

  // tareas (admin)
  newTask() { taskEditor(null); },
  editTask(el) { taskEditor(el.dataset.id); },
  toggleTask(el) { S.updateTask(el.dataset.id, { active: el.checked }); S.commit(); fx.sfx('tap'); render(); },
  saveTask() {
    const title = document.getElementById('tTitle').value.trim();
    if (!title) return fail('Escribe qué hay que hacer');
    const data = { title, icon: draft.icon, points: draft.points, freq: draft.freq, assignees: draft.assignees, approval: document.getElementById('tApproval').checked };
    if (draft.id) S.updateTask(draft.id, data); else S.addTask(data);
    fx.sfx('complete'); S.commit(); closeModal(); render();
    toast(draft.icon, draft.id ? 'Tarea actualizada' : 'Tarea creada');
  },
  deleteTask() {
    const t = S.task(draft.id);
    confirmDialog({ icon: '🗑️', title: `¿Eliminar «${esc(t.title)}»?`, ok: 'Eliminar', danger: true }).then((yes) => {
      if (!yes) return;
      S.removeTask(t.id); S.commit(); render();
    });
  },
  taskTemplates() {
    const have = new Set(st().tasks.map((t) => t.title));
    const avail = S.TASK_TEMPLATES.map((t, i) => ({ ...t, i })).filter((t) => !have.has(t.title));
    draft = { kind: 'tpl' };
    openModal(`${sheetHead('Añadir desde plantillas')}
      ${avail.length ? `<div class="tplList" id="tplAdd">${avail.map((t) => `<label><input type="checkbox" value="${t.i}"><span class="e">${t.icon}</span><span class="grow">${esc(t.title)}<br><span class="small muted">${S.FREQ_LABEL[t.freq]} · ${t.points} pts</span></span></label>`).join('')}</div>
      <button class="btn block mint" data-a="addTemplates">Añadir seleccionadas</button>` : '<div class="empty">Ya tienes todas las plantillas 👌</div>'}`);
  },
  addTemplates() {
    const sel = [...document.querySelectorAll('#tplAdd input:checked')];
    sel.forEach((i) => S.addTask(S.TASK_TEMPLATES[+i.value]));
    S.commit(); closeModal(); render();
    if (sel.length) { fx.sfx('complete'); toast('📋', `${sel.length} tarea(s) añadidas`); }
  },
  approve(el) {
    const c = S.state.completions.find((x) => x.id === el.dataset.id);
    const m = S.member(c.memberId);
    const goalBefore = S.familyWeekPoints();
    const res = S.approve(c.id);
    S.commit();
    const r = el.getBoundingClientRect();
    fx.sfx('complete'); fx.haptic('success');
    fx.burst(r.left + r.width / 2, r.top + r.height / 2, { emoji: ['⭐'] });
    fx.floatText(r.left, r.top, `+${c.points} ⭐`);
    const row = el.closest('.approval');
    row && row.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(60px)', opacity: 0 }], { duration: 350, fill: 'forwards' });
    setTimeout(render, 360);
    if (m) handleAward(res, m, goalBefore);
  },
  reject(el) {
    S.reject(el.dataset.id); S.commit();
    fx.sfx('whoosh');
    const row = el.closest('.approval');
    row && row.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(-60px)', opacity: 0 }], { duration: 350, fill: 'forwards' });
    setTimeout(render, 360);
  },

  // premios (admin)
  newReward() { rewardEditor(null); },
  editReward(el) { rewardEditor(el.dataset.id); },
  saveReward() {
    const title = document.getElementById('rTitle').value.trim();
    if (!title) return fail('Escribe el premio');
    const data = { title, icon: draft.icon, cost: draft.cost };
    if (draft.id) S.updateReward(draft.id, data); else S.addReward(data);
    fx.sfx('complete'); S.commit(); closeModal(); render();
  },
  deleteReward() {
    const r = S.reward(draft.id);
    confirmDialog({ icon: '🗑️', title: `¿Eliminar «${esc(r.title)}»?`, ok: 'Eliminar', danger: true }).then((yes) => {
      if (!yes) return;
      S.removeReward(r.id); S.commit(); render();
    });
  },
  deliver(el) {
    const r = S.state.redemptions.find((x) => x.id === el.dataset.id);
    S.setDelivered(r.id, !r.delivered); S.commit();
    if (!r.delivered) fx.sfx('tap'); else { fx.sfx('redeem'); fx.burst(el.getBoundingClientRect().left + 40, el.getBoundingClientRect().top + 10, { emoji: ['🎁'] }); }
    render();
  },
  rejectRedeem(el) {
    const r = S.state.redemptions.find((x) => x.id === el.dataset.id);
    if (!r) return;
    const m = S.member(r.memberId);
    confirmDialog({ icon: '↩️', title: `¿Rechazar «${esc(r.title)}»?`, text: `${esc(m ? m.name : 'Esa persona')} recuperará ⭐ ${r.cost}.`, ok: 'Rechazar y devolver', danger: true }).then((yes) => {
      if (!yes || !S.rejectRedemption(r.id)) return;
      S.commit(); render();
      fx.sfx('whoosh'); toast('↩️', `⭐ ${r.cost} devueltos a ${esc(m ? m.name : '?')}`);
    });
  },

  // ajustes
  async saveSettings() {
    const s = S.state;
    const name = document.getElementById('setName').value.trim();
    const goal = Math.max(10, parseInt(document.getElementById('setGoal').value, 10) || 400);
    const pin = document.getElementById('setPin').value;
    if (pin && !/^\d{4}$/.test(pin)) return fail('El PIN debe tener 4 números');
    if (name) s.familyName = name;
    s.settings.gameBonus = document.getElementById('setGame').checked;
    s.settings.weeklyGoal = goal;
    s.settings.goalReward = document.getElementById('setGoalReward').value.trim() || s.settings.goalReward;
    if (pin) await S.setPin(pin);
    S.touchMeta();
    S.commit(); render();
    fx.sfx('complete'); toast('✅', pin ? 'Ajustes y PIN guardados' : 'Ajustes guardados');
  },
  exportData() {
    const json = JSON.stringify(S.state);
    draft = { kind: 'export' };
    openModal(`${sheetHead('Exportar datos')}
      <p class="small muted" style="margin-top:0">Copia este texto y guárdalo (o pégalo en «Importar» en otro móvil).</p>
      <textarea class="inp" id="expTxt" rows="8" readonly style="font-size:12px;font-family:monospace">${esc(json)}</textarea>
      <div class="row" style="margin-top:12px"><button class="btn grow" data-a="copyExport">📋 Copiar</button>${Capacitor.isNativePlatform() ? '' : '<button class="btn ghost grow" data-a="downloadExport">⬇️ Descargar</button>'}</div>`);
  },
  async copyExport() {
    const ta = document.getElementById('expTxt');
    try { await navigator.clipboard.writeText(ta.value); } catch { ta.select(); document.execCommand('copy'); }
    toast('📋', 'Copiado al portapapeles');
  },
  downloadExport() {
    const blob = new Blob([JSON.stringify(S.state, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `hogarquest-${S.dayKey()}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  importData() {
    draft = { kind: 'import' };
    openModal(`${sheetHead('Importar datos')}
      <p class="small muted" style="margin-top:0">Pega aquí los datos exportados. <b>Se reemplazará todo lo actual.</b></p>
      <textarea class="inp" id="impTxt" rows="8" style="font-size:12px;font-family:monospace" placeholder='{"version":1,...}'></textarea>
      <button class="btn block" style="margin-top:12px" data-a="doImport">Importar</button>`);
  },
  doImport() {
    if (Sync.enabled()) return fail('Desconecta este móvil antes de importar: en una familia compartida la copia se fusiona, no reemplaza');
    try {
      const obj = JSON.parse(document.getElementById('impTxt').value);
      if (!obj || !Array.isArray(obj.members) || !Array.isArray(obj.tasks)) throw new Error('formato');
      S.replaceState(obj); closeModal(); goHome(); toast('✅', 'Datos importados');
    } catch { fail('Ese texto no es una copia válida de HogarQuest'); }
  },
  resetPoints() {
    confirmDialog({ icon: '🔄', title: '¿Poner todos los puntos a 0?', text: 'Se mantienen miembros, tareas, premios, niveles y logros.', ok: 'Sí, a cero', danger: true }).then((yes) => {
      if (!yes) return;
      S.resetPoints(); S.commit(); render(); toast('🔄', 'Puntos reiniciados');
    });
  },
  resetAll() {
    const shared = Sync.enabled();
    confirmDialog({ icon: '💣', title: '¿Borrar los datos de este móvil?', text: shared ? 'Este móvil se desconectará de la familia compartida. En el servidor y en los demás móviles no se borra nada.' : 'Se eliminarán la familia, tareas, premios y el historial. No se puede deshacer.', ok: 'Borrar', danger: true }).then(async (yes) => {
      if (!yes) return;
      if (shared) await Sync.disconnect();
      await Sync.setMe('');
      S.resetAll(); ui.setupStep = 0; go('setup');
    });
  },
};

function fail(msg) {
  fx.sfx('error'); fx.haptic('warning');
  toast('⚠️', esc(msg)); // msg puede venir del servidor
}
// Intentos de PIN: tras 5 fallos seguidos, espera creciente (30 s, 1 min, 2 min… hasta 1 h).
const PIN_TRIES = 'hogarquest.pintries';
const readTries = () => { try { return JSON.parse(localStorage.getItem(PIN_TRIES)) || { n: 0, until: 0 }; } catch { return { n: 0, until: 0 }; } };
const pinWait = () => Math.max(0, Math.ceil((readTries().until - Date.now()) / 1000));
function pinTried(good) {
  const t = good ? { n: 0, until: 0 } : readTries();
  if (!good && ++t.n >= 5) t.until = Date.now() + Math.min(3600, 30 * 2 ** (t.n - 5)) * 1000;
  try { localStorage.setItem(PIN_TRIES, JSON.stringify(t)); } catch {}
}

// ---------- Eventos ----------
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-a]');
  if (!el) return;
  const fn = actions[el.dataset.a];
  if (!fn) return;
  if (el.tagName === 'INPUT') return; // los checkbox se gestionan en 'change'
  if (el.dataset.a === 'overlay' && ev.target !== el) return;
  // Un toque que iba a lo que había debajo no debe actuar sobre un panel que acaba de aparecer.
  // En el PIN no se aplica: al repetirlo, la primera cifra llega nada más abrirse.
  if (draft.kind !== 'pin' && $modal.contains(el) && performance.now() - ui.modalAt < 400) return;
  fn(el, ev);
});
document.addEventListener('change', (ev) => {
  const el = ev.target;
  if (el.tagName === 'INPUT' && el.dataset.a && actions[el.dataset.a]) actions[el.dataset.a](el, ev);
});
document.addEventListener('pointerdown', () => fx.unlockAudio(), { once: true });
document.addEventListener('scroll', (ev) => { if (ev.target.matches?.('.segWrap > .seg')) updateScrollHint(ev.target); }, true);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalOpen()) closeModal();
  if (draft.kind === 'pin' && modalOpen() && /^[0-9]$|^Backspace$/.test(e.key)) {
    const v = e.key === 'Backspace' ? 'del' : e.key;
    actions.pin({ dataset: { v } });
  }
});

// Cambios que otro móvil hizo sobre MÍ (p. ej. mamá aprueba mi tarea): se celebran aquí
function celebrateRemoteForMe(me, logs, prevLevel) {
  let delay = 400;
  for (const l of logs.slice().reverse()) {
    const at = delay;
    if (l.type === 'done') {
      setTimeout(() => {
        fx.sfx('complete'); fx.haptic('success');
        fx.floatText(innerWidth / 2, innerHeight / 3, (l.text.match(/\+\d+/) || ['+'])[0] + ' ⭐');
        fx.confetti({ count: 70, emoji: ['⭐'] });
        setTimeout(() => fx.sfx('coin'), 300);
        toast('✅', `<b>¡Aprobada!</b> ${esc(l.text.replace(me.name + ' completó ', ''))}`, 3500);
      }, at);
    } else if (l.type === 'refund') {
      setTimeout(() => { fx.sfx('coin'); toast('↩️', esc(l.text), 3500); }, at);
    } else if (l.type === 'rejected') {
      setTimeout(() => { fx.sfx('error'); toast('↩️', `${esc(l.text)}. ¡Inténtalo otra vez!`, 3500); }, at);
    } else if (l.type === 'adjust' && /^\+/.test(l.text)) {
      setTimeout(() => { fx.sfx('coin'); fx.coinRain(10); toast('🎉', `<b>¡Te han dado puntos!</b><br>${esc(l.text)}`, 3500); }, at);
    } else if (l.type === 'adjust') {
      setTimeout(() => { fx.sfx('whoosh'); toast('⚖️', esc(l.text), 3500); }, at);
    } else if (l.type === 'bonus') {
      setTimeout(() => { fx.sfx('coin'); G.bigText('¡Bonus!', l.text.replace(me.name + ': ', ''), '#ff9f43'); }, at);
    } else if (l.type === 'badge') {
      setTimeout(() => { fx.sfx('badge'); fx.haptic('success'); toast(l.icon, `<b>¡Logro desbloqueado!</b><br>${esc(l.text.replace(me.name + ' desbloqueó ', ''))}`, 3500); }, at);
    } else continue;
    delay += 1300;
  }
  const lvl = S.levelInfo(me.total).level;
  if (prevLevel && lvl > prevLevel) celebrateLevel(me, lvl);
  ui.myLevel = lvl; // con un modal abierto render() espera, y sin esto se celebraría dos veces
}

function onBack() {
  if (draft.spinning || draft.opening) { if (modalOpen() && !document.querySelector('.prize')) return; }
  if (modalOpen()) { if (draft.kind === 'pin') { $modal.innerHTML = ''; pumpModals(); } else closeModal(); return; }
  if (ui.screen === 'admin') return goHome();
  if (ui.screen === 'member' && personal()) {
    if (ui.tab !== 'tasks') { ui.tab = 'tasks'; return render(); }
    return App.exitApp();
  }
  if (ui.screen === 'member') return go('home');
  if (ui.screen === 'setup' && ui.setupStep > 0) return actions.setupBack();
  App.exitApp();
}

function sky() {
  const d = document.createElement('div');
  d.className = 'sky';
  for (let i = 0; i < 40; i++) {
    const s = document.createElement('i');
    s.style.left = Math.random() * 100 + '%';
    s.style.top = Math.random() * 100 + '%';
    s.style.animationDelay = -Math.random() * 3 + 's';
    const z = 1 + Math.random() * 2;
    s.style.width = s.style.height = z + 'px';
    d.appendChild(s);
  }
  document.body.prepend(d);
}

// ---------- Arranque ----------
(async function init() {
  sky();
  await S.load();
  await Sync.loadDeviceConfig();
  fx.setSoundEnabled(soundOn());
  // En iPhone esto reduce el riesgo de que el sistema borre los datos de la web app
  if (!Capacitor.isNativePlatform() && navigator.storage?.persist) navigator.storage.persist().catch(() => {});
  ui.screen = S.state.setup ? 'home' : 'setup'; // render() lleva al perfil del dueño o a «¿Quién eres?»
  render();
  await Sync.initSync({
    // Llegan cambios de otros móviles: se repinta y se avisa de lo nuevo
    remote(newLogs) {
      const prevLevel = ui.myLevel, prevRank = ui.myRank;
      if (ui.screen === 'setup' && S.state.setup) ui.screen = 'home';
      if (canRepaint()) render(); else ui.pendingRender = true;
      const me = myId() ? S.member(myId()) : null;
      if (me) {
        celebrateRemoteForMe(me, newLogs.filter((l) => l.memberId === me.id), prevLevel);
        const rank = S.weekRank(me.id);
        if (prevRank && rank > prevRank) {
          const rival = S.ranking('week').find((x, i) => i === rank - 2);
          toast('⚔️', `<b>${rival ? esc(rival.m.name) + ' te ha adelantado' : 'Te han adelantado'}.</b> ¡Recupera tu puesto!`, 3500);
        }
        ui.myRank = rank;
        // El móvil que aprobó pudo no tener todo: aquí se dan los combos y retos que falten.
        const extra = S.checkGameRewards(me.id);
        if (extra.combo || extra.challenges.length) {
          S.commit();
          if (canRepaint()) render(); else ui.pendingRender = true;
          if (extra.combo) G.bigText(`¡Combo de ${extra.combo.count}!`, `+${extra.combo.bonus} ⭐ extra`, '#ff9f43');
          extra.challenges.forEach((c) => G.bigText('¡Reto superado!', `${c.title} · +${c.bonus} ⭐`, '#3ee6a8'));
          handleAward(extra, me, Infinity);
        }
      }
      // Lo que hacen los demás (a los peques no les avisamos de tareas pendientes de otros)
      newLogs.filter((l) => !me || l.memberId !== me.id).filter((l) => !(me && me.role !== 'adult' && l.type === 'pending')).slice(0, 3).reverse()
        .forEach((l, i) => setTimeout(() => { fx.sfx(l.type === 'pending' ? 'pending' : 'coin'); toast(l.icon, esc(l.text)); }, 300 + i * 1300));
    },
    status() {
      const chip = $app.querySelector('.cloud');
      if (chip) chip.outerHTML = cloudChip();
      const st = document.getElementById('syncState');
      if (st) st.textContent = syncText();
    },
  });
  if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  if (Capacitor.isNativePlatform()) {
    App.addListener('backButton', onBack);
    App.addListener('pause', () => S.flush());
    // al volver a la app (p. ej. al día siguiente) se recalculan tareas del día
    App.addListener('resume', () => { if (canRepaint()) render(); else ui.pendingRender = true; });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      S.flush();
      // En un móvil que no es de un adulto, el panel no queda abierto al salir de la app
      if (ui.screen === 'admin' && !adminDevice()) goHome();
    } else if (canRepaint()) render();
  });
  // Si la app sigue abierta a medianoche, las misiones del día nuevo aparecen solas
  let shownDay = S.dayKey();
  setInterval(() => {
    if (S.dayKey() === shownDay) return;
    shownDay = S.dayKey();
    if (canRepaint()) render(); else ui.pendingRender = true;
  }, 30000);
  if (!import.meta.env.PROD) window.__hq = { S, ui, render }; // solo para depurar en desarrollo
})();

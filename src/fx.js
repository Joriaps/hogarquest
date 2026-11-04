// fx.js - sound, haptics and visual celebration effects for HogarQuest.
// Vanilla ES module. Every public function is wrapped in try/catch and never throws.

import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Capacitor } from '@capacitor/core';

const HAS_DOM = typeof window !== 'undefined' && typeof document !== 'undefined';

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);

const DEFAULT_COLORS = ['#ff5e5b', '#ffd23f', '#3bceac', '#0ead69', '#4d9de0', '#a06cd5', '#ff8fab', '#ff9f1c'];

export function prefersReducedMotion() {
  try {
    return !!(HAS_DOM && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

function injectStyle() {
  try {
    if (!HAS_DOM || document.getElementById('fx-style')) return;
    const s = document.createElement('style');
    s.id = 'fx-style';
    s.textContent = `
.fx-canvas{position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:9999;}
.fx-float{position:fixed;left:0;top:0;pointer-events:none;z-index:10000;white-space:nowrap;
  font:800 22px/1 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  text-shadow:0 2px 0 rgba(0,0,0,.25),0 0 10px rgba(0,0,0,.18);
  transform:translate(-50%,-50%);will-change:transform,opacity;
  animation:fx-float-up 1.15s cubic-bezier(.2,.8,.3,1) forwards;}
.fx-float.fx-rm{animation:fx-float-fade .9s ease-out forwards;}
@keyframes fx-float-up{
  0%{opacity:0;transform:translate(-50%,-30%) scale(.6);}
  15%{opacity:1;transform:translate(-50%,-60%) scale(1.15);}
  30%{transform:translate(-50%,-80%) scale(1);}
  75%{opacity:1;}
  100%{opacity:0;transform:translate(-50%,-260%) scale(1);}
}
@keyframes fx-float-fade{0%{opacity:0;}20%{opacity:1;}75%{opacity:1;}100%{opacity:0;}}
`;
    (document.head || document.documentElement).appendChild(s);
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* Audio                                                               */
/* ------------------------------------------------------------------ */

let soundEnabled = true;
let actx = null;
let master = null;
let noiseBuf = null;

export function setSoundEnabled(bool) {
  try {
    soundEnabled = !!bool;
  } catch { /* ignore */ }
}

function safeResume(c) {
  try {
    if (c && c.state !== 'running') {
      const p = c.resume();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  } catch { /* ignore */ }
}

function getCtx() {
  try {
    if (!HAS_DOM) return null;
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
      master = actx.createGain();
      master.gain.value = 0.55;
      let comp = null;
      try {
        comp = actx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 12;
        comp.ratio.value = 4;
      } catch { comp = null; }
      if (comp) {
        master.connect(comp);
        comp.connect(actx.destination);
      } else {
        master.connect(actx.destination);
      }
    }
    safeResume(actx);
    return actx;
  } catch {
    return null;
  }
}

export function unlockAudio() {
  try {
    const c = getCtx();
    if (!c) return;
    // Play a 1-sample silent buffer: required by older iOS WebKit to unlock output.
    const b = c.createBuffer(1, 1, 22050);
    const src = c.createBufferSource();
    src.buffer = b;
    src.connect(c.destination);
    src.start(0);
  } catch { /* ignore */ }
}

function getNoise(c) {
  if (noiseBuf && noiseBuf.sampleRate === c.sampleRate) return noiseBuf;
  const len = Math.floor(c.sampleRate * 1);
  noiseBuf = c.createBuffer(1, len, c.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return noiseBuf;
}

// Single oscillator note with an attack/hold/decay envelope.
function tone(c, at, freq, dur, o = {}) {
  const t = c.currentTime + 0.01 + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = o.type || 'triangle';
  osc.frequency.setValueAtTime(freq, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.glide || dur));
  const vol = o.vol == null ? 0.25 : o.vol;
  const a = o.attack == null ? 0.006 : o.attack;
  const hold = Math.min(o.hold || 0, Math.max(0, dur - a - 0.02));
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + a);
  if (hold) g.gain.setValueAtTime(vol, t + a + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g);
  g.connect(master);
  if (o.vibrato) {
    const lfo = c.createOscillator();
    const lg = c.createGain();
    lfo.frequency.value = o.vibrato;
    lg.gain.value = freq * 0.012;
    lfo.connect(lg);
    lg.connect(osc.frequency);
    lfo.start(t);
    lfo.stop(t + dur + 0.05);
  }
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

// Filtered noise burst (whooshes, shimmers, clicks).
function noise(c, at, dur, o = {}) {
  const t = c.currentTime + 0.01 + at;
  const src = c.createBufferSource();
  src.buffer = getNoise(c);
  const f = c.createBiquadFilter();
  f.type = o.filter || 'bandpass';
  f.Q.value = o.q == null ? 1 : o.q;
  f.frequency.setValueAtTime(o.from || 1000, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
  const g = c.createGain();
  const vol = o.vol == null ? 0.2 : o.vol;
  const a = o.attack == null ? dur * 0.3 : o.attack;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f);
  f.connect(g);
  g.connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

const SOUNDS = {
  tap(c) {
    tone(c, 0, 1100, 0.06, { type: 'sine', to: 820, vol: 0.14, attack: 0.003 });
  },
  complete(c) {
    // C5 E5 G5 C6 arpeggio
    const notes = [72, 76, 79, 84];
    notes.forEach((m, i) => {
      const last = i === notes.length - 1;
      tone(c, i * 0.07, midi(m), last ? 0.4 : 0.16, { type: 'triangle', vol: 0.24, hold: last ? 0.08 : 0 });
    });
    tone(c, 0.21, midi(96), 0.35, { type: 'sine', vol: 0.06 });
  },
  coin(c) {
    // classic two-step coin: B5 -> E6
    tone(c, 0, midi(83), 0.08, { type: 'square', vol: 0.07 });
    tone(c, 0, midi(83), 0.08, { type: 'triangle', vol: 0.14 });
    tone(c, 0.07, midi(88), 0.32, { type: 'square', vol: 0.06, hold: 0.05 });
    tone(c, 0.07, midi(88), 0.32, { type: 'triangle', vol: 0.14, hold: 0.05 });
  },
  levelup(c) {
    // ~1.1s fanfare: quick pickup G4 C5 E5 G5, then a sustained C major chord with sparkles
    const run = [67, 72, 76, 79];
    run.forEach((m, i) => {
      tone(c, i * 0.09, midi(m), 0.14, { type: 'square', vol: 0.05 });
      tone(c, i * 0.09, midi(m), 0.16, { type: 'triangle', vol: 0.2 });
    });
    tone(c, 0.36, midi(76), 0.08, { type: 'triangle', vol: 0.18 });
    const chordAt = 0.45;
    [72, 76, 79, 84].forEach((m) => {
      tone(c, chordAt, midi(m), 0.65, { type: 'triangle', vol: 0.15, hold: 0.3, vibrato: 5.5 });
    });
    tone(c, chordAt, midi(60), 0.65, { type: 'sine', vol: 0.18, hold: 0.3 });
    tone(c, chordAt, midi(84), 0.6, { type: 'square', vol: 0.035, hold: 0.25 });
    [96, 100, 103, 108].forEach((m, i) => {
      tone(c, chordAt + 0.08 + i * 0.09, midi(m), 0.22, { type: 'sine', vol: 0.05 });
    });
    noise(c, chordAt, 0.5, { filter: 'highpass', from: 7000, vol: 0.04, attack: 0.02 });
  },
  badge(c) {
    // sparkly ascending pentatonic + shimmer
    [79, 84, 88, 91, 96].forEach((m, i) => {
      tone(c, i * 0.055, midi(m), 0.3, { type: 'sine', vol: 0.14 });
      tone(c, i * 0.055, midi(m + 12), 0.18, { type: 'sine', vol: 0.03 });
    });
    tone(c, 0.3, midi(84), 0.45, { type: 'triangle', vol: 0.12, hold: 0.1, vibrato: 6 });
    tone(c, 0.3, midi(88), 0.45, { type: 'triangle', vol: 0.1, hold: 0.1, vibrato: 6 });
    noise(c, 0.05, 0.5, { filter: 'highpass', from: 6000, vol: 0.05, attack: 0.05 });
  },
  error(c) {
    // gentle "uh-oh"
    tone(c, 0, midi(64), 0.13, { type: 'triangle', vol: 0.22, to: midi(63) });
    tone(c, 0, midi(64), 0.13, { type: 'square', vol: 0.03 });
    tone(c, 0.15, midi(59), 0.26, { type: 'triangle', vol: 0.22, to: midi(57) });
    tone(c, 0.15, midi(59), 0.26, { type: 'square', vol: 0.03, to: midi(57) });
  },
  whoosh(c) {
    noise(c, 0, 0.38, { filter: 'bandpass', from: 350, to: 3200, q: 0.9, vol: 0.28, attack: 0.16 });
  },
  redeem(c) {
    // "ka-ching": click, coin chirp, bright chord
    noise(c, 0, 0.05, { filter: 'highpass', from: 3000, vol: 0.12, attack: 0.003 });
    tone(c, 0.03, midi(88), 0.08, { type: 'square', vol: 0.06 });
    tone(c, 0.09, midi(93), 0.12, { type: 'square', vol: 0.06 });
    noise(c, 0.1, 0.3, { filter: 'highpass', from: 5500, vol: 0.07, attack: 0.01 });
    [72, 76, 79, 84].forEach((m) => {
      tone(c, 0.16, midi(m), 0.5, { type: 'triangle', vol: 0.13, hold: 0.12 });
    });
  },
  pending(c) {
    // soft two-note bell, "waiting for approval"
    tone(c, 0, midi(76), 0.28, { type: 'sine', vol: 0.15 });
    tone(c, 0, midi(88), 0.15, { type: 'sine', vol: 0.03 });
    tone(c, 0.16, midi(81), 0.42, { type: 'sine', vol: 0.15, vibrato: 4 });
    tone(c, 0.16, midi(93), 0.2, { type: 'sine', vol: 0.03 });
  },
};

export function sfx(name) {
  try {
    if (!soundEnabled) return;
    const fn = SOUNDS[name];
    if (!fn) return;
    const c = getCtx();
    if (!c || !master) return;
    fn(c);
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* Haptics                                                             */
/* ------------------------------------------------------------------ */

function isNative() {
  try {
    return !!(Capacitor && typeof Capacitor.isNativePlatform === 'function' && Capacitor.isNativePlatform());
  } catch {
    return false;
  }
}

const VIBRATE = {
  light: 10,
  medium: 20,
  heavy: 35,
  success: [15, 40, 15],
  warning: [30, 60, 30],
};

export function haptic(kind = 'light') {
  try {
    if (isNative()) {
      let p;
      if (kind === 'success') p = Haptics.notification({ type: NotificationType.Success });
      else if (kind === 'warning') p = Haptics.notification({ type: NotificationType.Warning });
      else {
        const style = kind === 'heavy' ? ImpactStyle.Heavy : kind === 'medium' ? ImpactStyle.Medium : ImpactStyle.Light;
        p = Haptics.impact({ style });
      }
      if (p && typeof p.catch === 'function') p.catch(() => {});
      return;
    }
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(VIBRATE[kind] || VIBRATE.light);
    }
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* Particle engine (one shared canvas + RAF loop for all effects)      */
/* ------------------------------------------------------------------ */

const MAX_PARTICLES = 1500;
const EMOJI_FONT = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji","Twemoji Mozilla",sans-serif';

let particles = [];
let canvas = null;
let g2d = null;
let rafId = 0;
let lastTs = 0;
let W = 0;
let H = 0;
let dpr = 1;
let resizeBound = false;
const spriteCache = new Map();

function resize() {
  try {
    if (!canvas) return;
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    W = canvas.clientWidth || window.innerWidth || document.documentElement.clientWidth || 360;
    H = canvas.clientHeight || window.innerHeight || document.documentElement.clientHeight || 640;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
  } catch { /* ignore */ }
}

function ensureCanvas() {
  if (canvas && canvas.isConnected) return true;
  if (!HAS_DOM || !document.body) return false;
  injectStyle();
  canvas = document.createElement('canvas');
  canvas.className = 'fx-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  g2d = canvas.getContext('2d');
  if (!g2d) {
    canvas = null;
    return false;
  }
  document.body.appendChild(canvas);
  resize();
  if (!resizeBound) {
    window.addEventListener('resize', resize, { passive: true });
    resizeBound = true;
  }
  return true;
}

function teardown() {
  try {
    if (rafId) cancelAnimationFrame(rafId);
  } catch { /* ignore */ }
  rafId = 0;
  lastTs = 0;
  particles = [];
  try {
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
  } catch { /* ignore */ }
  canvas = null;
  g2d = null;
  try {
    if (resizeBound) window.removeEventListener('resize', resize);
  } catch { /* ignore */ }
  resizeBound = false;
}

function emojiSprite(ch) {
  let s = spriteCache.get(ch);
  if (s) return s;
  const px = 64;
  const size = Math.ceil(px * 1.3);
  s = document.createElement('canvas');
  s.width = size;
  s.height = size;
  const c = s.getContext('2d');
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.font = `${px}px ${EMOJI_FONT}`;
  c.fillText(ch, size / 2, size / 2 + px * 0.06);
  spriteCache.set(ch, s);
  return s;
}

function step(p, dt) {
  p.age += dt;
  if (p.age >= p.life) return false;
  const k = Math.exp(-p.drag * dt);
  p.vx *= k;
  p.vy *= k;
  p.vy += p.g * dt;
  const sway = Math.sin(p.age * p.wobS + p.wob) * p.sway;
  p.x += (p.vx + sway) * dt;
  p.y += p.vy * dt;
  p.rot += p.vr * dt;
  p.tilt += p.vt * dt;
  if (p.vy > 0 && p.y > H + 80) return false;
  if (p.x < -200 || p.x > W + 200) return false;
  return true;
}

function draw(p) {
  const fadeAt = p.life * p.fade;
  let a = p.age > fadeAt ? 1 - (p.age - fadeAt) / (p.life - fadeAt) : 1;
  if (p.age < 0.06) a *= p.age / 0.06;
  if (a <= 0.01) return;
  const c = g2d;
  c.globalAlpha = a;
  c.translate(p.x, p.y);
  c.rotate(p.rot);
  if (p.shape === 'emoji') {
    const spr = p.sprite;
    const sz = p.size;
    if (p.spin) c.scale(Math.cos(p.tilt) || 0.001, 1);
    c.drawImage(spr, -sz * 0.65, -sz * 0.65, sz * 1.3, sz * 1.3);
  } else if (p.shape === 'circle') {
    c.scale(1, Math.abs(Math.cos(p.tilt)) * 0.7 + 0.3);
    c.fillStyle = p.color;
    c.beginPath();
    c.arc(0, 0, p.size * 0.42, 0, Math.PI * 2);
    c.fill();
  } else {
    c.scale(1, Math.cos(p.tilt));
    c.fillStyle = p.color;
    c.fillRect(-p.size / 2, -p.size * 0.32, p.size, p.size * 0.64);
  }
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function loop(ts) {
  try {
    rafId = 0;
    if (!canvas || !g2d) return teardown();
    if ((canvas.clientWidth && canvas.clientWidth !== W) || (canvas.clientHeight && canvas.clientHeight !== H) ||
        Math.min(window.devicePixelRatio || 1, 3) !== dpr) resize();
    const dt = lastTs ? Math.min(0.05, Math.max(0, (ts - lastTs) / 1000)) : 1 / 60;
    lastTs = ts;
    g2d.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2d.clearRect(0, 0, W, H);
    let j = 0;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (step(p, dt)) {
        draw(p);
        particles[j++] = p;
      }
    }
    particles.length = j;
    g2d.globalAlpha = 1;
    if (particles.length) rafId = requestAnimationFrame(loop);
    else teardown();
  } catch {
    teardown();
  }
}

function addParticles(list) {
  if (!list.length || !ensureCanvas()) return;
  const room = MAX_PARTICLES - particles.length;
  if (room <= 0) return;
  for (let i = 0; i < list.length && i < room; i++) particles.push(list[i]);
  if (!rafId) rafId = requestAnimationFrame(loop);
}

function makeParticle(o) {
  return {
    x: 0, y: 0, vx: 0, vy: 0,
    g: 700, drag: 2, rot: rand(0, Math.PI * 2), vr: rand(-8, 8),
    tilt: rand(0, Math.PI * 2), vt: rand(4, 12),
    wob: rand(0, Math.PI * 2), wobS: rand(3, 7), sway: rand(10, 40),
    size: rand(7, 12), color: '#ffd23f', shape: 'rect',
    sprite: null, spin: false,
    age: 0, life: 2.5, fade: 0.7,
    ...o,
  };
}

function shapeFor(shapes, emoji, emojiRatio) {
  if (emoji && emoji.length && Math.random() < emojiRatio) return 'emoji';
  return pick(shapes);
}

function reduceCount(n, factor, min) {
  return prefersReducedMotion() ? Math.max(min, Math.round(n * factor)) : n;
}

/* ------------------------------------------------------------------ */
/* Public visual effects                                               */
/* ------------------------------------------------------------------ */

export function confetti(opts = {}) {
  try {
    if (!ensureCanvas()) return;
    const o = opts || {};
    const count = reduceCount(Math.max(0, Math.round(o.count == null ? 120 : o.count)), 0.15, 6);
    const ox = (o.x == null ? 0.5 : o.x) * W;
    const oy = (o.y == null ? 0.35 : o.y) * H;
    const spread = ((o.spread == null ? 100 : o.spread) * Math.PI) / 180;
    const angle = ((o.angle == null ? 90 : o.angle) * Math.PI) / 180;
    const colors = Array.isArray(o.colors) && o.colors.length ? o.colors : DEFAULT_COLORS;
    const shapes = Array.isArray(o.shapes) && o.shapes.length
      ? o.shapes.filter((s) => s === 'rect' || s === 'circle')
      : ['rect', 'rect', 'circle'];
    if (!shapes.length) shapes.push('rect');
    const emoji = Array.isArray(o.emoji) ? o.emoji.filter(Boolean) : null;
    const emojiRatio = o.emojiRatio == null ? 0.22 : o.emojiRatio;
    const scale = Math.min(1.6, Math.max(0.6, Math.max(W, H) / 900));
    const list = [];
    for (let i = 0; i < count; i++) {
      const a = angle + rand(-spread / 2, spread / 2);
      const speed = rand(550, 1250) * scale * (o.power == null ? 1 : o.power);
      const shape = shapeFor(shapes, emoji, emojiRatio);
      const p = makeParticle({
        x: ox + rand(-6, 6),
        y: oy + rand(-6, 6),
        vx: Math.cos(a) * speed,
        vy: -Math.sin(a) * speed,
        g: rand(600, 760) * scale,
        drag: rand(1.9, 2.5),
        life: rand(2.1, 2.8),
        color: pick(colors),
        shape,
      });
      if (shape === 'emoji') {
        p.sprite = emojiSprite(pick(emoji));
        p.size = rand(18, 28);
        p.vr = rand(-3, 3);
        p.sway = rand(5, 20);
      }
      list.push(p);
    }
    addParticles(list);
  } catch { /* ignore */ }
}

export function burst(x, y, opts = {}) {
  try {
    if (!ensureCanvas()) return;
    const o = opts || {};
    const count = reduceCount(Math.max(0, Math.round(o.count == null ? 30 : o.count)), 0.2, 4);
    const colors = Array.isArray(o.colors) && o.colors.length ? o.colors : DEFAULT_COLORS;
    const emoji = Array.isArray(o.emoji) ? o.emoji.filter(Boolean) : null;
    const emojiRatio = o.emojiRatio == null ? 0.3 : o.emojiRatio;
    const shapes = ['rect', 'circle', 'circle'];
    const px = Number.isFinite(x) ? x : W / 2;
    const py = Number.isFinite(y) ? y : H / 2;
    const power = o.power == null ? 1 : o.power;
    const list = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + rand(-0.25, 0.25);
      const speed = rand(220, 560) * power;
      const shape = shapeFor(shapes, emoji, emojiRatio);
      const p = makeParticle({
        x: px,
        y: py,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        g: 520,
        drag: rand(3, 4),
        life: rand(0.8, 1.25),
        fade: 0.45,
        size: rand(5, 9),
        sway: rand(0, 12),
        color: pick(colors),
        shape,
      });
      if (shape === 'emoji') {
        p.sprite = emojiSprite(pick(emoji));
        p.size = rand(14, 22);
        p.vr = rand(-4, 4);
      }
      list.push(p);
    }
    addParticles(list);
  } catch { /* ignore */ }
}

export function coinRain(n = 12) {
  try {
    if (!ensureCanvas()) return;
    let count = Math.max(0, Math.round(Number(n) || 0));
    if (prefersReducedMotion()) count = Math.min(count, 3);
    const sprite = emojiSprite('🪙');
    const list = [];
    for (let i = 0; i < count; i++) {
      const size = rand(28, 42);
      const vy = rand(140, 260);
      list.push(makeParticle({
        x: rand(size, Math.max(size + 1, W - size)),
        y: -size - rand(0, H * 0.45),
        vx: rand(-25, 25),
        vy,
        g: rand(380, 520),
        drag: 0.45,
        rot: rand(-0.3, 0.3),
        vr: rand(-1.2, 1.2),
        tilt: rand(0, Math.PI * 2),
        vt: rand(5, 9),
        sway: rand(0, 15),
        size,
        shape: 'emoji',
        sprite,
        spin: true,
        life: 5,
        fade: 0.92,
      }));
    }
    addParticles(list);
  } catch { /* ignore */ }
}

export function floatText(x, y, text, color = '#ffd23f') {
  try {
    if (!HAS_DOM || !document.body) return;
    injectStyle();
    const el = document.createElement('div');
    el.className = 'fx-float' + (prefersReducedMotion() ? ' fx-rm' : '');
    el.setAttribute('aria-hidden', 'true');
    el.textContent = String(text == null ? '' : text);
    el.style.left = (Number.isFinite(x) ? x : (window.innerWidth || 0) / 2) + 'px';
    el.style.top = (Number.isFinite(y) ? y : (window.innerHeight || 0) / 2) + 'px';
    el.style.color = color || '#ffd23f';
    let done = false;
    const remove = () => {
      if (done) return;
      done = true;
      try { el.remove(); } catch { /* ignore */ }
    };
    el.addEventListener('animationend', remove, { once: true });
    setTimeout(remove, 1600);
    document.body.appendChild(el);
  } catch { /* ignore */ }
}

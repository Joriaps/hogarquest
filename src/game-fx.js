// game-fx.js - "juice" for completing chores: card exit, flying stars, big text,
// fortune wheel and treasure chest. Builds on fx.js for particles and reduced motion.
//
// Rules every export follows:
//  - never throws; every Promise resolves (never rejects), even if the element vanishes.
//  - animates transform/opacity only. The one exception is completeCard's collapse,
//    which is layout by definition (the cards below have to move up).
//  - removes every temporary node it creates.
//  - with prefers-reduced-motion, swaps movement for a short fade.
//
// Audio is left to the caller (spinWheel has onTick, the rest have their Promise). The one
// exception is flyStars: it plays a soft sfx('tap') per arrival, because the caller has no
// way to know when each star lands.

import './game-fx.css';
import { burst, prefersReducedMotion, sfx } from './fx.js';

const noop = () => {};
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const isEl = (el) => !!el && el.nodeType === 1;
const wait = (ms) => new Promise((res) => setTimeout(res, ms));
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Wraps an async implementation so the export always returns a resolving Promise.
function safely(fn) {
  return (...args) => {
    try {
      return Promise.resolve(fn(...args)).then(noop, noop);
    } catch {
      return Promise.resolve();
    }
  };
}

// Starts a Web Animation. Returns the Animation, or null where WAAPI is unavailable.
function play(el, frames, opts) {
  try {
    return el.animate ? el.animate(frames, opts) : null;
  } catch {
    return null;
  }
}

// Resolves when the animation ends or is cancelled. The timer covers a paused WebView or
// a removed element, where `finished` might never settle.
function ended(anim, ms = 0) {
  if (!anim) return Promise.resolve();
  const finished = anim.finished ? anim.finished.then(noop, noop) : wait(ms);
  return Promise.race([finished, wait(ms + 400)]);
}

function run(el, frames, opts) {
  return ended(play(el, frames, opts), (opts.delay || 0) + (opts.duration || 0));
}

function cancel(anim) {
  try {
    if (anim) anim.cancel();
  } catch { /* ignore */ }
}

// Transforms have no effect on plain inline boxes (a <span> counter, say).
function makeTransformable(el) {
  try {
    if (getComputedStyle(el).display === 'inline') el.style.display = 'inline-block';
  } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ */
/* completeCard                                                        */
/* ------------------------------------------------------------------ */

const cardRuns = new WeakMap();
const clipCounts = new WeakMap();

const CHECK_SVG = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" fill="#0ead69" stroke="#fff" stroke-width="3"/><path d="M13 25l8 8 15-17" fill="none" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

// The slide-out would otherwise widen the page for a moment (body has no overflow-x rule),
// and clipping the immediate parent would cut off the scale-up. So clip the first ancestor
// that is wider than the card. Returns the function that undoes it.
function clipSlide(card) {
  try {
    const w = card.offsetWidth;
    let a = card.parentElement;
    while (a && a !== document.body && a.offsetWidth < w + 16) a = a.parentElement;
    if (!a || a === document.body) return noop;
    if (getComputedStyle(a).overflowX !== 'visible') return noop;
    const n = clipCounts.get(a) || 0;
    if (!n) a.style.overflowX = 'clip';
    clipCounts.set(a, n + 1);
    return () => {
      const left = (clipCounts.get(a) || 1) - 1;
      clipCounts.set(a, left);
      if (!left) a.style.overflowX = '';
    };
  } catch {
    return noop;
  }
}

// Margin the card must end on so the next card lands exactly where it will sit once this
// one is removed: sibling gaps (flex/grid) and `.list > * + *` margins are absorbed.
function collapseMargins(card, cs) {
  const parent = card.parentElement;
  const prev = card.previousElementSibling;
  const next = card.nextElementSibling;
  let top = 0;
  let bottom = 0;
  if (parent) {
    const display = getComputedStyle(parent).display;
    const gap = /flex|grid/.test(display) ? parseFloat(getComputedStyle(parent).rowGap) || 0 : 0;
    if (gap && next) bottom = -gap;
    else if (gap && prev) top = -gap;
    else if (!gap && !prev && next) bottom = -(parseFloat(getComputedStyle(next).marginTop) || 0);
  }
  return { from: [cs.marginTop, cs.marginBottom], to: [top + 'px', bottom + 'px'] };
}

async function doCompleteCard(card) {
  const cs = getComputedStyle(card);
  const height = cs.height === 'auto' ? card.offsetHeight + 'px' : cs.height;
  const margins = collapseMargins(card, cs);
  const from = {
    height,
    minHeight: cs.minHeight === 'auto' ? '0px' : cs.minHeight,
    marginTop: margins.from[0],
    marginBottom: margins.from[1],
    paddingTop: cs.paddingTop,
    paddingBottom: cs.paddingBottom,
    borderTopWidth: cs.borderTopWidth,
    borderBottomWidth: cs.borderBottomWidth,
  };
  const to = {
    height: '0px',
    minHeight: '0px',
    marginTop: margins.to[0],
    marginBottom: margins.to[1],
    paddingTop: '0px',
    paddingBottom: '0px',
    borderTopWidth: '0px',
    borderBottomWidth: '0px',
  };

  card.style.pointerEvents = 'none';

  if (prefersReducedMotion()) {
    await run(card, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-out', fill: 'forwards' });
    card.style.overflow = 'hidden';
    await run(card, [from, to], { duration: 0, fill: 'forwards' });
    return;
  }

  const wasStatic = cs.position === 'static';
  if (wasStatic) card.style.position = 'relative';
  const unclip = clipSlide(card);
  const flash = document.createElement('div');
  flash.className = 'gfx-flash';
  flash.setAttribute('aria-hidden', 'true');
  flash.innerHTML = `<span class="gfx-check">${CHECK_SVG}</span>`;
  card.appendChild(flash);
  card.style.overflow = 'hidden';

  try {
    play(flash, [
      { opacity: 0 },
      { opacity: 1, offset: 0.2 },
      { opacity: 0.8, offset: 0.7 },
      { opacity: 0.8 },
    ], { duration: 460, fill: 'forwards' });
    play(flash.firstElementChild, [
      { transform: 'scale(.2) rotate(-30deg)', opacity: 0, easing: 'cubic-bezier(.2,.9,.3,1.5)' },
      { transform: 'scale(1) rotate(0deg)', opacity: 1, offset: 0.55 },
      { transform: 'scale(1) rotate(0deg)', opacity: 1 },
    ], { duration: 300, fill: 'forwards' });
    const out = play(card, [
      { transform: 'translateX(0) scale(1) rotate(0deg)', opacity: 1, easing: 'cubic-bezier(.2,.9,.3,1.4)' },
      { transform: 'translateX(0) scale(1.05) rotate(0deg)', opacity: 1, offset: 0.3, easing: 'ease-out' },
      { transform: 'translateX(-2%) scale(1.02) rotate(-.6deg)', opacity: 1, offset: 0.46, easing: 'cubic-bezier(.55,0,.9,.45)' },
      { transform: 'translateX(108%) scale(.97) rotate(2.5deg)', opacity: 0 },
    ], { duration: 470, fill: 'forwards' });
    const collapse = play(card, [from, to], {
      delay: 400,
      duration: 350,
      easing: 'cubic-bezier(.3,.8,.3,1)',
      fill: 'forwards',
    });
    await Promise.all([ended(out, 470), ended(collapse, 750)]);
  } finally {
    flash.remove();
    unclip();
    if (wasStatic) card.style.position = '';
  }
}

const runCompleteCard = safely(doCompleteCard);

export function completeCard(cardEl) {
  try {
    if (!isEl(cardEl)) return Promise.resolve();
    const running = cardRuns.get(cardEl);
    if (running) return running;
    const p = runCompleteCard(cardEl);
    cardRuns.set(cardEl, p);
    return p;
  } catch {
    return Promise.resolve();
  }
}

/* ------------------------------------------------------------------ */
/* flyStars                                                            */
/* ------------------------------------------------------------------ */

const pulses = new WeakMap();

function pulse(el) {
  try {
    cancel(pulses.get(el));
    const reduced = prefersReducedMotion();
    if (!reduced) makeTransformable(el);
    const frames = reduced
      ? [{ opacity: 0.55 }, { opacity: 1 }]
      : [
        { transform: 'scale(1)', easing: 'ease-out' },
        { transform: 'scale(1.32)', offset: 0.35, easing: 'ease-in-out' },
        { transform: 'scale(.94)', offset: 0.7 },
        { transform: 'scale(1)' },
      ];
    pulses.set(el, play(el, frames, { duration: reduced ? 200 : 240 }));
  } catch { /* ignore */ }
}

// Viewport point the stars aim for. Off-screen or unrendered targets clamp to the top.
function aimPoint(targetEl) {
  const vw = window.innerWidth || 360;
  const vh = window.innerHeight || 640;
  const fallback = { x: vw / 2, y: 36 };
  if (!isEl(targetEl) || !targetEl.isConnected) return fallback;
  const r = targetEl.getBoundingClientRect();
  if (!r.width && !r.height) return fallback;
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const off = r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw;
  return off ? { x: clamp(x, 28, vw - 28), y: 36 } : { x, y };
}

function star(className) {
  const s = document.createElement('div');
  s.className = className;
  s.setAttribute('aria-hidden', 'true');
  s.textContent = '⭐';
  document.body.appendChild(s);
  return s;
}

function arcFrames(x0, y0, x1, y1, side) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  // Control point: off to one side of the straight line, and pulled upwards.
  const bend = clamp(len * 0.55, 70, 190) * rand(0.75, 1.15);
  const cx = (x0 + x1) / 2 + (-dy / len) * bend * side;
  const cy = (y0 + y1) / 2 + (dx / len) * bend * side - 50;
  const spin = rand(240, 520) * side;
  const frames = [];
  const STEPS = 16;
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    const u = 1 - t;
    const x = u * u * x0 + 2 * u * t * cx + t * t * x1;
    const y = u * u * y0 + 2 * u * t * cy + t * t * y1;
    const scale = t < 0.2 ? 0.3 + (t / 0.2) * 1 : 1.3 - ((t - 0.2) / 0.8) * 0.75;
    frames.push({
      transform: `translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0) translate(-50%,-50%) rotate(${(spin * t).toFixed(1)}deg) scale(${scale.toFixed(3)})`,
      opacity: t < 0.08 ? t / 0.08 : 1,
    });
  }
  return frames;
}

async function doFlyStars(fromX, fromY, targetEl, n) {
  const count = clamp(Math.round(Number(n)) || 0, 0, 40);
  if (!count) return;
  const aim = aimPoint(targetEl);
  const landed = () => {
    if (isEl(targetEl)) pulse(targetEl);
    sfx('tap');
  };

  if (prefersReducedMotion()) {
    const s = star('gfx-star');
    s.style.transform = `translate3d(${aim.x}px,${aim.y}px,0) translate(-50%,-50%)`;
    try {
      await run(s, [{ opacity: 0 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], { duration: 300 });
    } finally {
      s.remove();
    }
    landed();
    return;
  }

  const x0 = Number.isFinite(fromX) ? fromX : (window.innerWidth || 360) / 2;
  const y0 = Number.isFinite(fromY) ? fromY : (window.innerHeight || 640) / 2;
  const flights = [];
  for (let i = 0; i < count; i++) {
    const s = star('gfx-star');
    const duration = rand(540, 660);
    const anim = play(s, arcFrames(x0 + rand(-14, 14), y0 + rand(-10, 10), aim.x, aim.y, i % 2 ? 1 : -1), {
      duration,
      delay: i * 70,
      easing: 'cubic-bezier(.4,.1,.75,.85)',
      fill: 'both',
    });
    flights.push(ended(anim, i * 70 + duration).then(() => {
      s.remove();
      landed();
    }));
  }
  await Promise.all(flights);
}

const runFlyStars = safely(doFlyStars);

export function flyStars(fromX, fromY, targetEl, n = 6) {
  return runFlyStars(fromX, fromY, targetEl, n);
}

/* ------------------------------------------------------------------ */
/* jump / shake                                                        */
/* ------------------------------------------------------------------ */

const jumps = new WeakMap();

export function jump(el) {
  try {
    if (!isEl(el)) return Promise.resolve();
    cancel(jumps.get(el));
    if (prefersReducedMotion()) {
      const a = play(el, [{ opacity: 0.55 }, { opacity: 1 }], { duration: 220 });
      jumps.set(el, a);
      return ended(a, 220);
    }
    makeTransformable(el);
    const h = el.offsetHeight || 60;
    const hop = clamp(h * 0.42, 14, 54);
    // Compensating the scale keeps the feet on the floor without writing transform-origin,
    // which would drop the animation off the compositor.
    const pose = (y, sx, sy, deg = 0) => `translateY(${(y + ((1 - sy) * h) / 2).toFixed(2)}px) rotate(${deg}deg) scale(${sx},${sy})`;
    const side = Math.random() < 0.5 ? -1 : 1;
    const a = play(el, [
      { transform: pose(0, 1, 1), easing: 'ease-out' },
      { transform: pose(0, 1.16, 0.8), offset: 0.14, easing: 'cubic-bezier(.15,.8,.4,1)' },
      { transform: pose(-hop * 0.8, 0.88, 1.16, 3 * side), offset: 0.38, easing: 'ease-out' },
      { transform: pose(-hop, 0.97, 1.04, 4 * side), offset: 0.52, easing: 'cubic-bezier(.6,0,.9,.5)' },
      { transform: pose(0, 1.2, 0.78), offset: 0.76, easing: 'ease-out' },
      { transform: pose(0, 0.94, 1.08), offset: 0.88, easing: 'ease-in-out' },
      { transform: pose(0, 1, 1) },
    ], { duration: 640 });
    jumps.set(el, a);
    return ended(a, 640);
  } catch {
    return Promise.resolve();
  }
}

// A transform on an ancestor would become the containing block of its position:fixed
// descendants (the .nav lives inside .screen), so they would jump if the page is scrolled.
// When the subtree holds fixed elements near the top, shake the non-fixed pieces instead.
function shakeTargets(el, depth = 0) {
  const isFixed = (k) => getComputedStyle(k).position === 'fixed';
  const skip = (k) => /^(SCRIPT|STYLE|LINK|TEMPLATE)$/.test(k.tagName);
  const holdsFixed = (e, d) => [...e.children].some((k) => !skip(k) && (isFixed(k) || (d > 0 && holdsFixed(k, d - 1))));
  const root = el === document.documentElement || el === document.body;
  if (depth >= 3 || (!root && !holdsFixed(el, 2 - depth))) return [el];
  const out = [];
  for (const k of el.children) {
    if (!skip(k) && !isFixed(k)) out.push(...shakeTargets(k, depth + 1));
  }
  return out;
}

export function shake(el) {
  try {
    const target = isEl(el) ? el : document.getElementById('app') || document.body;
    if (!target) return Promise.resolve();
    const reduced = prefersReducedMotion();
    const frames = reduced
      ? [{ opacity: 0.8 }, { opacity: 1 }]
      : [
        [0, 0, 0], [-9, 3, -0.7], [8, -4, 0.6], [-7, 2, -0.5], [5, -3, 0.4], [-4, 2, -0.3], [2, -1, 0.15], [0, 0, 0],
      ].map(([x, y, r]) => ({ transform: `translate3d(${x}px,${y}px,0) rotate(${r}deg)` }));
    const duration = reduced ? 180 : 380;
    return Promise.all(shakeTargets(target).map((t) => run(t, frames, { duration, easing: 'ease-out' }))).then(noop, noop);
  } catch {
    return Promise.resolve();
  }
}

/* ------------------------------------------------------------------ */
/* bigText                                                             */
/* ------------------------------------------------------------------ */

let bigChain = Promise.resolve();
let bigPending = 0;
const BIG_MAX_QUEUE = 6;

async function showBig(title, subtitle, color) {
  if (!document.body) return;
  const box = document.createElement('div');
  box.className = 'gfx-big';
  box.setAttribute('role', 'status');
  box.style.setProperty('--gfx-c', '#ffd23f');
  if (color) box.style.setProperty('--gfx-c', String(color));

  const glow = document.createElement('div');
  glow.className = 'gfx-big-glow';
  const inner = document.createElement('div');
  inner.className = 'gfx-big-inner';
  const t = document.createElement('div');
  const text = String(title == null ? '' : title);
  t.className = 'gfx-big-title' + (text.length > 11 ? ' gfx-long' : '');
  t.textContent = text;
  inner.appendChild(t);
  let s = null;
  if (subtitle != null && subtitle !== '') {
    s = document.createElement('div');
    s.className = 'gfx-big-sub';
    s.textContent = String(subtitle);
    inner.appendChild(s);
  }
  box.append(glow, inner);
  document.body.appendChild(box);

  try {
    if (prefersReducedMotion()) {
      await run(box, [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.9 }, { opacity: 0 }], { duration: 1400 });
      return;
    }
    const IN = 380;
    const HOLD = 1000;
    const OUT = 380;
    const total = IN + HOLD + OUT;
    const at = (ms) => ms / total;
    play(glow, [
      { opacity: 0, transform: 'scale(.4)', easing: 'ease-out' },
      { opacity: 1, transform: 'scale(1)', offset: at(IN) },
      { opacity: 0.85, transform: 'scale(1.06)', offset: at(IN + HOLD) },
      { opacity: 0, transform: 'scale(1.2)' },
    ], { duration: total, fill: 'both' });
    play(t, [
      { transform: 'scale(.25) rotate(-5deg)', opacity: 0, easing: 'cubic-bezier(.2,.8,.3,1)' },
      { transform: 'scale(1.18) rotate(1.5deg)', opacity: 1, offset: at(IN * 0.6), easing: 'ease-in-out' },
      { transform: 'scale(.96) rotate(0deg)', opacity: 1, offset: at(IN * 0.82), easing: 'ease-out' },
      { transform: 'scale(1) rotate(0deg)', opacity: 1, offset: at(IN) },
      { transform: 'scale(1.03) rotate(0deg)', opacity: 1, offset: at(IN + HOLD) },
      { transform: 'scale(1.03) rotate(0deg)', opacity: 1 },
    ], { duration: total, fill: 'both' });
    if (s) {
      play(s, [
        { transform: 'translateY(16px) scale(.8)', opacity: 0, easing: 'cubic-bezier(.2,.9,.3,1.5)' },
        { transform: 'translateY(0) scale(1)', opacity: 1, offset: at(IN) },
        { transform: 'translateY(0) scale(1)', opacity: 1 },
      ], { delay: 110, duration: total - 110, fill: 'both' });
    }
    // The float-up goes on the shared parent, so title and subtitle leave together.
    await run(inner, [
      { transform: 'translateY(0)', opacity: 1, offset: 0, easing: 'linear' },
      { transform: 'translateY(0)', opacity: 1, offset: at(IN + HOLD), easing: 'cubic-bezier(.5,0,.8,.5)' },
      { transform: 'translateY(-70px)', opacity: 0, offset: 1 },
    ], { duration: total, fill: 'both' });
  } finally {
    box.remove();
  }
}

export function bigText(title, subtitle = '', color = '#ffd23f') {
  try {
    if (bigPending >= BIG_MAX_QUEUE) return Promise.resolve();
    bigPending++;
    const p = bigChain
      .then(() => showBig(title, subtitle, color))
      .then(noop, noop)
      .then(() => { bigPending--; });
    bigChain = p;
    return p;
  } catch {
    return Promise.resolve();
  }
}

/* ------------------------------------------------------------------ */
/* Fortune wheel                                                       */
/* ------------------------------------------------------------------ */
// Geometry contract shared by wheelHTML and spinWheel: angles are in degrees, measured
// clockwise from 12 o'clock. Segment i covers [i*s, (i+1)*s] with s = 360/n. Rotating the
// disc clockwise by R puts wheel-local angle (-R mod 360) under the fixed top pointer.

const SEG_COLORS = [
  'var(--pink,#ff6fb5)', 'var(--gold,#ffd23f)', 'var(--mint,#3ee6a8)', 'var(--sky,#4cc9ff)',
  'var(--orange,#ff9f43)', 'var(--violet,#8f6bff)', 'var(--red,#ff5a6e)', '#2fd3c7',
];
const SPIN_MS = 4200;
const SPIN_EASE = 'cubic-bezier(.16,.62,.14,1)';
const BULBS = 16;

const fix = (v) => +v.toFixed(3);

function polar(r, deg, c = 100) {
  const a = (deg * Math.PI) / 180;
  return [fix(c + r * Math.sin(a)), fix(c - r * Math.cos(a))];
}

function wedge(r, a0, a1) {
  const end = a1 - a0 >= 360 ? a0 + 359.99 : a1;
  const [x0, y0] = polar(r, a0);
  const [x1, y1] = polar(r, end);
  return `M100 100L${x0} ${y0}A${r} ${r} 0 ${end - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}Z`;
}

function bulbs(start, step, fill, halo) {
  let out = '';
  for (let i = start; i < BULBS; i += step) {
    const [x, y] = polar(46.6, (i * 360) / BULBS, 50);
    if (halo) out += `<circle cx="${x}" cy="${y}" r="3" fill="${halo}"/>`;
    out += `<circle cx="${x}" cy="${y}" r="1.7" fill="${fill}"/>`;
  }
  return out;
}

export function wheelHTML(segments) {
  try {
    const list = Array.isArray(segments) ? segments : [];
    const n = Math.max(1, list.length);
    const s = 360 / n;
    let wedges = '';
    let labels = '';
    let pegs = '';
    for (let i = 0; i < n; i++) {
      const a0 = i * s;
      const pts = list[i] ? list[i].pts : '';
      const text = `+${pts}`;
      const size = text.length <= 2 ? 36 : text.length === 3 ? 32 : text.length === 4 ? 26 : 20;
      const color = SEG_COLORS[i % SEG_COLORS.length];
      wedges += `<path class="gw-seg" data-i="${i}" d="${wedge(100, a0, a0 + s)}" style="fill:${color}"/>`;
      // Radial: the text runs along the segment's spoke, reading from the hub to the rim.
      labels += `<text class="gw-label" data-i="${i}" x="163" y="${fix(100 + size * 0.36)}" font-size="${size}" stroke-width="${fix(size * 0.17)}" transform="rotate(${fix(a0 + s / 2 - 90)} 100 100)">${esc(text)}</text>`;
      const [px, py] = polar(92, a0);
      pegs += `<circle cx="${px}" cy="${py}" r="3.4" fill="#fff4bf" stroke="#a8730f" stroke-width="1"/>`;
    }
    let spokes = '';
    for (let i = 0; i < n; i++) {
      const [x, y] = polar(100, i * s);
      spokes += `<path d="M100 100L${x} ${y}"/>`;
    }
    return `<div class="gw" role="img" aria-label="Ruleta de premios" data-n="${n}">
  <div class="gw-rim"></div>
  <svg class="gw-bulbs" viewBox="0 0 100 100" aria-hidden="true">${bulbs(0, 1, '#8a5c0c')}</svg>
  <svg class="gw-bulbs gw-lit gw-lit-a" viewBox="0 0 100 100" aria-hidden="true">${bulbs(0, 2, '#fffbe0', 'rgba(255,240,150,.45)')}</svg>
  <svg class="gw-bulbs gw-lit gw-lit-b" viewBox="0 0 100 100" aria-hidden="true">${bulbs(1, 2, '#fffbe0', 'rgba(255,240,150,.45)')}</svg>
  <div class="gw-disc"><svg class="gw-face" viewBox="0 0 200 200" aria-hidden="true">
    ${wedges}
    <circle cx="100" cy="100" r="85" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="30"/>
    <g stroke="#fff" stroke-opacity=".75" stroke-width="2.2">${spokes}</g>
    ${labels}${pegs}
  </svg></div>
  <div class="gw-shade"></div>
  <div class="gw-hub"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.4l2.9 6.2 6.7.8-5 4.6 1.4 6.7L12 17.3l-6 3.4 1.4-6.7-5-4.6 6.7-.8z" fill="#fff" stroke="#c98a12" stroke-width="1.2" stroke-linejoin="round"/></svg></div>
  <div class="gw-pointer"><svg viewBox="0 0 60 72" aria-hidden="true">
    <path d="M30 71L9 30A24 24 0 1 1 51 30Z" fill="#2a1658" fill-opacity=".45" transform="translate(0 2.5)"/>
    <path d="M30 69L9 29A24 24 0 1 1 51 29Z" fill="#ff3d62" stroke="#fff" stroke-width="3.5" stroke-linejoin="round"/>
    <circle cx="30" cy="22" r="9" fill="#ffd23f" stroke="#fff" stroke-width="2.5"/>
  </svg></div>
</div>`;
  } catch {
    return '<div class="gw"></div>';
  }
}

// Spotlights the winner: everything else dims and the winning wedge pulses with its label
// on top. All overlays live inside .gw-disc so they stay aligned with the stopped wheel.
function showWinner(root, disc, i, n) {
  const s = 360 / n;
  const a0 = i * s;
  const overlay = (cls, inner) => `<svg class="gw-win ${cls}" viewBox="0 0 200 200" aria-hidden="true">${inner}</svg>`;
  const dim = n > 1 ? overlay('gw-win-dim', `<path d="${wedge(100, a0 + s, a0 + 360)}" fill="#14082e"/>`) : '';
  disc.insertAdjacentHTML('beforeend', dim
    + overlay('gw-win-flash', `<path d="${wedge(100, a0, a0 + s)}" fill="#fff"/>`)
    + overlay('gw-win-line', `<path d="${wedge(98, a0, a0 + s)}" fill="none" stroke="#fff6c2" stroke-width="4" stroke-linejoin="round"/>`));
  const label = disc.querySelector(`.gw-label[data-i="${i}"]`);
  const line = disc.querySelector('.gw-win-line');
  if (label && line) line.appendChild(label.cloneNode(true));
  root.classList.add('has-winner');
  if (prefersReducedMotion()) return;
  run(root, [
    { transform: 'scale(1)', easing: 'ease-out' },
    { transform: 'scale(1.05)', offset: 0.35, easing: 'ease-in-out' },
    { transform: 'scale(.99)', offset: 0.7 },
    { transform: 'scale(1)' },
  ], { duration: 420 });
}

function clearWinner(root, disc) {
  root.classList.remove('has-winner');
  disc.querySelectorAll('.gw-win').forEach((o) => o.remove());
}

const spins = new WeakMap();

async function doSpinWheel(root, index, segmentCount, onTick) {
  const disc = root.querySelector('.gw-disc');
  if (!disc) return;
  // The drawn wheel is the source of truth, so the pointer can't disagree with the picture.
  const n = Number(root.dataset.n) || Math.max(1, Math.round(Number(segmentCount)) || 1);
  const s = 360 / n;
  const i = (((Math.round(Number(index)) || 0) % n) + n) % n;
  const tick = () => {
    try {
      if (onTick) onTick();
    } catch { /* a bad callback must not stop the wheel */ }
  };

  clearWinner(root, disc);
  const current = Number(disc.dataset.rot) || 0;
  const local = (i + rand(0.16, 0.84)) * s;
  const turns = Math.ceil((current + 5 * 360 + local) / 360) + (Math.random() < 0.5 ? 1 : 0);
  const final = turns * 360 - local;
  const settle = () => {
    disc.style.transform = `rotate(${final}deg)`;
    disc.dataset.rot = String(final);
  };

  if (prefersReducedMotion()) {
    await run(disc, [{ opacity: 1 }, { opacity: 0.15 }], { duration: 120, fill: 'forwards' });
    settle();
    tick();
    const a = play(disc, [{ opacity: 0.15 }, { opacity: 1 }], { duration: 180 });
    await ended(a, 180);
    disc.getAnimations && disc.getAnimations().forEach(cancel);
    showWinner(root, disc, i, n);
    return;
  }

  root.classList.add('is-spinning');
  const pointer = root.querySelector('.gw-pointer');
  const flick = pointer ? play(pointer, [
    { transform: 'rotate(-20deg)', easing: 'cubic-bezier(.2,.8,.3,1)' },
    { transform: 'rotate(0deg)' },
  ], { duration: 140 }) : null;
  if (flick) flick.cancel();
  const onBoundary = () => {
    tick();
    try {
      if (flick) {
        flick.currentTime = 0;
        flick.play();
      }
    } catch { /* ignore */ }
  };

  const anim = play(disc, [
    { transform: `rotate(${current}deg)` },
    { transform: `rotate(${final}deg)` },
  ], { duration: SPIN_MS, easing: SPIN_EASE, fill: 'forwards' });

  // The compositor moves the wheel; this loop only reads the eased progress to find the
  // segment boundaries. Several crossings within one frame count as one tick.
  let last = Math.floor(current / s);
  let raf = 0;
  const watch = () => {
    raf = requestAnimationFrame(watch);
    try {
      const p = anim && anim.effect ? anim.effect.getComputedTiming().progress : null;
      if (p == null) return;
      const seen = Math.floor((current + (final - current) * p) / s);
      if (seen !== last) {
        last = seen;
        onBoundary();
      }
    } catch { /* ignore */ }
  };
  raf = requestAnimationFrame(watch);

  try {
    await ended(anim, SPIN_MS);
  } finally {
    cancelAnimationFrame(raf);
    settle();
    cancel(anim);
    root.classList.remove('is-spinning');
  }
  if (Math.floor(final / s) !== last) onBoundary();
  showWinner(root, disc, i, n);
}

const runSpinWheel = safely(doSpinWheel);

export function spinWheel(rootEl, index, segmentCount, { onTick } = {}) {
  try {
    if (!isEl(rootEl)) return Promise.resolve();
    const running = spins.get(rootEl);
    if (running) return running;
    const p = runSpinWheel(rootEl, index, segmentCount, onTick).then(() => { spins.delete(rootEl); });
    spins.set(rootEl, p);
    return p;
  } catch {
    return Promise.resolve();
  }
}

/* ------------------------------------------------------------------ */
/* Treasure chest                                                      */
/* ------------------------------------------------------------------ */
// All layers share one 240x240 viewBox; the lid hinges on the seam at y=128 (see .gc-lid).

const INK = '#3a1a08';
const WOOD = '#a35a26';
const WOOD_DARK = '#7d4118';
const WOOD_LIGHT = '#c47636';
const GOLD = '#ffc933';
const GOLD_DARK = '#d8921a';
const GOLD_LIGHT = '#ffe88f';

const rivet = (x, y) => `<circle cx="${x}" cy="${y}" r="3.4" fill="${GOLD_LIGHT}" stroke="${GOLD_DARK}" stroke-width="1.4"/>`;

const SVG_OPEN = '<svg viewBox="0 0 240 240" aria-hidden="true">';

const CHEST_LID_INSIDE = `${SVG_OPEN}
  <path d="M28 128V86C28 62 52 44 80 44H160C188 44 212 62 212 86V128Z" fill="${WOOD_DARK}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M42 128V90C42 72 60 58 82 58H158C180 58 198 72 198 90V128Z" fill="#2a120a"/>
  <path d="M42 106H198M42 84H198" stroke="#47210f" stroke-width="3"/>
  <path d="M42 128V90C42 72 60 58 82 58H158C180 58 198 72 198 90V128" fill="none" stroke="${GOLD}" stroke-width="3"/>
</svg>`;

function coin(x, y, r = 11) {
  return `<g><circle cx="${x}" cy="${y}" r="${r}" fill="${GOLD}" stroke="${GOLD_DARK}" stroke-width="2.4"/><circle cx="${x}" cy="${y}" r="${r * 0.58}" fill="none" stroke="${GOLD_LIGHT}" stroke-width="1.8"/></g>`;
}

const CHEST_TREASURE = `${SVG_OPEN}
  ${[58, 80, 102, 124, 146, 168, 186].map((x) => coin(x, 118)).join('')}
  ${[70, 92, 116, 138, 160, 178].map((x) => coin(x, 105)).join('')}
  ${[86, 108, 132, 154].map((x) => coin(x, 93)).join('')}
  ${coin(120, 82)}
  <path d="M84 96l12-14 12 14-12 18z" fill="#ff4f7b" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
  <path d="M84 96h24M96 82v32" stroke="#ffc2d4" stroke-width="1.4"/>
  <path d="M142 100l10-12 10 12-10 15z" fill="#4cc9ff" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
  <path d="M142 100h20M152 88v27" stroke="#cdf1ff" stroke-width="1.4"/>
</svg>`;

const CHEST_BASE = `${SVG_OPEN}
  <rect x="28" y="126" width="184" height="84" rx="9" fill="${WOOD}" stroke="${INK}" stroke-width="4"/>
  <rect x="32" y="138" width="176" height="16" fill="${WOOD_LIGHT}" opacity=".55"/>
  <path d="M30 158H210M30 182H210" stroke="${WOOD_DARK}" stroke-width="3.5"/>
  <rect x="30" y="184" width="180" height="24" fill="${WOOD_DARK}" opacity=".45"/>
  <rect x="28" y="130" width="28" height="78" fill="${GOLD}" stroke="${INK}" stroke-width="3"/>
  <rect x="184" y="130" width="28" height="78" fill="${GOLD}" stroke="${INK}" stroke-width="3"/>
  <rect x="33" y="132" width="6" height="74" fill="${GOLD_LIGHT}"/>
  <rect x="189" y="132" width="6" height="74" fill="${GOLD_LIGHT}"/>
  <rect x="48" y="132" width="6" height="74" fill="${GOLD_DARK}"/>
  <rect x="204" y="132" width="6" height="74" fill="${GOLD_DARK}"/>
  ${rivet(42, 158)}${rivet(42, 186)}${rivet(198, 158)}${rivet(198, 186)}
  <rect x="22" y="197" width="196" height="16" rx="6" fill="${GOLD}" stroke="${INK}" stroke-width="4"/>
  <rect x="28" y="200" width="184" height="4" fill="${GOLD_LIGHT}"/>
  <rect x="22" y="122" width="196" height="16" rx="6" fill="${GOLD}" stroke="${INK}" stroke-width="4"/>
  <rect x="28" y="125" width="184" height="4" fill="${GOLD_LIGHT}"/>
  <rect x="98" y="128" width="44" height="46" rx="9" fill="${GOLD}" stroke="${INK}" stroke-width="4"/>
  <rect x="103" y="133" width="34" height="5" rx="2.5" fill="${GOLD_LIGHT}"/>
  <circle cx="120" cy="150" r="6" fill="${INK}"/>
  <path d="M116.5 152h7l2.5 13h-12z" fill="${INK}"/>
</svg>`;

const CHEST_LID = `${SVG_OPEN}
  <path d="M26 128V92C26 62 52 44 82 44H158C188 44 214 62 214 92V128Z" fill="${WOOD}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M60 54C74 47 80 47 88 47H152C160 47 166 47 180 54L184 66H56Z" fill="${WOOD_LIGHT}" opacity=".8"/>
  <path d="M34 72H206M28 98H212" stroke="${WOOD_DARK}" stroke-width="3.5"/>
  <path d="M26 128V92C26 72 36 56 54 49V128Z" fill="${GOLD}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M214 128V92C214 72 204 56 186 49V128Z" fill="${GOLD}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M32 112V92C32 78 36 66 42 60" fill="none" stroke="${GOLD_LIGHT}" stroke-width="5" stroke-linecap="round"/>
  <path d="M192 54C201 60 207 72 208 84" fill="none" stroke="${GOLD_DARK}" stroke-width="5" stroke-linecap="round"/>
  ${rivet(42, 84)}${rivet(198, 84)}
  <rect x="20" y="110" width="200" height="18" rx="7" fill="${GOLD}" stroke="${INK}" stroke-width="4"/>
  <rect x="27" y="113" width="186" height="5" rx="2.5" fill="${GOLD_LIGHT}"/>
  <path d="M106 102h28a4 4 0 0 1 4 4v28a18 18 0 0 1-36 0v-28a4 4 0 0 1 4-4z" fill="${GOLD}" stroke="${INK}" stroke-width="4"/>
  <circle cx="120" cy="128" r="7" fill="${GOLD_LIGHT}" stroke="${GOLD_DARK}" stroke-width="2.4"/>
</svg>`;

const SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0c1 7 4 10 12 12-8 2-11 5-12 12-1-7-4-10-12-12 8-2 11-5 12-12z" fill="#fff6c2"/></svg>';

export function chestHTML() {
  return `<div class="gc" role="img" aria-label="Cofre del tesoro">
  <div class="gc-rays"><div class="gc-rays-i"></div></div>
  <div class="gc-glow"></div>
  <div class="gc-floor"></div>
  <div class="gc-box">
    <div class="gc-layer gc-lid-in">${CHEST_LID_INSIDE}</div>
    <div class="gc-layer gc-light"></div>
    <div class="gc-layer gc-treasure">${CHEST_TREASURE}</div>
    <div class="gc-layer gc-base">${CHEST_BASE}</div>
    <div class="gc-layer gc-lid">${CHEST_LID}</div>
  </div>
  <span class="gc-spark gc-s1">${SPARK}</span>
  <span class="gc-spark gc-s2">${SPARK}</span>
  <span class="gc-spark gc-s3">${SPARK}</span>
</div>`;
}

const chestRuns = new WeakMap();
const FLIP = (deg) => `perspective(640px) rotateX(${deg}deg)`;

function chestBurst(root) {
  try {
    const r = root.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height * 0.5, {
      count: 42,
      emoji: ['⭐'],
      emojiRatio: 0.8,
      colors: ['#ffd23f', '#ffe88f', '#ff9f43', '#ffffff'],
      power: 1.15,
    });
  } catch { /* ignore */ }
}

async function doOpenChest(root) {
  if (root.classList.contains('is-open')) return;
  const q = (s) => root.querySelector(s);
  const box = q('.gc-box');
  const lid = q('.gc-lid');
  const lidIn = q('.gc-lid-in');
  if (!box || !lid || !lidIn) return;

  // Stops the idle loops, so the scripted shake starts from the rest pose.
  root.classList.add('is-opening');

  if (prefersReducedMotion()) {
    root.classList.add('is-open');
    root.classList.remove('is-opening');
    chestBurst(root);
    await run(box, [{ opacity: 0.35 }, { opacity: 1 }], { duration: 220 });
    return;
  }

  const SHAKE = 620;
  const LID_OFF = 150;
  const LID_ON = 330;

  // Shake with growing amplitude, ending in a squash that loads the "spring".
  const frames = [];
  const N = 22;
  for (let i = 0; i <= N; i++) {
    const k = Math.pow(i / N, 1.5);
    const dir = i % 2 ? 1 : -1;
    const deg = i === N ? 0 : dir * (0.8 + 7.2 * k);
    const x = i === N ? 0 : dir * (0.5 + 5 * k);
    const y = i === N ? 6 : -Math.abs(dir) * 3 * k * (i % 4 === 1 ? 1 : 0);
    const sy = i === N ? 0.9 : 1 - 0.03 * k;
    const sx = i === N ? 1.07 : 1 + 0.02 * k;
    frames.push({ transform: `translate(${x.toFixed(2)}px,${y.toFixed(2)}px) rotate(${deg.toFixed(2)}deg) scale(${sx.toFixed(3)},${sy.toFixed(3)})` });
  }
  const glow = q('.gc-glow');
  const shakeAnim = play(box, frames, { duration: SHAKE, fill: 'forwards' });
  const glowAnim = glow ? play(glow, [
    { opacity: 0.6, transform: 'translate(-50%,-50%) scale(1)' },
    { opacity: 1, transform: 'translate(-50%,-50%) scale(1.3)' },
  ], { duration: SHAKE, easing: 'ease-in', fill: 'forwards' }) : null;
  await ended(shakeAnim, SHAKE);

  // Lid: the closed face folds to edge-on, then the inside face springs up past its rest
  // angle and settles. (A single element can't do it: the two faces are different drawings.)
  const lidOff = play(lid, [{ transform: FLIP(0) }, { transform: FLIP(90) }], { duration: LID_OFF, easing: 'ease-in', fill: 'forwards' });
  cancel(shakeAnim);
  const pop = play(box, [
    { transform: 'translateY(6px) scale(1.07,.9)', easing: 'cubic-bezier(.2,.8,.3,1)' },
    { transform: 'translateY(-10px) scale(.95,1.08)', offset: 0.35, easing: 'ease-in-out' },
    { transform: 'translateY(2px) scale(1.03,.97)', offset: 0.7, easing: 'ease-out' },
    { transform: 'translateY(0) scale(1,1)' },
  ], { duration: LID_OFF + LID_ON });
  await ended(lidOff, LID_OFF);

  root.classList.add('is-open');
  root.classList.remove('is-opening');
  chestBurst(root);
  const treasure = q('.gc-treasure');
  const rays = q('.gc-rays');
  const light = q('.gc-light');
  const settled = [
    run(lidIn, [
      { transform: FLIP(90), easing: 'cubic-bezier(.2,.8,.4,1)' },
      { transform: FLIP(6), offset: 0.55, easing: 'ease-in-out' },
      { transform: FLIP(32), offset: 0.82, easing: 'ease-in-out' },
      { transform: FLIP(26) },
    ], { duration: LID_ON }),
  ];
  if (treasure) {
    settled.push(run(treasure, [
      { transform: 'translateY(26px) scale(.8)', opacity: 0, easing: 'cubic-bezier(.2,.9,.3,1.5)' },
      { transform: 'translateY(0) scale(1)', opacity: 1 },
    ], { duration: LID_ON }));
  }
  if (rays) settled.push(run(rays, [{ opacity: 0 }, { opacity: 1 }], { duration: LID_ON, easing: 'ease-out' }));
  if (light) settled.push(run(light, [{ opacity: 0 }, { opacity: 1 }], { duration: LID_ON, easing: 'ease-out' }));
  await Promise.all(settled);
  cancel(lidOff);
  cancel(glowAnim);
  cancel(pop);
}

const runOpenChest = safely(doOpenChest);

export function openChest(rootEl) {
  try {
    if (!isEl(rootEl)) return Promise.resolve();
    const running = chestRuns.get(rootEl);
    if (running) return running;
    const p = runOpenChest(rootEl);
    chestRuns.set(rootEl, p);
    return p;
  } catch {
    return Promise.resolve();
  }
}

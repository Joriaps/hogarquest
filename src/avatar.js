// HogarQuest - generador de avatares SVG (sin dependencias).
// Todas las figuras se dibujan en un viewBox 0 0 100 100.

export const PART_LABELS = {
  skin: 'Piel',
  hair: 'Pelo',
  hairColor: 'Color de pelo',
  eyes: 'Ojos',
  mouth: 'Boca',
  accessory: 'Accesorio',
  bg: 'Fondo',
};

export const AVATAR_PARTS = {
  skin: [
    { id: 'porcelana', label: 'Porcelana', value: '#FFE6D5' },
    { id: 'claro', label: 'Claro', value: '#FAD4B8' },
    { id: 'melocoton', label: 'Melocotón', value: '#F2C29E' },
    { id: 'dorado', label: 'Dorado', value: '#E3AC7F' },
    { id: 'canela', label: 'Canela', value: '#C98E62' },
    { id: 'moreno', label: 'Moreno', value: '#A86F48' },
    { id: 'oscuro', label: 'Oscuro', value: '#87543A' },
    { id: 'ebano', label: 'Ébano', value: '#64402C' },
  ],
  hair: [
    { id: 'none', label: 'Calvo' },
    { id: 'short', label: 'Corto' },
    { id: 'long', label: 'Largo' },
    { id: 'curly', label: 'Rizado' },
    { id: 'ponytail', label: 'Coleta' },
    { id: 'spiky', label: 'De punta' },
    { id: 'buns', label: 'Moños' },
    { id: 'mohawk', label: 'Cresta' },
    { id: 'bob', label: 'Melenita' },
    { id: 'pigtails', label: 'Dos coletas' },
  ],
  hairColor: [
    { id: 'brown', label: 'Castaño', value: '#6B4226' },
    { id: 'black', label: 'Negro', value: '#2E2629' },
    { id: 'blonde', label: 'Rubio', value: '#F4CB5A' },
    { id: 'red', label: 'Pelirrojo', value: '#D9642E' },
    { id: 'chestnut', label: 'Castaño claro', value: '#A8703F' },
    { id: 'white', label: 'Blanco', value: '#E4E4EE' },
    { id: 'blue', label: 'Azul', value: '#4A8FF0' },
    { id: 'pink', label: 'Rosa', value: '#FF7EB8' },
    { id: 'green', label: 'Verde', value: '#45C97A' },
    { id: 'purple', label: 'Morado', value: '#9B6CF0' },
  ],
  eyes: [
    { id: 'normal', label: 'Normales' },
    { id: 'happy', label: 'Felices' },
    { id: 'wink', label: 'Guiño' },
    { id: 'star', label: 'Estrellas' },
    { id: 'sleepy', label: 'Dormilón' },
    { id: 'big', label: 'Grandes' },
    { id: 'heart', label: 'Corazones' },
  ],
  mouth: [
    { id: 'smile', label: 'Sonrisa' },
    { id: 'grin', label: 'Carcajada' },
    { id: 'tongue', label: 'Lengua' },
    { id: 'o', label: 'Sorpresa' },
    { id: 'cat', label: 'Gatito' },
    { id: 'teeth', label: 'Dientes' },
    { id: 'smirk', label: 'Pícara' },
  ],
  accessory: [
    { id: 'none', label: 'Ninguno' },
    { id: 'crown', label: 'Corona' },
    { id: 'cap', label: 'Gorra' },
    { id: 'bow', label: 'Lazo' },
    { id: 'glasses', label: 'Gafas' },
    { id: 'sunglasses', label: 'Gafas de sol' },
    { id: 'headphones', label: 'Cascos' },
    { id: 'wizard', label: 'Sombrero de mago' },
    { id: 'flower', label: 'Flor' },
    { id: 'catEars', label: 'Orejas de gato' },
    { id: 'party', label: 'Gorro de fiesta' },
    { id: 'halo', label: 'Aureola' },
  ],
  bg: [
    { id: 'sky', label: 'Cielo', value: '#7FD3F7' },
    { id: 'sun', label: 'Sol', value: '#FFD166' },
    { id: 'bubblegum', label: 'Chicle', value: '#FF9EC4' },
    { id: 'mint', label: 'Menta', value: '#8FE3C4' },
    { id: 'lilac', label: 'Lila', value: '#C9B2F5' },
    { id: 'coral', label: 'Coral', value: '#FF9B85' },
    { id: 'lime', label: 'Lima', value: '#B6E36A' },
    { id: 'orange', label: 'Naranja', value: '#FFAD5C' },
    { id: 'ocean', label: 'Océano', value: '#7C9CFF' },
    { id: 'turquoise', label: 'Turquesa', value: '#5ED8D0' },
    { id: 'lemon', label: 'Limón', value: '#FFF07A' },
    { id: 'peach', label: 'Melocotón', value: '#FFC9A8' },
  ],
};

const DEFAULTS = {
  skin: 'claro',
  hair: 'short',
  hairColor: 'brown',
  eyes: 'normal',
  mouth: 'smile',
  accessory: 'none',
  bg: 'sky',
};

const PART_KEYS = Object.keys(DEFAULTS);

export function defaultAvatar() {
  return { ...DEFAULTS };
}

export function randomAvatar() {
  const out = {};
  for (const k of PART_KEYS) {
    const list = AVATAR_PARTS[k];
    out[k] = list[Math.floor(Math.random() * list.length)].id;
  }
  return out;
}

// ---------------------------------------------------------------- utilidades

function normalize(cfg) {
  const src = cfg && typeof cfg === 'object' ? cfg : {};
  const out = {};
  for (const k of PART_KEYS) {
    const v = src[k];
    out[k] = AVATAR_PARTS[k].some((p) => p.id === v) ? v : DEFAULTS[k];
  }
  return out;
}

function valueOf(part, id) {
  const e = AVATAR_PARTS[part].find((p) => p.id === id);
  return (e && e.value) || AVATAR_PARTS[part].find((p) => p.id === DEFAULTS[part]).value;
}

const f = (v) => +v.toFixed(2);

// Oscurece (amt < 0) o aclara (amt > 0) un color hex.
function shade(hex, amt) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return hex;
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const t = amt < 0 ? 0 : 255;
    return Math.round(c + (t - c) * Math.abs(amt));
  });
  return '#' + ch.map((c) => c.toString(16).padStart(2, '0')).join('');
}

// Refleja horizontalmente un path con solo comandos absolutos M/L/C/Q/Z.
function mirror(d) {
  let i = 0;
  return d.replace(/-?\d*\.?\d+/g, (m) => (i++ % 2 === 0 ? String(f(100 - parseFloat(m))) : m));
}

function starPoints(cx, cy, R, r, rot = 0) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = ((-90 + rot + i * 36) * Math.PI) / 180;
    const rad = i % 2 === 0 ? R : r;
    pts.push(`${f(cx + rad * Math.cos(a))},${f(cy + rad * Math.sin(a))}`);
  }
  return pts.join(' ');
}

function heartPath(cx, cy, s) {
  return (
    `M${f(cx)} ${f(cy + s)} ` +
    `C${f(cx - s * 1.7)} ${f(cy - s * 0.15)} ${f(cx - s * 0.95)} ${f(cy - s * 1.45)} ${f(cx)} ${f(cy - s * 0.45)} ` +
    `C${f(cx + s * 0.95)} ${f(cy - s * 1.45)} ${f(cx + s * 1.7)} ${f(cy - s * 0.15)} ${f(cx)} ${f(cy + s)} Z`
  );
}

// Dibuja una unión de formas con un único contorno exterior:
// primero con trazo grueso y después solo relleno encima.
function blob(shapes, fill, line, sw = 1.6) {
  const s = shapes.join('');
  return (
    `<g fill="${fill}" stroke="${line}" stroke-width="${sw * 2}" stroke-linejoin="round">${s}</g>` +
    `<g fill="${fill}" stroke="none">${s}</g>`
  );
}

let counter = 0;
function uid() {
  counter = (counter + 1) % 1e6;
  return 'hqa' + counter.toString(36) + Math.random().toString(36).slice(2, 8);
}

const INK = '#2E1F27';
const SW = 1.6; // grosor de contorno común

// ---------------------------------------------------------------- pelo

const SHINE = '<path d="M33 31 Q37 25.5 44 23.8" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="2.2" stroke-linecap="round"/>';

function hairParts(id, hc) {
  const hl = shade(hc, -0.32);
  const attr = `fill="${hc}" stroke="${hl}" stroke-width="${SW}" stroke-linejoin="round"`;
  const p = (d) => `<path d="${d}" ${attr}/>`;
  const tie = (cx, cy) =>
    `<circle cx="${cx}" cy="${cy}" r="3.4" fill="#FF5C8A" stroke="#C93A66" stroke-width="1.3"/>`;

  // flequillo con raya al medio (reutilizado)
  const centerPart =
    'M23.5 53 C21 33 33 20.5 50 20.5 C67 20.5 79 33 76.5 53 C74 45 69 38.5 61 35.5 C56 33.5 52 31 50 28 C48 31 44 33.5 39 35.5 C31 38.5 26 45 23.5 53 Z';

  switch (id) {
    case 'none':
      return {
        back: '',
        front:
          '<ellipse cx="39" cy="33" rx="6.5" ry="3" fill="#fff" fill-opacity=".3" transform="rotate(-28 39 33)"/>',
      };
    case 'short':
      return {
        back: '',
        front:
          p('M23.5 53 C21 33 33 20.5 50 20.5 C67 20.5 79 33 76.5 53 C75 47 73 43 69.5 40 C63 41.5 55 40.5 48 35.5 C44 39.5 37 41.5 30.5 41 C27 44.5 24.5 48 23.5 53 Z') +
          SHINE,
      };
    case 'long': {
      const lock = 'M23.5 48 C21.5 59 21 69 23 78 C26.5 74 28.5 65 28.5 55 C27.8 51 26 49 23.5 48 Z';
      return {
        back: p('M22 46 C21 27 34 17 50 17 C66 17 79 27 78 46 L79.5 80 C79.5 86 73 88 67 85 L33 85 C27 88 20.5 86 20.5 80 Z'),
        front: p(centerPart) + p(lock) + p(mirror(lock)) + SHINE,
      };
    }
    case 'curly': {
      const back = [];
      for (const a of [200, 175, 150, 125, 100, 80, 55, 30, 5, -20]) {
        const r = (a * Math.PI) / 180;
        back.push(`<circle cx="${f(50 + 26 * Math.cos(r))}" cy="${f(45 - 26 * Math.sin(r))}" r="9"/>`);
      }
      back.push('<ellipse cx="50" cy="42" rx="25" ry="20"/>');
      const front = [
        [28.5, 43, 6],
        [34, 36, 6.5],
        [42, 31.5, 6.5],
        [50.5, 30.5, 6.5],
        [59, 31.5, 6.5],
        [66.5, 36, 6.5],
        [71.5, 43, 6],
      ].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`);
      front.push('<path d="M30 37 C30 28 38 23.5 50 23.5 C62 23.5 70 28 70 37 Q50 31 30 37 Z"/>');
      const curl = (x, y) =>
        `<path d="M${x - 2} ${y + 1} Q${x - 2} ${y - 2} ${x + 0.5} ${y - 2} Q${x + 2.5} ${y - 1.5} ${x + 2} ${y + 0.5}" fill="none" stroke="${hl}" stroke-width="1.2" stroke-linecap="round"/>`;
      return {
        back: blob(back, hc, hl, SW) + curl(22, 38) + curl(76, 37) + curl(30, 20),
        front: blob(front, hc, hl, SW) + curl(44, 29) + curl(60, 32) + curl(35, 37),
      };
    }
    case 'ponytail':
      return {
        back: p('M61 22 C78 13 93 26 88.5 45 C86 57 80 65 73.5 71 C77 61 78 51 74.5 43 C71.5 36.5 67 32 61 30 Z'),
        front:
          p('M23.5 53 C21 33 33 20.5 50 20.5 C67 20.5 79 33 76.5 53 C74.5 46 71 40.5 65 37 C56 39.5 43 38.5 34 33.5 C29 38.5 25.5 45 23.5 53 Z') +
          tie(66, 22.8) +
          SHINE,
      };
    case 'spiky':
      return {
        back: '',
        front: p(
          'M23.5 53 C21.5 41 23.5 33 28.5 27.5 L24 17 L35.5 21 L38.5 9.5 L47.5 17 L54 6.5 L59 17.5 L69.5 12.5 L69.5 24 C75.5 30 78.5 40 76.5 53 C74.5 46.5 71.5 42.5 67.5 40 L63.5 35 L58 40.5 L52 34.5 L46 40.5 L40 35 L34.5 41 C30 43 26 47 23.5 53 Z'
        ),
      };
    case 'buns': {
      const bun = (cx) =>
        `<circle cx="${cx}" cy="23.5" r="10" ${attr}/>` +
        `<path d="M${cx - 5} ${21} Q${cx} ${16.5} ${cx + 5} ${21.5}" fill="none" stroke="${hl}" stroke-width="1.2" stroke-linecap="round"/>`;
      return {
        back: bun(28.5) + bun(71.5),
        front: p(centerPart) + SHINE,
      };
    }
    case 'mohawk':
      return {
        back: '',
        front:
          `<path d="M26 47 C26 33 36 25.5 50 25.5 C64 25.5 74 33 74 47 C66 41 34 41 26 47 Z" fill="${hc}" fill-opacity=".28"/>` +
          p('M43 40 C41 30 41 20 42.5 11.5 L46.5 16.5 L49.5 4.5 L53.5 15 L57.5 9 C59.5 18 59.5 30 57 40 C54 38 46 38 43 40 Z'),
      };
    case 'bob':
      return {
        back: p('M21 50 C19 28 33 18 50 18 C67 18 81 28 79 50 L80 68 C80 72.5 76 74.5 72 72 L28 72 C24 74.5 20 72.5 20 68 Z'),
        front:
          p('M22.5 56 C21 34 33 20 50 20 C67 20 79 34 77.5 56 L77.5 67 C77.5 70 74 71 72 69 C72 59 72 50 70 42 C62 44.5 38 44.5 30 42 C28 50 28 59 28 69 C26 71 22.5 70 22.5 67 Z') +
          SHINE,
      };
    case 'pigtails': {
      const tail = 'M27 38 C12 33 5.5 49 9.5 63 C11.5 69.5 15.5 72 19 74 C17 64 19 52 25.5 45.5 Z';
      return {
        back: p(tail) + p(mirror(tail)),
        front: p(centerPart) + tie(24.5, 41) + tie(75.5, 41) + SHINE,
      };
    }
    default:
      return hairParts('short', hc);
  }
}

// ---------------------------------------------------------------- ojos

const EYE_L = 40;
const EYE_R = 60;
const EYE_Y = 54;

function eyeNormal(cx) {
  return (
    `<ellipse cx="${cx}" cy="${EYE_Y}" rx="3.1" ry="3.9" fill="${INK}"/>` +
    `<circle cx="${cx + 1}" cy="${EYE_Y - 1.4}" r="1.15" fill="#fff"/>`
  );
}
function eyeArc(cx) {
  return `<path d="M${cx - 4} ${EYE_Y + 1.6} Q${cx} ${EYE_Y - 4} ${cx + 4} ${EYE_Y + 1.6}" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
}

function eyesSVG(id) {
  switch (id) {
    case 'happy':
      return eyeArc(EYE_L) + eyeArc(EYE_R);
    case 'wink':
      return eyeNormal(EYE_L) + eyeArc(EYE_R);
    case 'star':
      return [EYE_L, EYE_R]
        .map(
          (cx) =>
            `<polygon points="${starPoints(cx, EYE_Y, 5.2, 2.3)}" fill="#FFC83D" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>` +
            `<circle cx="${cx + 1}" cy="${EYE_Y - 1.2}" r="0.9" fill="#fff"/>`
        )
        .join('');
    case 'sleepy':
      return [EYE_L, EYE_R]
        .map(
          (cx) =>
            `<path d="M${cx - 3.5} ${EYE_Y} A3.5 3.5 0 0 0 ${cx + 3.5} ${EYE_Y} Z" fill="${INK}"/>` +
            `<path d="M${cx - 4.6} ${EYE_Y} L${cx + 4.6} ${EYE_Y}" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`
        )
        .join('');
    case 'big':
      return [EYE_L, EYE_R]
        .map(
          (cx) =>
            `<ellipse cx="${cx}" cy="${EYE_Y}" rx="5.2" ry="5.8" fill="#fff" stroke="${INK}" stroke-width="1.3"/>` +
            `<circle cx="${cx + 0.3}" cy="${EYE_Y + 0.8}" r="3.5" fill="${INK}"/>` +
            `<circle cx="${cx + 1.5}" cy="${EYE_Y - 0.6}" r="1.4" fill="#fff"/>` +
            `<circle cx="${cx - 0.9}" cy="${EYE_Y + 2.2}" r="0.7" fill="#fff"/>`
        )
        .join('');
    case 'heart':
      return [EYE_L, EYE_R]
        .map(
          (cx) =>
            `<path d="${heartPath(cx, EYE_Y, 3.6)}" fill="#FF4D6D" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>` +
            `<circle cx="${cx - 1.4}" cy="${EYE_Y - 1.6}" r="0.9" fill="#fff"/>`
        )
        .join('');
    case 'normal':
    default:
      return eyeNormal(EYE_L) + eyeNormal(EYE_R);
  }
}

// ---------------------------------------------------------------- boca

function mouthSVG(id) {
  const line = (d, w = 2.2) =>
    `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
  switch (id) {
    case 'grin':
      return (
        `<path d="M42.5 64.5 Q50 65.5 57.5 64.5 Q57 73.5 50 73.5 Q43 73.5 42.5 64.5 Z" fill="${INK}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>` +
        `<path d="M45.3 71 Q50 67.6 54.7 71 Q53 73.3 50 73.3 Q47 73.3 45.3 71 Z" fill="#FF7A8A"/>`
      );
    case 'tongue':
      return (
        `<path d="M46.5 67.2 L53.5 67.2 Q54.2 73.8 50 73.8 Q45.8 73.8 46.5 67.2 Z" fill="#FF7A8A" stroke="${INK}" stroke-width="1.3" stroke-linejoin="round"/>` +
        `<path d="M50 68.5 L50 71.2" stroke="#D9485F" stroke-width="1" stroke-linecap="round"/>` +
        line('M43 65 Q50 70.5 57 65')
      );
    case 'o':
      return (
        `<ellipse cx="50" cy="67.5" rx="3.2" ry="3.8" fill="${INK}"/>` +
        `<ellipse cx="50" cy="69.4" rx="1.9" ry="1.2" fill="#FF7A8A"/>`
      );
    case 'cat':
      return line('M43 65.5 Q46.5 69.8 50 65.8 Q53.5 69.8 57 65.5', 2);
    case 'teeth':
      return (
        `<path d="M41.5 64 Q50 65 58.5 64 Q58 74 50 74 Q42 74 41.5 64 Z" fill="${INK}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>` +
        `<path d="M42.6 64.9 Q50 65.9 57.4 64.9 L57.1 67.4 Q50 68.4 42.9 67.4 Z" fill="#fff"/>` +
        `<path d="M50 65.6 L50 68" stroke="${INK}" stroke-width=".8" stroke-opacity=".35"/>` +
        `<path d="M45.6 71.6 Q50 69.4 54.4 71.6 Q52.5 73.5 50 73.5 Q47.5 73.5 45.6 71.6 Z" fill="#FF7A8A"/>`
      );
    case 'smirk':
      return line('M44 66.5 Q51 69.5 56.5 64.5') + line('M55.6 63.4 Q57.6 64.3 57.6 66.2', 1.4);
    case 'smile':
    default:
      return line('M43.5 65 Q50 71.5 56.5 65');
  }
}

// ---------------------------------------------------------------- accesorios

function accessoryParts(id, hc) {
  switch (id) {
    case 'crown': {
      const gold = '#FFD23F';
      const goldLine = '#C98A00';
      return {
        back: '',
        front:
          `<g transform="translate(0 -3)">` +
          `<path d="M33 26 L31 10 L41 18 L50 6 L59 18 L69 10 L67 26 Q50 29.5 33 26 Z" fill="${gold}" stroke="${goldLine}" stroke-width="${SW}" stroke-linejoin="round"/>` +
          `<path d="M33.6 22 Q50 25.2 66.4 22" fill="none" stroke="${goldLine}" stroke-width="1.1" stroke-opacity=".6"/>` +
          `<circle cx="31" cy="10" r="2" fill="${gold}" stroke="${goldLine}" stroke-width="1.2"/>` +
          `<circle cx="50" cy="6" r="2" fill="${gold}" stroke="${goldLine}" stroke-width="1.2"/>` +
          `<circle cx="69" cy="10" r="2" fill="${gold}" stroke="${goldLine}" stroke-width="1.2"/>` +
          `<circle cx="50" cy="19.5" r="2.5" fill="#FF4D6D" stroke="#B3243F" stroke-width="1"/>` +
          `<circle cx="40.5" cy="21.5" r="1.7" fill="#4DA3FF" stroke="#2667B8" stroke-width=".9"/>` +
          `<circle cx="59.5" cy="21.5" r="1.7" fill="#4DD599" stroke="#1F8F5C" stroke-width=".9"/>` +
          `</g>`,
      };
    }
    case 'cap': {
      const c = '#FF5A5F';
      const cl = shade(c, -0.35);
      return {
        back: '',
        front:
          `<path d="M23 42 C23 24 35 14.5 50 14.5 C65 14.5 77 24 77 42 Q50 36.5 23 42 Z" fill="${c}" stroke="${cl}" stroke-width="${SW}" stroke-linejoin="round"/>` +
          `<path d="M50 15 Q46.5 26 45.5 38" fill="none" stroke="${cl}" stroke-width="1.1" stroke-opacity=".6"/>` +
          `<path d="M50 15 Q53.5 26 54.5 38" fill="none" stroke="${cl}" stroke-width="1.1" stroke-opacity=".6"/>` +
          `<path d="M21.5 42.5 Q50 35 78.5 42.5 Q81 46.5 77 48.5 Q50 42 23 48.5 Q19 46.5 21.5 42.5 Z" fill="${shade(c, -0.15)}" stroke="${cl}" stroke-width="${SW}" stroke-linejoin="round"/>` +
          `<circle cx="50" cy="15" r="2.2" fill="${c}" stroke="${cl}" stroke-width="1.2"/>` +
          `<polygon points="${starPoints(50, 29, 4, 1.8)}" fill="#FFE066" stroke="${cl}" stroke-width=".8" stroke-linejoin="round"/>`,
      };
    }
    case 'bow': {
      const c = '#FF5C8A';
      const cl = '#C2185B';
      return {
        back: '',
        front:
          `<g transform="rotate(18 70 25)">` +
          `<path d="M70 25 C62 15 54.5 19 56.5 25 C54.5 31 62 35 70 25 Z" fill="${c}" stroke="${cl}" stroke-width="${SW}" stroke-linejoin="round"/>` +
          `<path d="M70 25 C78 15 85.5 19 83.5 25 C85.5 31 78 35 70 25 Z" fill="${c}" stroke="${cl}" stroke-width="${SW}" stroke-linejoin="round"/>` +
          `<path d="M60 22.5 Q62 25 60 27.5 M80 22.5 Q78 25 80 27.5" fill="none" stroke="${cl}" stroke-width="1" stroke-opacity=".6" stroke-linecap="round"/>` +
          `<ellipse cx="70" cy="25" rx="3.2" ry="3.6" fill="${shade(c, 0.15)}" stroke="${cl}" stroke-width="${SW}"/>` +
          `</g>`,
      };
    }
    case 'glasses': {
      const c = '#2F3A8F';
      return {
        back: '',
        front:
          `<g fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round">` +
          `<circle cx="${EYE_L}" cy="${EYE_Y}" r="7.3" fill="#fff" fill-opacity=".18"/>` +
          `<circle cx="${EYE_R}" cy="${EYE_Y}" r="7.3" fill="#fff" fill-opacity=".18"/>` +
          `<path d="M47.3 53 Q50 51 52.7 53"/>` +
          `<path d="M32.7 53 L26.5 51.5 M67.3 53 L73.5 51.5"/>` +
          `</g>` +
          `<path d="M35.5 50.5 Q37 48.5 39.5 48.2 M55.5 50.5 Q57 48.5 59.5 48.2" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1.2" stroke-linecap="round"/>`,
      };
    }
    case 'sunglasses': {
      const lens = 'M30.5 49.5 L48 49.5 Q48.5 59.5 40.5 60 Q31.5 60 30.5 49.5 Z';
      return {
        back: '',
        front:
          `<path d="M27 50.5 L31 50 M69 50 L73 50.5" stroke="#1E1E2A" stroke-width="2" stroke-linecap="round"/>` +
          `<path d="M47.5 51 Q50 49.2 52.5 51" fill="none" stroke="#1E1E2A" stroke-width="2" stroke-linecap="round"/>` +
          `<path d="${lens}" fill="#26262F" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/>` +
          `<path d="${mirror(lens)}" fill="#26262F" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/>` +
          `<path d="M34 51.8 L32.8 54.6 M37 51.8 L35.4 55.6 M54 51.8 L52.8 54.6 M57 51.8 L55.4 55.6" stroke="#fff" stroke-opacity=".55" stroke-width="1.1" stroke-linecap="round"/>`,
      };
    }
    case 'headphones': {
      const c = '#5B5BD6';
      const cl = shade(c, -0.35);
      return {
        back: '',
        front:
          `<path d="M24 50 C22 26 34 14.5 50 14.5 C66 14.5 78 26 76 50" fill="none" stroke="${cl}" stroke-width="5.6" stroke-linecap="round"/>` +
          `<path d="M24 50 C22 26 34 14.5 50 14.5 C66 14.5 78 26 76 50" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round"/>` +
          `<rect x="17.5" y="46.5" width="10" height="16" rx="4.5" fill="${c}" stroke="${cl}" stroke-width="${SW}"/>` +
          `<rect x="72.5" y="46.5" width="10" height="16" rx="4.5" fill="${c}" stroke="${cl}" stroke-width="${SW}"/>` +
          `<rect x="25" y="48.5" width="4" height="12" rx="2" fill="#FFD23F" stroke="${cl}" stroke-width="1.1"/>` +
          `<rect x="71" y="48.5" width="4" height="12" rx="2" fill="#FFD23F" stroke="${cl}" stroke-width="1.1"/>` +
          `<path d="M20 50 L20 56" stroke="#fff" stroke-opacity=".45" stroke-width="1.4" stroke-linecap="round"/>`,
      };
    }
    case 'wizard': {
      const c = '#6C4BD8';
      const cl = shade(c, -0.4);
      const st = (x, y, R, rot) =>
        `<polygon points="${starPoints(x, y, R, R * 0.45, rot)}" fill="#FFE066"/>`;
      return {
        back: '',
        front:
          `<path d="M31.5 26 C38 18 44 8 52 1.5 C54.5 0 57 1 55.5 3.5 C57 12 63 20 68.5 26 Z" fill="${c}" stroke="${cl}" stroke-width="${SW}" stroke-linejoin="round"/>` +
          st(45, 17, 3, 10) +
          st(55.5, 11, 2.2, -12) +
          st(58.5, 21, 1.8, 20) +
          `<circle cx="49" cy="9" r=".9" fill="#FFE066"/>` +
          `<path d="M32 23 Q50 27.5 68 23 L69.5 26.5 Q50 31 30.5 26.5 Z" fill="#FFD23F" stroke="${cl}" stroke-width="1.1" stroke-linejoin="round"/>` +
          `<ellipse cx="50" cy="27.5" rx="30" ry="5.2" fill="${c}" stroke="${cl}" stroke-width="${SW}"/>` +
          `<path d="M31.5 26 Q50 30 68.5 26" fill="none" stroke="${cl}" stroke-width="1" stroke-opacity=".5"/>`,
      };
    }
    case 'flower': {
      const cx = 29;
      const cy = 30;
      const petals = [];
      for (let i = 0; i < 5; i++) {
        const a = ((-90 + i * 72) * Math.PI) / 180;
        petals.push(`<circle cx="${f(cx + 4.2 * Math.cos(a))}" cy="${f(cy + 4.2 * Math.sin(a))}" r="3.7"/>`);
      }
      return {
        back: '',
        front:
          `<path d="M33 34 Q38 36 40 33.5 Q37 31 33 34 Z" fill="#5BC46A" stroke="#2F8A3D" stroke-width="1" stroke-linejoin="round"/>` +
          blob(petals, '#FF8AC8', '#D94C93', 1.2) +
          `<circle cx="${cx}" cy="${cy}" r="2.8" fill="#FFD23F" stroke="#D99A00" stroke-width="1"/>`,
      };
    }
    case 'catEars': {
      // diadema con orejas: la banda tapa la base de las orejas
      const outer = 'M26 34.5 L21 8 L41 19.5 Z';
      const inner = 'M28.3 29 L24.2 13.6 L36.4 21 Z';
      const band = 'M24.5 46 C24.5 26 36 18.5 50 18.5 C64 18.5 75.5 26 75.5 46';
      const fur = hc;
      const furLine = shade(fur, -0.32);
      const bandC = '#3D3A4F';
      const ear = (o, i) =>
        `<path d="${o}" fill="${fur}" stroke="${furLine}" stroke-width="${SW}" stroke-linejoin="round"/>` +
        `<path d="${i}" fill="#FFB3C7" stroke="none"/>`;
      return {
        back: '',
        front:
          ear(outer, inner) +
          ear(mirror(outer), mirror(inner)) +
          `<path d="${band}" fill="none" stroke="${bandC}" stroke-width="3.4" stroke-linecap="round"/>` +
          `<path d="M31 27 Q38 20.5 46 19.3" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1" stroke-linecap="round"/>`,
      };
    }
    case 'party': {
      const c = '#4DD599';
      const cl = shade(c, -0.4);
      return {
        back: '',
        front:
          `<g transform="rotate(14 50 22)">` +
          `<path d="M37.5 22 L50 -1 L62.5 22 Q50 25.5 37.5 22 Z" fill="${c}" stroke="${cl}" stroke-width="${SW}" stroke-linejoin="round"/>` +
          `<path d="M44.5 9.2 L47.6 3.4 L52.4 3.4 L55.5 9.2 Z" fill="#FFD23F"/>` +
          `<path d="M41 15.5 L43.1 11.6 L56.9 11.6 L59 15.5 Z" fill="#FF5C8A"/>` +
          `<circle cx="44" cy="19" r="1.2" fill="#fff"/><circle cx="55" cy="19.5" r="1.2" fill="#fff"/><circle cx="50" cy="13.6" r="1" fill="#fff"/>` +
          `<path d="M37.5 22 L50 -1 L62.5 22 Q50 25.5 37.5 22 Z" fill="none" stroke="${cl}" stroke-width="${SW}" stroke-linejoin="round"/>` +
          `<circle cx="50" cy="0" r="3.6" fill="#FF5C8A" stroke="#C2185B" stroke-width="1.2"/>` +
          `</g>`,
      };
    }
    case 'halo':
      return {
        back: '',
        front:
          `<ellipse cx="50" cy="10.5" rx="17" ry="4.6" fill="none" stroke="#C99A00" stroke-width="5"/>` +
          `<ellipse cx="50" cy="10.5" rx="17" ry="4.6" fill="none" stroke="#FFE066" stroke-width="2.6"/>` +
          `<path d="M38 8.4 Q43 6.6 48 6.4" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="1" stroke-linecap="round"/>`,
      };
    case 'none':
    default:
      return { back: '', front: '' };
  }
}

// ---------------------------------------------------------------- avatar

export function avatarSVG(cfg, size = 96) {
  const c = normalize(cfg);
  const sz = Number(size) > 0 ? Number(size) : 96;
  const skin = valueOf('skin', c.skin);
  const hc = valueOf('hairColor', c.hairColor);
  const bg = valueOf('bg', c.bg);
  const skinLine = shade(skin, -0.3);
  const shirt = shade(bg, -0.28);
  const shirtLine = shade(bg, -0.45);
  const clip = uid();

  const hair = hairParts(c.hair, hc);
  const acc = accessoryParts(c.accessory, hc);

  const ear = 'M25.5 49.8 C21.5 49.8 19.8 52.6 19.8 55.2 C19.8 58 22 60.4 25.8 60.2 Z';
  const earInner = 'M24.6 52.6 Q22.4 55 24.6 57.6';

  const body =
    `<path d="M15 102 C15 88 30 82.5 50 82.5 C70 82.5 85 88 85 102 Z" fill="${shirt}" stroke="${shirtLine}" stroke-width="${SW}" stroke-linejoin="round"/>` +
    `<rect x="43" y="70" width="14" height="15" rx="5" fill="${shade(skin, -0.1)}" stroke="${skinLine}" stroke-width="${SW}"/>` +
    `<path d="M42 83.2 Q50 90 58 83.2" fill="none" stroke="${shirtLine}" stroke-width="${SW}" stroke-linecap="round"/>`;

  const ears =
    `<path d="${ear}" fill="${skin}" stroke="${skinLine}" stroke-width="${SW}" stroke-linejoin="round"/>` +
    `<path d="${mirror(ear)}" fill="${skin}" stroke="${skinLine}" stroke-width="${SW}" stroke-linejoin="round"/>` +
    `<path d="${earInner}" fill="none" stroke="${skinLine}" stroke-width="1.2" stroke-linecap="round"/>` +
    `<path d="${mirror(earInner)}" fill="none" stroke="${skinLine}" stroke-width="1.2" stroke-linecap="round"/>`;

  const head =
    `<ellipse cx="50" cy="53" rx="25" ry="26.5" fill="${skin}" stroke="${skinLine}" stroke-width="${SW}"/>` +
    `<ellipse cx="33.5" cy="62" rx="4.3" ry="2.7" fill="#FF6F91" fill-opacity=".38"/>` +
    `<ellipse cx="66.5" cy="62" rx="4.3" ry="2.7" fill="#FF6F91" fill-opacity=".38"/>` +
    `<path d="M48.2 60 Q50 61.8 51.8 60" fill="none" stroke="${skinLine}" stroke-width="1.5" stroke-linecap="round"/>`;

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${sz}" height="${sz}" role="img" aria-label="Avatar">` +
    `<defs><clipPath id="${clip}"><circle cx="50" cy="50" r="50"/></clipPath></defs>` +
    `<circle cx="50" cy="50" r="50" fill="${bg}"/>` +
    `<g clip-path="url(#${clip})">` +
    `<circle cx="50" cy="50" r="38" fill="#fff" fill-opacity=".18"/>` +
    acc.back +
    hair.back +
    body +
    ears +
    head +
    eyesSVG(c.eyes) +
    mouthSVG(c.mouth) +
    hair.front +
    acc.front +
    `</g>` +
    `</svg>`
  );
}

export function partPreviewSVG(part, id, cfg, size = 56) {
  const base = normalize(cfg);
  if (Object.prototype.hasOwnProperty.call(AVATAR_PARTS, part)) base[part] = id;
  return avatarSVG(base, size);
}

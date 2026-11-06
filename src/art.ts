// Art: bitmap font, palettes, procedural sprites, tiles and parallax backdrops.
// Everything is drawn in code; there are no image assets.
import { W, H, TAU, seeded, hash2 } from './core.ts';
import type { Decor, Platform, Solid, ThemeName, Water } from './types.ts';

export type Ctx = CanvasRenderingContext2D;

const FONT_SRC: Record<string, string> = {
  A: '01110 10001 10001 11111 10001 10001 10001', B: '11110 10001 10001 11110 10001 10001 11110',
  C: '01110 10001 10000 10000 10000 10001 01110', D: '11110 10001 10001 10001 10001 10001 11110',
  E: '11111 10000 10000 11110 10000 10000 11111', F: '11111 10000 10000 11110 10000 10000 10000',
  G: '01110 10001 10000 10111 10001 10001 01111', H: '10001 10001 10001 11111 10001 10001 10001',
  I: '01110 00100 00100 00100 00100 00100 01110', J: '00111 00010 00010 00010 00010 10010 01100',
  K: '10001 10010 10100 11000 10100 10010 10001', L: '10000 10000 10000 10000 10000 10000 11111',
  M: '10001 11011 10101 10101 10001 10001 10001', N: '10001 10001 11001 10101 10011 10001 10001',
  O: '01110 10001 10001 10001 10001 10001 01110', P: '11110 10001 10001 11110 10000 10000 10000',
  Q: '01110 10001 10001 10001 10101 10010 01101', R: '11110 10001 10001 11110 10100 10010 10001',
  S: '01111 10000 10000 01110 00001 00001 11110', T: '11111 00100 00100 00100 00100 00100 00100',
  U: '10001 10001 10001 10001 10001 10001 01110', V: '10001 10001 10001 10001 10001 01010 00100',
  W: '10001 10001 10001 10101 10101 10101 01010', X: '10001 10001 01010 00100 01010 10001 10001',
  Y: '10001 10001 01010 00100 00100 00100 00100', Z: '11111 00001 00010 00100 01000 10000 11111',
  0: '01110 10001 10011 10101 11001 10001 01110', 1: '00100 01100 00100 00100 00100 00100 01110',
  2: '01110 10001 00001 00010 00100 01000 11111', 3: '11110 00001 00001 01110 00001 00001 11110',
  4: '00010 00110 01010 10010 11111 00010 00010', 5: '11111 10000 11110 00001 00001 10001 01110',
  6: '00110 01000 10000 11110 10001 10001 01110', 7: '11111 00001 00010 00100 01000 01000 01000',
  8: '01110 10001 10001 01110 10001 10001 01110', 9: '01110 10001 10001 01111 00001 00010 01100',
  '.': '00000 00000 00000 00000 00000 01100 01100', ',': '00000 00000 00000 00000 01100 00100 01000',
  '!': '00100 00100 00100 00100 00100 00000 00100', '?': '01110 10001 00001 00010 00100 00000 00100',
  ':': '00000 01100 01100 00000 01100 01100 00000', '-': '00000 00000 00000 11111 00000 00000 00000',
  '+': '00000 00100 00100 11111 00100 00100 00000', '/': '00001 00010 00010 00100 01000 01000 10000',
  "'": '00100 00100 01000 00000 00000 00000 00000', '(': '00010 00100 01000 01000 01000 00100 00010',
  ')': '01000 00100 00010 00010 00010 00100 01000', '>': '01000 00100 00010 00001 00010 00100 01000',
  '<': '00010 00100 01000 10000 01000 00100 00010', '=': '00000 00000 11111 00000 11111 00000 00000',
  '&': '01100 10010 10100 01000 10101 10010 01101', '*': '00000 10001 01010 00100 01010 10001 00000',
  '#': '01010 11111 01010 01010 01010 11111 01010', '%': '11001 11010 00010 00100 01000 01011 10011',
};

export function mkCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}
export function ctx2d(c: HTMLCanvasElement): Ctx {
  const x = c.getContext('2d');
  if (!x) throw new Error('2D canvas unavailable');
  return x;
}

type Align = 'left' | 'center' | 'right';

class BitmapFont {
  private readonly chars = Object.keys(FONT_SRC);
  private readonly index: Record<string, number> = {};
  private readonly cache = new Map<string, HTMLCanvasElement>();
  constructor() { this.chars.forEach((ch, i) => { this.index[ch] = i; }); }

  private atlas(color: string): HTMLCanvasElement {
    let c = this.cache.get(color);
    if (c) return c;
    c = mkCanvas(this.chars.length * 6, 7);
    const x = ctx2d(c);
    x.fillStyle = color;
    this.chars.forEach((ch, i) => {
      FONT_SRC[ch].split(' ').forEach((row, y) => {
        for (let k = 0; k < 5; k++) if (row[k] === '1') x.fillRect(i * 6 + k, y, 1, 1);
      });
    });
    this.cache.set(color, c);
    return c;
  }

  width(s: string, scale = 1): number { return s.length ? (s.length * 6 - 1) * scale : 0; }

  private blit(c: Ctx, s: string, x: number, y: number, color: string, scale: number): void {
    const a = this.atlas(color);
    for (let i = 0; i < s.length; i++) {
      const idx = this.index[s[i]];
      if (idx === undefined) continue;
      c.drawImage(a, idx * 6, 0, 5, 7, x + i * 6 * scale, y, 5 * scale, 7 * scale);
    }
  }

  draw(c: Ctx, str: string | number, x: number, y: number, color = '#ffffff', scale = 1, align: Align = 'left', shadow: string | null = '#000000'): void {
    const s = String(str).toUpperCase();
    const w = this.width(s, scale);
    if (align === 'center') x -= Math.floor(w / 2);
    else if (align === 'right') x -= w;
    x = Math.round(x); y = Math.round(y);
    if (shadow) this.blit(c, s, x + scale, y + scale, shadow, scale);
    this.blit(c, s, x, y, color, scale);
  }

  /** Two-tone title lettering: top rows one colour, the rest another. */
  drawDuo(c: Ctx, str: string, x: number, y: number, top: string, bottom: string, scale: number, shadow = '#2a0606'): void {
    const s = str.toUpperCase();
    const w = this.width(s, scale);
    x = Math.round(x - Math.floor(w / 2)); y = Math.round(y);
    this.blit(c, s, x + scale, y + scale, shadow, scale);
    this.blit(c, s, x + scale, y + scale * 2, shadow, scale);
    this.blit(c, s, x, y, bottom, scale);
    c.save();
    c.beginPath(); c.rect(x - 2, y - 2, w + 4, 3 * scale + 2); c.clip();
    this.blit(c, s, x, y, top, scale);
    c.restore();
  }
}
export const Text = new BitmapFont();

// Tint override used for hit flashes: every sprite pixel drawn through R/pen turns this colour.
let TINT: string | null = null;
export function setTint(col: string | null): void { TINT = col; }

export function R(c: Ctx, x: number, y: number, w: number, h: number, col: string): void {
  c.fillStyle = TINT || col;
  c.fillRect(x, y, w, h);
}
export type Pen = (dx: number, dy: number, w: number, h: number, col: string) => void;
/** Facing-aware pen anchored at (sx, sy); dx is mirrored when f < 0. */
export function pen(c: Ctx, sx: number, sy: number, f: number): Pen {
  return (dx, dy, w, h, col) => {
    c.fillStyle = TINT || col;
    c.fillRect(f > 0 ? sx + dx : sx - dx - w, sy + dy, w, h);
  };
}
export function disc(c: Ctx, x: number, y: number, r: number, col: string): void {
  c.fillStyle = TINT || col;
  c.beginPath(); c.arc(x, y, Math.max(0.5, r), 0, TAU); c.fill();
}

export const GUN = '#aab3bd', GUNDK = '#4b525b';

export interface Palette {
  suit: string; dk: string; armor: string; armorLt: string; visor: string; boot: string; pack: string;
  scarf?: string; scarfDk?: string;
}
/** Kade, Vanguard commando: blue armour, amber visor, red scarf. */
export const PAL_PLAYER: Palette = {
  suit: '#3d7dca', dk: '#25508f', armor: '#1d2b53', armorLt: '#3b5590', visor: '#ffcf3a',
  boot: '#2a1d17', scarf: '#e8423f', scarfDk: '#a4262c', pack: '#28385f',
};
/** Crimson Legion trooper: red armour, single green optic. */
export const PAL_TROOPER: Palette = {
  suit: '#9b2d30', dk: '#621b22', armor: '#3b3d48', armorLt: '#62667a', visor: '#7dff6a',
  boot: '#1d1a1a', pack: '#2b2c34',
};
export const PAL_HEAVY: Palette = {
  suit: '#c2701c', dk: '#7c4410', armor: '#3b3d48', armorLt: '#62667a', visor: '#ff5a3a',
  boot: '#1d1a1a', pack: '#4a3a2a',
};

// Leg frames: [dx, dy, w, h, colour] where 0 = back leg, 1 = front leg, 2 = boot
type LegRect = [number, number, number, number, 0 | 1 | 2];
const LEGS: LegRect[][] = [
  [[-3, -12, 3, 10, 0], [-4, -2, 4, 2, 2], [1, -12, 3, 10, 1], [1, -2, 5, 2, 2]],
  [[-3, -12, 3, 5, 0], [-5, -8, 3, 5, 0], [-7, -4, 4, 2, 2], [1, -12, 3, 5, 1], [3, -8, 3, 6, 1], [4, -2, 4, 2, 2]],
  [[-2, -12, 3, 10, 0], [-3, -2, 4, 2, 2], [0, -12, 3, 5, 1], [1, -8, 3, 4, 1], [1, -5, 4, 2, 2]],
  [[0, -12, 3, 5, 0], [2, -8, 3, 6, 0], [3, -2, 4, 2, 2], [-2, -12, 3, 5, 1], [-4, -8, 3, 5, 1], [-6, -4, 4, 2, 2]],
  [[-1, -12, 3, 5, 0], [0, -8, 3, 4, 0], [0, -5, 4, 2, 2], [-1, -12, 3, 10, 1], [-1, -2, 4, 2, 2]],
];

export interface Aim { x: number; y: number; }
export interface HumanoidOpts {
  pal: Palette;
  /** -1 standing, 0..3 run cycle */
  leg: number;
  aim: Aim | null;
  head: 'player' | 'trooper';
  t: number;
  bob?: number;
  crouch?: boolean;
  throwing?: boolean;
}

/** Shared humanoid rig used by the hero and the Legion troopers. Feet at (sx, sy). */
export function drawHumanoid(c: Ctx, sx: number, sy: number, f: number, o: HumanoidOpts): void {
  const p = o.pal;
  const P = pen(c, sx, sy, f);
  const by = (o.crouch ? 6 : 0) + (o.bob || 0);
  if (o.crouch) {
    P(-3, -7, 3, 4, p.dk); P(-8, -3, 7, 3, p.dk); P(-10, -3, 3, 3, p.boot);
    P(0, -8, 6, 3, p.suit); P(4, -6, 3, 4, p.suit); P(4, -2, 5, 2, p.boot);
  } else {
    for (const r of LEGS[(o.leg | 0) + 1]) P(r[0], r[1], r[2], r[3], r[4] === 0 ? p.dk : r[4] === 1 ? p.suit : p.boot);
  }
  P(-6, -20 + by, 2, 7, p.pack);
  P(-4, -21 + by, 8, 8, p.suit);
  P(-3, -21 + by, 6, 5, p.armor);
  P(-3, -21 + by, 6, 1, p.armorLt);
  P(-4, -13 + by, 8, 2, p.armor);
  if (o.head === 'player') {
    P(-3, -28 + by, 7, 7, p.armor);
    P(-2, -28 + by, 5, 1, p.armorLt);
    P(1, -25 + by, 4, 2, p.visor);
    P(4, -25 + by, 1, 1, '#fff7c2');
    const fl = (o.t >> 3) & 1;
    const scarf = p.scarf ?? p.suit, scarfDk = p.scarfDk ?? p.dk;
    P(-5, -22 + by, 3, 2, scarf);
    P(-8, -22 + by + fl, 3, 2, scarf);
    P(-10, -21 + by - fl, 2, 2, scarfDk);
  } else {
    P(-3, -28 + by, 7, 7, p.armor);
    P(-3, -28 + by, 7, 2, p.armorLt);
    P(-1, -30 + by, 2, 2, p.suit);
    P(2, -25 + by, 2, 2, p.visor);
    P(0, -23 + by, 4, 1, '#16161c');
  }
  if (o.throwing) { P(-2, -30 + by, 3, 9, p.suit); P(-3, -33 + by, 4, 4, '#2f3a26'); return; }
  const a = o.aim;
  if (!a) { P(-1, -19 + by, 3, 7, p.suit); return; }
  if (a.y === 0) {
    P(0, -19 + by, 5, 3, p.suit); P(3, -19 + by, 9, 3, GUNDK); P(4, -19 + by, 7, 1, GUN); P(12, -19 + by, 3, 2, GUN);
  } else if (a.x === 0) {
    P(1, -24 + by, 3, 5, p.suit); P(2, -36 + by, 3, 12, GUNDK); P(2, -36 + by, 1, 10, GUN); P(2, -39 + by, 2, 3, GUN);
  } else if (a.y < 0) {
    P(1, -22 + by, 4, 3, p.suit);
    for (let i = 0; i < 11; i++) P(4 + i, -22 + by - i, 2, 2, i > 8 ? GUN : GUNDK);
  } else {
    P(1, -18 + by, 4, 3, p.suit);
    for (let i = 0; i < 11; i++) P(4 + i, -17 + by + i, 2, 2, i > 8 ? GUN : GUNDK);
  }
}

export function drawProne(c: Ctx, sx: number, sy: number, f: number, p: Palette, gun = true): void {
  const P = pen(c, sx, sy, f);
  P(-16, -4, 3, 4, p.boot);
  P(-14, -4, 10, 4, p.dk);
  P(-4, -6, 10, 6, p.suit);
  P(-2, -6, 7, 3, p.armor);
  P(-6, -7, 5, 2, p.pack);
  P(6, -8, 6, 6, p.armor);
  P(6, -8, 6, 1, p.armorLt);
  P(9, -6, 3, 2, p.visor);
  if (p.scarf) P(2, -8, 3, 2, p.scarf);
  if (gun) { P(8, -4, 3, 3, p.suit); P(10, -4, 10, 3, GUNDK); P(11, -4, 8, 1, GUN); P(19, -4, 3, 2, GUN); }
}

/** Curled somersault pose used while jumping. */
export function drawBall(c: Ctx, sx: number, sy: number, t: number, f: number, p: Palette): void {
  const cx = sx, cy = sy - 11;
  const a = t * 0.38 * f;
  const pt = (ang: number, r: number): [number, number] => [Math.round(cx + Math.cos(ang) * r), Math.round(cy + Math.sin(ang) * r)];
  R(c, cx - 5, cy - 5, 10, 10, p.dk);
  R(c, cx - 4, cy - 4, 8, 8, p.suit);
  const [hx, hy] = pt(a, 5); R(c, hx - 3, hy - 3, 6, 6, p.armor);
  const [vx, vy] = pt(a + 0.5 * f, 6); R(c, vx - 1, vy - 1, 2, 2, p.visor);
  const [kx, ky] = pt(a + Math.PI, 5); R(c, kx - 3, ky - 2, 6, 5, p.boot);
  const [gx, gy] = pt(a + Math.PI / 2, 5); R(c, gx - 2, gy - 2, 4, 4, GUNDK);
  if (p.scarf) { const [qx, qy] = pt(a - 2.2, 7); R(c, qx - 1, qy - 1, 3, 3, p.scarf); }
}

export function drawMuzzle(c: Ctx, x: number, y: number, big: boolean): void {
  const s = big ? 3 : 2;
  R(c, x - s, y - 1, s * 2 + 1, 3, '#ffd23f');
  R(c, x - 1, y - s, 3, s * 2 + 1, '#ffd23f');
  R(c, x - 1, y - 1, 3, 3, '#ffffff');
}

export function drawMedal(c: Ctx, x: number, y: number): void {
  R(c, x + 1, y, 5, 3, '#e8423f');
  R(c, x + 2, y, 1, 3, '#ffffff');
  R(c, x, y + 3, 7, 5, '#ffcf3a');
  R(c, x + 2, y + 4, 3, 3, '#b07a10');
}

export const WEAPON_STYLE: Record<string, { col: string; name: string }> = {
  N: { col: '#c8ced6', name: 'BLASTER' }, R: { col: '#ff5a4a', name: 'RAPID' }, W: { col: '#ff9a2a', name: 'WAVE' },
  L: { col: '#6af0ff', name: 'LANCE' }, H: { col: '#7aff6a', name: 'HOMING' }, S: { col: '#d68aff', name: 'SHIELD' },
  '1': { col: '#ffd23f', name: '1UP' },
};

export function drawBadge(c: Ctx, x: number, y: number, type: string, t: number): void {
  const st = WEAPON_STYLE[type] ?? WEAPON_STYLE.N;
  const glow = (t >> 3) & 1;
  R(c, x - 7, y - 5, 14, 11, '#10131a');
  R(c, x - 6, y - 6, 12, 13, '#10131a');
  R(c, x - 6, y - 5, 12, 11, glow ? st.col : '#ffffff');
  R(c, x - 5, y - 4, 10, 9, '#1b2030');
  Text.draw(c, type, x - 2, y - 3, st.col, 1, 'left', null);
}

// ---------------------------------------------------------------------------
// Tiles + parallax backdrops (pre-rendered once per theme)
// ---------------------------------------------------------------------------
interface ThemeStyle { sky: [number, string][]; pit: { a: string; b: string; y: number }; edge: string; }
const THEMES: Record<ThemeName, ThemeStyle> = {
  jungle: {
    sky: [[0, '#1b1035'], [0.4, '#4f2560'], [0.66, '#b64a4c'], [0.8, '#ec8f50'], [1, '#f7c67a']],
    pit: { a: '#2a5f8a', b: '#7fc4ff', y: H - 14 }, edge: '#3a2412',
  },
  foundry: {
    sky: [[0, '#0b0607'], [0.45, '#2f0f0b'], [0.75, '#6e2410'], [1, '#c4521c']],
    pit: { a: '#ff5a10', b: '#ffd23f', y: H - 16 }, edge: '#1c1f24',
  },
  hive: {
    sky: [[0, '#05030c'], [0.45, '#160a29'], [0.8, '#2e0f3c'], [1, '#4a1640']],
    pit: { a: '#4fb82a', b: '#c8ff7a', y: H - 14 }, edge: '#2a0a20',
  },
};

export interface Tiles { top: HTMLCanvasElement; fill: HTMLCanvasElement[]; edge: string; }
export interface ParallaxLayer { c: HTMLCanvasElement; f: number; P: number; }
export interface Backdrop { sky: HTMLCanvasElement; layers: ParallaxLayer[]; theme: ThemeName; tiles: Tiles; th: ThemeStyle; }

function makeTiles(theme: ThemeName): Tiles {
  const rnd = seeded(theme.length * 977 + 13);
  const top = mkCanvas(16, 16), fills = [mkCanvas(16, 16), mkCanvas(16, 16), mkCanvas(16, 16)];
  const T = ctx2d(top);
  const dot = (x: Ctx, px: number, py: number, col: string) => { x.fillStyle = col; x.fillRect(px, py, 1, 1); };
  const ri = (n: number) => (rnd() * n) | 0;
  if (theme === 'jungle') {
    for (const f of fills) {
      const x = ctx2d(f);
      x.fillStyle = '#6b4426'; x.fillRect(0, 0, 16, 16);
      for (let i = 0; i < 14; i++) dot(x, ri(16), ri(16), rnd() < 0.5 ? '#55351d' : '#80552f');
      if (rnd() < 0.6) {
        const sx = ri(10), sy = ri(10);
        x.fillStyle = '#7d7266'; x.fillRect(sx, sy, 5, 4);
        x.fillStyle = '#9a8f80'; x.fillRect(sx + 1, sy, 3, 1);
        x.fillStyle = '#5a5048'; x.fillRect(sx, sy + 3, 5, 1);
      }
    }
    T.fillStyle = '#6b4426'; T.fillRect(0, 0, 16, 16);
    for (let i = 0; i < 10; i++) dot(T, ri(16), 8 + ri(8), '#55351d');
    T.fillStyle = '#2f7a2c'; T.fillRect(0, 0, 16, 6);
    T.fillStyle = '#4fb043'; T.fillRect(0, 0, 16, 3);
    T.fillStyle = '#8fdc5a'; T.fillRect(0, 0, 16, 1);
    for (let x = 0; x < 16; x += 2) { T.fillStyle = '#2f7a2c'; T.fillRect(x, 6, 1, 1 + ((x * 7) % 3)); }
    T.fillStyle = '#9fe86a'; T.fillRect(3, 1, 1, 1); T.fillRect(11, 1, 1, 1);
  } else if (theme === 'foundry') {
    for (const f of fills) {
      const x = ctx2d(f);
      x.fillStyle = '#3a3f47'; x.fillRect(0, 0, 16, 16);
      x.fillStyle = '#2a2e34'; x.fillRect(0, 15, 16, 1); x.fillRect(15, 0, 1, 16);
      x.fillStyle = '#4a5059'; x.fillRect(0, 0, 16, 1); x.fillRect(0, 0, 1, 16);
      x.fillStyle = '#6c7480'; x.fillRect(2, 2, 1, 1); x.fillRect(13, 2, 1, 1); x.fillRect(2, 13, 1, 1); x.fillRect(13, 13, 1, 1);
      if (rnd() < 0.5) { x.fillStyle = '#5a3a2a'; x.fillRect(ri(10), ri(10), 3, 2); }
    }
    T.fillStyle = '#3a3f47'; T.fillRect(0, 0, 16, 16);
    T.fillStyle = '#8b95a3'; T.fillRect(0, 0, 16, 2);
    T.fillStyle = '#5c6470'; T.fillRect(0, 2, 16, 4);
    for (let x = 0; x < 16; x += 8) { T.fillStyle = '#e0b020'; T.fillRect(x, 6, 4, 3); T.fillStyle = '#1a1a1a'; T.fillRect(x + 4, 6, 4, 3); }
    T.fillStyle = '#2a2e34'; T.fillRect(0, 9, 16, 1);
  } else {
    for (const f of fills) {
      const x = ctx2d(f);
      x.fillStyle = '#5e1e45'; x.fillRect(0, 0, 16, 16);
      for (let i = 0; i < 3; i++) {
        let vx = ri(16), vy = ri(16);
        x.fillStyle = '#7a2a5a';
        for (let k = 0; k < 7; k++) { x.fillRect(vx & 15, vy & 15, 1, 1); vx += rnd() < 0.5 ? 1 : 0; vy += 1; }
      }
      for (let i = 0; i < 3; i++) { x.fillStyle = '#3e1030'; x.fillRect(ri(15), ri(15), 2, 2); }
      if (rnd() < 0.4) { x.fillStyle = '#9cff6a'; x.fillRect(ri(14), ri(14), 1, 1); }
    }
    T.fillStyle = '#5e1e45'; T.fillRect(0, 0, 16, 16);
    T.fillStyle = '#a43c6e'; T.fillRect(0, 0, 16, 5);
    T.fillStyle = '#d4609a'; T.fillRect(0, 0, 16, 1);
    for (let x = 0; x < 16; x += 4) { T.fillStyle = '#a43c6e'; T.fillRect(x + 1, 5, 2, 2); T.fillStyle = '#e88ab8'; T.fillRect(x + 1, 1, 1, 1); }
  }
  return { top, fill: fills, edge: THEMES[theme].edge };
}

/** Draws fn at x and at the wrapped position so tiles repeat seamlessly. */
function drawPeriodic(x: number, w: number, P: number, fn: (x: number) => void): void {
  fn(x);
  if (x + w > P) fn(x - P);
  if (x < 0) fn(x + P);
}

export function makeBackdrop(theme: ThemeName): Backdrop {
  const th = THEMES[theme];
  const sky = mkCanvas(W, H), s = ctx2d(sky);
  const gr = s.createLinearGradient(0, 0, 0, H);
  for (const [o, col] of th.sky) gr.addColorStop(o, col);
  s.fillStyle = gr; s.fillRect(0, 0, W, H);
  const rnd = seeded(theme.charCodeAt(0) * 31 + 7);
  const layers: ParallaxLayer[] = [];
  const layer = (P: number, f: number, fn: (x: Ctx, P: number) => void) => {
    const c = mkCanvas(P, H);
    fn(ctx2d(c), P);
    layers.push({ c, f, P });
  };
  const ridge = (x: Ctx, P: number, base: number, amp: number, step: number, col: string) => {
    const pts: number[] = [];
    for (let i = 0; i <= P / step; i++) pts.push(base - rnd() * amp);
    pts[pts.length - 1] = pts[0];
    x.fillStyle = col; x.beginPath(); x.moveTo(0, H);
    pts.forEach((y, i) => x.lineTo(i * step, y));
    x.lineTo(P, H); x.closePath(); x.fill();
  };

  if (theme === 'jungle') {
    for (let i = 0; i < 40; i++) { s.fillStyle = rnd() < 0.3 ? '#ffffff' : '#c8b8ff'; s.fillRect((rnd() * W) | 0, (rnd() * 60) | 0, 1, 1); }
    const sx = 292, sy = 118, r = 30; // banded sunset sun
    for (let y = -r; y <= r; y++) {
      const hw = Math.sqrt(r * r - y * y);
      if (y > 4 && ((y >> 2) & 1)) continue;
      s.fillStyle = y < -10 ? '#fff0b8' : y < 8 ? '#ffd27a' : '#ffaa5a';
      s.fillRect(Math.round(sx - hw), sy + y, Math.round(hw * 2), 1);
    }
    layer(512, 0.08, (x, P) => { ridge(x, P, 132, 50, 32, '#5a2f63'); ridge(x, P, 150, 40, 24, '#3a1f4d'); });
    layer(512, 0.24, (x, P) => {
      x.fillStyle = '#1e3a2e';
      for (let i = 0; i < P; i += 12) {
        const r2 = 9 + rnd() * 12, y = 150 - rnd() * 22;
        drawPeriodic(i, r2 * 2, P, xx => { x.beginPath(); x.arc(xx, y, r2, 0, TAU); x.fill(); });
      }
      x.fillRect(0, 150, P, H - 150);
      x.fillStyle = '#284a39';
      for (let i = 0; i < P; i += 22) { const y = 140 - rnd() * 18; drawPeriodic(i, 6, P, xx => x.fillRect(xx, y, 3, 2)); }
    });
    layer(640, 0.5, (x, P) => {
      for (let i = 0; i < 6; i++) {
        const tx = (i * P / 6 + rnd() * 50) | 0, top = 40 + rnd() * 50;
        const lean = rnd() < 0.5 ? -1 : 1;
        drawPeriodic(tx, 60, P, xx => {
          x.fillStyle = '#0f2219';
          for (let y = H; y > top; y -= 4) {
            const off = Math.round(((H - y) / (H - top)) ** 2 * 14 * lean);
            x.fillRect(xx + off, y - 4, 5, 4);
          }
          const cx = xx + 14 * lean + 2;
          for (let k = 0; k < 7; k++) {
            const ang = -Math.PI / 2 + (k - 3) * 0.45;
            for (let d = 0; d < 26; d += 2) {
              const px = cx + Math.cos(ang) * d * 1.2, py = top + Math.sin(ang) * d * 0.6 + d * d * 0.03;
              x.fillRect(Math.round(px), Math.round(py), 3, 2);
            }
          }
        });
      }
    });
  } else if (theme === 'foundry') {
    for (let i = 0; i < 6; i++) {
      s.fillStyle = 'rgba(40,20,18,0.5)';
      s.beginPath(); s.ellipse(rnd() * W, 30 + rnd() * 60, 50 + rnd() * 50, 10 + rnd() * 10, 0, 0, TAU); s.fill();
    }
    layer(512, 0.08, (x, P) => {
      let i = 0;
      while (i < P) {
        const bw = 30 + ((rnd() * 50) | 0), bh = 40 + rnd() * 70;
        x.fillStyle = '#2a1210'; x.fillRect(i, H - 60 - bh, bw, bh + 60);
        if (rnd() < 0.6) {
          const cw = 6 + ((rnd() * 5) | 0);
          x.fillRect(i + 6, H - 60 - bh - 40, cw, 40);
          x.fillStyle = 'rgba(90,60,55,0.35)';
          for (let k = 0; k < 4; k++) { x.beginPath(); x.arc(i + 8 + k * 5, H - 110 - bh - k * 9, 6 + k * 3, 0, TAU); x.fill(); }
        }
        x.fillStyle = '#9a4a1c';
        for (let wy = H - 50 - bh; wy < H - 40; wy += 9) for (let wx = i + 4; wx < i + bw - 4; wx += 7) if (rnd() < 0.18) x.fillRect(wx, wy, 2, 3);
        i += bw + ((rnd() * 10) | 0);
      }
    });
    layer(512, 0.25, (x, P) => {
      x.fillStyle = '#1a0b0a';
      for (let i = 0; i < P; i += 128) {
        x.fillRect(i + 10, 60, 6, H); x.fillRect(i + 70, 60, 6, H);
        for (let y = 70; y < H; y += 30) {
          x.fillRect(i + 10, y, 66, 3);
          for (let k = 0; k < 10; k++) x.fillRect(i + 13 + k * 6, y + 3 + k * 2.6, 3, 3);
        }
      }
      x.fillRect(0, 96, P, 7); x.fillStyle = '#2a1414'; x.fillRect(0, 97, P, 2);
    });
    layer(640, 0.5, (x, P) => {
      x.fillStyle = '#120707';
      x.fillRect(0, 0, P, 10);
      for (let i = 0; i < 5; i++) {
        const cx = (rnd() * P) | 0, len = 20 + rnd() * 50;
        drawPeriodic(cx, 8, P, xx => { for (let y = 10; y < len; y += 5) x.fillRect(xx, y, 3, 4); x.fillRect(xx - 3, len, 9, 6); });
      }
      for (let i = 0; i < 3; i++) x.fillRect(0, 12 + i * 8, P, 4);
    });
  } else {
    for (let i = 0; i < 60; i++) {
      s.fillStyle = rnd() < 0.5 ? 'rgba(180,90,255,0.6)' : 'rgba(120,255,160,0.4)';
      s.fillRect((rnd() * W) | 0, (rnd() * 120) | 0, 1, 1);
    }
    layer(512, 0.08, (x, P) => {
      x.fillStyle = '#22103a';
      for (let i = 0; i < P; i += 40) {
        const h = 50 + rnd() * 90, w2 = 10 + rnd() * 12, cx = i + rnd() * 20;
        drawPeriodic(cx, w2 * 2, P, xx => {
          x.beginPath(); x.moveTo(xx - w2, H);
          x.quadraticCurveTo(xx - 3, H - h * 0.6, xx, H - h);
          x.quadraticCurveTo(xx + 3, H - h * 0.6, xx + w2, H); x.fill();
        });
      }
      x.fillStyle = 'rgba(177,76,255,0.7)';
      for (let i = 0; i < 30; i++) x.fillRect((rnd() * P) | 0, 120 + ((rnd() * 80) | 0), 1, 1);
    });
    layer(512, 0.25, (x, P) => {
      x.strokeStyle = '#1a0a28'; x.lineWidth = 5;
      for (let i = 0; i < P; i += 96) {
        drawPeriodic(i, 80, P, xx => {
          for (let k = 0; k < 3; k++) { x.beginPath(); x.ellipse(xx + 40, H, 34 - k * 8, 110 - k * 22, 0, Math.PI, TAU); x.stroke(); }
        });
      }
      x.fillStyle = '#1a0a28'; x.fillRect(0, 170, P, H - 170);
    });
    layer(640, 0.5, (x, P) => {
      x.fillStyle = '#10061c';
      x.fillRect(0, 0, P, 8);
      for (let i = 0; i < P; i += 26) {
        const len = 10 + rnd() * 50, w2 = 5 + rnd() * 6;
        drawPeriodic(i, w2 * 2, P, xx => {
          x.beginPath(); x.moveTo(xx - w2, 0);
          x.quadraticCurveTo(xx, len * 0.5, xx, len);
          x.quadraticCurveTo(xx, len * 0.5, xx + w2, 0); x.fill();
        });
      }
    });
  }
  return { sky, layers, theme, tiles: makeTiles(theme), th };
}

export function drawBackdrop(c: Ctx, bg: Backdrop, camX: number): void {
  c.drawImage(bg.sky, 0, 0);
  for (const L of bg.layers) {
    const off = Math.floor(camX * L.f) % L.P;
    for (let x = -off; x < W; x += L.P) c.drawImage(L.c, x, 0);
  }
}

/** Water / lava / acid strip at the bottom of the screen; only visible through pits. */
export function drawPitFill(c: Ctx, bg: Backdrop, t: number): void {
  const pf = bg.th.pit;
  R(c, 0, pf.y, W, H - pf.y, pf.a);
  c.fillStyle = pf.b;
  for (let x = 0; x < W; x += 8) {
    const y = pf.y + Math.round(Math.sin(x * 0.2 + t * 0.08) * 1.5);
    c.fillRect(x, y, 5, 1);
  }
  if (bg.theme === 'foundry') {
    c.fillStyle = 'rgba(255,120,30,0.18)';
    c.fillRect(0, pf.y - 10, W, 10);
  }
}

export function drawSolid(c: Ctx, s: Solid, cx: number, tiles: Tiles): void {
  const x0 = Math.max(s.x, cx - 16), x1 = Math.min(s.x + s.w, cx + W + 16);
  if (x1 <= x0) return;
  const startCol = Math.floor((x0 - s.x) / 16);
  for (let tx = s.x + startCol * 16; tx < x1; tx += 16) {
    const w = Math.min(16, s.x + s.w - tx);
    const sx = Math.round(tx - cx);
    let row = 0;
    for (let ty = s.y; ty < H; ty += 16, row++) {
      const tile = row === 0 ? tiles.top : tiles.fill[hash2(tx, row) % tiles.fill.length];
      c.drawImage(tile, 0, 0, w, 16, sx, ty, w, 16);
    }
  }
  c.fillStyle = tiles.edge;
  const lx = Math.round(s.x - cx), rx = Math.round(s.x + s.w - cx);
  if (lx > -4 && lx < W) c.fillRect(lx, s.y + 2, 2, H - s.y);
  if (rx > -4 && rx < W + 2) c.fillRect(rx - 2, s.y + 2, 2, H - s.y);
}

export function drawPlatform(c: Ctx, p: Platform, cx: number, theme: ThemeName, t: number): void {
  let sx = Math.round(p.x - cx), sy = Math.round(p.y);
  if (p.gone) sy += Math.round(p.fall);
  else if (p.crumble && p.touched) sx += ((p.ct >> 1) & 1) ? 1 : -1;
  if (sx > W + 8 || sx + p.w < -8 || sy > H + 10) return;
  const w = p.w;
  if (theme === 'jungle') {
    if (p.crumble) {
      for (let x = 0; x < w; x += 8) { R(c, sx + x, sy, 7, 5, '#8a5a30'); R(c, sx + x, sy, 7, 1, '#b07a44'); R(c, sx + x, sy + 4, 7, 1, '#4a2e18'); }
      if (!p.gone) { R(c, sx, sy - 9, 2, 9, '#5a3a1e'); R(c, sx, sy - 8, w, 1, '#c9a46a'); }
    } else {
      R(c, sx, sy, w, 6, '#7a4e2a'); R(c, sx, sy, w, 2, '#a06a3a'); R(c, sx, sy + 5, w, 1, '#4a2e18');
      for (let x = 6; x < w; x += 14) R(c, sx + x, sy + 2, 1, 3, '#5a3a1e');
      R(c, sx - 3, sy - 2, 6, 3, '#3f9b3a'); R(c, sx + w - 3, sy - 2, 6, 3, '#3f9b3a'); R(c, sx - 1, sy - 3, 3, 1, '#7fd45a');
    }
  } else if (theme === 'foundry') {
    const top = p.crumble ? '#a8724a' : '#8b95a3', mid = p.crumble ? '#6a4026' : '#4a525c';
    R(c, sx, sy, w, 2, top);
    for (let x = 0; x < w; x += 4) R(c, sx + x, sy + 2, 2, 3, mid);
    R(c, sx, sy + 5, w, 1, '#22262c');
    if (p.moving) {
      R(c, sx + (w >> 1) - 3, sy + 6, 6, 3, '#2a2e34');
      R(c, sx + (w >> 1) - 1, sy + 9, 2, 2, (t >> 3) & 1 ? '#ff6a1a' : '#ffd23f');
    } else if (!p.crumble) {
      R(c, sx + 2, sy - 7, 1, 7, '#6c7480'); R(c, sx + w - 3, sy - 7, 1, 7, '#6c7480'); R(c, sx + 2, sy - 7, w - 4, 1, '#8b95a3');
    }
  } else {
    if (p.crumble) {
      R(c, sx, sy, w, 5, '#b0507a'); R(c, sx, sy, w, 1, '#e080b0');
      for (let x = 3; x < w; x += 7) R(c, sx + x, sy + 2, 2, 2, '#6a1a40');
    } else if (p.moving) {
      disc(c, sx + w / 2, sy + 4, w / 2 - 2, '#6a3a9a'); R(c, sx, sy, w, 4, '#9a6ad0'); R(c, sx + 2, sy, w - 4, 1, '#d0b0ff');
    } else {
      R(c, sx, sy, w, 6, '#d8cbb0'); R(c, sx, sy, w, 1, '#fff4dc'); R(c, sx, sy + 5, w, 1, '#8a7b62');
      for (let x = 4; x < w; x += 10) R(c, sx + x, sy + 2, 3, 2, '#b0a284');
    }
  }
}

export function drawWater(c: Ctx, wtr: Water, cx: number, t: number): void {
  const sx = Math.round(wtr.x - cx);
  if (sx > W || sx + wtr.w < 0) return;
  const acid = wtr.kind === 'acid';
  c.fillStyle = acid ? 'rgba(90,220,60,0.6)' : 'rgba(50,120,190,0.55)';
  c.fillRect(sx, wtr.y, wtr.w, H - wtr.y);
  c.fillStyle = acid ? '#c8ff7a' : '#a8dcff';
  for (let x = 0; x < wtr.w; x += 6) {
    const y = wtr.y + Math.round(Math.sin((wtr.x + x) * 0.15 + t * 0.1));
    c.fillRect(sx + x, y, 3, 1);
  }
  if (acid && (t % 20) < 10) { c.fillStyle = '#e8ffb0'; c.fillRect(sx + ((t * 7) % wtr.w), wtr.y + 3, 2, 2); }
}

export function drawDecor(c: Ctx, d: Decor, cx: number, t: number): void {
  const sx = Math.round(d.x - cx), sy = d.y;
  if (sx < -40 || sx > W + 40) return;
  switch (d.type) {
    case 'bush':
      disc(c, sx, sy - 4, 6, '#1f5a26'); disc(c, sx + 7, sy - 5, 7, '#2a7a30'); disc(c, sx + 14, sy - 3, 5, '#1f5a26');
      R(c, sx + 4, sy - 10, 2, 1, '#6fd04a');
      break;
    case 'rock':
      R(c, sx, sy - 6, 12, 6, '#6e6a66'); R(c, sx + 2, sy - 8, 8, 2, '#8a8580'); R(c, sx + 1, sy - 2, 10, 2, '#4a4642');
      break;
    case 'fern':
      for (let k = -2; k <= 2; k++) for (let i = 0; i < 8; i++) R(c, Math.round(sx + k * i * 0.7), Math.round(sy - i * 1.4), 2, 1, '#2f8a34');
      break;
    case 'ruin':
      R(c, sx, sy - 34, 12, 34, '#6a6a5a'); R(c, sx - 2, sy - 38, 16, 4, '#7d7d6a'); R(c, sx + 3, sy - 26, 6, 1, '#4a4a3e');
      R(c, sx + 2, sy - 14, 8, 1, '#4a4a3e'); R(c, sx, sy - 30, 3, 10, '#3f8a34');
      break;
    case 'barrel':
      R(c, sx, sy - 14, 10, 14, '#a0402a'); R(c, sx, sy - 11, 10, 2, '#5a2014'); R(c, sx, sy - 5, 10, 2, '#5a2014');
      R(c, sx + 2, sy - 14, 2, 14, '#c86040'); R(c, sx + 3, sy - 9, 4, 2, '#ffd23f');
      break;
    case 'crate':
      R(c, sx, sy - 16, 16, 16, '#5a4a32'); R(c, sx + 1, sy - 15, 14, 14, '#7a6440');
      R(c, sx + 1, sy - 9, 14, 2, '#5a4a32'); R(c, sx + 7, sy - 15, 2, 14, '#5a4a32');
      break;
    case 'lamp':
      R(c, sx, sy - 30, 2, 30, '#3a3f47'); R(c, sx - 3, sy - 33, 8, 3, '#5c6470');
      R(c, sx - 2, sy - 30, 6, 2, (t >> 4) & 1 ? '#ffd23f' : '#ff8c2a');
      c.fillStyle = 'rgba(255,200,80,0.12)';
      c.beginPath(); c.moveTo(sx - 2, sy - 28); c.lineTo(sx - 14, sy); c.lineTo(sx + 16, sy); c.lineTo(sx + 4, sy - 28); c.fill();
      break;
    case 'pipe':
      R(c, sx, sy - 22, 8, 22, '#4a525c'); R(c, sx + 1, sy - 22, 2, 22, '#6c7480'); R(c, sx - 2, sy - 24, 12, 3, '#5c6470');
      if ((t + d.x) % 90 < 30) {
        c.fillStyle = 'rgba(220,220,220,0.25)';
        c.beginPath(); c.arc(sx + 4, sy - 28 - ((t + d.x) % 30) * 0.5, 4, 0, TAU); c.fill();
      }
      break;
    case 'sign':
      R(c, sx + 5, sy - 14, 2, 14, '#3a3f47'); R(c, sx, sy - 24, 12, 11, '#e0b020'); R(c, sx + 1, sy - 23, 10, 9, '#1a1a1a');
      R(c, sx + 5, sy - 21, 2, 4, '#e0b020'); R(c, sx + 5, sy - 16, 2, 1, '#e0b020');
      break;
    case 'tendril': {
      const sw = Math.sin(t * 0.04 + d.x) * 2;
      for (let i = 0; i < 18; i++) R(c, Math.round(sx + Math.sin(i * 0.3) * 3 + sw * i / 18), Math.round(sy - i * 1.5 - 2), 3, 2, i > 14 ? '#ff6aa8' : '#7a2a5a');
      break;
    }
    case 'bone':
      R(c, sx, sy - 3, 14, 3, '#d8cbb0'); R(c, sx - 2, sy - 5, 4, 5, '#d8cbb0'); R(c, sx + 12, sy - 5, 4, 5, '#d8cbb0');
      break;
    case 'glow': {
      const a = 0.5 + Math.sin(t * 0.06 + d.x) * 0.3;
      R(c, sx + 2, sy - 6, 2, 6, '#4a2a5a');
      c.fillStyle = `rgba(150,255,120,${a.toFixed(2)})`;
      c.beginPath(); c.arc(sx + 3, sy - 9, 4, 0, TAU); c.fill();
      R(c, sx + 2, sy - 10, 2, 2, '#efffd0');
      break;
    }
  }
}

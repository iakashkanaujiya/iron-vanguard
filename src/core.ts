// Core constants, math helpers, persistence and input handling
import type { Rect } from './types.ts';

export const W = 384, H = 216;          // internal resolution
export const GROUND = 176;              // default ground height
export const STEP = 1 / 60;             // fixed simulation step
export const GRAV = 0.22, MAX_FALL = 6;
export const RUN = 1.4, JUMP_V = -5.1;
export const TAU = Math.PI * 2;

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
export const randi = (a: number, b: number): number => Math.floor(a + Math.random() * (b - a + 1));
export const chance = (p: number): boolean => Math.random() < p;
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const angNorm = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
export const pad = (n: number, len: number): string => String(Math.max(0, Math.floor(n))).padStart(len, '0');

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function circleRect(cx: number, cy: number, r: number, b: Rect): boolean {
  const nx = clamp(cx, b.x, b.x + b.w), ny = clamp(cy, b.y, b.y + b.h);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

/** Deterministic PRNG so generated art and decor look the same every run. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export function hash2(a: number, b: number): number {
  let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

const query = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
/** Developer switches: ?stage=2 jumps to a stage, ?boss starts at the boss, ?god disables damage, ?bot auto-plays. */
export const DEBUG = {
  stage: query.has('stage') ? (parseInt(query.get('stage') ?? '1', 10) || 1) : 0,
  god: query.has('god'),
  bot: query.has('bot'),
  boss: query.has('boss'),
  /** fast-forward this many simulation frames at startup (for screenshots/tests) */
  ff: Math.max(0, parseInt(query.get('ff') ?? '0', 10) || 0),
};

export const Store = {
  get(k: string, d: string): string {
    try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; }
  },
  set(k: string, v: string): void {
    try { localStorage.setItem(k, v); } catch { /* storage unavailable */ }
  },
};

// ---------------------------------------------------------------------------
// Input: keyboard + gamepad + touch, merged into a small set of actions
// ---------------------------------------------------------------------------
export type Action = 'left' | 'right' | 'up' | 'down' | 'jump' | 'fire' | 'start' | 'pause' | 'mute';
export type ActionMap = Record<Action, boolean>;

const ACTIONS: readonly Action[] = ['left', 'right', 'up', 'down', 'jump', 'fire', 'start', 'pause', 'mute'];
const KEYMAP: Record<string, Action> = {
  ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
  KeyZ: 'jump', KeyK: 'jump', Space: 'jump',
  KeyX: 'fire', KeyJ: 'fire',
  Enter: 'start', KeyP: 'pause', Escape: 'pause', KeyM: 'mute',
};
const blank = (): ActionMap => ({
  left: false, right: false, up: false, down: false, jump: false, fire: false, start: false, pause: false, mute: false,
});

class InputState {
  readonly held = blank();
  readonly pressed = blank();
  readonly touch = blank();
  /** Driven by the auto-play bot in debug mode. */
  readonly virt = blank();
  private readonly kb = blank();
  private readonly latch = blank();
  private readonly prev = blank();
  private pad = blank();
  private readonly firstListeners: (() => void)[] = [];

  attach(target: Window): void {
    target.addEventListener('keydown', e => {
      this.first();
      const a = KEYMAP[e.code];
      if (!a) return;
      e.preventDefault();
      if (!this.kb[a]) this.latch[a] = true;
      this.kb[a] = true;
    });
    target.addEventListener('keyup', e => {
      const a = KEYMAP[e.code];
      if (!a) return;
      e.preventDefault();
      this.kb[a] = false;
    });
    target.addEventListener('blur', () => { for (const a of ACTIONS) this.kb[a] = false; });
    target.addEventListener('pointerdown', () => this.first());
  }

  onFirst(f: () => void): void { this.firstListeners.push(f); }
  first(): void { for (const f of this.firstListeners) f(); }

  private pollPads(): void {
    this.pad = blank();
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
    let pads: (Gamepad | null)[];
    try { pads = navigator.getGamepads(); } catch { return; }
    for (const p of pads) {
      if (!p) continue;
      const b = (i: number) => !!(p.buttons[i] && p.buttons[i].pressed);
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const P = this.pad;
      if (b(14) || ax < -0.45) P.left = true;
      if (b(15) || ax > 0.45) P.right = true;
      if (b(12) || ay < -0.5) P.up = true;
      if (b(13) || ay > 0.5) P.down = true;
      if (b(0) || b(4)) P.jump = true;
      if (b(1) || b(2) || b(3) || b(5) || b(7)) P.fire = true;
      if (b(9)) P.start = true;
      if (b(8)) P.mute = true;
      if (b(0) || b(1) || b(2) || b(3) || b(9)) this.first();
    }
  }

  /** Called once per simulation step, before the game update. */
  update(): void {
    this.pollPads();
    for (const a of ACTIONS) {
      const h = this.kb[a] || this.pad[a] || this.touch[a] || this.virt[a];
      this.pressed[a] = (h && !this.prev[a]) || this.latch[a];
      this.held[a] = h || this.latch[a];
      this.prev[a] = h;
      this.latch[a] = false;
    }
  }

  press(a: Action): void { if (!this.touch[a]) this.latch[a] = true; this.touch[a] = true; }
  release(a: Action): void { this.touch[a] = false; }
  any(): boolean { return this.pressed.start || this.pressed.fire || this.pressed.jump; }
  clearVirt(): void { for (const a of ACTIONS) this.virt[a] = false; }
}

export const Input = new InputState();

/** On-screen stick + buttons for touch devices. */
export function setupTouch(): void {
  const root = document.getElementById('touch');
  const stick = document.getElementById('stick');
  const knob = document.getElementById('knob');
  if (!root || !stick || !knob) return;
  const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0;
  if (!isTouch) return;
  root.hidden = false;
  const DIRS: Action[] = ['left', 'right', 'up', 'down'];
  const OCTANTS: Record<string, Action[]> = {
    '0': ['right'], '1': ['right', 'down'], '2': ['down'], '3': ['left', 'down'], '4': ['left'], '-4': ['left'],
    '-3': ['left', 'up'], '-2': ['up'], '-1': ['right', 'up'],
  };
  let stickId: number | null = null;
  const clearDirs = () => { for (const d of DIRS) Input.release(d); };
  const setDir = (cx: number, cy: number) => {
    const r = stick.getBoundingClientRect();
    const dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2);
    const mag = Math.hypot(dx, dy);
    clearDirs();
    if (mag > r.width * 0.16) {
      const oct = Math.round(Math.atan2(dy, dx) / (Math.PI / 4));
      for (const d of OCTANTS[String(oct)] ?? []) Input.touch[d] = true;
    }
    const lim = r.width / 2 - 10, k = mag > lim ? lim / mag : 1;
    knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
  };
  stick.addEventListener('pointerdown', e => {
    e.preventDefault(); Input.first();
    stickId = e.pointerId; stick.setPointerCapture(e.pointerId); setDir(e.clientX, e.clientY);
  });
  stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) setDir(e.clientX, e.clientY); });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== stickId) return;
    stickId = null; clearDirs(); knob.style.transform = 'translate(0px, 0px)';
  };
  stick.addEventListener('pointerup', end);
  stick.addEventListener('pointercancel', end);
  const bind = (id: string, action: Action) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('pointerdown', e => {
      e.preventDefault(); Input.first(); el.setPointerCapture(e.pointerId);
      Input.press(action); el.classList.add('on');
    });
    const up = () => { Input.release(action); el.classList.remove('on'); };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  bind('bJump', 'jump');
  bind('bFire', 'fire');
  bind('bPause', 'start');
}

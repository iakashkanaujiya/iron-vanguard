// Player, weapons, projectiles, enemies, pickups and particles
import {
  W, H, GRAV, MAX_FALL, RUN, JUMP_V, TAU, Input,
  clamp, rand, randi, chance, angNorm, circleRect, rectsOverlap,
} from './core.ts';
import { Sound } from './audio.ts';
import type { SfxName } from './audio.ts';
import {
  R, pen, disc, setTint, Text, drawHumanoid, drawProne, drawBall, drawMuzzle, drawBadge,
  PAL_PLAYER, PAL_TROOPER, PAL_HEAVY,
} from './art.ts';
import type { Ctx, Aim } from './art.ts';
import { moveBody } from './physics.ts';
import type { Body, BulletLike, HitResult, PickupType, Rect, Surface, Vec, WeaponType } from './types.ts';
import type { Game } from './game.ts';

// ---------------------------------------------------------------------------
// Particles
// ---------------------------------------------------------------------------
export type ParticleKind = 'dot' | 'fire' | 'smoke' | 'flash' | 'ring' | 'text';
export interface ParticleOpts {
  x: number; y: number; vx?: number; vy?: number; life?: number; size?: number; color?: string;
  grav?: number; drag?: number; kind?: ParticleKind; grow?: number; text?: string;
}

export class Particle {
  x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string;
  grav: number; drag: number; kind: ParticleKind; grow: number; text: string;
  constructor(o: ParticleOpts) {
    this.x = o.x; this.y = o.y; this.vx = o.vx ?? 0; this.vy = o.vy ?? 0;
    this.life = o.life ?? 20; this.max = this.life; this.size = o.size ?? 2; this.color = o.color ?? '#ffffff';
    this.grav = o.grav ?? 0; this.drag = o.drag ?? 1; this.kind = o.kind ?? 'dot'; this.grow = o.grow ?? 0; this.text = o.text ?? '';
  }
  update(): boolean {
    this.vx *= this.drag;
    this.vy = this.vy * this.drag + this.grav;
    this.x += this.vx; this.y += this.vy;
    this.size = Math.max(0, this.size + this.grow);
    return --this.life > 0;
  }
  draw(c: Ctx, cx: number): void {
    const sx = this.x - cx, sy = this.y, k = this.life / this.max;
    switch (this.kind) {
      case 'dot': R(c, Math.round(sx), Math.round(sy), Math.ceil(this.size), Math.ceil(this.size), this.color); break;
      case 'fire': disc(c, sx, sy, this.size, k > 0.75 ? '#fff3b0' : this.color); break;
      case 'smoke':
        c.globalAlpha = k * 0.45; disc(c, sx, sy, this.size, this.color); c.globalAlpha = 1; break;
      case 'flash':
        c.globalAlpha = k; disc(c, sx, sy, this.size * (0.6 + (1 - k) * 0.6), this.color); c.globalAlpha = 1; break;
      case 'ring':
        c.globalAlpha = k; c.strokeStyle = this.color; c.lineWidth = 2;
        c.beginPath(); c.arc(sx, sy, this.size, 0, TAU); c.stroke(); c.globalAlpha = 1; break;
      case 'text': Text.draw(c, this.text, sx, sy, this.color, 1, 'center'); break;
    }
  }
}

// ---------------------------------------------------------------------------
// Player projectiles + weapons
// ---------------------------------------------------------------------------
export class PBullet implements BulletLike {
  x: number; y: number; vx: number; vy: number; kind: WeaponType;
  r: number; dmg: number; pierce: boolean; hits: Set<Enemy> | null;
  t = 0; dead = false; target: Enemy | null = null;
  constructor(x: number, y: number, vx: number, vy: number, kind: WeaponType) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.kind = kind;
    this.r = kind === 'W' ? 2 : kind === 'L' || kind === 'H' ? 3 : 2;
    this.dmg = kind === 'L' ? 3 : kind === 'H' ? 2 : 1;
    this.pierce = kind === 'L';
    this.hits = this.pierce ? new Set() : null;
  }
  update(g: Game): void {
    this.t++;
    if (this.kind === 'W' && this.r < 3.5) this.r += 0.05;
    if (this.kind === 'H') {
      if (!this.target || this.target.dead || this.target.dying || this.t % 10 === 0) this.target = g.nearestEnemy(this.x, this.y);
      const sp = Math.min(5.5, Math.hypot(this.vx, this.vy) + 0.12);
      let a = Math.atan2(this.vy, this.vx);
      if (this.target && this.t > 4) {
        const c = this.target.center();
        const d = angNorm(Math.atan2(c.y - this.y, c.x - this.x) - a);
        a += clamp(d, -0.13, 0.13);
      }
      this.vx = Math.cos(a) * sp; this.vy = Math.sin(a) * sp;
      if (this.t % 3 === 0) g.particles.push(new Particle({ x: this.x, y: this.y, kind: 'smoke', size: 1.5, grow: 0.04, life: 9, color: '#c8d8c0' }));
    }
    this.x += this.vx; this.y += this.vy;
    const cx = g.cam.x;
    if (this.x < cx - 20 || this.x > cx + W + 20 || this.y < -20 || this.y > H + 20 || this.t > 200) this.dead = true;
  }
  draw(c: Ctx, cx: number): void {
    const sx = Math.round(this.x - cx), sy = Math.round(this.y);
    switch (this.kind) {
      case 'N':
        R(c, sx - 2, sy - 1, 5, 3, '#ffb020'); R(c, sx - 1, sy - 2, 3, 5, '#ffb020'); R(c, sx - 1, sy - 1, 3, 3, '#fff6c0');
        break;
      case 'R':
        R(c, sx - 2, sy - 1, 4, 3, '#ff5a4a'); R(c, sx - 1, sy - 2, 2, 5, '#ff5a4a'); R(c, sx - 1, sy - 1, 2, 2, '#ffffff');
        break;
      case 'W':
        disc(c, sx, sy, this.r, '#ff7a1a'); disc(c, sx, sy, this.r * 0.55, '#ffd23f'); R(c, sx, sy, 1, 1, '#ffffff');
        break;
      case 'L': {
        const n = Math.hypot(this.vx, this.vy) || 1, ux = this.vx / n, uy = this.vy / n;
        c.lineCap = 'round';
        c.strokeStyle = '#3ac8ff'; c.lineWidth = 4;
        c.beginPath(); c.moveTo(sx - ux * 16, sy - uy * 16); c.lineTo(sx, sy); c.stroke();
        c.strokeStyle = '#e8ffff'; c.lineWidth = 1.5;
        c.beginPath(); c.moveTo(sx - ux * 14, sy - uy * 14); c.lineTo(sx, sy); c.stroke();
        break;
      }
      case 'H':
        R(c, sx - 2, sy - 2, 4, 4, '#3a8a2a'); R(c, sx - 1, sy - 1, 3, 3, '#7aff6a'); R(c, sx, sy, 1, 1, '#ffffff');
        break;
    }
  }
}

interface WeaponDef {
  name: string; cd: number; hold: number; max: number; snd: SfxName;
  fire(g: Game, x: number, y: number, dx: number, dy: number): void;
}
export const WEAPONS: Record<WeaponType, WeaponDef> = {
  N: { name: 'BLASTER', cd: 8, hold: 12, max: 4, snd: 'shoot',
    fire: (g, x, y, dx, dy) => { g.pBullets.push(new PBullet(x, y, dx * 5.2, dy * 5.2, 'N')); } },
  R: { name: 'RAPID', cd: 5, hold: 5, max: 10, snd: 'rapid',
    fire: (g, x, y, dx, dy) => { g.pBullets.push(new PBullet(x, y, dx * 6.4, dy * 6.4, 'R')); } },
  W: { name: 'WAVE', cd: 13, hold: 15, max: 20, snd: 'wave',
    fire: (g, x, y, dx, dy) => {
      const a = Math.atan2(dy, dx);
      for (const o of [-0.3, -0.15, 0, 0.15, 0.3]) g.pBullets.push(new PBullet(x, y, Math.cos(a + o) * 4.6, Math.sin(a + o) * 4.6, 'W'));
    } },
  L: { name: 'LANCE', cd: 16, hold: 18, max: 3, snd: 'lance',
    fire: (g, x, y, dx, dy) => { g.pBullets.push(new PBullet(x, y, dx * 8, dy * 8, 'L')); } },
  H: { name: 'HOMING', cd: 12, hold: 14, max: 5, snd: 'homing',
    fire: (g, x, y, dx, dy) => { g.pBullets.push(new PBullet(x, y, dx * 3, dy * 3, 'H')); } },
};

// ---------------------------------------------------------------------------
// Enemy projectiles
// ---------------------------------------------------------------------------
export type EBulletKind = 'orb' | 'grenade' | 'bomb' | 'fireball' | 'spit' | 'missile' | 'shock' | 'blast' | 'spore';
interface EBulletOpts { grav?: number; r?: number; tx?: number; life?: number; minX?: number; maxX?: number; }

export class EBullet implements BulletLike {
  x: number; y: number; vx: number; vy: number; kind: EBulletKind;
  r = 2.5; grav = 0; life = 600; t = 0; dead = false; phase = 0; wait = 0; tx = 0; minX = -1e9; maxX = 1e9;
  constructor(x: number, y: number, vx: number, vy: number, kind: EBulletKind = 'orb', o: EBulletOpts = {}) {
    this.x = x; this.y = y; this.vx = vx; this.vy = vy; this.kind = kind;
    if (kind === 'fireball') this.r = 4;
    if (kind === 'grenade' || kind === 'spit' || kind === 'bomb' || kind === 'spore') this.r = 3;
    if (kind === 'shock') this.r = 6;
    if (kind === 'blast') { this.r = 14; this.life = 16; }
    if (o.grav !== undefined) this.grav = o.grav;
    if (o.r !== undefined) this.r = o.r;
    if (o.tx !== undefined) this.tx = o.tx;
    if (o.life !== undefined) this.life = o.life;
    if (o.minX !== undefined) this.minX = o.minX;
    if (o.maxX !== undefined) this.maxX = o.maxX;
  }
  /** Blasts only hurt during their first frames; missiles are harmless while off-screen. */
  get harmful(): boolean {
    if (this.kind === 'blast') return this.t < 10;
    if (this.kind === 'missile') return this.phase !== 1;
    return true;
  }
  update(g: Game): void {
    this.t++;
    if (this.kind === 'missile') { this.updateMissile(g); return; }
    if (--this.life <= 0) { this.dead = true; return; }
    if (this.kind === 'blast') return;
    if (this.kind === 'spore') this.vx = Math.sin(this.t * 0.05) * 0.5;
    this.vy += this.grav;
    this.x += this.vx; this.y += this.vy;
    if (this.kind === 'shock') {
      if (this.t % 3 === 0) g.particles.push(new Particle({ x: this.x, y: this.y + 4, vx: rand(-0.5, 0.5), vy: -rand(0.5, 1.5), kind: 'fire', size: 2, grow: -0.1, life: 12, color: '#ff8c1a' }));
      if (this.x < this.minX || this.x > this.maxX) this.dead = true;
      return;
    }
    if (this.kind === 'fireball' && this.t % 2 === 0) {
      g.particles.push(new Particle({ x: this.x, y: this.y, kind: 'fire', size: 2.5, grow: -0.12, life: 12, color: '#ff6a1a' }));
    }
    if ((this.grav > 0 || this.kind === 'spore') && this.vy > 0 && g.solidPoint(this.x, this.y + this.r)) {
      this.dead = true;
      if (this.kind === 'spore') g.puff(this.x, this.y, '#c070ff');
      else g.blast(this.x, this.y, this.kind === 'spit' ? 9 : 14);
      return;
    }
    const cx = g.cam.x;
    if (this.x < cx - 40 || this.x > cx + W + 40 || this.y > H + 30 || this.y < -80) this.dead = true;
  }
  private updateMissile(g: Game): void {
    if (this.phase === 0) {
      this.vy -= 0.12; this.y += this.vy; this.x += this.vx;
      if (this.t % 2 === 0) g.particles.push(new Particle({ x: this.x, y: this.y + 5, kind: 'smoke', size: 2, grow: 0.1, life: 18, color: '#9a9a9a' }));
      if (this.y < -24) { this.phase = 1; this.wait = 40; this.x = this.tx; }
    } else if (this.phase === 1) {
      if (--this.wait <= 0) { this.phase = 2; this.vy = 2; this.vx = 0; this.y = -16; }
    } else {
      this.vy = Math.min(this.vy + 0.15, 5); this.y += this.vy;
      if (g.solidPoint(this.x, this.y + 4)) { this.dead = true; g.blast(this.x, this.y, 16); }
      if (this.y > H + 20) this.dead = true;
    }
  }
  draw(c: Ctx, cx: number): void {
    const sx = Math.round(this.x - cx), sy = Math.round(this.y);
    switch (this.kind) {
      case 'orb': {
        const col = (this.t >> 2) & 1 ? '#ff2a5a' : '#ff9a2a';
        R(c, sx - 2, sy - 1, 5, 3, col); R(c, sx - 1, sy - 2, 3, 5, col); R(c, sx - 1, sy - 1, 3, 3, '#ffffff');
        break;
      }
      case 'grenade':
        R(c, sx - 2, sy - 2, 4, 4, '#3a4a2a'); R(c, sx - 1, sy - 2, 2, 1, '#5a6a3a');
        if ((this.t >> 2) & 1) R(c, sx, sy - 3, 1, 1, '#ff3030');
        break;
      case 'bomb':
        R(c, sx - 2, sy - 3, 4, 7, '#2a2e34'); R(c, sx - 1, sy - 3, 1, 6, '#5a6270'); R(c, sx - 3, sy - 5, 6, 2, '#5a6270');
        break;
      case 'fireball':
        disc(c, sx, sy, 4, '#ff5a10'); disc(c, sx, sy, 2.5, '#ffd23f'); R(c, sx - 1, sy - 1, 2, 2, '#fff6c0');
        break;
      case 'spit':
        disc(c, sx, sy, 3, '#5acc2a'); disc(c, sx - 1, sy - 1, 1.5, '#e8ffb0');
        break;
      case 'spore':
        c.globalAlpha = 0.7 + Math.sin(this.t * 0.2) * 0.3; disc(c, sx, sy, 3, '#c070ff'); c.globalAlpha = 1; R(c, sx - 1, sy - 1, 2, 2, '#f0d0ff');
        break;
      case 'shock':
        R(c, sx - 4, sy - 10, 8, 12, '#ff6a1a'); R(c, sx - 2, sy - 14, 4, 6, '#ffd23f'); R(c, sx - 3, sy - 6, 6, 6, '#fff3b0');
        break;
      case 'blast': {
        const k = this.t / 16;
        c.globalAlpha = 1 - k; disc(c, sx, sy, this.r * (0.5 + k * 0.6), k < 0.3 ? '#fff3b0' : '#ff8c1a'); c.globalAlpha = 1;
        break;
      }
      case 'missile':
        if (this.phase === 0) { R(c, sx - 1, sy - 4, 3, 8, '#c8ced6'); R(c, sx - 1, sy - 5, 3, 1, '#ff3030'); R(c, sx - 1, sy + 4, 3, 2, '#ffd23f'); }
        else if (this.phase === 1) {
          if ((this.t >> 2) & 1) { R(c, sx - 4, 172, 9, 2, '#ff3030'); R(c, sx - 1, 166, 3, 5, '#ff3030'); }
        } else { R(c, sx - 1, sy - 4, 3, 8, '#c8ced6'); R(c, sx - 1, sy + 4, 3, 1, '#ff3030'); R(c, sx - 1, sy - 7, 3, 3, '#ffd23f'); }
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Player — "Kade", Vanguard commando
// ---------------------------------------------------------------------------
export class Player implements Body {
  g: Game;
  x = 0; y = 0; vx = 0; vy = 0; onGround = false; ground: Surface | null = null;
  spin = false; prone = false; facing = 1; aimX = 1; aimY = 0;
  fireCd = 0; flash = 0; invuln = 0; shield = 0;
  dying = false; deathT = 0; deadGround = false; visible = true;
  dropT = 0; anim = 0; t = 0; coyote = 0; jumpBuf = 0;
  hp = 1; hpMax = 1; weapon: WeaponType = 'N';

  constructor(g: Game) {
    this.g = g;
    this.hpMax = g.mode === 'casual' ? 3 : 1;
    this.hp = this.hpMax;
  }

  spawn(x: number, y: number): void {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.onGround = false; this.ground = null;
    this.spin = false; this.prone = false; this.facing = 1; this.aimX = 1; this.aimY = 0;
    this.fireCd = 0; this.flash = 0; this.dying = false; this.deathT = 0; this.deadGround = false; this.visible = true;
    this.dropT = 0; this.anim = 0; this.coyote = 0; this.jumpBuf = 0; this.hp = this.hpMax;
  }

  get alive(): boolean { return !this.dying; }

  hurtbox(): Rect {
    const x = this.x, y = this.y;
    if (this.spin) return { x: x - 6, y: y - 17, w: 12, h: 12 };
    if (this.prone) return { x: x - 11, y: y - 8, w: 22, h: 8 };
    return { x: x - 4, y: y - 25, w: 8, h: 25 };
  }
  center(): Vec { return { x: this.x, y: this.y - (this.prone ? 4 : 13) }; }

  private bob(): number { return this.onGround && this.vx !== 0 && (Math.floor(this.anim) % 2 === 1) ? -1 : 0; }

  die(pit = false): void {
    this.dying = true; this.deathT = 0; this.spin = false; this.prone = false; this.shield = 0;
    if (pit) { this.visible = false; this.deathT = 30; }
    else { this.vy = -3.6; this.vx = -this.facing * 1.1; }
    Sound.play('die');
    this.g.shake = Math.max(this.g.shake, 4);
  }

  update(): void {
    const g = this.g, I = Input.held, Pr = Input.pressed;
    this.t++;
    if (this.flash > 0) this.flash--;
    if (this.dying) {
      this.deathT++;
      if (this.visible && !this.deadGround) {
        this.vy = Math.min(this.vy + GRAV, MAX_FALL);
        moveBody(g, this, 4, 20);
        if (this.onGround) { this.deadGround = true; this.vx = 0; }
        if (this.y > H + 40) this.visible = false;
      }
      if (this.deathT > 80) g.onPlayerDown();
      return;
    }
    if (this.invuln > 0) this.invuln--;
    if (this.shield > 0) this.shield--;
    if (this.fireCd > 0) this.fireCd--;
    if (this.dropT > 0) this.dropT--;

    // ride moving platforms
    if (this.onGround && this.ground && this.ground.oneway && this.ground.moving) {
      this.x += this.ground.dx; this.y = this.ground.y;
    }

    const dir = (I.right ? 1 : 0) - (I.left ? 1 : 0);
    if (dir) this.facing = dir;
    this.prone = this.onGround && I.down && !dir;
    const aimUpStill = this.onGround && I.up && !dir;
    this.vx = (this.prone || aimUpStill) ? 0 : dir * RUN;

    // 8-way aim (relative to facing): x = 1 forward / 0 vertical, y = -1 up / 1 down
    let ax = 1, ay = 0;
    if (I.up) { if (dir) ay = -1; else { ax = 0; ay = -1; } }
    else if (I.down) { if (dir) ay = 1; else if (!this.onGround) { ax = 0; ay = 1; } }
    this.aimX = ax; this.aimY = ay;

    // jump with coyote time + input buffer; down+jump drops through platforms
    if (this.onGround) this.coyote = 6; else if (this.coyote > 0) this.coyote--;
    if (Pr.jump) this.jumpBuf = 7; else if (this.jumpBuf > 0) this.jumpBuf--;
    if (this.jumpBuf > 0 && (this.onGround || this.coyote > 0)) {
      this.jumpBuf = 0;
      if (I.down && this.onGround && this.ground && this.ground.oneway) {
        this.dropT = 14; this.onGround = false; this.ground = null; this.y += 1; this.prone = false;
      } else {
        this.vy = JUMP_V; this.onGround = false; this.ground = null; this.coyote = 0;
        this.spin = true; this.prone = false;
        Sound.play('jump');
      }
    }
    if (!I.jump && this.spin && this.vy < -2.2) this.vy = -2.2; // variable jump height

    this.vy = Math.min(this.vy + GRAV, MAX_FALL);
    moveBody(g, this, 4, 24, this.dropT > 0);
    if (this.onGround) this.spin = false;
    if (this.onGround && this.ground && this.ground.oneway && this.ground.crumble) this.ground.touched = true;

    const minX = g.cam.x + 6, maxX = g.cam.x + W - 6;
    if (this.x < minX) this.x = minX;
    if (this.x > maxX) this.x = maxX;
    if (this.y > H + 30) { g.playerFell(); return; }

    if (I.fire && this.fireCd <= 0) this.shoot(Pr.fire);
    if (this.onGround && this.vx !== 0) this.anim += 0.2; else if (this.onGround) this.anim = 0;
  }

  muzzle(): Vec {
    const f = this.facing, x = this.x, y = this.y;
    if (this.spin || (!this.onGround && this.aimX === 0)) return { x: x + this.aimX * f * 11, y: y - 11 + this.aimY * 11 };
    if (this.prone) return { x: x + f * 22, y: y - 3 };
    const by = this.bob();
    if (this.aimY === 0) return { x: x + f * 15, y: y - 18 + by };
    if (this.aimX === 0) return { x: x + f * 3, y: y - 39 + by };
    if (this.aimY < 0) return { x: x + f * 15, y: y - 32 + by };
    return { x: x + f * 15, y: y - 6 + by };
  }

  private shoot(fresh: boolean): void {
    const w = WEAPONS[this.weapon], g = this.g;
    let n = 0;
    for (const b of g.pBullets) if (!b.dead) n++;
    if (n >= w.max) return;
    const m = this.muzzle();
    let dx = this.aimX * this.facing, dy = this.aimY;
    if (this.prone) { dx = this.facing; dy = 0; }
    const len = Math.hypot(dx, dy) || 1;
    w.fire(g, m.x, m.y, dx / len, dy / len);
    Sound.play(w.snd);
    this.fireCd = fresh ? w.cd : w.hold;
    this.flash = 3;
  }

  draw(c: Ctx, cx: number): void {
    if (!this.visible) return;
    if (this.invuln > 0 && !this.dying && (this.t >> 2) % 2 === 0) return;
    const sx = Math.round(this.x - cx), sy = Math.round(this.y), f = this.facing;
    if (this.dying) {
      if (this.deadGround) drawProne(c, sx, sy, -f, PAL_PLAYER, false);
      else drawBall(c, sx, sy, this.t * 1.6, -f, PAL_PLAYER);
      return;
    }
    if (this.spin) drawBall(c, sx, sy, this.t, f, PAL_PLAYER);
    else if (this.prone) drawProne(c, sx, sy, f, PAL_PLAYER);
    else {
      const leg = !this.onGround ? 1 : this.vx !== 0 ? Math.floor(this.anim) % 4 : -1;
      const aim: Aim = { x: this.aimX, y: this.aimY };
      drawHumanoid(c, sx, sy, f, { pal: PAL_PLAYER, leg, aim, head: 'player', t: this.t, bob: this.bob() });
    }
    if (this.flash > 0) { const m = this.muzzle(); drawMuzzle(c, Math.round(m.x - cx), Math.round(m.y), this.weapon === 'W' || this.weapon === 'L'); }
    if (this.shield > 0 && (this.shield > 120 || (this.t >> 2) & 1)) {
      const cc = this.center();
      c.strokeStyle = ['#d68aff', '#7af0ff', '#ffffff'][(this.t >> 2) % 3];
      c.lineWidth = 1;
      c.beginPath(); c.arc(sx, cc.y, 15 + Math.sin(this.t * 0.3), 0, TAU); c.stroke();
    }
  }
}

// ---------------------------------------------------------------------------
// Enemy base
// ---------------------------------------------------------------------------
export abstract class Enemy {
  g: Game;
  x: number; y: number; vx = 0; vy = 0; w = 10; h = 24;
  hp = 1; score = 100; dead = false; dying = false; t = 0; flash = 0; facing = -1;
  contact = true; onGround = false; ground: Surface | null = null;
  offscreenKill = true; boom = 1; targetable = true; isBoss = false;
  /** Can be destroyed simply by touching it while the shield is up. */
  shieldKillable = true;

  constructor(g: Game, x: number, y: number) { this.g = g; this.x = x; this.y = y; }

  get player(): Player { return this.g.player; }
  /** Feet-anchored box by default. */
  box(): Rect { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }
  center(): Vec { return { x: this.x, y: this.y - this.h / 2 }; }
  hitTest(b: BulletLike): HitResult { return circleRect(b.x, b.y, b.r, this.box()) ? 1 : 0; }
  contactTest(pb: Rect): boolean { return this.contact && rectsOverlap(this.box(), pb); }

  damage(n: number): void {
    if (this.dead) return;
    this.hp -= n;
    this.flash = 3;
    if (this.hp <= 0) this.die(); else Sound.play('hit');
  }
  die(): void {
    this.dead = true;
    const c = this.center();
    this.g.explode(c.x, c.y, this.boom);
    this.g.addScore(this.score, c.x, c.y - 10);
  }
  physics(hw = 4): number {
    this.vy = Math.min(this.vy + GRAV, MAX_FALL);
    return moveBody(this.g, this, hw, this.h);
  }
  onScreen(m = 0): boolean { const c = this.g.cam.x; return this.x > c - m && this.x < c + W + m; }
  baseUpdate(): void {
    this.t++;
    if (this.flash > 0) this.flash--;
    if (this.y > H + 40) this.dead = true;
    if (this.offscreenKill && this.x < this.g.cam.x - 70) this.dead = true;
  }
  abstract update(): void;
  abstract draw(c: Ctx, cx: number): void;
  render(c: Ctx, cx: number): void {
    if (this.flash > 0) setTint('#ffffff');
    this.draw(c, cx);
    setTint(null);
  }
}

// ---------------------------------------------------------------------------
// Crimson Legion
// ---------------------------------------------------------------------------
/** Charges along the ground; some fire a single shot. */
export class Runner extends Enemy {
  dir: number; speed: number; anim = 0; shots: number; shotT: number; pause = 0; edgeChoice: boolean | null = null;
  constructor(g: Game, x: number, y: number, dir: number) {
    super(g, x, y);
    this.dir = dir; this.facing = dir;
    this.speed = rand(1.25, 1.6);
    this.shots = chance(0.3) ? 1 : 0;
    this.shotT = randi(20, 70);
  }
  update(): void {
    this.baseUpdate();
    if (this.dead) return;
    const g = this.g;
    if (this.dir > 0 && this.x > g.cam.x + W + 60) { this.dead = true; return; }
    if (this.pause > 0) { this.pause--; this.vx = 0; }
    else if (this.onGround) this.vx = this.dir * this.speed;
    const wall = this.physics(4);
    if (wall && this.onGround) this.vy = -4.6;
    if (this.onGround) {
      if (!g.hasFloor(this.x + this.dir * 7, this.y)) {
        if (this.edgeChoice === null) this.edgeChoice = chance(0.55);
        if (this.edgeChoice) { this.vy = -4.2; this.onGround = false; }
      } else this.edgeChoice = null;
      this.anim += 0.2;
    }
    if (this.shots > 0 && this.onGround && this.onScreen(-24) && --this.shotT <= 0) {
      const p = this.player;
      if (p.alive && Math.sign(p.x - this.x) === this.dir) {
        g.enemyShot(this.x + this.dir * 14, this.y - 18, this.dir > 0 ? 0 : Math.PI);
        this.shots--; this.pause = 16;
      } else this.shotT = 20;
    }
  }
  draw(c: Ctx, cx: number): void {
    const sx = Math.round(this.x - cx), sy = Math.round(this.y);
    const leg = !this.onGround ? 1 : this.vx !== 0 ? Math.floor(this.anim) % 4 : -1;
    drawHumanoid(c, sx, sy, this.facing, {
      pal: PAL_TROOPER, leg, aim: { x: 1, y: 0 }, head: 'trooper', t: this.t, bob: leg === 1 || leg === 3 ? -1 : 0,
    });
  }
}

/** Stationary shooter; the cover variant ducks behind sandbags. */
export class Rifleman extends Enemy {
  cover: boolean; crouched: boolean; cd: number; burst = 0; burstMax: number; coverT: number;
  aim: Aim = { x: 1, y: 0 };
  constructor(g: Game, x: number, y: number, cover: boolean) {
    super(g, x, y);
    this.score = 200; this.cover = cover; this.crouched = cover;
    this.cd = randi(40, 90); this.burstMax = chance(0.4) ? 3 : 1; this.coverT = randi(0, 80);
  }
  update(): void {
    this.baseUpdate();
    if (this.dead) return;
    this.vx = 0;
    this.physics(4);
    const p = this.player;
    this.facing = p.x < this.x ? -1 : 1;
    const ang = Math.atan2(-((p.y - 14) - (this.y - 18)), Math.abs(p.x - this.x));
    let ax = 1, ay = 0;
    if (ang > 1.15) { ax = 0; ay = -1; } else if (ang > 0.4) ay = -1; else if (ang < -0.4) ay = 1;
    this.aim = { x: ax, y: ay };
    if (this.cover) {
      this.coverT++;
      const ph = this.coverT % 150;
      this.crouched = ph < 90;
      if (ph === 110 && this.onScreen(-16) && p.alive) this.fire();
    } else if (this.onScreen(-16) && p.alive) {
      if (--this.cd <= 0) {
        this.fire();
        this.burst++;
        if (this.burst >= this.burstMax) { this.burst = 0; this.cd = this.g.mode === 'casual' ? randi(110, 160) : randi(80, 130); }
        else this.cd = 12;
      }
    }
    this.h = this.crouched ? 15 : 24;
  }
  private muzzle(): Vec {
    const f = this.facing, by = this.crouched ? 6 : 0, a = this.aim;
    if (a.y === 0) return { x: this.x + f * 15, y: this.y - 18 + by };
    if (a.x === 0) return { x: this.x + f * 3, y: this.y - 39 + by };
    if (a.y < 0) return { x: this.x + f * 15, y: this.y - 32 + by };
    return { x: this.x + f * 15, y: this.y - 6 + by };
  }
  private fire(): void {
    const m = this.muzzle(), p = this.player;
    const raw = Math.atan2((p.y - 13) - m.y, p.x - m.x);
    const snap = Math.round(raw / (Math.PI / 8)) * (Math.PI / 8);
    this.g.enemyShot(m.x, m.y, snap);
    this.g.particles.push(new Particle({ x: m.x, y: m.y, kind: 'flash', size: 3, life: 4, color: '#ffd23f' }));
  }
  draw(c: Ctx, cx: number): void {
    const sx = Math.round(this.x - cx), sy = Math.round(this.y);
    drawHumanoid(c, sx, sy, this.facing, { pal: PAL_TROOPER, leg: -1, aim: this.aim, head: 'trooper', t: this.t, crouch: this.crouched });
    if (this.cover) {
      const bx = this.facing > 0 ? sx + 5 : sx - 18;
      R(c, bx, sy - 6, 13, 6, '#8a7a52'); R(c, bx + 2, sy - 10, 9, 4, '#9a8a60');
      R(c, bx, sy - 6, 13, 1, '#b0a070'); R(c, bx + 6, sy - 6, 1, 6, '#6a5a3a'); R(c, bx + 2, sy - 10, 9, 1, '#b8a878');
    }
  }
}

/** Armoured gun emplacement that rises out of the ground. */
export class Turret extends Enemy {
  angle = Math.PI; rise = 0; cd = 50;
  constructor(g: Game, x: number, y: number) {
    super(g, x, y);
    this.hp = 10; this.score = 500; this.w = 20; this.h = 14; this.contact = false; this.boom = 2; this.shieldKillable = false;
  }
  hitTest(b: BulletLike): HitResult {
    if (!circleRect(b.x, b.y, b.r, this.box())) return 0;
    return this.rise < 1 ? 2 : 1;
  }
  update(): void {
    this.baseUpdate();
    if (this.dead) return;
    const p = this.player;
    if (this.rise < 1) {
      this.targetable = false;
      if (this.onScreen(-30)) this.rise = Math.min(1, this.rise + 0.04);
      return;
    }
    this.targetable = true;
    const cy = this.y - 9;
    const step = Math.PI / 8;
    const want = Math.round(Math.atan2((p.y - 13) - cy, p.x - this.x) / step) * step;
    if (this.t % 7 === 0) {
      const d = angNorm(want - this.angle);
      if (Math.abs(d) > 0.05) this.angle = angNorm(this.angle + Math.sign(d) * step);
    }
    if (--this.cd <= 0 && this.onScreen(-10) && p.alive) {
      if (Math.abs(angNorm(want - this.angle)) < 0.05) {
        this.g.enemyShot(this.x + Math.cos(this.angle) * 13, cy + Math.sin(this.angle) * 13, this.angle);
        this.cd = this.g.mode === 'casual' ? 110 : 80;
      } else this.cd = 4;
    }
  }
  draw(c: Ctx, cx: number): void {
    const sx = Math.round(this.x - cx), sy = Math.round(this.y);
    R(c, sx - 12, sy - 4, 24, 4, '#2a2e34'); R(c, sx - 11, sy - 4, 22, 1, '#6c7480');
    const by = sy + Math.round((1 - this.rise) * 12);
    c.save();
    c.beginPath(); c.rect(sx - 16, sy - 32, 32, 28); c.clip();
    R(c, sx - 10, by - 10, 20, 6, '#4a525c'); R(c, sx - 8, by - 14, 16, 4, '#59616c'); R(c, sx - 6, by - 16, 12, 2, '#6c7480');
    R(c, sx - 10, by - 10, 20, 1, '#7c8590'); R(c, sx - 9, by - 7, 2, 2, '#9b2d30'); R(c, sx + 7, by - 7, 2, 2, '#9b2d30');
    for (let i = 4; i <= 13; i++) {
      const px = Math.round(sx + Math.cos(this.angle) * i), py = Math.round(by - 9 + Math.sin(this.angle) * i);
      R(c, px - 1, py - 1, 3, 3, i > 11 ? '#8b95a3' : '#24282e');
    }
    R(c, sx - 2, by - 12, 4, 3, (this.t >> 3) & 1 ? '#ff3030' : '#ff9090');
    c.restore();
  }
}

/** Lobs arcing grenades (Legion heavy) or acid globs (hive spitter plant). */
export class Grenadier extends Enemy {
  skin: 'trooper' | 'spitter'; cd: number; throwT = 0;
  constructor(g: Game, x: number, y: number, skin: 'trooper' | 'spitter') {
    super(g, x, y);
    this.skin = skin;
    this.hp = skin === 'spitter' ? 4 : 2; this.score = 300; this.cd = randi(50, 90);
    if (skin === 'spitter') { this.w = 14; this.h = 20; }
  }
  update(): void {
    this.baseUpdate();
    if (this.dead) return;
    this.vx = 0;
    this.physics(4);
    const p = this.player;
    this.facing = p.x < this.x ? -1 : 1;
    if (this.throwT > 0) this.throwT--;
    if (this.onScreen(-10) && p.alive && --this.cd <= 0) {
      this.throwT = 14;
      const sx = this.x + this.facing * 4, sy = this.y - (this.skin === 'spitter' ? 18 : 28);
      const vx = clamp((p.x - sx) / 55, -2.6, 2.6);
      const vy = -3.6 + (p.y - this.y < -20 ? -1 : 0);
      this.g.eBullets.push(new EBullet(sx, sy, vx, vy, this.skin === 'spitter' ? 'spit' : 'grenade', { grav: 0.13 }));
      if (this.skin === 'spitter') Sound.play('spit');
      this.cd = this.g.mode === 'casual' ? randi(120, 150) : randi(90, 120);
    }
  }
  draw(c: Ctx, cx: number): void {
    const sx = Math.round(this.x - cx), sy = Math.round(this.y), f = this.facing;
    if (this.skin === 'trooper') {
      drawHumanoid(c, sx, sy, f, { pal: PAL_HEAVY, leg: -1, aim: null, head: 'trooper', t: this.t, throwing: this.throwT > 6 });
      return;
    }
    const P = pen(c, sx, sy, f);
    P(-2, -10, 4, 10, '#4a2a5a');
    P(-8, -3, 6, 3, '#3a6a2a'); P(2, -4, 6, 3, '#3a6a2a'); P(-8, -3, 6, 1, '#5a9a3a');
    disc(c, sx, sy - 15, 7, '#9a3a7a');
    disc(c, sx - f * 2, sy - 17, 2.5, '#c86aa8');
    const open = this.throwT > 0;
    P(2, -17, 6, open ? 5 : 2, open ? '#1a0010' : '#6a1a50');
    if (open) { P(3, -17, 1, 1, '#e8dcc0'); P(6, -17, 1, 1, '#e8dcc0'); P(4, -13, 2, 1, '#7cff4a'); }
    P(-5, -20, 2, 2, '#7cff4a'); P(-2, -22, 2, 2, '#7cff4a');
  }
}

/** Hovering attack drone (Legion) or winged hive flyer. */
export class Drone extends Enemy {
  baseY: number; state: 'enter' | 'hover' | 'leave' = 'enter'; st = 0; cd: number; phase: number;
  skin: 'mech' | 'bug'; hoverSX: number;
  constructor(g: Game, x: number, y: number, skin: 'mech' | 'bug') {
    super(g, x, y);
    this.baseY = y; this.skin = skin;
    this.hp = 2; this.score = 300; this.w = 18; this.h = 10;
    this.cd = randi(50, 90); this.phase = rand(0, TAU); this.hoverSX = rand(200, 320);
  }
  box(): Rect { return { x: this.x - 9, y: this.y - 5, w: 18, h: 10 }; }
  center(): Vec { return { x: this.x, y: this.y }; }
  update(): void {
    this.t++;
    if (this.flash > 0) this.flash--;
    const g = this.g, p = this.player;
    if (this.state === 'enter') { this.vx = -1.6; if (this.x - g.cam.x < this.hoverSX) { this.state = 'hover'; this.st = 0; } }
    else if (this.state === 'hover') { this.vx *= 0.9; if (++this.st > 170) this.state = 'leave'; }
    else this.vx = Math.max(this.vx - 0.05, -2.2);
    this.x += this.vx;
    this.y = this.baseY + Math.sin(this.t * 0.06 + this.phase) * 12;
    if (--this.cd <= 0 && this.onScreen(-10) && p.alive) {
      if (this.skin === 'mech') g.enemyShot(this.x, this.y + 4, Math.atan2(p.y - 13 - this.y, p.x - this.x), 1.8);
      else { g.eBullets.push(new EBullet(this.x, this.y + 4, 0, 0.5, 'spit', { grav: 0.12 })); Sound.play('spit'); }
      this.cd = randi(90, 130);
    }
    if (this.x < g.cam.x - 40) this.dead = true;
  }
  draw(c: Ctx, cx: number): void {
    const sx = Math.round(this.x - cx), sy = Math.round(this.y), fr = (this.t >> 1) & 1;
    if (this.skin === 'mech') {
      R(c, sx - 8, sy - 3, 16, 7, '#5a6270'); R(c, sx - 6, sy - 5, 12, 2, '#7c8590'); R(c, sx - 8, sy + 3, 16, 1, '#3a3f47');
      R(c, sx - 7, sy - 1, 3, 2, '#ff4040'); R(c, sx + 2, sy - 2, 5, 1, '#9b2d30');
      R(c, sx - 6, sy + 4, 3, 2, fr ? '#ffb030' : '#ff6a1a'); R(c, sx + 3, sy + 4, 3, 2, fr ? '#ff6a1a' : '#ffb030');
      R(c, sx - 1, sy - 8, 2, 3, '#3a3f47');
      if (fr) R(c, sx - 11, sy - 9, 22, 1, '#c8ced6'); else R(c, sx - 5, sy - 9, 10, 1, '#c8ced6');
    } else {
      c.fillStyle = 'rgba(200,240,255,0.55)';
      c.fillRect(sx - 3, fr ? sy - 9 : sy - 6, 9, 3);
      disc(c, sx + 5, sy + 1, 4, '#3a6a2a'); disc(c, sx, sy, 5, '#4a8a3a');
      R(c, sx + 3, sy - 1, 6, 1, '#2a4a1a');
      R(c, sx - 5, sy - 2, 2, 2, '#ff3030'); R(c, sx - 3, sy - 3, 2, 2, '#ff3030'); R(c, sx - 6, sy + 2, 2, 1, '#e8dcc0');
    }
  }
}

/** Supply capsule that flies across the screen carrying a power-up. */
export class Pod extends Enemy {
  drop: PickupType; baseY: number;
  constructor(g: Game, x: number, y: number, drop: PickupType) {
    super(g, x, y);
    this.drop = drop; this.baseY = y; this.vx = 1.7;
    this.score = 500; this.contact = false; this.offscreenKill = false; this.w = 16; this.h = 10; this.shieldKillable = false;
  }
  box(): Rect { return { x: this.x - 8, y: this.y - 5, w: 16, h: 10 }; }
  center(): Vec { return { x: this.x, y: this.y }; }
  update(): void {
    this.t++;
    if (this.flash > 0) this.flash--;
    this.x += this.vx;
    this.y = this.baseY + Math.sin(this.t * 0.06) * 16;
    if (this.x > this.g.cam.x + W + 30) this.dead = true;
  }
  die(): void { super.die(); this.g.spawnPickup(this.x, this.y, this.drop); }
  draw(c: Ctx, cx: number): void {
    const sx = Math.round(this.x - cx), sy = Math.round(this.y), up = (this.t >> 2) & 1;
    R(c, sx - 5, up ? sy - 9 : sy - 7, 8, 3, '#aab3bd'); R(c, sx - 5, up ? sy - 9 : sy - 7, 8, 1, '#e8ecf0');
    R(c, sx - 7, sy - 3, 14, 6, '#c8cdd4'); R(c, sx - 6, sy - 4, 12, 1, '#e8ecf0'); R(c, sx - 6, sy + 3, 12, 1, '#8a9099');
    R(c, sx - 1, sy - 3, 2, 6, '#3d7dca'); R(c, sx + 7, sy - 2, 2, 4, '#8a9099');
    R(c, sx - 6, sy - 1, 2, 2, (this.t >> 3) & 1 ? '#ffd23f' : '#7a5a10');
  }
}

/** Armoured supply crate; only vulnerable while its shutters are open. */
export class SupplyBox extends Enemy {
  drop: PickupType;
  constructor(g: Game, x: number, y: number, drop: PickupType) {
    super(g, x, y);
    this.drop = drop; this.hp = 4; this.score = 500; this.w = 22; this.h = 18;
    this.contact = false; this.boom = 2; this.shieldKillable = false;
  }
  openAmt(): number {
    const ph = this.t % 160;
    if (ph < 90) return 0;
    if (ph < 100) return (ph - 90) / 10;
    if (ph < 150) return 1;
    return (160 - ph) / 10;
  }
  hitTest(b: BulletLike): HitResult {
    if (!circleRect(b.x, b.y, b.r, this.box())) return 0;
    return this.openAmt() > 0.5 ? 1 : 2;
  }
  update(): void { this.baseUpdate(); this.targetable = this.openAmt() > 0.5; }
  die(): void { super.die(); this.g.spawnPickup(this.x, this.y - 10, this.drop); }
  draw(c: Ctx, cx: number): void {
    const sx = Math.round(this.x - cx), sy = Math.round(this.y), k = this.openAmt();
    R(c, sx - 11, sy - 18, 22, 18, '#3a3f47'); R(c, sx - 10, sy - 17, 20, 16, '#59616c'); R(c, sx - 10, sy - 17, 20, 1, '#8b95a3');
    R(c, sx - 10, sy - 4, 20, 2, '#9b2d30');
    R(c, sx - 7, sy - 14, 14, 9, '#10131a');
    if (k > 0) {
      disc(c, sx, sy - 10, 3.5, (this.t >> 2) & 1 ? '#ffffff' : '#ffd23f');
    }
    const sw = Math.round(7 * (1 - k));
    if (sw > 0) {
      R(c, sx - 7, sy - 14, sw, 9, '#7c8590'); R(c, sx + 7 - sw, sy - 14, sw, 9, '#7c8590');
      R(c, sx - 7, sy - 11, sw, 1, '#59616c'); R(c, sx + 7 - sw, sy - 11, sw, 1, '#59616c');
    }
    R(c, sx - 9, sy - 16, 1, 1, '#c8ced6'); R(c, sx + 8, sy - 16, 1, 1, '#c8ced6');
  }
}

// ---------------------------------------------------------------------------
// Hive creatures
// ---------------------------------------------------------------------------
export class Leaper extends Enemy {
  wait: number;
  constructor(g: Game, x: number, y: number) {
    super(g, x, y);
    this.hp = 2; this.score = 200; this.w = 14; this.h = 17; this.wait = randi(20, 60);
  }
  update(): void {
    this.baseUpdate();
    if (this.dead) return;
    const p = this.player;
    if (this.onGround) {
      this.vx *= 0.6;
      if (Math.abs(this.vx) < 0.1) this.vx = 0;
      if (this.onScreen(-8) && p.alive && --this.wait <= 0) {
        const dir = Math.sign(p.x - this.x) || -1;
        this.facing = dir;
        this.vx = dir * rand(1.6, 2.5);
        this.vy = -rand(3.6, 4.9);
        this.wait = randi(35, 75);
        this.onGround = false;
      }
    }
    this.physics(6);
  }
  draw(c: Ctx, cx: number): void {
    const sx = Math.round(this.x - cx), sy = Math.round(this.y), air = !this.onGround;
    const P = pen(c, sx, sy, this.facing);
    if (air) { P(-11, -6, 5, 2, '#4a2a6a'); P(-10, -4, 5, 2, '#4a2a6a'); }
    else { P(-7, -2, 3, 2, '#4a2a6a'); P(4, -2, 3, 2, '#4a2a6a'); P(-2, -2, 3, 2, '#4a2a6a'); }
    P(-7, air ? -11 : -9, 14, air ? 7 : 8, '#6a3a9a');
    P(-6, -12, 2, 2, '#9a6ad0'); P(-2, -13, 2, 2, '#9a6ad0'); P(2, -12, 2, 2, '#9a6ad0');
    P(4, air ? -12 : -10, 6, 5, '#7a4aaa');
    P(7, air ? -11 : -9, 2, 2, '#ff4040');
    P(9, air ? -8 : -6, 2, 2, '#e8dcc0');
    P(-3, -7, 2, 1, '#c8a0ff'); P(0, -6, 2, 1, '#c8a0ff');
  }
}

export class Crawler extends Enemy {
  dir: number; anim = 0;
  constructor(g: Game, x: number, y: number, dir: number) {
    super(g, x, y);
    this.hp = 1; this.score = 100; this.w = 12; this.h = 7; this.dir = dir; this.facing = dir;
  }
  update(): void {
    this.baseUpdate();
    if (this.dead) return;
    if (this.onGround && this.t % 60 === 0) { this.dir = Math.sign(this.player.x - this.x) || this.dir; this.facing = this.dir; }
    if (this.onGround) this.vx = this.dir * 0.9;
    const wall = this.physics(5);
    if (wall && this.onGround) this.vy = -3;
    this.anim += 0.25;
    if (this.dir > 0 && this.x > this.g.cam.x + W + 40) this.dead = true;
  }
  draw(c: Ctx, cx: number): void {
    const sx = Math.round(this.x - cx), sy = Math.round(this.y);
    const P = pen(c, sx, sy, this.facing), wig = Math.floor(this.anim) & 1;
    P(-6, -5 - wig, 4, 5, '#7acc3a'); P(-2, -7 + wig, 4, 7, '#8ad84a'); P(2, -6 - wig, 4, 6, '#7acc3a');
    P(5, -5, 3, 4, '#5a8a2a'); P(8, -5, 2, 1, '#e8dcc0'); P(8, -2, 2, 1, '#e8dcc0'); P(6, -4, 1, 1, '#ff3030');
    P(-5, -1, 1, 1, '#3a6a1a'); P(-1, -1, 1, 1, '#3a6a1a'); P(3, -1, 1, 1, '#3a6a1a');
  }
}

/** Pulsing egg sac that keeps hatching crawlers. */
export class Egg extends Enemy {
  cd: number; openT = 0;
  constructor(g: Game, x: number, y: number) {
    super(g, x, y);
    this.hp = 8; this.score = 500; this.w = 18; this.h = 20; this.cd = randi(40, 90); this.boom = 2; this.shieldKillable = false;
  }
  update(): void {
    this.baseUpdate();
    if (this.dead) return;
    if (this.openT > 0) {
      this.openT--;
      if (this.openT === 10) {
        const cr = new Crawler(this.g, this.x, this.y - 4, Math.sign(this.player.x - this.x) || -1);
        cr.vy = -2.5;
        this.g.enemies.push(cr);
      }
    } else if (this.onScreen(-16) && --this.cd <= 0 && this.g.count(Crawler) < 6) {
      this.openT = 30; this.cd = randi(120, 170);
    }
  }
  draw(c: Ctx, cx: number): void {
    const sx = Math.round(this.x - cx), sy = Math.round(this.y);
    const pulse = Math.sin(this.t * 0.1) * 0.6;
    disc(c, sx, sy - 9, 9 + pulse, '#b04878');
    R(c, sx - 8, sy - 4, 16, 4, '#8a3060');
    disc(c, sx - 3, sy - 13, 3, '#d878a8');
    R(c, sx - 5, sy - 15, 1, 9, '#7a2050'); R(c, sx + 4, sy - 14, 1, 8, '#7a2050');
    const k = this.openT > 0 ? Math.sin(((30 - this.openT) / 30) * Math.PI) : 0;
    const sw = Math.round(2 + k * 6);
    R(c, sx - (sw >> 1), sy - 15, sw, 10, k > 0.1 ? '#1a0010' : ((this.t >> 4) & 1 ? '#ffd04a' : '#e8a030'));
  }
}

/** Foundry hazard: a floor vent that periodically erupts. Indestructible. */
export class FlameJet extends Enemy {
  offset: number;
  constructor(g: Game, x: number, y: number, offset: number) {
    super(g, x, y);
    this.hp = 1e9; this.targetable = false; this.offset = offset; this.shieldKillable = false; this.w = 12; this.h = 4;
  }
  phase(): number { return (this.t + this.offset) % 160; }
  get active(): boolean { return this.phase() >= 115; }
  hitTest(): HitResult { return 0; }
  contactTest(pb: Rect): boolean { return this.active && rectsOverlap({ x: this.x - 6, y: this.y - 58, w: 12, h: 58 }, pb); }
  update(): void {
    this.baseUpdate();
    if (this.dead) return;
    const ph = this.phase();
    if (ph === 115 && this.onScreen(0)) Sound.play('flame');
    if (ph >= 95 && ph < 115 && this.t % 5 === 0) {
      this.g.particles.push(new Particle({ x: this.x + rand(-3, 3), y: this.y - 3, vy: -0.6, kind: 'smoke', size: 2, grow: 0.12, life: 24, color: '#7a7a7a' }));
    }
    if (this.active && this.t % 3 === 0) {
      this.g.particles.push(new Particle({ x: this.x + rand(-4, 4), y: this.y - rand(10, 50), vx: rand(-0.4, 0.4), vy: -rand(0.5, 1.4), kind: 'dot', size: 1, life: 20, color: '#ffd23f' }));
    }
  }
  draw(c: Ctx, cx: number): void {
    const sx = Math.round(this.x - cx), sy = Math.round(this.y), ph = this.phase();
    R(c, sx - 8, sy - 3, 16, 3, '#22262c'); R(c, sx - 7, sy - 3, 14, 1, '#6c7480');
    R(c, sx - 5, sy - 2, 2, 2, '#0a0a0a'); R(c, sx - 1, sy - 2, 2, 2, '#0a0a0a'); R(c, sx + 3, sy - 2, 2, 2, '#0a0a0a');
    if (ph >= 95 && ph < 115) R(c, sx - 6, sy - 5, 12, 2, (this.t >> 2) & 1 ? '#ff3030' : '#802020');
    if (this.active) {
      const hgt = Math.min(58, (ph - 115) * 9), fade = ph > 152;
      for (let y = 0; y < hgt; y += 4) {
        const wv = Math.round(4 + Math.sin((y + this.t * 3) * 0.3) * 1.5 + (fade ? -1 : 0));
        R(c, sx - wv - 1, sy - 3 - y - 4, wv * 2 + 2, 4, '#ff5a10');
        R(c, sx - wv + 2, sy - 3 - y - 4, Math.max(1, wv * 2 - 4), 4, y < hgt * 0.6 ? '#ffd23f' : '#ff9a2a');
      }
      R(c, sx - 2, sy - 3 - Math.min(hgt, 20), 4, Math.min(hgt, 20), '#fff6c0');
    }
  }
}

// ---------------------------------------------------------------------------
// Pickups
// ---------------------------------------------------------------------------
export class Pickup implements Body {
  x: number; y: number; vx = 0.6; vy = -3.2; onGround = false; ground: Surface | null = null;
  type: PickupType; t = 0; dead = false;
  constructor(x: number, y: number, type: PickupType) { this.x = x; this.y = y; this.type = type; }
  update(g: Game): void {
    this.t++;
    this.vy = Math.min(this.vy + 0.15, 3);
    moveBody(g, this, 6, 10);
    if (this.onGround) this.vx = 0;
    if (this.x < g.cam.x - 20 || this.y > H + 20) this.dead = true;
  }
  box(): Rect { return { x: this.x - 7, y: this.y - 12, w: 14, h: 12 }; }
  draw(c: Ctx, cx: number): void {
    const sx = Math.round(this.x - cx), sy = Math.round(this.y) - 6 + (this.onGround ? Math.round(Math.sin(this.t * 0.1)) : 0);
    drawBadge(c, sx, sy, this.type, this.t);
  }
}

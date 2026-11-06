// Stage bosses: Stormhawk Gunship, Magma Colossus, Hive Matriarch
import { W, GROUND, TAU, clamp, rand, randi, chance, circleRect, rectsOverlap } from './core.ts';
import { Sound } from './audio.ts';
import { R, pen, disc, setTint, GUN, GUNDK } from './art.ts';
import type { Ctx } from './art.ts';
import { Enemy, EBullet, Particle, Runner, Crawler, Leaper } from './entities.ts';
import type { BulletLike, HitResult, Rect, Solid, Vec } from './types.ts';
import type { Game } from './game.ts';

export abstract class Boss extends Enemy {
  maxHp = 100; dyingT = 0; name = '';
  constructor(g: Game, x: number, y: number) {
    super(g, x, y);
    this.isBoss = true; this.offscreenKill = false; this.shieldKillable = false; this.score = 10000;
  }
  get hpFrac(): number { return clamp(this.hp / this.maxHp, 0, 1); }
  damage(n: number): void {
    if (this.dying || this.dead) return;
    this.hp -= n;
    this.flash = 3;
    Sound.play('hit');
    if (this.hp <= 0) { this.hp = 0; this.startDeath(); }
  }
  startDeath(): void {
    this.dying = true;
    this.dyingT = 0;
    this.g.onBossDying(this);
  }
  /** Chain of explosions across `area`, then the final blast. */
  protected deathTick(area: Rect, dur: number): void {
    this.dyingT++;
    if (this.dyingT % 5 === 0) this.g.explode(rand(area.x, area.x + area.w), rand(area.y, area.y + area.h), chance(0.3) ? 2 : 1);
    if (this.dyingT >= dur) {
      this.dead = true;
      const c = this.center();
      this.g.explode(c.x, c.y, 4);
      this.g.addScore(this.score, c.x, c.y);
      this.g.onBossDead(this);
    }
  }
}

// ---------------------------------------------------------------------------
// Stage 1 — STORMHAWK GUNSHIP
// ---------------------------------------------------------------------------
type GunshipState = 'enter' | 'hover' | 'strafe' | 'spread' | 'drop' | 'sweep';

export class Gunship extends Boss {
  ax: number; state: GunshipState = 'enter'; st = 0; tx: number; ty = 50; cycle = 0; shots = 0;
  sweepA = 0; dirS = -1;
  constructor(g: Game, ax: number) {
    super(g, ax + W + 70, 46);
    this.ax = ax;
    this.maxHp = this.hp = g.mode === 'casual' ? 90 : 120;
    this.w = 68; this.h = 24; this.facing = -1; this.tx = ax + W - 90; this.boom = 3;
    this.name = 'STORMHAWK GUNSHIP';
  }
  box(): Rect { return { x: this.x - 34, y: this.y - 12, w: 68, h: 24 }; }
  center(): Vec { return { x: this.x, y: this.y }; }
  private nose(): Vec { return { x: this.x + this.facing * 34, y: this.y + 8 }; }
  private goTo(x: number, y: number, sp: number): boolean {
    const dx = x - this.x, dy = y - this.y, d = Math.hypot(dx, dy);
    if (d <= sp) { this.x = x; this.y = y; return true; }
    this.x += (dx / d) * sp; this.y += (dy / d) * sp;
    return false;
  }
  private next(s: GunshipState): void { this.state = s; this.st = 0; this.shots = 0; }
  private pickAttack(p2: boolean): void {
    const list: GunshipState[] = p2 ? ['strafe', 'sweep', 'spread', 'drop', 'strafe', 'spread'] : ['strafe', 'spread', 'drop', 'spread'];
    this.next(list[this.cycle++ % list.length]);
  }
  update(): void {
    this.t++;
    if (this.flash > 0) this.flash--;
    const g = this.g;
    if (this.t % 10 === 0) Sound.play('rotor');
    if (this.dying) {
      this.y += 0.5; this.x += this.facing * 0.4;
      if (this.t % 3 === 0) g.particles.push(new Particle({ x: this.x + rand(-20, 20), y: this.y - 10, vy: -0.5, kind: 'smoke', size: 4, grow: 0.15, life: 40, color: '#3a3a3a' }));
      this.deathTick(this.box(), 150);
      return;
    }
    const p = this.player, p2 = this.hp < this.maxHp / 2;
    this.st++;
    if (p2 && this.t % 6 === 0) g.particles.push(new Particle({ x: this.x - this.facing * 10, y: this.y - 16, vy: -0.6, kind: 'smoke', size: 3, grow: 0.12, life: 36, color: '#444444' }));
    switch (this.state) {
      case 'enter':
        if (this.goTo(this.tx, this.ty, 1.6)) this.next('hover');
        break;
      case 'hover': {
        const hx = clamp(p.x + (this.x > p.x ? 90 : -90), this.ax + 50, this.ax + W - 50);
        this.x += clamp(hx - this.x, -0.8, 0.8);
        this.y = this.ty + Math.sin(this.t * 0.05) * 6;
        this.facing = p.x < this.x ? -1 : 1;
        const every = p2 ? 34 : 48;
        if (this.st % every === 0 && p.alive) {
          const n = this.nose(), a = Math.atan2(p.y - 13 - n.y, p.x - n.x);
          for (let k = -1; k <= 1; k++) g.enemyShot(n.x, n.y, a + k * 0.14, 2.1);
        }
        if (this.st > (p2 ? 120 : 160)) this.pickAttack(p2);
        break;
      }
      case 'strafe':
        if (this.st === 1) { this.dirS = this.x > this.ax + W / 2 ? -1 : 1; this.facing = this.dirS; }
        this.y += (34 - this.y) * 0.08;
        this.x += this.dirS * (p2 ? 2.6 : 2.0);
        if (this.st % (p2 ? 12 : 18) === 0) g.eBullets.push(new EBullet(this.x, this.y + 12, this.dirS * 0.6, 0.5, 'bomb', { grav: 0.14 }));
        if ((this.dirS < 0 && this.x < this.ax + 50) || (this.dirS > 0 && this.x > this.ax + W - 50)) this.next('hover');
        break;
      case 'spread':
        if (this.goTo(this.ax + W / 2, 44, 1.6) && this.st % 28 === 0) {
          const n = p2 ? 9 : 7;
          for (let i = 0; i < n; i++) g.enemyShot(this.x, this.y + 10, Math.PI * 0.15 + (Math.PI * 0.7 * i) / (n - 1), 1.9);
          if (++this.shots >= (p2 ? 4 : 3)) this.next('hover');
        }
        break;
      case 'drop':
        if (this.st === 20 && g.count(Runner) < 3) {
          for (let i = 0; i < 2; i++) {
            const r = new Runner(g, this.x + (i ? 10 : -10), this.y + 14, p.x < this.x ? -1 : 1);
            r.vy = 0.5;
            g.enemies.push(r);
          }
        }
        if (this.st > 50) this.next('hover');
        break;
      case 'sweep':
        this.y += (40 - this.y) * 0.05;
        if (this.st === 1) this.sweepA = this.facing < 0 ? Math.PI * 0.95 : Math.PI * 0.05;
        if (this.st % 5 === 0) {
          const n = this.nose();
          g.enemyShot(n.x, n.y, this.sweepA, 2.4);
          this.sweepA += (this.facing < 0 ? -1 : 1) * 0.15;
        }
        if (this.st > 72) this.next('hover');
        break;
    }
    this.x = clamp(this.x, this.ax + 30, this.ax + W + 80);
  }
  draw(c: Ctx, cx: number): void {
    const sx = Math.round(this.x - cx), sy = Math.round(this.y), f = this.facing, P = pen(c, sx, sy, f);
    const hull = '#4a5a4f', lt = '#6d8072', dk = '#2c3830';
    P(-54, -5, 30, 5, dk); P(-54, -5, 30, 1, lt);
    P(-58, -15, 6, 12, hull); P(-58, -15, 6, 1, lt);
    P(-61, -21, 2, 12, (this.t >> 1) & 1 ? '#c8ced6' : '#5a6270');
    P(-26, -11, 52, 20, hull); P(-24, -14, 40, 3, lt); P(-26, -11, 52, 2, lt); P(-22, 9, 44, 4, dk);
    P(-20, -2, 34, 2, '#9b2d30');
    P(14, -9, 13, 10, '#4fc8ff'); P(17, -8, 5, 2, '#d8f6ff'); P(14, -9, 13, 1, dk);
    P(26, -4, 6, 11, dk);
    P(-8, 2, 24, 4, dk); P(-6, 6, 9, 4, '#7a2a2a'); P(6, 6, 9, 4, '#7a2a2a');
    P(26, 7, 9, 3, GUNDK); P(33, 7, 3, 2, GUN);
    P(-3, -18, 6, 4, dk);
    const bl = [44, 30, 10, 30][this.t % 4];
    R(c, sx - bl, sy - 19, bl * 2, 2, '#c8ced6');
    if ((this.t >> 4) & 1) P(-25, -10, 2, 2, '#ff3030');
  }
}

// ---------------------------------------------------------------------------
// Stage 2 — MAGMA COLOSSUS (walker mech, weak point: chest reactor)
// ---------------------------------------------------------------------------
type ColossusState = 'enter' | 'idle' | 'walk' | 'cannon' | 'missiles' | 'stomp' | 'laser';

export class Colossus extends Boss {
  ax: number; state: ColossusState = 'enter'; st = 0; walk = 0; lastStep = 0; walkTo = 0; cycle = 0; shots = 0;
  air = 0; jumpVy = 0; charge = 0; beam = 0;
  constructor(g: Game, ax: number) {
    super(g, ax + W + 50, GROUND);
    this.ax = ax;
    this.maxHp = this.hp = g.mode === 'casual' ? 130 : 170;
    this.facing = -1; this.score = 15000;
    this.name = 'MAGMA COLOSSUS';
  }
  private get by(): number { return this.y - this.air; }
  core(): Rect { return { x: this.x - 36, y: this.by - 92, w: 22, h: 28 }; }
  private torso(): Rect { return { x: this.x - 32, y: this.by - 100, w: 64, h: 48 }; }
  private head(): Rect { return { x: this.x - 12, y: this.by - 114, w: 24, h: 14 }; }
  private legs(): Rect { return { x: this.x - 28, y: this.by - 52, w: 56, h: 52 }; }
  private beamRect(): Rect { const tip = this.x - 60; return { x: this.ax - 10, y: GROUND - 22, w: tip - this.ax + 10, h: 7 }; }
  center(): Vec { const r = this.core(); return { x: r.x + r.w / 2, y: r.y + r.h / 2 }; }
  hitTest(b: BulletLike): HitResult {
    if (circleRect(b.x, b.y, b.r, this.core())) return 1;
    if (circleRect(b.x, b.y, b.r, this.torso()) || circleRect(b.x, b.y, b.r, this.head()) || circleRect(b.x, b.y, b.r, this.legs())) return 2;
    return 0;
  }
  contactTest(pb: Rect): boolean {
    if (rectsOverlap(pb, this.legs()) || rectsOverlap(pb, this.torso())) return true;
    return this.beam > 0 && rectsOverlap(pb, this.beamRect());
  }
  private next(s: ColossusState): void { this.state = s; this.st = 0; this.shots = 0; }
  private pick(p2: boolean): void {
    const list: ColossusState[] = p2
      ? ['cannon', 'laser', 'missiles', 'stomp', 'walk', 'laser', 'cannon', 'stomp']
      : ['cannon', 'walk', 'missiles', 'stomp', 'walk', 'cannon'];
    const s = list[this.cycle++ % list.length];
    if (s === 'walk') this.walkTo = this.x > this.ax + W - 110 ? this.ax + 230 : this.ax + W - 70;
    this.next(s);
  }
  private walkStep(sp: number): void {
    this.x += sp;
    this.walk += Math.abs(sp) * 0.09;
    const step = Math.floor(this.walk / Math.PI);
    if (step !== this.lastStep) { this.lastStep = step; Sound.play('stomp'); this.g.shake = Math.max(this.g.shake, 2); }
  }
  private land(): void {
    const g = this.g;
    Sound.play('stomp');
    g.shake = 6;
    g.eBullets.push(new EBullet(this.x - 30, GROUND - 6, -2.4, 0, 'shock', { minX: this.ax - 10, maxX: this.ax + W + 10 }));
    g.eBullets.push(new EBullet(this.x + 30, GROUND - 6, 2.4, 0, 'shock', { minX: this.ax - 10, maxX: this.ax + W + 10 }));
    for (let i = 0; i < 10; i++) g.particles.push(new Particle({ x: this.x + rand(-30, 30), y: GROUND - 2, vx: rand(-1.5, 1.5), vy: -rand(0.3, 1.5), kind: 'smoke', size: 3, grow: 0.1, life: 30, color: '#6a5a4a' }));
  }
  update(): void {
    this.t++;
    if (this.flash > 0) this.flash--;
    if (this.dying) { this.beam = 0; this.deathTick({ x: this.x - 32, y: this.y - 110, w: 64, h: 110 }, 170); return; }
    const g = this.g, p = this.player, p2 = this.hp < this.maxHp / 2;
    this.st++;
    if (this.air > 0 || this.jumpVy !== 0) {
      this.air += this.jumpVy;
      this.jumpVy -= 0.25;
      if (this.air <= 0) { this.air = 0; this.jumpVy = 0; this.land(); }
    }
    switch (this.state) {
      case 'enter':
        this.walkStep(-0.7);
        if (this.x <= this.ax + W - 70) this.next('idle');
        break;
      case 'idle':
        if (this.st > (p2 ? 26 : 40)) this.pick(p2);
        break;
      case 'walk': {
        const d = this.walkTo - this.x;
        if (Math.abs(d) < 1) this.next('idle'); else this.walkStep(Math.sign(d) * (p2 ? 0.9 : 0.6));
        break;
      }
      case 'cannon':
        if (this.st % 22 === 0 && this.shots < 3) {
          const tx = this.x - 60, ty = this.by - 78;
          g.eBullets.push(new EBullet(tx, ty, clamp((p.x - tx) / 72, -3.5, -0.5), -2.6, 'fireball', { grav: 0.1 }));
          Sound.play('wave');
          this.shots++;
        }
        if (this.st > 80) this.next('idle');
        break;
      case 'missiles':
        if (this.st % 10 === 0 && this.shots < (p2 ? 6 : 4)) {
          const tx = clamp(p.x + (this.shots - 1.5) * 34 + rand(-8, 8), this.ax + 10, this.x - 40);
          g.eBullets.push(new EBullet(this.x + 34, this.by - 112, rand(-0.6, 0.2), -3, 'missile', { tx }));
          Sound.play('homing');
          this.shots++;
        }
        if (this.st > 110) this.next('idle');
        break;
      case 'stomp':
        if (this.st === 20) { this.jumpVy = 4.2; Sound.play('jump'); }
        if (this.st > 30 && this.air === 0 && this.jumpVy === 0) this.next('idle');
        break;
      case 'laser':
        if (this.st === 1) Sound.play('charge');
        if (this.st <= 55) this.charge = this.st / 55;
        if (this.st === 55) { this.beam = 50; Sound.play('beam'); g.shake = 3; }
        if (this.st > 55) {
          if (this.beam > 0) this.beam--;
          if (this.beam === 0) { this.charge = 0; this.next('idle'); }
        }
        break;
    }
    this.x = clamp(this.x, this.ax + 220, this.ax + W + 60);
  }
  draw(c: Ctx, cx: number): void {
    const sx = Math.round(this.x - cx), by = Math.round(this.by), P = pen(c, sx, by, 1);
    const m = '#6a6f7a', mdk = '#3e424b', mlt = '#9aa1ad';
    const s1 = Math.sin(this.walk);
    const leg = (lx: number, lift: number) => {
      const l = Math.round(lift);
      P(lx, -52, 12, 24 - l, m); P(lx + 2, -30 - l, 8, 4, mlt); P(lx + 1, -28 - l, 10, 22, mdk); P(lx - 3, -6 - l, 18, 6, '#2a2d33');
    };
    leg(-26, Math.max(0, s1) * 6);
    leg(14, Math.max(0, -s1) * 6);
    P(-28, -56, 56, 8, mdk);
    P(-32, -100, 64, 46, m); P(-32, -100, 64, 3, mlt); P(-30, -60, 60, 4, mdk);
    P(-12, -94, 18, 30, '#5a5f6a'); P(10, -94, 18, 30, '#5a5f6a');
    for (let i = 0; i < 6; i++) P(-24 + i * 8, -64, 4, 3, '#e0b020');
    P(-42, -104, 14, 16, mdk); P(28, -104, 14, 16, mdk); P(-42, -104, 14, 2, mlt); P(28, -104, 14, 2, mlt);
    P(28, -116, 16, 12, '#7a2a2a'); P(30, -114, 3, 3, '#1a1a1a'); P(35, -114, 3, 3, '#1a1a1a'); P(40, -114, 3, 3, '#1a1a1a');
    P(-12, -114, 24, 14, m); P(-12, -114, 24, 2, mlt);
    P(-9, -108, 14, 3, this.charge > 0 ? ((this.t >> 1) & 1 ? '#ffffff' : '#ff5050') : '#ff3030');
    // chest reactor (weak point)
    const cr = this.core(), ccx = Math.round(cr.x + cr.w / 2 - cx), ccy = Math.round(cr.y + cr.h / 2);
    const pulse = (this.t >> 3) & 1;
    disc(c, ccx, ccy, 13, '#2a2d33');
    disc(c, ccx, ccy, 10, pulse ? '#ff6a1a' : '#ff9a2a');
    disc(c, ccx, ccy, 6, '#ffd23f');
    disc(c, ccx, ccy, 2.5, '#fff6c0');
    if (this.state === 'laser') {
      P(-46, -92, 10, 70, mdk); P(-58, -26, 22, 10, GUNDK); P(-58, -26, 22, 2, GUN);
      R(c, sx - 62, GROUND - 23, 4, 8, this.charge > 0.5 && (this.t >> 1) & 1 ? '#ffffff' : '#ff3030');
    } else {
      P(-46, -96, 10, 24, mdk); P(-60, -82, 26, 10, GUNDK); P(-60, -82, 26, 2, GUN); P(-62, -80, 3, 6, '#1a1a1a');
    }
    if (this.beam > 0) {
      const br = this.beamRect(), bx = Math.round(br.x - cx), flick = (this.t >> 1) & 1;
      R(c, bx, br.y - 1, br.w, br.h + 2, flick ? '#ff3a3a' : '#ff7a3a');
      R(c, bx, br.y + 2, br.w, 3, '#fff0f0');
    } else if (this.charge > 0 && (this.t >> 1) & 1) {
      R(c, Math.round(this.ax - cx), GROUND - 19, sx - 62 - Math.round(this.ax - cx), 1, '#ff3030');
    }
  }
}

// ---------------------------------------------------------------------------
// Stage 3 — HIVE MATRIARCH (organic wall: two maws, then the great eye)
// ---------------------------------------------------------------------------
interface Part { x: number; y: number; hp: number; max: number; open: number; flash: number; dead: boolean; timer: number; }

export class Matriarch extends Boss {
  ax: number; wx: number; maws: Part[]; eye: Part; state: 'rise' | 'fight' = 'rise'; st = 0;
  private part: Part | null = null;
  private wasP2 = false;
  private readonly wall: Solid;
  constructor(g: Game, ax: number) {
    super(g, ax + W - 44, GROUND);
    this.ax = ax; this.wx = ax + W - 92;
    const cas = g.mode === 'casual';
    const mk = (x: number, y: number, hp: number): Part => ({ x, y, hp, max: hp, open: 0, flash: 0, dead: false, timer: randi(0, 60) });
    this.maws = [mk(this.wx + 4, 66, cas ? 28 : 36), mk(this.wx + 4, 150, cas ? 28 : 36)];
    this.maws[1].timer += 95;
    this.eye = mk(this.wx + 18, 108, cas ? 90 : 120);
    this.maxHp = this.maws[0].max + this.maws[1].max + this.eye.max;
    this.hp = this.maxHp;
    this.contact = false; this.score = 20000;
    this.name = 'HIVE MATRIARCH';
    this.wall = { x: this.wx + 8, y: -200, w: 300, h: 600, invisible: true };
    g.solids.push(this.wall);
  }
  private get phase2(): boolean { return this.maws.every(m => m.dead); }
  private recalc(): void { this.hp = this.maws.reduce((s, m) => s + Math.max(0, m.hp), 0) + Math.max(0, this.eye.hp); }
  center(): Vec {
    for (const m of this.maws) if (!m.dead && m.open > 0.5) return { x: m.x, y: m.y };
    if (this.phase2) return { x: this.eye.x, y: this.eye.y };
    const alive = this.maws.find(m => !m.dead);
    return alive ? { x: alive.x, y: alive.y } : { x: this.eye.x, y: this.eye.y };
  }
  hitTest(b: BulletLike): HitResult {
    if (this.state === 'rise') return b.x > this.wx ? 2 : 0;
    for (const m of this.maws) {
      if (m.dead) continue;
      if (circleRect(b.x, b.y, b.r, { x: m.x - 13, y: m.y - 11, w: 26, h: 22 })) {
        if (m.open > 0.6) { this.part = m; return 1; }
        return 2;
      }
    }
    const e = this.eye;
    if (circleRect(b.x, b.y, b.r, { x: e.x - 15, y: e.y - 13, w: 30, h: 26 })) {
      if (this.phase2 && e.open > 0.6) { this.part = e; return 1; }
      return 2;
    }
    return b.x > this.wx ? 2 : 0;
  }
  damage(n: number): void {
    const p = this.part;
    this.part = null;
    if (!p || p.dead || this.dying) return;
    p.hp -= n; p.flash = 3;
    Sound.play('hit');
    if (p.hp <= 0) {
      p.hp = 0; p.dead = true;
      if (p === this.eye) { this.recalc(); this.startDeath(); return; }
      this.g.explode(p.x, p.y, 3);
      this.g.addScore(3000, p.x, p.y);
      Sound.play('roar');
    }
    this.recalc();
  }
  private ring(n: number, off: number): void {
    const e = this.eye;
    for (let i = 0; i < n; i++) this.g.enemyShot(e.x - 10, e.y, off + (i * TAU) / n, 1.6);
  }
  update(): void {
    this.t++;
    for (const m of this.maws) if (m.flash > 0) m.flash--;
    if (this.eye.flash > 0) this.eye.flash--;
    const g = this.g;
    if (this.dying) { this.deathTick({ x: this.wx, y: 20, w: 92, h: 156 }, 190); return; }
    if (this.state === 'rise') {
      if (++this.st === 1) Sound.play('roar');
      g.shake = Math.max(g.shake, 2);
      if (this.st > 80) { this.state = 'fight'; this.st = 0; }
      return;
    }
    this.st++;
    const p = this.player, p2 = this.phase2, cas = g.mode === 'casual';
    this.maws.forEach((m, i) => {
      if (m.dead) { if (this.t % 8 === i * 4) g.particles.push(new Particle({ x: m.x, y: m.y, vy: -0.5, kind: 'smoke', size: 3, grow: 0.1, life: 30, color: '#3a2a30' })); return; }
      m.timer++;
      const cyc = m.timer % 190;
      m.open = cyc < 110 ? 0 : cyc < 120 ? (cyc - 110) / 10 : cyc < 180 ? 1 : (190 - cyc) / 10;
      if (cyc >= 120 && cyc < 180 && (cyc - 120) % 20 === 0 && p.alive) {
        if (i === 0) {
          const vx = clamp((p.x - m.x) / 60, -3.2, -0.6);
          g.eBullets.push(new EBullet(m.x - 10, m.y, vx, -2.2 + rand(-0.4, 0.4), 'spit', { grav: 0.12 }));
          Sound.play('spit');
        } else if (cyc === 120 && g.count(Crawler) < 5) {
          const cr = new Crawler(g, m.x - 16, GROUND - 2, -1);
          cr.vy = -2;
          g.enemies.push(cr);
        } else {
          g.enemyShot(m.x - 12, m.y, Math.atan2(p.y - 14 - m.y, p.x - m.x), 2.0);
        }
      }
    });
    const e = this.eye;
    if (p2 && !this.wasP2) { this.wasP2 = true; e.timer = 0; Sound.play('roar'); g.shake = 5; }
    e.timer++;
    if (!p2) {
      const cyc = e.timer % 330;
      e.open = cyc < 240 ? 0 : cyc < 250 ? (cyc - 240) / 10 : cyc < 320 ? 1 : (330 - cyc) / 10;
      if (cyc === 260 || cyc === 295) this.ring(8, cyc * 0.1);
    } else {
      const cyc = e.timer % 210;
      e.open = cyc < 10 ? cyc / 10 : cyc < 150 ? 1 : cyc < 160 ? (160 - cyc) / 10 : 0;
      if (cyc > 10 && cyc < 150 && p.alive) {
        if (cyc % 40 === 20) {
          const a = Math.atan2(p.y - 14 - e.y, p.x - e.x);
          for (let k = -1; k <= 1; k++) g.enemyShot(e.x - 14, e.y, a + k * 0.18, 2.2);
        }
        if (cyc % 70 === 50) this.ring(cas ? 10 : 12, e.timer * 0.05);
      }
      if (this.st % 60 === 0) g.eBullets.push(new EBullet(rand(this.ax + 20, this.wx - 20), -6, 0, 0.7, 'spore'));
      if (this.st % 240 === 120 && g.count(Leaper) < 2) g.enemies.push(new Leaper(g, this.wx - 6, GROUND - 1));
    }
  }
  private drawMaw(c: Ctx, x: number, y: number, m: Part): void {
    if (m.dead) { disc(c, x, y, 11, '#1a0a10'); disc(c, x, y, 6, '#2a1018'); return; }
    if (m.flash > 0) setTint('#ffffff');
    const hh = Math.round(2 + m.open * 8);
    R(c, x - 14, y - hh - 4, 28, 4, '#8a2a5a'); R(c, x - 14, y + hh, 28, 4, '#8a2a5a');
    R(c, x - 13, y - hh - 4, 26, 1, '#c05a8a');
    R(c, x - 12, y - hh, 24, hh * 2, '#1a0010');
    if (m.open > 0.3) disc(c, x + 2, y, hh * 0.6, '#7cff4a');
    for (let i = 0; i < 6; i++) { R(c, x - 11 + i * 4, y - hh, 2, 3, '#e8dcc0'); R(c, x - 9 + i * 4, y + hh - 3, 2, 3, '#e8dcc0'); }
    setTint(null);
  }
  private drawEye(c: Ctx, x: number, y: number): void {
    const e = this.eye, p = this.player;
    disc(c, x, y, 17, '#2a0a20');
    if (e.flash > 0) setTint('#ffffff');
    if (e.open < 0.05) {
      disc(c, x, y, 15, '#7a2252'); R(c, x - 14, y - 1, 28, 2, '#3a0a28');
    } else {
      c.save();
      c.beginPath(); c.ellipse(x, y, 15, Math.max(1, 13 * e.open), 0, 0, TAU); c.clip();
      disc(c, x, y, 15, '#f0e0d0');
      R(c, x - 12, y - 3, 6, 1, '#d06070'); R(c, x + 6, y + 4, 6, 1, '#d06070');
      const a = Math.atan2(p.y - 14 - y, p.x - (x + this.g.cam.x));
      const ix = Math.round(x + Math.cos(a) * 5), iy = Math.round(y + Math.sin(a) * 4);
      disc(c, ix, iy, 7, this.phase2 ? '#ff3a3a' : '#a03a6a');
      R(c, ix - 1, iy - 5, 2, 10, '#1a0000');
      if (!this.phase2) { c.globalAlpha = 0.35; disc(c, x, y, 15, '#b0ffd0'); c.globalAlpha = 1; }
      c.restore();
      R(c, x - 15, Math.round(y - 13 * e.open) - 1, 30, 2, '#7a2252');
      R(c, x - 15, Math.round(y + 13 * e.open) - 1, 30, 2, '#7a2252');
    }
    setTint(null);
  }
  draw(c: Ctx, cx: number): void {
    const rise = this.state === 'rise' ? Math.min(1, this.st / 80) : 1;
    const ox = Math.round((1 - rise) * 110);
    const wx = Math.round(this.wx - cx) + ox, t = this.t;
    R(c, wx + 10, 0, W - wx, 216, '#3e1030');
    for (let y = 0; y < 216; y += 4) {
      const bulge = Math.round(9 + Math.sin(y * 0.07 + t * 0.05) * 4);
      R(c, wx + 10 - bulge, y, bulge, 4, '#5a1a40');
      R(c, wx + 10 - bulge, y, 2, 4, '#7a2a5a');
    }
    for (let k = 0; k < 5; k++) {
      const y = 24 + k * 38;
      R(c, wx + 8, y, 80, 3, '#d8cbb0'); R(c, wx + 8, y + 3, 80, 1, '#8a7b62');
    }
    for (let k = 0; k < 4; k++) {
      const vy = 40 + k * 40, pulse = (t + k * 10) % 60 < 30 ? '#a02a6a' : '#7a2a5a';
      R(c, wx + 30 + k * 12, vy, 2, 30, pulse);
    }
    this.drawEye(c, Math.round(this.eye.x - cx) + ox, this.eye.y);
    for (const m of this.maws) this.drawMaw(c, Math.round(m.x - cx) + ox, m.y, m);
  }
  /** Parts handle their own flash; skip the whole-body tint. */
  render(c: Ctx, cx: number): void { this.draw(c, cx); }
}

export function createBoss(kind: 'gunship' | 'colossus' | 'matriarch', g: Game, ax: number): Boss {
  if (kind === 'gunship') return new Gunship(g, ax);
  if (kind === 'colossus') return new Colossus(g, ax);
  return new Matriarch(g, ax);
}

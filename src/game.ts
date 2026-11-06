// Game state machine: title, stage intro, gameplay, boss fights, clear, game over, ending
import { W, H, GROUND, TAU, DEBUG, Input, Store, clamp, rand, randi, chance, pick, pad, circleRect, rectsOverlap } from './core.ts';
import { Sound } from './audio.ts';
import {
  Text, R, makeBackdrop, drawBackdrop, drawPitFill, drawSolid, drawPlatform, drawWater, drawDecor,
  drawMedal, drawBadge, drawHumanoid, WEAPON_STYLE, PAL_PLAYER,
} from './art.ts';
import type { Backdrop, Ctx } from './art.ts';
import {
  Player, Enemy, PBullet, EBullet, Pickup, Particle,
  Runner, Rifleman, Turret, Grenadier, Drone, Pod, SupplyBox, Leaper, Crawler, Egg, FlameJet,
} from './entities.ts';
import { createBoss } from './bosses.ts';
import type { Boss } from './bosses.ts';
import { LEVELS } from './levels.ts';
import type { GameMode, LevelDef, PickupType, Platform, Solid, SpawnDef, ThemeName, WeaponType, ZoneDef } from './types.ts';

type State = 'title' | 'controls' | 'intro' | 'play' | 'clear' | 'gameover' | 'victory';
type BossPhase = 'none' | 'warning' | 'fight' | 'dead';
interface Zone extends ZoneDef { t: number; }
type EnemyClass = abstract new (...args: never[]) => Enemy;

const EXTRA_LIFE_EVERY = 30000;

export class Game {
  readonly ctx: Ctx;
  state: State = 'title';
  t = 0;
  menu = 0;
  pauseSel = 0;
  mode: GameMode;

  hiscore: number;
  score = 0;
  lives = 3;
  continues = 3;
  nextLife = EXTRA_LIFE_EVERY;
  stage = 0;

  level: LevelDef;
  solids: Solid[] = [];
  platforms: Platform[] = [];
  zones: Zone[] = [];
  enemies: Enemy[] = [];
  pBullets: PBullet[] = [];
  eBullets: EBullet[] = [];
  pickups: Pickup[] = [];
  particles: Particle[] = [];
  player: Player;
  cam = { x: 0 };
  spawnIdx = 0;

  boss: Boss | null = null;
  bossPhase: BossPhase = 'none';
  bossT = 0;

  shake = 0;
  flashT = 0;
  paused = false;
  introT = 0;
  clearT = 0;
  bonus = 0;
  bonusPaid = 0;
  goT = 0;
  contT = 0;
  vicT = 0;
  titleCam = 0;
  carryWeapon: WeaponType = 'N';

  private readonly bgCache = new Map<ThemeName, Backdrop>();
  bg: Backdrop;
  private botHold = 0;

  constructor(ctx: Ctx) {
    this.ctx = ctx;
    this.mode = Store.get('iv_mode', 'arcade') === 'casual' ? 'casual' : 'arcade';
    this.hiscore = parseInt(Store.get('iv_hi', '20000'), 10) || 20000;
    this.bg = this.getBG('jungle');
    this.level = LEVELS[0]();
    this.player = new Player(this);
    if (DEBUG.stage) this.newGame();
    else Sound.music('title');
  }

  private getBG(theme: ThemeName): Backdrop {
    let bg = this.bgCache.get(theme);
    if (!bg) { bg = makeBackdrop(theme); this.bgCache.set(theme, bg); }
    return bg;
  }

  // -------------------------------------------------------------------------
  // Flow
  // -------------------------------------------------------------------------
  newGame(): void {
    this.score = 0;
    this.lives = this.mode === 'arcade' ? 3 : 5;
    this.continues = this.mode === 'arcade' ? 3 : 99;
    this.nextLife = EXTRA_LIFE_EVERY;
    this.carryWeapon = 'N';
    this.startStage(DEBUG.stage ? clamp(DEBUG.stage - 1, 0, LEVELS.length - 1) : 0);
  }

  startStage(i: number): void {
    this.stage = i;
    const L = LEVELS[i]();
    this.level = L;
    this.solids = L.solids.map(s => ({ ...s }));
    this.platforms = L.platforms.map(p => ({ ...p }));
    this.zones = L.zones.map(z => ({ ...z, t: 0 }));
    this.enemies = []; this.pBullets = []; this.eBullets = []; this.pickups = []; this.particles = [];
    this.spawnIdx = 0; this.cam.x = 0;
    this.boss = null; this.bossPhase = 'none'; this.bossT = 0;
    this.shake = 0; this.flashT = 0; this.paused = false;
    this.bg = this.getBG(L.theme);
    this.player = new Player(this);
    this.player.spawn(40, GROUND - 30);
    this.player.weapon = this.carryWeapon;
    this.player.invuln = 60;
    if (DEBUG.boss) {
      this.cam.x = L.length - W - 2;
      this.player.spawn(this.cam.x + 60, GROUND - 30);
      this.spawnIdx = L.spawns.length;
    }
    this.state = 'intro';
    this.introT = 150;
    Sound.stopMusic();
  }

  toTitle(): void {
    this.saveHi();
    this.state = 'title';
    this.menu = 0;
    this.paused = false;
    Sound.music('title');
  }

  private saveHi(): void { Store.set('iv_hi', String(this.hiscore)); }

  autoPause(): void { if (this.state === 'play' && !this.paused) { this.paused = true; this.pauseSel = 0; } }

  update(): void {
    this.t++;
    if (Input.pressed.mute) Sound.toggleMute();
    switch (this.state) {
      case 'title': this.updateTitle(); break;
      case 'controls':
        this.titleCam += 0.6;
        if (Input.any() || Input.pressed.pause) { this.state = 'title'; Sound.play('select'); }
        break;
      case 'intro':
        if (--this.introT <= 0 || (this.introT < 110 && Input.any())) { this.state = 'play'; Sound.music(this.level.music); }
        break;
      case 'play': this.updatePlay(); break;
      case 'clear': this.updateClear(); break;
      case 'gameover': this.updateGameOver(); break;
      case 'victory': this.updateVictory(); break;
    }
  }

  private updateTitle(): void {
    this.titleCam += 0.6;
    const n = 3, I = Input.pressed;
    if (I.up) { this.menu = (this.menu + n - 1) % n; Sound.play('select'); }
    if (I.down) { this.menu = (this.menu + 1) % n; Sound.play('select'); }
    const go = I.start || I.fire || I.jump;
    if (this.menu === 1 && (go || I.left || I.right)) {
      this.mode = this.mode === 'arcade' ? 'casual' : 'arcade';
      Store.set('iv_mode', this.mode);
      Sound.play('select');
      return;
    }
    if (!go) return;
    if (this.menu === 0) { Sound.play('confirm'); this.newGame(); }
    else if (this.menu === 2) { this.state = 'controls'; Sound.play('select'); }
  }

  private updatePlay(): void {
    const I = Input.pressed;
    if (this.paused) {
      if (I.up || I.down) { this.pauseSel ^= 1; Sound.play('select'); }
      const ok = I.start || I.fire || I.jump;
      if (I.pause || (ok && this.pauseSel === 0)) { this.paused = false; Sound.play('pause'); }
      else if (ok && this.pauseSel === 1) this.toTitle();
      return;
    }
    if (I.pause || I.start) { this.paused = true; this.pauseSel = 0; Sound.play('pause'); return; }
    this.updateWorld();
  }

  private updateWorld(): void {
    this.updatePlatforms();
    this.player.update();
    this.updateCamera();
    this.runSpawns();
    this.runZones();
    // index loops: entities may spawn more entities while updating
    for (let i = 0; i < this.enemies.length; i++) { const e = this.enemies[i]; if (!e.dead) e.update(); }
    for (const b of this.pBullets) b.update(this);
    for (let i = 0; i < this.eBullets.length; i++) this.eBullets[i].update(this);
    for (const k of this.pickups) k.update(this);
    this.collide();
    this.particles = this.particles.filter(p => p.update());
    if (this.particles.length > 450) this.particles.splice(0, this.particles.length - 450);
    this.enemies = this.enemies.filter(e => !e.dead);
    this.pBullets = this.pBullets.filter(b => !b.dead);
    this.eBullets = this.eBullets.filter(b => !b.dead);
    this.pickups = this.pickups.filter(k => !k.dead);
    this.updateBossPhase();
    if (this.shake > 0) { this.shake *= 0.88; if (this.shake < 0.3) this.shake = 0; }
    if (this.flashT > 0) this.flashT--;
  }

  private updatePlatforms(): void {
    for (const p of this.platforms) {
      if (p.moving) {
        p.t++;
        const ox = p.x, oy = p.y, s = Math.sin(p.t * p.speed + p.phase) * p.dist;
        if (p.axis === 'x') p.x = p.ox + s; else p.y = p.oy + s;
        p.dx = p.x - ox; p.dy = p.y - oy;
      }
      if (p.crumble && p.touched && !p.gone) {
        p.ct++;
        if (p.ct > 26) {
          p.gone = true;
          Sound.play('crumble');
          const col = this.level.theme === 'jungle' ? '#8a5a30' : this.level.theme === 'foundry' ? '#a8724a' : '#b0507a';
          for (let i = 0; i < 6; i++) {
            this.particles.push(new Particle({ x: p.x + rand(0, p.w), y: p.y + 2, vx: rand(-0.8, 0.8), vy: rand(-1.5, 0), grav: 0.2, kind: 'dot', size: 3, life: 50, color: col }));
          }
        }
      }
      if (p.gone && p.fall < 300) { p.fvy += 0.2; p.fall += p.fvy; }
    }
  }

  private updateCamera(): void {
    const p = this.player, max = this.level.length - W;
    if (!p.dying) {
      const target = p.x - W * 0.42;
      if (target > this.cam.x) this.cam.x = Math.min(target, max);
    }
    this.cam.x = clamp(this.cam.x, 0, max);
    if (this.bossPhase === 'none' && this.cam.x >= max - 0.5) {
      this.bossPhase = 'warning';
      this.bossT = 0;
      Sound.stopMusic();
      Sound.play('alarm');
    }
  }

  private updateBossPhase(): void {
    if (this.bossPhase === 'warning') {
      this.bossT++;
      if (this.bossT === 75) Sound.play('alarm');
      if (this.bossT >= 150) {
        const b = createBoss(this.level.boss, this, this.level.length - W);
        this.boss = b;
        this.enemies.push(b);
        this.bossPhase = 'fight';
        Sound.music('boss');
      }
    } else if (this.bossPhase === 'dead') {
      if (++this.bossT >= 170) this.stageClear();
    }
  }

  private runSpawns(): void {
    if (this.bossPhase !== 'none') return;
    const S = this.level.spawns;
    while (this.spawnIdx < S.length && S[this.spawnIdx].trig <= this.cam.x + W) {
      this.spawn(S[this.spawnIdx]);
      this.spawnIdx++;
    }
  }

  private spawn(s: SpawnDef): void {
    const y = s.y ?? GROUND;
    let e: Enemy | null = null;
    switch (s.type) {
      case 'rifle': e = new Rifleman(this, s.x, y, !!s.cover); break;
      case 'turret': e = new Turret(this, s.x, y); break;
      case 'grenadier': e = new Grenadier(this, s.x, y, 'trooper'); break;
      case 'spitter': e = new Grenadier(this, s.x, y, 'spitter'); break;
      case 'box': e = new SupplyBox(this, s.x, y, s.drop ?? 'R'); break;
      case 'pod': e = new Pod(this, this.cam.x - 14, s.y ?? 60, s.drop ?? 'R'); break;
      case 'leaper': e = new Leaper(this, s.x, y); break;
      case 'egg': e = new Egg(this, s.x, y); break;
      case 'flame': e = new FlameJet(this, s.x, y, s.offset ?? 0); break;
    }
    if (e) this.enemies.push(e);
  }

  private runZones(): void {
    if (this.bossPhase !== 'none') return;
    const mid = this.cam.x + W / 2;
    for (const z of this.zones) {
      if (mid < z.x0 || mid > z.x1) continue;
      if (++z.t < z.every) continue;
      z.t = randi(-20, 10);
      switch (z.type) {
        case 'runners': this.spawnRunner(); break;
        case 'drones':
          if (this.count(Drone) < 2) this.enemies.push(new Drone(this, this.cam.x + W + 16, rand(36, 90), 'mech'));
          break;
        case 'flyers':
          if (this.count(Drone) < 3) this.enemies.push(new Drone(this, this.cam.x + W + 16, rand(36, 100), 'bug'));
          break;
        case 'crawlers': {
          const x = this.cam.x + W + 8, y = this.topSolidAt(x);
          if (y !== null && this.count(Crawler) < 5) this.enemies.push(new Crawler(this, x, y, -1));
          break;
        }
      }
    }
  }

  private spawnRunner(): void {
    if (this.count(Runner) >= 4) return;
    const p = this.player;
    const fromLeft = chance(0.2) && this.cam.x > 40 && p.x - this.cam.x > 90;
    const x = fromLeft ? this.cam.x - 10 : this.cam.x + W + 10;
    const y = this.topSolidAt(x);
    if (y === null || y > H) return;
    this.enemies.push(new Runner(this, x, y, fromLeft ? 1 : -1));
  }

  // -------------------------------------------------------------------------
  // Collision + damage
  // -------------------------------------------------------------------------
  private collide(): void {
    for (const b of this.pBullets) {
      if (b.dead) continue;
      for (const e of this.enemies) {
        if (e.dead || e.dying) continue;
        if (b.hits && b.hits.has(e)) continue;
        const r = e.hitTest(b);
        if (r === 0) continue;
        if (r === 1) { e.damage(b.dmg); this.hitSpark(b.x, b.y); }
        else { this.spark(b.x, b.y); Sound.play('clank'); }
        if (b.hits) b.hits.add(e);
        else { b.dead = true; break; }
      }
    }
    const p = this.player;
    if (p.dying) return;
    const hb = p.hurtbox();
    for (const b of this.eBullets) {
      if (b.dead || !b.harmful || !circleRect(b.x, b.y, b.r, hb)) continue;
      if (this.hurtPlayer() && b.kind !== 'blast' && b.kind !== 'shock') b.dead = true;
      if (p.dying) return;
    }
    for (const e of this.enemies) {
      if (e.dead || e.dying || !e.contactTest(hb)) continue;
      if (p.shield > 0 && e.shieldKillable && !e.isBoss) { e.damage(99); continue; }
      this.hurtPlayer();
      if (p.dying) return;
    }
    for (const h of this.level.hazards) {
      if (rectsOverlap(h, hb)) { this.hurtPlayer(); if (p.dying) return; }
    }
    for (const k of this.pickups) if (!k.dead && rectsOverlap(k.box(), hb)) this.collect(k);
  }

  /** Returns true when the hit landed (player was vulnerable). */
  hurtPlayer(): boolean {
    const p = this.player;
    if (DEBUG.god || p.dying || p.invuln > 0 || p.shield > 0) return false;
    if (p.hp > 1) {
      p.hp--; p.invuln = 100;
      Sound.play('hurt');
      this.shake = Math.max(this.shake, 3);
      return true;
    }
    p.die();
    return true;
  }

  playerFell(): void {
    const p = this.player;
    if (DEBUG.god) {
      for (let x = p.x; x < this.level.length; x += 4) {
        const y = this.topSolidAt(x);
        if (y !== null && y < H) {
          p.x = x + 8; p.y = y; p.vx = 0; p.vy = 0;
          this.cam.x = Math.max(this.cam.x, Math.min(p.x - W * 0.42, this.level.length - W));
          return;
        }
      }
    }
    p.die(true);
  }

  onPlayerDown(): void {
    this.lives--;
    if (this.lives <= 0) { this.lives = 0; this.gameOver(); return; }
    const p = this.player;
    let x = this.cam.x + 48;
    for (let tx = this.cam.x + 40; tx < this.cam.x + W - 40; tx += 8) {
      if (this.topSolidAt(tx) !== null) { x = tx; break; }
    }
    p.spawn(x, -10);
    p.weapon = 'N';
    p.invuln = 150;
  }

  private collect(k: Pickup): void {
    k.dead = true;
    const p = this.player;
    if (k.type === 'S') p.shield = 600;
    else if (k.type === '1') this.lives++;
    else p.weapon = k.type;
    p.hp = p.hpMax;
    this.addScore(1000);
    const st = WEAPON_STYLE[k.type];
    this.popup(p.x, p.y - 36, st.name, st.col);
    Sound.play('power');
  }

  onBossDying(_b: Boss): void {
    this.eBullets = this.eBullets.filter(b => b.kind === 'blast');
    for (const e of this.enemies) {
      if (e.isBoss || e.dead) continue;
      e.dead = true;
      const c = e.center();
      this.explode(c.x, c.y, 1);
    }
    this.flashT = 10;
    Sound.stopMusic();
  }

  onBossDead(_b: Boss): void {
    this.bossPhase = 'dead';
    this.bossT = 0;
    this.flashT = 20;
    this.eBullets = [];
  }

  private stageClear(): void {
    this.state = 'clear';
    this.clearT = 0;
    this.bonus = 5000 * (this.stage + 1);
    this.bonusPaid = 0;
    this.carryWeapon = this.player.weapon;
    Sound.music('clear');
  }

  private updateClear(): void {
    this.clearT++;
    this.particles = this.particles.filter(p => p.update());
    if (this.clearT > 70 && this.bonusPaid < this.bonus) {
      const d = Math.min(200, this.bonus - this.bonusPaid);
      this.bonusPaid += d;
      this.addScore(d);
      if (this.clearT % 4 === 0) Sound.play('select');
    }
    const done = this.bonusPaid >= this.bonus;
    if ((done && this.clearT > 330) || (this.clearT > 100 && Input.any())) {
      if (!done) { this.addScore(this.bonus - this.bonusPaid); this.bonusPaid = this.bonus; }
      if (this.stage + 1 < LEVELS.length) this.startStage(this.stage + 1);
      else this.victory();
    }
  }

  private gameOver(): void {
    this.state = 'gameover';
    this.goT = 0;
    this.contT = 0;
    Sound.music('gameover');
    this.saveHi();
  }

  private updateGameOver(): void {
    this.goT++;
    this.particles = this.particles.filter(p => p.update());
    if (this.continues > 0) {
      if (this.goT <= 60) return;
      this.contT++;
      if (this.contT > 600) { this.continues = 0; this.goT = 0; return; }
      if (Input.any()) {
        this.continues--;
        this.score = 0;
        this.nextLife = EXTRA_LIFE_EVERY;
        this.lives = this.mode === 'arcade' ? 3 : 5;
        this.carryWeapon = 'N';
        Sound.play('confirm');
        this.startStage(this.stage);
      }
    } else if (this.goT > 240 || (this.goT > 90 && Input.any())) {
      this.toTitle();
    }
  }

  private victory(): void {
    this.state = 'victory';
    this.vicT = 0;
    this.saveHi();
    Sound.music('victory');
  }

  private updateVictory(): void {
    this.vicT++;
    if (this.vicT > 360 && Input.any()) this.toTitle();
  }

  // -------------------------------------------------------------------------
  // Services used by entities
  // -------------------------------------------------------------------------
  addScore(n: number, x?: number, y?: number): void {
    this.score += n;
    if (x !== undefined && y !== undefined && n >= 300) this.popup(x, y, String(n), '#ffffff');
    if (this.score > this.hiscore) this.hiscore = this.score;
    while (this.score >= this.nextLife) {
      this.lives++;
      this.nextLife += EXTRA_LIFE_EVERY;
      Sound.play('oneup');
      this.popup(this.player.x, this.player.y - 46, '1UP', '#ffd23f');
    }
  }

  popup(x: number, y: number, text: string, color: string): void {
    this.particles.push(new Particle({ x, y, vy: -0.4, kind: 'text', text, color, life: 50 }));
  }

  explode(x: number, y: number, s = 1): void {
    this.particles.push(new Particle({ x, y, kind: 'flash', size: 6 + s * 5, life: 6, color: '#ffffff' }));
    if (s >= 2) this.particles.push(new Particle({ x, y, kind: 'ring', size: 4, grow: 1.2 + s * 0.3, life: 14, color: '#ffd23f' }));
    const cols = ['#fff3b0', '#ffd23f', '#ff8c1a', '#ff4d1a'];
    for (let i = 0; i < 5 + s * 5; i++) {
      const a = rand(0, TAU), sp = rand(0.4, 1.2 + s * 0.7);
      this.particles.push(new Particle({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, kind: 'fire', size: rand(2, 3 + s), grow: -0.1, life: randi(14, 26), drag: 0.92, color: pick(cols) }));
    }
    for (let i = 0; i < s * 3; i++) {
      this.particles.push(new Particle({ x: x + rand(-6, 6), y: y + rand(-6, 6), vy: -rand(0.2, 0.6), kind: 'smoke', size: rand(3, 5), grow: 0.12, life: randi(30, 45), color: '#4a4a4a' }));
    }
    for (let i = 0; i < s * 3; i++) {
      this.particles.push(new Particle({ x, y, vx: rand(-2, 2), vy: -rand(1, 3), grav: 0.15, kind: 'dot', size: 2, life: 40, color: '#2a2424' }));
    }
    this.shake = Math.max(this.shake, s * 1.5);
    Sound.play(s >= 3 ? 'bigboom' : s === 2 ? 'boom' : 'pop');
  }

  spark(x: number, y: number): void {
    for (let i = 0; i < 3; i++) {
      this.particles.push(new Particle({ x, y, vx: rand(-1.5, 1.5), vy: rand(-1.5, 1.5), kind: 'dot', size: 1, life: 8, color: chance(0.5) ? '#ffffff' : '#ffd23f' }));
    }
  }

  private hitSpark(x: number, y: number): void {
    this.particles.push(new Particle({ x, y, kind: 'flash', size: 3, life: 4, color: '#ffd23f' }));
    for (let i = 0; i < 2; i++) this.particles.push(new Particle({ x, y, vx: rand(-1, 1), vy: rand(-1, 1), kind: 'dot', size: 1, life: 8, color: '#ff8c1a' }));
  }

  blast(x: number, y: number, r: number): void {
    this.eBullets.push(new EBullet(x, y, 0, 0, 'blast', { r }));
    this.explode(x, y, 1);
  }

  puff(x: number, y: number, color: string): void {
    for (let i = 0; i < 5; i++) this.particles.push(new Particle({ x, y, vx: rand(-1, 1), vy: -rand(0.2, 1), kind: 'smoke', size: 2, grow: 0.1, life: 24, color }));
  }

  enemyShot(x: number, y: number, ang: number, speed = 2.0): void {
    const sp = speed * (this.mode === 'casual' ? 0.8 : 1);
    this.eBullets.push(new EBullet(x, y, Math.cos(ang) * sp, Math.sin(ang) * sp, 'orb'));
    if (x > this.cam.x - 10 && x < this.cam.x + W + 10) Sound.play('eshot');
  }

  spawnPickup(x: number, y: number, type: PickupType): void { this.pickups.push(new Pickup(x, y, type)); }

  nearestEnemy(x: number, y: number): Enemy | null {
    let best: Enemy | null = null, bd = Infinity;
    for (const e of this.enemies) {
      if (e.dead || e.dying || !e.targetable) continue;
      const c = e.center();
      if (c.x < this.cam.x - 10 || c.x > this.cam.x + W + 10 || c.y < -10 || c.y > H) continue;
      const d = (c.x - x) ** 2 + (c.y - y) ** 2;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  solidPoint(x: number, y: number): boolean {
    for (const s of this.solids) if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) return true;
    for (const p of this.platforms) if (!p.gone && x >= p.x && x < p.x + p.w && y >= p.y && y < p.y + 6) return true;
    return false;
  }

  hasFloor(x: number, y: number): boolean {
    for (const s of this.solids) if (x >= s.x && x < s.x + s.w && s.y <= y + 1 && s.y + s.h > y + 1) return true;
    for (const p of this.platforms) if (!p.gone && x >= p.x && x < p.x + p.w && Math.abs(p.y - y) < 3) return true;
    return false;
  }

  /** Highest visible solid surface at column x, or null over a pit. */
  topSolidAt(x: number): number | null {
    let best: number | null = null;
    for (const s of this.solids) if (!s.invisible && x >= s.x && x < s.x + s.w && (best === null || s.y < best)) best = s.y;
    return best;
  }

  count(cls: EnemyClass): number {
    let n = 0;
    for (const e of this.enemies) if (!e.dead && e instanceof cls) n++;
    return n;
  }

  /** Debug auto-play (?bot): runs right, jumps gaps, fights bosses with homing shots. */
  botThink(): void {
    const v = Input.virt;
    Input.clearVirt();
    if (this.state !== 'play') { if (this.t % 20 === 0) v.fire = true; return; }
    if (this.paused) return;
    const p = this.player;
    v.fire = true;
    if (p.dying) return;
    if (this.bossPhase !== 'none') {
      p.weapon = 'H';
      const tx = this.cam.x + 60;
      if (p.x < tx - 8) v.right = true; else if (p.x > tx + 8) v.left = true;
      if (this.t % 70 === 0) this.botHold = 16;
    } else {
      v.right = true;
      const gap = p.onGround && !this.hasFloor(p.x + 16, p.y) && !this.hasFloor(p.x + 28, p.y);
      const wall = p.onGround && this.solids.some(s => !s.invisible && s.x > p.x && s.x < p.x + 14 && s.y < p.y - 1);
      if ((gap || wall) && this.botHold === 0) this.botHold = 18;
      if (this.enemies.some(e => !e.dead && e.targetable && e.x > p.x && e.x < p.x + 160 && e.center().y < p.y - 40)) v.up = true;
    }
    if (this.botHold > 0) { this.botHold--; v.jump = this.botHold > 0; }
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  render(): void {
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.imageSmoothingEnabled = false;
    switch (this.state) {
      case 'title':
      case 'controls': this.renderTitle(c); break;
      case 'intro': this.renderIntro(c); break;
      case 'victory': this.renderVictory(c); break;
      default:
        this.renderWorld(c);
        this.renderHUD(c);
        this.renderOverlay(c);
    }
  }

  private renderWorld(c: Ctx): void {
    const cx = Math.round(this.cam.x), t = this.t;
    let ox = 0, oy = 0;
    if (this.shake > 0.3 && !this.paused) { ox = Math.round(rand(-1, 1) * this.shake); oy = Math.round(rand(-1, 1) * this.shake); }
    drawBackdrop(c, this.bg, cx);
    c.save();
    c.translate(ox, oy);
    drawPitFill(c, this.bg, t);
    for (const d of this.level.decor) drawDecor(c, d, cx, t);
    for (const s of this.solids) if (!s.invisible && s.x < cx + W + 16 && s.x + s.w > cx - 16) drawSolid(c, s, cx, this.bg.tiles);
    for (const p of this.platforms) drawPlatform(c, p, cx, this.level.theme, t);
    for (const k of this.pickups) k.draw(c, cx);
    if (this.boss && !this.boss.dead) this.boss.render(c, cx);
    for (const e of this.enemies) if (!e.isBoss && e.x > cx - 80 && e.x < cx + W + 80) e.render(c, cx);
    this.player.draw(c, cx);
    for (const b of this.pBullets) b.draw(c, cx);
    for (const b of this.eBullets) b.draw(c, cx);
    for (const p of this.particles) p.draw(c, cx);
    for (const w of this.level.waters) drawWater(c, w, cx, t);
    c.restore();
    if (this.flashT > 0) {
      c.fillStyle = `rgba(255,255,255,${((this.flashT / 20) * 0.8).toFixed(2)})`;
      c.fillRect(0, 0, W, H);
    }
  }

  private renderHUD(c: Ctx): void {
    const p = this.player;
    Text.draw(c, '1P', 6, 5, '#7fd4ff');
    Text.draw(c, pad(this.score, 7), 22, 5, '#ffffff');
    for (let i = 0; i < Math.min(this.lives, 8); i++) drawMedal(c, 6 + i * 9, 15);
    if (this.lives > 8) Text.draw(c, `+${this.lives - 8}`, 80, 16, '#ffd23f');
    if (p.hpMax > 1) for (let i = 0; i < p.hpMax; i++) R(c, 6 + i * 7, 26, 5, 4, i < p.hp ? '#ff4a5a' : '#3a2a30');
    Text.draw(c, `HI ${pad(this.hiscore, 7)}`, W / 2, 5, '#ffd23f', 1, 'center');
    const ws = WEAPON_STYLE[p.weapon];
    drawBadge(c, W - 62, 9, p.weapon, 0);
    Text.draw(c, ws.name, W - 52, 6, ws.col);
    if (p.shield > 0) {
      R(c, W - 52, 15, 40, 2, '#3a2a40');
      R(c, W - 52, 15, Math.round((40 * p.shield) / 600), 2, '#d68aff');
    }
    const b = this.boss;
    if (b && this.bossPhase === 'fight') {
      const bw = 150, bx = Math.round((W - bw) / 2), by = 16;
      Text.draw(c, b.name, W / 2, by, '#ff8a8a', 1, 'center');
      R(c, bx - 1, by + 9, bw + 2, 6, '#000000');
      R(c, bx, by + 10, bw, 4, '#3a1010');
      const col = b.hpFrac > 0.5 || (this.t >> 2) & 1 ? '#ff4a3a' : '#ffd23f';
      R(c, bx, by + 10, Math.round(bw * b.hpFrac), 4, col);
    }
  }

  private dim(c: Ctx, a: number): void { c.fillStyle = `rgba(0,0,0,${a})`; c.fillRect(0, 0, W, H); }

  private renderOverlay(c: Ctx): void {
    if (this.state === 'play' && this.bossPhase === 'warning') {
      c.fillStyle = 'rgba(90,0,0,0.35)';
      c.fillRect(0, 82, W, 38);
      if ((this.bossT >> 3) & 1) { R(c, 0, 80, W, 2, '#ff2020'); R(c, 0, 120, W, 2, '#ff2020'); }
      if ((this.bossT >> 4) & 1 || this.bossT > 110) Text.draw(c, 'WARNING', W / 2, 86, '#ff3a3a', 3, 'center');
      Text.draw(c, `${this.level.bossName} APPROACHING`, W / 2, 110, '#ffd0d0', 1, 'center');
    }
    if (this.paused) {
      this.dim(c, 0.6);
      Text.draw(c, 'PAUSED', W / 2, 44, '#ffffff', 3, 'center');
      const items = ['RESUME', 'QUIT TO TITLE'];
      items.forEach((s, i) => {
        const sel = i === this.pauseSel;
        Text.draw(c, s, W / 2, 84 + i * 14, sel ? '#ffd23f' : '#7a8aa0', 1, 'center');
        if (sel) Text.draw(c, '>', W / 2 - Text.width(s) / 2 - 12, 84 + i * 14, '#ffd23f');
      });
      Text.draw(c, 'ARROWS MOVE/AIM  Z JUMP  X FIRE', W / 2, 136, '#9fb0c8', 1, 'center');
      Text.draw(c, 'DOWN+JUMP DROP THROUGH LEDGES', W / 2, 148, '#9fb0c8', 1, 'center');
      Text.draw(c, `M  SOUND ${Sound.muted ? 'OFF' : 'ON'}`, W / 2, 166, '#9fb0c8', 1, 'center');
    }
    if (this.state === 'clear') {
      this.dim(c, Math.min(0.55, this.clearT / 60));
      Text.draw(c, `STAGE ${this.stage + 1} CLEAR!`, W / 2, 60, '#ffd23f', 3, 'center');
      if (this.clearT > 50) {
        Text.draw(c, 'STAGE BONUS', W / 2 - 80, 104, '#9fd6ff');
        Text.draw(c, pad(this.bonusPaid, 6), W / 2 + 80, 104, '#ffffff', 1, 'right');
        Text.draw(c, 'SCORE', W / 2 - 80, 120, '#9fd6ff');
        Text.draw(c, pad(this.score, 7), W / 2 + 80, 120, '#ffffff', 1, 'right');
      }
      if (this.clearT > 120 && (this.t >> 4) & 1) Text.draw(c, 'PRESS START', W / 2, 160, '#ffffff', 1, 'center');
    }
    if (this.state === 'gameover') {
      this.dim(c, Math.min(0.7, this.goT / 40));
      Text.draw(c, 'GAME OVER', W / 2, 54, '#ff3a3a', 4, 'center');
      Text.draw(c, `SCORE ${pad(this.score, 7)}`, W / 2, 96, '#ffffff', 1, 'center');
      if (this.continues > 0 && this.goT > 60) {
        const n = Math.max(0, 9 - Math.floor(this.contT / 60));
        Text.draw(c, 'CONTINUE?', W / 2, 120, '#ffd23f', 2, 'center');
        Text.draw(c, String(n), W / 2, 142, '#ffffff', 3, 'center');
        if ((this.t >> 4) & 1) Text.draw(c, 'PRESS START', W / 2, 172, '#ffffff', 1, 'center');
        Text.draw(c, this.mode === 'casual' ? 'FREE CONTINUES' : `CONTINUES LEFT ${this.continues}`, W / 2, 186, '#7a8aa0', 1, 'center');
      }
    }
  }

  private renderTitle(c: Ctx): void {
    const bg = this.getBG('jungle'), cam = Math.round(this.titleCam), t = this.t;
    drawBackdrop(c, bg, cam);
    for (let x = -(cam % 16); x < W; x += 16) {
      c.drawImage(bg.tiles.top, x, GROUND);
      c.drawImage(bg.tiles.fill[0], x, GROUND + 16);
      c.drawImage(bg.tiles.fill[1], x, GROUND + 32);
    }
    const leg = Math.floor(t * 0.2) % 4;
    drawHumanoid(c, 70, GROUND, 1, { pal: PAL_PLAYER, leg, aim: { x: 1, y: 0 }, head: 'player', t, bob: leg === 1 || leg === 3 ? -1 : 0 });
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(6,4,18,0.85)');
    g.addColorStop(0.75, 'rgba(6,4,18,0.55)');
    g.addColorStop(1, 'rgba(6,4,18,0.2)');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
    if (this.state === 'controls') { this.renderControls(c); return; }
    Text.drawDuo(c, 'IRON', W / 2, 18, '#ffe14a', '#ff7a1a', 5);
    Text.drawDuo(c, 'VANGUARD', W / 2, 58, '#ffe14a', '#ff7a1a', 4);
    Text.draw(c, 'AN ORIGINAL RUN & GUN ASSAULT', W / 2, 94, '#9fd6ff', 1, 'center');
    const items = ['START GAME', `MODE: ${this.mode === 'arcade' ? 'ARCADE' : 'CASUAL'}`, 'CONTROLS'];
    items.forEach((s, i) => {
      const sel = i === this.menu, y = 114 + i * 13;
      Text.draw(c, s, W / 2, y, sel ? '#ffffff' : '#7a8aa0', 1, 'center');
      if (sel && (t >> 3) & 1) Text.draw(c, '>', W / 2 - Text.width(s) / 2 - 12, y, '#ffd23f');
    });
    const desc = this.mode === 'arcade' ? 'ONE HIT KILLS - 3 LIVES - 3 CONTINUES' : '3 HITS PER LIFE - 5 LIVES - FREE CONTINUES';
    Text.draw(c, desc, W / 2, 158, '#c8a0ff', 1, 'center');
    Text.draw(c, `HI-SCORE ${pad(this.hiscore, 7)}`, W / 2, 174, '#ffd23f', 1, 'center');
    if ((t >> 5) & 1) Text.draw(c, 'PRESS ENTER / START', W / 2, 196, '#ffffff', 1, 'center');
  }

  private renderControls(c: Ctx): void {
    Text.draw(c, 'CONTROLS', W / 2, 14, '#ffd23f', 2, 'center');
    const rows: [string, string][] = [
      ['MOVE / AIM', 'ARROWS OR WASD'],
      ['JUMP', 'Z  K  SPACE'],
      ['FIRE (HOLD)', 'X  J'],
      ['PRONE', 'DOWN'],
      ['DROP DOWN', 'DOWN + JUMP'],
      ['PAUSE', 'ENTER  P  ESC'],
      ['SOUND ON/OFF', 'M'],
      ['GAMEPAD', 'STICK  A=JUMP  X/B=FIRE'],
    ];
    rows.forEach(([a, b], i) => {
      Text.draw(c, a, 60, 40 + i * 12, '#9fd6ff');
      Text.draw(c, b, 176, 40 + i * 12, '#ffffff');
    });
    Text.draw(c, 'POWER-UPS', W / 2, 142, '#ffd23f', 1, 'center');
    const ups = ['R', 'W', 'L', 'H', 'S'];
    ups.forEach((u, i) => {
      const x = 52 + i * 70;
      drawBadge(c, x, 162, u, 0);
      Text.draw(c, WEAPON_STYLE[u].name, x + 10, 159, WEAPON_STYLE[u].col);
    });
    if ((this.t >> 5) & 1) Text.draw(c, 'PRESS ANY BUTTON', W / 2, 196, '#ffffff', 1, 'center');
  }

  private renderIntro(c: Ctx): void {
    R(c, 0, 0, W, H, '#05060a');
    for (let i = 0; i < 50; i++) {
      const x = (i * 97 + this.t * (1 + (i % 3))) % W, y = (i * 53) % H;
      R(c, W - x, y, 1, 1, i % 3 === 0 ? '#ffffff' : '#4a5a7a');
    }
    const L = this.level;
    Text.draw(c, `STAGE ${this.stage + 1}`, W / 2, 50, '#ffd23f', 3, 'center');
    Text.draw(c, L.name, W / 2, 84, '#ffffff', 2, 'center');
    Text.draw(c, L.tagline, W / 2, 110, '#8fa8c8', 1, 'center');
    const leg = Math.floor(this.t * 0.2) % 4;
    drawHumanoid(c, W / 2, 168, 1, { pal: PAL_PLAYER, leg, aim: { x: 1, y: 0 }, head: 'player', t: this.t, bob: leg === 1 || leg === 3 ? -1 : 0 });
    R(c, W / 2 - 50, 169, 100, 1, '#2a3a5a');
    drawMedal(c, W / 2 - 20, 180);
    Text.draw(c, `X ${this.lives}`, W / 2 - 8, 181, '#ffffff');
  }

  private renderVictory(c: Ctx): void {
    const t = this.vicT;
    drawBackdrop(c, this.getBG('jungle'), Math.round(t * 0.3));
    c.fillStyle = `rgba(6,4,18,${Math.max(0.35, 0.9 - t / 400).toFixed(2)})`;
    c.fillRect(0, 0, W, H);
    R(c, 250, 150, 134, 66, '#0b0b14');
    R(c, 270, 140, 114, 12, '#0b0b14');
    drawHumanoid(c, 310, 140, -1, { pal: PAL_PLAYER, leg: -1, aim: { x: 0, y: -1 }, head: 'player', t: this.t });
    const lines = [
      ['MISSION COMPLETE', '#ffd23f'],
      ['', ''],
      ['THE HIVE MATRIARCH IS DEAD AND THE', '#ffffff'],
      ["CRIMSON LEGION'S BIO-WEAPON PROGRAM", '#ffffff'],
      ['HAS BEEN WIPED OFF THE MAP.', '#ffffff'],
      ['', ''],
      ['COMMANDO KADE HEADS HOME AS THE', '#9fd6ff'],
      ['SUN RISES OVER THE VERDANT FRONT.', '#9fd6ff'],
      ['', ''],
      [`FINAL SCORE ${pad(this.score, 7)}`, '#ffd23f'],
      ['THANK YOU FOR PLAYING', '#c8a0ff'],
    ];
    lines.forEach(([s, col], i) => {
      if (s && t > 30 + i * 22) Text.draw(c, s, 16, 16 + i * 13, col, i === 0 ? 2 : 1, 'left');
    });
    if (t > 360 && (this.t >> 5) & 1) Text.draw(c, 'PRESS START', W / 2, 200, '#ffffff', 1, 'center');
  }
}

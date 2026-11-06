// Level definitions. Coordinates are world pixels; GROUND (176) is the default floor.
import { W, H, GROUND, seeded } from './core.ts';
import type {
  BossKind, LevelDef, PickupType, Platform, SongName, SpawnDef, SpawnType, ThemeName, ZoneType,
} from './types.ts';

function mkPlatform(x: number, y: number, w: number, kind: Platform['kind'], extra: Partial<Platform> = {}): Platform {
  return {
    x, y, w, h: 6, oneway: true, kind,
    crumble: kind === 'crumble', moving: kind === 'mover',
    axis: 'x', dist: 0, speed: 0, phase: 0, ox: x, oy: y, dx: 0, dy: 0, t: 0,
    touched: false, ct: 0, gone: false, fall: 0, fvy: 0,
    ...extra,
  };
}

const DECOR: Record<ThemeName, string[]> = {
  jungle: ['bush', 'bush', 'rock', 'fern', 'ruin', 'bush', 'fern'],
  foundry: ['barrel', 'crate', 'lamp', 'pipe', 'sign', 'barrel', 'crate'],
  hive: ['tendril', 'tendril', 'bone', 'glow', 'glow', 'tendril'],
};

class LevelBuilder {
  private readonly d: LevelDef;
  constructor(name: string, tagline: string, theme: ThemeName, music: SongName, length: number, boss: BossKind, bossName: string) {
    this.d = {
      name, tagline, theme, music, length, boss, bossName,
      solids: [], platforms: [], spawns: [], zones: [], waters: [], hazards: [], decor: [],
    };
  }
  /** Solid ground from x0 to x1 with its top at y (extends below the screen). */
  ground(x0: number, x1: number, y = GROUND): this { this.d.solids.push({ x: x0, y, w: x1 - x0, h: H + 80 - y }); return this; }
  plat(x: number, y: number, w: number): this { this.d.platforms.push(mkPlatform(x, y, w, 'plat')); return this; }
  /** Bridge / catwalk segments that give way shortly after being stood on. */
  crumble(x0: number, x1: number, y: number, seg = 32): this {
    for (let x = x0; x < x1; x += seg) this.d.platforms.push(mkPlatform(x, y, Math.min(seg, x1 - x), 'crumble'));
    return this;
  }
  mover(x: number, y: number, w: number, axis: 'x' | 'y', dist: number, speed: number, phase = 0): this {
    this.d.platforms.push(mkPlatform(x, y, w, 'mover', { axis, dist, speed, phase }));
    return this;
  }
  /** Wading river: lowered floor with a water overlay. */
  river(x0: number, x1: number): this {
    this.ground(x0, x1, 192);
    this.d.waters.push({ x: x0, w: x1 - x0, y: 184, kind: 'water' });
    return this;
  }
  /** Shallow acid pool that hurts on contact. */
  pool(x0: number, x1: number): this {
    this.ground(x0, x1, 188);
    this.d.hazards.push({ x: x0, y: 180, w: x1 - x0, h: 8 });
    this.d.waters.push({ x: x0, w: x1 - x0, y: 179, kind: 'acid' });
    return this;
  }
  at(x: number, type: SpawnType, o: Partial<SpawnDef> = {}): this {
    this.d.spawns.push({ type, x, trig: x - 8, ...o });
    return this;
  }
  /** Capsule that flies in from the left once the camera reaches camX. */
  pod(camX: number, y: number, drop: PickupType): this {
    this.d.spawns.push({ type: 'pod', x: camX, trig: camX + W, y, drop });
    return this;
  }
  /** Keeps spawning enemies of `type` while the screen centre is between x0 and x1. */
  zone(type: ZoneType, x0: number, x1: number, every: number): this {
    this.d.zones.push({ type, x0, x1, every });
    return this;
  }
  build(): LevelDef {
    const d = this.d;
    d.spawns.sort((a, b) => a.trig - b.trig);
    // draw higher ground last so it overlaps the floor beneath it
    d.solids.sort((a, b) => b.y - a.y);
    const rnd = seeded(d.name.length * 131 + d.length);
    const topAt = (x: number): number => {
      let best = Infinity;
      for (const s of d.solids) if (x >= s.x && x < s.x + s.w && s.y < best) best = s.y;
      return best;
    };
    const inWater = (x: number) => d.waters.some(w => x >= w.x - 8 && x <= w.x + w.w + 8);
    const list = DECOR[d.theme];
    for (const s of d.solids) {
      for (let x = s.x + 10 + rnd() * 40; x < s.x + s.w - 20; x += 50 + rnd() * 80) {
        if (x > d.length - W + 40) break;
        if (topAt(x) !== s.y || topAt(x + 16) !== s.y || inWater(x)) continue;
        d.decor.push({ x: Math.round(x), y: s.y, type: list[Math.floor(rnd() * list.length)] });
      }
    }
    for (const sp of d.spawns) if (sp.y === undefined && sp.type !== 'pod') { const t = topAt(sp.x); sp.y = t === Infinity ? GROUND : t; }
    return d;
  }
}

function stage1(): LevelDef {
  const b = new LevelBuilder('VERDANT FRONT', 'PUNCH THROUGH THE JUNGLE LINE', 'jungle', 'stage1', 4224, 'gunship', 'STORMHAWK GUNSHIP');
  b.ground(0, 656).plat(176, 128, 80).plat(320, 88, 64)
    .at(352, 'rifle', { y: 88 }).at(470, 'rifle')
    .pod(220, 64, 'R')
    .zone('runners', 200, 1300, 110);
  b.ground(704, 1152).ground(816, 912, 144)
    .at(864, 'rifle', { y: 144, cover: true })
    .plat(976, 128, 64).at(1008, 'rifle', { y: 128 })
    .at(1100, 'turret');
  b.ground(1200, 1344).crumble(1344, 1600, GROUND);
  b.ground(1600, 2176).at(1690, 'box', { drop: 'W' })
    .plat(1760, 128, 96).at(1800, 'rifle', { y: 128 })
    .plat(1904, 88, 64).at(1936, 'grenadier', { y: 88 })
    .at(2090, 'turret')
    .pod(1500, 56, 'L')
    .zone('runners', 1650, 2900, 120);
  b.river(2176, 2496).ground(2288, 2352, 160)
    .at(2320, 'rifle', { y: 160, cover: true }).at(2450, 'rifle');
  b.ground(2496, 2920).plat(2576, 128, 64).at(2608, 'rifle', { y: 128 })
    .at(2700, 'turret').at(2830, 'rifle')
    .pod(2450, 60, 'H');
  b.ground(2960, 3216, 144).at(3040, 'rifle', { y: 144 }).at(3150, 'grenadier', { y: 144 });
  b.ground(3216, 4224).plat(3312, 128, 64).at(3344, 'rifle', { y: 128, cover: true })
    .zone('drones', 3050, 3700, 150)
    .at(3460, 'box', { drop: 'S' }).at(3560, 'turret')
    .zone('runners', 3250, 3760, 100)
    .at(3700, 'rifle');
  b.plat(3888, 128, 64).plat(4064, 128, 64);
  return b.build();
}

function stage2(): LevelDef {
  const b = new LevelBuilder('IRON FOUNDRY', 'SABOTAGE THE LEGION WAR FORGE', 'foundry', 'stage2', 4480, 'colossus', 'MAGMA COLOSSUS');
  b.ground(0, 576).plat(224, 128, 64).at(256, 'rifle', { y: 128 })
    .at(400, 'flame', { offset: 0 }).at(520, 'turret')
    .zone('runners', 150, 1150, 130);
  b.mover(600, 160, 40, 'x', 24, 0.022);
  b.ground(672, 1216).ground(752, 832, 128).at(792, 'turret', { y: 128 })
    .at(900, 'flame', { offset: 0 }).at(980, 'flame', { offset: 60 })
    .plat(1040, 128, 80).at(1080, 'grenadier', { y: 128 })
    .at(1160, 'box', { drop: 'W' });
  b.crumble(1216, 1440, 168);
  b.ground(1440, 2032).plat(1520, 128, 64).at(1552, 'rifle', { y: 128 })
    .zone('drones', 1450, 2200, 140)
    .at(1700, 'turret').at(1860, 'turret')
    .pod(1500, 56, 'R')
    .at(1960, 'rifle', { cover: true });
  b.mover(2056, 150, 40, 'y', 20, 0.03, 0).mover(2128, 150, 40, 'y', 20, 0.03, Math.PI);
  b.ground(2192, 2832)
    .at(2272, 'flame', { offset: 0 }).at(2336, 'flame', { offset: 25 }).at(2400, 'flame', { offset: 50 })
    .ground(2496, 2576, 144).at(2536, 'rifle', { y: 144, cover: true })
    .plat(2624, 112, 96).at(2672, 'grenadier', { y: 112 })
    .at(2760, 'box', { drop: 'L' })
    .zone('runners', 2200, 3400, 115);
  b.ground(2880, 3520).at(2980, 'turret').at(3120, 'turret')
    .plat(3200, 128, 64).at(3232, 'rifle', { y: 128 })
    .at(3330, 'flame', { offset: 0 }).at(3440, 'rifle');
  b.crumble(3520, 3712, 168);
  b.ground(3712, 4480).pod(3600, 56, 'H')
    .plat(3808, 128, 64).at(3840, 'rifle', { y: 128 })
    .at(3960, 'box', { drop: 'R' })
    .zone('drones', 3712, 3950, 160);
  b.plat(4120, 128, 64).plat(4208, 128, 40);
  return b.build();
}

function stage3(): LevelDef {
  const b = new LevelBuilder('THE HIVE', 'DESTROY THE HEART OF THE INFESTATION', 'hive', 'stage3', 4480, 'matriarch', 'HIVE MATRIARCH');
  b.ground(0, 512).plat(192, 128, 64).at(330, 'egg').at(450, 'leaper');
  b.ground(560, 1120).ground(656, 736, 144).at(696, 'leaper', { y: 144 })
    .at(820, 'egg')
    .plat(880, 128, 80).at(920, 'spitter', { y: 128 })
    .at(1040, 'egg')
    .zone('flyers', 600, 1800, 170);
  b.pool(1120, 1168);
  b.ground(1168, 1728).pod(1100, 56, 'W')
    .at(1260, 'leaper').at(1310, 'leaper')
    .plat(1360, 128, 64).at(1392, 'spitter', { y: 128 })
    .at(1500, 'egg').at(1610, 'box', { drop: 'H' });
  b.crumble(1728, 1952, 168);
  b.ground(1952, 2560).at(2050, 'leaper').at(2120, 'egg')
    .ground(2200, 2320, 144).at(2260, 'spitter', { y: 144 })
    .zone('crawlers', 1980, 2560, 90);
  b.pool(2560, 2608);
  b.ground(2608, 3200).pod(2700, 56, 'L')
    .at(2720, 'egg').plat(2780, 128, 64).at(2812, 'spitter', { y: 128 })
    .at(2900, 'egg').at(3000, 'leaper').at(3100, 'leaper');
  b.mover(3224, 156, 40, 'x', 16, 0.025, 0).mover(3296, 140, 40, 'y', 18, 0.03, 1);
  b.ground(3360, 4480).at(3480, 'box', { drop: 'R' })
    .zone('flyers', 3360, 3900, 150)
    .at(3700, 'egg').at(3800, 'leaper')
    .plat(3848, 128, 64).at(3880, 'spitter', { y: 128 })
    .at(3990, 'leaper');
  b.plat(4136, 128, 64).plat(4240, 96, 48);
  return b.build();
}

export const LEVELS: readonly (() => LevelDef)[] = [stage1, stage2, stage3];

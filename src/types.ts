// Shared type definitions for Iron Vanguard

export interface Rect { x: number; y: number; w: number; h: number; }
export interface Vec { x: number; y: number; }

/** Fully solid terrain block (extends to the bottom of the screen). */
export interface Solid extends Rect {
  oneway?: false;
  invisible?: boolean;
}

/** One-way platform: can be jumped through from below and dropped through. */
export interface Platform extends Rect {
  oneway: true;
  kind: 'plat' | 'crumble' | 'mover';
  crumble: boolean;
  moving: boolean;
  axis: 'x' | 'y';
  dist: number;
  speed: number;
  phase: number;
  ox: number;
  oy: number;
  dx: number;
  dy: number;
  t: number;
  touched: boolean;
  ct: number;
  gone: boolean;
  fall: number;
  fvy: number;
}

export type Surface = Solid | Platform;

/** Anything that moves through the world with gravity. */
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  onGround: boolean;
  ground: Surface | null;
}

export interface World {
  solids: Solid[];
  platforms: Platform[];
}

export type ThemeName = 'jungle' | 'foundry' | 'hive';
export type WeaponType = 'N' | 'R' | 'W' | 'L' | 'H';
export type PickupType = 'R' | 'W' | 'L' | 'H' | 'S' | '1';
export type SpawnType = 'rifle' | 'turret' | 'grenadier' | 'spitter' | 'box' | 'pod' | 'leaper' | 'egg' | 'flame';
export type ZoneType = 'runners' | 'drones' | 'flyers' | 'crawlers';
export type BossKind = 'gunship' | 'colossus' | 'matriarch';
export type SongName = 'title' | 'stage1' | 'stage2' | 'stage3' | 'boss' | 'clear' | 'gameover' | 'victory';
export type GameMode = 'arcade' | 'casual';

export interface SpawnDef {
  type: SpawnType;
  x: number;
  /** Spawns once the camera's right edge reaches this world x. */
  trig: number;
  y?: number;
  cover?: boolean;
  drop?: PickupType;
  offset?: number;
}

export interface ZoneDef {
  type: ZoneType;
  x0: number;
  x1: number;
  every: number;
}

export interface Water { x: number; y: number; w: number; kind: 'water' | 'acid'; }
export interface Decor { x: number; y: number; type: string; }

export interface LevelDef {
  name: string;
  tagline: string;
  theme: ThemeName;
  music: SongName;
  length: number;
  solids: Solid[];
  platforms: Platform[];
  spawns: SpawnDef[];
  zones: ZoneDef[];
  waters: Water[];
  hazards: Rect[];
  decor: Decor[];
  boss: BossKind;
  bossName: string;
}

export interface BulletLike { x: number; y: number; r: number; }

/** 0 = miss, 1 = damaging hit, 2 = blocked by armour */
export type HitResult = 0 | 1 | 2;

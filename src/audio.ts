// Procedural sound effects and a small step sequencer for original chiptune music
import { Store } from './core.ts';
import type { SongName } from './types.ts';

interface ToneOpts { type?: OscillatorType; f0: number; f1?: number; dur: number; vol?: number; t?: number; at?: number; bus?: AudioNode; }
interface NoiseOpts { filter?: BiquadFilterType; f0?: number; f1?: number; dur: number; vol?: number; q?: number; t?: number; at?: number; bus?: AudioNode; }

interface TrackDef { n: string; type?: OscillatorType; vol: number; sus?: number; detune?: number; drum?: boolean; }
interface SongDef { bpm: number; loop?: boolean; tracks: TrackDef[]; }
interface NoteEvent { tok: string; f: number; len: number; }
interface Track extends TrackDef { events: (NoteEvent | null)[]; len: number; }
interface Song { tracks: Track[]; loop: boolean; step: number; sd: number; next: number; total: number; }

type Synth = { tone(o: ToneOpts): void; noise(o: NoiseOpts): void };

const FX = {
  shoot: (s: Synth) => s.tone({ type: 'square', f0: 880, f1: 240, dur: 0.07, vol: 0.08 }),
  rapid: (s: Synth) => s.tone({ type: 'square', f0: 1250, f1: 420, dur: 0.05, vol: 0.06 }),
  wave: (s: Synth) => { s.tone({ type: 'sawtooth', f0: 520, f1: 150, dur: 0.1, vol: 0.07 }); s.noise({ f0: 4000, f1: 900, dur: 0.06, vol: 0.05 }); },
  lance: (s: Synth) => { s.tone({ type: 'sawtooth', f0: 2100, f1: 300, dur: 0.18, vol: 0.07 }); s.tone({ type: 'square', f0: 1000, f1: 160, dur: 0.18, vol: 0.04 }); },
  homing: (s: Synth) => { s.tone({ type: 'triangle', f0: 300, f1: 900, dur: 0.12, vol: 0.12 }); s.noise({ f0: 1500, f1: 400, dur: 0.12, vol: 0.05 }); },
  eshot: (s: Synth) => s.tone({ type: 'triangle', f0: 720, f1: 360, dur: 0.08, vol: 0.07 }),
  hit: (s: Synth) => s.noise({ filter: 'highpass', f0: 2600, f1: 1200, dur: 0.04, vol: 0.1 }),
  clank: (s: Synth) => s.tone({ type: 'square', f0: 1900, f1: 1500, dur: 0.03, vol: 0.04 }),
  pop: (s: Synth) => { s.noise({ f0: 2400, f1: 200, dur: 0.22, vol: 0.25 }); s.tone({ type: 'square', f0: 220, f1: 60, dur: 0.12, vol: 0.08 }); },
  boom: (s: Synth) => { s.noise({ f0: 1800, f1: 80, dur: 0.45, vol: 0.38 }); s.tone({ type: 'sine', f0: 140, f1: 40, dur: 0.35, vol: 0.3 }); },
  bigboom: (s: Synth) => { s.noise({ f0: 1300, f1: 40, dur: 1.3, vol: 0.55 }); s.tone({ type: 'sine', f0: 95, f1: 25, dur: 1.1, vol: 0.45 }); },
  jump: (s: Synth) => s.tone({ type: 'square', f0: 180, f1: 380, dur: 0.09, vol: 0.035 }),
  power: (s: Synth) => [523, 659, 784, 1047, 1319].forEach((f, i) => s.tone({ type: 'square', f0: f, dur: 0.08, vol: 0.08, t: i * 0.05 })),
  oneup: (s: Synth) => [784, 988, 1175, 1568, 1976].forEach((f, i) => s.tone({ type: 'triangle', f0: f, dur: 0.12, vol: 0.14, t: i * 0.07 })),
  die: (s: Synth) => { s.tone({ type: 'square', f0: 520, f1: 50, dur: 0.75, vol: 0.12 }); s.noise({ f0: 1500, f1: 100, dur: 0.5, vol: 0.2 }); },
  hurt: (s: Synth) => s.tone({ type: 'square', f0: 320, f1: 110, dur: 0.18, vol: 0.12 }),
  alarm: (s: Synth) => { for (let i = 0; i < 4; i++) s.tone({ type: 'square', f0: 520, f1: 800, dur: 0.24, vol: 0.07, t: i * 0.34 }); },
  select: (s: Synth) => s.tone({ type: 'square', f0: 660, f1: 990, dur: 0.06, vol: 0.07 }),
  confirm: (s: Synth) => [660, 990, 1320].forEach((f, i) => s.tone({ type: 'square', f0: f, dur: 0.07, vol: 0.07, t: i * 0.05 })),
  pause: (s: Synth) => { s.tone({ type: 'square', f0: 880, dur: 0.05, vol: 0.06 }); s.tone({ type: 'square', f0: 660, dur: 0.06, vol: 0.06, t: 0.06 }); },
  crumble: (s: Synth) => s.noise({ f0: 700, f1: 100, dur: 0.3, vol: 0.16 }),
  flame: (s: Synth) => s.noise({ filter: 'bandpass', f0: 900, f1: 300, dur: 0.55, vol: 0.13, q: 0.6 }),
  charge: (s: Synth) => s.tone({ type: 'sawtooth', f0: 90, f1: 1300, dur: 0.8, vol: 0.05 }),
  beam: (s: Synth) => { s.tone({ type: 'sawtooth', f0: 130, f1: 110, dur: 0.85, vol: 0.1 }); s.noise({ filter: 'bandpass', f0: 2000, f1: 1500, dur: 0.85, vol: 0.08 }); },
  stomp: (s: Synth) => { s.tone({ type: 'sine', f0: 85, f1: 30, dur: 0.3, vol: 0.35 }); s.noise({ f0: 500, f1: 60, dur: 0.22, vol: 0.18 }); },
  spit: (s: Synth) => { s.noise({ filter: 'bandpass', f0: 1300, f1: 400, dur: 0.13, vol: 0.12 }); s.tone({ type: 'triangle', f0: 320, f1: 150, dur: 0.12, vol: 0.08 }); },
  roar: (s: Synth) => { s.tone({ type: 'sawtooth', f0: 70, f1: 45, dur: 1.2, vol: 0.14 }); s.noise({ f0: 600, f1: 150, dur: 1.2, vol: 0.12 }); },
  rotor: (s: Synth) => s.noise({ filter: 'bandpass', f0: 300, f1: 250, dur: 0.12, vol: 0.04 }),
};
export type SfxName = keyof typeof FX;

const SEMI: Record<string, number> = { C: -9, D: -7, E: -5, F: -4, G: -2, A: 0, B: 2 };
function freq(tok: string): number {
  const m = /^([A-G])([#b]?)(\d)$/.exec(tok);
  if (!m) return 0;
  const n = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (parseInt(m[3], 10) - 4) * 12;
  return 440 * Math.pow(2, n / 12);
}
function parseTrack(str: string): { events: (NoteEvent | null)[]; len: number } {
  const toks = str.trim().split(/\s+/);
  const events: (NoteEvent | null)[] = new Array(toks.length).fill(null);
  let lastEv: NoteEvent | null = null;
  toks.forEach((tk, i) => {
    if (tk === '-') { if (lastEv) lastEv.len++; }
    else if (tk === '.') lastEv = null;
    else { lastEv = { tok: tk, f: freq(tk), len: 1 }; events[i] = lastEv; }
  });
  return { events, len: toks.length };
}

class SoundSystem implements Synth {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private musBus: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private song: Song | null = null;
  private songName: SongName | null = null;
  private pending: SongName | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly last: Partial<Record<SfxName, number>> = {};
  muted = Store.get('iv_muted', '0') === '1';

  /** Audio can only start after a user gesture. */
  unlock(): void {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const AC = w.AudioContext || w.webkitAudioContext;
    if (!AC) return;
    let ctx: AudioContext;
    try { ctx = new AC(); } catch { return; }
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.6; this.master.connect(comp);
    this.sfxBus = ctx.createGain(); this.sfxBus.gain.value = 0.65; this.sfxBus.connect(this.master);
    this.musBus = ctx.createGain(); this.musBus.gain.value = 0.34; this.musBus.connect(this.master);
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    if (this.pending) { const p = this.pending; this.pending = null; this.music(p, true); }
  }

  private env(g: GainNode, t: number, peak: number, dur: number): void {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }

  tone(o: ToneOpts): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus) return;
    const t = o.at !== undefined ? o.at : ctx.currentTime + (o.t || 0);
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
    this.env(g, t, o.vol || 0.2, o.dur);
    osc.connect(g); g.connect(o.bus || this.sfxBus);
    osc.start(t); osc.stop(t + o.dur + 0.05);
  }

  noise(o: NoiseOpts): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || !this.noiseBuf) return;
    const t = o.at !== undefined ? o.at : ctx.currentTime + (o.t || 0);
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'lowpass';
    f.frequency.setValueAtTime(o.f0 || 3000, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + o.dur);
    f.Q.value = o.q || 0.7;
    const g = ctx.createGain();
    this.env(g, t, o.vol || 0.2, o.dur);
    src.connect(f); f.connect(g); g.connect(o.bus || this.sfxBus);
    src.start(t, Math.random() * 0.5); src.stop(t + o.dur + 0.05);
  }

  play(name: SfxName): void {
    const ctx = this.ctx;
    if (!ctx || this.muted) return;
    const t = ctx.currentTime;
    const prev = this.last[name];
    if (prev !== undefined && t - prev < 0.035) return;
    this.last[name] = t;
    try { FX[name](this); } catch { /* ignore audio glitches */ }
  }

  // ---- music ----------------------------------------------------------------
  private drum(tok: string, t: number, vol: number): void {
    const ctx = this.ctx, bus = this.musBus;
    if (!ctx || !bus) return;
    if (tok === 'k') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.55 * vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g); g.connect(bus); o.start(t); o.stop(t + 0.2);
    } else if (tok === 's') {
      this.noise({ at: t, filter: 'highpass', f0: 1400, dur: 0.12, vol: 0.22 * vol, bus });
      this.tone({ at: t, type: 'triangle', f0: 230, f1: 170, dur: 0.08, vol: 0.12 * vol, bus });
    } else if (tok === 'h') {
      this.noise({ at: t, filter: 'highpass', f0: 7000, dur: 0.03, vol: 0.07 * vol, bus });
    } else if (tok === 'o') {
      this.noise({ at: t, filter: 'highpass', f0: 6000, dur: 0.14, vol: 0.06 * vol, bus });
    } else if (tok === 'c') {
      this.noise({ at: t, filter: 'highpass', f0: 4000, dur: 0.7, vol: 0.1 * vol, bus });
    }
  }

  private playNote(tr: Track, ev: NoteEvent, t: number, dur: number): void {
    const ctx = this.ctx, bus = this.musBus;
    if (!ctx || !bus) return;
    if (tr.drum) { this.drum(ev.tok, t, tr.vol); return; }
    if (!ev.f) return;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = tr.type || 'square';
    osc.frequency.setValueAtTime(ev.f, t);
    if (tr.detune) osc.detune.setValueAtTime(tr.detune, t);
    const v = tr.vol;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.008);
    g.gain.setTargetAtTime(v * (tr.sus !== undefined ? tr.sus : 0.6), t + 0.012, 0.09);
    g.gain.setTargetAtTime(0.0001, t + Math.max(0.02, dur * 0.9), 0.02);
    osc.connect(g); g.connect(bus);
    osc.start(t); osc.stop(t + dur + 0.12);
  }

  private tick(): void {
    const s = this.song, ctx = this.ctx;
    if (!s || !ctx) return;
    if (s.next < ctx.currentTime - 0.2) s.next = ctx.currentTime + 0.05; // tab was throttled; resync
    while (s.next < ctx.currentTime + 0.15) {
      if (!s.loop && s.step >= s.total) { this.stopMusic(); return; }
      for (const tr of s.tracks) {
        const ev = tr.events[s.step % tr.len];
        if (ev) this.playNote(tr, ev, s.next, ev.len * s.sd);
      }
      s.next += s.sd;
      s.step++;
    }
  }

  music(name: SongName, force = false): void {
    if (!force && name === this.songName && (this.song || this.pending)) return;
    this.stopMusic();
    this.songName = name;
    const ctx = this.ctx;
    if (!ctx) { this.pending = name; return; }
    const def = SONGS[name];
    const tracks: Track[] = def.tracks.map(tr => ({ ...tr, ...parseTrack(tr.n) }));
    this.song = {
      tracks, loop: def.loop !== false, step: 0,
      sd: 60 / def.bpm / 4, next: ctx.currentTime + 0.08,
      total: Math.max(...tracks.map(t => t.len)),
    };
    this.timer = setInterval(() => this.tick(), 25);
    this.tick();
  }

  stopMusic(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null; this.song = null; this.pending = null; this.songName = null;
  }

  toggleMute(): void {
    this.muted = !this.muted;
    Store.set('iv_muted', this.muted ? '1' : '0');
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.6, this.ctx.currentTime, 0.02);
  }
}

export const Sound = new SoundSystem();

// ---------------------------------------------------------------------------
// Original compositions. Tokens are 16th-note steps: note, '-' hold, '.' rest.
// Drum tokens: k kick, s snare, h hat, o open hat, c crash.
// ---------------------------------------------------------------------------
const bar8 = (root: string, oct: number): string =>
  `${root}${oct} . ${root}${oct} . ${root}${oct} . ${root}${oct + 1} . ${root}${oct} . ${root}${oct} . ${root}${oct} . ${root}${oct + 1} .`;
const bar16 = (root: string, oct: number): string => `${root}${oct} ${root}${oct} ${root}${oct + 1} ${root}${oct} `.repeat(4).trim();
const rep = (s: string, n: number): string => Array(n).fill(s).join(' ');

const SONGS: Record<SongName, SongDef> = {
  title: {
    bpm: 112,
    tracks: [
      { type: 'square', vol: 0.085, sus: 0.7, n: [
        'C5 - - - G4 - C5 - Eb5 - - - D5 - C5 -',
        'Bb4 - - - G4 - - - F4 - G4 - Bb4 - - -',
        'C5 - - - G4 - C5 - Eb5 - - - F5 - G5 -',
        'Ab5 - G5 - F5 - Eb5 - D5 - - - - - . .',
        'Eb5 - - - D5 - C5 - Bb4 - - - C5 - D5 -',
        'Eb5 - F5 - G5 - - - F5 - Eb5 - D5 - - -',
        'C5 - - - Eb5 - G5 - C6 - - - Bb5 - Ab5 -',
        'G5 - - - - - - - . . . . . . . .'].join(' ') },
      { type: 'square', vol: 0.03, detune: 8, sus: 0.7, n: [
        'G4 - - - Eb4 - G4 - C5 - - - Bb4 - G4 -',
        'F4 - - - D4 - - - C4 - D4 - F4 - - -',
        'G4 - - - Eb4 - G4 - C5 - - - D5 - Eb5 -',
        'C5 - Bb4 - Ab4 - G4 - F4 - - - - - . .',
        'C5 - - - Bb4 - Ab4 - G4 - - - Ab4 - Bb4 -',
        'C5 - D5 - Eb5 - - - D5 - C5 - Bb4 - - -',
        'G4 - - - C5 - Eb5 - G5 - - - F5 - Eb5 -',
        'D5 - - - - - - - . . . . . . . .'].join(' ') },
      { type: 'triangle', vol: 0.2, sus: 0.8, n: [bar8('C', 2), bar8('Bb', 1), bar8('Ab', 1), bar8('G', 1), bar8('Eb', 2), bar8('Ab', 1), bar8('C', 2), bar8('G', 1)].join(' ') },
      { drum: true, vol: 1, n: rep('k . . . s . . . k . k . s . . .', 7) + ' k . k . s . k . s . s . s s s s' },
      { drum: true, vol: 0.8, n: rep('. . h . . . h . . . h . . . h .', 8) },
    ],
  },
  stage1: {
    bpm: 150,
    tracks: [
      { type: 'square', vol: 0.08, n: [
        'A4 . A4 C5 . A4 D5 . E5 - - - D5 C5 D5 .',
        'E5 - G5 - E5 - D5 C5 D5 - - - . . A4 .',
        'A4 . A4 C5 . A4 D5 . E5 - - - G5 - A5 -',
        'G5 - E5 - D5 - C5 - B4 - G4 - A4 - - -',
        'C5 - - - B4 - - - A4 - - - G4 - - -',
        'F4 - A4 - C5 - F5 - E5 - - - - - . .',
        'D5 - - - C5 - - - B4 - - - G#4 - B4 -',
        'A4 - - - - - - - E5 - D5 - C5 - B4 -'].join(' ') },
      { type: 'square', vol: 0.03, detune: -10, n: [
        'E4 . E4 A4 . E4 A4 . C5 - - - A4 A4 A4 .',
        'C5 - D5 - C5 - B4 A4 B4 - - - . . E4 .',
        'E4 . E4 A4 . E4 A4 . C5 - - - D5 - E5 -',
        'D5 - C5 - B4 - A4 - G4 - D4 - E4 - - -',
        'A4 - - - G4 - - - E4 - - - D4 - - -',
        'C4 - F4 - A4 - C5 - C5 - - - - - . .',
        'A4 - - - A4 - - - G#4 - - - E4 - G#4 -',
        'E4 - - - - - - - C5 - B4 - A4 - G#4 -'].join(' ') },
      { type: 'triangle', vol: 0.22, sus: 0.8, n: [bar8('A', 2), bar8('G', 2), bar8('F', 2), bar8('E', 2), bar8('A', 2), bar8('F', 2), bar8('D', 2), bar8('E', 2)].join(' ') },
      { drum: true, vol: 1, n: rep('k . . k s . . . k . k . s . . .', 7) + ' k . . k s . . k s . s . s s s s' },
      { drum: true, vol: 0.8, n: rep('h . h . h . h . h . h . h . o .', 8) },
    ],
  },
  stage2: {
    bpm: 138,
    tracks: [
      { type: 'square', vol: 0.075, n: [
        'D5 . D5 . F5 . D5 . G5 . F5 . E5 . C5 .',
        'D5 . D5 . F5 . D5 . A5 - G5 - F5 - E5 -',
        'D5 - - - C5 - A4 - Bb4 - - - A4 - G4 -',
        'A4 - - - - - E4 - F4 - G4 - A4 - - -',
        'D5 . D5 . F5 . D5 . G5 . F5 . E5 . C5 .',
        'D5 . D5 . F5 . A5 . C6 - Bb5 - A5 - G5 -',
        'F5 - - - E5 - D5 - E5 - - - C5 - E5 -',
        'D5 - - - - - - - . . . . A4 . C5 .'].join(' ') },
      { type: 'sawtooth', vol: 0.05, sus: 0.5, n: [
        bar16('D', 2), bar16('D', 2), bar16('Bb', 1), bar16('A', 1),
        bar16('D', 2), bar16('D', 2), bar16('Bb', 1), bar16('A', 1)].join(' ') },
      { type: 'triangle', vol: 0.18, sus: 0.8, n: [bar8('D', 2), bar8('D', 2), bar8('Bb', 1), bar8('A', 1), bar8('D', 2), bar8('F', 2), bar8('G', 2), bar8('A', 1)].join(' ') },
      { drum: true, vol: 1, n: rep('k . . . s . . k k . . . s . k .', 7) + ' k . k . s . k . s s . s s s s s' },
      { drum: true, vol: 0.8, n: rep('h h o h h h o h h h o h h h o h', 8) },
    ],
  },
  stage3: {
    bpm: 118,
    tracks: [
      { type: 'triangle', vol: 0.16, sus: 0.7, n: [
        'E5 - F5 - E5 - - - B4 - - - C5 - B4 -',
        'A4 - G4 - F4 - - - E4 - - - - - . .',
        'E5 - F5 - G5 - - - B5 - C6 - D6 - C6 -',
        'B5 - - - A5 - - - F5 - - - E5 - - -',
        'E5 - F5 - E5 - - - B4 - - - C5 - B4 -',
        'A4 - G4 - F4 - - - E4 - - - F4 - G4 -',
        'A4 - - - B4 - - - C5 - - - D5 - - -',
        'E5 - - - - - - - . . . . . . . .'].join(' ') },
      { type: 'square', vol: 0.03, sus: 0.4, n: rep('E4 . B4 . E5 . B4 . F4 . C5 . F5 . C5 .', 8) },
      { type: 'triangle', vol: 0.2, sus: 0.8, n: [
        rep('E2 - - - . . E2 . F2 - - - . . E2 .', 2),
        rep('C2 - - - . . C2 . D2 - - - . . B1 .', 2),
        rep('E2 - - - . . E2 . F2 - - - . . E2 .', 2),
        'A1 - - - . . A1 . B1 - - - . . B1 . C2 - - - . . C2 . D2 - - - . . D2 .'].join(' ') },
      { drum: true, vol: 1, n: rep('k . . . . . s . . . k . . . s .', 7) + ' k . . . s . . . k . s . s . s s' },
      { drum: true, vol: 0.6, n: rep('. . h . h . . . . . h . h . . h', 8) },
    ],
  },
  boss: {
    bpm: 166,
    tracks: [
      { type: 'square', vol: 0.075, n: [
        'E5 . E5 . D#5 . E5 . G5 . F#5 . E5 . B4 .',
        'C5 . C5 . B4 . C5 . E5 . D5 . C5 . A4 .',
        'E5 . E5 . D#5 . E5 . B5 - - - A5 - G5 -',
        'F#5 - - - D#5 - - - B4 - C5 - D#5 - - -'].join(' ') },
      { type: 'sawtooth', vol: 0.045, sus: 0.45, n: [bar16('E', 2), bar16('C', 2), bar16('E', 2), bar16('B', 1)].join(' ') },
      { type: 'triangle', vol: 0.2, sus: 0.8, n: [bar8('E', 2), bar8('C', 2), bar8('E', 2), bar8('B', 1)].join(' ') },
      { drum: true, vol: 1, n: rep('k . s . k k s . k . s . k k s s', 4) },
      { drum: true, vol: 0.7, n: rep('h h h h h h h h h h h h h h o h', 4) },
    ],
  },
  clear: {
    bpm: 140, loop: false,
    tracks: [
      { type: 'square', vol: 0.09, n: 'C5 - E5 - G5 - C6 - - - G5 - C6 - - - - - - - . . . .' },
      { type: 'square', vol: 0.04, n: 'G4 - C5 - E5 - G5 - - - E5 - G5 - - - - - - - . . . .' },
      { type: 'triangle', vol: 0.2, n: 'C3 - - - E3 - - - G3 - - - C3 - - - - - - - . . . .' },
      { drum: true, vol: 1, n: 'k . . . s . . . k . s . c . . . . . . . . . . .' },
    ],
  },
  gameover: {
    bpm: 92, loop: false,
    tracks: [
      { type: 'square', vol: 0.08, n: 'G4 - - - F4 - - - Eb4 - - - D4 - - - C4 - - - - - - - . .' },
      { type: 'triangle', vol: 0.2, n: 'C3 - - - - - - - G2 - - - - - - - C2 - - - - - - - . .' },
    ],
  },
  victory: {
    bpm: 120,
    tracks: [
      { type: 'square', vol: 0.08, sus: 0.7, n: [
        'C5 - - - G4 - - - C5 - E5 - G5 - - -',
        'F5 - - - E5 - - - D5 - E5 - C5 - - -',
        'A4 - - - C5 - - - F5 - - - E5 - D5 -',
        'G5 - - - - - - - G4 - A4 - B4 - - -'].join(' ') },
      { type: 'square', vol: 0.03, detune: 7, n: [
        'E4 - - - E4 - - - G4 - C5 - E5 - - -',
        'C5 - - - C5 - - - B4 - C5 - A4 - - -',
        'F4 - - - A4 - - - C5 - - - C5 - B4 -',
        'D5 - - - - - - - D4 - F4 - G4 - - -'].join(' ') },
      { type: 'triangle', vol: 0.2, sus: 0.8, n: [bar8('C', 2), bar8('A', 1), bar8('F', 1), bar8('G', 1)].join(' ') },
      { drum: true, vol: 0.9, n: rep('k . . . s . . . k . k . s . . .', 3) + ' k . k . s . k . s . s . s s s s' },
      { drum: true, vol: 0.7, n: rep('h . h . h . h . h . h . h . h .', 4) },
    ],
  },
};

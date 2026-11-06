// Bootstrap: canvas scaling, input wiring and the fixed-timestep main loop
import { W, H, STEP, DEBUG, Input, setupTouch } from './core.ts';
import { Sound } from './audio.ts';
import { ctx2d } from './art.ts';
import { Game } from './game.ts';

const el = document.getElementById('game');
if (!(el instanceof HTMLCanvasElement)) throw new Error('Missing #game canvas');
const canvas: HTMLCanvasElement = el;
canvas.width = W;
canvas.height = H;

const game = new Game(ctx2d(canvas));
Input.attach(window);
Input.onFirst(() => Sound.unlock());
setupTouch();

function resize(): void {
  const s = Math.min(innerWidth / W, innerHeight / H);
  // prefer crisp integer scaling unless it wastes too much of the screen
  const scale = s >= 1 && Math.floor(s) / s > 0.85 ? Math.floor(s) : s;
  canvas.style.width = `${Math.floor(W * scale)}px`;
  canvas.style.height = `${Math.floor(H * scale)}px`;
}
addEventListener('resize', resize);
resize();

document.addEventListener('visibilitychange', () => { if (document.hidden) game.autoPause(); });

function step(): void {
  if (DEBUG.bot) game.botThink();
  Input.update();
  game.update();
}
for (let i = 0; i < DEBUG.ff; i++) step();

let last = performance.now();
let acc = 0;
function frame(now: number): void {
  acc += Math.min(0.25, (now - last) / 1000);
  last = now;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    step();
    acc -= STEP;
    steps++;
  }
  if (steps >= 5) acc = 0;
  game.render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// handy for debugging from the console
(window as unknown as { game: Game }).game = game;

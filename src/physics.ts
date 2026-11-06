// Axis-separated platformer collision against solids and one-way platforms
import type { Body, World } from './types.ts';

/**
 * Moves a body by its velocity and resolves collisions.
 * The body is anchored at its feet (x = centre, y = bottom).
 * @param hw half width of the collision box
 * @param h height of the collision box
 * @param dropping ignore one-way platforms (dropping through)
 * @returns -1 / 1 when a wall was hit on that side, otherwise 0
 */
export function moveBody(w: World, e: Body, hw: number, h: number, dropping = false): number {
  let wall = 0;
  if (e.vx !== 0) {
    e.x += e.vx;
    const top = e.y - h, bot = e.y;
    for (const s of w.solids) {
      if (bot > s.y + 0.5 && top < s.y + s.h && e.x + hw > s.x && e.x - hw < s.x + s.w) {
        if (e.vx > 0) { e.x = s.x - hw; wall = 1; } else { e.x = s.x + s.w + hw; wall = -1; }
      }
    }
  }
  const prev = e.y;
  e.y += e.vy;
  e.onGround = false;
  e.ground = null;
  for (const s of w.solids) {
    if (e.x + hw <= s.x || e.x - hw >= s.x + s.w) continue;
    if (e.vy >= 0) {
      if (prev <= s.y + 0.5 && e.y >= s.y) { e.y = s.y; e.vy = 0; e.onGround = true; e.ground = s; }
    } else {
      const sb = s.y + s.h;
      if (prev - h >= sb - 0.5 && e.y - h < sb) { e.y = sb + h; e.vy = 0; }
    }
  }
  if (!dropping && e.vy >= 0 && !e.onGround) {
    for (const p of w.platforms) {
      if (p.gone) continue;
      if (e.x + 2 <= p.x || e.x - 2 >= p.x + p.w) continue;
      if (prev <= p.y + 2.5 && e.y >= p.y) { e.y = p.y; e.vy = 0; e.onGround = true; e.ground = p; break; }
    }
  }
  return wall;
}

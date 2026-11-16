// Weapons: analytic hitscan against two spheres per agent (head + body),
// spread that grows with movement and bloom, and three grenade kinds.
// Nothing here touches the DOM; it returns events the match loop turns into
// tracers, sounds, kill feed entries and economy.
import { CFG } from './config.js';
import { damageAgent, eyePos, headPos, bodyPos } from './agents.js';

// Scratch vectors, reused by every shot (no allocation in the hot path).
const _eye = { x: 0, y: 0, z: 0 };
const _dir = { x: 0, y: 0, z: 0 };
const _hp = { x: 0, y: 0, z: 0 };
const _bp = { x: 0, y: 0, z: 0 };

// Current spread (radians) for an agent: base, plus movement, plus bloom
// from recent fire, minus the crouch and scope bonuses. Standing still and
// crouching is the accurate way to shoot; spraying on the run is not.
export function currentSpread(a) {
  const def = CFG.weapons[a.weapon];
  let s = def.spread + a.spreadBloom;
  const speed = Math.hypot(a.vel.x, a.vel.z);
  if (speed > 0.6) s += def.moveSpread * Math.min(1, speed / 4.6);
  if (a.crouched) s = Math.max(def.crouchSpread, s * 0.45);
  if (a.scoped) s *= 0.4;
  if (!a.onGround) s += 0.05;
  return s;
}

function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return -1;
  return tca - Math.sqrt(r * r - d2);
}

// Fire one shot from `a`. `aimErr` is extra angular error (bots aim worse
// than the crosshair). Returns an event object, or null when the gun cannot
// fire (empty mag, reloading, fire-rate gate).
export function fire(a, rng, enemies, now, aimErr = 0) {
  const def = CFG.weapons[a.weapon];
  if (!a.alive || a.reloading > 0 || a.mag <= 0) return null;
  if (now - a.lastShot < 60 / def.rpm) return null;
  a.lastShot = now;
  a.mag -= 1;
  a.recoil = Math.min(2.2, a.recoil + def.recoil * 0.32);
  a.spreadBloom = Math.min(0.05, a.spreadBloom + def.recoil * 0.004);

  eyePos(a, _eye);
  // Base direction from yaw/pitch, plus spread and aim error.
  const spread = currentSpread(a) + aimErr;
  const sy = (rng() - 0.5) * 2 * spread, sp = (rng() - 0.5) * 2 * spread;
  const yaw = a.yaw + sy, pitch = a.pitch + sp + a.recoil * 0.05;
  _dir.x = -Math.sin(yaw) * Math.cos(pitch);
  _dir.y = Math.sin(pitch);
  _dir.z = -Math.cos(yaw) * Math.cos(pitch);

  let best = null, bestT = def.range;
  for (const e of enemies) {
    if (!e.alive || e.team === a.team) continue;
    headPos(e, _hp);
    let t = raySphere(_eye.x, _eye.y, _eye.z, _dir.x, _dir.y, _dir.z, _hp.x, _hp.y, _hp.z, 0.24);
    let head = true;
    if (t < 0 || t > bestT) {
      bodyPos(e, _bp);
      t = raySphere(_eye.x, _eye.y, _eye.z, _dir.x, _dir.y, _dir.z, _bp.x, _bp.y, _bp.z, 0.48);
      head = false;
    }
    if (t >= 0 && t < bestT) { bestT = t; best = { victim: e, headshot: head, dist: t }; }
  }
  const end = {
    x: _eye.x + _dir.x * bestT, y: _eye.y + _dir.y * bestT, z: _eye.z + _dir.z * bestT,
  };
  if (!best) return { type: 'shot', from: { ..._eye }, to: end, weapon: a.weapon, hit: false };
  // Damage falls off with distance; headshots multiply.
  const falloff = best.dist > 30 ? Math.max(0.55, 1 - (best.dist - 30) / 120) : 1;
  let dmg = def.damage * falloff * (best.headshot ? def.headMult : 1);
  const killed = damageAgent(best.victim, dmg, best.headshot);
  return {
    type: 'shot', from: { ..._eye }, to: end, weapon: a.weapon, hit: true,
    victim: best.victim, headshot: best.headshot, damage: Math.round(dmg), killed,
  };
}

export function startReload(a) {
  const def = CFG.weapons[a.weapon];
  if (a.reloading > 0 || a.mag >= def.mag || a.reserve <= 0) return false;
  a.reloading = def.reload;
  return true;
}

// Advance a reload timer; call every fixed step. Returns true on completion.
export function tickReload(a, dt) {
  if (a.reloading <= 0) return false;
  a.reloading -= dt;
  if (a.reloading > 0) return false;
  const def = CFG.weapons[a.weapon];
  const need = def.mag - a.mag;
  const take = Math.min(need, a.reserve);
  a.mag += take; a.reserve -= take;
  return true;
}

export function giveWeapon(a, key) {
  const def = CFG.weapons[key];
  if (!def) return false;
  a.weapon = key;
  a.mag = def.mag; a.reserve = def.reserve; a.reloading = 0;
  a.scoped = false;
  return true;
}

export function buyWeapon(a, key) {
  const def = CFG.weapons[key];
  if (!def || a.money < def.price) return false;
  a.money -= def.price;
  return giveWeapon(a, key);
}

// --- Grenades ---------------------------------------------------------------

export class GrenadeField {
  constructor() { this.fields = []; } // {kind, x, z, r, until, fuse}
  get smoke() { return this.fields.filter((f) => f.kind === 'smoke'); }

  throwGrenade(a, kind, now) {
    if (!a.alive || a.grenades[kind] <= 0) return null;
    a.grenades[kind] -= 1;
    // Lands a short throw ahead of the thrower.
    const x = a.pos.x - Math.sin(a.yaw) * 6;
    const z = a.pos.z - Math.cos(a.yaw) * 6;
    const def = CFG.grenades[kind];
    if (kind === 'frag') {
      this.fields.push({ kind, x, z, r: def.radius, until: now + def.fuse, fuse: true });
    } else if (kind === 'smoke') {
      this.fields.push({ kind, x, z, r: def.radius, until: now + def.life });
    } else {
      this.fields.push({ kind, x, z, r: def.radius, until: now + 0.05 });
    }
    return { kind, x, z };
  }

  // Expire fields; frags return detonation events for the match loop.
  update(now, agents) {
    const events = [];
    for (let i = this.fields.length - 1; i >= 0; i--) {
      const f = this.fields[i];
      if (now < f.until) continue;
      this.fields.splice(i, 1);
      if (f.kind === 'frag') {
        const def = CFG.grenades.frag;
        const hits = [];
        for (const a of agents) {
          if (!a.alive) continue;
          const d = Math.hypot(a.pos.x - f.x, a.pos.z - f.z);
          if (d > def.radius) continue;
          const dmg = def.damage * (1 - d / (def.radius * 1.4));
          if (damageAgent(a, Math.max(12, dmg), false)) hits.push(a);
        }
        events.push({ type: 'frag', x: f.x, z: f.z, killed: hits });
      }
    }
    return events;
  }

  // Does a smoke field sit between two points?
  smokeBetween(x0, z0, x1, z1) {
    for (const f of this.fields) {
      if (f.kind !== 'smoke') continue;
      const dx = x1 - x0, dz = z1 - z0;
      const len2 = dx * dx + dz * dz;
      let t = len2 === 0 ? 0 : ((f.x - x0) * dx + (f.z - z0) * dz) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = x0 + dx * t - f.x, pz = z0 + dz * t - f.z;
      if (px * px + pz * pz < f.r * f.r) return true;
    }
    return false;
  }

  // Flash: everyone facing the burst, with line of sight, goes blind.
  applyFlash(x, z, thrower, agents) {
    const def = CFG.grenades.flash;
    const blinded = [];
    for (const a of agents) {
      if (!a.alive || a === thrower) continue;
      const d = Math.hypot(a.pos.x - x, a.pos.z - z);
      if (d > def.radius) continue;
      // Facing the burst? Compare the agent's view direction with the
      // direction to the burst; a nearby burst blinds even from the side.
      const toX = x - a.pos.x, toZ = z - a.pos.z;
      const facing = (-Math.sin(a.yaw) * toX + -Math.cos(a.yaw) * toZ) / (d || 1);
      if (facing > -0.2 || d < 4) {
        a.flashBlind = Math.max(a.flashBlind, def.blind * (1 - d / (def.radius * 1.6)));
        blinded.push(a);
      }
    }
    return blinded;
  }
}

// Agents: one plain object per combatant, plus the fixed-step movement that
// every agent — the player and the nine bots — shares. No three.js here:
// position is {x, y, z}, velocity {x, y, z}, yaw/pitch in radians.
import { CFG } from './config.js';
import { collideCircle } from './map.js';

const P = CFG.player;
let nextId = 1;

export function createAgent(team, name, isPlayer, spawn) {
  return {
    id: nextId++,
    team, name, isPlayer,
    pos: { x: spawn.x, y: 0, z: spawn.z },
    vel: { x: 0, y: 0, z: 0 },
    yaw: spawn.yaw, pitch: 0, roll: 0,
    eyeY: CFG.world.eye,
    hp: P.hp, armor: 0, alive: true, deathT: 0,
    crouched: false, onGround: true, scoped: false,
    // Loadout: the player buys; bots pick from the same table.
    weapon: 'p9', mag: 15, reserve: 45, reloading: 0,
    grenades: { frag: 0, smoke: 0, flash: 0 },
    money: CFG.economy.start, hasBomb: false,
    kills: 0, deaths: 0,
    // Gunfeel state.
    recoil: 0, spreadBloom: 0, lastShot: -10, burstLeft: 0, burstAt: 0,
    flashBlind: 0, hearAt: 0,
    // Bot brain state (unused by the player).
    brain: null,
  };
}

// Move one agent for dt seconds. `move` is {fx, fz} in world space (already
// rotated by yaw by the caller), plus jump/crouch flags. Returns distance
// travelled, which the gunfeel code uses for its move penalty.
export function stepAgent(a, move, dt) {
  if (!a.alive) return 0;
  const speed = a.crouched ? P.crouchSpeed : a.scoped ? P.scopedSpeed : P.walkSpeed;
  const wantX = move.fx * speed, wantZ = move.fz * speed;
  const t = Math.min(1, P.accel * dt);
  a.vel.x += (wantX - a.vel.x) * t;
  a.vel.z += (wantZ - a.vel.z) * t;
  const len = Math.hypot(a.vel.x, a.vel.z);
  if (len > speed) { a.vel.x *= speed / len; a.vel.z *= speed / len; }
  // Friction when no input: stop cleanly instead of sliding forever.
  if (move.fx === 0 && move.fz === 0) {
    const f = Math.max(0, 1 - P.friction * dt);
    a.vel.x *= f; a.vel.z *= f;
  }
  const beforeX = a.pos.x, beforeZ = a.pos.z;
  a.pos.x += a.vel.x * dt;
  a.pos.z += a.vel.z * dt;
  collideCircle(a.pos, P.radius);
  // Vertical: simple gravity + jump; the yard floor is flat at y = 0.
  if (move.jump && a.onGround) { a.vel.y = P.jumpSpeed; a.onGround = false; }
  if (!a.onGround) {
    a.vel.y -= CFG.world.gravity * dt;
    a.pos.y += a.vel.y * dt;
    if (a.pos.y <= 0) { a.pos.y = 0; a.vel.y = 0; a.onGround = true; }
  }
  // Eye height eases between standing and crouching.
  const targetEye = a.crouched ? CFG.world.crouchEye : CFG.world.eye;
  a.eyeY += (targetEye - a.eyeY) * Math.min(1, dt * 12);
  a.recoil = Math.max(0, a.recoil - dt * 2.6);
  a.spreadBloom = Math.max(0, a.spreadBloom - dt * 0.09);
  a.flashBlind = Math.max(0, a.flashBlind - dt);
  return Math.hypot(a.pos.x - beforeX, a.pos.z - beforeZ);
}

// Apply damage. Armor soaks half the hit until its 50 points run out.
// Returns true when the hit killed the agent.
export function damageAgent(a, dmg, headshot) {
  if (!a.alive) return false;
  let rest = dmg;
  if (a.armor > 0) {
    const soaked = Math.min(a.armor, rest * 0.5);
    a.armor -= soaked;
    rest -= soaked;
  }
  a.hp -= rest;
  if (a.hp <= 0) {
    a.hp = 0; a.alive = false; a.deathT = 0;
    a.vel.x = 0; a.vel.z = 0;
    return true;
  }
  return false;
}

// Respawn an agent at its spawn point with a fresh loadout state.
export function resetAgent(a, spawn, weapon) {
  a.pos.x = spawn.x; a.pos.y = 0; a.pos.z = spawn.z;
  a.vel.x = 0; a.vel.y = 0; a.vel.z = 0;
  a.yaw = spawn.yaw; a.pitch = 0; a.roll = 0;
  a.hp = P.hp; a.alive = true; a.deathT = 0;
  a.crouched = false; a.scoped = false; a.onGround = true;
  a.weapon = weapon;
  const def = CFG.weapons[weapon];
  a.mag = def.mag; a.reserve = def.reserve; a.reloading = 0;
  a.grenades = { frag: 0, smoke: 0, flash: 0 };
  a.hasBomb = false;
  a.recoil = 0; a.spreadBloom = 0; a.flashBlind = 0;
  if (a.brain) a.brain.state = 'spawn';
}

// Where a shot leaves the gun, and where the head / body spheres sit.
export function eyePos(a, out) {
  out.x = a.pos.x; out.y = a.pos.y + a.eyeY; out.z = a.pos.z;
  return out;
}
export function headPos(a, out) {
  out.x = a.pos.x; out.y = a.pos.y + 1.52; out.z = a.pos.z;
  return out;
}
export function bodyPos(a, out) {
  out.x = a.pos.x; out.y = a.pos.y + 0.95; out.z = a.pos.z;
  return out;
}

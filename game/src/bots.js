// BotBrain: one state machine per bot. Perception runs every ~130 ms;
// movement runs every step. The one rule this file never breaks: every
// state, including any state the code does not recognise, always yields a
// movement wish. A bot that loses its enemy never stands still — it falls
// back to its post (defenders) or its route (attackers) and keeps walking.
// That fallback is what the original build's freeze bug was missing:
// defenders left in a stale 'engage' state had no movement wish at all.
import { CFG, POSTS } from './config.js';
import { findPath, nearestWaypoint, waypointPos, losClear, insideSite } from './map.js';
import { fire, startReload, tickReload, giveWeapon } from './weapons.js';

const B = CFG.bots;

// Buy for a bot at the start of a round: spend what it has, deterministically.
export function botBuy(bot, rng) {
  const m = bot.money;
  let gun = 'p9';
  if (m >= 3400 && rng() < 0.3) gun = 'longbow';
  else if (m >= 2700 && rng() < 0.65) gun = 'kr7';
  else if (m >= 1500) gun = 'ripper';
  if (gun !== 'p9') { bot.money -= CFG.weapons[gun].price; giveWeapon(bot, gun); }
  if (bot.money >= CFG.armorPrice && rng() < 0.6) {
    bot.money -= CFG.armorPrice; bot.armor = CFG.player.armorHp;
  }
  if (bot.money >= 300 && rng() < 0.45) {
    bot.grenades[rng() < 0.5 ? 'frag' : 'smoke'] += 1;
    bot.money -= 300;
  }
}

function angleTo(bot, x, z) {
  const dx = x - bot.pos.x, dz = z - bot.pos.z;
  return Math.atan2(-dx, -dz);
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function turnToward(bot, targetYaw, dt, rate) {
  const d = angleDiff(targetYaw, bot.yaw);
  const step = Math.max(-rate * dt, Math.min(rate * dt, d));
  bot.yaw += step;
  return Math.abs(d) < 0.08;
}

export class BotBrain {
  constructor(agent, rng) {
    this.agent = agent;
    this.skill = 0.45 + rng() * 0.5;
    this.state = 'spawn';
    this.path = [];
    this.goalIdx = -1;
    this.target = null;          // visible enemy agent, or null
    this.lastKnown = null;       // {x, z} where an enemy was last seen/heard
    this.perceiveAt = 0;
    this.engageAt = 0;           // reaction delay before first shot
    this.burstLeft = 0;
    this.burstPauseUntil = 0;
    this.channel = 0;            // plant / defuse progress in seconds
    this.holdYaw = agent.yaw;
    this.stuckT = 0;
    this.lastX = agent.pos.x; this.lastZ = agent.pos.z;
    this.postIdx = 0;            // defender's assigned post waypoint
    this.scanT = 0;
  }

  // --- Perception -----------------------------------------------------------
  perceive(ctx) {
    const bot = this.agent;
    const now = ctx.now;
    if (now < this.perceiveAt) return;
    this.perceiveAt = now + B.thinkMs / 1000;
    if (!bot.alive) { this.target = null; return; }
    const smoke = ctx.fields.smoke.map((f) => ({ x: f.x, z: f.z, r: f.r }));
    let best = null, bestD = Infinity;
    for (const e of ctx.agents) {
      if (!e.alive || e.team === bot.team) continue;
      const dx = e.pos.x - bot.pos.x, dz = e.pos.z - bot.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > B.sightRange) continue;
      // Field of view, unless the enemy is close enough to hear breathing.
      const fx = -Math.sin(bot.yaw), fz = -Math.cos(bot.yaw);
      const facing = (dx * fx + dz * fz) / (d || 1);
      if (d > 4 && facing < B.fovCos) continue;
      if (bot.flashBlind > 0.3) continue;
      if (!losClear(bot.pos.x, bot.pos.z, e.pos.x, e.pos.z, 1.6, smoke)) continue;
      if (d < bestD) { bestD = d; best = e; }
    }
    if (best) {
      if (this.target !== best) this.engageAt = now + B.reactMs / 1000;
      this.target = best;
      this.lastKnown = { x: best.pos.x, z: best.pos.z };
    } else {
      this.target = null;
    }
    // Hearing: a recent shot nearby gives away a position to investigate.
    if (!this.target && ctx.lastShotAt) {
      const s = ctx.lastShotAt;
      if (s.team !== bot.team && now - s.at < 1.2) {
        const d = Math.hypot(s.x - bot.pos.x, s.z - bot.pos.z);
        if (d < B.hearRange) this.lastKnown = { x: s.x, z: s.z };
      }
    }
  }

  // --- Path following -------------------------------------------------------
  setGoal(idx) {
    const bot = this.agent;
    const from = nearestWaypoint(bot.pos.x, bot.pos.z);
    this.path = findPath(from, idx);
    this.goalIdx = idx;
    this.stuckT = 0;
    this.lastX = bot.pos.x; this.lastZ = bot.pos.z;
  }

  // Steer toward the next path node. Returns {fx, fz} in world space.
  followPath(ctx) {
    const bot = this.agent;
    if (this.path.length === 0) return { fx: 0, fz: 0 };
    const node = waypointPos(this.path[0]);
    const dx = node.x - bot.pos.x, dz = node.z - bot.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.9) {
      this.path.shift();
      return this.followPath(ctx);
    }
    // Stuck protection: no progress for 1.6 s means the node is unreachable
    // (a teammate in the way, a bad corner) — skip it and walk on.
    const moved = Math.hypot(bot.pos.x - this.lastX, bot.pos.z - this.lastZ);
    if (moved < 0.05) {
      this.stuckT += ctx.dt;
      if (this.stuckT > B.stuckSeconds) {
        this.path.shift();
        this.stuckT = 0;
        this.lastX = bot.pos.x; this.lastZ = bot.pos.z;
        return this.followPath(ctx);
      }
    } else {
      this.stuckT = 0;
      this.lastX = bot.pos.x; this.lastZ = bot.pos.z;
    }
    return { fx: dx / d, fz: dz / d };
  }

  // --- Combat ---------------------------------------------------------------
  fight(ctx) {
    const bot = this.agent;
    const now = ctx.now;
    const t = this.target;
    if (!t || !t.alive) return;
    const wantYaw = angleTo(bot, t.pos.x, t.pos.z);
    const onTarget = turnToward(bot, wantYaw, ctx.dt, B.turnRate);
    // Aim slightly above centre: headshots pay, and the error shrinks as
    // the bot stays on target.
    const aimTime = Math.min(1.5, now - this.engageAt);
    bot.pitch = Math.max(-0.5, Math.min(0.5,
      Math.atan2(1.45 - (bot.pos.y + bot.eyeY), Math.hypot(t.pos.x - bot.pos.x, t.pos.z - bot.pos.z))));
    if (now < this.engageAt || !onTarget) return;
    if (bot.mag === 0) { startReload(bot); return; }
    if (now < this.burstPauseUntil) return;
    if (this.burstLeft <= 0) {
      this.burstLeft = B.burstMin + Math.floor(ctx.rng() * (B.burstMax - B.burstMin + 1));
    }
    const err = B.aimError * (1.6 - this.skill) * (1 - aimTime * 0.35);
    const ev = fire(bot, ctx.rng, ctx.agents, now, err);
    if (ev) {
      this.burstLeft -= 1;
      ctx.events.push({ ...ev, shooter: bot });
      if (this.burstLeft <= 0) this.burstPauseUntil = now + B.burstPause;
    }
  }

  // --- Main think: one call per fixed step ---------------------------------
  think(ctx) {
    const bot = this.agent;
    const now = ctx.now;
    if (!bot.alive || ctx.phase === 'buy' || ctx.phase === 'roundEnd' || ctx.phase === 'matchEnd') {
      return { fx: 0, fz: 0, crouch: false, jump: false };
    }
    this.perceive(ctx);
    tickReload(bot, ctx.dt);

    // Combat overrides movement, but never movement itself: an engaging bot
    // still strafes, so it is never a statue with a gun — and when the
    // enemy is far away it keeps pushing toward them instead of trading
    // pot-shots across the whole yard for the rest of the round.
    if (this.target && this.target.alive) {
      if (this.state !== 'engage') { this.state = 'engage'; this.channel = 0; }
      this.fight(ctx);
      // Strafe sideways while fighting; switch direction every ~0.9 s.
      const t = this.target;
      const dx = t.pos.x - bot.pos.x, dz = t.pos.z - bot.pos.z;
      const d = Math.hypot(dx, dz) || 1;
      const side = Math.sin(now * 1.1 + this.agent.id * 1.7) > 0 ? 1 : -1;
      const back = d < 5 ? 0.5 : 0; // keep a little distance up close
      const advance = d > 25 ? 0.6 : 0; // far target: close the distance
      return {
        fx: (-dz / d) * side * 0.55 + (dx / d) * (advance - back),
        fz: (dx / d) * side * 0.55 + (dz / d) * (advance - back),
        crouch: ctx.rng() < 0.002, jump: false,
      };
    }

    // No visible enemy: the state machine below must always produce a walk.
    const bomb = ctx.bomb;
    if (bot.team === 'defend') {
      if (bomb.state === 'planted') {
        // Rotate to the site; defuse once close to the charge.
        if (Math.hypot(bot.pos.x - bomb.pos.x, bot.pos.z - bomb.pos.z) < 1.6) {
          this.state = 'defuse';
          this.channel += ctx.dt;
          bot.yaw = angleTo(bot, bomb.pos.x, bomb.pos.z);
          if (this.channel >= CFG.match.defuseSeconds) {
            ctx.events.push({ type: 'defused', agent: bot });
            this.channel = 0;
          }
          return { fx: 0, fz: 0, crouch: false, jump: false };
        }
        if (this.state !== 'rotate' || this.path.length === 0) {
          this.state = 'rotate';
          this.setGoal(nearestWaypoint(bomb.pos.x, bomb.pos.z));
        }
        const mv = this.followPath(ctx);
        if (mv.fx || mv.fz) turnToward(bot, Math.atan2(-mv.fx, -mv.fz), ctx.dt, B.turnRate);
        return { ...mv, crouch: false, jump: false };
      }
      // Quiet round: walk to the assigned post, then hold and scan the lanes.
      if (this.state !== 'toPost' || this.path.length === 0) {
        if (this.state !== 'toPost') this.state = 'toPost';
        if (this.path.length === 0) {
          const post = POSTS[this.postIdx % POSTS.length];
          this.setGoal(nearestWaypoint(post.x, post.z));
        }
      }
      const mv = this.followPath(ctx);
      if (mv.fx || mv.fz) {
        turnToward(bot, Math.atan2(-mv.fx, -mv.fz), ctx.dt, B.turnRate);
        return { ...mv, crouch: false, jump: false };
      }
      // Holding the post: slow scan across the lanes.
      this.scanT += ctx.dt;
      bot.yaw = this.holdYaw + Math.sin(this.scanT * 0.45) * 0.9;
      return { fx: 0, fz: 0, crouch: false, jump: false };
    }

    // Attackers.
    if (bomb.state === 'planted') {
      // Hold ground near the site and guard the charge.
      if (this.state !== 'toPost' || this.path.length === 0) {
        this.state = 'toPost';
        if (this.path.length === 0) {
          const gx = CFG.site.x - 6 + ctx.rng() * 4, gz = (ctx.rng() - 0.5) * 10;
          this.setGoal(nearestWaypoint(gx, gz));
        }
      }
      const mv = this.followPath(ctx);
      if (mv.fx || mv.fz) {
        turnToward(bot, Math.atan2(-mv.fx, -mv.fz), ctx.dt, B.turnRate);
        return { ...mv, crouch: false, jump: false };
      }
      this.scanT += ctx.dt;
      bot.yaw = this.holdYaw + Math.sin(this.scanT * 0.5) * 0.8;
      return { fx: 0, fz: 0, crouch: false, jump: false };
    }
    if (bot.hasBomb && insideSite(bot.pos.x, bot.pos.z)) {
      // Plant the charge. Standing still, channel 3.2 s.
      this.state = 'plant';
      this.channel += ctx.dt;
      if (this.channel >= CFG.match.plantSeconds) {
        ctx.events.push({ type: 'planted', agent: bot });
        this.channel = 0;
      }
      return { fx: 0, fz: 0, crouch: false, jump: false };
    }
    // Walk a lane toward the site; the carrier leads the push.
    if (this.state !== 'route' || this.path.length === 0) {
      this.state = 'route';
      if (this.path.length === 0) {
        const sx = CFG.site.x - 2 + (ctx.rng() - 0.5) * 5;
        const sz = (ctx.rng() - 0.5) * 9;
        this.setGoal(nearestWaypoint(sx, sz));
      }
    }
    const mv = this.followPath(ctx);
    if (mv.fx || mv.fz) turnToward(bot, Math.atan2(-mv.fx, -mv.fz), ctx.dt, B.turnRate);
    return { ...mv, crouch: false, jump: false };
  }
}

// CROSSYARD — match state machine and fixed-step loop. The sim runs at a
// fixed 1/60 s step, kept apart from rendering: update() advances the match,
// render() only draws it. All mutable match state lives in one object,
// exposed as window.__match for debugging and playtests.
import * as THREE from 'three';
import { CFG, SPAWNS, POSTS } from './config.js';
import { mulberry32, intRange } from './rng.js';
import { insideSite, nearestWaypoint } from './map.js';
import { createAgent, stepAgent, damageAgent, resetAgent, eyePos } from './agents.js';
import { fire, startReload, tickReload, giveWeapon, buyWeapon, GrenadeField, currentSpread } from './weapons.js';
import { BotBrain, botBuy } from './bots.js';
import { buildWorld } from './world.js';
import { Input } from './input.js';
import { createHud } from './hud.js';
import { sfx, unlockAudio } from './audio.js';

const STEP = 1 / 60;
const params = new URLSearchParams(location.search);
const SHOT = params.get('shot'); // start | play | end — staged screenshot scenes
const SEED = Number(params.get('seed') || 20261117);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);
window.addEventListener('resize', () => {
  renderer.setSize(window.innerWidth, window.innerHeight);
  world.camera.aspect = window.innerWidth / window.innerHeight;
  world.camera.updateProjectionMatrix();
});

const world = buildWorld();
const input = new Input(renderer.domElement);
input.onFirstGesture = () => unlockAudio();
input.onLockChange = (locked) => {
  if (!locked && match.phase === 'live' && !SHOT) hud.hint('Click the game to aim', 2000);
};

const rng = mulberry32(SEED);
const fields = new GrenadeField();

const match = {
  phase: 'menu', round: 1, timer: 0, now: 0,
  score: { attack: 0, defend: 0 },
  lossStreak: { attack: 0, defend: 0 },
  agents: [], player: null,
  bomb: { state: 'none', carrier: null, pos: { x: 0, z: 0 }, endsAt: 0 },
  channel: { active: false, label: '', progress: 0 },
  spreadPx: 8, fields,
};
window.__match = match;

let events = [];
let lastShotAt = null;
let prevMouseDown = false;
let shotReadyAt = 0;
let frames = 0;

function makeAgents() {
  const agents = [];
  const player = createAgent('attack', 'You', true, SPAWNS.attack[0]);
  player.owned = new Set(['p9']);
  agents.push(player);
  for (let i = 1; i < 5; i++) {
    const b = createAgent('attack', CFG.teams.attack.names[i], false, SPAWNS.attack[i]);
    b.brain = new BotBrain(b, rng);
    b.brain.postIdx = i;
    agents.push(b);
  }
  for (let i = 0; i < 5; i++) {
    const b = createAgent('defend', CFG.teams.defend.names[i], false, SPAWNS.defend[i]);
    b.brain = new BotBrain(b, rng);
    b.brain.postIdx = i;
    agents.push(b);
  }
  match.agents = agents;
  match.player = player;
  return agents;
}
makeAgents();

const hud = createHud(buyItem);
hud.onPlay(() => {
  hud.showMenu(false);
  input.lock();
  if (match.phase === 'menu' || match.phase === 'matchEnd') startMatch();
});
hud.setBuyVisible(false);

function buyItem(key) {
  const p = match.player;
  if (match.phase !== 'buy' || !p.alive) return;
  if (key === 'armor') {
    if (p.money < CFG.armorPrice || p.armor >= CFG.player.armorHp) return;
    p.money -= CFG.armorPrice; p.armor = CFG.player.armorHp;
  } else if (key.startsWith('n:')) {
    const g = key.slice(2);
    if (p.money < CFG.grenades[g].price) return;
    p.money -= CFG.grenades[g].price; p.grenades[g] += 1;
  } else {
    if (!buyWeapon(p, key)) return;
    p.owned.add(key);
  }
  sfx.buy();
}

function startMatch() {
  match.score.attack = 0; match.score.defend = 0;
  match.lossStreak.attack = 0; match.lossStreak.defend = 0;
  match.round = 1;
  for (const a of match.agents) { a.money = CFG.economy.start; a.kills = 0; a.deaths = 0; }
  startRound();
}

function startRound() {
  const attackers = match.agents.filter((a) => a.team === 'attack');
  const defenders = match.agents.filter((a) => a.team === 'defend');
  attackers.forEach((a, i) => {
    const weapon = a.alive && a.weapon !== 'p9' ? a.weapon : 'p9';
    resetAgent(a, SPAWNS.attack[i], weapon);
    if (!a.isPlayer) botBuy(a, rng);
  });
  defenders.forEach((a, i) => {
    const weapon = a.alive && a.weapon !== 'p9' ? a.weapon : 'p9';
    resetAgent(a, SPAWNS.defend[i], weapon);
    if (!a.isPlayer) botBuy(a, rng);
  });
  // Fresh mags at the top of the round; the money stays.
  for (const a of match.agents) {
    const def = CFG.weapons[a.weapon];
    a.mag = def.mag; a.reserve = def.reserve;
  }
  // The charge goes to a random attacker — sometimes the player.
  const carrier = attackers[intRange(rng, 0, attackers.length - 1)];
  carrier.hasBomb = true;
  match.bomb = { state: 'carried', carrier, pos: { x: carrier.pos.x, z: carrier.pos.z }, endsAt: 0 };
  match.phase = 'buy';
  match.timer = CFG.match.buySeconds;
  match.channel.active = false;
  hud.hideBanner();
  hud.setBuyVisible(true);
  if (carrier.isPlayer) hud.hint('You carry the charge — get it to the Yard [E to plant]', 4000);
  else hud.hint('Buy phase — press B for the buy menu', 3000);
}

function endRound(winner, reason) {
  if (match.phase === 'roundEnd' || match.phase === 'matchEnd') return;
  match.score[winner] += 1;
  const loser = winner === 'attack' ? 'defend' : 'attack';
  match.lossStreak[winner] = 0;
  match.lossStreak[loser] += 1;
  const lossPay = Math.min(CFG.economy.lossStreakMax,
    CFG.economy.loss + CFG.economy.lossStreak * (match.lossStreak[loser] - 1));
  for (const a of match.agents) {
    a.money = Math.min(CFG.economy.cap, a.money + (a.team === winner ? CFG.economy.win : lossPay));
  }
  match.phase = 'roundEnd';
  match.timer = CFG.match.endSeconds;
  match.channel.active = false;
  hud.setBuyVisible(false);
  const winLabel = winner === 'attack' ? 'KESTRELS' : 'BASTION';
  const youWon = match.player.team === winner;
  hud.banner(`${winLabel} WIN THE ROUND`, reason, youWon ? '#35c4b5' : '#ff9f43');
  if (youWon) sfx.roundWin(); else sfx.roundLose();
}

function endMatch() {
  match.phase = 'matchEnd';
  const winner = match.score.attack > match.score.defend ? 'attack'
    : match.score.defend > match.score.attack ? 'defend' : null;
  if (winner) {
    const label = winner === 'attack' ? 'KESTRELS' : 'BASTION';
    hud.banner(`${label} WIN THE MATCH`, `${match.score.attack} — ${match.score.defend}`, '#ffb347', true);
  } else {
    hud.banner('DRAW', `${match.score.attack} — ${match.score.defend}`, '#eef1f6', true);
  }
  setTimeout(() => { if (match.phase === 'matchEnd') hud.showMenu(true); }, 3500);
}

function dropBombAt(a) {
  if (!a.hasBomb) return;
  a.hasBomb = false;
  match.bomb = { state: 'dropped', carrier: null, pos: { x: a.pos.x, z: a.pos.z }, endsAt: 0 };
}

function handleKill(ev, shooter) {
  const v = ev.victim;
  v.deaths += 1;
  if (shooter) {
    shooter.kills += 1;
    shooter.money = Math.min(CFG.economy.cap, shooter.money + CFG.economy.kill);
  }
  hud.killfeed(shooter ? shooter.name : '—', v.name, ev.headshot, CFG.weapons[ev.weapon].name);
  dropBombAt(v);
  if (shooter === match.player) sfx.kill();
}

function drainEvents() {
  for (const ev of events) {
    if (ev.type === 'shot') {
      world.addTracer(ev.from, ev.to, CFG.weapons[ev.weapon].tracer);
      if (ev.shooter === match.player || ev.shooter?.isPlayer) {
        eyePos(match.player, _eyeTmp);
        world.muzzle({ x: _eyeTmp.x - Math.sin(match.player.yaw) * 0.6, y: _eyeTmp.y - 0.15, z: _eyeTmp.z - Math.cos(match.player.yaw) * 0.6 });
      }
      lastShotAt = { x: ev.from.x, z: ev.from.z, team: ev.shooter?.team, at: match.now };
      if (ev.hit) {
        if (ev.victim === match.player) { match.player.hurtFlash = 0.55; sfx.hurt(); }
        if (ev.shooter === match.player) { hud.hitmarker(); sfx.hit(); }
        if (ev.killed) handleKill(ev, ev.shooter);
      }
    } else if (ev.type === 'planted') {
      const a = ev.agent;
      a.hasBomb = false;
      a.money = Math.min(CFG.economy.cap, a.money + CFG.economy.plant);
      match.bomb = { state: 'planted', carrier: null, pos: { x: a.pos.x, z: a.pos.z }, endsAt: match.now + CFG.match.bombSeconds };
      hud.hint('Charge planted — defend the Yard!', 4000);
      sfx.plantBeep();
    } else if (ev.type === 'defused') {
      ev.agent.money = Math.min(CFG.economy.cap, ev.agent.money + CFG.economy.defuse);
      match.bomb = { state: 'none', carrier: null, pos: { x: 0, z: 0 }, endsAt: 0 };
      sfx.defuseBeep();
      endRound('defend', 'Charge defused.');
    } else if (ev.type === 'frag') {
      sfx.explosion();
      for (const dead of ev.killed) {
        hud.killfeed('Frag', dead.name, false, 'Frag Grenade');
        dropBombAt(dead);
      }
    }
  }
  events.length = 0;
}

const _eyeTmp = { x: 0, y: 0, z: 0 };

function playerStep(dt) {
  const p = match.player;
  if (!p.alive) return;
  const m = input.takeMouse();
  if (input.locked) {
    p.yaw -= m.dx * 0.0021;
    p.pitch -= m.dy * 0.0021;
    p.pitch = Math.max(-1.45, Math.min(1.45, p.pitch));
  }
  p.crouched = input.held('ControlLeft') || input.held('KeyC');
  p.scoped = input.mouseRight && p.weapon === 'longbow';
  const axes = input.moveAxes();
  const sin = Math.sin(p.yaw), cos = Math.cos(p.yaw);
  // Camera-space axes to world space: forward is (-sin, -cos).
  const fx = -sin * axes.fz + cos * axes.fx;
  const fz = -cos * axes.fz - sin * axes.fx;
  stepAgent(p, { fx, fz, jump: input.pressed('Space') }, dt);

  // Firing: hold for autos, click edge for semi-autos.
  const def = CFG.weapons[p.weapon];
  const clicked = input.mouseDown && !prevMouseDown;
  prevMouseDown = input.mouseDown;
  const wantFire = def.auto ? input.mouseDown : clicked;
  if (wantFire && match.phase === 'live') {
    if (p.mag === 0 && p.reloading <= 0) { sfx.dryFire(); startReload(p); }
    else {
      const ev = fire(p, rng, match.agents, match.now);
      if (ev) { ev.shooter = p; events.push(ev); sfx.shot(p.weapon); }
    }
  }
  if (input.pressed('KeyR')) { if (startReload(p)) sfx.reload(); }
  if (tickReload(p, dt)) sfx.click();
  // Weapon slots.
  for (let s = 1; s <= 4; s++) {
    if (!input.pressed('Digit' + s)) continue;
    const key = Object.keys(CFG.weapons).find((k) => CFG.weapons[k].slot === s);
    if (key && p.owned.has(key)) { giveWeapon(p, key); sfx.click(); }
    else hud.hint('Not owned — buy it first [B]', 1800);
  }
  // Grenades: 5 frag, 6 smoke, 7 flash — throw immediately.
  const gk = input.pressed('Digit5') ? 'frag' : input.pressed('Digit6') ? 'smoke' : input.pressed('Digit7') ? 'flash' : null;
  if (gk && match.phase === 'live') {
    const thrown = fields.throwGrenade(p, gk, match.now);
    if (thrown) {
      sfx.grenadeThrow();
      if (gk === 'flash') {
        const blinded = fields.applyFlash(thrown.x, thrown.z, p, match.agents);
        if (blinded.includes(p)) sfx.flash();
      }
    } else hud.hint('No ' + CFG.grenades[gk].name + ' left — buy one [B]', 1800);
  }
  // Buy menu toggle.
  if (input.pressed('KeyB')) {
    if (match.phase === 'buy') {
      const show = hud.els.buy.style.display !== 'block';
      hud.setBuyVisible(show);
      if (show) input.unlock(); else input.lock();
    }
  }
  // Plant / defuse channel on E.
  const ch = match.channel;
  if (input.held('KeyE') && match.phase === 'live') {
    if (p.hasBomb && insideSite(p.pos.x, p.pos.z)) {
      ch.active = true; ch.label = 'PLANTING THE CHARGE…';
      ch.progress += dt / CFG.match.plantSeconds;
      if (ch.progress >= 1) {
        ch.active = false; ch.progress = 0;
        events.push({ type: 'planted', agent: p });
      }
    } else if (match.bomb.state === 'planted'
      && Math.hypot(p.pos.x - match.bomb.pos.x, p.pos.z - match.bomb.pos.z) < 1.8) {
      ch.active = true; ch.label = 'DEFUSING…';
      ch.progress += dt / CFG.match.defuseSeconds;
      if (ch.progress >= 1) {
        ch.active = false; ch.progress = 0;
        events.push({ type: 'defused', agent: p });
      }
    } else { ch.active = false; ch.progress = 0; }
  } else { ch.active = false; ch.progress = 0; }
  // Moving cancels a channel (bots stand still while channelling, so do we).
  if (ch.active && (Math.abs(fx) > 0.1 || Math.abs(fz) > 0.1)) { ch.active = false; ch.progress = 0; }
  match.spreadPx = 5 + currentSpread(p) * 420;
  p.hurtFlash = Math.max(0, (p.hurtFlash || 0) - dt * 1.8);
}

function botStep(dt) {
  for (const a of match.agents) {
    if (a.isPlayer || !a.alive) continue;
    const ctx = {
      now: match.now, dt, rng, agents: match.agents, bomb: match.bomb,
      phase: match.phase, fields, events, lastShotAt,
    };
    const mv = a.brain.think(ctx);
    stepAgent(a, mv, dt);
    tickReload(a, dt);
  }
}

function update(dt) {
  match.now += dt;
  if (match.phase === 'menu' || match.phase === 'matchEnd') {
    // Idle menu: the yard sits still, bots wait at spawn.
    drainEvents();
    return;
  }
  match.timer -= dt;
  // Bomb follows its carrier; a dropped charge waits to be picked up.
  if (match.bomb.state === 'carried' && match.bomb.carrier) {
    match.bomb.pos.x = match.bomb.carrier.pos.x;
    match.bomb.pos.z = match.bomb.carrier.pos.z;
    if (!match.bomb.carrier.alive) dropBombAt(match.bomb.carrier);
  }
  if (match.bomb.state === 'dropped') {
    for (const a of match.agents) {
      if (a.team === 'attack' && a.alive
        && Math.hypot(a.pos.x - match.bomb.pos.x, a.pos.z - match.bomb.pos.z) < 1.2) {
        a.hasBomb = true;
        match.bomb = { state: 'carried', carrier: a, pos: { x: a.pos.x, z: a.pos.z }, endsAt: 0 };
        if (a.isPlayer) hud.hint('You picked up the charge', 2000);
        break;
      }
    }
  }
  if (match.phase === 'buy') {
    if (match.timer <= 0) { match.phase = 'live'; match.timer = CFG.match.roundSeconds; hud.setBuyVisible(false); hud.hint('Round live — take the Yard', 2500); }
    drainEvents();
    return;
  }
  if (match.phase === 'roundEnd') {
    for (const a of match.agents) if (!a.alive) a.deathT += dt;
    if (match.timer <= 0) {
      const over = match.score.attack >= CFG.match.roundsToWin
        || match.score.defend >= CFG.match.roundsToWin
        || match.round >= CFG.match.maxRounds;
      if (over) endMatch();
      else { match.round += 1; startRound(); }
    }
    drainEvents();
    return;
  }
  // Live round.
  playerStep(dt);
  botStep(dt);
  for (const a of match.agents) if (!a.alive) a.deathT += dt;
  // Grenade fields (frags detonate, smoke expires).
  for (const ev of fields.update(match.now, match.agents)) {
    if (ev.type === 'frag') events.push(ev);
  }
  drainEvents();
  // Win checks.
  const aliveA = match.agents.some((a) => a.team === 'attack' && a.alive);
  const aliveD = match.agents.some((a) => a.team === 'defend' && a.alive);
  if (!aliveA) endRound('defend', 'Kestrels eliminated.');
  else if (!aliveD) endRound('attack', 'Bastion eliminated.');
  else if (match.bomb.state === 'planted' && match.now >= match.bomb.endsAt) {
    sfx.explosion();
    endRound('attack', 'The charge detonated at the Yard.');
  } else if (match.timer <= 0 && match.bomb.state !== 'planted') {
    // The clock only kills the round while the charge is still unplanted.
    endRound('defend', 'Time expired — the Yard held.');
  }
}

// --- Staged screenshot scenes ------------------------------------------------
// ?shot=start|play|end&seed=N — deterministic tableaus for the three
// screenshots. They run the real sim, just posed: the buy menu open, a
// mid-fight, and a round won.
function stageShot() {
  if (!SHOT) return;
  hud.showMenu(false);
  startMatch();
  if (SHOT === 'start') {
    // Buy phase, menu open, player at spawn looking down the mid lane.
    match.phase = 'buy'; match.timer = CFG.match.buySeconds;
    hud.setBuyVisible(true);
  } else if (SHOT === 'play') {
    match.phase = 'live'; match.timer = 62;
    hud.setBuyVisible(false);
    const p = match.player;
    p.pos.x = -6; p.pos.z = 2; p.yaw = -Math.PI / 2 + 0.12; p.pitch = 0.01;
    giveWeapon(p, 'kr7'); p.owned.add('kr7'); p.mag = 18;
    p.armor = CFG.player.armorHp; // the staged firefight is hot; keep the player up for the shot
    const d1 = match.agents.find((a) => a.name === 'Bram');
    const d2 = match.agents.find((a) => a.name === 'Odile');
    const d3 = match.agents.find((a) => a.name === 'Kasper');
    d1.pos.x = 3; d1.pos.z = -1; d1.yaw = Math.PI / 2; d1.brain.state = 'engage';
    d2.pos.x = 8; d2.pos.z = 5; d2.yaw = Math.PI / 2 + 0.4; d2.brain.state = 'engage';
    d3.pos.x = -3; d3.pos.z = -12; d3.yaw = Math.PI / 2 - 0.3;
    const vex = match.agents.find((a) => a.name === 'Vex');
    vex.pos.x = -10; vex.pos.z = 5; vex.yaw = -Math.PI / 2;
    fields.fields.push({ kind: 'smoke', x: 6, z: -6, r: 5.5, until: match.now + 14 });
    world.addTracer({ x: -6, y: 1.5, z: 2 }, { x: 3, y: 1.3, z: -1 }, 0xfff2b0);
  } else if (SHOT === 'end') {
    match.phase = 'roundEnd'; match.timer = CFG.match.endSeconds;
    match.round = 6; match.score.attack = 3; match.score.defend = 2;
    hud.setBuyVisible(false);
    hud.hint('', 0); // clear the round-start hint for a clean tableau
    const p = match.player;
    p.pos.x = 14; p.pos.z = 0; p.yaw = -Math.PI / 2; p.pitch = 0;
    match.bomb = { state: 'planted', carrier: null, pos: { x: 24, z: 0 }, endsAt: match.now + 30 };
    hud.banner('KESTRELS WIN THE ROUND', 'The charge detonated at the Yard.', '#35c4b5', true);
    const d1 = match.agents.find((a) => a.name === 'Bram');
    d1.alive = false; d1.hp = 0; d1.pos.x = 22; d1.pos.z = -3;
  }
  shotReadyAt = performance.now() + 500;
}

// --- Main loop ---------------------------------------------------------------
let lastT = performance.now();
let acc = 0;
function frame(nowMs) {
  requestAnimationFrame(frame);
  const frameDt = Math.min(0.25, (nowMs - lastT) / 1000);
  lastT = nowMs;
  acc += frameDt;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    update(STEP);
    acc -= STEP;
    steps++;
  }
  if (steps === 5) acc = 0; // slow host: drop time rather than spiral
  frames++;
  world.sync(match, frameDt, match.now);
  hud.update(match, match.player, match.now);
  renderer.render(world.scene, world.camera);
  if (SHOT && !window.__shotReady && performance.now() >= shotReadyAt && frames > 3) {
    window.__shotReady = true;
  }
}

stageShot();
requestAnimationFrame(frame);

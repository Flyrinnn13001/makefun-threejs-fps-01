// CROSSYARD — every tunable in one place. Nothing here imports three.js;
// it is pure data, so the sim can run (and be tested) without a renderer.
export const CFG = {
  // World: a dusk freight yard, 68 m east-west, 48 m north-south.
  world: { halfX: 34, halfZ: 24, eye: 1.62, crouchEye: 1.08, gravity: 18 },
  player: {
    walkSpeed: 4.6, crouchSpeed: 2.3, scopedSpeed: 2.7, accel: 42,
    friction: 30, jumpSpeed: 6.2, radius: 0.42, hp: 100, armorHp: 50,
  },
  match: {
    roundsToWin: 7, maxRounds: 12, buySeconds: 12, roundSeconds: 100,
    plantSeconds: 3.2, defuseSeconds: 5.0, bombSeconds: 40, endSeconds: 5,
  },
  economy: {
    start: 800, cap: 16000, kill: 300, win: 2700, loss: 1900,
    lossStreak: 500, lossStreakMax: 2900, plant: 300, defuse: 300,
  },
  teams: {
    attack: {
      label: 'Kestrels', color: 0x35c4b5, css: '#35c4b5',
      names: ['You', 'Vex', 'Milo', 'Sana', 'Rook'],
    },
    defend: {
      label: 'Bastion', color: 0xff9f43, css: '#ff9f43',
      names: ['Bram', 'Odile', 'Kasper', 'Ines', 'Tomas'],
    },
  },
  site: { name: 'the Yard', x: 24, z: 0, radius: 6.5 },
  weapons: {
    p9: {
      name: 'P9 Sidearm', price: 0, slot: 1, auto: false, rpm: 320,
      damage: 26, headMult: 3.0, range: 42, mag: 15, reserve: 45,
      reload: 1.5, spread: 0.011, moveSpread: 0.030, crouchSpread: 0.006,
      recoil: 0.35, zoom: 1, tracer: 0xffe08a, sound: 'pistol',
    },
    ripper: {
      name: 'Ripper SMG', price: 1500, slot: 2, auto: true, rpm: 780,
      damage: 21, headMult: 3.2, range: 38, mag: 28, reserve: 84,
      reload: 2.0, spread: 0.016, moveSpread: 0.042, crouchSpread: 0.009,
      recoil: 0.5, zoom: 1, tracer: 0xffd27a, sound: 'smg',
    },
    kr7: {
      name: 'KR-7 Rifle', price: 2700, slot: 3, auto: true, rpm: 600,
      damage: 33, headMult: 4.0, range: 70, mag: 25, reserve: 75,
      reload: 2.4, spread: 0.008, moveSpread: 0.036, crouchSpread: 0.004,
      recoil: 0.8, zoom: 1, tracer: 0xfff2b0, sound: 'rifle',
    },
    longbow: {
      name: 'Longbow DMR', price: 3400, slot: 4, auto: false, rpm: 52,
      damage: 82, headMult: 3.6, range: 90, mag: 5, reserve: 15,
      reload: 3.1, spread: 0.002, moveSpread: 0.05, crouchSpread: 0.001,
      recoil: 2.4, zoom: 2.4, tracer: 0xffffff, sound: 'dmr',
    },
  },
  grenades: {
    frag: { name: 'Frag Grenade', price: 300, radius: 7, damage: 95, fuse: 1.6 },
    smoke: { name: 'Smoke Grenade', price: 300, radius: 5.5, life: 15 },
    flash: { name: 'Flash Grenade', price: 200, radius: 26, blind: 3.2 },
  },
  armorPrice: 650,
  bots: {
    thinkMs: 130, sightRange: 46, fovCos: 0.42, hearRange: 26,
    burstMin: 3, burstMax: 6, burstPause: 0.55, aimError: 0.028,
    turnRate: 5.2, reactMs: 260, stuckSeconds: 1.6, postHold: 0.5,
  },
  // Dusk palette: cold blue steel against warm sodium light.
  palette: {
    sky: 0x2b2f4a, fog: 0x353a55, ground: 0x3a3f4a, groundLine: 0x4d5468,
    containerA: 0x7a4a2e, containerB: 0x2e5d6b, containerC: 0x6b7a2e,
    crate: 0x8a6b45, wall: 0x5a5f6e, warehouse: 0x4a3f55,
    accent: 0xffb347, attack: 0x35c4b5, defend: 0xff9f43,
    tracer: 0xffe08a, smoke: 0xb8bcc8,
  },
};

// Attackers spawn west, defenders east, both facing the yard's mid lanes.
export const SPAWNS = {
  attack: [
    { x: -30.5, z: 0.5, yaw: -Math.PI / 2 }, { x: -31, z: 3, yaw: -Math.PI / 2 },
    { x: -30, z: -2.5, yaw: -Math.PI / 2 }, { x: -28, z: 12.5, yaw: -Math.PI / 2 },
    { x: -30.5, z: 15.5, yaw: -Math.PI / 2 },
  ],
  defend: [
    { x: 28, z: -3, yaw: Math.PI / 2 }, { x: 29, z: 4, yaw: Math.PI / 2 },
    { x: 26, z: -12, yaw: Math.PI / 2 }, { x: 27, z: 13, yaw: Math.PI / 2 },
    { x: 24, z: 0, yaw: Math.PI / 2 },
  ],
};

// Defender posts: the five places Bastion holds while the round is quiet.
export const POSTS = [
  { x: 24, z: -3 }, { x: 19.5, z: -15.5 }, { x: 10, z: -1 },
  { x: 12, z: -12 }, { x: 18, z: 13 },
];

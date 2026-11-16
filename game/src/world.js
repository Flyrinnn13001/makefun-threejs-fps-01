// CROSSYARD renderer: builds the dusk freight yard once, then syncs a small
// pool of meshes from the sim every frame. No geometry is created per frame;
// tracers, smoke and the muzzle flash are fixed pools that get recycled.
import * as THREE from 'three';
import { CFG } from './config.js';
import { BOXES } from './map.js';

const P = CFG.palette;

// Scratch objects reused every frame (no per-frame allocation in hot loops).
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _c1 = new THREE.Color();

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

function groundTexture() {
  return canvasTexture(1024, 720, (g, w, h) => {
    g.fillStyle = '#3a3f4a'; g.fillRect(0, 0, w, h);
    // Weathered asphalt: blotches and cracks.
    for (let i = 0; i < 2600; i++) {
      const s = 2 + Math.random() * 9;
      g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.045)';
      g.fillRect(Math.random() * w, Math.random() * h, s, s);
    }
    // Yard lane markings: faded yellow centre lines and white bays.
    g.strokeStyle = 'rgba(255,179,71,0.55)'; g.lineWidth = 5;
    g.setLineDash([46, 30]);
    g.beginPath(); g.moveTo(0, h * 0.5); g.lineTo(w, h * 0.5); g.stroke();
    g.setLineDash([]);
    g.strokeStyle = 'rgba(255,255,255,0.16)'; g.lineWidth = 3;
    for (let i = 1; i < 8; i++) {
      g.beginPath(); g.moveTo((w / 8) * i, 0); g.lineTo((w / 8) * i, h); g.stroke();
    }
    // Oil stains near the container rows.
    for (let i = 0; i < 14; i++) {
      g.fillStyle = 'rgba(10,10,14,0.22)';
      g.beginPath();
      g.ellipse(Math.random() * w, Math.random() * h, 22 + Math.random() * 40, 12 + Math.random() * 22, 0, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function ribbedTexture(base, rib) {
  return canvasTexture(256, 128, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) {
      g.fillStyle = rib; g.fillRect(x, 0, 6, h);
      g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 6, 0, 3, h);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8);
  });
}

function plankTexture() {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#8a6b45'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 42) {
      g.fillStyle = y % 84 === 0 ? '#7d5f3c' : '#93764f';
      g.fillRect(0, y, w, 40);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y, w, 2);
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(20 + (y * 7) % 180, y + 8, 4, 4);
      g.fillRect(200 - (y * 5) % 150, y + 28, 4, 4);
    }
  });
}

function panelTexture(base) {
  return canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.30)'; g.lineWidth = 2;
    for (let y = 0; y <= h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    for (let x = 0; x <= w; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    for (let i = 0; i < 300; i++) {
      g.fillStyle = 'rgba(0,0,0,0.08)';
      g.fillRect(Math.random() * w, Math.random() * h, 4, 4);
    }
  });
}

const TEXTURES = {
  ground: null, containerA: null, containerB: null, containerC: null,
  crate: null, wall: null, warehouse: null,
};

function makeTextures() {
  if (TEXTURES.ground) return TEXTURES;
  TEXTURES.ground = groundTexture();
  TEXTURES.containerA = ribbedTexture('#7a4a2e', '#5d3620');
  TEXTURES.containerB = ribbedTexture('#2e5d6b', '#21444f');
  TEXTURES.containerC = ribbedTexture('#6b7a2e', '#4f5c20');
  TEXTURES.crate = plankTexture();
  TEXTURES.wall = panelTexture('#5a5f6e');
  TEXTURES.warehouse = panelTexture('#4a3f55');
  return TEXTURES;
}

function agentMesh(team) {
  const g = new THREE.Group();
  const trim = team === 'attack' ? P.attack : P.defend;
  const torso = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.34, 0.62, 4, 10),
    new THREE.MeshStandardMaterial({ color: 0x2c2f38, roughness: 0.85 }),
  );
  torso.position.y = 1.02;
  const vest = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.5, 0.4),
    new THREE.MeshStandardMaterial({ color: trim, roughness: 0.7 }),
  );
  vest.position.y = 1.12;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.21, 14, 10),
    new THREE.MeshStandardMaterial({ color: 0xc9a37e, roughness: 0.8 }),
  );
  head.position.y = 1.62;
  const helmet = new THREE.Mesh(
    new THREE.SphereGeometry(0.23, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55),
    new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.6 }),
  );
  helmet.position.y = 1.64;
  const gun = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.14, 0.85),
    new THREE.MeshStandardMaterial({ color: 0x16181d, roughness: 0.45, metalness: 0.5 }),
  );
  gun.position.set(0.28, 1.18, 0.35);
  const legs = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.62, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.9 }),
  );
  legs.position.y = 0.34;
  g.add(torso, vest, head, helmet, gun, legs);
  g.userData.head = head;
  return g;
}

function buildViewmodel() {
  const g = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1e24, roughness: 0.4, metalness: 0.6 });
  const grip = new THREE.MeshStandardMaterial({ color: 0x2e3138, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.13, 0.52), dark);
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.34, 8), dark);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.4);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.1), grip);
  sight.position.set(0, 0.09, -0.08);
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.2), grip);
  stock.position.set(0, -0.01, 0.3);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.09), grip);
  mag.position.set(0, -0.12, -0.05); mag.rotation.x = 0.15;
  g.add(body, barrel, sight, stock, mag);
  g.position.set(0.25, -0.26, -0.52);
  g.scale.setScalar(0.82);
  return g;
}

export function buildWorld() {
  makeTextures();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(P.sky);
  scene.fog = new THREE.Fog(P.fog, 26, 95);

  const camera = new THREE.PerspectiveCamera(75, 1280 / 800, 0.08, 220);
  camera.rotation.order = 'YXZ';

  // Dusk light: a low warm sun and a cool purple sky fill.
  scene.add(new THREE.HemisphereLight(0x8a7fb8, 0x2a2418, 1.12));
  const sun = new THREE.DirectionalLight(0xffb347, 1.65);
  sun.position.set(-28, 16, -18);
  scene.add(sun);
  const siteLight = new THREE.PointLight(0xffb347, 26, 26, 1.8);
  siteLight.position.set(CFG.site.x, 5, CFG.site.z);
  scene.add(siteLight);
  const midLight = new THREE.PointLight(0x7fb8ff, 14, 22, 1.8);
  midLight.position.set(-6, 5, 0);
  scene.add(midLight);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(68, 48),
    new THREE.MeshStandardMaterial({ map: TEXTURES.ground, roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  // Perimeter fence (visual; the sim clamps to the same bounds).
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0x3c4150, roughness: 0.9 });
  for (const [x, z, w, d] of [
    [0, -24.4, 69, 0.4], [0, 24.4, 69, 0.4],
    [-34.4, 0, 0.4, 49], [34.4, 0, 0.4, 49],
  ]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, 2.4, d), fenceMat);
    f.position.set(x, 1.2, z);
    scene.add(f);
  }

  // Obstacles from the map data.
  const mats = {
    container: [
      new THREE.MeshStandardMaterial({ map: TEXTURES.containerA, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ map: TEXTURES.containerB, roughness: 0.8 }),
      new THREE.MeshStandardMaterial({ map: TEXTURES.containerC, roughness: 0.8 }),
    ],
    crate: new THREE.MeshStandardMaterial({ map: TEXTURES.crate, roughness: 0.9 }),
    wall: new THREE.MeshStandardMaterial({ map: TEXTURES.wall, roughness: 0.95 }),
    warehouse: new THREE.MeshStandardMaterial({ map: TEXTURES.warehouse, roughness: 0.9 }),
  };
  let ci = 0;
  for (const b of BOXES) {
    const mat = b.kind === 'container' ? mats.container[(ci++) % 3] : mats[b.kind];
    const m = new THREE.Mesh(new THREE.BoxGeometry(b.hx * 2, b.h, b.hz * 2), mat);
    m.position.set(b.x, b.h / 2, b.z);
    scene.add(m);
    if (b.kind === 'container') {
      // A rim on top so containers read as stacked freight, not flat slabs.
      const rim = new THREE.Mesh(
        new THREE.BoxGeometry(b.hx * 2 + 0.08, 0.12, b.hz * 2 + 0.08),
        new THREE.MeshStandardMaterial({ color: 0x1c1e24, roughness: 0.7 }),
      );
      rim.position.set(b.x, b.h + 0.06, b.z);
      scene.add(rim);
    }
  }

  // Distant crane silhouettes for the skyline.
  const craneMat = new THREE.MeshStandardMaterial({ color: 0x232638, roughness: 1 });
  for (const [x, z, ry] of [[-30, -34, 0.4], [26, 32, -0.7]]) {
    const crane = new THREE.Group();
    const mast = new THREE.Mesh(new THREE.BoxGeometry(1.4, 26, 1.4), craneMat);
    mast.position.y = 13;
    const jib = new THREE.Mesh(new THREE.BoxGeometry(22, 1.1, 1.1), craneMat);
    jib.position.set(8, 25, 0);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, 2.4), craneMat);
    cab.position.set(0, 23.4, 0);
    crane.add(mast, jib, cab);
    crane.position.set(x, 0, z);
    crane.rotation.y = ry;
    scene.add(crane);
  }

  // Plant-site ring on the warehouse floor.
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(CFG.site.radius - 0.35, CFG.site.radius, 48),
    new THREE.MeshBasicMaterial({ color: P.accent, transparent: true, opacity: 0.55, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(CFG.site.x, 0.03, CFG.site.z);
  scene.add(ring);

  // The charge: a small dark case with a blinking red lamp.
  const bomb = new THREE.Group();
  const caseMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.2, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.5, metalness: 0.4 }),
  );
  const lamp = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
  );
  lamp.position.set(0, 0.14, 0);
  bomb.add(caseMesh, lamp);
  bomb.visible = false;
  scene.add(bomb);

  // Tracer pool: 24 reusable lines.
  const tracers = [];
  for (let i = 0; i < 24; i++) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: P.tracer, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    }));
    line.frustumCulled = false;
    line.userData.life = 0;
    scene.add(line);
    tracers.push(line);
  }

  // Smoke pool: 8 reusable translucent spheres.
  const smokes = [];
  const smokeGeo = new THREE.SphereGeometry(1, 18, 12);
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(smokeGeo, new THREE.MeshBasicMaterial({
      color: P.smoke, transparent: true, opacity: 0, depthWrite: false,
    }));
    s.visible = false;
    scene.add(s);
    smokes.push(s);
  }

  // Muzzle flash: a small sprite + light at the viewmodel's muzzle.
  const flashLight = new THREE.PointLight(0xffc46b, 0, 9, 1.6);
  scene.add(flashLight);
  const flashMesh = new THREE.Mesh(
    new THREE.ConeGeometry(0.09, 0.4, 6),
    new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }),
  );
  flashMesh.rotation.x = -Math.PI / 2;
  scene.add(flashMesh);

  // First-person viewmodel, parented to the camera.
  const viewmodel = buildViewmodel();
  camera.add(viewmodel);
  scene.add(camera);

  // Agent meshes, keyed by agent id; the local player has no third-person mesh.
  const agentMeshes = new Map();
  let flashLife = 0;

  function meshFor(agent) {
    let m = agentMeshes.get(agent.id);
    if (!m) {
      m = agentMesh(agent.team);
      scene.add(m);
      agentMeshes.set(agent.id, m);
    }
    return m;
  }

  return {
    scene, camera,
    addTracer(from, to, color) {
      for (const line of tracers) {
        if (line.userData.life > 0) continue;
        const pos = line.geometry.attributes.position.array;
        pos[0] = from.x; pos[1] = from.y; pos[2] = from.z;
        pos[3] = to.x; pos[4] = to.y; pos[5] = to.z;
        line.geometry.attributes.position.needsUpdate = true;
        line.material.color.setHex(color);
        line.material.opacity = 0.9;
        line.userData.life = 0.09;
        return;
      }
    },
    muzzle(pos) {
      flashLife = 0.05;
      flashMesh.position.copy(pos);
      flashMesh.material.opacity = 0.95;
      flashLight.position.copy(pos);
      flashLight.intensity = 18;
    },
    sync(match, dt, time) {
      const player = match.player;
      // Camera follows the player's eyes; the viewmodel bobs and kicks.
      camera.position.set(player.pos.x, player.eyeY, player.pos.z);
      camera.rotation.set(player.pitch, player.yaw, player.roll || 0);
      const speed = Math.hypot(player.vel.x, player.vel.z);
      const bob = player.onGround && speed > 0.5 ? Math.sin(time * 11) * 0.022 * Math.min(1, speed / 4.6) : 0;
      viewmodel.position.y = -0.26 + bob;
      viewmodel.position.z = -0.52 + player.recoil * 0.09;
      viewmodel.visible = player.alive && match.phase !== 'menu';
      const fovTarget = player.scoped ? 75 / 2.4 : 75;
      if (Math.abs(camera.fov - fovTarget) > 0.1) {
        camera.fov += (fovTarget - camera.fov) * Math.min(1, dt * 14);
        camera.updateProjectionMatrix();
      }
      // Muzzle flash decays.
      if (flashLife > 0) {
        flashLife -= dt;
        flashMesh.material.opacity = Math.max(0, flashLife / 0.05) * 0.95;
        flashLight.intensity = Math.max(0, flashLife / 0.05) * 18;
      }
      // Tracers fade.
      for (const line of tracers) {
        if (line.userData.life <= 0) continue;
        line.userData.life -= dt;
        line.material.opacity = Math.max(0, line.userData.life / 0.09) * 0.9;
      }
      // Agents.
      for (const a of match.agents) {
        if (a.isPlayer) continue;
        const m = meshFor(a);
        m.visible = a.alive || a.deathT < 6;
        m.position.set(a.pos.x, a.pos.y, a.pos.z);
        if (!a.alive) {
          m.rotation.set(0, a.yaw, Math.PI / 2);
          m.position.y = 0.25;
          continue;
        }
        m.rotation.set(0, a.yaw, 0);
        const moving = Math.hypot(a.vel.x, a.vel.z) > 0.6;
        m.position.y = a.pos.y + (moving ? Math.abs(Math.sin(time * 9 + a.id * 2)) * 0.05 : 0);
        // Aim the torso's gun at the bot's current target (or forward).
        m.userData.head.visible = true;
      }
      // Smoke fields.
      let si = 0;
      for (const f of match.fields.fields) {
        if (f.kind !== 'smoke' || si >= smokes.length) continue;
        const s = smokes[si++];
        s.visible = true;
        s.position.set(f.x, 1.1, f.z);
        const pulse = 1 + Math.sin(time * 1.7 + f.x) * 0.05;
        s.scale.set(f.r * pulse, f.r * 0.55, f.r * pulse);
        s.material.opacity = 0.5;
      }
      for (; si < smokes.length; si++) smokes[si].visible = false;
      // The charge: carried on the carrier's back, planted at the site, or
      // lying where it was dropped.
      const b = match.bomb;
      if (b.state === 'none') { bomb.visible = false; }
      else {
        bomb.visible = true;
        if (b.state === 'carried' && b.carrier) {
          bomb.position.set(b.carrier.pos.x, b.carrier.pos.y + 1.15, b.carrier.pos.z);
          bomb.rotation.y = b.carrier.yaw;
        } else {
          bomb.position.set(b.pos.x, 0.12, b.pos.z);
          bomb.rotation.y = 0;
        }
        lamp.material.color.setHex(
          b.state === 'planted' && Math.floor(time * 4) % 2 === 0 ? 0xff2a2a : 0x551111,
        );
      }
      // The site ring pulses while the charge is planted.
      ring.material.opacity = b.state === 'planted'
        ? 0.35 + 0.3 * Math.sin(time * 6) : 0.55;
    },
  };
}

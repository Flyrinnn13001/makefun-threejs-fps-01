// CROSSYARD map: data, not geometry. Every obstacle is an axis-aligned box
// {x, z, hx, hz, h, kind}; the renderer draws them, the sim collides and
// traces against them, and the bots walk a waypoint graph built on top.
// Axis: x east (+34) / west (-34), z south (+24) / north (-24), y up.
import { CFG } from './config.js';

const W = CFG.world;

// --- Obstacles ------------------------------------------------------------
// kind: 'wall' (tall, blocks sight), 'container' (tall, blocks sight),
// 'crate' (low cover: blocks movement, not sight), 'warehouse' (tall).
export const BOXES = [
  // Warehouse shell around the site (24, 0); open on its west side.
  { x: 25, z: -8.5, hx: 7.5, hz: 0.6, h: 6, kind: 'warehouse' },
  { x: 25, z: 8.5, hx: 7.5, hz: 0.6, h: 6, kind: 'warehouse' },
  { x: 32.5, z: 0, hx: 0.6, hz: 9.1, h: 6, kind: 'warehouse' },
  // Top lane (north) containers.
  { x: -18, z: -16, hx: 3, hz: 1.3, h: 2.6, kind: 'container' },
  { x: -4, z: -17, hx: 3, hz: 1.3, h: 2.6, kind: 'container' },
  { x: 8, z: -15, hx: 3, hz: 1.3, h: 2.6, kind: 'container' },
  // Mid lane containers.
  { x: -14, z: 3, hx: 3, hz: 1.3, h: 2.6, kind: 'container' },
  { x: 0, z: -3, hx: 3, hz: 1.3, h: 2.6, kind: 'container' },
  { x: 12, z: 4, hx: 3, hz: 1.3, h: 2.6, kind: 'container' },
  // Low lane (south) containers.
  { x: -18, z: 16, hx: 3, hz: 1.3, h: 2.6, kind: 'container' },
  { x: -2, z: 17, hx: 3, hz: 1.3, h: 2.6, kind: 'container' },
  { x: 10, z: 15, hx: 3, hz: 1.3, h: 2.6, kind: 'container' },
  // Freestanding crates: low cover dotted along the lanes.
  { x: -24, z: -6, hx: 1.1, hz: 1.1, h: 1.2, kind: 'crate' },
  { x: -24, z: 8, hx: 1.1, hz: 1.1, h: 1.2, kind: 'crate' },
  { x: -10, z: -8, hx: 1.4, hz: 1.4, h: 1.4, kind: 'crate' },
  { x: -8, z: 12, hx: 1.1, hz: 1.1, h: 1.2, kind: 'crate' },
  { x: 4, z: -10, hx: 1.4, hz: 1.4, h: 1.4, kind: 'crate' },
  { x: 4, z: 8, hx: 1.1, hz: 1.1, h: 1.2, kind: 'crate' },
  { x: 16, z: -12, hx: 1.4, hz: 1.4, h: 1.4, kind: 'crate' },
  { x: 18, z: 12, hx: 1.1, hz: 1.1, h: 1.2, kind: 'crate' },
  { x: -28, z: -18, hx: 1.1, hz: 1.1, h: 1.2, kind: 'crate' },
  { x: 28, z: 18, hx: 1.4, hz: 1.4, h: 1.4, kind: 'crate' },
  // A pair of tall yard walls that split the mid, forcing lane choice.
  { x: -8, z: -21, hx: 4, hz: 0.6, h: 3.4, kind: 'wall' },
  { x: 14, z: 21, hx: 4, hz: 0.6, h: 3.4, kind: 'wall' },
];

// --- Waypoints ------------------------------------------------------------
// 47 nodes strung along the three lanes, the spawns and the site. Edges are
// built at load: two nodes link when they are close and the straight line
// between them is clear of tall cover, so the graph always matches the map.
export const WAYPOINTS = [
  [-30, 0], [-30, 8], [-29, -6], [-26, 14], [-26, -14], // 0-4 attack spawn
  [-22, 0], [-22, -10], [-22, 10], [-16, -16], [-16, 4], // 5-9 west
  [-16, 16], [-10, 0], [-10, -12], [-10, 12], [-4, -16], // 10-14
  [-4, 8], [-2, -2], [2, 14], [4, -14], [6, 0], // 15-19 centre
  [6, -8], [8, 10], [12, -16], [12, 4], [14, 16], // 20-24 east-mid
  [16, -4], [16, 0], [18, -6], [18, 8], [20, -12], // 25-29
  [20, 12], [22, 0], [24, -4], [24, 6], [26, 0], // 30-34 site approach
  [28, -6], [28, 6], [30, 0], [28, -3], [29, 4], // 35-39 defend spawn
  [26, -12], [27, 13], [24, 0], // 40-42 posts/site
  [-24, 20], [-6, 20], [8, 20], [-24, -20], // 43-46 south/north edges
];
// Exactly 47 nodes: lanes, spawns, posts and the site.
export const WAYPOINT_COUNT = 47;

const nodes = WAYPOINTS.slice(0, WAYPOINT_COUNT).map(([x, z]) => ({ x, z }));

// Adjacency built once, deterministically, from distance + line of sight.
const MAX_LINK = 13;
export const EDGES = nodes.map(() => []);
for (let i = 0; i < nodes.length; i++) {
  for (let j = i + 1; j < nodes.length; j++) {
    const dx = nodes[j].x - nodes[i].x, dz = nodes[j].z - nodes[i].z;
    if (dx * dx + dz * dz > MAX_LINK * MAX_LINK) continue;
    if (!losClear(nodes[i].x, nodes[i].z, nodes[j].x, nodes[j].z, 1.6)) continue;
    EDGES[i].push(j); EDGES[j].push(i);
  }
}

export function waypointPos(i) { return nodes[i]; }
export function waypointCount() { return nodes.length; }

export function nearestWaypoint(x, z) {
  let best = 0, bestD = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const dx = nodes[i].x - x, dz = nodes[i].z - z, d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

// Breadth-first search; returns waypoint indices from `from` to `to`.
export function findPath(from, to) {
  if (from === to) return [from];
  const prev = new Int16Array(nodes.length).fill(-1);
  const queue = [from]; prev[from] = from;
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    for (const n of EDGES[cur]) {
      if (prev[n] !== -1) continue;
      prev[n] = cur;
      if (n === to) {
        const path = [to]; let c = to;
        while (c !== from) { c = prev[c]; path.push(c); }
        return path.reverse();
      }
      queue.push(n);
    }
  }
  return [from];
}

// --- Geometry queries -----------------------------------------------------

function segmentHitsBox(x0, z0, x1, z1, b) {
  // Slab test in 2D: does segment (x0,z0)-(x1,z1) cross the box's footprint?
  const dx = x1 - x0, dz = z1 - z0;
  let tmin = 0, tmax = 1;
  const minX = b.x - b.hx, maxX = b.x + b.hx;
  const minZ = b.z - b.hz, maxZ = b.z + b.hz;
  if (Math.abs(dx) < 1e-9) { if (x0 < minX || x0 > maxX) return false; }
  else {
    let t1 = (minX - x0) / dx, t2 = (maxX - x0) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  if (Math.abs(dz) < 1e-9) { if (z0 < minZ || z0 > maxZ) return false; }
  else {
    let t1 = (minZ - z0) / dz, t2 = (maxZ - z0) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tmin = Math.max(tmin, t1); tmax = Math.min(tmax, t2);
    if (tmin > tmax) return false;
  }
  return true;
}

// Is the sight line clear? A box blocks it only when it is taller than the
// eye height. Smoke fields (circles) block it too when given.
export function losClear(x0, z0, x1, z1, eyeH = 1.6, smoke = null) {
  for (const b of BOXES) {
    if (b.h <= eyeH) continue;
    if (segmentHitsBox(x0, z0, x1, z1, b)) return false;
  }
  if (smoke) {
    for (const s of smoke) {
      if (segmentHitsCircle(x0, z0, x1, z1, s.x, s.z, s.r)) return false;
    }
  }
  return true;
}

function segmentHitsCircle(x0, z0, x1, z1, cx, cz, r) {
  const dx = x1 - x0, dz = z1 - z0;
  const len2 = dx * dx + dz * dz;
  let t = len2 === 0 ? 0 : ((cx - x0) * dx + (cz - z0) * dz) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = x0 + dx * t - cx, pz = z0 + dz * t - cz;
  return px * px + pz * pz < r * r;
}

// Push a circle (agent) out of every box it overlaps; also clamp to the yard.
// Mutates and returns the position object {x, z}.
export function collideCircle(p, radius) {
  for (const b of BOXES) {
    const cx = Math.max(b.x - b.hx, Math.min(p.x, b.x + b.hx));
    const cz = Math.max(b.z - b.hz, Math.min(p.z, b.z + b.hz));
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= radius * radius) continue;
    if (d2 > 1e-9) {
      const d = Math.sqrt(d2);
      p.x = cx + (dx / d) * radius; p.z = cz + (dz / d) * radius;
    } else {
      // Centre inside the box: shove out along the smallest penetration axis.
      const px = b.hx + radius - Math.abs(p.x - b.x);
      const pz = b.hz + radius - Math.abs(p.z - b.z);
      if (px < pz) p.x = b.x + (p.x >= b.x ? b.hx + radius : -(b.hx + radius));
      else p.z = b.z + (p.z >= b.z ? b.hz + radius : -(b.hz + radius));
    }
  }
  p.x = Math.max(-W.halfX + radius, Math.min(W.halfX - radius, p.x));
  p.z = Math.max(-W.halfZ + radius, Math.min(W.halfZ - radius, p.z));
  return p;
}

export function insideSite(x, z) {
  const dx = x - CFG.site.x, dz = z - CFG.site.z;
  return dx * dx + dz * dz < CFG.site.radius * CFG.site.radius;
}

// Distance from a point to the nearest box face (for spawn safety checks).
export function nearestBoxGap(x, z) {
  let best = Infinity;
  for (const b of BOXES) {
    const dx = Math.max(Math.abs(x - b.x) - b.hx, 0);
    const dz = Math.max(Math.abs(z - b.z) - b.hz, 0);
    best = Math.min(best, Math.hypot(dx, dz));
  }
  return best;
}

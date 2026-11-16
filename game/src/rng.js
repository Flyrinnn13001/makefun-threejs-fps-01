// Deterministic RNG (mulberry32). Every random choice in the sim draws from
// one of these, seeded per round, so a staged screenshot scene replays the
// same layout every time it is opened with the same seed.

// Returns a function that yields a float in [0, 1) on each call.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Float in [min, max).
export function range(rng, min, max) { return min + rng() * (max - min); }

// Integer in [min, max] inclusive.
export function intRange(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

// One element of an array, uniformly.
export function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }

// In-place Fisher-Yates shuffle, driven by the same stream.
export function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
  return arr;
}

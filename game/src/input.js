// Input: keyboard + mouse with pointer lock. The game reads a plain struct
// each fixed step; single-press actions (reload, buy, grenade) are consumed
// through `pressed()` so holding a key does not repeat them.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.down = new Set();      // keys pressed since the last consume
    this.mouseDX = 0; this.mouseDY = 0;
    this.mouseDown = false; this.mouseRight = false;
    this.locked = false;
    this.onLockChange = null;
    this.onFirstGesture = null;
    this._gestured = false;

    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.down.add(e.code);
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
      this.gesture();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouseDown = false; });
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    canvas.addEventListener('mousedown', (e) => {
      this.gesture();
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.mouseRight = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.mouseRight = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  gesture() {
    if (this._gestured) return;
    this._gestured = true;
    if (this.onFirstGesture) this.onFirstGesture();
  }

  lock() {
    if (this.locked) return;
    const p = this.canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => { /* headless / denied: play unlocked */ });
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  held(code) { return this.keys.has(code); }

  // True once per physical press; clears the flag.
  pressed(code) {
    if (!this.down.has(code)) return false;
    this.down.delete(code);
    return true;
  }

  // Mouse deltas since the last read; reading clears them.
  takeMouse() {
    const dx = this.mouseDX, dy = this.mouseDY;
    this.mouseDX = 0; this.mouseDY = 0;
    return { dx, dy };
  }

  // Movement wish in camera space: fx = strafe right, fz = forward.
  moveAxes() {
    let fx = 0, fz = 0;
    if (this.held('KeyW') || this.held('ArrowUp')) fz += 1;
    if (this.held('KeyS') || this.held('ArrowDown')) fz -= 1;
    if (this.held('KeyD') || this.held('ArrowRight')) fx += 1;
    if (this.held('KeyA') || this.held('ArrowLeft')) fx -= 1;
    const len = Math.hypot(fx, fz);
    if (len > 1) { fx /= len; fz /= len; }
    return { fx, fz };
  }
}

// Sound, synthesised in WebAudio — no audio files, no network. The context
// is created lazily on the first user gesture (browsers block audio before
// one), and every effect is a short envelope over noise or an oscillator.
let ctx = null;
let master = null;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.42;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function unlockAudio() { ac(); }

function noiseBuffer(dur) {
  const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function burst({ dur = 0.12, freq = 1200, q = 1, gain = 0.5, type = 'bandpass', slide = 0 }) {
  if (!ac()) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(dur + 0.05);
  const filt = ctx.createBiquadFilter();
  filt.type = type; filt.frequency.value = freq; filt.Q.value = q;
  if (slide) filt.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filt); filt.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.05);
}

function tone({ freq = 440, dur = 0.15, gain = 0.3, type = 'sine', slide = 0, delay = 0 }) {
  if (!ac()) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

export const sfx = {
  shot(weapon) {
    if (weapon === 'longbow') {
      burst({ dur: 0.28, freq: 900, q: 0.8, gain: 0.85, slide: -700 });
      tone({ freq: 120, dur: 0.2, gain: 0.5, slide: -70 });
    } else if (weapon === 'p9') {
      burst({ dur: 0.09, freq: 1600, q: 1, gain: 0.45, slide: -900 });
    } else if (weapon === 'ripper') {
      burst({ dur: 0.07, freq: 2100, q: 1.2, gain: 0.4, slide: -1100 });
    } else {
      burst({ dur: 0.14, freq: 1300, q: 1, gain: 0.6, slide: -800 });
    }
  },
  dryFire() { tone({ freq: 1400, dur: 0.03, gain: 0.12, type: 'square' }); },
  reload() {
    tone({ freq: 900, dur: 0.04, gain: 0.15, type: 'square' });
    tone({ freq: 700, dur: 0.04, gain: 0.15, type: 'square', delay: 0.28 });
    tone({ freq: 1100, dur: 0.04, gain: 0.18, type: 'square', delay: 0.55 });
  },
  hit() { tone({ freq: 2200, dur: 0.05, gain: 0.2, type: 'square' }); },
  kill() {
    tone({ freq: 880, dur: 0.07, gain: 0.25 });
    tone({ freq: 1320, dur: 0.1, gain: 0.22, delay: 0.07 });
  },
  hurt() { burst({ dur: 0.1, freq: 300, q: 1, gain: 0.35, type: 'lowpass' }); },
  plantBeep() { tone({ freq: 1200, dur: 0.08, gain: 0.25, type: 'square' }); },
  defuseBeep() { tone({ freq: 900, dur: 0.08, gain: 0.25, type: 'square' }); },
  explosion() {
    burst({ dur: 1.1, freq: 220, q: 0.6, gain: 0.95, type: 'lowpass', slide: -120 });
    tone({ freq: 55, dur: 0.9, gain: 0.7, slide: -30 });
  },
  buy() {
    tone({ freq: 660, dur: 0.06, gain: 0.2 });
    tone({ freq: 990, dur: 0.09, gain: 0.2, delay: 0.06 });
  },
  click() { tone({ freq: 1500, dur: 0.03, gain: 0.12, type: 'square' }); },
  roundWin() {
    [523, 659, 784].forEach((f, i) => tone({ freq: f, dur: 0.22, gain: 0.22, delay: i * 0.11 }));
  },
  roundLose() {
    [392, 330, 262].forEach((f, i) => tone({ freq: f, dur: 0.24, gain: 0.2, delay: i * 0.12 }));
  },
  flash() { burst({ dur: 0.4, freq: 3000, q: 0.5, gain: 0.25 }); },
  grenadeThrow() { burst({ dur: 0.08, freq: 800, q: 1, gain: 0.2 }); },
};

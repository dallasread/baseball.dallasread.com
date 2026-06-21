// Sound effects, synthesized with the Web Audio API so there are no audio files
// to host. The decision of WHICH sound an event makes is a pure function
// (pickSound) so it can be unit tested; the actual playback is a side effect in
// createSoundPlayer, which only touches AudioContext lazily inside its methods.

// Choose the sound id for a completed at-bat.
// Priority: game-ending play > home run > any run scored > out > walk > plain hit.
export function pickSound({ outcome, runsScored = 0, isFinal = false }) {
  if (isFinal) return 'win';
  if (outcome.id === 'HOME_RUN') return 'homerun';
  if (runsScored > 0) return 'score';
  if (outcome.type === 'out') return 'out';
  if (outcome.type === 'walk') return 'walk';
  return 'hit';
}

export function createSoundPlayer() {
  let ctx = null;
  let muted = false;

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  // A pitched note with an attack/decay envelope and optional pitch glide.
  function tone(c, { freq, start = 0, dur = 0.2, type = 'sine', gain = 0.18, glideTo }) {
    const t0 = c.currentTime + start;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  // A burst of filtered noise — used for bat cracks, dice clicks and crowd swell.
  function noise(c, { start = 0, dur = 0.15, gain = 0.2, filter = 'highpass', freq = 1200, q = 0.7 }) {
    const t0 = c.currentTime + start;
    const frames = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, frames, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = filter;
    bp.frequency.value = freq;
    bp.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(g).connect(c.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // A swell of crowd noise (bandpassed white noise that rises and falls).
  function crowd(c, { start = 0, dur = 0.8, gain = 0.16 }) {
    const t0 = c.currentTime + start;
    const frames = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, frames, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource();
    src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + dur * 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(g).connect(c.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  const crack = (c) => {
    noise(c, { dur: 0.08, gain: 0.32, filter: 'highpass', freq: 1800, q: 0.6 });
    tone(c, { freq: 320, dur: 0.09, type: 'triangle', gain: 0.22, glideTo: 180 });
  };

  const sounds = {
    roll(c) {
      for (let i = 0; i < 5; i++) {
        noise(c, { start: i * 0.06, dur: 0.035, gain: 0.16, filter: 'highpass', freq: 2600, q: 0.5 });
      }
    },
    hit(c) { crack(c); },
    out(c) {
      tone(c, { freq: 300, dur: 0.18, type: 'sawtooth', gain: 0.14, glideTo: 150 });
      tone(c, { freq: 150, start: 0.16, dur: 0.26, type: 'sawtooth', gain: 0.14, glideTo: 90 });
    },
    walk(c) {
      tone(c, { freq: 520, dur: 0.1, type: 'square', gain: 0.1 });
      tone(c, { freq: 660, start: 0.12, dur: 0.12, type: 'square', gain: 0.1 });
    },
    score(c) {
      [523, 659, 784].forEach((f, i) => tone(c, { freq: f, start: i * 0.07, dur: 0.18, type: 'triangle', gain: 0.16 }));
      crowd(c, { start: 0.1, dur: 0.7, gain: 0.14 });
    },
    homerun(c) {
      crack(c);
      [392, 523, 659, 784].forEach((f, i) => tone(c, { freq: f, start: 0.08 + i * 0.08, dur: 0.22, type: 'triangle', gain: 0.18 }));
      crowd(c, { start: 0.2, dur: 1.1, gain: 0.18 });
    },
    win(c) {
      [523, 659, 784, 1047].forEach((f, i) => tone(c, { freq: f, start: i * 0.12, dur: 0.32, type: 'triangle', gain: 0.2 }));
      tone(c, { freq: 1047, start: 0.5, dur: 0.5, type: 'triangle', gain: 0.2 });
      crowd(c, { start: 0, dur: 1.4, gain: 0.2 });
    },
  };

  return {
    play(id) {
      if (muted) return;
      const c = ensure();
      if (!c || !sounds[id]) return;
      try { sounds[id](c); } catch { /* audio not available — ignore */ }
    },
    unlock() { ensure(); },
    toggle() { muted = !muted; return muted; },
    get muted() { return muted; },
  };
}

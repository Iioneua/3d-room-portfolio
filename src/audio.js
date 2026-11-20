// Ambient soundscape generated in the browser (no audio files to download):
// slow sea waves, a soft breeze and the occasional bird.

const VOLUME = 0.55;

function noiseBuffer(ctx, seconds, brown) {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const fade = Math.floor(sr * 0.5);
  const buf = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const raw = new Float32Array(len + fade);
    let last = 0;
    for (let i = 0; i < raw.length; i++) {
      const white = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * white) / 1.02;
        raw[i] = last * 3.5;
      } else {
        raw[i] = white;
      }
    }
    // Crossfade the tail into the head so the loop has no click.
    const out = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      if (i < fade) {
        const k = i / fade;
        out[i] = raw[i] * k + raw[len + i] * (1 - k);
      } else {
        out[i] = raw[i];
      }
    }
  }
  return buf;
}

export function createAmbience() {
  let ctx = null;
  let master = null;
  let muted = false;
  let birdTimer = null;

  function lfo(freq, depth, param) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    gain.gain.value = depth;
    osc.connect(gain).connect(param);
    osc.start();
  }

  function loop(buffer) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    src.start();
    return src;
  }

  function chirp(time, pan) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const panner = ctx.createStereoPanner();
    const f0 = 2600 + Math.random() * 1800;
    osc.type = 'sine';
    osc.frequency.setValueAtTime(f0, time);
    osc.frequency.exponentialRampToValueAtTime(f0 * (1.2 + Math.random() * 0.35), time + 0.06);
    osc.frequency.exponentialRampToValueAtTime(f0 * 0.9, time + 0.14);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(0.035, time + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);
    panner.pan.value = pan;
    osc.connect(gain).connect(panner).connect(master);
    osc.start(time);
    osc.stop(time + 0.2);
  }

  function scheduleBirds() {
    const count = 2 + Math.floor(Math.random() * 4);
    const pan = Math.random() * 1.6 - 0.8;
    let t = ctx.currentTime + 0.05;
    for (let i = 0; i < count; i++) {
      chirp(t, pan);
      t += 0.12 + Math.random() * 0.16;
    }
    birdTimer = setTimeout(scheduleBirds, 3500 + Math.random() * 6500);
  }

  function start() {
    if (ctx) {
      ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    ctx = new AudioCtx();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    master.gain.linearRampToValueAtTime(muted ? 0 : VOLUME, ctx.currentTime + 3);

    const brown = noiseBuffer(ctx, 8, true);
    const white = noiseBuffer(ctx, 5, false);

    // Body of the waves: low rumble that swells and falls.
    const swellFilter = ctx.createBiquadFilter();
    swellFilter.type = 'lowpass';
    swellFilter.frequency.value = 520;
    const swellGain = ctx.createGain();
    swellGain.gain.value = 0.42;
    loop(brown).connect(swellFilter).connect(swellGain).connect(master);
    lfo(0.09, 0.26, swellGain.gain);
    lfo(0.09, 260, swellFilter.frequency);

    // Foam: a faint hiss as each wave breaks.
    const foamHigh = ctx.createBiquadFilter();
    foamHigh.type = 'highpass';
    foamHigh.frequency.value = 1400;
    const foamLow = ctx.createBiquadFilter();
    foamLow.type = 'lowpass';
    foamLow.frequency.value = 5200;
    const foamGain = ctx.createGain();
    foamGain.gain.value = 0.022;
    loop(white).connect(foamHigh).connect(foamLow).connect(foamGain).connect(master);
    lfo(0.13, 0.018, foamGain.gain);

    // Breeze.
    const wind = ctx.createBiquadFilter();
    wind.type = 'bandpass';
    wind.frequency.value = 260;
    wind.Q.value = 0.6;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.1;
    loop(brown).connect(wind).connect(windGain).connect(master);
    lfo(0.05, 0.05, windGain.gain);

    birdTimer = setTimeout(scheduleBirds, 2500);
  }

  function setMuted(value) {
    muted = value;
    if (!ctx) return;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setTargetAtTime(muted ? 0 : VOLUME, ctx.currentTime, 0.25);
  }

  return {
    start,
    setMuted,
    get muted() {
      return muted;
    },
    stop() {
      clearTimeout(birdTimer);
      if (ctx) ctx.close();
      ctx = null;
    },
  };
}

// A soft two-note bell for the end of a pomodoro phase: rising when a break starts,
// falling when it is time to focus again. It has its own output, so turning the
// ambient sound off does not silence it (the timer's settings can).
export function createChime() {
  let ctx = null;

  // Browsers only allow sound after a click, so this is called from one (Start).
  function prime() {
    if (ctx) {
      ctx.resume();
      return;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) ctx = new AudioCtx();
  }

  function bell(freq, time, volume) {
    const out = ctx.createGain();
    out.gain.setValueAtTime(0.0001, time);
    out.gain.exponentialRampToValueAtTime(volume, time + 0.012);
    out.gain.exponentialRampToValueAtTime(0.0001, time + 2.2);
    out.connect(ctx.destination);
    // A bell is a few partials that fade at different speeds.
    for (const [ratio, level] of [[1, 1], [2.76, 0.22], [5.4, 0.08]]) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * ratio;
      gain.gain.setValueAtTime(level, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 2.2 / ratio);
      osc.connect(gain).connect(out);
      osc.start(time);
      osc.stop(time + 2.3);
    }
  }

  return {
    prime,
    play(toBreak) {
      if (!ctx) return;
      ctx.resume();
      const t = ctx.currentTime + 0.05;
      const [a, b] = toBreak ? [659.25, 987.77] : [987.77, 659.25];
      bell(a, t, 0.22);
      bell(b, t + 0.32, 0.2);
    },
  };
}

/**
 * Game SFX — layered Web Audio synthesis with master bus processing.
 */

let ctx = null;
let master = null;
let unlocked = false;

function getCtx() {
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();

    master = ctx.createGain();
    master.gain.value = 0.82;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 12;
    comp.ratio.value = 3;
    comp.attack.value = 0.003;
    comp.release.value = 0.14;

    master.connect(comp);
    comp.connect(ctx.destination);
  }
  return ctx;
}

function out() {
  return master ?? getCtx()?.destination;
}

export function unlockAudio() {
  const audio = getCtx();
  if (!audio) return;
  if (audio.state === 'suspended') audio.resume();
  unlocked = true;
}

function env(gain, t, attack, peak, decay, sustain = 0.0001) {
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t + attack);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain), t + attack + decay);
}

function tone(freq, t, dur, { type = 'sine', peak = 0.1, attack = 0.008, slideTo = null } = {}) {
  const audio = getCtx();
  if (!audio || !unlocked) return;

  const osc = audio.createOscillator();
  const g = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo != null) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur * 0.85);
  }
  env(g, t, attack, peak, dur);
  osc.connect(g);
  g.connect(out());
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

function noise(t, dur, { peak = 0.06, freq = 1800, q = 0.7, type = 'bandpass' } = {}) {
  const audio = getCtx();
  if (!audio || !unlocked) return;

  const len = Math.max(1, Math.floor(audio.sampleRate * dur));
  const buf = audio.createBuffer(1, len, audio.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 1.4;

  const src = audio.createBufferSource();
  const filt = audio.createBiquadFilter();
  const g = audio.createGain();
  src.buffer = buf;
  filt.type = type;
  filt.frequency.value = freq;
  filt.Q.value = q;
  env(g, t, 0.002, peak, dur);
  src.connect(filt);
  filt.connect(g);
  g.connect(out());
  src.start(t);
  src.stop(t + dur + 0.04);
}

function chord(notes, t, spacing, dur, peak) {
  notes.forEach((f, i) => {
    tone(f, t + i * spacing, dur, { peak: peak * (1 - i * 0.12), type: 'sine' });
    tone(f * 2, t + i * spacing, dur * 0.7, { peak: peak * 0.25, type: 'triangle' });
  });
}

function pluck(freq, t, peak = 0.09) {
  tone(freq, t, 0.14, { peak, type: 'triangle', attack: 0.003, slideTo: freq * 0.7 });
  noise(t, 0.025, { peak: peak * 0.35, freq: 3200, type: 'highpass' });
}

const SOUNDS = {
  button() {
    const t = getCtx()?.currentTime ?? 0;
    noise(t, 0.028, { peak: 0.045, freq: 2800, type: 'highpass' });
    tone(1200, t, 0.035, { peak: 0.04, type: 'sine', attack: 0.002 });
  },

  cardSelect() {
    const t = getCtx()?.currentTime ?? 0;
    pluck(880 + Math.random() * 80, t, 0.07);
  },

  cardSelf() {
    const t = getCtx()?.currentTime ?? 0;
    noise(t, 0.055, { peak: 0.07, freq: 1100, type: 'bandpass' });
    pluck(520, t + 0.01, 0.1);
    pluck(680, t + 0.055, 0.08);
    tone(400, t, 0.08, { peak: 0.04, type: 'sine', slideTo: 280 });
  },

  cardOpponent() {
    const t = getCtx()?.currentTime ?? 0;
    noise(t, 0.05, { peak: 0.055, freq: 650, type: 'lowpass' });
    pluck(310, t + 0.02, 0.09);
    tone(220, t + 0.06, 0.12, { peak: 0.06, type: 'triangle', slideTo: 160 });
  },

  chat() {
    const t = getCtx()?.currentTime ?? 0;
    pluck(988, t, 0.07);
    pluck(1318, t + 0.09, 0.09);
  },

  skip() {
    const t = getCtx()?.currentTime ?? 0;
    tone(440, t, 0.1, { peak: 0.07, type: 'triangle', slideTo: 280 });
    noise(t + 0.02, 0.06, { peak: 0.03, freq: 900, type: 'lowpass' });
  },

  pass() {
    const t = getCtx()?.currentTime ?? 0;
    pluck(500, t, 0.06);
    pluck(400, t + 0.07, 0.07);
  },

  bluff() {
    const t = getCtx()?.currentTime ?? 0;
    noise(t, 0.14, { peak: 0.1, freq: 200, type: 'lowpass' });
    tone(160, t, 0.2, { peak: 0.11, type: 'sawtooth', slideTo: 90 });
    tone(220, t + 0.08, 0.16, { peak: 0.06, type: 'square', slideTo: 120 });
  },

  revealTruth() {
    const t = getCtx()?.currentTime ?? 0;
    chord([523, 659, 784], t, 0.07, 0.2, 0.09);
  },

  revealLie() {
    const t = getCtx()?.currentTime ?? 0;
    tone(280, t, 0.18, { peak: 0.1, type: 'sawtooth', slideTo: 120 });
    noise(t + 0.04, 0.16, { peak: 0.08, freq: 300, type: 'lowpass' });
    tone(100, t + 0.1, 0.22, { peak: 0.07, type: 'triangle' });
  },

  yourTurn() {
    const t = getCtx()?.currentTime ?? 0;
    pluck(740, t, 0.08);
    pluck(988, t + 0.11, 0.1);
  },

  win() {
    const t = getCtx()?.currentTime ?? 0;
    const melody = [523, 659, 784, 1046, 1318];
    melody.forEach((f, i) => pluck(f, t + i * 0.1, 0.1 - i * 0.01));
    chord([523, 659, 784], t + 0.45, 0.02, 0.35, 0.07);
  },

  lose() {
    const t = getCtx()?.currentTime ?? 0;
    tone(350, t, 0.22, { peak: 0.08, type: 'triangle', slideTo: 220 });
    tone(262, t + 0.16, 0.28, { peak: 0.07, type: 'sine', slideTo: 180 });
  },

  deal() {
    const t = getCtx()?.currentTime ?? 0;
    for (let i = 0; i < 5; i++) {
      noise(t + i * 0.045, 0.03, { peak: 0.04, freq: 2000 - i * 200, type: 'bandpass' });
      pluck(420 + i * 35, t + i * 0.045, 0.05);
    }
  },

  join() {
    const t = getCtx()?.currentTime ?? 0;
    pluck(620, t, 0.07);
    pluck(930, t + 0.08, 0.08);
  },
};

export function playSound(name) {
  const fn = SOUNDS[name];
  if (fn) {
    unlockAudio();
    fn();
  }
}

export function bindUIButtonSounds(rootEl) {
  if (!rootEl) return () => {};

  const onPointerDown = () => unlockAudio();

  const onClick = (e) => {
    const target = e.target;
    const btn = target.closest?.('button');
    const chip = target.closest?.('.rank-chip');
    const swatch = target.closest?.('.color-swatch');
    const card = target.closest?.('.playing-card');
    const overviewCell = target.closest?.('.hand-overview__cell');

    if (card || overviewCell) return;
    if (btn?.disabled) return;
    if (chip?.disabled) return;

    const el = btn || chip || swatch;
    if (!el) return;

    if (
      btn?.classList.contains('btn-play') ||
      btn?.classList.contains('btn-bluff') ||
      btn?.classList.contains('btn-skip') ||
      btn?.classList.contains('btn-pass')
    ) {
      return;
    }

    playSound('button');
  };

  rootEl.addEventListener('pointerdown', onPointerDown, { passive: true });
  rootEl.addEventListener('click', onClick);

  return () => {
    rootEl.removeEventListener('pointerdown', onPointerDown);
    rootEl.removeEventListener('click', onClick);
  };
}

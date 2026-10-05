/**
 * Sound effects, synthesised rather than shipped.
 *
 * A stock library would mean licensed audio files, weight in the bundle and a
 * network round trip. These are built out of oscillators and filtered noise at
 * the moment they are used, rendered offline into a WAV, and handed to the
 * normal import path — so an effect becomes an ordinary audio asset with a
 * waveform, trimming, fades and a place in the export mix, for free.
 */

export type SfxCategory =
  | "transition"
  | "impact"
  | "ui"
  | "comic"
  | "music"
  | "mood";

export const SFX_CATEGORIES: { id: SfxCategory; name: string }[] = [
  { id: "transition", name: "전환·휩" },
  { id: "impact", name: "타격·임팩트" },
  { id: "ui", name: "UI·팝" },
  { id: "comic", name: "코믹" },
  { id: "music", name: "음악적" },
  { id: "mood", name: "분위기" },
];

export type Sfx = {
  id: string;
  name: string;
  category: SfxCategory;
  /** How long the rendered clip runs, in seconds. */
  duration: number;
  build: (ctx: BaseAudioContext, out: AudioNode) => void;
};

const SAMPLE_RATE = 44100;

// ------------------------------------------------------------------ building

/** White noise, made once per render and shared by every voice that wants it. */
function noise(ctx: BaseAudioContext, seconds: number) {
  const buffer = ctx.createBuffer(
    1,
    Math.ceil(SAMPLE_RATE * seconds),
    SAMPLE_RATE
  );
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  return source;
}

type Ramp = [time: number, value: number];

/** Shape a parameter through a list of [seconds, value] points. */
function shape(param: AudioParam, points: Ramp[], exponential = false) {
  if (points.length === 0) return;
  param.setValueAtTime(
    Math.max(points[0][1], exponential ? 0.0001 : 0),
    points[0][0]
  );
  for (let i = 1; i < points.length; i += 1) {
    const [at, value] = points[i];
    if (exponential)
      param.exponentialRampToValueAtTime(Math.max(value, 0.0001), at);
    else param.linearRampToValueAtTime(value, at);
  }
}

/** A plain envelope: silence, up to `peak`, back down. */
function gate(
  ctx: BaseAudioContext,
  attack: number,
  hold: number,
  release: number,
  peak = 1
) {
  const node = ctx.createGain();
  shape(node.gain, [
    [0, 0],
    [attack, peak],
    [attack + hold, peak],
    [attack + hold + release, 0],
  ]);
  return node;
}

type ToneOptions = {
  type?: OscillatorType;
  from: number;
  to?: number;
  duration: number;
  gain?: number;
  attack?: number;
  delay?: number;
  /** Sweep the pitch on a curve rather than a straight line. */
  glide?: "linear" | "exponential";
};

function tone(ctx: BaseAudioContext, out: AudioNode, options: ToneOptions) {
  const {
    type = "sine",
    from,
    to = from,
    duration,
    gain = 0.6,
    attack = 0.004,
    delay = 0,
    glide = "exponential",
  } = options;

  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, delay);
  if (to !== from) {
    if (glide === "exponential") {
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(to, 1),
        delay + duration
      );
    } else {
      osc.frequency.linearRampToValueAtTime(to, delay + duration);
    }
  }

  const env = ctx.createGain();
  shape(
    env.gain,
    [
      [delay, 0],
      [delay + attack, gain],
      [delay + duration, 0.0001],
    ],
    true
  );

  osc.connect(env).connect(out);
  osc.start(delay);
  osc.stop(delay + duration + 0.02);
}

type HissOptions = {
  duration: number;
  gain?: number;
  attack?: number;
  delay?: number;
  filter?: BiquadFilterType;
  from?: number;
  to?: number;
  q?: number;
};

function hiss(ctx: BaseAudioContext, out: AudioNode, options: HissOptions) {
  const {
    duration,
    gain = 0.5,
    attack = 0.01,
    delay = 0,
    filter = "bandpass",
    from = 1200,
    to,
    q = 1,
  } = options;

  const source = noise(ctx, duration + 0.05);
  const band = ctx.createBiquadFilter();
  band.type = filter;
  band.Q.value = q;
  band.frequency.setValueAtTime(from, delay);
  if (to !== undefined) {
    band.frequency.exponentialRampToValueAtTime(
      Math.max(to, 20),
      delay + duration
    );
  }

  const env = ctx.createGain();
  shape(
    env.gain,
    [
      [delay, 0],
      [delay + attack, gain],
      [delay + duration, 0.0001],
    ],
    true
  );

  source.connect(band).connect(env).connect(out);
  source.start(delay);
  source.stop(delay + duration + 0.02);
}

// ------------------------------------------------------------------- catalog

export const SFX: Sfx[] = [
  // --------------------------------------------------------- transition·휩
  {
    id: "whoosh",
    name: "휘익",
    category: "transition",
    duration: 0.75,
    build: (ctx, out) => {
      hiss(ctx, out, {
        duration: 0.7,
        from: 380,
        to: 5200,
        gain: 0.5,
        q: 1.1,
        attack: 0.22,
      });
      hiss(ctx, out, {
        duration: 0.7,
        from: 5200,
        to: 400,
        gain: 0.22,
        q: 0.7,
        attack: 0.4,
        delay: 0.05,
      });
    },
  },
  {
    id: "swipe",
    name: "스와이프",
    category: "transition",
    duration: 0.38,
    build: (ctx, out) => {
      hiss(ctx, out, {
        duration: 0.34,
        from: 900,
        to: 7000,
        gain: 0.42,
        q: 2.4,
        attack: 0.06,
      });
    },
  },
  {
    id: "reverse-whoosh",
    name: "역휩",
    category: "transition",
    duration: 0.8,
    build: (ctx, out) => {
      hiss(ctx, out, {
        duration: 0.76,
        from: 6000,
        to: 320,
        gain: 0.46,
        q: 1.3,
        attack: 0.55,
      });
    },
  },
  {
    id: "wind",
    name: "바람",
    category: "transition",
    duration: 1.6,
    build: (ctx, out) => {
      hiss(ctx, out, {
        duration: 1.55,
        from: 500,
        to: 900,
        gain: 0.3,
        q: 0.6,
        attack: 0.5,
      });
      hiss(ctx, out, {
        duration: 1.2,
        from: 1800,
        to: 700,
        gain: 0.14,
        q: 1.8,
        attack: 0.4,
        delay: 0.2,
      });
    },
  },

  // ----------------------------------------------------------- impact·타격
  {
    id: "boom",
    name: "붐",
    category: "impact",
    duration: 1.4,
    build: (ctx, out) => {
      tone(ctx, out, {
        from: 120,
        to: 32,
        duration: 1.3,
        gain: 0.95,
        attack: 0.002,
      });
      hiss(ctx, out, {
        duration: 0.5,
        from: 600,
        to: 90,
        gain: 0.3,
        filter: "lowpass",
        attack: 0.002,
      });
    },
  },
  {
    id: "punch",
    name: "펀치",
    category: "impact",
    duration: 0.34,
    build: (ctx, out) => {
      tone(ctx, out, {
        from: 180,
        to: 48,
        duration: 0.3,
        gain: 0.85,
        attack: 0.001,
      });
      hiss(ctx, out, {
        duration: 0.1,
        from: 2600,
        gain: 0.3,
        filter: "bandpass",
        q: 0.8,
        attack: 0.001,
      });
    },
  },
  {
    id: "impact",
    name: "임팩트",
    category: "impact",
    duration: 1.1,
    build: (ctx, out) => {
      tone(ctx, out, {
        from: 90,
        to: 40,
        duration: 1.0,
        gain: 0.8,
        attack: 0.001,
      });
      hiss(ctx, out, {
        duration: 0.9,
        from: 4000,
        to: 300,
        gain: 0.4,
        q: 0.5,
        attack: 0.002,
      });
    },
  },
  {
    id: "slam",
    name: "쾅",
    category: "impact",
    duration: 0.6,
    build: (ctx, out) => {
      hiss(ctx, out, {
        duration: 0.5,
        from: 1800,
        to: 120,
        gain: 0.6,
        filter: "lowpass",
        attack: 0.001,
      });
      tone(ctx, out, {
        type: "square",
        from: 70,
        to: 36,
        duration: 0.3,
        gain: 0.5,
        attack: 0.001,
      });
    },
  },

  // ------------------------------------------------------------- ui·팝
  {
    id: "pop",
    name: "팝",
    category: "ui",
    duration: 0.16,
    build: (ctx, out) => {
      tone(ctx, out, {
        from: 420,
        to: 1500,
        duration: 0.09,
        gain: 0.7,
        attack: 0.001,
      });
    },
  },
  {
    id: "click",
    name: "클릭",
    category: "ui",
    duration: 0.09,
    build: (ctx, out) => {
      hiss(ctx, out, {
        duration: 0.05,
        from: 3200,
        gain: 0.5,
        q: 3,
        attack: 0.001,
      });
      tone(ctx, out, {
        from: 1800,
        to: 900,
        duration: 0.04,
        gain: 0.3,
        attack: 0.001,
      });
    },
  },
  {
    id: "ding",
    name: "딩",
    category: "ui",
    duration: 1.2,
    build: (ctx, out) => {
      tone(ctx, out, { from: 1760, duration: 1.1, gain: 0.45, attack: 0.002 });
      tone(ctx, out, { from: 2640, duration: 0.7, gain: 0.18, attack: 0.002 });
    },
  },
  {
    id: "blip",
    name: "블립",
    category: "ui",
    duration: 0.14,
    build: (ctx, out) => {
      tone(ctx, out, {
        type: "square",
        from: 900,
        to: 1700,
        duration: 0.1,
        gain: 0.35,
        attack: 0.001,
      });
    },
  },
  {
    id: "notify",
    name: "알림",
    category: "ui",
    duration: 0.7,
    build: (ctx, out) => {
      tone(ctx, out, { from: 1320, duration: 0.16, gain: 0.45 });
      tone(ctx, out, { from: 1760, duration: 0.45, gain: 0.45, delay: 0.14 });
    },
  },
  {
    id: "typewriter",
    name: "타자기",
    category: "ui",
    duration: 0.5,
    build: (ctx, out) => {
      for (let i = 0; i < 4; i += 1) {
        hiss(ctx, out, {
          duration: 0.04,
          from: 2400 + i * 260,
          gain: 0.4,
          q: 4,
          attack: 0.001,
          delay: i * 0.11,
        });
      }
    },
  },

  // ---------------------------------------------------------- comic·코믹
  {
    id: "boing",
    name: "뽀잉",
    category: "comic",
    duration: 0.6,
    build: (ctx, out) => {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      // A wobbling pitch is what reads as a spring rather than a beep.
      shape(osc.frequency, [
        [0, 760],
        [0.07, 180],
        [0.17, 520],
        [0.27, 220],
        [0.38, 390],
        [0.52, 240],
      ]);
      const env = gate(ctx, 0.004, 0.3, 0.26, 0.6);
      osc.connect(env).connect(out);
      osc.start(0);
      osc.stop(0.6);
    },
  },
  {
    id: "slide-whistle",
    name: "슬라이드 휘슬",
    category: "comic",
    duration: 0.8,
    build: (ctx, out) => {
      tone(ctx, out, {
        from: 420,
        to: 2400,
        duration: 0.74,
        gain: 0.4,
        attack: 0.03,
      });
    },
  },
  {
    id: "gulp",
    name: "꿀꺽",
    category: "comic",
    duration: 0.3,
    build: (ctx, out) => {
      tone(ctx, out, {
        from: 160,
        to: 520,
        duration: 0.12,
        gain: 0.6,
        attack: 0.01,
      });
      tone(ctx, out, {
        from: 520,
        to: 140,
        duration: 0.14,
        gain: 0.5,
        delay: 0.13,
        attack: 0.01,
      });
    },
  },
  {
    id: "cartoon-run",
    name: "후다닥",
    category: "comic",
    duration: 0.9,
    build: (ctx, out) => {
      for (let i = 0; i < 10; i += 1) {
        tone(ctx, out, {
          type: "triangle",
          from: 300 + (i % 3) * 180,
          to: 180,
          duration: 0.07,
          gain: 0.3,
          delay: i * 0.08,
          attack: 0.003,
        });
      }
    },
  },
  {
    id: "squeak",
    name: "삑",
    category: "comic",
    duration: 0.25,
    build: (ctx, out) => {
      tone(ctx, out, {
        type: "sawtooth",
        from: 1900,
        to: 2600,
        duration: 0.11,
        gain: 0.25,
      });
      tone(ctx, out, {
        type: "sawtooth",
        from: 2600,
        to: 1700,
        duration: 0.11,
        gain: 0.25,
        delay: 0.12,
      });
    },
  },

  // -------------------------------------------------------- music·음악적
  {
    id: "riser",
    name: "라이저",
    category: "music",
    duration: 2.2,
    build: (ctx, out) => {
      hiss(ctx, out, {
        duration: 2.1,
        from: 300,
        to: 9000,
        gain: 0.4,
        q: 0.8,
        attack: 1.6,
      });
      tone(ctx, out, {
        type: "sawtooth",
        from: 110,
        to: 880,
        duration: 2.1,
        gain: 0.2,
        attack: 1.4,
      });
    },
  },
  {
    id: "downlifter",
    name: "다운리프터",
    category: "music",
    duration: 1.6,
    build: (ctx, out) => {
      hiss(ctx, out, {
        duration: 1.55,
        from: 7000,
        to: 200,
        gain: 0.35,
        q: 0.9,
        attack: 0.05,
      });
      tone(ctx, out, {
        type: "sawtooth",
        from: 660,
        to: 70,
        duration: 1.5,
        gain: 0.22,
        attack: 0.02,
      });
    },
  },
  {
    id: "kick",
    name: "킥",
    category: "music",
    duration: 0.4,
    build: (ctx, out) => {
      tone(ctx, out, {
        from: 150,
        to: 45,
        duration: 0.34,
        gain: 0.95,
        attack: 0.001,
      });
    },
  },
  {
    id: "snare",
    name: "스네어",
    category: "music",
    duration: 0.32,
    build: (ctx, out) => {
      hiss(ctx, out, {
        duration: 0.26,
        from: 1800,
        gain: 0.55,
        q: 0.7,
        attack: 0.001,
      });
      tone(ctx, out, {
        type: "triangle",
        from: 220,
        to: 160,
        duration: 0.14,
        gain: 0.35,
        attack: 0.001,
      });
    },
  },
  {
    id: "hihat",
    name: "하이햇",
    category: "music",
    duration: 0.14,
    build: (ctx, out) => {
      hiss(ctx, out, {
        duration: 0.1,
        from: 9000,
        gain: 0.35,
        filter: "highpass",
        attack: 0.001,
      });
    },
  },
  {
    id: "cymbal",
    name: "심벌",
    category: "music",
    duration: 1.8,
    build: (ctx, out) => {
      hiss(ctx, out, {
        duration: 1.7,
        from: 6000,
        gain: 0.4,
        filter: "highpass",
        attack: 0.004,
      });
    },
  },
  {
    id: "chime",
    name: "차임",
    category: "music",
    duration: 1.8,
    build: (ctx, out) => {
      [1046, 1318, 1568].forEach((hz, i) =>
        tone(ctx, out, {
          from: hz,
          duration: 1.4,
          gain: 0.3,
          delay: i * 0.12,
          attack: 0.004,
        })
      );
    },
  },

  // ---------------------------------------------------------- mood·분위기
  {
    id: "glitch",
    name: "글리치",
    category: "mood",
    duration: 0.55,
    build: (ctx, out) => {
      for (let i = 0; i < 7; i += 1) {
        hiss(ctx, out, {
          duration: 0.035,
          from: 600 + Math.random() * 6000,
          gain: 0.4,
          q: 5,
          attack: 0.001,
          delay: i * 0.07,
        });
      }
    },
  },
  {
    id: "static",
    name: "잡음",
    category: "mood",
    duration: 0.9,
    build: (ctx, out) => {
      hiss(ctx, out, {
        duration: 0.85,
        from: 2600,
        gain: 0.3,
        filter: "highpass",
        attack: 0.02,
      });
    },
  },
  {
    id: "heartbeat",
    name: "심장박동",
    category: "mood",
    duration: 1.5,
    build: (ctx, out) => {
      [0, 0.26, 0.8, 1.06].forEach((at, i) =>
        tone(ctx, out, {
          from: 72,
          to: 38,
          duration: 0.22,
          gain: i % 2 === 0 ? 0.9 : 0.6,
          delay: at,
          attack: 0.004,
        })
      );
    },
  },
  {
    id: "countdown",
    name: "카운트다운",
    category: "mood",
    duration: 3.2,
    build: (ctx, out) => {
      for (let i = 0; i < 3; i += 1) {
        tone(ctx, out, {
          from: 880,
          duration: 0.18,
          gain: 0.45,
          delay: i,
          attack: 0.002,
        });
      }
      tone(ctx, out, {
        from: 1760,
        duration: 0.7,
        gain: 0.5,
        delay: 3,
        attack: 0.002,
      });
    },
  },
  {
    id: "applause",
    name: "박수",
    category: "mood",
    duration: 2.4,
    build: (ctx, out) => {
      // Many short, randomly placed noise bursts read as a crowd.
      for (let i = 0; i < 90; i += 1) {
        hiss(ctx, out, {
          duration: 0.05,
          from: 1400 + Math.random() * 3000,
          gain: 0.09 + Math.random() * 0.07,
          q: 1.4,
          attack: 0.002,
          delay: Math.random() * 2.2,
        });
      }
    },
  },
  {
    id: "sparkle",
    name: "반짝임",
    category: "mood",
    duration: 1.3,
    build: (ctx, out) => {
      for (let i = 0; i < 12; i += 1) {
        tone(ctx, out, {
          from: 2000 + Math.random() * 4000,
          duration: 0.2,
          gain: 0.18,
          delay: Math.random() * 1,
          attack: 0.003,
        });
      }
    },
  },
];

export function sfxById(id: string) {
  return SFX.find(item => item.id === id) ?? null;
}

// ------------------------------------------------------------------ encoding

/** Render one effect offline. The result is a plain mono AudioBuffer. */
export async function renderSfx(sfx: Sfx): Promise<AudioBuffer> {
  const Offline =
    window.OfflineAudioContext ?? (window as any).webkitOfflineAudioContext;
  const length = Math.ceil(SAMPLE_RATE * (sfx.duration + 0.1));
  const ctx: OfflineAudioContext = new Offline(1, length, SAMPLE_RATE);

  // A limiter-ish master stage: several voices stacked can otherwise clip.
  const master = ctx.createGain();
  master.gain.value = 0.82;
  const guard = ctx.createDynamicsCompressor();
  guard.threshold.value = -6;
  guard.ratio.value = 8;
  guard.attack.value = 0.002;
  guard.release.value = 0.12;
  master.connect(guard).connect(ctx.destination);

  sfx.build(ctx, master);
  return ctx.startRendering();
}

/** 16-bit PCM WAV, so the browser can decode it back through the normal path. */
export function encodeWav(buffer: AudioBuffer): Blob {
  const channels = buffer.numberOfChannels;
  const frames = buffer.length;
  const bytes = frames * channels * 2;
  const out = new ArrayBuffer(44 + bytes);
  const view = new DataView(out);

  const text = (at: number, value: string) => {
    for (let i = 0; i < value.length; i += 1)
      view.setUint8(at + i, value.charCodeAt(i));
  };

  text(0, "RIFF");
  view.setUint32(4, 36 + bytes, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, buffer.sampleRate, true);
  view.setUint32(28, buffer.sampleRate * channels * 2, true);
  view.setUint16(32, channels * 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, bytes, true);

  const data = Array.from({ length: channels }, (_, c) =>
    buffer.getChannelData(c)
  );
  let at = 44;
  for (let i = 0; i < frames; i += 1) {
    for (let c = 0; c < channels; c += 1) {
      const sample = Math.max(-1, Math.min(1, data[c][i]));
      view.setInt16(at, sample * 0x7fff, true);
      at += 2;
    }
  }
  return new Blob([out], { type: "audio/wav" });
}

/** Rendered effects are kept around: previewing one repeatedly is common. */
const rendered = new Map<string, AudioBuffer>();

export async function sfxBuffer(sfx: Sfx) {
  const held = rendered.get(sfx.id);
  if (held) return held;
  const buffer = await renderSfx(sfx);
  rendered.set(sfx.id, buffer);
  return buffer;
}

export async function sfxFile(sfx: Sfx) {
  const buffer = await sfxBuffer(sfx);
  return new File([encodeWav(buffer)], `${sfx.name}.wav`, {
    type: "audio/wav",
  });
}

let previewCtx: AudioContext | null = null;
let previewVoice: AudioBufferSourceNode | null = null;

/** Audition an effect without touching the project. */
export async function previewSfx(sfx: Sfx) {
  const buffer = await sfxBuffer(sfx);
  if (!previewCtx) {
    const Ctx = window.AudioContext ?? (window as any).webkitAudioContext;
    previewCtx = new Ctx();
  }
  await previewCtx.resume();
  previewVoice?.stop();
  const voice = previewCtx.createBufferSource();
  voice.buffer = buffer;
  voice.connect(previewCtx.destination);
  voice.start();
  previewVoice = voice;
  voice.onended = () => {
    if (previewVoice === voice) previewVoice = null;
  };
}

export function stopPreview() {
  previewVoice?.stop();
  previewVoice = null;
}

/** A tiny waveform for the library tile, so each effect looks like itself. */
export async function sfxPeaks(sfx: Sfx, buckets = 40) {
  const buffer = await sfxBuffer(sfx);
  const data = buffer.getChannelData(0);
  const size = Math.max(1, Math.floor(data.length / buckets));
  const peaks: number[] = [];
  let ceiling = 0.0001;
  for (let i = 0; i < buckets; i += 1) {
    let peak = 0;
    for (let j = 0; j < size; j += 1) {
      const value = Math.abs(data[i * size + j] ?? 0);
      if (value > peak) peak = value;
    }
    if (peak > ceiling) ceiling = peak;
    peaks.push(peak);
  }
  return peaks.map(peak => peak / ceiling);
}
